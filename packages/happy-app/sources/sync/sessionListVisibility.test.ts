import { describe, expect, it } from 'vitest';
import { getSessionListSortTime, inheritImportedCodexSessionTitles, isDuplicateImportedCodexSession, isImportedCodexSession, isProjectGroupSession } from './sessionListVisibility';

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

    it('hides imported Codex placeholders once a real Happy session exists for the same thread', () => {
        const imported = {
            id: 'imported',
            active: false,
            metadata: {
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
            } as any,
        };
        const spawned = {
            id: 'spawned',
            active: true,
            metadata: {
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'running',
                codexThreadId: 'thread-1',
            } as any,
        };

        expect(isDuplicateImportedCodexSession(imported, { imported, spawned })).toBe(true);
        expect(isDuplicateImportedCodexSession(spawned, { imported, spawned })).toBe(false);
    });

    it('hides imported Codex placeholders when a resumed Happy session points at them as parent', () => {
        const imported = {
            id: 'imported',
            active: false,
            metadata: {
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
            } as any,
        };
        const spawned = {
            id: 'spawned',
            active: true,
            metadata: {
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'running',
                parentSessionId: 'imported',
            } as any,
        };

        expect(isDuplicateImportedCodexSession(imported, { imported, spawned })).toBe(true);
        expect(isDuplicateImportedCodexSession(spawned, { imported, spawned })).toBe(false);
    });

    it('does not hide imported Codex placeholders because a Claude session shares the same parent id', () => {
        const imported = {
            id: 'imported',
            active: false,
            metadata: {
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
            } as any,
        };
        const claudeChild = {
            id: 'claude-child',
            active: true,
            metadata: {
                machineId: 'machine-1',
                flavor: 'claude',
                lifecycleState: 'running',
                parentSessionId: 'imported',
            } as any,
        };

        expect(isDuplicateImportedCodexSession(imported, { imported, claudeChild })).toBe(false);
        expect(isDuplicateImportedCodexSession(claudeChild, { imported, claudeChild })).toBe(false);
    });

    it('hides failed imported Codex resume children instead of hiding their imported parent', () => {
        const imported = {
            id: 'imported',
            active: false,
            metadata: {
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
            } as any,
        };
        const failedSpawned = {
            id: 'spawned',
            active: false,
            metadata: {
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'running',
                parentSessionId: 'imported',
            } as any,
        };

        expect(isDuplicateImportedCodexSession(imported, { imported, failedSpawned })).toBe(false);
        expect(isDuplicateImportedCodexSession(failedSpawned, { imported, failedSpawned })).toBe(true);
    });

    it('keeps imported Codex placeholders when matching thread belongs to another machine', () => {
        const imported = {
            id: 'imported',
            active: false,
            metadata: {
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
            } as any,
        };
        const otherMachine = {
            id: 'spawned',
            active: true,
            metadata: {
                machineId: 'machine-2',
                flavor: 'codex',
                lifecycleState: 'running',
                codexThreadId: 'thread-1',
            } as any,
        };

        expect(isDuplicateImportedCodexSession(imported, { imported, otherMachine })).toBe(false);
    });

    it('inherits imported Codex titles into resumed Happy sessions by parent id', () => {
        const imported = {
            id: 'imported',
            active: false,
            metadata: {
                path: '/tmp/project',
                host: 'mac',
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
                summary: { text: 'Fix Happy session restart error', updatedAt: 1700000000000 },
            },
        } as any;
        const spawned = {
            id: 'spawned',
            active: true,
            metadata: {
                path: '/tmp/project',
                host: 'mac',
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'running',
                parentSessionId: 'imported',
            },
        } as any;

        const sessions = inheritImportedCodexSessionTitles({ imported, spawned });

        expect(sessions.spawned.metadata!.summary).toEqual({ text: 'Fix Happy session restart error', updatedAt: 1700000000000 });
    });

    it('does not inherit imported Codex titles into non-Codex children with the same parent id', () => {
        const imported = {
            id: 'imported',
            active: false,
            metadata: {
                path: '/tmp/project',
                host: 'mac',
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
                summary: { text: 'Fix Happy session restart error', updatedAt: 1700000000000 },
            },
        } as any;
        const claudeChild = {
            id: 'claude-child',
            active: true,
            metadata: {
                path: '/tmp/project',
                host: 'mac',
                machineId: 'machine-1',
                flavor: 'claude',
                lifecycleState: 'running',
                parentSessionId: 'imported',
            },
        } as any;

        const sessions = inheritImportedCodexSessionTitles({ imported, claudeChild });

        expect(sessions.claudeChild.metadata!.summary).toBeUndefined();
    });

    it('inherits imported Codex titles into resumed Happy sessions by thread id', () => {
        const imported = {
            id: 'imported',
            active: false,
            metadata: {
                path: '/tmp/project',
                host: 'mac',
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-1',
                summary: { text: 'Fix Happy session restart error', updatedAt: 1700000000000 },
            },
        } as any;
        const spawned = {
            id: 'spawned',
            active: true,
            metadata: {
                path: '/tmp/project',
                host: 'mac',
                machineId: 'machine-1',
                flavor: 'codex',
                lifecycleState: 'running',
                codexThreadId: 'thread-1',
            },
        } as any;

        const sessions = inheritImportedCodexSessionTitles({ imported, spawned });

        expect(sessions.spawned.metadata!.summary).toEqual({ text: 'Fix Happy session restart error', updatedAt: 1700000000000 });
    });

});
