import type { Session } from '@/sync/storageTypes';

export type ResumeNavigationAction = 'none' | 'replace' | 'push';

function sessionPath(sessionId: string): string {
    return `/session/${encodeURIComponent(sessionId)}`;
}

export function getResumeNavigationAction(options: {
    pathname: string | null | undefined;
    currentSessionId: string;
    resumedSessionId: string;
}): ResumeNavigationAction {
    const targetPath = sessionPath(options.resumedSessionId);
    const pathname = options.pathname ?? '';

    if (options.currentSessionId === options.resumedSessionId) {
        if (pathname === targetPath) {
            return 'none';
        }
        if (pathname.startsWith(`${targetPath}/`)) {
            return 'replace';
        }
    }

    return 'push';
}

export function getResumedSessionPath(sessionId: string): string {
    return sessionPath(sessionId);
}

export function buildOptimisticResumedSession(session: Session, activeAt = Date.now()): Session {
    return {
        ...session,
        active: true,
        activeAt,
        presence: 'online',
        thinking: false,
        thinkingAt: activeAt,
        metadata: session.metadata ? {
            ...session.metadata,
            lifecycleState: 'running',
            archivedBy: undefined,
        } : session.metadata,
    };
}

export function shouldReapplyOptimisticResume(session: Session | null | undefined, resumeStartedAt: number): boolean {
    if (!session || session.active) {
        return false;
    }
    return session.activeAt <= resumeStartedAt;
}
