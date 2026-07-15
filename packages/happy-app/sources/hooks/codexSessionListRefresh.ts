import type { CodexSessionsBatchSyncResult } from '@/sync/ops';

export type CodexSessionListRefreshStatus =
    | { type: 'changed'; imported: number; refreshed: number; archived: number }
    | { type: 'unchanged' }
    | { type: 'partial'; failed: number; machines: number }
    | { type: 'error' };

export const CODEX_SESSION_LIST_REFRESH_STATUS_DURATION_MS = 4_000;

export function scheduleCodexSessionListRefreshStatusDismiss(
    dismiss: () => void,
): () => void {
    const timeout = setTimeout(dismiss, CODEX_SESSION_LIST_REFRESH_STATUS_DURATION_MS);
    return () => clearTimeout(timeout);
}

export function createCodexSessionListRefreshStatus(
    result: CodexSessionsBatchSyncResult,
): CodexSessionListRefreshStatus {
    if (result.type === 'error') {
        return { type: 'error' };
    }
    if (result.type === 'partial') {
        return { type: 'partial', failed: result.failed, machines: result.machines };
    }
    if (result.imported > 0 || result.refreshed > 0 || result.archived > 0) {
        return {
            type: 'changed',
            imported: result.imported,
            refreshed: result.refreshed,
            archived: result.archived,
        };
    }
    return { type: 'unchanged' };
}
