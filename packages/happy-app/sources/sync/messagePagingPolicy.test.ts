import { describe, expect, it } from 'vitest';

import {
    CODEX_BACKFILLED_INITIAL_MESSAGE_PAGE_LIMIT,
    DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT,
    SEVERE_WEAK_NETWORK_MESSAGE_PAGE_LIMIT,
    STALE_RUNNING_TOOL_COMPLETION_PREFETCH_PAGE_LIMIT,
    WEAK_NETWORK_MESSAGE_PAGE_LIMIT,
    getAdaptiveMessagePageLimit,
    getInitialMessagePageLimit,
    hasStaleRunningTool,
    shouldLoadOlderMessagesForStaleRunningTools,
    shouldPrefetchOlderMessages,
} from './messagePagingPolicy';

describe('messagePagingPolicy', () => {
    it('uses the default latest-page size and background prefetch for normal sessions', () => {
        const metadata = { flavor: 'claude' };

        expect(getInitialMessagePageLimit(metadata as any)).toBe(DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT);
        expect(shouldPrefetchOlderMessages(metadata as any)).toBe(true);
    });

    it('bounds initial loading and disables background older prefetch for Codex-backfilled sessions', () => {
        const metadata = {
            flavor: 'codex',
            codexBackfilledThreadId: '019f1218-a5f3-7c71-a2bc-50522e07cde4',
        };

        expect(getInitialMessagePageLimit(metadata as any)).toBe(CODEX_BACKFILLED_INITIAL_MESSAGE_PAGE_LIMIT);
        expect(shouldPrefetchOlderMessages(metadata as any)).toBe(false);
    });

    it('detects stale running tools that may need older completion events', () => {
        const now = 1_000_000;
        const staleRunningTool = {
            kind: 'tool-call',
            tool: {
                state: 'running',
                createdAt: now - 10 * 60 * 1000,
            },
        };
        const freshRunningTool = {
            kind: 'tool-call',
            tool: {
                state: 'running',
                createdAt: now - 10 * 1000,
            },
        };

        expect(hasStaleRunningTool([staleRunningTool] as any, now)).toBe(true);
        expect(hasStaleRunningTool([freshRunningTool] as any, now)).toBe(false);
    });

    it('bounds stale running tool completion prefetches to older pages that may close the tool', () => {
        const now = 1_000_000;
        const staleRunningTool = {
            kind: 'tool-call',
            tool: {
                state: 'running',
                createdAt: now - 10 * 60 * 1000,
            },
        };
        const pageState = {
            messages: [staleRunningTool],
            hasMoreOlder: true,
        };

        expect(shouldLoadOlderMessagesForStaleRunningTools(pageState as any, 0, now)).toBe(true);
        expect(shouldLoadOlderMessagesForStaleRunningTools(
            pageState as any,
            STALE_RUNNING_TOOL_COMPLETION_PREFETCH_PAGE_LIMIT,
            now,
        )).toBe(false);
        expect(shouldLoadOlderMessagesForStaleRunningTools({
            ...pageState,
            hasMoreOlder: false,
        } as any, 0, now)).toBe(false);
    });

    it('steps down message page size after weak-network failures', () => {
        expect(getAdaptiveMessagePageLimit(DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT, 0))
            .toBe(DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT);
        expect(getAdaptiveMessagePageLimit(DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT, 1))
            .toBe(WEAK_NETWORK_MESSAGE_PAGE_LIMIT);
        expect(getAdaptiveMessagePageLimit(DEFAULT_INITIAL_MESSAGE_PAGE_LIMIT, 2))
            .toBe(SEVERE_WEAK_NETWORK_MESSAGE_PAGE_LIMIT);
        expect(getAdaptiveMessagePageLimit(CODEX_BACKFILLED_INITIAL_MESSAGE_PAGE_LIMIT, 1))
            .toBe(CODEX_BACKFILLED_INITIAL_MESSAGE_PAGE_LIMIT);
        expect(getAdaptiveMessagePageLimit(CODEX_BACKFILLED_INITIAL_MESSAGE_PAGE_LIMIT, 2))
            .toBe(SEVERE_WEAK_NETWORK_MESSAGE_PAGE_LIMIT);
    });
});
