import { describe, expect, it } from 'vitest';
import { isImportedCodexSession } from './sessionListVisibility';

describe('session list visibility', () => {
    it('identifies inactive imported Codex threads for project-group display', () => {
        expect(isImportedCodexSession({
            active: false,
            metadata: {
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
            } as any,
        })).toBe(true);
    });

    it('does not treat running or non-imported sessions as imported Codex history', () => {
        expect(isImportedCodexSession({
            active: true,
            metadata: {
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
            } as any,
        })).toBe(false);

        expect(isImportedCodexSession({
            active: false,
            metadata: {
                flavor: 'codex',
                lifecycleState: 'archived',
                codexThreadId: 'thread-1',
            } as any,
        })).toBe(false);

        expect(isImportedCodexSession({
            active: false,
            metadata: {
                flavor: 'claude',
                lifecycleState: 'imported',
            } as any,
        })).toBe(false);
    });

});
