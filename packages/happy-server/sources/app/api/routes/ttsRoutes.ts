import { TtsSynthesisRequestSchema } from '@slopus/happy-wire';
import { z } from 'zod';
import { db } from '@/storage/db';
import type { Fastify } from '../types';
import { ttsRelay, type TtsRelay } from '../socket/ttsRelay';

/**
 * Authenticated endpoint shared by trusted TTS clients, including Happy's
 * Android system service and the embedded yuedu narration engine. Each client
 * keeps either a normal Happy token or a machine-bound TTS token in
 * app-private encrypted storage.
 */
export function ttsRoutes(app: Fastify, relay: TtsRelay = ttsRelay) {
    app.get('/v1/machines/:id/tts/status', {
        preHandler: app.authenticateTts,
        schema: { params: z.object({ id: z.string().min(1) }) },
    }, async (request, reply) => {
        const machine = await db.machine.findFirst({
            where: { id: request.params.id, accountId: request.userId },
        });
        if (!machine) return reply.code(404).send({ error: 'Machine not found' });

        const result = await relay.status(request.userId, machine.id);
        if (result.type === 'error' && result.code === 'machine_offline') {
            return reply.code(503).send(result);
        }
        return reply.send(result);
    });

    app.post('/v1/machines/:id/tts/stream', {
        preHandler: app.authenticateTts,
        schema: {
            params: z.object({ id: z.string().min(1) }),
            body: TtsSynthesisRequestSchema,
        },
    }, async (request, reply) => {
        const machine = await db.machine.findFirst({
            where: { id: request.params.id, accountId: request.userId },
        });
        if (!machine) {
            return reply.code(404).send({ error: 'Machine not found' });
        }

        reply.raw.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
        reply.hijack();
        const abort = new AbortController();
        const cancel = () => abort.abort();
        const closeResponse = () => {
            if (!reply.raw.writableEnded) cancel();
        };
        request.raw.once('aborted', cancel);
        reply.raw.once('close', closeResponse);
        let wroteEvent = false;
        try {
            const result = await relay.stream(request.userId, machine.id, request.body, (event) => {
                if (abort.signal.aborted || reply.raw.destroyed) return;
                wroteEvent = true;
                reply.raw.write(`${JSON.stringify(event)}\n`);
            }, abort.signal);
            if (result.type === 'error' && !wroteEvent && !abort.signal.aborted && !reply.raw.destroyed) {
                reply.raw.statusCode = result.code === 'machine_offline' ? 503 : 502;
                reply.raw.write(`${JSON.stringify({ type: 'error', code: result.code })}\n`);
            }
        } finally {
            request.raw.off('aborted', cancel);
            reply.raw.off('close', closeResponse);
            if (!reply.raw.destroyed) reply.raw.end();
        }
    });

    app.post('/v1/machines/:id/tts', {
        preHandler: app.authenticateTts,
        schema: {
            params: z.object({ id: z.string().min(1) }),
            body: TtsSynthesisRequestSchema,
        },
    }, async (request, reply) => {
        const machine = await db.machine.findFirst({
            where: { id: request.params.id, accountId: request.userId },
        });
        if (!machine) {
            return reply.code(404).send({ error: 'Machine not found' });
        }

        const result = await relay.synthesize(request.userId, machine.id, request.body);
        if (result.type === 'error' && result.code === 'machine_offline') {
            return reply.code(503).send(result);
        }
        return reply.send(result);
    });
}
