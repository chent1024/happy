import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCredentials, getServerUrl } = vi.hoisted(() => ({
    getCredentials: vi.fn(),
    getServerUrl: vi.fn(),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: {} }));
vi.mock('@/auth/tokenStorage', () => ({ TokenStorage: { getCredentials } }));
vi.mock('@/sync/serverConfig', () => ({ getServerUrl }));

import { fetchMacTtsStatus } from './nativeTts';

describe('fetchMacTtsStatus', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        getCredentials.mockResolvedValue({ token: 'existing-account-token', secret: 'secret' });
        getServerUrl.mockReturnValue('https://happy.example');
    });

    it('uses the existing Happy account and selected machine status route', async () => {
        const status = {
            state: 'ready', provider: 'cosyvoice', modelRevision: 'qwen3',
            cache: { entries: 0, bytes: 0 }, lastError: null,
            diagnostics: { pendingRequests: 0, preAudioRetries: 1, lastFailure: null },
        };
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ type: 'success', status }), {
            status: 200, headers: { 'content-type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchMacTtsStatus('machine/id')).resolves.toEqual(status);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://happy.example/v1/machines/machine%2Fid/tts/status',
            expect.objectContaining({ headers: { Authorization: 'Bearer existing-account-token' } }),
        );
    });

    it('rejects malformed or unavailable status without exposing server details', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            type: 'success', status: { state: 'ready', providerPath: '/private/provider' },
        }), { status: 200 })));

        await expect(fetchMacTtsStatus('machine-1')).rejects.toThrow('无法读取 Qwen3 状态');
    });
});
