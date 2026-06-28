import { describe, expect, it } from 'vitest';

import { buildCodexSessionTag } from './codexSessionTag';

describe('buildCodexSessionTag', () => {
    it('uses a stable tag for resumed Codex threads', () => {
        expect(buildCodexSessionTag(
            'machine-1',
            '019eeeae-7b66-7922-9eb5-263663b7a34c',
            'random-session-tag',
        )).toBe('codex:machine-1:019eeeae-7b66-7922-9eb5-263663b7a34c');
    });

    it('uses the fallback tag for new Codex sessions', () => {
        expect(buildCodexSessionTag('machine-1', null, 'random-session-tag')).toBe('random-session-tag');
        expect(buildCodexSessionTag('machine-1', undefined, 'random-session-tag')).toBe('random-session-tag');
    });

    it('uses the fallback tag for child sessions resumed from imported placeholders', () => {
        expect(buildCodexSessionTag(
            'machine-1',
            '019eeeae-7b66-7922-9eb5-263663b7a34c',
            'random-session-tag',
            { parentSessionId: 'imported-session-1' },
        )).toBe('random-session-tag');
    });
});
