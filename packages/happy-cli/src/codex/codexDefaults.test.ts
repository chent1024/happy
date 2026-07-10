import { describe, expect, it } from 'vitest';

import { DEFAULT_CODEX_EFFORT, DEFAULT_CODEX_MODEL } from './codexDefaults';

describe('Codex defaults', () => {
    it('uses GPT-5.6 Sol by default', () => {
        expect(DEFAULT_CODEX_MODEL).toBe('gpt-5.6-sol');
    });

    it('uses high reasoning effort by default', () => {
        expect(DEFAULT_CODEX_EFFORT).toBe('high');
    });
});
