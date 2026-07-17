import { describe, expect, it } from 'vitest';

import { mergeSessionSnapshotActivity } from './sessionSnapshotActivity';

describe('mergeSessionSnapshotActivity', () => {
    it('preserves realtime thinking while a persistent snapshot still says active', () => {
        expect(mergeSessionSnapshotActivity(
            { active: true, activeAt: 300 },
            { active: true, activeAt: 200, thinking: true, thinkingAt: 200 },
        )).toEqual({
            active: true,
            activeAt: 300,
            thinking: true,
            thinkingAt: 200,
        });
    });

    it('preserves a newer realtime activity state over an older snapshot', () => {
        expect(mergeSessionSnapshotActivity(
            { active: false, activeAt: 100 },
            { active: true, activeAt: 200, thinking: true, thinkingAt: 200 },
        )).toEqual({
            active: true,
            activeAt: 200,
            thinking: true,
            thinkingAt: 200,
        });
    });

    it('accepts a newer inactive snapshot and clears thinking', () => {
        expect(mergeSessionSnapshotActivity(
            { active: false, activeAt: 300 },
            { active: true, activeAt: 200, thinking: true, thinkingAt: 200 },
        )).toEqual({
            active: false,
            activeAt: 300,
            thinking: false,
            thinkingAt: 0,
        });
    });
});
