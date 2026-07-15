import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { dbMock, createToken } = vi.hoisted(() => ({
    dbMock: {
        ttsClientAuthRequest: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
        },
        machine: { findFirst: vi.fn() },
    },
    createToken: vi.fn(),
}));

vi.mock('@/storage/db', () => ({ db: dbMock }));
vi.mock('@/app/auth/auth', () => ({ auth: { createToken } }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));

import { ttsAuthRoutes } from './ttsAuthRoutes';

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async (request: any, reply: any) => {
        const userId = request.headers['x-user-id'];
        if (typeof userId !== 'string') return reply.code(401).send({ error: 'Unauthorized' });
        request.userId = userId;
    });
    ttsAuthRoutes(typed);
    await typed.ready();
    return typed;
}

describe('ttsAuthRoutes', () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it('creates a pending request without revealing whether the machine exists', async () => {
        const app = await createApp();
        dbMock.ttsClientAuthRequest.findUnique.mockResolvedValue(null);
        dbMock.ttsClientAuthRequest.upsert.mockResolvedValue({
            id: 'request-1', clientId: 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=',
            machineId: 'machine-1', accountId: null, approvedAt: null,
        });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/tts/auth/request',
            payload: {
                clientId: 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=',
                machineId: 'machine-1',
                label: 'yuedu Android',
            },
        });
        await app.close();

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ state: 'pending' });
        expect(dbMock.machine.findFirst).not.toHaveBeenCalled();
    });

    it('returns a machine-scoped token after approval', async () => {
        const app = await createApp();
        dbMock.ttsClientAuthRequest.findUnique.mockResolvedValue({
            id: 'request-1', clientId: 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=',
            machineId: 'machine-1', accountId: 'account-1', approvedAt: new Date(),
        });
        createToken.mockResolvedValue('tts-scoped-token');

        const response = await app.inject({
            method: 'POST',
            url: '/v1/tts/auth/request',
            payload: {
                clientId: 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=',
                machineId: 'machine-1', label: 'yuedu Android',
            },
        });
        await app.close();

        expect(response.json()).toEqual({ state: 'authorized', token: 'tts-scoped-token' });
        expect(createToken).toHaveBeenCalledWith('account-1', {
            purpose: 'tts-client', machineId: 'machine-1',
        });
    });

    it('approves only a request targeting a machine owned by the caller', async () => {
        const app = await createApp();
        dbMock.ttsClientAuthRequest.findUnique.mockResolvedValue({
            id: 'request-1', machineId: 'machine-1', accountId: null,
        });
        dbMock.machine.findFirst.mockResolvedValue(null);

        const denied = await app.inject({
            method: 'POST',
            url: '/v1/tts/auth/approve',
            headers: { 'x-user-id': 'account-2' },
            payload: { requestId: 'request-1', machineId: 'machine-1' },
        });
        expect(denied.statusCode).toBe(404);

        dbMock.machine.findFirst.mockResolvedValue({ id: 'machine-1', accountId: 'account-1' });
        dbMock.ttsClientAuthRequest.update.mockResolvedValue({});
        const allowed = await app.inject({
            method: 'POST',
            url: '/v1/tts/auth/approve',
            headers: { 'x-user-id': 'account-1' },
            payload: { requestId: 'request-1', machineId: 'machine-1' },
        });
        await app.close();

        expect(allowed.statusCode).toBe(200);
        expect(dbMock.ttsClientAuthRequest.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'request-1' },
            data: expect.objectContaining({ accountId: 'account-1' }),
        }));
    });
});
