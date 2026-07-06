import { describe, expect, it } from 'vitest';

import { getIncomingMessageSeqAction } from './messageSeqGate';

describe('getIncomingMessageSeqAction', () => {
    it('fetches when the local message cursor has not been initialized', () => {
        expect(getIncomingMessageSeqAction(undefined, 12)).toBe('fetch');
    });

    it('appends consecutive realtime messages', () => {
        expect(getIncomingMessageSeqAction(12, 13)).toBe('append');
    });

    it('fetches forward when a future message arrives before earlier seqs', () => {
        expect(getIncomingMessageSeqAction(12, 20)).toBe('fetch');
    });

    it('ignores stale socket messages already covered by a previous fetch', () => {
        expect(getIncomingMessageSeqAction(20, 13)).toBe('ignore');
        expect(getIncomingMessageSeqAction(20, 20)).toBe('ignore');
    });
});
