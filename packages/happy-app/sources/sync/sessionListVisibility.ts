import type { Session } from './storageTypes';

export function isImportedCodexSession(session: Pick<Session, 'active' | 'metadata'>): boolean {
    return !session.active
        && session.metadata?.flavor === 'codex'
        && session.metadata.lifecycleState === 'imported'
        && typeof session.metadata.codexThreadId === 'string'
        && session.metadata.codexThreadId.length > 0;
}

export function isProjectGroupSession(session: Pick<Session, 'active' | 'metadata'>): boolean {
    return session.active || isImportedCodexSession(session);
}

export function getSessionListSortTime(
    session: Pick<Session, 'active' | 'metadata' | 'createdAt' | 'updatedAt'>,
    sortByActivity: boolean,
): number {
    if (sortByActivity || isImportedCodexSession(session)) {
        return session.updatedAt;
    }

    return session.createdAt;
}
