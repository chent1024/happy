import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, readCredentials, readSettings } = vi.hoisted(() => ({
    get: vi.fn(), post: vi.fn(), readCredentials: vi.fn(), readSettings: vi.fn(),
}));
vi.mock('axios', () => ({ default: { get, post } }));
vi.mock('@/persistence', () => ({ readCredentials, readSettings }));
vi.mock('@/configuration', () => ({ configuration: { serverUrl: 'http://127.0.0.1:3005' } }));

import { approveLatestTtsClient } from './tts';

describe('approveLatestTtsClient', () => {
    beforeEach(() => vi.clearAllMocks());

    it('approves the latest request without exposing the account token in the result', async () => {
        readCredentials.mockResolvedValue({ token: 'account-secret' });
        readSettings.mockResolvedValue({ machineId: 'machine-1' });
        get.mockResolvedValue({ data: { requests: [{ id: 'request-1', label: 'yuedu Android', createdAt: 'now' }] } });
        post.mockResolvedValue({ data: { state: 'approved' } });

        const result = await approveLatestTtsClient();

        expect(result).toEqual({ label: 'yuedu Android' });
        expect(post).toHaveBeenCalledWith(
            'http://127.0.0.1:3005/v1/tts/auth/approve',
            { requestId: 'request-1', machineId: 'machine-1' },
            expect.objectContaining({ headers: { authorization: 'Bearer account-secret' } }),
        );
        expect(JSON.stringify(result)).not.toContain('account-secret');
    });
});
