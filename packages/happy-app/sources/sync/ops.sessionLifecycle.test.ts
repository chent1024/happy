import { beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPC, sessionRPC, request, emitWithAck, refreshSessions, storageState, encryptMetadata, decryptMetadata, getSessionEncryption, applySessions } = vi.hoisted(() => ({
    machineRPC: vi.fn(),
    sessionRPC: vi.fn(),
    request: vi.fn(),
    emitWithAck: vi.fn(),
    refreshSessions: vi.fn(),
    storageState: {
        sessions: {} as Record<string, any>,
        machines: {} as Record<string, any>,
        settings: {},
        applySessions: vi.fn(),
    },
    encryptMetadata: vi.fn(),
    decryptMetadata: vi.fn(),
    getSessionEncryption: vi.fn(),
    applySessions: vi.fn(),
}));

vi.mock('./apiSocket', () => ({
    apiSocket: { machineRPC, sessionRPC, request, emitWithAck },
}));

vi.mock('./sync', () => ({
    sync: {
        refreshSessions,
        encryption: {
            getSessionEncryption,
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

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    AppState: { currentState: 'active' },
}));

describe('session lifecycle ops', () => {
    beforeEach(() => {
        vi.stubGlobal('__DEV__', false);
        machineRPC.mockReset();
        sessionRPC.mockReset();
        request.mockReset();
        emitWithAck.mockReset();
        refreshSessions.mockReset();
        encryptMetadata.mockReset();
        decryptMetadata.mockReset();
        getSessionEncryption.mockReset();
        applySessions.mockReset();
        storageState.sessions = {};
        storageState.machines = {};
        storageState.settings = {};
        storageState.applySessions = applySessions;
        encryptMetadata.mockResolvedValue('encrypted-archived-metadata');
        decryptMetadata.mockResolvedValue(null);
        getSessionEncryption.mockReturnValue({
            encryptMetadata,
            decryptMetadata,
        });
    });

    it('restarts a session through the machine daemon RPC', async () => {
        machineRPC.mockResolvedValue({ type: 'resumed', sessionId: 'session-1' });

        const { machineRestartSession } = await import('./ops');
        const result = await machineRestartSession({
            machineId: 'machine-1',
            sessionId: 'session-1',
            model: 'gpt-5.5',
            permissionMode: 'yolo',
        });

        expect(result).toEqual({ type: 'resumed', sessionId: 'session-1' });
        expect(machineRPC).toHaveBeenCalledWith(
            'machine-1',
            'restart-happy-session',
            {
                sessionId: 'session-1',
                model: 'gpt-5.5',
                permissionMode: 'yolo',
                reason: 'manual-restart',
            },
        );
    });

    it('times out permission responses instead of leaving permission buttons loading forever', async () => {
        vi.useFakeTimers();
        sessionRPC.mockReturnValue(new Promise(() => {}));

        try {
            const { sessionAllow } = await import('./ops');
            const result = sessionAllow('session-1', 'permission-1');
            const assertion = expect(result).rejects.toThrow('Permission response timed out');

            await vi.advanceTimersByTimeAsync(10_000);

            await assertion;
            expect(sessionRPC).toHaveBeenCalledWith('session-1', 'permission', {
                id: 'permission-1',
                approved: true,
                mode: undefined,
                allowTools: undefined,
                decision: undefined,
                updatedInput: undefined,
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops a session process through both session and daemon paths before archiving', async () => {
        sessionRPC.mockResolvedValue({ success: true, message: 'killed' });
        machineRPC.mockResolvedValue({ message: 'stopped' });
        request.mockResolvedValue({ ok: true });

        const { sessionArchiveWithStop } = await import('./ops');
        const result = await sessionArchiveWithStop({
            sessionId: 'session-1',
            machineId: 'machine-1',
        });

        expect(result).toEqual({ success: true });
        expect(sessionRPC).toHaveBeenCalledWith('session-1', 'killSession', {});
        expect(machineRPC).toHaveBeenCalledWith('machine-1', 'stop-session', { sessionId: 'session-1' });
        expect(request).toHaveBeenCalledWith('/v1/sessions/session-1/archive', { method: 'POST' });
        expect(refreshSessions).toHaveBeenCalledTimes(1);
    });

    it('marks imported Codex sessions archived in metadata before refreshing', async () => {
        storageState.sessions = {
            'session-1': {
                id: 'session-1',
                seq: 1,
                createdAt: 1000,
                updatedAt: 1000,
                active: false,
                activeAt: 1000,
                metadata: {
                    path: '/tmp/project',
                    host: 'codex.app',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    lifecycleState: 'imported',
                    codexThreadId: 'thread-1',
                },
                metadataVersion: 2,
                agentState: null,
                agentStateVersion: 0,
                thinking: false,
                thinkingAt: 0,
                presence: 1000,
            },
        };
        sessionRPC.mockResolvedValue({ success: false, message: 'already stopped' });
        request.mockResolvedValue({ ok: true });
        emitWithAck.mockResolvedValue({
            result: 'success',
            version: 3,
            metadata: 'encrypted-archived-metadata',
        });

        const { sessionArchiveWithStop } = await import('./ops');
        const result = await sessionArchiveWithStop({
            sessionId: 'session-1',
            machineId: 'machine-1',
        });

        expect(result).toEqual({ success: true });
        expect(encryptMetadata).toHaveBeenCalledWith(expect.objectContaining({
            lifecycleState: 'archived',
            archivedBy: 'user',
            archiveReason: 'manual-archive',
            codexThreadId: 'thread-1',
        }));
        expect(emitWithAck).toHaveBeenCalledWith('update-metadata', {
            sid: 'session-1',
            metadata: 'encrypted-archived-metadata',
            expectedVersion: 2,
        });
        expect(applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'session-1',
                metadataVersion: 3,
                metadata: expect.objectContaining({
                    lifecycleState: 'archived',
                    archivedBy: 'user',
                    archiveReason: 'manual-archive',
                }),
            }),
        ]);
        expect(refreshSessions).toHaveBeenCalledTimes(1);
    });

    it('archives imported Codex sessions without trying to stop a missing worker', async () => {
        storageState.sessions = {
            'session-1': {
                id: 'session-1',
                seq: 1,
                createdAt: 1000,
                updatedAt: 1000,
                active: false,
                activeAt: 1000,
                metadata: {
                    path: '/tmp/project',
                    host: 'codex.app',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    lifecycleState: 'imported',
                    codexThreadId: 'thread-1',
                },
                metadataVersion: 2,
                agentState: null,
                agentStateVersion: 0,
                thinking: false,
                thinkingAt: 0,
                presence: 1000,
            },
        };
        request.mockResolvedValue({ ok: true });
        emitWithAck.mockResolvedValue({
            result: 'success',
            version: 3,
            metadata: 'encrypted-archived-metadata',
        });

        const { sessionArchiveWithStop } = await import('./ops');
        const result = await sessionArchiveWithStop({
            sessionId: 'session-1',
            machineId: 'machine-1',
            requireStop: true,
        });

        expect(result).toEqual({ success: true });
        expect(sessionRPC).not.toHaveBeenCalled();
        expect(machineRPC).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledWith('/v1/sessions/session-1/archive', { method: 'POST' });
        expect(emitWithAck).toHaveBeenCalledWith('update-metadata', expect.objectContaining({
            sid: 'session-1',
            expectedVersion: 2,
        }));
    });

    it('refreshes sessions before archiving imported Codex metadata when encryption is not initialized', async () => {
        storageState.sessions = {
            'session-1': {
                id: 'session-1',
                seq: 1,
                createdAt: 1000,
                updatedAt: 1000,
                active: false,
                activeAt: 1000,
                metadata: {
                    path: '/tmp/project',
                    host: 'codex.app',
                    machineId: 'machine-1',
                    flavor: 'codex',
                    lifecycleState: 'imported',
                    codexThreadId: 'thread-1',
                },
                metadataVersion: 2,
                agentState: null,
                agentStateVersion: 0,
                thinking: false,
                thinkingAt: 0,
                presence: 1000,
            },
        };
        getSessionEncryption
            .mockReturnValueOnce(null)
            .mockReturnValue({
                encryptMetadata,
                decryptMetadata,
            });
        sessionRPC.mockResolvedValue({ success: false, message: 'already stopped' });
        request.mockResolvedValue({ ok: true });
        emitWithAck.mockResolvedValue({
            result: 'success',
            version: 3,
            metadata: 'encrypted-archived-metadata',
        });

        const { sessionArchiveWithStop } = await import('./ops');
        const result = await sessionArchiveWithStop({
            sessionId: 'session-1',
            machineId: 'machine-1',
        });

        expect(result).toEqual({ success: true });
        expect(refreshSessions).toHaveBeenCalledTimes(2);
        expect(emitWithAck).toHaveBeenCalledWith('update-metadata', expect.objectContaining({
            sid: 'session-1',
            expectedVersion: 2,
        }));
    });

    it('does not archive when the process is still reachable but cannot be stopped', async () => {
        sessionRPC.mockResolvedValue({ success: false, message: 'session refused kill' });
        machineRPC.mockRejectedValue(new Error('daemon stop failed'));

        const { sessionArchiveWithStop } = await import('./ops');
        const result = await sessionArchiveWithStop({
            sessionId: 'session-1',
            machineId: 'machine-1',
            requireStop: true,
        });

        expect(result).toEqual({
            success: false,
            message: 'Failed to stop session before archive: session refused kill; daemon stop failed',
        });
        expect(request).not.toHaveBeenCalled();
    });
});
