import type { AgentState } from '@/sync/storageTypes';

export type CodexAccountRateLimitsViewState = NonNullable<AgentState['codexAccountRateLimits']>;
export type CodexRateLimitWindowViewState = NonNullable<CodexAccountRateLimitsViewState['primary']>;

const SEVEN_DAY_WINDOW_MINS = 7 * 24 * 60;

export function getRateLimitRemainingPercent(window: CodexRateLimitWindowViewState): number {
    const remaining = typeof window.remainingPercent === 'number'
        ? window.remainingPercent
        : 100 - window.usedPercent;
    return Math.max(0, Math.min(100, Math.round(remaining)));
}

export function formatRateLimitWindowName(window: CodexRateLimitWindowViewState): string {
    const mins = window.windowDurationMins;
    if (!mins) {
        return '额度';
    }
    if (mins === 300) {
        return '5h';
    }
    if (mins >= 1440) {
        return `${Math.round(mins / 1440)}d`;
    }
    if (mins >= 60) {
        return `${Math.round(mins / 60)}h`;
    }
    return `${mins}m`;
}

export function formatRateLimitResetTime(window: CodexRateLimitWindowViewState): string {
    if (!window.resetsAt) {
        return '重置时间未知';
    }
    const timestampMs = window.resetsAt < 10_000_000_000 ? window.resetsAt * 1000 : window.resetsAt;
    return `重置 ${new Date(timestampMs).toLocaleString(undefined, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })}`;
}

export function getVisibleRateLimitWindows(limits: CodexAccountRateLimitsViewState): CodexRateLimitWindowViewState[] {
    return [limits.primary, limits.secondary].filter((window): window is CodexRateLimitWindowViewState => !!window);
}

export function pickTightestRateLimitWindow(limits: CodexAccountRateLimitsViewState): CodexRateLimitWindowViewState | null {
    const windows = getVisibleRateLimitWindows(limits);
    if (windows.length === 0) {
        return null;
    }
    return windows.sort((a, b) => getRateLimitRemainingPercent(a) - getRateLimitRemainingPercent(b))[0] ?? null;
}

export function pickHeaderRateLimitWindow(limits: CodexAccountRateLimitsViewState): CodexRateLimitWindowViewState | null {
    const windows = getVisibleRateLimitWindows(limits);
    return windows.find((window) => window.windowDurationMins === SEVEN_DAY_WINDOW_MINS)
        ?? pickTightestRateLimitWindow(limits);
}
