import { beforeEach, describe, expect, it, vi } from 'vitest';

const mmkvStore = vi.hoisted(() => new Map<string, string>());

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString(key: string) {
            return mmkvStore.get(key);
        }

        set(key: string, value: string) {
            mmkvStore.set(key, value);
        }

        delete(key: string) {
            mmkvStore.delete(key);
        }
    },
}));

import { getServerUrl, setServerUrl, validateHappyServerEndpoint } from './serverConfig';

function mockResponse(options: { ok?: boolean; body: string }): Response {
    return {
        ok: options.ok ?? true,
        text: vi.fn(async () => options.body),
    } as unknown as Response;
}

describe('serverConfig', () => {
    beforeEach(() => {
        mmkvStore.clear();
    });

    it('normalizes a saved server URL so API path joins do not produce a double slash', () => {
        setServerUrl('https://chent.taile37c91.ts.net/');

        expect(getServerUrl()).toBe('https://chent.taile37c91.ts.net');
        expect(`${getServerUrl()}/v1/auth`).toBe('https://chent.taile37c91.ts.net/v1/auth');
    });

    it('validates a Happy server through the JSON health endpoint', async () => {
        const fetchImpl = vi.fn(async () => mockResponse({
            body: JSON.stringify({ status: 'ok', service: 'happy-server' }),
        }));

        await expect(validateHappyServerEndpoint('https://chent.taile37c91.ts.net/', fetchImpl as unknown as typeof fetch))
            .resolves.toEqual({ valid: true });

        expect(fetchImpl).toHaveBeenCalledWith('https://chent.taile37c91.ts.net/health', {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        });
    });

    it('rejects plain text welcome responses before JSON API calls run', async () => {
        const fetchImpl = vi.fn(async () => mockResponse({ body: 'welcome' }));

        await expect(validateHappyServerEndpoint('https://example.com', fetchImpl as unknown as typeof fetch))
            .resolves.toEqual({ valid: false, error: 'notValidHappyServer' });
    });

    it('rejects JSON that is not the Happy health shape', async () => {
        const fetchImpl = vi.fn(async () => mockResponse({ body: JSON.stringify({ status: 'ok' }) }));

        await expect(validateHappyServerEndpoint('https://example.com', fetchImpl as unknown as typeof fetch))
            .resolves.toEqual({ valid: false, error: 'notValidHappyServer' });
    });

    it('reports server HTTP errors separately', async () => {
        const fetchImpl = vi.fn(async () => mockResponse({ ok: false, body: JSON.stringify({ status: 'error' }) }));

        await expect(validateHappyServerEndpoint('https://example.com', fetchImpl as unknown as typeof fetch))
            .resolves.toEqual({ valid: false, error: 'serverReturnedError' });
    });
});
