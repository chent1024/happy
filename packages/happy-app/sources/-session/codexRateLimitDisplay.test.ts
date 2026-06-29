import { describe, expect, it } from 'vitest';
import {
    formatRateLimitWindowName,
    getRateLimitRemainingPercent,
    pickHeaderRateLimitWindow,
    pickTightestRateLimitWindow,
    type CodexAccountRateLimitsViewState,
    type CodexRateLimitWindowViewState,
} from './codexRateLimitDisplay';

function rateLimitWindow(
    windowDurationMins: number | null,
    remainingPercent: number,
): CodexRateLimitWindowViewState {
    return {
        usedPercent: 100 - remainingPercent,
        remainingPercent,
        windowDurationMins,
        resetsAt: null,
    };
}

function rateLimits(
    primary: CodexRateLimitWindowViewState | null,
    secondary: CodexRateLimitWindowViewState | null,
): CodexAccountRateLimitsViewState {
    return {
        updatedAt: 1,
        primary,
        secondary,
    };
}

describe('codexRateLimitDisplay', () => {
    it('formats common Codex rate limit windows', () => {
        expect(formatRateLimitWindowName(rateLimitWindow(300, 80))).toBe('5h');
        expect(formatRateLimitWindowName(rateLimitWindow(10_080, 80))).toBe('7d');
        expect(formatRateLimitWindowName(rateLimitWindow(null, 80))).toBe('额度');
    });

    it('clamps and rounds remaining percent', () => {
        expect(getRateLimitRemainingPercent(rateLimitWindow(300, 33.6))).toBe(34);
        expect(getRateLimitRemainingPercent(rateLimitWindow(300, -4))).toBe(0);
        expect(getRateLimitRemainingPercent(rateLimitWindow(300, 124))).toBe(100);
    });

    it('keeps the session header on the 7d window even when 5h is tighter', () => {
        const fiveHour = rateLimitWindow(300, 7);
        const sevenDay = rateLimitWindow(10_080, 64);
        const limits = rateLimits(fiveHour, sevenDay);

        expect(pickTightestRateLimitWindow(limits)).toBe(fiveHour);
        expect(pickHeaderRateLimitWindow(limits)).toBe(sevenDay);
    });

    it('falls back to the tightest available window when 7d is absent', () => {
        const oneHour = rateLimitWindow(60, 42);
        const fiveHour = rateLimitWindow(300, 18);

        expect(pickHeaderRateLimitWindow(rateLimits(oneHour, fiveHour))).toBe(fiveHour);
    });
});
