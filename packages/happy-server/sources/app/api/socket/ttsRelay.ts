import {
    TtsStatusResultSchema,
    TtsSynthesisStreamRelayEventSchema,
    TtsSynthesisResultSchema,
    type TtsSynthesisRequest,
    type TtsSynthesisResult,
    type TtsErrorCode,
    type TtsStatusResult,
    type TtsSynthesisStreamEvent,
} from '@slopus/happy-wire';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';

// Buffered Qwen fragments may take longer than real time to synthesize. The
// Android client deliberately waits for a bounded complete fragment before it
// starts its audio callback, so the authenticated relay must allow that work.
const RELAY_TIMEOUT_MS = 90_000;
const STATUS_RELAY_TIMEOUT_MS = 5_000;
let io: Server | null = null;
export type TtsStreamResult = { type: 'success' } | { type: 'error'; code: TtsErrorCode };

export interface TtsRelay {
    status(userId: string, machineId: string): Promise<TtsStatusResult>;
    synthesize(userId: string, machineId: string, request: TtsSynthesisRequest): Promise<TtsSynthesisResult>;
    stream(
        userId: string,
        machineId: string,
        request: TtsSynthesisRequest,
        onEvent: (event: TtsSynthesisStreamEvent) => void,
        signal?: AbortSignal,
    ): Promise<TtsStreamResult>;
}

export function configureTtsRelay(socketServer: Server): void {
    io = socketServer;
}

/**
 * Selects only the authenticated user's paired machine socket. The server
 * forwards data transiently and deliberately does not log request text or PCM.
 */
export const ttsRelay: TtsRelay = {
    async status(userId, machineId) {
        if (!io) return { type: 'error', code: 'machine_offline' };

        try {
            const room = `user:${userId}:machine:${machineId}`;
            const targets = await io.in(room).timeout(2_000).fetchSockets();
            if (targets.length !== 1) return { type: 'error', code: 'machine_offline' };
            const result = await (targets[0] as any)
                .timeout(STATUS_RELAY_TIMEOUT_MS)
                .emitWithAck('tts-relay-status-request');
            const parsed = TtsStatusResultSchema.safeParse(result);
            return parsed.success ? parsed.data : { type: 'error', code: 'provider_error' };
        } catch {
            return { type: 'error', code: 'machine_offline' };
        }
    },

    async synthesize(userId, machineId, request) {
        if (!io) return { type: 'error', code: 'machine_offline' };

        try {
            const room = `user:${userId}:machine:${machineId}`;
            const targets = await io.in(room).timeout(2_000).fetchSockets();
            if (targets.length !== 1) {
                return { type: 'error', code: 'machine_offline' };
            }
            const result = await (targets[0] as any)
                .timeout(RELAY_TIMEOUT_MS)
                .emitWithAck('tts-relay-request', request);
            const parsed = TtsSynthesisResultSchema.safeParse(result);
            return parsed.success ? parsed.data : { type: 'error', code: 'provider_error' };
        } catch {
            return { type: 'error', code: 'machine_offline' };
        }
    },

    async stream(userId, machineId, request, onEvent, signal) {
        if (!io) return { type: 'error', code: 'machine_offline' };

        try {
            const room = `user:${userId}:machine:${machineId}`;
            const targets = await io.in(room).timeout(2_000).fetchSockets();
            if (targets.length !== 1) return { type: 'error', code: 'machine_offline' };

            const target = targets[0] as any;
            const streamId = randomUUID();
            return await new Promise<TtsStreamResult>((resolve) => {
                let started = false;
                let nextSequence = 0;
                let terminal = false;
                let timeout: ReturnType<typeof setTimeout> | null = null;
                const abortListener = () => {
                    target.emit('tts-relay-stream-cancel', { streamId });
                    finish({ type: 'error', code: 'machine_offline' });
                };
                const resetIdleTimeout = () => {
                    if (timeout) clearTimeout(timeout);
                    timeout = setTimeout(
                        () => {
                            target.emit('tts-relay-stream-cancel', { streamId });
                            finish({ type: 'error', code: 'machine_offline' });
                        },
                        RELAY_TIMEOUT_MS,
                    );
                };
                const finish = (result: TtsStreamResult) => {
                    if (terminal) return;
                    terminal = true;
                    if (timeout) clearTimeout(timeout);
                    target.off('tts-relay-stream-event', receive);
                    signal?.removeEventListener('abort', abortListener);
                    resolve(result);
                };
                const receive = (raw: unknown) => {
                    const message = TtsSynthesisStreamRelayEventSchema.safeParse(raw);
                    if (!message.success || message.data.streamId !== streamId || terminal) return;
                    const event = message.data.event;
                    if (event.type === 'start') {
                        if (started) return finish({ type: 'error', code: 'provider_error' });
                        started = true;
                        resetIdleTimeout();
                        onEvent(event);
                        return;
                    }
                    if (event.type === 'chunk') {
                        if (!started || event.sequence !== nextSequence) {
                            return finish({ type: 'error', code: 'provider_error' });
                        }
                        nextSequence++;
                        resetIdleTimeout();
                        onEvent(event);
                        return;
                    }
                    if (event.type === 'end') {
                        if (!started) return finish({ type: 'error', code: 'provider_error' });
                        onEvent(event);
                        return finish({ type: 'success' });
                    }
                    onEvent(event);
                    return finish({ type: 'error', code: event.code });
                };
                target.on('tts-relay-stream-event', receive);
                signal?.addEventListener('abort', abortListener, { once: true });
                if (signal?.aborted) return abortListener();
                resetIdleTimeout();
                void target.timeout(2_000)
                    .emitWithAck('tts-relay-stream-request', { streamId, request })
                    .then((ack: { accepted?: unknown }) => {
                        if (ack.accepted !== true) {
                            finish({ type: 'error', code: 'configuration_invalid' });
                        }
                    })
                    .catch(() => finish({ type: 'error', code: 'machine_offline' }));
            });
        } catch {
            return { type: 'error', code: 'machine_offline' };
        }
    },
};
