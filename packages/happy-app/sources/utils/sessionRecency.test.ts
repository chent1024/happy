import { describe, expect, it } from 'vitest';
import { compareSessionsByRecency, getSessionRecencyTime } from './sessionRecency';

const baseSession = {
    id: 'session',
    name: 'Session',
    updatedAt: 0,
};

describe('session recency helpers', () => {
    it('uses the latest available activity timestamp', () => {
        expect(getSessionRecencyTime({
            updatedAt: 10,
            activeAt: 30,
            createdAt: 20,
        })).toBe(30);
    });

    it('sorts sessions newest first with stable fallback ordering', () => {
        const sessions = [
            { ...baseSession, id: 'older', name: 'Older', updatedAt: 10 },
            { ...baseSession, id: 'tie-b', name: 'Tie', updatedAt: 30 },
            { ...baseSession, id: 'newest', name: 'Newest', updatedAt: 40 },
            { ...baseSession, id: 'tie-a', name: 'Tie', updatedAt: 30 },
        ];

        expect(sessions.sort(compareSessionsByRecency).map(session => session.id)).toEqual([
            'newest',
            'tie-a',
            'tie-b',
            'older',
        ]);
    });
});
