import { beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPC, sessionRPC, request, refreshSessions } = vi.hoisted(() => ({
    machineRPC: vi.fn(),
    sessionRPC: vi.fn(),
    request: vi.fn(),
    refreshSessions: vi.fn(),
}));

vi.mock('./apiSocket', () => ({
    apiSocket: { machineRPC, sessionRPC, request },
}));

vi.mock('./sync', () => ({
    sync: {
        refreshSessions,
    },
}));

vi.mock('./storage', () => ({
    storage: {
        getState: () => ({
            sessions: {},
            machines: {},
            settings: {},
        }),
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
        refreshSessions.mockReset();
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
