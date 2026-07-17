import { describe, expect, it, vi } from 'vitest';

import { emitRpcWithAck } from './apiSocketRpc';

describe('emitRpcWithAck', () => {
    it('fails immediately while the socket is reconnecting', async () => {
        const emitWithAck = vi.fn();
        const timeout = vi.fn(() => ({ emitWithAck }));

        await expect(emitRpcWithAck({ connected: false, emitWithAck, timeout }, 'rpc-call', {}))
            .rejects.toThrow('Socket not connected');
        expect(timeout).not.toHaveBeenCalled();
    });

    it('uses a bounded acknowledgement timeout', async () => {
        const emitWithAck = vi.fn().mockRejectedValue(new Error('operation has timed out'));
        const timeout = vi.fn(() => ({ emitWithAck }));

        await expect(emitRpcWithAck({ connected: true, emitWithAck, timeout }, 'rpc-call', {}, 2500))
            .rejects.toThrow('operation has timed out');
        expect(timeout).toHaveBeenCalledWith(2500);
        expect(emitWithAck).toHaveBeenCalledWith('rpc-call', {});
    });

    it('preserves unbounded acknowledgement behavior when no timeout is requested', async () => {
        const emitWithAck = vi.fn().mockResolvedValue({ ok: true });
        const timeout = vi.fn(() => ({ emitWithAck }));

        await expect(emitRpcWithAck({ connected: true, emitWithAck, timeout }, 'rpc-call', {}))
            .resolves.toEqual({ ok: true });
        expect(timeout).not.toHaveBeenCalled();
        expect(emitWithAck).toHaveBeenCalledWith('rpc-call', {});
    });
});
