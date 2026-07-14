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
});
