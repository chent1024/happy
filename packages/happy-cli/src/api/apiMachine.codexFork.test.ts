import { beforeEach, describe, expect, it, vi } from 'vitest';

const { codexClientMethods } = vi.hoisted(() => ({
    codexClientMethods: {
        connect: vi.fn(),
        disconnect: vi.fn(),
        forkThread: vi.fn(),
        listThreads: vi.fn(),
        readThread: vi.fn(),
        readAccountRateLimits: vi.fn(),
        rollbackThread: vi.fn(),
        injectItems: vi.fn(),
    },
}));

vi.mock('@/codex/codexAppServerClient', () => ({
    CodexAppServerClient: vi.fn().mockImplementation(() => codexClientMethods),
}));

function machineClient() {
    return {
        id: 'machine-1',
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy',
    } as any;
}

function handlersFrom(client: any): Map<string, (params: any) => Promise<any>> {
    return client.rpcHandlerManager.handlers;
}

describe('ApiMachineClient Codex fork RPCs', () => {
    beforeEach(() => {
        for (const method of Object.values(codexClientMethods)) {
            method.mockReset();
        }
        codexClientMethods.connect.mockResolvedValue(undefined);
        codexClientMethods.disconnect.mockResolvedValue(undefined);
        codexClientMethods.readThread.mockResolvedValue({
            thread: {
                id: 'thread-default',
                turns: [],
            },
        });
    });

    it('registers a full Codex thread fork RPC', async () => {
        codexClientMethods.forkThread.mockResolvedValue({
            threadId: 'thread-forked',
            thread: { id: 'thread-forked', turns: [] },
        });

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:codex-fork-thread')?.({
            directory: '/tmp/project',
            codexThreadId: 'thread-source',
        });

        expect(result).toEqual({ type: 'success', newCodexThreadId: 'thread-forked' });
        expect(codexClientMethods.connect).toHaveBeenCalledOnce();
        expect(codexClientMethods.forkThread).toHaveBeenCalledWith({
            threadId: 'thread-source',
            cwd: '/tmp/project',
        });
        expect(codexClientMethods.disconnect).toHaveBeenCalledOnce();
    });

    it('forwards resumeCodexThreadId through the spawn RPC', async () => {
        const spawnSession = vi.fn().mockResolvedValue({ type: 'success', sessionId: 'happy-forked' });

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession,
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:spawn-happy-session')?.({
            directory: '/tmp/project',
            agent: 'codex',
            resumeCodexThreadId: 'thread-forked',
            parentSessionId: 'happy-source',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'happy-forked' });
        expect(spawnSession).toHaveBeenCalledWith(expect.objectContaining({
            directory: '/tmp/project',
            agent: 'codex',
            resumeCodexThreadId: 'thread-forked',
            parentSessionId: 'happy-source',
        }));
    });

    it('registers ensure-live RPC and forwards resume options', async () => {
        const ensureSessionLive = vi.fn().mockResolvedValue({
            type: 'running',
            sessionId: 'happy-source',
            workerState: 'running',
            pid: 4242,
        });

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            ensureSessionLive,
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:ensure-happy-session-live')?.({
            sessionId: 'happy-source',
            model: 'gpt-5.5',
            permissionMode: 'yolo',
            reason: 'send-message',
        });

        expect(result).toEqual({
            type: 'running',
            sessionId: 'happy-source',
            workerState: 'running',
            pid: 4242,
        });
        expect(ensureSessionLive).toHaveBeenCalledWith('happy-source', {
            model: 'gpt-5.5',
            permissionMode: 'yolo',
            reason: 'send-message',
        });
    });

    it('registers restart session RPC and forwards resume options', async () => {
        const restartSession = vi.fn().mockResolvedValue({
            type: 'resumed',
            sessionId: 'happy-source',
        });

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            restartSession,
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:restart-happy-session')?.({
            sessionId: 'happy-source',
            model: 'gpt-5.5',
            permissionMode: 'yolo',
            reason: 'manual-restart',
        });

        expect(result).toEqual({
            type: 'resumed',
            sessionId: 'happy-source',
        });
        expect(restartSession).toHaveBeenCalledWith('happy-source', {
            model: 'gpt-5.5',
            permissionMode: 'yolo',
            reason: 'manual-restart',
        });
    });

    it('lists Codex rewind points from thread/read', async () => {
        codexClientMethods.readThread.mockResolvedValue({
            thread: {
                id: 'thread-source',
                turns: [{
                    id: 'turn-1',
                    startedAt: 10,
                    items: [
                        { id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'hello' }] },
                    ],
                }],
            },
        });

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:codex-list-rewind-points')?.({
            directory: '/tmp/project',
            codexThreadId: 'thread-source',
        });

        expect(result).toEqual({
            type: 'success',
            points: [{ itemId: 'user-1', text: 'hello', timestamp: 10_000 }],
        });
        expect(codexClientMethods.readThread).toHaveBeenCalledWith({
            threadId: 'thread-source',
            includeTurns: true,
        });
    });

    it('lists recent Codex threads with manual sync defaults', async () => {
        codexClientMethods.listThreads.mockResolvedValue({
            data: [{
                id: 'thread-recent',
                cwd: '/tmp/project',
                preview: 'recent Codex work',
                updatedAt: 1700000000000,
            }],
            nextCursor: null,
            backwardsCursor: null,
        });

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:codex-list-threads')?.({});

        expect(result).toEqual({
            type: 'success',
            threads: [{
                id: 'thread-recent',
                cwd: '/tmp/project',
                preview: 'recent Codex work',
                updatedAt: 1700000000000,
            }],
            nextCursor: null,
            backwardsCursor: null,
        });
        expect(codexClientMethods.connect).toHaveBeenCalledOnce();
        expect(codexClientMethods.listThreads).toHaveBeenCalledWith({
            limit: 200,
            archived: false,
            useStateDbOnly: true,
            sortKey: 'updated_at',
            sortDirection: 'desc',
        });
        expect(codexClientMethods.readThread).toHaveBeenCalledWith({
            threadId: 'thread-recent',
            includeTurns: true,
        });
        expect(codexClientMethods.disconnect).toHaveBeenCalledOnce();
    });

    it('filters unreadable Codex threads from the imported session list', async () => {
        codexClientMethods.listThreads.mockResolvedValue({
            data: [
                {
                    id: 'thread-readable',
                    cwd: '/tmp/project',
                    name: 'Readable work',
                    updatedAt: 1700000000000,
                },
                {
                    id: 'thread-rollout-summary',
                    cwd: '/tmp/project',
                    name: 'Rollout summary',
                    updatedAt: 1700000001000,
                },
            ],
            nextCursor: null,
            backwardsCursor: null,
        });
        codexClientMethods.readThread.mockImplementation(async ({ threadId }: { threadId: string }) => {
            if (threadId === 'thread-rollout-summary') {
                throw new Error('thread-store internal error');
            }
            return {
                thread: {
                    id: threadId,
                    turns: [],
                },
            };
        });

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:codex-list-threads')?.({});

        expect(result).toEqual({
            type: 'success',
            threads: [{
                id: 'thread-readable',
                cwd: '/tmp/project',
                name: 'Readable work',
                updatedAt: 1700000000000,
            }],
            nextCursor: null,
            backwardsCursor: null,
        });
        expect(codexClientMethods.readThread).toHaveBeenCalledWith({
            threadId: 'thread-readable',
            includeTurns: false,
        });
        expect(codexClientMethods.readThread).toHaveBeenCalledWith({
            threadId: 'thread-rollout-summary',
            includeTurns: false,
        });
    });

    it('enriches missing Codex thread names from the first user message', async () => {
        const injectedUserMessage = [
            '# Options',
            'You have a way to give a user a easy way to answer your questions if you know possible answers.',
            '<options>\n    <option>Option 1</option>\n</options>',
            '# Plan mode with options',
            'When you are in the plan mode, you must use the options mode.',
            'Actual user task title',
            'Based on this message, call functions.happy__change_title to change chat session title that would represent the current task.',
        ].join('\n\n');
        codexClientMethods.listThreads.mockResolvedValue({
            data: [{
                id: 'thread-options',
                cwd: '/tmp/project',
                name: null,
                preview: '# Options\n\ninternal prompt text',
                updatedAt: 1700000000000,
            }],
            nextCursor: null,
            backwardsCursor: null,
        });
        codexClientMethods.readThread.mockResolvedValue({
            thread: {
                id: 'thread-options',
                turns: [{
                    id: 'turn-1',
                    items: [{
                        id: 'user-1',
                        type: 'userMessage',
                        content: [{ type: 'text', text: injectedUserMessage }],
                    }],
                }],
            },
        });

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:codex-list-threads')?.({});

        expect(result).toEqual({
            type: 'success',
            threads: [{
                id: 'thread-options',
                cwd: '/tmp/project',
                name: 'Actual user task title',
                preview: '# Options\n\ninternal prompt text',
                updatedAt: 1700000000000,
            }],
            nextCursor: null,
            backwardsCursor: null,
        });
        expect(codexClientMethods.readThread).toHaveBeenCalledWith({
            threadId: 'thread-options',
            includeTurns: true,
        });
    });

    it('reads Codex account rate limits through app-server RPC', async () => {
        codexClientMethods.readAccountRateLimits.mockResolvedValue({
            rateLimits: {
                primary: {
                    usedPercent: 98,
                    remainingPercent: 2,
                    windowDurationMins: 10080,
                    resetsAt: 1700000000,
                },
                secondary: null,
                credits: null,
                rateLimitReachedType: null,
            },
            rateLimitsByLimitId: null,
            rateLimitResetCredits: null,
        });

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:codex-read-account-rate-limits')?.({});

        expect(result).toEqual({
            type: 'success',
            rateLimits: {
                primary: {
                    usedPercent: 98,
                    remainingPercent: 2,
                    windowDurationMins: 10080,
                    resetsAt: 1700000000,
                },
                secondary: null,
                credits: null,
                rateLimitReachedType: null,
            },
        });
        expect(codexClientMethods.connect).toHaveBeenCalledOnce();
        expect(codexClientMethods.readAccountRateLimits).toHaveBeenCalledOnce();
        expect(codexClientMethods.disconnect).toHaveBeenCalledOnce();
    });

    it('duplicates a Codex thread by rolling back turns after the selected item', async () => {
        codexClientMethods.forkThread.mockResolvedValue({
            threadId: 'thread-forked',
            thread: {
                id: 'thread-forked',
                turns: [
                    { id: 'turn-1', items: [{ id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: 'one' }] }] },
                    { id: 'turn-2', items: [{ id: 'user-2', type: 'userMessage', content: [{ type: 'text', text: 'two' }] }] },
                ],
            },
        });
        codexClientMethods.rollbackThread.mockResolvedValue({ thread: { id: 'thread-forked', turns: [] } });
        codexClientMethods.injectItems.mockResolvedValue({});

        const { ApiMachineClient } = await import('./apiMachine');
        const client = new ApiMachineClient('token', machineClient());
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await handlersFrom(client).get('machine-1:codex-duplicate-thread')?.({
            directory: '/tmp/project',
            codexThreadId: 'thread-source',
            cutAfterItemId: 'user-1',
        });

        expect(result).toEqual({ type: 'success', newCodexThreadId: 'thread-forked' });
        expect(codexClientMethods.rollbackThread).toHaveBeenCalledWith({
            threadId: 'thread-forked',
            numTurns: 2,
        });
        expect(codexClientMethods.injectItems).toHaveBeenCalledWith({
            threadId: 'thread-forked',
            items: [{
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: 'one' }],
            }],
        });
    });
});
