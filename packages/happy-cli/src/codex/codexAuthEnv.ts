import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export const OPENAI_ENV_AUTH_KEYS = [
    'OPENAI_API_KEY',
    'OPENAI_ORG_ID',
    'OPENAI_PROJECT_ID',
] as const;

function getCodexHome(env: Record<string, string>): string {
    return env.CODEX_HOME || join(homedir(), '.codex');
}

function isCodexChatGptAuthFile(authPath: string): boolean {
    if (!existsSync(authPath)) {
        return false;
    }

    try {
        const auth = JSON.parse(readFileSync(authPath, 'utf-8')) as { auth_mode?: unknown };
        return typeof auth.auth_mode === 'string' && auth.auth_mode.toLowerCase() === 'chatgpt';
    } catch {
        return false;
    }
}

function getActiveCodexProfileAuthPath(codexHome: string): string | null {
    const profilesPath = join(codexHome, 'auth-profiles.json');
    if (!existsSync(profilesPath)) {
        return null;
    }

    try {
        const profiles = JSON.parse(readFileSync(profilesPath, 'utf-8')) as {
            activeProfileId?: unknown;
            profiles?: Record<string, { authFilePath?: unknown }>;
        };
        if (typeof profiles.activeProfileId !== 'string') {
            return null;
        }
        const activeProfile = profiles.profiles?.[profiles.activeProfileId];
        if (typeof activeProfile?.authFilePath !== 'string') {
            return null;
        }
        return isAbsolute(activeProfile.authFilePath)
            ? activeProfile.authFilePath
            : join(codexHome, activeProfile.authFilePath);
    } catch {
        return null;
    }
}

export function hasLocalCodexChatGptAuth(env: Record<string, string>): boolean {
    const codexHome = getCodexHome(env);
    const authPaths = [
        join(codexHome, 'auth.json'),
        getActiveCodexProfileAuthPath(codexHome),
    ].filter((path): path is string => path !== null);

    return authPaths.some(isCodexChatGptAuthFile);
}

export function stripStaleOpenAiEnvForCodexAuth(env: Record<string, string>): Record<string, string> {
    if (!hasLocalCodexChatGptAuth(env)) {
        return env;
    }

    for (const key of OPENAI_ENV_AUTH_KEYS) {
        delete env[key];
    }
    return env;
}
