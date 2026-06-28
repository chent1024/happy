import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPC, applySessions, storageState } = vi.hoisted(() => ({
    machineRPC: vi.fn(),
    applySessions: vi.fn(),
    storageState: {
        sessions: {} as Record<string, any>,
        settings: {},
        applySessions: vi.fn(),
    },
}));

vi.mock('./apiSocket', () => ({
    apiSocket: { machineRPC },
}));

vi.mock('./storage', () => ({
    storage: {
        getState: () => storageState,
    },
}));

function session(overrides: Record<string, any> = {}) {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            machineId: 'machine-1',
            flavor: 'codex',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
        permissionMode: 'yolo',
        modelMode: 'gpt-5.5',
        effortLevel: null,
        ...overrides,
    } as any;
}

describe('session worker live helpers', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(1700000000000));
        machineRPC.mockReset();
        applySessions.mockReset();
        storageState.applySessions = applySessions;
        storageState.sessions = {};
        storageState.settings = {};
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls the ensure-live machine RPC with send resume options', async () => {
        machineRPC.mockResolvedValue({ type: 'resumed', sessionId: 'session-1' });

        const { machineEnsureSessionLive } = await import('./sessionWorkerLive');
        const result = await machineEnsureSessionLive({
            machineId: 'machine-1',
            sessionId: 'session-1',
            model: 'gpt-5.5',
            permissionMode: 'yolo',
            reason: 'send-message',
        });

        expect(result).toEqual({ type: 'resumed', sessionId: 'session-1' });
        expect(machineRPC).toHaveBeenCalledWith(
            'machine-1',
            'ensure-happy-session-live',
            {
                sessionId: 'session-1',
                model: 'gpt-5.5',
                permissionMode: 'yolo',
                reason: 'send-message',
            },
        );
    });

    it('calls Codex runtime status and replay machine RPC helpers', async () => {
        machineRPC
            .mockResolvedValueOnce({
                type: 'success',
                session: {
                    sessionId: 'session-1',
                    pid: 123,
                    threadId: 'thread-1',
                    path: '/tmp/project',
                    active: true,
                    stopped: false,
                    createdAt: 1,
                    updatedAt: 2,
                },
            })
            .mockResolvedValueOnce({
                type: 'success',
                entries: [{
                    seq: 2,
                    createdAt: 3,
                    kind: 'lifecycle',
                    threadId: 'thread-1',
                    turnId: null,
                    eventType: 'daemon-runtime-resume-result',
                }],
            });

        const { machineReadCodexRuntimeStatus, machineReplayCodexRuntime } = await import('./sessionWorkerLive');

        await expect(machineReadCodexRuntimeStatus({
            machineId: 'machine-1',
            sessionId: 'session-1',
        })).resolves.toEqual(expect.objectContaining({
            type: 'success',
            session: expect.objectContaining({ threadId: 'thread-1' }),
        }));
        await expect(machineReplayCodexRuntime({
            machineId: 'machine-1',
            sessionId: 'session-1',
            afterSeq: 1,
            limit: 20,
        })).resolves.toEqual(expect.objectContaining({
            type: 'success',
            entries: [expect.objectContaining({ eventType: 'daemon-runtime-resume-result' })],
        }));

        expect(machineRPC).toHaveBeenNthCalledWith(
            1,
            'machine-1',
            'codex-runtime-status',
            { sessionId: 'session-1' },
        );
        expect(machineRPC).toHaveBeenNthCalledWith(
            2,
            'machine-1',
            'codex-runtime-replay',
            { sessionId: 'session-1', afterSeq: 1, limit: 20 },
        );
    });

    it('does not block the caller while ensuring a worker is live', async () => {
        let resolveRpc!: (value: any) => void;
        machineRPC.mockReturnValue(new Promise((resolve) => {
            resolveRpc = resolve;
        }));

        const currentSession = session();
        storageState.sessions = { 'session-1': currentSession };

        const { triggerSessionWorkerEnsureLiveForSend } = await import('./sessionWorkerLive');
        const result = triggerSessionWorkerEnsureLiveForSend(currentSession);

        expect(result).toBeUndefined();
        expect(machineRPC).toHaveBeenCalledWith(
            'machine-1',
            'ensure-happy-session-live',
            {
                sessionId: 'session-1',
                model: 'gpt-5.5',
                permissionMode: 'yolo',
                reason: 'send-message',
            },
        );
        expect(applySessions).not.toHaveBeenCalled();

        resolveRpc({ type: 'running', sessionId: 'session-1', workerState: 'running' });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'session-1',
                agentState: {
                    sessionWorkerLive: {
                        status: 'running',
                        observedAt: 1700000000000,
                        workerState: 'running',
                    },
                },
            }),
        ]);
    });

    it('records non-resumable failures in local agent state', async () => {
        machineRPC.mockResolvedValue({
            type: 'not-resumable',
            sessionId: 'session-1',
            workerState: 'exited-not-resumable',
            reason: 'missing-provider-resume-id',
            detail: 'missing codex thread',
        });
        const currentSession = session({
            agentState: { existing: true },
        });
        storageState.sessions = { 'session-1': currentSession };

        const { triggerSessionWorkerEnsureLiveForSend } = await import('./sessionWorkerLive');
        triggerSessionWorkerEnsureLiveForSend(currentSession);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'session-1',
                active: false,
                thinking: false,
                thinkingAt: 0,
                presence: 1,
                agentState: {
                    existing: true,
                    sessionWorkerLive: {
                        status: 'not-resumable',
                        observedAt: 1700000000000,
                        reason: 'missing-provider-resume-id',
                        detail: 'missing codex thread',
                        workerState: 'exited-not-resumable',
                    },
                },
            }),
        ]);
    });
});
