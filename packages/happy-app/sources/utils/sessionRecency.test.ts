import { describe, expect, it } from 'vitest';
import { compareSessionsByRecency, getSessionRecencyTime } from './sessionRecency';

const baseSession = {
    id: 'session',
    name: 'Session',
    updatedAt: 0,
    recencyAt: 0,
};

describe('session recency helpers', () => {
    it('uses the stable recency timestamp instead of row updatedAt', () => {
        expect(getSessionRecencyTime({
            recencyAt: 20,
            updatedAt: 1_000_000,
            activeAt: 30,
            createdAt: 40,
        })).toBe(20);
    });

    it('sorts sessions newest first with stable fallback ordering', () => {
        const sessions = [
            { ...baseSession, id: 'older', name: 'Older', updatedAt: 10 },
            { ...baseSession, id: 'tie-b', name: 'Tie', recencyAt: 30, updatedAt: 3000 },
            { ...baseSession, id: 'newest', name: 'Newest', recencyAt: 40, updatedAt: 1000 },
            { ...baseSession, id: 'tie-a', name: 'Tie', recencyAt: 30, updatedAt: 4000 },
        ];

        expect(sessions.sort(compareSessionsByRecency).map(session => session.id)).toEqual([
            'newest',
            'tie-a',
            'tie-b',
            'older',
        ]);
    });
});
