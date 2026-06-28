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
