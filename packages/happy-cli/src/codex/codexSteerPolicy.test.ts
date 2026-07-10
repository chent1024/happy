import { describe, expect, it } from 'vitest';

import { shouldAttemptCodexSteer } from './codexSteerPolicy';

describe('shouldAttemptCodexSteer', () => {
    it('allows normal steer messages for an active turn', () => {
        expect(shouldAttemptCodexSteer({
            deliveryIntent: 'steer',
            hasActiveThread: true,
            hasActiveTurn: true,
            isClearText: false,
            isGoalCommand: false,
        })).toBe(true);
    });

    it('does not steer queued Codex.app intake messages even when a turn is active', () => {
        expect(shouldAttemptCodexSteer({
            deliveryIntent: 'queue',
            source: 'codex-app',
            hasActiveThread: true,
            hasActiveTurn: true,
            isClearText: false,
            isGoalCommand: false,
        })).toBe(false);
    });

    it('does not allow Codex.app intake messages to force steer', () => {
        expect(shouldAttemptCodexSteer({
            deliveryIntent: 'steer',
            source: 'codex-app',
            hasActiveThread: true,
            hasActiveTurn: true,
            isClearText: false,
            isGoalCommand: false,
        })).toBe(false);
    });
});
