import type { Session } from './storageTypes';

export function isImportedCodexSession(session: Pick<Session, 'active' | 'metadata'>): boolean {
    return !session.active
        && session.metadata?.flavor === 'codex'
        && session.metadata.lifecycleState === 'imported'
        && typeof session.metadata.codexThreadId === 'string'
        && session.metadata.codexThreadId.length > 0;
}

function isNonProjectImportedCodexSession(session: Pick<Session, 'active' | 'metadata'>): boolean {
    return isImportedCodexSession(session) && session.metadata?.codexProject === false;
}

function codexThreadKey(session: Pick<Session, 'metadata'>): string | null {
    const machineId = session.metadata?.machineId;
    const threadId = session.metadata?.codexThreadId;
    if (!machineId || !threadId) {
        return null;
    }
    return `${machineId}:${threadId}`;
}

export function isDuplicateImportedCodexSession(
    session: Pick<Session, 'id' | 'active' | 'metadata'>,
    sessions: Record<string, Pick<Session, 'id' | 'active' | 'metadata'>>,
): boolean {
    return buildDuplicateImportedCodexSessionIds(sessions).has(session.id);
}

function isFailedImportedCodexResumeChild(session: Pick<Session, 'active' | 'metadata'>): boolean {
    return Boolean(
        !session.active
        && session.metadata?.flavor === 'codex'
        && session.metadata.parentSessionId
        && !session.metadata.codexThreadId,
    );
}

function isCodexResumeChild(session: Pick<Session, 'metadata'>): boolean {
    return Boolean(
        session.metadata?.flavor === 'codex'
        && session.metadata.parentSessionId,
    );
}

export function buildDuplicateImportedCodexSessionIds(
    sessions: Record<string, Pick<Session, 'id' | 'active' | 'metadata'>>,
): Set<string> {
    const realSessionThreadKeys = new Set<string>();
    const importedByThreadKey = new Map<string, string[]>();
    const importedIds = new Set<string>();
    const realSessionParentIds = new Set<string>();
    const failedResumeChildIds = new Set<string>();

    for (const session of Object.values(sessions)) {
        if (isNonProjectImportedCodexSession(session)) {
            failedResumeChildIds.add(session.id);
        } else if (isImportedCodexSession(session)) {
            importedIds.add(session.id);
        } else if (isFailedImportedCodexResumeChild(session)) {
            failedResumeChildIds.add(session.id);
        } else if (isCodexResumeChild(session)) {
            const parentSessionId = session.metadata?.parentSessionId;
            if (parentSessionId) {
                realSessionParentIds.add(parentSessionId);
            }
        }

        const key = codexThreadKey(session);
        if (!key) {
            continue;
        }

        if (isImportedCodexSession(session)) {
            const ids = importedByThreadKey.get(key);
            if (ids) {
                ids.push(session.id);
            } else {
                importedByThreadKey.set(key, [session.id]);
            }
        } else {
            realSessionThreadKeys.add(key);
        }
    }

    const duplicateIds = new Set<string>();
    for (const id of failedResumeChildIds) {
        duplicateIds.add(id);
    }

    for (const parentSessionId of realSessionParentIds) {
        if (importedIds.has(parentSessionId)) {
            duplicateIds.add(parentSessionId);
        }
    }

    for (const key of realSessionThreadKeys) {
        const importedIds = importedByThreadKey.get(key);
        if (!importedIds) {
            continue;
        }
        for (const id of importedIds) {
            duplicateIds.add(id);
        }
    }

    return duplicateIds;
}

export function inheritImportedCodexSessionTitles(
    sessions: Record<string, Session>,
): Record<string, Session> {
    let nextSessions = sessions;
    const importedById = new Map<string, Session>();
    const importedByThreadKey = new Map<string, Session>();

    for (const session of Object.values(sessions)) {
        if (!isImportedCodexSession(session)) {
            continue;
        }
        if (session.metadata?.summary) {
            importedById.set(session.id, session);
            const key = codexThreadKey(session);
            if (key) {
                importedByThreadKey.set(key, session);
            }
        }
    }

    for (const session of Object.values(sessions)) {
        if (isImportedCodexSession(session) || session.metadata?.summary) {
            continue;
        }

        const parentImported = isCodexResumeChild(session) && session.metadata?.parentSessionId
            ? importedById.get(session.metadata.parentSessionId)
            : null;
        const key = codexThreadKey(session);
        const threadImported = key ? importedByThreadKey.get(key) : null;
        const imported = parentImported ?? threadImported;
        const importedSummary = imported?.metadata?.summary;
        if (!session.metadata || !importedSummary) {
            continue;
        }

        if (nextSessions === sessions) {
            nextSessions = { ...sessions };
        }

        nextSessions[session.id] = {
            ...session,
            metadata: {
                ...session.metadata,
                summary: importedSummary,
            },
        };
    }

    return nextSessions;
}

export function isProjectGroupSession(session: Pick<Session, 'active' | 'metadata'>): boolean {
    return session.active || (isImportedCodexSession(session) && !isNonProjectImportedCodexSession(session));
}

export function getSessionProjectGroupPath(session: {
    path?: string | null;
    flavor?: string | null;
}): string {
    const rawPath = session.path ?? '';
    if (session.flavor !== 'codex') {
        return rawPath;
    }

    const normalizedPath = rawPath.replace(/\/+$/g, '');
    const match = normalizedPath.match(/^(.*)\/environments\/data\/envs\/[^/]+\/project$/);
    return match?.[1] || rawPath;
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
