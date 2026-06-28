import { describe, expect, it } from 'vitest';

import { shouldBackfillCodexThread } from './codexThreadBackfill';

describe('shouldBackfillCodexThread', () => {
    it('backfills a new empty Happy session for a Codex thread', () => {
        expect(shouldBackfillCodexThread({
            threadId: 'thread-1',
            sessionSeq: 0,
            metadata: { codexThreadId: 'thread-1' } as any,
        })).toBe(true);
    });

    it('backfills a reconnected imported Codex session that has no backfill marker yet', () => {
        expect(shouldBackfillCodexThread({
            threadId: 'thread-1',
            sessionSeq: 3,
            metadata: { codexThreadId: 'thread-1' } as any,
        })).toBe(true);
    });

    it('does not backfill a Codex thread twice', () => {
        expect(shouldBackfillCodexThread({
            threadId: 'thread-1',
            sessionSeq: 3,
            metadata: {
                codexThreadId: 'thread-1',
                codexBackfilledThreadId: 'thread-1',
            } as any,
        })).toBe(false);
    });

    it('ignores sessions for a different Codex thread', () => {
        expect(shouldBackfillCodexThread({
            threadId: 'thread-2',
            sessionSeq: 3,
            metadata: { codexThreadId: 'thread-1' } as any,
        })).toBe(false);
    });
});
