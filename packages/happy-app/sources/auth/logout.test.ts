import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
    registeredPushToken: null as string | null,
    clearPersistence: vi.fn(),
    clearRegisteredPushToken: vi.fn(() => {
        persistence.registeredPushToken = null;
    }),
    loadRegisteredPushToken: vi.fn(() => persistence.registeredPushToken),
}));

const tokenStorage = vi.hoisted(() => ({
    removeCredentials: vi.fn(async () => true),
}));

const apiPush = vi.hoisted(() => ({
    unregisterPushToken: vi.fn(async () => undefined),
}));

vi.mock('@/sync/persistence', () => persistence);
vi.mock('@/auth/tokenStorage', () => ({
    TokenStorage: tokenStorage,
}));
vi.mock('@/sync/apiPush', () => apiPush);

import { clearAuthSession } from './logout';

describe('clearAuthSession', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        persistence.registeredPushToken = null;
        persistence.clearPersistence.mockClear();
        persistence.clearRegisteredPushToken.mockClear();
        persistence.loadRegisteredPushToken.mockClear();
        tokenStorage.removeCredentials.mockReset();
        tokenStorage.removeCredentials.mockResolvedValue(true);
        apiPush.unregisterPushToken.mockReset();
        apiPush.unregisterPushToken.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('clears local auth even when push token unregister fails', async () => {
        persistence.registeredPushToken = 'expo-token';
        apiPush.unregisterPushToken.mockRejectedValue(new Error('server token expired'));

        const result = await clearAuthSession({ token: 'expired-token', secret: 'secret' });

        expect(apiPush.unregisterPushToken).toHaveBeenCalledWith(
            { token: 'expired-token', secret: 'secret' },
            'expo-token'
        );
        expect(persistence.clearRegisteredPushToken).toHaveBeenCalledOnce();
        expect(persistence.clearPersistence).toHaveBeenCalledOnce();
        expect(tokenStorage.removeCredentials).toHaveBeenCalledOnce();
        expect(result).toEqual({ credentialsRemoved: true });
    });

    it('reports when credentials could not be removed', async () => {
        tokenStorage.removeCredentials.mockResolvedValue(false);

        const result = await clearAuthSession(null);

        expect(persistence.clearPersistence).toHaveBeenCalledOnce();
        expect(tokenStorage.removeCredentials).toHaveBeenCalledOnce();
        expect(result).toEqual({ credentialsRemoved: false });
    });
});
