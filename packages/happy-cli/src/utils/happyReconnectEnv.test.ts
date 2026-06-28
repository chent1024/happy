import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createHappyChildEnv, createHappyTmuxChildEnv, HAPPY_RECONNECT_ENV_KEYS } from './happyReconnectEnv';

describe('createHappyChildEnv', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removes stale Happy reconnect variables while preserving ordinary env vars', () => {
    expect(createHappyChildEnv({
      PATH: '/usr/bin',
      HAPPY_HOME_DIR: '/tmp/happy',
      HAPPY_RECONNECT_SESSION_ID: 'old-session',
      HAPPY_RECONNECT_ENCRYPTION_KEY: 'old-key',
      HAPPY_RECONNECT_FUTURE_FIELD: 'old-value',
      UNDEFINED_VALUE: undefined,
    })).toEqual({
      PATH: '/usr/bin',
      HAPPY_HOME_DIR: '/tmp/happy',
    });
  });

  it('removes stale OpenAI API key env when local Codex auth uses ChatGPT OAuth', () => {
    const codexHome = mkdtempSync(join(tmpdir(), 'happy-codex-home-'));
    tempDirs.push(codexHome);
    writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
    }));

    expect(createHappyChildEnv({
      CODEX_HOME: codexHome,
      OPENAI_API_KEY: 'old-key',
      OPENAI_ORG_ID: 'old-org',
      OPENAI_PROJECT_ID: 'old-project',
      PATH: '/usr/bin',
    })).toEqual({
      CODEX_HOME: codexHome,
      PATH: '/usr/bin',
    });
  });

  it('keeps OpenAI API key env when Codex auth is not ChatGPT OAuth', () => {
    const codexHome = mkdtempSync(join(tmpdir(), 'happy-codex-home-'));
    tempDirs.push(codexHome);
    writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({
      auth_mode: 'api_key',
      OPENAI_API_KEY: 'local-key',
    }));

    expect(createHappyChildEnv({
      CODEX_HOME: codexHome,
      OPENAI_API_KEY: 'env-key',
      PATH: '/usr/bin',
    })).toEqual({
      CODEX_HOME: codexHome,
      OPENAI_API_KEY: 'env-key',
      PATH: '/usr/bin',
    });
  });

  it('neutralizes known reconnect variables for tmux windows', () => {
    const env = createHappyTmuxChildEnv({
      PATH: '/usr/bin',
      HAPPY_RECONNECT_SESSION_ID: 'old-session',
      HAPPY_RECONNECT_ENCRYPTION_KEY: 'old-key',
      HAPPY_RECONNECT_FUTURE_FIELD: 'old-value',
    });

    expect(env.PATH).toBe('/usr/bin');
    expect(env).not.toHaveProperty('HAPPY_RECONNECT_FUTURE_FIELD');
    for (const key of HAPPY_RECONNECT_ENV_KEYS) {
      expect(env[key]).toBe('');
    }
  });
});
