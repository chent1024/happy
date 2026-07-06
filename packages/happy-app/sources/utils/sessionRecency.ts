import type { SessionRowData } from '@/sync/storage';

export function getSessionRecencyTime(session: Pick<SessionRowData, 'recencyAt' | 'updatedAt' | 'activeAt' | 'createdAt'>) {
    return session.recencyAt ?? Math.max(session.activeAt ?? 0, session.createdAt ?? 0, session.updatedAt ?? 0);
}

export function compareSessionsByRecency(
    a: Pick<SessionRowData, 'id' | 'name' | 'recencyAt' | 'updatedAt' | 'activeAt' | 'createdAt'>,
    b: Pick<SessionRowData, 'id' | 'name' | 'recencyAt' | 'updatedAt' | 'activeAt' | 'createdAt'>,
) {
    const byTime = getSessionRecencyTime(b) - getSessionRecencyTime(a);
    if (byTime !== 0) {
        return byTime;
    }

    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}
