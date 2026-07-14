import { createHash } from 'node:crypto';
import type {
    TtsRuntimeStatus,
    TtsServiceConfiguration,
    TtsSynthesisRequest,
    TtsSynthesisResult,
    TtsSynthesisStreamEvent,
    TtsErrorCode,
} from '@slopus/happy-wire';

export type LocalTtsProvider = {
    status(): Promise<{
        available: boolean;
        provider: 'cosyvoice';
        modelRevision: string | null;
    }>;
    synthesize(request: {
        text: string;
        locale: string;
        rate: number;
        voiceId: string;
    }): Promise<{
        sampleRateHz: number;
        pcm16le: Buffer;
    }>;
    synthesizeStream?(request: {
        text: string;
        locale: string;
        rate: number;
        voiceId: string;
        attempt?: number;
        signal: AbortSignal;
        onChunk: (audio: { sampleRateHz: number; pcm16le: Buffer }) => void;
    }): Promise<void>;
};

export type TtsManagerOptions = {
    maxConcurrent?: number;
    maxPending?: number;
    maxOutputBytes?: number;
    streamTimeoutMs?: number;
    onStreamDiagnostic?: (diagnostic: TtsStreamDiagnostic) => void;
};

export type TtsStreamDiagnostic = {
    phase: 'provider_attempt';
    outcome:
        | 'success'
        | 'generation_ceiling'
        | 'inaudible'
        | 'invalid_pcm'
        | 'output_too_large'
        | 'http_error'
        | 'timeout'
        | 'cancelled'
        | 'provider_error';
    attempt: number;
    bytes: number;
    elapsedMs: number;
};

type CachedAudio = {
    sampleRateHz: number;
    pcm16leBase64: string;
    bytes: number;
};

const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_MAX_PENDING = 2;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
// The Qwen adapter returns one complete fragment after generation finishes.
// A shorter attempt-level timer misclassifies healthy work and can leave its
// single local worker occupied; caller cancellation and this total bound are
// the only time limits before first audio.
const STREAM_TIMEOUT_MS = 90_000;
const MINIMUM_PRE_AUDIO_MEAN_ABSOLUTE_SAMPLE = 32;
// Qwen's first audible PCM can arrive after its first 0.5-second stream
// interval. Keep enough headroom for that normal prelude before declaring a
// genuinely silent stream invalid.
const PRE_AUDIO_GATE_SECONDS = 2;

/**
 * Owns only local synthesis selection and caching. It does not listen on an
 * HTTP port and receives requests solely from the daemon's machine-scoped RPC
 * handler, preserving Happy's existing authorization boundary.
 */
export class TtsManager {
    private readonly maxConcurrent: number;
    private readonly maxPending: number;
    private readonly maxOutputBytes: number;
    private readonly streamTimeoutMs: number;
    private readonly onStreamDiagnostic: TtsManagerOptions['onStreamDiagnostic'];
    private readonly cache = new Map<string, CachedAudio>();
    private cacheBytes = 0;
    private inFlight = 0;
    private readonly pendingSlots: Array<() => void> = [];
    private preAudioRetries = 0;
    private lastError: TtsErrorCode | null = null;

    constructor(
        private readonly provider: LocalTtsProvider,
        options: TtsManagerOptions = {},
    ) {
        this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
        this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING;
        this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
        this.streamTimeoutMs = options.streamTimeoutMs ?? STREAM_TIMEOUT_MS;
        this.onStreamDiagnostic = options.onStreamDiagnostic;
    }

    async runtimeStatus(configuration: TtsServiceConfiguration): Promise<TtsRuntimeStatus> {
        if (!configuration.enabled) {
            return {
                state: 'disabled',
                provider: configuration.provider,
                modelRevision: null,
                cache: this.cacheMetrics(),
                lastError: null,
                diagnostics: this.diagnostics(null),
            };
        }

        const providerStatus = await this.provider.status();
        return {
            state: providerStatus.available ? (this.inFlight > 0 ? 'busy' : 'ready') : 'provider_unavailable',
            provider: providerStatus.provider,
            modelRevision: providerStatus.modelRevision,
            cache: this.cacheMetrics(),
            lastError: providerStatus.available ? this.lastError : 'provider_unavailable',
            diagnostics: this.diagnostics(providerStatus.available ? this.lastError : 'provider_unavailable'),
        };
    }

    async synthesize(
        configuration: TtsServiceConfiguration,
        request: TtsSynthesisRequest,
    ): Promise<TtsSynthesisResult> {
        if (!configuration.enabled) {
            return { type: 'error', code: 'provider_unavailable' };
        }

        const providerStatus = await this.provider.status();
        if (!providerStatus.available || providerStatus.provider !== configuration.provider) {
            return { type: 'error', code: 'provider_unavailable' };
        }
        const text = normalizeText(request.text);
        if (!text) {
            return { type: 'error', code: 'request_too_large' };
        }
        const resolved = resolveVoice(configuration, text);
        const key = cacheKey({
            text,
            locale: request.locale,
            rate: request.rate,
            voiceId: resolved.voiceId,
            roleResolution: resolved.roleResolution,
            provider: providerStatus.provider,
            modelRevision: providerStatus.modelRevision,
        });
        const cached = this.readCache(key);
        if (cached) {
            return {
                type: 'success',
                sampleRateHz: cached.sampleRateHz,
                pcm16leBase64: cached.pcm16leBase64,
                roleResolution: resolved.roleResolution,
                cacheHit: true,
            };
        }

        const slot = await this.acquireSlot();
        if (slot !== 'acquired') return this.failure('queue_full');
        try {
            const audio = await this.provider.synthesize({
                text,
                locale: request.locale,
                rate: request.rate,
                voiceId: resolved.voiceId,
            });
            if (audio.pcm16le.byteLength > this.maxOutputBytes) {
                return this.failure('output_too_large');
            }

            const pcm16leBase64 = audio.pcm16le.toString('base64');
            this.writeCache(key, {
                sampleRateHz: audio.sampleRateHz,
                pcm16leBase64,
                bytes: audio.pcm16le.byteLength,
            }, configuration);
            return {
                type: 'success',
                sampleRateHz: audio.sampleRateHz,
                pcm16leBase64,
                roleResolution: resolved.roleResolution,
                cacheHit: false,
            };
        } catch {
            return this.failure('provider_error');
        } finally {
            this.releaseSlot();
        }
    }

    async synthesizeStream(
        configuration: TtsServiceConfiguration,
        request: TtsSynthesisRequest,
        emit: (event: TtsSynthesisStreamEvent) => void,
        signal: AbortSignal,
    ): Promise<{ type: 'success' } | { type: 'error'; code: TtsErrorCode }> {
        if (!configuration.enabled) return this.failure('provider_unavailable');
        const providerStatus = await this.provider.status();
        if (!providerStatus.available || providerStatus.provider !== configuration.provider) {
            return this.failure('provider_unavailable');
        }
        const text = normalizeText(request.text);
        if (!text) return this.failure('request_too_large');

        const resolved = resolveVoice(configuration, text);
        const streamController = new AbortController();
        const abortStream = () => streamController.abort();
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            abortStream();
        }, this.streamTimeoutMs);
        signal.addEventListener('abort', abortStream, { once: true });
        let callbackStarted = false;
        let callbackSampleRateHz: number | null = null;
        let audiblePcmEmitted = false;
        let sequence = 0;
        let bytes = 0;
        let bufferedPreAudio = Buffer.alloc(0);
        let bufferedSampleRateHz: number | null = null;
        let cancelProviderAttempt: (() => void) | undefined;
        const startCallback = (sampleRateHz: number) => {
            if (callbackStarted) {
                if (callbackSampleRateHz !== sampleRateHz) {
                    throw new Error('TTS stream sample rate differs from its announced format');
                }
                return;
            }
            callbackStarted = true;
            callbackSampleRateHz = sampleRateHz;
            emit({ type: 'start', sampleRateHz });
        };
        const emitPcm = (audio: { sampleRateHz: number; pcm16le: Buffer }, audible = true) => {
            startCallback(audio.sampleRateHz);
            if (audible) {
                audiblePcmEmitted = true;
            }
            for (let offset = 0; offset < audio.pcm16le.byteLength; offset += 96 * 1024) {
                emit({
                    type: 'chunk',
                    sequence: sequence++,
                    pcm16leBase64: audio.pcm16le.subarray(offset, offset + 96 * 1024).toString('base64'),
                });
            }
        };
        const flushPreAudio = () => {
            if (bufferedSampleRateHz === null || bufferedPreAudio.byteLength === 0) return;
            if (!hasAudiblePcm16le(bufferedPreAudio)) {
                // Cancel the active HTTP body before retrying. Otherwise MLX
                // keeps decoding a known-silent request and blocks its single
                // local worker ahead of the retry.
                cancelProviderAttempt?.();
                throw new Error('TTS stream produced a silent pre-audio buffer');
            }
            emitPcm({ sampleRateHz: bufferedSampleRateHz, pcm16le: bufferedPreAudio });
            bufferedPreAudio = Buffer.alloc(0);
            bufferedSampleRateHz = null;
        };
        const push = (audio: { sampleRateHz: number; pcm16le: Buffer }) => {
            if (streamController.signal.aborted) throw new DOMException('TTS stream cancelled', 'AbortError');
            bytes += audio.pcm16le.byteLength;
            if (bytes > this.maxOutputBytes) throw new Error('TTS stream exceeds output limit');
            if (audiblePcmEmitted) {
                emitPcm(audio);
                return;
            }
            if (bufferedSampleRateHz !== null && bufferedSampleRateHz !== audio.sampleRateHz) {
                throw new Error('TTS stream changed sample rate before audio started');
            }
            bufferedSampleRateHz = audio.sampleRateHz;
            bufferedPreAudio = Buffer.concat([bufferedPreAudio, audio.pcm16le]);
            if (hasAudiblePcm16le(audio.pcm16le) || bufferedPreAudio.byteLength >= bufferedSampleRateHz * 2 * PRE_AUDIO_GATE_SECONDS) {
                flushPreAudio();
            }
        };

        const slot = await this.acquireSlot(signal);
        if (slot !== 'acquired') {
            clearTimeout(timeout);
            signal.removeEventListener('abort', abortStream);
            return this.failure(slot === 'queue_full' ? 'queue_full' : 'machine_offline');
        }
        try {
            const providerRequest = { text, locale: request.locale, rate: request.rate, voiceId: resolved.voiceId };
            for (let attempt = 0; attempt <= 1; attempt++) {
                const attemptStartedAt = Date.now();
                bufferedPreAudio = Buffer.alloc(0);
                bufferedSampleRateHz = null;
                bytes = 0;
                const attemptController = new AbortController();
                const abortAttempt = () => attemptController.abort();
                const abortOuterStream = () => abortAttempt();
                cancelProviderAttempt = abortAttempt;
                if (streamController.signal.aborted) abortAttempt();
                else streamController.signal.addEventListener('abort', abortOuterStream, { once: true });
                try {
                    if (this.provider.synthesizeStream) {
                        await this.provider.synthesizeStream({
                            ...providerRequest,
                            attempt: attempt + 1,
                            signal: attemptController.signal,
                            onChunk: push,
                        });
                    } else {
                        push(await this.provider.synthesize(providerRequest));
                    }
                    flushPreAudio();
                    if (audiblePcmEmitted) {
                        this.reportStreamDiagnostic({
                            phase: 'provider_attempt',
                            outcome: 'success',
                            attempt: attempt + 1,
                            bytes,
                            elapsedMs: Date.now() - attemptStartedAt,
                        });
                        this.lastError = null;
                        emit({ type: 'end' });
                        return { type: 'success' };
                    }
                } catch (error) {
                    this.reportStreamDiagnostic({
                        phase: 'provider_attempt',
                        outcome: classifyProviderFailure(error, signal.aborted, timedOut),
                        attempt: attempt + 1,
                        bytes,
                        elapsedMs: Date.now() - attemptStartedAt,
                    });
                    if (audiblePcmEmitted) return this.failure(signal.aborted ? 'machine_offline' : timedOut ? 'timeout' : 'provider_error');
                    if (signal.aborted || timedOut) return this.failure(signal.aborted ? 'machine_offline' : 'timeout');
                } finally {
                    cancelProviderAttempt = undefined;
                    streamController.signal.removeEventListener('abort', abortOuterStream);
                }
                if (attempt === 0) {
                    this.preAudioRetries = Math.min(1_000_000, this.preAudioRetries + 1);
                    continue;
                }
                return this.failure('provider_error');
            }
            return this.failure('provider_error');
        } finally {
            clearTimeout(timeout);
            signal.removeEventListener('abort', abortStream);
            this.releaseSlot();
        }
    }

    private acquireSlot(signal?: AbortSignal): Promise<'acquired' | 'queue_full' | 'cancelled'> {
        if (signal?.aborted) return Promise.resolve('cancelled');
        if (this.inFlight < this.maxConcurrent) {
            this.inFlight++;
            return Promise.resolve('acquired');
        }
        if (this.pendingSlots.length >= this.maxPending) return Promise.resolve('queue_full');

        return new Promise((resolve) => {
            const cancel = () => {
                const index = this.pendingSlots.indexOf(grant);
                if (index >= 0) this.pendingSlots.splice(index, 1);
                signal?.removeEventListener('abort', cancel);
                resolve('cancelled');
            };
            const grant = () => {
                signal?.removeEventListener('abort', cancel);
                resolve('acquired');
            };
            this.pendingSlots.push(grant);
            signal?.addEventListener('abort', cancel, { once: true });
        });
    }

    private releaseSlot(): void {
        this.inFlight--;
        const grant = this.pendingSlots.shift();
        if (!grant) return;
        // Reserve the released slot before resolving the waiter so a new
        // request cannot overtake it between the two event-loop turns.
        this.inFlight++;
        grant();
    }

    private diagnostics(lastFailure: TtsErrorCode | null) {
        return {
            pendingRequests: this.pendingSlots.length,
            preAudioRetries: this.preAudioRetries,
            lastFailure,
        };
    }

    private failure(code: TtsErrorCode): { type: 'error'; code: TtsErrorCode } {
        this.lastError = code;
        return { type: 'error', code };
    }

    private reportStreamDiagnostic(diagnostic: TtsStreamDiagnostic): void {
        try {
            this.onStreamDiagnostic?.(diagnostic);
        } catch {
            // Diagnostics must never change synthesis behavior.
        }
    }

    private cacheMetrics() {
        return { entries: this.cache.size, bytes: this.cacheBytes };
    }

    private readCache(key: string): CachedAudio | undefined {
        const value = this.cache.get(key);
        if (!value) return undefined;
        // Map insertion order is the LRU order; move a hit to the newest end.
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    private writeCache(key: string, value: CachedAudio, configuration: TtsServiceConfiguration): void {
        if (configuration.cache.maxEntries === 0 || configuration.cache.maxBytes === 0) return;

        const existing = this.cache.get(key);
        if (existing) {
            this.cacheBytes -= existing.bytes;
            this.cache.delete(key);
        }
        this.cache.set(key, value);
        this.cacheBytes += value.bytes;

        while (
            this.cache.size > configuration.cache.maxEntries
            || this.cacheBytes > configuration.cache.maxBytes
        ) {
            const oldest = this.cache.entries().next().value as [string, CachedAudio] | undefined;
            if (!oldest) break;
            this.cache.delete(oldest[0]);
            this.cacheBytes -= oldest[1].bytes;
        }
    }
}

function classifyProviderFailure(
    error: unknown,
    cancelled: boolean,
    timedOut: boolean,
): TtsStreamDiagnostic['outcome'] {
    if (cancelled) return 'cancelled';
    if (timedOut) return 'timeout';
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('generation ceiling')) return 'generation_ceiling';
    if (message.includes('inaudible') || message.includes('silent pre-audio')) return 'inaudible';
    if (message.includes('pcm16')) return 'invalid_pcm';
    if (message.includes('output limit')) return 'output_too_large';
    if (message.includes('sidecar returned')) return 'http_error';
    return 'provider_error';
}

function hasAudiblePcm16le(pcm16le: Buffer): boolean {
    const sampleCount = Math.floor(pcm16le.byteLength / 2);
    if (sampleCount === 0) return false;
    let absoluteSum = 0;
    for (let offset = 0; offset < sampleCount * 2; offset += 2) {
        absoluteSum += Math.abs(pcm16le.readInt16LE(offset));
    }
    return absoluteSum / sampleCount >= MINIMUM_PRE_AUDIO_MEAN_ABSOLUTE_SAMPLE;
}

function normalizeText(text: string): string {
    return text.replace(/\s+/gu, ' ').trim();
}

function resolveVoice(configuration: TtsServiceConfiguration, text: string): {
    voiceId: string;
    roleResolution: 'explicit' | 'dialogue' | 'narrator';
} {
    const narrator = configuration.voiceProfiles.find(
        (profile) => profile.id === configuration.narratorProfileId,
    );
    if (!narrator) {
        throw new Error('Invalid TTS configuration: narrator profile is missing');
    }

    for (const rule of configuration.roleRules) {
        if (rule.kind === 'dialogue') continue;
        const matches = rule.kind === 'exact'
            ? text.includes(rule.pattern!)
            : safeRegexMatches(rule.pattern!, text);
        if (!matches) continue;
        const profile = configuration.voiceProfiles.find((candidate) => candidate.id === rule.voiceProfileId);
        if (profile) {
            return { voiceId: profile.providerVoiceId, roleResolution: 'explicit' };
        }
    }

    if (/^[“"].+[”"]$/u.test(text)) {
        const dialogueRule = configuration.roleRules.find((rule) => rule.kind === 'dialogue');
        const profile = dialogueRule
            ? configuration.voiceProfiles.find((candidate) => candidate.id === dialogueRule.voiceProfileId)
            : undefined;
        if (profile) {
            return { voiceId: profile.providerVoiceId, roleResolution: 'dialogue' };
        }
    }

    return { voiceId: narrator.providerVoiceId, roleResolution: 'narrator' };
}

function safeRegexMatches(pattern: string, text: string): boolean {
    try {
        return new RegExp(pattern, 'u').test(text);
    } catch {
        return false;
    }
}

function cacheKey(value: Record<string, string | number | null>): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
