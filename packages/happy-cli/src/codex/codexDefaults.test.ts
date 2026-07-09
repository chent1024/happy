import { describe, expect, it } from 'vitest';

import { DEFAULT_CODEX_EFFORT } from './codexDefaults';

describe('Codex defaults', () => {
    it('uses high reasoning effort by default', () => {
        expect(DEFAULT_CODEX_EFFORT).toBe('high');
    });
});
