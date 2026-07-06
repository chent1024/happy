import type { Metadata } from './storageTypes';

export const DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT = 100;
export const CODEX_BACKFILLED_INITIAL_MESSAGE_PAGE_LIMIT = 40;

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
