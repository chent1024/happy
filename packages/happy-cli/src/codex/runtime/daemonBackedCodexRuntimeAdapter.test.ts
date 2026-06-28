import { describe, expect, it, vi } from 'vitest';
import { DaemonBackedCodexRuntimeAdapter } from './daemonBackedCodexRuntimeAdapter';
import { CodexRuntimeEventJournal } from './codexRuntimeEventJournal';
import type { CodexRuntimeAdapter } from './codexRuntimeAdapter';

function createBaseAdapter(overrides?: Partial<CodexRuntimeAdapter>): CodexRuntimeAdapter {
    const journal = new CodexRuntimeEventJournal();
    return {
        journal,
        threadId: 'thread-1',
        turnId: null,
        sandboxEnabled: false,
        supportsGoalActions: vi.fn(() => true),
        setEventHandler: vi.fn(),
        setApprovalHandler: vi.fn(),
        connect: vi.fn(async () => {}),
        disconnect: vi.fn(async () => {}),
        hasActiveThread: vi.fn(() => true),
        clearThreadState: vi.fn(),
        startThread: vi.fn(async () => ({ threadId: 'thread-1', model: 'gpt-test' })),
        resumeThread: vi.fn(async () => ({ threadId: 'thread-1', model: 'gpt-test' })),
        readThread: vi.fn(),
        readAccountRateLimits: vi.fn(async () => null),
        setGoal: vi.fn(),
        clearGoal: vi.fn(),
        steerTurn: vi.fn(async () => ({ steered: true })),
        sendTurnAndWait: vi.fn(async () => ({ aborted: false })),
        abortTurnWithFallback: vi.fn(async () => ({
            hadActiveTurn: true,
            aborted: true,
            forcedRestart: false,
            resumedThread: false,
        })),
        ...overrides,
    };
}

describe('DaemonBackedCodexRuntimeAdapter', () => {
    it('forwards journal entries to the daemon without changing adapter behavior', async () => {
        const base = createBaseAdapter();
        const onJournalEntry = vi.fn(async () => ({ status: 'ok' }));
        const adapter = new DaemonBackedCodexRuntimeAdapter(base, { onJournalEntry });

        await expect(adapter.connect()).resolves.toBeUndefined();
        base.journal.recordLifecycle('connect', { threadId: 'thread-1' });
        await Promise.resolve();

        expect(base.connect).toHaveBeenCalledTimes(1);
        expect(onJournalEntry).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'lifecycle',
            eventType: 'connect',
            threadId: 'thread-1',
        }));
    });

    it('stops forwarding after daemon forwarding fails', async () => {
        const base = createBaseAdapter();
        const onJournalEntry = vi.fn(async () => ({ error: 'No daemon running' }));
        const adapter = new DaemonBackedCodexRuntimeAdapter(base, { onJournalEntry });

        base.journal.recordLifecycle('first');
        await Promise.resolve();
        base.journal.recordLifecycle('second');
        await Promise.resolve();

        expect(adapter.journal.snapshot().map((entry) => entry.eventType)).toEqual(['first', 'second']);
        expect(onJournalEntry).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from journal forwarding on disconnect', async () => {
        const base = createBaseAdapter();
        const onJournalEntry = vi.fn();
        const adapter = new DaemonBackedCodexRuntimeAdapter(base, { onJournalEntry });

        await adapter.disconnect();
        base.journal.recordLifecycle('after-disconnect');
        await Promise.resolve();

        expect(base.disconnect).toHaveBeenCalledTimes(1);
        expect(onJournalEntry).not.toHaveBeenCalled();
    });
});
