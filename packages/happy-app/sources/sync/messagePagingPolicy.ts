import type { Metadata } from './storageTypes';
import type { Message } from './typesMessage';

export const DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT = 100;
export const CODEX_BACKFILLED_INITIAL_MESSAGE_PAGE_LIMIT = 40;
export const STALE_RUNNING_TOOL_COMPLETION_PREFETCH_MS = 5 * 60 * 1000;

export function isCodexBackfilledSession(metadata: Metadata | null | undefined): boolean {
    return metadata?.flavor === 'codex'
        && typeof metadata.codexBackfilledThreadId === 'string'
        && metadata.codexBackfilledThreadId.length > 0;
}

export function getInitialMessagePageLimit(metadata: Metadata | null | undefined): number {
    return isCodexBackfilledSession(metadata)
        ? CODEX_BACKFILLED_INITIAL_MESSAGE_PAGE_LIMIT
        : DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT;
}

export function shouldPrefetchOlderMessages(metadata: Metadata | null | undefined): boolean {
    return !isCodexBackfilledSession(metadata);
}

export function hasStaleRunningTool(
    messages: readonly Message[],
    now: number = Date.now(),
    staleAfterMs: number = STALE_RUNNING_TOOL_COMPLETION_PREFETCH_MS,
): boolean {
    return messages.some((message) => {
        if (message.kind !== 'tool-call' || message.tool.state !== 'running') {
            return false;
        }
        return now - message.tool.createdAt >= staleAfterMs;
    });
}
