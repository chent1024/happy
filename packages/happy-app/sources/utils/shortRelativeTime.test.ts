import { describe, expect, it } from 'vitest';
import { formatShortRelativeTime } from './shortRelativeTime';

describe('formatShortRelativeTime', () => {
    const now = 1_000_000_000;

    it('formats recent timestamps with compact units', () => {
        expect(formatShortRelativeTime(now - 30 * 1000, now)).toBe('now');
        expect(formatShortRelativeTime(now - 1 * 60 * 1000, now)).toBe('1m');
        expect(formatShortRelativeTime(now - 1 * 60 * 60 * 1000, now)).toBe('1h');
        expect(formatShortRelativeTime(now - 1 * 24 * 60 * 60 * 1000, now)).toBe('1d');
        expect(formatShortRelativeTime(now - 7 * 24 * 60 * 60 * 1000, now)).toBe('1w');
    });
});
