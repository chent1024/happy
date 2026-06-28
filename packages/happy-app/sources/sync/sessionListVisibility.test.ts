import { describe, expect, it } from 'vitest';
import { getSessionListSortTime, isImportedCodexSession, isProjectGroupSession } from './sessionListVisibility';

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

    it('keeps imported Codex threads in the project group even when inactive', () => {
        expect(isProjectGroupSession({
            active: false,
            metadata: {
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
            } as any,
        })).toBe(true);

        expect(isProjectGroupSession({
            active: false,
            metadata: {
                flavor: 'claude',
                lifecycleState: 'archived',
            } as any,
        })).toBe(false);
    });

    it('sorts imported Codex threads by updatedAt under the default creation-time setting', () => {
        const importedCodex = {
            active: false,
            createdAt: 1,
            updatedAt: 10,
            metadata: {
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
            } as any,
        };
        const regularSession = {
            active: false,
            createdAt: 2,
            updatedAt: 20,
            metadata: null,
        };

        expect(getSessionListSortTime(importedCodex, false)).toBe(10);
        expect(getSessionListSortTime(regularSession, false)).toBe(2);
        expect(getSessionListSortTime(regularSession, true)).toBe(20);
    });

});
