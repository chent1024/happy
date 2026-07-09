import type { Metadata } from './storageTypes';
import type { Message } from './typesMessage';

export const DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT = 100;
export const CODEX_BACKFILLED_INITIAL_MESSAGE_PAGE_LIMIT = 40;
export const WEAK_NETWORK_MESSAGE_PAGE_LIMIT = 40;
export const SEVERE_WEAK_NETWORK_MESSAGE_PAGE_LIMIT = 20;
export const STALE_RUNNING_TOOL_COMPLETION_PREFETCH_MS = 5 * 60 * 1000;
export const STALE_RUNNING_TOOL_COMPLETION_PREFETCH_PAGE_LIMIT = 3;

type MessagePageState = {
    messages: readonly Message[];
    hasMoreOlder: boolean;
};

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

export function getAdaptiveMessagePageLimit(baseLimit: number, consecutiveFailures: number): number {
    if (consecutiveFailures <= 0) {
        return baseLimit;
    }
    if (consecutiveFailures === 1) {
        return Math.min(baseLimit, WEAK_NETWORK_MESSAGE_PAGE_LIMIT);
    }
    return Math.min(baseLimit, SEVERE_WEAK_NETWORK_MESSAGE_PAGE_LIMIT);
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

export function shouldLoadOlderMessagesForStaleRunningTools(
    pageState: MessagePageState | null | undefined,
    pagesLoaded: number,
    now: number = Date.now(),
): boolean {
    if (!pageState?.hasMoreOlder) {
        return false;
    }
    if (pagesLoaded >= STALE_RUNNING_TOOL_COMPLETION_PREFETCH_PAGE_LIMIT) {
        return false;
    }
    return hasStaleRunningTool(pageState.messages, now);
}
