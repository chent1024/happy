import { describe, expect, it } from 'vitest';

import {
    getLatestMessagePageCursorUpdate,
    getOlderMessagePageCursorUpdate,
} from './messagePageCursors';
import type { ApiMessage } from './apiTypes';

function message(seq: number): ApiMessage {
    return {
        id: `message-${seq}`,
        seq,
        localId: null,
        createdAt: seq,
        updatedAt: seq,
        content: {
            t: 'encrypted',
            c: `encrypted-${seq}`,
        },
    };
}

describe('messagePageCursors', () => {
    it('anchors latest pages by min and max seq even when imported Codex seq is non-monotonic', () => {
        const update = getLatestMessagePageCursorUpdate(
            [message(2601), message(2502), message(2599)],
            2580,
            true,
        );

        expect(update).toEqual({
            lastSeq: 2601,
            oldestSeq: 2502,
            hasMoreOlder: true,
        });
    });

    it('keeps the existing last seq and disables older pagination for empty latest pages', () => {
        expect(getLatestMessagePageCursorUpdate([], 42, true)).toEqual({
            lastSeq: 42,
            oldestSeq: null,
            hasMoreOlder: false,
        });
    });

    it('moves older cursor to the lowest seq in the page', () => {
        expect(getOlderMessagePageCursorUpdate(
            [message(200), message(150), message(175)],
            201,
            true,
        )).toEqual({
            oldestSeq: 150,
            hasMoreOlder: true,
            loaded: true,
        });
    });

    it('does not advance older cursor when the page is empty', () => {
        expect(getOlderMessagePageCursorUpdate([], 201, true)).toEqual({
            oldestSeq: null,
            hasMoreOlder: false,
            loaded: false,
        });
    });
});
