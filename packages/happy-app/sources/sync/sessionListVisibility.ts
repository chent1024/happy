import type { Session } from './storageTypes';

export function isImportedCodexSession(session: Pick<Session, 'active' | 'metadata'>): boolean {
    return !session.active
        && session.metadata?.flavor === 'codex'
        && session.metadata.lifecycleState === 'imported'
        && typeof session.metadata.codexThreadId === 'string'
        && session.metadata.codexThreadId.length > 0;
}
