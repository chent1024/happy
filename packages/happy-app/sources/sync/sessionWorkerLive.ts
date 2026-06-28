import { apiSocket } from './apiSocket';
import { resolveMessageModeMeta } from './messageMeta';
import { storage } from './storage';
import type { Session } from './storageTypes';

export type EnsureSessionLiveResult =
    | {
        type: 'running';
        sessionId: string;
        workerState: 'running' | 'stale-version';
        pid?: number;
        startedVersion?: string;
        currentVersion?: string;
    }
    | {
        type: 'resumed';
        sessionId: string;
    }
    | {
        type: 'not-resumable';
        sessionId: string;
        workerState: string;
        reason: string;
        detail?: string;
    }
    | {
        type: 'error';
        sessionId: string;
        errorMessage: string;
    };

export type EnsureSessionLiveOptions = {
    machineId: string;
    sessionId: string;
    model?: string;
    permissionMode?: string;
    reason?: string;
};

export type CodexRuntimeJournalEntry = {
    seq: number;
    createdAt: number;
    kind: 'lifecycle' | 'event';
    threadId: string | null;
    turnId: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
};

export type CodexRuntimeStatus = {
    sessionId: string;
    pid: number | null;
    threadId: string | null;
    path: string | null;
    active: boolean;
    stopped: boolean;
    createdAt: number;
    updatedAt: number;
};

export type CodexRuntimeStatusResult = {
    type: 'success';
    session: CodexRuntimeStatus | null;
};

export type CodexRuntimeReplayResult = {
    type: 'success';
    entries: CodexRuntimeJournalEntry[];
};

type SessionWorkerLiveState =
    | {
        status: 'running' | 'resumed';
        observedAt: number;
        workerState?: string;
    }
    | {
        status: 'not-resumable' | 'error';
        observedAt: number;
        reason: string;
        detail?: string;
        workerState?: string;
    };

function errorMessageFromUnknown(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function buildLiveState(result: EnsureSessionLiveResult): SessionWorkerLiveState {
    const observedAt = Date.now();
    switch (result.type) {
        case 'running':
            return {
                status: 'running',
                observedAt,
                workerState: result.workerState,
            };
        case 'resumed':
            return {
                status: 'resumed',
                observedAt,
            };
        case 'not-resumable':
            return {
                status: 'not-resumable',
                observedAt,
                reason: result.reason,
                ...(result.detail ? { detail: result.detail } : {}),
                ...(result.workerState ? { workerState: result.workerState } : {}),
            };
        case 'error':
            return {
                status: 'error',
                observedAt,
                reason: 'rpc-error',
                detail: result.errorMessage,
            };
    }
}

function applySessionWorkerLiveState(sessionId: string, result: EnsureSessionLiveResult): void {
    const currentSession = storage.getState().sessions[sessionId];
    if (!currentSession) {
        return;
    }

    const liveState = buildLiveState(result);
    const isUnavailable = liveState.status === 'not-resumable' || liveState.status === 'error';
    storage.getState().applySessions([{
        ...currentSession,
        ...(isUnavailable
            ? {
                active: false,
                thinking: false,
                thinkingAt: 0,
                presence: currentSession.activeAt,
            }
            : {}),
        agentState: {
            ...(currentSession.agentState ?? {}),
            sessionWorkerLive: liveState,
        },
    }]);
}

export async function machineEnsureSessionLive(options: EnsureSessionLiveOptions): Promise<EnsureSessionLiveResult> {
    const { machineId, sessionId, model, permissionMode, reason } = options;
    try {
        return await apiSocket.machineRPC<EnsureSessionLiveResult, {
            sessionId: string;
            model?: string;
            permissionMode?: string;
            reason?: string;
        }>(
            machineId,
            'ensure-happy-session-live',
            {
                sessionId,
                ...(model !== undefined ? { model } : {}),
                ...(permissionMode !== undefined ? { permissionMode } : {}),
                ...(reason !== undefined ? { reason } : {}),
            },
        );
    } catch (error) {
        return {
            type: 'error',
            sessionId,
            errorMessage: errorMessageFromUnknown(error),
        };
    }
}

export async function machineReadCodexRuntimeStatus(options: {
    machineId: string;
    sessionId: string;
}): Promise<CodexRuntimeStatusResult> {
    return await apiSocket.machineRPC<CodexRuntimeStatusResult, { sessionId: string }>(
        options.machineId,
        'codex-runtime-status',
        { sessionId: options.sessionId },
    );
}

export async function machineReplayCodexRuntime(options: {
    machineId: string;
    sessionId: string;
    afterSeq?: number;
    limit?: number;
}): Promise<CodexRuntimeReplayResult> {
    const { machineId, sessionId, afterSeq, limit } = options;
    return await apiSocket.machineRPC<CodexRuntimeReplayResult, {
        sessionId: string;
        afterSeq?: number;
        limit?: number;
    }>(
        machineId,
        'codex-runtime-replay',
        {
            sessionId,
            ...(afterSeq !== undefined ? { afterSeq } : {}),
            ...(limit !== undefined ? { limit } : {}),
        },
    );
}

export function triggerSessionWorkerEnsureLiveForSend(session: Session): void {
    const machineId = session.metadata?.machineId;
    if (!machineId) {
        return;
    }

    const modeMeta = resolveMessageModeMeta(session, storage.getState().settings);
    void machineEnsureSessionLive({
        machineId,
        sessionId: session.id,
        model: modeMeta.model ?? undefined,
        permissionMode: modeMeta.permissionMode,
        reason: 'send-message',
    }).then((result) => {
        applySessionWorkerLiveState(session.id, result);
    });
}
