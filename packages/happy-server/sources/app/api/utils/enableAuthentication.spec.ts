import fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { logSpy, verifyToken } = vi.hoisted(() => ({
    logSpy: vi.fn(),
    verifyToken: vi.fn(),
}));

vi.mock('@/utils/log', () => ({ log: logSpy }));
vi.mock('@/app/auth/auth', () => ({ auth: { verifyToken } }));

import { enableAuthentication } from './enableAuthentication';

describe('enableAuthentication', () => {
    afterEach(() => vi.clearAllMocks());

    it('never writes any part of a bearer token to logs', async () => {
        const app = fastify() as unknown as Fastify;
        enableAuthentication(app);
        app.get('/protected', { preHandler: app.authenticate }, async () => ({ ok: true }));
        verifyToken.mockResolvedValue({ userId: 'account-1' });

        const response = await app.inject({
            method: 'GET', url: '/protected', headers: { authorization: 'Bearer secret-token-must-not-log' },
        });
        await app.close();

        expect(response.statusCode).toBe(200);
        expect(logSpy.mock.calls.flat().join(' ')).not.toContain('secret-token-must-not-log');
    });

    it('rejects a TTS-scoped token on normal API routes', async () => {
        const app = fastify() as unknown as Fastify;
        enableAuthentication(app);
        app.get('/protected', { preHandler: app.authenticate }, async () => ({ ok: true }));
        verifyToken.mockResolvedValue({
            userId: 'account-1',
            extras: { purpose: 'tts-client', machineId: 'machine-1' },
        });

        const response = await app.inject({
            method: 'GET', url: '/protected', headers: { authorization: 'Bearer scoped-token' },
        });
        await app.close();

        expect(response.statusCode).toBe(403);
    });

    it('accepts a TTS-scoped token only for its bound machine', async () => {
        const app = fastify() as unknown as Fastify;
        enableAuthentication(app);
        app.get('/v1/machines/:id/tts/status', { preHandler: app.authenticateTts }, async () => ({ ok: true }));
        verifyToken.mockResolvedValue({
            userId: 'account-1',
            extras: { purpose: 'tts-client', machineId: 'machine-1' },
        });

        const allowed = await app.inject({
            method: 'GET',
            url: '/v1/machines/machine-1/tts/status',
            headers: { authorization: 'Bearer scoped-token' },
        });
        const denied = await app.inject({
            method: 'GET',
            url: '/v1/machines/machine-2/tts/status',
            headers: { authorization: 'Bearer scoped-token' },
        });
        await app.close();

        expect(allowed.statusCode).toBe(200);
        expect(denied.statusCode).toBe(403);
    });
});
