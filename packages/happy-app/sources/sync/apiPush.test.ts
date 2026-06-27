import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthCredentials } from '@/auth/tokenStorage';
import { unregisterPushToken } from './apiPush';

vi.mock('./serverConfig', () => ({
    getServerUrl: () => 'https://api.cluster-fluster.com',
}));

vi.mock('./apiSocket', () => ({
    getHappyClientId: () => 'test-client',
}));

const credentials: AuthCredentials = {
    token: 'test-token',
    secret: 'test-secret',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('unregisterPushToken', () => {
    it('does not retry forever when the saved token is invalid', async () => {
        fetchMock.mockResolvedValueOnce(response({
            ok: false,
            status: 401,
        }));

        await expect(unregisterPushToken(credentials, 'push-token')).rejects.toThrow(
            'Failed to unregister push token: 401',
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('deletes the push token when the server accepts the request', async () => {
        fetchMock.mockResolvedValueOnce(response({
            ok: true,
            status: 200,
            body: { success: true },
        }));

        await expect(unregisterPushToken(credentials, 'push-token')).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.cluster-fluster.com/v1/push-tokens/push-token',
            expect.objectContaining({
                method: 'DELETE',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-token',
                    'X-Happy-Client': 'test-client',
                }),
            }),
        );
    });
});

function response(opts: { ok: boolean; status: number; body?: unknown }) {
    return {
        ok: opts.ok,
        status: opts.status,
        json: async () => opts.body ?? {},
    } as Response;
}
