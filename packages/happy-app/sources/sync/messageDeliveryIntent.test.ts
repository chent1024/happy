import { describe, expect, it } from 'vitest';

import { resolveSendMessageDeliveryIntent } from './messageDeliveryIntent';

describe('resolveSendMessageDeliveryIntent', () => {
    it('steers only normal chat messages while the Happy session is thinking', () => {
        expect(resolveSendMessageDeliveryIntent({
            source: 'chat',
            sessionThinking: true,
        })).toBe('steer');
    });

    it('does not honor a stale explicit steer intent after the session becomes idle', () => {
        expect(resolveSendMessageDeliveryIntent({
            source: 'chat',
            sessionThinking: false,
            explicitIntent: 'steer',
        })).toBeUndefined();
    });

    it('queues Codex.app intake messages even when the new Happy session is marked thinking', () => {
        expect(resolveSendMessageDeliveryIntent({
            source: 'codex-app',
            sessionThinking: true,
        })).toBe('queue');
    });

    it('does not allow Codex.app intake callers to force steer', () => {
        expect(resolveSendMessageDeliveryIntent({
            source: 'codex-app',
            sessionThinking: true,
            explicitIntent: 'steer',
        })).toBe('queue');
    });
});
