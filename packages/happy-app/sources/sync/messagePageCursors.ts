import type { ApiMessage } from './apiTypes';

export type LatestMessagePageCursorUpdate = {
    lastSeq: number;
    oldestSeq: number | null;
    hasMoreOlder: boolean;
};

export type OlderMessagePageCursorUpdate = {
    oldestSeq: number | null;
    hasMoreOlder: boolean;
    loaded: boolean;
};

export function getLatestMessagePageCursorUpdate(
    messages: readonly ApiMessage[],
    currentLastSeq: number | undefined,
    hasMore: boolean | undefined,
): LatestMessagePageCursorUpdate {
    let lastSeq = currentLastSeq ?? 0;
    let oldestSeq = Number.POSITIVE_INFINITY;

    for (const message of messages) {
        if (message.seq > lastSeq) {
            lastSeq = message.seq;
        }
        if (message.seq < oldestSeq) {
            oldestSeq = message.seq;
        }
    }

    return {
        lastSeq,
        oldestSeq: messages.length > 0 ? oldestSeq : null,
        hasMoreOlder: !!hasMore && messages.length > 0,
    };
}

export function getOlderMessagePageCursorUpdate(
    messages: readonly ApiMessage[],
    beforeSeq: number,
    hasMore: boolean | undefined,
): OlderMessagePageCursorUpdate {
    let oldestSeq = beforeSeq;

    for (const message of messages) {
        if (message.seq < oldestSeq) {
            oldestSeq = message.seq;
        }
    }

    return {
        oldestSeq: messages.length > 0 ? oldestSeq : null,
        hasMoreOlder: !!hasMore && messages.length > 0,
        loaded: messages.length > 0,
    };
}
