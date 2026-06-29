import { describe, expect, it } from 'vitest';

import {
    buildOptimisticResumedSession,
    getResumeNavigationAction,
    shouldReapplyOptimisticResume,
} from './sessionResumeResult';

const baseSession = {
    id: 'session-1',
    active: false,
    activeAt: 1000,
    presence: 1000,
    thinking: true,
    thinkingAt: 900,
    metadata: {
        lifecycleState: 'archived',
        archivedBy: 'system',
    },
} as any;

describe('session resume result helpers', () => {
    it('does not push when resume returns the already-open session route', () => {
        expect(getResumeNavigationAction({
            pathname: '/session/session-1',
            currentSessionId: 'session-1',
            resumedSessionId: 'session-1',
        })).toBe('none');
    });

    it('replaces nested session routes after in-place resume', () => {
        expect(getResumeNavigationAction({
            pathname: '/session/session-1/info',
            currentSessionId: 'session-1',
            resumedSessionId: 'session-1',
        })).toBe('replace');
    });

    it('replaces the source session route when resume creates a new session', () => {
        expect(getResumeNavigationAction({
            pathname: '/session/imported-session',
            currentSessionId: 'imported-session',
            resumedSessionId: 'spawned-session',
        })).toBe('replace');
    });

    it('replaces nested source session routes when resume creates a new session', () => {
        expect(getResumeNavigationAction({
            pathname: '/session/imported-session/info',
            currentSessionId: 'imported-session',
            resumedSessionId: 'spawned-session',
        })).toBe('replace');
    });

    it('pushes when resume is triggered away from the resumed session', () => {
        expect(getResumeNavigationAction({
            pathname: '/machine/machine-1',
            currentSessionId: 'session-1',
            resumedSessionId: 'session-1',
        })).toBe('push');
    });

    it('marks a resumed session online immediately while preserving metadata', () => {
        expect(buildOptimisticResumedSession(baseSession, 2000)).toMatchObject({
            id: 'session-1',
            active: true,
            activeAt: 2000,
            presence: 'online',
            thinking: false,
            thinkingAt: 2000,
            metadata: {
                lifecycleState: 'running',
                archivedBy: undefined,
            },
        });
    });

    it('reapplies optimistic state when a refresh returns an older inactive snapshot', () => {
        expect(shouldReapplyOptimisticResume({
            ...baseSession,
            active: false,
            activeAt: 1500,
        }, 2000)).toBe(true);
    });

    it('does not reapply optimistic state over a newer inactive snapshot', () => {
        expect(shouldReapplyOptimisticResume({
            ...baseSession,
            active: false,
            activeAt: 2500,
        }, 2000)).toBe(false);
    });

    it('does not reapply optimistic state over an already-active snapshot', () => {
        expect(shouldReapplyOptimisticResume({
            ...baseSession,
            active: true,
            activeAt: 2500,
        }, 2000)).toBe(false);
    });
});
