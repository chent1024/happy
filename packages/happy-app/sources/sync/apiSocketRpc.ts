export const SOCKET_RPC_ACK_TIMEOUT_MS = 10_000;

type RpcAckSocket = {
    connected: boolean;
    emitWithAck(event: string, data: unknown): Promise<unknown>;
    timeout(timeoutMs: number): {
        emitWithAck(event: string, data: unknown): Promise<unknown>;
    };
};

export async function emitRpcWithAck<T>(
    socket: RpcAckSocket,
    event: string,
    data: unknown,
    timeoutMs?: number,
): Promise<T> {
    if (!socket.connected) {
        throw new Error('Socket not connected');
    }

    const response = timeoutMs === undefined
        ? socket.emitWithAck(event, data)
        : socket.timeout(timeoutMs).emitWithAck(event, data);
    return await response as T;
}
