import { describe, expect, it, vi } from 'vitest';
import type { TtsServiceConfiguration, TtsSynthesisRequest } from '@slopus/happy-wire';
import { TtsManager, type LocalTtsProvider } from './TtsManager';

const configuration: TtsServiceConfiguration = {
    version: 1, enabled: true, provider: 'cosyvoice', narratorProfileId: 'narrator',
    voiceProfiles: [{ id: 'narrator', label: '旁白', providerVoiceId: 'Uncle_Fu' }],
    roleRules: [], cache: { maxEntries: 2, maxBytes: 1_000_000 },
};
const request: TtsSynthesisRequest = { requestId: 'r1', text: '测试朗读。', locale: 'zh-CN', rate: 1 };

function provider(overrides: Partial<LocalTtsProvider> = {}): LocalTtsProvider {
    return {
        status: vi.fn(async () => ({ available: true, provider: 'cosyvoice' as const, modelRevision: 'qwen-8bit' })),
        synthesize: vi.fn(async () => ({ sampleRateHz: 24_000, pcm16le: Buffer.from([1, 2]) })),
        ...overrides,
    };
}

function audiblePcm(samples = 24_000): Buffer {
    const pcm = Buffer.alloc(samples * 2);
    for (let index = 0; index < pcm.byteLength; index += 2) pcm.writeInt16LE(1_000, index);
    return pcm;
}

describe('TtsManager stream contract', () => {
    it('returns provider_unavailable rather than selecting an alternate endpoint', async () => {
        const manager = new TtsManager(provider({
            status: vi.fn(async () => ({ available: false, provider: 'cosyvoice' as const, modelRevision: null })),
        }));
        await expect(manager.synthesizeStream(configuration, request, vi.fn(), new AbortController().signal))
            .resolves.toEqual({ type: 'error', code: 'provider_unavailable' });
    });

    it('starts an ordered stream and emits end only after audible PCM', async () => {
        const emit = vi.fn();
        const manager = new TtsManager(provider({
            synthesizeStream: vi.fn(async ({ onChunk }) => onChunk({ sampleRateHz: 24_000, pcm16le: audiblePcm() })),
        }));
        await expect(manager.synthesizeStream(configuration, request, emit, new AbortController().signal))
            .resolves.toEqual({ type: 'success' });
        const chunks = emit.mock.calls.map(([event]) => event).filter((event) => event.type === 'chunk');
        expect(emit).toHaveBeenCalledWith({ type: 'start', sampleRateHz: 24_000 });
        expect(chunks.map((event) => event.sequence)).toEqual(chunks.map((_event, index) => index));
        expect(emit).toHaveBeenLastCalledWith({ type: 'end' });
    });

    it('does not emit a synthetic silent chunk while full-fragment audio is still being prepared', async () => {
        let releaseProvider!: () => void;
        const providerReady = new Promise<void>((resolve) => { releaseProvider = resolve; });
        let providerEntered!: () => void;
        const providerStarted = new Promise<void>((resolve) => { providerEntered = resolve; });
        const emit = vi.fn();
        const manager = new TtsManager(provider({
            synthesizeStream: vi.fn(async ({ onChunk }) => {
                providerEntered();
                await providerReady;
                onChunk({ sampleRateHz: 24_000, pcm16le: audiblePcm() });
            }),
        }));

        const pending = manager.synthesizeStream(configuration, request, emit, new AbortController().signal);
        await providerStarted;
        expect(emit).not.toHaveBeenCalled();

        releaseProvider();
        await expect(pending).resolves.toEqual({ type: 'success' });
        expect(emit).toHaveBeenCalledWith({ type: 'start', sampleRateHz: 24_000 });
    });

    it('does not abort a healthy complete-fragment generation after three seconds', async () => {
        vi.useFakeTimers();
        try {
            const stream = vi.fn(async ({ signal, onChunk }: Parameters<NonNullable<LocalTtsProvider['synthesizeStream']>>[0]) => {
                await new Promise<void>((resolve, reject) => {
                    const completion = setTimeout(resolve, 4_500);
                    signal.addEventListener('abort', () => {
                        clearTimeout(completion);
                        reject(new DOMException('cancelled', 'AbortError'));
                    }, { once: true });
                });
                onChunk({ sampleRateHz: 24_000, pcm16le: audiblePcm() });
            });
            const manager = new TtsManager(provider({ synthesizeStream: stream }));
            const pending = manager.synthesizeStream(configuration, request, vi.fn(), new AbortController().signal);

            await vi.advanceTimersByTimeAsync(8_000);

            await expect(pending).resolves.toEqual({ type: 'success' });
            expect(stream).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });

    it('bounds a stalled provider with the overall stream timeout', async () => {
        vi.useFakeTimers();
        try {
            let firstProviderEntered!: () => void;
            const firstProviderStarted = new Promise<void>((resolve) => { firstProviderEntered = resolve; });
            let attempts = 0;
            const manager = new TtsManager(provider({
                synthesizeStream: vi.fn(async ({ signal }) => {
                    attempts++;
                    if (attempts === 1) firstProviderEntered();
                    await new Promise<void>((_resolve, reject) => {
                        signal.addEventListener('abort', () => reject(new DOMException('timed out', 'AbortError')), { once: true });
                    });
                }),
            }), { streamTimeoutMs: 10_000 });

            const pending = manager.synthesizeStream(configuration, request, vi.fn(), new AbortController().signal);
            await firstProviderStarted;
            await vi.advanceTimersByTimeAsync(9_999);
            expect(await Promise.race([pending, Promise.resolve('waiting')])).toBe('waiting');

            await vi.advanceTimersByTimeAsync(1);
            await expect(pending).resolves.toEqual({ type: 'error', code: 'timeout' });
            expect(attempts).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('retries only once when a provider fails before audible PCM', async () => {
        let attempts = 0;
        const stream = vi.fn(async ({ onChunk }: Parameters<NonNullable<LocalTtsProvider['synthesizeStream']>>[0]) => {
            attempts++;
            if (attempts === 1) throw new Error('cold sidecar');
            onChunk({ sampleRateHz: 24_000, pcm16le: audiblePcm() });
        });
        const manager = new TtsManager(provider({ synthesizeStream: stream }));
        await expect(manager.synthesizeStream(configuration, request, vi.fn(), new AbortController().signal))
            .resolves.toEqual({ type: 'success' });
        expect(stream).toHaveBeenCalledTimes(2);
        expect(stream.mock.calls.map(([input]) => input.attempt)).toEqual([1, 2]);
        await expect(manager.runtimeStatus(configuration)).resolves.toMatchObject({ diagnostics: { preAudioRetries: 1 } });
    });

    it('allows the provider to finish after audible PCM has started', async () => {
        vi.useFakeTimers();
        try {
            const stream = vi.fn(async ({ signal, onChunk }: Parameters<NonNullable<LocalTtsProvider['synthesizeStream']>>[0]) => {
                onChunk({ sampleRateHz: 24_000, pcm16le: audiblePcm() });
                await new Promise<void>((resolve, reject) => {
                    const completion = setTimeout(resolve, 4_000);
                    signal.addEventListener('abort', () => {
                        clearTimeout(completion);
                        reject(new DOMException('attempt timed out', 'AbortError'));
                    }, { once: true });
                });
            });
            const manager = new TtsManager(provider({ synthesizeStream: stream }));
            const pending = manager.synthesizeStream(configuration, request, vi.fn(), new AbortController().signal);

            await vi.advanceTimersByTimeAsync(3_000);
            expect(await Promise.race([pending, Promise.resolve('waiting')])).toBe('waiting');
            await vi.advanceTimersByTimeAsync(1_000);

            await expect(pending).resolves.toEqual({ type: 'success' });
            expect(stream).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('reports redacted provider-attempt diagnostics without request content', async () => {
        const onStreamDiagnostic = vi.fn();
        const stream = vi.fn(async () => {
            throw new Error('Qwen3 sidecar response reached its generation ceiling');
        });
        const manager = new TtsManager(provider({ synthesizeStream: stream }), { onStreamDiagnostic });

        await expect(manager.synthesizeStream(configuration, request, vi.fn(), new AbortController().signal))
            .resolves.toEqual({ type: 'error', code: 'provider_error' });

        expect(onStreamDiagnostic).toHaveBeenCalledTimes(2);
        expect(onStreamDiagnostic).toHaveBeenLastCalledWith({
            phase: 'provider_attempt',
            outcome: 'generation_ceiling',
            attempt: 2,
            bytes: 0,
            elapsedMs: expect.any(Number),
        });
        const serialized = JSON.stringify(onStreamDiagnostic.mock.calls);
        expect(serialized).not.toContain(request.text);
        expect(serialized).not.toContain(request.requestId);
    });

    it('does not retry after audible PCM and never emits end after that error', async () => {
        const emit = vi.fn();
        const stream = vi.fn(async ({ onChunk }: Parameters<NonNullable<LocalTtsProvider['synthesizeStream']>>[0]) => {
            onChunk({ sampleRateHz: 24_000, pcm16le: audiblePcm() });
            throw new Error('late failure');
        });
        const manager = new TtsManager(provider({ synthesizeStream: stream }));
        await expect(manager.synthesizeStream(configuration, request, emit, new AbortController().signal))
            .resolves.toEqual({ type: 'error', code: 'provider_error' });
        expect(stream).toHaveBeenCalledOnce();
        expect(emit).not.toHaveBeenCalledWith({ type: 'end' });
    });

    it('stops without an end event when Android cancellation arrives', async () => {
        const controller = new AbortController();
        const emit = vi.fn();
        const manager = new TtsManager(provider({
            synthesizeStream: vi.fn(async ({ onChunk, signal }) => {
                onChunk({ sampleRateHz: 24_000, pcm16le: audiblePcm() });
                controller.abort();
                if (signal.aborted) throw new DOMException('stopped', 'AbortError');
            }),
        }));
        await expect(manager.synthesizeStream(configuration, request, emit, controller.signal))
            .resolves.toEqual({ type: 'error', code: 'machine_offline' });
        expect(emit).not.toHaveBeenCalledWith({ type: 'end' });
    });
});
