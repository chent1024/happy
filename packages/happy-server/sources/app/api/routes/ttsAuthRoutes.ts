import { z } from 'zod';
import { auth } from '@/app/auth/auth';
import { db } from '@/storage/db';
import type { Fastify } from '../types';

const requestBody = z.object({
    clientId: z.string().min(40).max(64),
    machineId: z.string().min(1).max(128),
    label: z.string().trim().min(1).max(80),
}).superRefine((value, ctx) => {
    try {
        if (Buffer.from(value.clientId, 'base64').length !== 32) {
            ctx.addIssue({ code: 'custom', message: 'clientId must contain 32 random bytes', path: ['clientId'] });
        }
    } catch {
        ctx.addIssue({ code: 'custom', message: 'clientId must be base64', path: ['clientId'] });
    }
});

const pendingWindowMs = 15 * 60 * 1000;

export function ttsAuthRoutes(app: Fastify) {
    app.post('/v1/tts/auth/request', {
        schema: { body: requestBody },
    }, async (request, reply) => {
        const existing = await db.ttsClientAuthRequest.findUnique({
            where: { clientId: request.body.clientId },
        });
        if (existing && existing.machineId !== request.body.machineId) {
            return reply.code(409).send({ error: 'Client is already paired with another machine' });
        }
        const authRequest = existing?.accountId
            ? existing
            : await db.ttsClientAuthRequest.upsert({
                where: { clientId: request.body.clientId },
                create: request.body,
                update: { label: request.body.label, createdAt: new Date() },
            });
        if (authRequest.accountId && authRequest.approvedAt) {
            const token = await auth.createToken(authRequest.accountId, {
                purpose: 'tts-client', machineId: authRequest.machineId,
            });
            return reply.send({ state: 'authorized', token });
        }
        return reply.send({ state: 'pending' });
    });

    app.get('/v1/tts/auth/pending', {
        preHandler: app.authenticate,
        schema: { querystring: z.object({ machineId: z.string().min(1).max(128) }) },
    }, async (request, reply) => {
        const machine = await db.machine.findFirst({
            where: { id: request.query.machineId, accountId: request.userId },
            select: { id: true },
        });
        if (!machine) return reply.code(404).send({ error: 'Machine not found' });
        const requests = await db.ttsClientAuthRequest.findMany({
            where: {
                machineId: machine.id,
                accountId: null,
                createdAt: { gte: new Date(Date.now() - pendingWindowMs) },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { id: true, label: true, createdAt: true },
        });
        return reply.send({ requests });
    });

    app.post('/v1/tts/auth/approve', {
        preHandler: app.authenticate,
        schema: { body: z.object({ requestId: z.string().min(1), machineId: z.string().min(1).max(128) }) },
    }, async (request, reply) => {
        const authRequest = await db.ttsClientAuthRequest.findUnique({ where: { id: request.body.requestId } });
        if (!authRequest || authRequest.machineId !== request.body.machineId
            || authRequest.createdAt < new Date(Date.now() - pendingWindowMs)) {
            return reply.code(404).send({ error: 'Pairing request not found or expired' });
        }
        const machine = await db.machine.findFirst({
            where: { id: request.body.machineId, accountId: request.userId },
            select: { id: true },
        });
        if (!machine) return reply.code(404).send({ error: 'Pairing request not found' });
        await db.ttsClientAuthRequest.update({
            where: { id: authRequest.id },
            data: { accountId: request.userId, approvedAt: new Date() },
        });
        return reply.send({ state: 'approved' });
    });
}
