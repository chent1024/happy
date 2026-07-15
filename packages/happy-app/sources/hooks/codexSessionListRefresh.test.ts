import { describe, expect, it, vi } from 'vitest';
import {
    CODEX_SESSION_LIST_REFRESH_STATUS_DURATION_MS,
    createCodexSessionListRefreshStatus,
    scheduleCodexSessionListRefreshStatusDismiss,
} from './codexSessionListRefresh';

describe('createCodexSessionListRefreshStatus', () => {
    it('reports changed session counts after a successful refresh', () => {
        expect(createCodexSessionListRefreshStatus({
            type: 'success',
            machines: 2,
            succeeded: 2,
            failed: 0,
            fetched: 5,
            imported: 2,
            refreshed: 1,
            archived: 1,
            skipped: 1,
        })).toEqual({
            type: 'changed',
            imported: 2,
            refreshed: 1,
            archived: 1,
        });
    });

    it('reports that the list is current when nothing changed', () => {
        expect(createCodexSessionListRefreshStatus({
            type: 'success',
            machines: 1,
            succeeded: 1,
            failed: 0,
            fetched: 3,
            imported: 0,
            refreshed: 0,
            archived: 0,
            skipped: 3,
        })).toEqual({ type: 'unchanged' });
    });

    it('preserves partial failure details for visible feedback', () => {
        expect(createCodexSessionListRefreshStatus({
            type: 'partial',
            machines: 3,
            succeeded: 2,
            failed: 1,
            fetched: 2,
            imported: 1,
            refreshed: 0,
            archived: 0,
            skipped: 1,
        })).toEqual({ type: 'partial', failed: 1, machines: 3 });
    });

    it('reports a total failure', () => {
        expect(createCodexSessionListRefreshStatus({
            type: 'error',
            machines: 1,
            succeeded: 0,
            failed: 1,
            fetched: 0,
            imported: 0,
            refreshed: 0,
            archived: 0,
            skipped: 0,
        })).toEqual({ type: 'error' });
    });
});

describe('scheduleCodexSessionListRefreshStatusDismiss', () => {
    it('dismisses the visible refresh status after the display duration', () => {
        vi.useFakeTimers();
        const dismiss = vi.fn();

        scheduleCodexSessionListRefreshStatusDismiss(dismiss);
        vi.advanceTimersByTime(CODEX_SESSION_LIST_REFRESH_STATUS_DURATION_MS - 1);
        expect(dismiss).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(dismiss).toHaveBeenCalledOnce();

        vi.useRealTimers();
    });

    it('cancels dismissal when the status changes or the list unmounts', () => {
        vi.useFakeTimers();
        const dismiss = vi.fn();

        const cancel = scheduleCodexSessionListRefreshStatusDismiss(dismiss);
        cancel();
        vi.runAllTimers();
        expect(dismiss).not.toHaveBeenCalled();

        vi.useRealTimers();
    });
});
