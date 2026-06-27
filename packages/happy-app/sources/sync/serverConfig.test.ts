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

import { getServerUrl, setServerUrl } from './serverConfig';

describe('serverConfig', () => {
    beforeEach(() => {
        mmkvStore.clear();
    });

    it('normalizes a saved server URL so API path joins do not produce a double slash', () => {
        setServerUrl('https://chent.taile37c91.ts.net/');

        expect(getServerUrl()).toBe('https://chent.taile37c91.ts.net');
        expect(`${getServerUrl()}/v1/auth`).toBe('https://chent.taile37c91.ts.net/v1/auth');
    });
});
