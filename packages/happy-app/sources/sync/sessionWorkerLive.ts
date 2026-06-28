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
