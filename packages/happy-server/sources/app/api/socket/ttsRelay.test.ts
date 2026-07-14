import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureTtsRelay, ttsRelay } from './ttsRelay';

const request = { requestId: 'utterance-1', text: '朗读测试。', locale: 'zh-CN', rate: 1 };

describe('ttsRelay', () => {
    afterEach(() => vi.useRealTimers());

    it('targets exactly the authenticated user and selected machine room', async () => {
        const target = { timeout: vi.fn(() => ({ emitWithAck: vi.fn(async () => ({
            type: 'success', sampleRateHz: 24_000, pcm16leBase64: 'AQI=', roleResolution: 'narrator', cacheHit: false,
        })) })) };
        const socketServer = { in: vi.fn(() => ({ timeout: vi.fn(() => ({ fetchSockets: vi.fn(async () => [target]) })) })) };
        configureTtsRelay(socketServer as any);
        await expect(ttsRelay.synthesize('account-1', 'machine-1', request)).resolves.toMatchObject({ type: 'success' });
        expect(socketServer.in).toHaveBeenCalledWith('user:account-1:machine:machine-1');
    });

    it('rejects non-selected or offline machine rooms', async () => {
        configureTtsRelay({ in: vi.fn(() => ({ timeout: vi.fn(() => ({ fetchSockets: vi.fn(async () => []) })) })) } as any);
        await expect(ttsRelay.synthesize('account-1', 'machine-1', request)).resolves.toEqual({
            type: 'error', code: 'machine_offline',
        });
    });

    it('reads redacted status only from the authenticated selected machine room', async () => {
        const status = {
            state: 'ready', provider: 'cosyvoice', modelRevision: 'qwen3',
            cache: { entries: 0, bytes: 0 }, lastError: null,
            diagnostics: { pendingRequests: 0, preAudioRetries: 1, lastFailure: null },
        };
        const target = { timeout: vi.fn(() => ({ emitWithAck: vi.fn(async () => ({ type: 'success', status })) })) };
        const socketServer = { in: vi.fn(() => ({ timeout: vi.fn(() => ({ fetchSockets: vi.fn(async () => [target]) })) })) };
        configureTtsRelay(socketServer as any);

        await expect(ttsRelay.status('account-1', 'machine-1')).resolves.toEqual({ type: 'success', status });
        expect(socketServer.in).toHaveBeenCalledWith('user:account-1:machine:machine-1');
    });

    it('rejects malformed selected-machine status instead of leaking it', async () => {
        const target = { timeout: vi.fn(() => ({ emitWithAck: vi.fn(async () => ({
            type: 'success', status: { state: 'ready', providerPath: '/private/provider' },
        })) })) };
        configureTtsRelay({ in: vi.fn(() => ({ timeout: vi.fn(() => ({ fetchSockets: vi.fn(async () => [target]) })) })) } as any);

        await expect(ttsRelay.status('account-1', 'machine-1')).resolves.toEqual({
            type: 'error', code: 'provider_error',
        });
    });

    it('forwards only ordered start/chunk/end frames and rejects a sequence gap', async () => {
        let listener: ((event: unknown) => void) | undefined;
        let streamId: string | undefined;
        const target = {
            on: vi.fn((_event: string, value: (event: unknown) => void) => { listener = value; }), off: vi.fn(),
            emit: vi.fn((_event: string, data: { streamId?: string }) => { streamId = data.streamId; }),
            timeout: vi.fn(() => ({ emitWithAck: vi.fn(async (_event: string, data: { streamId?: string }) => {
                streamId = data.streamId;
                return { accepted: true };
            }) })),
        };
        configureTtsRelay({ in: vi.fn(() => ({ timeout: vi.fn(() => ({ fetchSockets: vi.fn(async () => [target]) })) })) } as any);
        const events: unknown[] = [];
        const pending = ttsRelay.stream('account-1', 'machine-1', request, (event) => events.push(event));
        await Promise.resolve();
        listener?.({ streamId, event: { type: 'start', sampleRateHz: 24_000 } });
        listener?.({ streamId, event: { type: 'chunk', sequence: 1, pcm16leBase64: 'AQI=' } });
        await expect(pending).resolves.toEqual({ type: 'error', code: 'provider_error' });
        expect(events).toEqual([{ type: 'start', sampleRateHz: 24_000 }]);
    });

    it('sends cancellation to the selected machine and emits no later frames', async () => {
        let listener: ((event: unknown) => void) | undefined;
        let streamId: string | undefined;
        const target = {
            on: vi.fn((_event: string, value: (event: unknown) => void) => { listener = value; }), off: vi.fn(),
            emit: vi.fn((_event: string, data: { streamId?: string }) => { streamId = data.streamId; }),
            timeout: vi.fn(() => ({ emitWithAck: vi.fn(async (_event: string, data: { streamId?: string }) => {
                streamId = data.streamId;
                return { accepted: true };
            }) })),
        };
        configureTtsRelay({ in: vi.fn(() => ({ timeout: vi.fn(() => ({ fetchSockets: vi.fn(async () => [target]) })) })) } as any);
        const controller = new AbortController();
        const events: unknown[] = [];
        const pending = ttsRelay.stream('account-1', 'machine-1', request, (event) => events.push(event), controller.signal);
        await Promise.resolve();
        controller.abort();
        listener?.({ streamId, event: { type: 'start', sampleRateHz: 24_000 } });
        await expect(pending).resolves.toEqual({ type: 'error', code: 'machine_offline' });
        expect(target.emit).toHaveBeenCalledWith('tts-relay-stream-cancel', expect.objectContaining({ streamId }));
        expect(events).toEqual([]);
    });

    it('cancels the selected machine stream when the bounded relay wait expires', async () => {
        vi.useFakeTimers();
        let streamId: string | undefined;
        const target = {
            on: vi.fn(), off: vi.fn(),
            emit: vi.fn((_event: string, data: { streamId?: string }) => { streamId = data.streamId; }),
            timeout: vi.fn(() => ({ emitWithAck: vi.fn(async (_event: string, data: { streamId?: string }) => {
                streamId = data.streamId;
                return { accepted: true };
            }) })),
        };
        configureTtsRelay({ in: vi.fn(() => ({ timeout: vi.fn(() => ({ fetchSockets: vi.fn(async () => [target]) })) })) } as any);

        const pending = ttsRelay.stream('account-1', 'machine-1', request, vi.fn());
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(90_000);

        await expect(pending).resolves.toEqual({ type: 'error', code: 'machine_offline' });
        expect(target.emit).toHaveBeenCalledWith('tts-relay-stream-cancel', expect.objectContaining({ streamId }));
    });
});
