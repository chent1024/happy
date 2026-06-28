import { describe, expect, it, vi } from 'vitest';
import { LocalCodexRuntimeAdapter } from './localCodexRuntimeAdapter';
import type { EventMsg, ReadConversationResponse } from '../codexAppServerTypes';

function createClient(overrides?: Partial<MockRuntimeClient>): MockRuntimeClient {
    return {
        threadId: 'thread-1',
        turnId: null,
        sandboxEnabled: false,
        supportsGoalActions: vi.fn(() => true),
        setEventHandler: vi.fn((handler: (msg: EventMsg) => void) => {
            overrides?.setEventHandler?.(handler);
        }),
        setApprovalHandler: vi.fn(),
        connect: vi.fn(async () => {}),
        disconnect: vi.fn(async () => {}),
        hasActiveThread: vi.fn(() => true),
        clearThreadState: vi.fn(),
        startThread: vi.fn(async () => ({ threadId: 'thread-1', model: 'gpt-test' })),
        resumeThread: vi.fn(async () => ({ threadId: 'thread-1', model: 'gpt-test' })),
        readThread: vi.fn(async () => emptyThread()),
        readAccountRateLimits: vi.fn(async () => null),
        setGoal: vi.fn(),
        clearGoal: vi.fn(),
        steerTurn: vi.fn(async () => ({ steered: true })),
        sendTurnAndWait: vi.fn(async () => ({ aborted: false })),
        abortTurnWithFallback: vi.fn(async () => ({
            hadActiveTurn: true,
            aborted: true,
            forcedRestart: false,
            resumedThread: false,
        })),
        reconnectAndResumeThread: vi.fn(async () => true),
        ...overrides,
    };
}

type MockRuntimeClient = {
    threadId: string | null;
    turnId: string | null;
    sandboxEnabled: boolean;
    supportsGoalActions: ReturnType<typeof vi.fn>;
    setEventHandler: ReturnType<typeof vi.fn>;
    setApprovalHandler: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    hasActiveThread: ReturnType<typeof vi.fn>;
    clearThreadState: ReturnType<typeof vi.fn>;
    startThread: ReturnType<typeof vi.fn>;
    resumeThread: ReturnType<typeof vi.fn>;
    readThread: ReturnType<typeof vi.fn>;
    readAccountRateLimits: ReturnType<typeof vi.fn>;
    setGoal: ReturnType<typeof vi.fn>;
    clearGoal: ReturnType<typeof vi.fn>;
    steerTurn: ReturnType<typeof vi.fn>;
    sendTurnAndWait: ReturnType<typeof vi.fn>;
    abortTurnWithFallback: ReturnType<typeof vi.fn>;
    reconnectAndResumeThread: ReturnType<typeof vi.fn>;
};

function emptyThread(): ReadConversationResponse {
    return { thread: { id: 'thread-1', turns: [] } };
}

function threadWithUserInput(text: string, extra?: Record<string, unknown>): ReadConversationResponse {
    return {
        thread: {
            id: 'thread-1',
            turns: [{
                id: 'turn-1',
                items: [{
                    type: 'userMessage',
                    id: 'user-1',
                    content: [{ type: 'text', text, ...extra }],
                }],
            }],
        },
    };
}

describe('LocalCodexRuntimeAdapter', () => {
    it('journals lifecycle and forwarded runtime events', async () => {
        let emit: ((msg: EventMsg) => void) | undefined;
        const client = createClient({
            setEventHandler: vi.fn((handler: (msg: EventMsg) => void) => {
                emit = handler;
            }),
        });
        const adapter = new LocalCodexRuntimeAdapter({ client });
        const received: EventMsg[] = [];

        adapter.setEventHandler((msg) => {
            received.push(msg);
        });
        await adapter.connect();
        if (!emit) {
            throw new Error('Expected fake client to capture the event handler');
        }
        emit({ type: 'task_started', turn_id: 'turn-1' });

        expect(received).toEqual([{ type: 'task_started', turn_id: 'turn-1' }]);
        expect(adapter.journal.snapshot()).toEqual([
            expect.objectContaining({ kind: 'lifecycle', eventType: 'connect', threadId: 'thread-1' }),
            expect.objectContaining({ kind: 'event', eventType: 'task_started', threadId: 'thread-1', turnId: 'turn-1' }),
        ]);
    });

    it('reconnects, resumes, and retries when app-server exits before the input is recorded', async () => {
        const client = createClient();
        client.sendTurnAndWait = vi.fn()
            .mockRejectedValueOnce(new Error('Codex process exited (code=1) while waiting for turn/start'))
            .mockResolvedValueOnce({ aborted: false });
        client.readThread = vi.fn(async () => emptyThread());
        const adapter = new LocalCodexRuntimeAdapter({ client });

        await expect(adapter.sendTurnAndWait('hello')).resolves.toEqual({
            aborted: false,
            recoveredFromRuntime: true,
            retried: true,
            threadId: 'thread-1',
        });

        expect(client.reconnectAndResumeThread).toHaveBeenCalledTimes(1);
        expect(client.readThread).toHaveBeenCalledWith({ threadId: 'thread-1', includeTurns: true });
        expect(client.sendTurnAndWait).toHaveBeenCalledTimes(2);
        expect(adapter.journal.snapshot()).toContainEqual(expect.objectContaining({
            kind: 'lifecycle',
            eventType: 'runtime-reconnect-retry-turn',
            threadId: 'thread-1',
        }));
    });

    it('reconnects, resumes, and retries when app-server exits during a turn', async () => {
        const client = createClient();
        client.sendTurnAndWait = vi.fn()
            .mockResolvedValueOnce({ aborted: true, runtimeInterrupted: true })
            .mockResolvedValueOnce({ aborted: false });
        client.readThread = vi.fn(async () => emptyThread());
        const adapter = new LocalCodexRuntimeAdapter({ client });

        await expect(adapter.sendTurnAndWait('hello')).resolves.toEqual({
            aborted: false,
            recoveredFromRuntime: true,
            retried: true,
            threadId: 'thread-1',
        });

        expect(client.reconnectAndResumeThread).toHaveBeenCalledTimes(1);
        expect(client.readThread).toHaveBeenCalledWith({ threadId: 'thread-1', includeTurns: true });
        expect(client.sendTurnAndWait).toHaveBeenCalledTimes(2);
    });

    it('does not retry when the failed input is already present in Codex history', async () => {
        const client = createClient();
        client.sendTurnAndWait = vi.fn()
            .mockRejectedValueOnce(new Error('Codex process disconnected while waiting for turn/start'));
        client.readThread = vi.fn(async () => threadWithUserInput('hello', { text_elements: [] }));
        const adapter = new LocalCodexRuntimeAdapter({ client });

        await expect(adapter.sendTurnAndWait('hello')).resolves.toEqual({
            aborted: false,
            runtimeInterrupted: true,
            recoveredFromRuntime: true,
            recoveredFromHistory: true,
            threadId: 'thread-1',
        });

        expect(client.reconnectAndResumeThread).toHaveBeenCalledTimes(1);
        expect(client.sendTurnAndWait).toHaveBeenCalledTimes(1);
        expect(adapter.journal.snapshot()).toContainEqual(expect.objectContaining({
            kind: 'lifecycle',
            eventType: 'runtime-reconnect-skip-retry',
            threadId: 'thread-1',
        }));
    });

    it('does not recover non-runtime API errors', async () => {
        const client = createClient();
        client.sendTurnAndWait = vi.fn()
            .mockRejectedValueOnce(new Error('Unsupported service_tier: flex'));
        const adapter = new LocalCodexRuntimeAdapter({ client });

        await expect(adapter.sendTurnAndWait('hello')).rejects.toThrow('Unsupported service_tier: flex');

        expect(client.reconnectAndResumeThread).not.toHaveBeenCalled();
    });
});
