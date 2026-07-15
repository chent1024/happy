import type { LocalTtsProvider } from './TtsManager';

const HEALTH_TIMEOUT_MS = 2_000;
const SYNTHESIS_TIMEOUT_MS = 90_000;
const DEFAULT_SAMPLE_RATE_HZ = 24_000;
const MINIMUM_AUDIBLE_MEAN_ABSOLUTE_SAMPLE = 32;
// Each Android utterance is a separate model request. A low temperature adds
// gentle emotional variation while keeping the selected speaker timbre stable
// across adjacent narration fragments.
const QWEN3_TEMPERATURE = 0.12;
const QWEN3_TOP_P = 1.0;
const QWEN3_TOP_K = 30;
const QWEN3_STREAMING_INTERVAL_SECONDS = 0.4;
// The MLX server default is 1.0, but the Qwen3 model itself defaults to 1.05.
// Repeated local smokes found that 1.0/1.05 can deterministically run to the
// token ceiling for ordinary Chinese sentences; 1.35 adds margin for short
// fragments and is kept identical across retries to avoid audible drift.
const QWEN3_REPETITION_PENALTY = 1.35;
// Voice cloning already anchors timbre through a fixed reference prompt. Use
// the auditioned sampling profile so the selected expressive delivery remains
// audible without changing the reference voice between sentences.
const QWEN3_CLONE_TEMPERATURE = 0.65;
const QWEN3_CLONE_TOP_P = 0.9;
const QWEN3_CLONE_TOP_K = 35;
const QWEN3_CLONE_REPETITION_PENALTY = 1.08;
// Qwen output is noticeably quieter than Android media at the same system
// volume. Raise PCM uniformly while retaining 1 dB of peak margin.
const QWEN3_OUTPUT_GAIN = 1.8;
const PCM16_MINUS_ONE_DB_PEAK = Math.floor(32_767 * Math.pow(10, -1 / 20));
const QWEN3_PCM16_BYTES_PER_ACOUSTIC_TOKEN = 1_920 * 2;
const MAXIMUM_QWEN_SHORT_TEXT_LENGTH = 4;
const MAXIMUM_QWEN_SHORT_TEXT_TOKENS = 72;
const MINIMUM_QWEN_NARRATION_TOKENS = 96;
const QWEN3_TOKENS_PER_CHARACTER = 8;
const MINIMUM_QWEN_FALLBACK_SPLIT_LENGTH = 2;
const MAXIMUM_QWEN_FALLBACK_DEPTH = 2;

type SynthesisInput = {
    text: string;
    locale: string;
    rate: number;
    voiceId: string;
    attempt?: number;
    signal?: AbortSignal;
};

class QwenGenerationCeilingError extends Error {}
class QwenInaudibleGenerationError extends Error {}

/**
 * Adapter for a user-installed CosyVoice-compatible sidecar. It accepts only
 * an explicit loopback URL and deliberately has no credential configuration:
 * the daemon is the sole caller and no provider secret is synchronized.
 */
export class CosyVoiceProvider implements LocalTtsProvider {
    private readonly baseUrl: string | null;
    private readonly mlxModelId: string | null;
    private readonly mlxInstruct: string | null;
    private readonly mlxRefAudio: string | null;
    private readonly mlxRefText: string | null;

    constructor(
        baseUrl = process.env.HAPPY_TTS_COSYVOICE_URL,
        mlxModelId = process.env.HAPPY_TTS_MLX_MODEL,
        mlxInstruct = process.env.HAPPY_TTS_MLX_INSTRUCT,
        mlxRefAudio = process.env.HAPPY_TTS_MLX_REF_AUDIO,
        mlxRefText = process.env.HAPPY_TTS_MLX_REF_TEXT,
    ) {
        this.baseUrl = baseUrl ? normalizeLoopbackUrl(baseUrl) : null;
        this.mlxModelId = normalizeOptionalValue(mlxModelId);
        this.mlxInstruct = normalizeOptionalValue(mlxInstruct);
        this.mlxRefAudio = normalizeOptionalValue(mlxRefAudio);
        this.mlxRefText = normalizeOptionalValue(mlxRefText);
        if (Boolean(this.mlxRefAudio) !== Boolean(this.mlxRefText)) {
            throw new Error('Qwen voice cloning requires both refAudio and refText');
        }
    }

    async status(): Promise<{
        available: boolean;
        provider: 'cosyvoice';
        modelRevision: string | null;
    }> {
        if (!this.baseUrl) {
            return { available: false, provider: 'cosyvoice', modelRevision: null };
        }

        try {
            if (this.mlxModelId) {
                const response = await fetch(`${this.baseUrl}/v1/models`, {
                    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
                });
                if (!response.ok) {
                    return { available: false, provider: 'cosyvoice', modelRevision: null };
                }
                const body = await response.json() as { data?: Array<{ id?: unknown }> };
                const modelLoaded = body.data?.some((model) => model.id === this.mlxModelId) ?? false;
                return {
                    available: modelLoaded,
                    provider: 'cosyvoice',
                    modelRevision: modelLoaded ? this.mlxModelId : null,
                };
            }
            const response = await fetch(`${this.baseUrl}/health`, {
                signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
            });
            if (!response.ok) {
                return { available: false, provider: 'cosyvoice', modelRevision: null };
            }
            const body = await response.json() as { status?: unknown; modelRevision?: unknown };
            if (body.status !== 'ok') {
                return { available: false, provider: 'cosyvoice', modelRevision: null };
            }
            return {
                available: true,
                provider: 'cosyvoice',
                modelRevision: typeof body.modelRevision === 'string' && body.modelRevision.length > 0
                    ? body.modelRevision
                    : null,
            };
        } catch {
            return { available: false, provider: 'cosyvoice', modelRevision: null };
        }
    }

    async synthesize(request: SynthesisInput): Promise<{ sampleRateHz: number; pcm16le: Buffer }> {
        return this.synthesizeWithFallback(request, 0);
    }

    private async synthesizeWithFallback(
        request: SynthesisInput,
        depth: number,
    ): Promise<{ sampleRateHz: number; pcm16le: Buffer }> {
        try {
            return await this.synthesizeOnce(request);
        } catch (error) {
            if (!(error instanceof QwenGenerationCeilingError)
                && !(error instanceof QwenInaudibleGenerationError)) throw error;
            if (depth >= MAXIMUM_QWEN_FALLBACK_DEPTH) throw error;
            const parts = splitQwenFallbackText(request.text);
            if (!parts) throw error;

            // MLX runs one local worker. Keep the fallback sequential and buffer
            // all descendants so Android never hears a partial replacement.
            const first = await this.synthesizeWithFallback({ ...request, text: parts[0] }, depth + 1);
            const second = await this.synthesizeWithFallback({ ...request, text: parts[1] }, depth + 1);
            if (first.sampleRateHz !== second.sampleRateHz) {
                throw new Error('Qwen3 fallback fragments returned different sample rates');
            }
            return {
                sampleRateHz: first.sampleRateHz,
                pcm16le: Buffer.concat([first.pcm16le, second.pcm16le]),
            };
        }
    }

    private async synthesizeOnce(request: SynthesisInput): Promise<{ sampleRateHz: number; pcm16le: Buffer }> {
        if (!this.baseUrl) {
            throw new Error('CosyVoice sidecar is not configured');
        }

        const response = await fetch(`${this.baseUrl}/v1/audio/speech`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(this.requestBody(request)),
            signal: synthesisSignal(request.signal),
        });
        if (!response.ok) {
            throw new Error(`CosyVoice sidecar returned ${response.status}`);
        }
        const sampleRateHz = parseSampleRate(response.headers.get('x-happy-sample-rate-hz'));
        const pcm16le = Buffer.from(await response.arrayBuffer());
        if (pcm16le.byteLength === 0 || pcm16le.byteLength % 2 !== 0) {
            throw new Error('CosyVoice response is not complete PCM16');
        }
        if (!hasAudiblePcm(pcm16le)) {
            if (this.mlxModelId && isQwen3TtsModel(this.mlxModelId)) {
                throw new QwenInaudibleGenerationError('CosyVoice sidecar returned inaudible PCM16');
            }
            throw new Error('CosyVoice sidecar returned inaudible PCM16');
        }
        if (this.mlxModelId && isQwen3TtsModel(this.mlxModelId)) {
            const ceilingBytes = maximumGenerationTokens(request.text)
                * QWEN3_PCM16_BYTES_PER_ACOUSTIC_TOKEN;
            if (pcm16le.byteLength >= ceilingBytes) {
                throw new QwenGenerationCeilingError('Qwen3 sidecar response reached its generation ceiling');
            }
        }
        return {
            sampleRateHz,
            pcm16le: this.mlxModelId && isQwen3TtsModel(this.mlxModelId)
                ? applyQwenOutputGain(pcm16le)
                : pcm16le,
        };
    }

    async synthesizeStream(request: {
        text: string;
        locale: string;
        rate: number;
        voiceId: string;
        attempt?: number;
        signal: AbortSignal;
        onChunk: (audio: { sampleRateHz: number; pcm16le: Buffer }) => void;
    }): Promise<void> {
        if (request.signal.aborted) throw new DOMException('TTS stream cancelled', 'AbortError');
        if (!this.baseUrl) throw new Error('CosyVoice sidecar is not configured');
        if (!this.mlxModelId || !isQwen3TtsModel(this.mlxModelId)) {
            request.onChunk(await this.synthesize({ ...request, signal: request.signal }));
            return;
        }

        const response = await fetch(`${this.baseUrl}/v1/audio/speech`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(this.requestBody(request, true)),
            signal: synthesisSignal(request.signal),
        });
        if (!response.ok) throw new Error(`CosyVoice sidecar returned ${response.status}`);
        if (!response.body) throw new Error('CosyVoice sidecar returned no PCM stream');

        const sampleRateHz = parseSampleRate(response.headers.get('x-happy-sample-rate-hz'));
        const reader = response.body.getReader();
        let pending = Buffer.alloc(0);
        let totalBytes = 0;
        let absoluteSampleSum = 0;
        let sampleCount = 0;
        let streamCompleted = false;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    streamCompleted = true;
                    break;
                }
                const combined = pending.byteLength > 0
                    ? Buffer.concat([pending, Buffer.from(value)])
                    : Buffer.from(value);
                const completeBytes = combined.byteLength - (combined.byteLength % 2);
                pending = completeBytes < combined.byteLength
                    ? Buffer.from(combined.subarray(completeBytes))
                    : Buffer.alloc(0);
                if (completeBytes === 0) continue;

                const pcm16le = Buffer.from(combined.subarray(0, completeBytes));
                totalBytes += pcm16le.byteLength;
                for (let offset = 0; offset < pcm16le.byteLength; offset += 2) {
                    absoluteSampleSum += Math.abs(pcm16le.readInt16LE(offset));
                    sampleCount++;
                }
                request.onChunk({
                    sampleRateHz,
                    pcm16le: applyQwenOutputGain(pcm16le),
                });
            }
        } finally {
            if (!streamCompleted) await reader.cancel().catch(() => undefined);
            reader.releaseLock();
        }
        if (pending.byteLength > 0 || totalBytes === 0) {
            throw new Error('CosyVoice response is not complete PCM16');
        }
        if (sampleCount === 0 || absoluteSampleSum / sampleCount < MINIMUM_AUDIBLE_MEAN_ABSOLUTE_SAMPLE) {
            throw new Error('CosyVoice sidecar returned inaudible PCM16');
        }
        const ceilingBytes = maximumGenerationTokens(request.text)
            * QWEN3_PCM16_BYTES_PER_ACOUSTIC_TOKEN;
        if (totalBytes >= ceilingBytes) {
            throw new QwenGenerationCeilingError('Qwen3 sidecar response reached its generation ceiling');
        }
    }

    private requestBody(request: SynthesisInput, stream = false) {
        const sampling = qwenSamplingProfile(this.mlxModelId);
        return this.mlxModelId
            ? {
                model: this.mlxModelId,
                input: request.text,
                lang_code: languageHint(request.locale),
                // Slow Qwen rates can defer the first audible PCM long enough
                // for Android's system TTS request to time out.
                speed: qwenPlaybackRate(request.rate),
                voice: request.voiceId,
                ...(isQwen3TtsModel(this.mlxModelId)
                    ? {
                        ...sampling,
                        ...(stream
                            ? {
                                stream: true,
                                streaming_interval: QWEN3_STREAMING_INTERVAL_SECONDS,
                            }
                            : {}),
                    }
                    : {}),
                ...(this.mlxRefAudio && this.mlxRefText
                    ? { ref_audio: this.mlxRefAudio, ref_text: this.mlxRefText }
                    : {}),
                ...(shouldSendMlxInstruct(this.mlxModelId, this.mlxInstruct)
                    ? { instruct: this.mlxInstruct }
                    : {}),
                response_format: 'pcm',
                max_tokens: maximumGenerationTokens(request.text),
            }
            : { input: request.text, locale: request.locale, speed: request.rate, voice: request.voiceId };
    }
}

function qwenSamplingProfile(modelId: string | null) {
    return isQwen3BaseModel(modelId)
        ? {
            temperature: QWEN3_CLONE_TEMPERATURE,
            top_p: QWEN3_CLONE_TOP_P,
            top_k: QWEN3_CLONE_TOP_K,
            repetition_penalty: QWEN3_CLONE_REPETITION_PENALTY,
        }
        : {
            temperature: QWEN3_TEMPERATURE,
            top_p: QWEN3_TOP_P,
            top_k: QWEN3_TOP_K,
            repetition_penalty: QWEN3_REPETITION_PENALTY,
        };
}

function splitQwenFallbackText(text: string): [string, string] | null {
    if (text.length < MINIMUM_QWEN_FALLBACK_SPLIT_LENGTH) return null;
    const midpoint = Math.floor(text.length / 2);
    const minimumPartLength = Math.max(3, Math.floor(text.length * 0.3));
    const punctuation = /[。！？；：，、,.!?;:\n]/u;
    let cut = midpoint;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < text.length; index++) {
        if (!punctuation.test(text[index])) continue;
        const candidate = index + 1;
        if (candidate < minimumPartLength || text.length - candidate < minimumPartLength) continue;
        const distance = Math.abs(candidate - midpoint);
        if (distance < bestDistance) {
            cut = candidate;
            bestDistance = distance;
        }
    }
    const first = text.slice(0, cut).trim();
    const second = text.slice(cut).trim();
    return first && second ? [first, second] : null;
}

function synthesisSignal(signal: AbortSignal | undefined): AbortSignal {
    const timeout = AbortSignal.timeout(SYNTHESIS_TIMEOUT_MS);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function normalizeOptionalValue(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

function languageHint(locale: string): string {
    return locale.toLowerCase().startsWith('zh') ? 'Chinese' : locale;
}

function qwenPlaybackRate(rate: number): number {
    return Math.min(1.5, Math.max(0.8, rate));
}

function maximumGenerationTokens(text: string): number {
    // Qwen3-TTS emits 12.5 acoustic tokens/sec (1,920 samples at 24 kHz).
    // Its token ceiling is a generation stop, not a natural utterance end.
    // Very short reader utterances can loop for the full 120-token floor,
    // especially with Uncle_Fu. A 72-token ceiling still allows 5.76 seconds
    // of audio for up to four characters while bounding that long tail.
    if (text.length <= MAXIMUM_QWEN_SHORT_TEXT_LENGTH) return MAXIMUM_QWEN_SHORT_TEXT_TOKENS;
    // Keep Android fragments at 20 characters and reserve eight tokens per
    // character so longer narration normally ends before the detectable cap.
    // At most 1,000 tokens are 80 seconds / 3.84 MB of PCM16, below 4 MiB.
    return Math.min(1_000, Math.max(MINIMUM_QWEN_NARRATION_TOKENS, text.length * QWEN3_TOKENS_PER_CHARACTER));
}

function isQwen3TtsModel(modelId: string): boolean {
    return /Qwen3-TTS/iu.test(modelId);
}

function isQwen3BaseModel(modelId: string | null): boolean {
    return /Qwen3-TTS-12Hz-(?:0\.6B|1\.7B)-Base(?:-|$)/iu.test(modelId ?? '');
}

function shouldSendMlxInstruct(modelId: string | null, instruct: string | null): instruct is string {
    if (!instruct) return false;
    // Base checkpoints use ref_audio/ref_text ICL cloning and do not implement
    // VoiceDesign or CustomVoice style instructions.
    if (isQwen3BaseModel(modelId)) return false;
    // MLX Audio's 0.6B CustomVoice checkpoints accept the field but can emit
    // a long silent PCM response when it is present.  Their predefined voices
    // remain usable without style control; 1.7B CustomVoice retains it.
    return !/Qwen3-TTS-12Hz-0\.6B-CustomVoice(?:-|$)/iu.test(modelId ?? '');
}

function normalizeLoopbackUrl(value: string): string {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !isLoopbackHost(url.hostname)) {
        throw new Error('CosyVoice sidecar URL must use an HTTP loopback address');
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error('CosyVoice sidecar URL must not contain credentials, paths, or query parameters');
    }
    return url.toString().replace(/\/$/u, '');
}

function isLoopbackHost(hostname: string): boolean {
    return hostname === '127.0.0.1' || hostname === '::1' || hostname === 'localhost';
}

function parseSampleRate(value: string | null): number {
    const parsed = value ? Number.parseInt(value, 10) : NaN;
    return Number.isInteger(parsed) && parsed >= 8_000 && parsed <= 96_000
        ? parsed
        : DEFAULT_SAMPLE_RATE_HZ;
}

function hasAudiblePcm(pcm16le: Buffer): boolean {
    let absoluteSum = 0;
    for (let index = 0; index < pcm16le.length; index += 2) {
        absoluteSum += Math.abs(pcm16le.readInt16LE(index));
    }
    return absoluteSum / (pcm16le.length / 2) >= MINIMUM_AUDIBLE_MEAN_ABSOLUTE_SAMPLE;
}

function applyQwenOutputGain(pcm16le: Buffer): Buffer {
    const amplified = Buffer.allocUnsafe(pcm16le.byteLength);
    for (let offset = 0; offset < pcm16le.byteLength; offset += 2) {
        const gained = Math.round(pcm16le.readInt16LE(offset) * QWEN3_OUTPUT_GAIN);
        amplified.writeInt16LE(
            Math.max(-PCM16_MINUS_ONE_DB_PEAK, Math.min(PCM16_MINUS_ONE_DB_PEAK, gained)),
            offset,
        );
    }
    return amplified;
}
