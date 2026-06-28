import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateLocalCodexCredentials } from './connect';

describe('connect local credentials', () => {
    it('writes Codex OAuth credentials in the local Codex auth file', () => {
        const previousCodexHome = process.env.CODEX_HOME;
        const codexHome = mkdtempSync(join(tmpdir(), 'happy-connect-codex-'));
        process.env.CODEX_HOME = codexHome;
        writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({
            auth_mode: 'api_key',
            custom: 'preserved',
        }));

        try {
            updateLocalCodexCredentials({
                id_token: 'id-token',
                access_token: 'access-token',
                refresh_token: 'refresh-token',
                account_id: 'account-id',
            });

            const auth = JSON.parse(readFileSync(join(codexHome, 'auth.json'), 'utf-8'));
            expect(auth).toMatchObject({
                auth_mode: 'chatgpt',
                OPENAI_API_KEY: null,
                custom: 'preserved',
                tokens: {
                    id_token: 'id-token',
                    access_token: 'access-token',
                    refresh_token: 'refresh-token',
                    account_id: 'account-id',
                },
            });
            expect(typeof auth.last_refresh).toBe('string');
        } finally {
            if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
            else process.env.CODEX_HOME = previousCodexHome;
            rmSync(codexHome, { recursive: true, force: true });
        }
    });

    it('also updates the active Codex auth profile file when profiles are enabled', () => {
        const previousCodexHome = process.env.CODEX_HOME;
        const codexHome = mkdtempSync(join(tmpdir(), 'happy-connect-codex-'));
        const profileAuthPath = join(codexHome, 'profile-auth.json');
        process.env.CODEX_HOME = codexHome;
        writeFileSync(join(codexHome, 'auth-profiles.json'), JSON.stringify({
            activeProfileId: 'profile-1',
            profiles: {
                'profile-1': {
                    id: 'profile-1',
                    authFilePath: profileAuthPath,
                },
            },
        }));

        try {
            updateLocalCodexCredentials({
                id_token: 'id-token',
                access_token: 'access-token',
                refresh_token: 'refresh-token',
                account_id: 'account-id',
            });

            for (const authPath of [join(codexHome, 'auth.json'), profileAuthPath]) {
                const auth = JSON.parse(readFileSync(authPath, 'utf-8'));
                expect(auth).toMatchObject({
                    auth_mode: 'chatgpt',
                    OPENAI_API_KEY: null,
                    tokens: {
                        id_token: 'id-token',
                        access_token: 'access-token',
                        refresh_token: 'refresh-token',
                        account_id: 'account-id',
                    },
                });
            }
        } finally {
            if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
            else process.env.CODEX_HOME = previousCodexHome;
            rmSync(codexHome, { recursive: true, force: true });
        }
    });
});
