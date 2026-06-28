import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPC, request, refreshSessions, storageState, encrypt, encryptEncryptionKey, applySessions } = vi.hoisted(() => ({
    machineRPC: vi.fn(),
    request: vi.fn(),
    refreshSessions: vi.fn(),
    applySessions: vi.fn(),
    storageState: {
        sessions: {} as Record<string, any>,
        machines: {} as Record<string, any>,
        applySessions: vi.fn(),
    },
    encrypt: vi.fn(),
    encryptEncryptionKey: vi.fn(),
}));

vi.mock('./apiSocket', () => ({
    apiSocket: { machineRPC, request },
}));

vi.mock('./sync', () => ({
    sync: {
        refreshSessions,
        encryption: {
            encryptEncryptionKey,
            openEncryption: vi.fn(async () => ({ encrypt })),
        },
    },
}));

vi.mock('./storage', () => ({
    storage: {
        getState: () => storageState,
    },
}));

vi.mock('expo-crypto', () => ({
    getRandomBytes: (length: number) => new Uint8Array(length).fill(7),
}));

describe('codex fork ops', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(1700000010000));
        machineRPC.mockReset();
        request.mockReset();
        refreshSessions.mockReset();
        applySessions.mockReset();
        encrypt.mockReset();
        encryptEncryptionKey.mockReset();
        storageState.sessions = {};
        storageState.applySessions = applySessions;
        encrypt.mockResolvedValue([new Uint8Array([1, 2, 3])]);
        encryptEncryptionKey.mockResolvedValue(new Uint8Array([4, 5, 6]));
        storageState.machines = {
            'machine-1': {
                metadata: {
                    host: 'macbook',
                    homeDir: '/Users/tester',
                    happyHomeDir: '/Users/tester/.happy',
                },
            },
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('forks a full Codex thread and spawns a Codex session resumed to the new thread', async () => {
        machineRPC.mockImplementation(async (_machineId: string, method: string) => {
            if (method === 'codex-fork-thread') {
                return { type: 'success', newCodexThreadId: 'thread-forked' };
            }
            if (method === 'spawn-happy-session') {
                return { type: 'success', sessionId: 'happy-forked' };
            }
            throw new Error(`unexpected method ${method}`);
        });

        const { forkAndSpawn } = await import('./ops');
        const result = await forkAndSpawn({
            kind: 'codex',
            sessionId: 'happy-source',
            machineId: 'machine-1',
            directory: '/tmp/project',
            codexThreadId: 'thread-source',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'happy-forked' });
        expect(machineRPC).toHaveBeenNthCalledWith(
            1,
            'machine-1',
            'codex-fork-thread',
            { directory: '/tmp/project', codexThreadId: 'thread-source' },
        );
        expect(machineRPC).toHaveBeenNthCalledWith(
            2,
            'machine-1',
            'spawn-happy-session',
            expect.objectContaining({
                agent: 'codex',
                directory: '/tmp/project',
                resumeCodexThreadId: 'thread-forked',
                parentSessionId: 'happy-source',
            }),
        );
        expect(refreshSessions).toHaveBeenCalledTimes(1);
    });

    it('duplicates a Codex thread from a selected user item before spawning', async () => {
        machineRPC.mockImplementation(async (_machineId: string, method: string) => {
            if (method === 'codex-duplicate-thread') {
                return { type: 'success', newCodexThreadId: 'thread-cut' };
            }
            if (method === 'spawn-happy-session') {
                return { type: 'success', sessionId: 'happy-cut' };
            }
            throw new Error(`unexpected method ${method}`);
        });

        const { forkAndSpawn } = await import('./ops');
        const result = await forkAndSpawn({
            kind: 'codex',
            sessionId: 'happy-source',
            machineId: 'machine-1',
            directory: '/tmp/project',
            codexThreadId: 'thread-source',
        }, {
            cutAfterItemId: 'user-item-2',
            forkedFromMessageId: 'message-2',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'happy-cut' });
        expect(machineRPC).toHaveBeenNthCalledWith(
            1,
            'machine-1',
            'codex-duplicate-thread',
            { directory: '/tmp/project', codexThreadId: 'thread-source', cutAfterItemId: 'user-item-2' },
        );
        expect(machineRPC).toHaveBeenNthCalledWith(
            2,
            'machine-1',
            'spawn-happy-session',
            expect.objectContaining({
                agent: 'codex',
                resumeCodexThreadId: 'thread-cut',
                forkedFromMessageId: 'message-2',
            }),
        );
    });

    it('resumes an imported Codex session by spawning a new Happy session from the Codex thread', async () => {
        machineRPC.mockResolvedValue({ type: 'success', sessionId: 'happy-resumed' });
        storageState.sessions = {
            'happy-resumed': {
                id: 'happy-resumed',
                seq: 1,
                createdAt: 1,
                updatedAt: 1,
                active: true,
                activeAt: 1,
                metadata: {
                    machineId: 'machine-1',
                    path: '/tmp/project',
                    flavor: 'codex',
                    codexThreadId: 'thread-created-after-spawn',
                },
                metadataVersion: 0,
                agentState: null,
                agentStateVersion: 0,
                thinking: false,
                thinkingAt: 0,
                presence: 'online',
            },
        };

        const { resumeImportedCodexSession } = await import('./ops');
        const result = await resumeImportedCodexSession({
            id: 'happy-imported',
            updatedAt: 1700000000000,
            metadata: {
                machineId: 'machine-1',
                path: '/tmp/project',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-source',
                name: 'Continue previous work',
                summary: { text: 'Continue previous work', updatedAt: 1699999999000 },
            },
        } as any);

        expect(result).toEqual({ type: 'success', sessionId: 'happy-resumed' });
        expect(machineRPC).toHaveBeenCalledWith(
            'machine-1',
            'spawn-happy-session',
            expect.objectContaining({
                type: 'spawn-in-directory',
                directory: '/tmp/project',
                agent: 'codex',
                approvedNewDirectoryCreation: false,
                resumeCodexThreadId: 'thread-source',
                parentSessionId: 'happy-imported',
            }),
        );
        expect(refreshSessions).toHaveBeenCalledTimes(1);
        expect(applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'happy-resumed',
                metadata: expect.objectContaining({
                    name: 'Continue previous work',
                    summary: { text: 'Continue previous work', updatedAt: 1699999999000 },
                }),
            }),
        ]);
    });

    it('reuses a running Happy session for the same imported Codex thread instead of spawning again', async () => {
        storageState.sessions = {
            'happy-running': {
                id: 'happy-running',
                seq: 3,
                createdAt: 10,
                updatedAt: 200,
                active: true,
                activeAt: 200,
                metadata: {
                    machineId: 'machine-1',
                    path: '/tmp/project',
                    flavor: 'codex',
                    lifecycleState: 'running',
                    codexThreadId: 'thread-source',
                },
                metadataVersion: 1,
                agentState: null,
                agentStateVersion: 0,
                thinking: false,
                thinkingAt: 0,
                presence: 'online',
            },
        };

        const { resumeImportedCodexSession } = await import('./ops');
        const result = await resumeImportedCodexSession({
            id: 'happy-imported',
            updatedAt: 1700000000000,
            metadata: {
                machineId: 'machine-1',
                path: '/tmp/project',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-source',
            },
        } as any);

        expect(result).toEqual({ type: 'success', sessionId: 'happy-running' });
        expect(machineRPC).not.toHaveBeenCalled();
        expect(refreshSessions).not.toHaveBeenCalled();
    });

    it('does not wait for session refresh when resuming an imported Codex session', async () => {
        machineRPC.mockResolvedValue({ type: 'success', sessionId: 'happy-resumed' });
        refreshSessions.mockReturnValue(new Promise(() => {}));

        const { resumeImportedCodexSession } = await import('./ops');
        const result = await resumeImportedCodexSession({
            id: 'happy-imported',
            updatedAt: 1700000000000,
            metadata: {
                machineId: 'machine-1',
                path: '/tmp/project',
                flavor: 'codex',
                lifecycleState: 'imported',
                codexThreadId: 'thread-source',
            },
        } as any);

        expect(result).toEqual({ type: 'success', sessionId: 'happy-resumed' });
        expect(refreshSessions).toHaveBeenCalledTimes(1);
    });

    it('maps Codex thread metadata into an imported Happy session shape', async () => {
        const { buildCodexImportedSessionMetadata } = await import('./ops');

        expect(buildCodexImportedSessionMetadata({
            id: 'thread-1234567890',
            cwd: '/tmp/project',
            preview: 'latest work',
            name: 'Codex display title',
            updatedAt: 1700000000,
            cliVersion: '0.142.2',
        }, 'machine-1', {
            host: 'macbook',
            platform: 'darwin',
            happyCliVersion: 'test',
            happyHomeDir: '/Users/tester/.happy',
            homeDir: '/Users/tester',
        })).toEqual(expect.objectContaining({
            path: '/tmp/project',
            host: 'macbook',
            name: 'Codex display title',
            machineId: 'machine-1',
            homeDir: '/Users/tester',
            happyHomeDir: '/Users/tester/.happy',
            codexThreadId: 'thread-1234567890',
            flavor: 'codex',
            version: '0.142.2',
            lifecycleState: 'imported',
            archivedBy: 'codex-session-sync',
            summary: {
                text: 'Codex display title',
                updatedAt: 1700000000000,
            },
        }));
    });

    it('manually syncs Codex threads and refreshes already imported threads', async () => {
        storageState.sessions = {
            existing: {
                metadata: {
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexThreadId: 'thread-existing',
                },
            },
        };
        machineRPC.mockResolvedValue({
            type: 'success',
            threads: [
                { id: 'thread-existing', cwd: '/tmp/project', preview: 'old', updatedAt: 1700000010 },
                { id: 'thread-new', cwd: '/tmp/project', preview: 'new', updatedAt: 1700000005 },
            ],
            nextCursor: null,
            backwardsCursor: null,
        });
        request.mockImplementation(async (_url: string, init: RequestInit) => {
            const body = JSON.parse(String(init.body));
            const isExisting = body.tag === 'codex:machine-1:thread-existing';
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    session: {
                        id: isExisting ? 'happy-existing' : 'happy-imported',
                        seq: 42,
                        metadataVersion: 0,
                        agentState: null,
                        agentStateVersion: 0,
                        active: false,
                        activeAt: isExisting ? 1700000010000 : 1700000005000,
                        createdAt: isExisting ? 1700000010000 : 1700000005000,
                        updatedAt: isExisting ? 1700000010000 : 1700000005000,
                    },
                }),
            };
        });

        const { syncCodexSessions } = await import('./ops');
        const result = await syncCodexSessions('machine-1');

        expect(result).toEqual({
            type: 'success',
            fetched: 2,
            imported: 1,
            refreshed: 1,
            skipped: 0,
        });
        expect(machineRPC).toHaveBeenCalledWith('machine-1', 'codex-list-threads', {});
        expect(request).toHaveBeenCalledTimes(2);
        expect(request).toHaveBeenCalledWith('/v1/sessions', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }));
        expect(request.mock.calls.map((call) => JSON.parse(call[1].body).tag)).toEqual([
            'codex:machine-1:thread-existing',
            'codex:machine-1:thread-new',
        ]);
        expect(JSON.parse(request.mock.calls[1][1].body)).toEqual(expect.objectContaining({
            tag: 'codex:machine-1:thread-new',
            metadata: expect.any(String),
            agentState: null,
            dataEncryptionKey: expect.any(String),
            active: false,
            updatedAt: 1700000005000,
        }));
        expect(applySessions).toHaveBeenLastCalledWith([
            expect.objectContaining({
                id: 'happy-imported',
                active: false,
                activeAt: 1700000005000,
                createdAt: 1700000005000,
                updatedAt: 1700000005000,
                presence: 1700000005000,
                metadata: expect.objectContaining({
                    flavor: 'codex',
                    codexThreadId: 'thread-new',
                    lifecycleState: 'imported',
                }),
            }),
        ]);
        expect(refreshSessions).toHaveBeenCalledTimes(1);
    });

    it('skips Codex threads older than three days', async () => {
        machineRPC.mockResolvedValue({
            type: 'success',
            threads: [
                { id: 'thread-recent', cwd: '/tmp/project', preview: 'recent', updatedAt: 1700000000000 },
                { id: 'thread-old', cwd: '/tmp/project', preview: 'old', updatedAt: 1700000010000 - 4 * 24 * 60 * 60 * 1000 },
            ],
            nextCursor: null,
            backwardsCursor: null,
        });
        request.mockResolvedValue({ ok: true, status: 200 });

        const { syncCodexSessions } = await import('./ops');
        const result = await syncCodexSessions('machine-1');

        expect(result).toEqual({
            type: 'success',
            fetched: 2,
            imported: 1,
            refreshed: 0,
            skipped: 1,
        });
        expect(request).toHaveBeenCalledTimes(1);
        expect(JSON.parse(request.mock.calls[0][1].body).tag).toBe('codex:machine-1:thread-recent');
    });

    it('refreshes existing imported Codex timestamps without duplicating sessions', async () => {
        storageState.sessions = {
            existing: {
                id: 'happy-existing',
                seq: 7,
                createdAt: 1700,
                updatedAt: 1700,
                active: false,
                activeAt: 1700,
                metadata: {
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexThreadId: 'thread-existing',
                },
                metadataVersion: 0,
                agentState: null,
                agentStateVersion: 0,
                thinking: false,
                thinkingAt: 0,
                presence: 1700,
            },
        };
        machineRPC.mockResolvedValue({
            type: 'success',
            threads: [{ id: 'thread-existing', cwd: '/tmp/project', preview: 'old', updatedAt: 1700000005 }],
            nextCursor: null,
            backwardsCursor: null,
        });
        request.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                session: {
                    id: 'happy-existing',
                    seq: 7,
                    metadataVersion: 0,
                    agentState: null,
                    agentStateVersion: 0,
                    active: false,
                    activeAt: 1700000005000,
                    createdAt: 1700,
                    updatedAt: 1700000005000,
                },
            }),
        });

        const { syncCodexSessions } = await import('./ops');
        const result = await syncCodexSessions('machine-1');

        expect(result).toEqual({
            type: 'success',
            fetched: 1,
            imported: 0,
            refreshed: 1,
            skipped: 0,
        });
        expect(request).toHaveBeenCalledTimes(1);
        expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(expect.objectContaining({
            tag: 'codex:machine-1:thread-existing',
            updatedAt: 1700000005000,
        }));
        expect(applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'happy-existing',
                activeAt: 1700000005000,
                updatedAt: 1700000005000,
                presence: 1700000005000,
            }),
        ]);
        expect(refreshSessions).toHaveBeenCalledTimes(1);
    });

    it('refreshes Codex account rate limits into local session agent state', async () => {
        storageState.sessions = {
            'happy-codex': {
                id: 'happy-codex',
                seq: 1,
                createdAt: 100,
                updatedAt: 100,
                active: true,
                activeAt: 100,
                metadata: {
                    machineId: 'machine-1',
                    flavor: 'codex',
                    codexThreadId: 'thread-1',
                },
                metadataVersion: 0,
                agentState: { existing: true },
                agentStateVersion: 0,
                thinking: false,
                thinkingAt: 0,
                presence: 'online',
            },
        };
        machineRPC.mockResolvedValue({
            type: 'success',
            rateLimits: {
                primary: {
                    usedPercent: 98,
                    remainingPercent: 2,
                    windowDurationMins: 10080,
                    resetsAt: 1700000000,
                },
                secondary: null,
                credits: null,
                rateLimitReachedType: null,
            },
        });

        const { refreshCodexAccountRateLimits } = await import('./ops');
        const result = await refreshCodexAccountRateLimits('happy-codex');

        expect(result).toEqual({ type: 'success', updated: true });
        expect(machineRPC).toHaveBeenCalledWith('machine-1', 'codex-read-account-rate-limits', {});
        expect(applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'happy-codex',
                agentState: expect.objectContaining({
                    existing: true,
                    codexAccountRateLimits: expect.objectContaining({
                        primary: expect.objectContaining({
                            remainingPercent: 2,
                            windowDurationMins: 10080,
                        }),
                    }),
                }),
            }),
        ]);
    });

    it('syncs only the 15 most recently updated Codex threads per project', async () => {
        const projectAThreads = Array.from({ length: 17 }, (_, index) => ({
            id: `project-a-${index + 1}`,
            cwd: '/tmp/project-a',
            preview: `Project A ${index + 1}`,
            updatedAt: 1700000000000 + index,
        }));
        const projectBThreads = [
            { id: 'project-b-older', cwd: '/tmp/project-b', preview: 'Project B older', updatedAt: 1700000000100 },
            { id: 'project-b-newer', cwd: '/tmp/project-b', preview: 'Project B newer', updatedAt: 1700000000200 },
        ];
        machineRPC.mockResolvedValue({
            type: 'success',
            threads: [
                projectAThreads[0],
                projectBThreads[0],
                ...projectAThreads.slice(1),
                projectBThreads[1],
            ],
            nextCursor: null,
            backwardsCursor: null,
        });
        request.mockResolvedValue({ ok: true, status: 200 });

        const { syncCodexSessions } = await import('./ops');
        const result = await syncCodexSessions('machine-1');

        expect(result).toEqual({
            type: 'success',
            fetched: 19,
            imported: 17,
            refreshed: 0,
            skipped: 2,
        });
        const importedTags = request.mock.calls.map((call) => JSON.parse(call[1].body).tag);
        expect(importedTags).toEqual([
            'codex:machine-1:project-b-newer',
            'codex:machine-1:project-b-older',
            'codex:machine-1:project-a-17',
            'codex:machine-1:project-a-16',
            'codex:machine-1:project-a-15',
            'codex:machine-1:project-a-14',
            'codex:machine-1:project-a-13',
            'codex:machine-1:project-a-12',
            'codex:machine-1:project-a-11',
            'codex:machine-1:project-a-10',
            'codex:machine-1:project-a-9',
            'codex:machine-1:project-a-8',
            'codex:machine-1:project-a-7',
            'codex:machine-1:project-a-6',
            'codex:machine-1:project-a-5',
            'codex:machine-1:project-a-4',
            'codex:machine-1:project-a-3',
        ]);
    });

    it('returns a readable Codex sync error when the daemon reports an empty RPC error', async () => {
        machineRPC.mockRejectedValue(new Error(''));

        const { syncCodexSessions } = await import('./ops');
        const result = await syncCodexSessions('machine-1');

        expect(result).toEqual({
            type: 'error',
            errorMessage: 'Failed to list Codex threads',
        });
    });
});
