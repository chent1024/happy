import type { Metadata } from '@/api/types';

export function shouldBackfillCodexThread(opts: {
    threadId: string | null | undefined;
    sessionSeq: number | null | undefined;
    metadata: Metadata | null | undefined;
}): boolean {
    const threadId = opts.threadId;
    if (!threadId) return false;
    if (opts.metadata?.codexBackfilledThreadId === threadId) return false;
    if (opts.sessionSeq === 0) return true;
    return opts.metadata?.codexThreadId === threadId && !opts.metadata?.codexBackfilledThreadId;
}

export function shouldBackfillForkedCodexThread(opts: {
    forkThreadId: string | null | undefined;
    resumeThreadId: string | null | undefined;
    sessionSeq: number | null | undefined;
    metadata: Metadata | null | undefined;
}): boolean {
    if (!opts.forkThreadId || opts.forkThreadId === opts.resumeThreadId) {
        return false;
    }

    return shouldBackfillCodexThread({
        threadId: opts.forkThreadId,
        sessionSeq: opts.sessionSeq,
        metadata: opts.metadata,
    });
}
