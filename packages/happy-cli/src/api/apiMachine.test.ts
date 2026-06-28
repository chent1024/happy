import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiMachineClient } from './apiMachine';
import type { Machine } from './types';

const {
    mockIo,
    mockShouldReconnect,
    mockRpcHandlers
} = vi.hoisted(() => ({
    mockIo: vi.fn(),
    mockShouldReconnect: vi.fn(() => true),
    mockRpcHandlers: new Map<string, (params: any) => any>()
}));

vi.mock('socket.io-client', () => ({
    io: mockIo
}));

vi.mock('@/configuration', () => ({
    configuration: {
        serverUrl: 'http://127.0.0.1:3005',
        currentCliVersion: 'test'
    }
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn()
    }
}));

vi.mock('@/modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn()
}));

vi.mock('@/api/rpc/RpcHandlerManager', () => ({
    RpcHandlerManager: class {
        onSocketConnect = vi.fn();
        onSocketDisconnect = vi.fn();
        handleRequest = vi.fn(async () => '');
        registerHandler = vi.fn((method: string, handler: (params: any) => any) => {
            mockRpcHandlers.set(method, handler);
        });
        unregisterHandler = vi.fn((method: string) => {
            mockRpcHandlers.delete(method);
        });
        hasHandler = vi.fn((method: string) => mockRpcHandlers.has(method));
    }
}));

vi.mock('@/utils/detectCLI', () => ({
    detectCLIAvailability: vi.fn(() => ({
        claude: false,
        codex: false,
        gemini: false,
        openclaw: false
    }))
}));

vi.mock('@/resume/localHappyAgentAuth', () => ({
    detectResumeSupport: vi.fn(() => ({
        rpcAvailable: false,
        requiresSameMachine: false,
        requiresHappyAgentAuth: false,
        happyAgentAuthenticated: false
    }))
}));

vi.mock('@/utils/lidState', () => ({
    shouldReconnect: mockShouldReconnect
}));

type SocketHandler = (...args: any[]) => void;
type SocketHandlers = Record<string, SocketHandler[]>;

function makeMachine(): Machine {
    return {
        id: 'test-machine-id',
        metadata: {
            host: 'localhost',
            platform: 'darwin',
            happyCliVersion: 'test',
            homeDir: '/home/user',
            happyHomeDir: '/home/user/.happy',
            happyLibDir: '/home/user/.happy/lib'
        },
        metadataVersion: 0,
        daemonState: null,
        daemonStateVersion: 0,
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy'
    };
}

describe('ApiMachineClient socket reconnection', () => {
    let socketHandlers: SocketHandlers;
    let mockSocket: any;

    const emitSocketEvent = (event: string, ...args: any[]) => {
        const handlers = socketHandlers[event] || [];
        handlers.forEach((handler) => handler(...args));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockRpcHandlers.clear();
        mockShouldReconnect.mockReturnValue(true);
        socketHandlers = {};
        mockSocket = {
            connected: false,
            connect: vi.fn(),
            on: vi.fn((event: string, handler: SocketHandler) => {
                if (!socketHandlers[event]) {
                    socketHandlers[event] = [];
                }
                socketHandlers[event].push(handler);
            }),
            emit: vi.fn(),
            emitWithAck: vi.fn(),
            close: vi.fn(),
            io: {
                on: vi.fn()
            }
        };

        mockIo.mockReturnValue(mockSocket);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('retries after initial socket connection error', async () => {
        vi.useFakeTimers();

        const client = new ApiMachineClient('fake-token', makeMachine());
        client.connect();

        expect(mockIo).toHaveBeenCalledWith('ws://127.0.0.1:3005', expect.objectContaining({
            reconnection: false
        }));
        expect(mockSocket.connect).not.toHaveBeenCalled();

        emitSocketEvent('connect_error', new Error('ECONNREFUSED'));

        await vi.advanceTimersByTimeAsync(1000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(3000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(2);

        client.shutdown();
    });
});

describe('ApiMachineClient Codex runtime RPC', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRpcHandlers.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('exposes daemon Codex runtime status and replay handlers when provided', async () => {
        const status = {
            sessionId: 'happy-1',
            pid: 123,
            threadId: 'thread-1',
            path: '/tmp/project',
            active: true,
            stopped: false,
            createdAt: 1000,
            updatedAt: 1001,
        };
        const runtimeStatus = vi.fn(() => status);
        const runtimeReplay = vi.fn(() => [
            {
                seq: 2,
                createdAt: 1002,
                kind: 'lifecycle',
                threadId: 'thread-1',
                turnId: null,
                eventType: 'daemon-runtime-resume-result',
            },
        ]);

        const client = new ApiMachineClient('fake-token', makeMachine());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
            codexRuntimeStatus: runtimeStatus,
            codexRuntimeReplay: runtimeReplay,
        });

        await expect(mockRpcHandlers.get('codex-runtime-status')?.({ sessionId: 'happy-1' })).resolves.toEqual({
            type: 'success',
            session: status,
        });
        await expect(mockRpcHandlers.get('codex-runtime-replay')?.({
            sessionId: 'happy-1',
            afterSeq: 1.8,
            limit: 50.4,
        })).resolves.toEqual({
            type: 'success',
            entries: [expect.objectContaining({ seq: 2, eventType: 'daemon-runtime-resume-result' })],
        });

        expect(runtimeStatus).toHaveBeenCalledWith('happy-1');
        expect(runtimeReplay).toHaveBeenCalledWith('happy-1', { afterSeq: 1, limit: 50 });
    });

    it('rejects Codex runtime RPC calls without a session id', async () => {
        const client = new ApiMachineClient('fake-token', makeMachine());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
            codexRuntimeStatus: vi.fn(),
            codexRuntimeReplay: vi.fn(),
        });

        await expect(mockRpcHandlers.get('codex-runtime-status')?.({})).rejects.toThrow('sessionId is required');
        await expect(mockRpcHandlers.get('codex-runtime-replay')?.({})).rejects.toThrow('sessionId is required');
    });
});
