import type { SandboxConfig } from '@/persistence';
import { CodexAppServerClient, type ApprovalHandler, type CodexTurnResult } from '../codexAppServerClient';
import type {
    ApprovalPolicy,
    EventMsg,
    GetAccountRateLimitsResponse,
    InputItem,
    ReasoningEffort,
    ReadConversationResponse,
    SandboxMode,
    Thread,
    ThreadGoalClearParams,
    ThreadGoalClearResponse,
    ThreadGoalSetParams,
    ThreadGoalSetResponse,
} from '../codexAppServerTypes';
import type {
    CodexRuntimeAbortResult,
    CodexRuntimeAdapter,
    CodexRuntimeSteerResult,
    CodexRuntimeThreadOptions,
    CodexRuntimeTurnResult,
    CodexRuntimeTurnOptions,
} from './codexRuntimeAdapter';
import { CodexRuntimeEventJournal } from './codexRuntimeEventJournal';

type CodexAppServerClientLike = {
    readonly threadId: string | null;
    readonly turnId: string | null;
    readonly sandboxEnabled: boolean;
    supportsGoalActions(): boolean;
    setEventHandler(handler: (msg: EventMsg) => void): void;
    setApprovalHandler(handler: ApprovalHandler): void;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    hasActiveThread(): boolean;
    clearThreadState(): void;
    startThread(opts: CodexRuntimeThreadOptions): Promise<{ threadId: string; model: string }>;
    resumeThread(opts?: CodexRuntimeThreadOptions & { threadId?: string }): Promise<{ threadId: string; model: string }>;
    readThread(opts: { threadId: string; includeTurns?: boolean }): Promise<ReadConversationResponse>;
    readAccountRateLimits(): Promise<GetAccountRateLimitsResponse | null>;
    setGoal(opts: {
        threadId: string;
        objective: string;
        status?: ThreadGoalSetParams['status'];
        tokenBudget?: number | null;
    }): Promise<ThreadGoalSetResponse>;
    clearGoal(opts: ThreadGoalClearParams): Promise<ThreadGoalClearResponse>;
    steerTurn(prompt: string, opts?: {
        clientUserMessageId?: string | null;
        extraInputItems?: InputItem[];
    }): Promise<CodexRuntimeSteerResult>;
    sendTurnAndWait(prompt: string, opts?: CodexRuntimeTurnOptions): Promise<CodexTurnResult>;
    abortTurnWithFallback(opts?: {
        gracePeriodMs?: number;
        forceRestartOnTimeout?: boolean;
    }): Promise<CodexRuntimeAbortResult>;
    reconnectAndResumeThread(): Promise<boolean>;
};

export class LocalCodexRuntimeAdapter implements CodexRuntimeAdapter {
    readonly journal: CodexRuntimeEventJournal;
    private readonly client: CodexAppServerClientLike;

    constructor(opts?: {
        sandboxConfig?: SandboxConfig;
        client?: CodexAppServerClientLike;
        journal?: CodexRuntimeEventJournal;
    }) {
        this.client = opts?.client ?? new CodexAppServerClient(opts?.sandboxConfig);
        this.journal = opts?.journal ?? new CodexRuntimeEventJournal();
    }

    get threadId(): string | null {
        return this.client.threadId;
    }

    get turnId(): string | null {
        return this.client.turnId;
    }

    get sandboxEnabled(): boolean {
        return this.client.sandboxEnabled;
    }

    supportsGoalActions(): boolean {
        return this.client.supportsGoalActions();
    }

    setEventHandler(handler: (msg: EventMsg) => void): void {
        this.client.setEventHandler((msg) => {
            this.journal.recordEvent(msg, {
                threadId: this.client.threadId,
                turnId: this.client.turnId,
            });
            handler(msg);
        });
    }

    setApprovalHandler(handler: ApprovalHandler): void {
        this.client.setApprovalHandler(handler);
    }

    async connect(): Promise<void> {
        await this.client.connect();
        this.journal.recordLifecycle('connect', {
            threadId: this.client.threadId,
            turnId: this.client.turnId,
        });
    }

    async disconnect(): Promise<void> {
        await this.client.disconnect();
        this.journal.recordLifecycle('disconnect');
    }

    hasActiveThread(): boolean {
        return this.client.hasActiveThread();
    }

    clearThreadState(): void {
        this.client.clearThreadState();
        this.journal.recordLifecycle('clear-thread-state');
    }

    async startThread(opts: CodexRuntimeThreadOptions): Promise<{ threadId: string; model: string }> {
        const result = await this.client.startThread(opts);
        this.journal.recordLifecycle('thread-started', {
            threadId: result.threadId,
            payload: { model: result.model },
        });
        return result;
    }

    async resumeThread(opts?: CodexRuntimeThreadOptions & { threadId?: string }): Promise<{ threadId: string; model: string }> {
        const result = await this.client.resumeThread(opts);
        this.journal.recordLifecycle('thread-resumed', {
            threadId: result.threadId,
            payload: { model: result.model },
        });
        return result;
    }

    readThread(opts: { threadId: string; includeTurns?: boolean }): Promise<ReadConversationResponse> {
        return this.client.readThread(opts);
    }

    readAccountRateLimits(): Promise<GetAccountRateLimitsResponse | null> {
        return this.client.readAccountRateLimits();
    }

    setGoal(opts: {
        threadId: string;
        objective: string;
        status?: ThreadGoalSetParams['status'];
        tokenBudget?: number | null;
    }): Promise<ThreadGoalSetResponse> {
        return this.client.setGoal(opts);
    }

    clearGoal(opts: ThreadGoalClearParams): Promise<ThreadGoalClearResponse> {
        return this.client.clearGoal(opts);
    }

    steerTurn(prompt: string, opts?: {
        clientUserMessageId?: string | null;
        extraInputItems?: InputItem[];
    }): Promise<CodexRuntimeSteerResult> {
        return this.client.steerTurn(prompt, opts);
    }

    async sendTurnAndWait(prompt: string, opts?: CodexRuntimeTurnOptions): Promise<CodexRuntimeTurnResult> {
        try {
            const result = await this.client.sendTurnAndWait(prompt, opts);
            if (!result.runtimeInterrupted) {
                return result;
            }
            return await this.recoverRuntimeInterruptedTurn(prompt, opts, result);
        } catch (error) {
            if (!isRecoverableRuntimeError(error)) {
                throw error;
            }

            return await this.recoverRuntimeInterruptedTurn(prompt, opts, null, error);
        }
    }

    private async recoverRuntimeInterruptedTurn(
        prompt: string,
        opts: CodexRuntimeTurnOptions | undefined,
        interruptedResult: CodexTurnResult | null,
        originalError?: unknown,
    ): Promise<CodexRuntimeTurnResult> {
        const threadId = this.client.threadId;
        if (!threadId) {
            if (originalError) throw originalError;
            return interruptedResult ?? { aborted: true, runtimeInterrupted: true };
        }

        const resumed = await this.client.reconnectAndResumeThread();
        this.journal.recordLifecycle('runtime-reconnect', {
            threadId,
            payload: { resumed },
        });
        if (!resumed) {
            if (originalError) throw originalError;
            return interruptedResult ?? { aborted: true, runtimeInterrupted: true };
        }

        const read = await this.client.readThread({ threadId, includeTurns: true });
        if (threadContainsTurnInput(read.thread, buildExpectedInput(prompt, opts?.extraInputItems))) {
            this.journal.recordLifecycle('runtime-reconnect-skip-retry', {
                threadId,
                payload: { reason: 'turn-input-already-recorded' },
            });
            return {
                aborted: false,
                runtimeInterrupted: true,
                recoveredFromRuntime: true,
                recoveredFromHistory: true,
                threadId,
            };
        }

        this.journal.recordLifecycle('runtime-reconnect-retry-turn', { threadId });
        const retryResult = await this.client.sendTurnAndWait(prompt, opts);
        return {
            ...retryResult,
            recoveredFromRuntime: true,
            retried: true,
            threadId,
        };
    }

    abortTurnWithFallback(opts?: {
        gracePeriodMs?: number;
        forceRestartOnTimeout?: boolean;
    }): Promise<CodexRuntimeAbortResult> {
        return this.client.abortTurnWithFallback(opts);
    }
}

function isRecoverableRuntimeError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Codex process exited')
        || message.includes('Codex process disconnected')
        || message.includes('stdin not writable');
}

function buildExpectedInput(prompt: string, extraInputItems?: InputItem[]): InputItem[] {
    const input: InputItem[] = [];
    const extra = extraInputItems ?? [];
    if (prompt.length > 0 || extra.length === 0) {
        input.push({ type: 'text', text: prompt });
    }
    input.push(...extra);
    return input;
}

function threadContainsTurnInput(thread: Thread, expectedInput: InputItem[]): boolean {
    for (const turn of thread.turns ?? []) {
        for (const item of turn.items ?? []) {
            if (item.type === 'userMessage' && isInputItemArray(item.content) && inputItemsEqual(item.content, expectedInput)) {
                return true;
            }
        }
    }
    return false;
}

function isInputItemArray(value: unknown): value is InputItem[] {
    return Array.isArray(value);
}

function inputItemsEqual(actual: InputItem[], expected: InputItem[]): boolean {
    if (actual.length !== expected.length) {
        return false;
    }
    for (let i = 0; i < actual.length; i++) {
        if (!inputItemMatches(actual[i], expected[i])) {
            return false;
        }
    }
    return true;
}

function inputItemMatches(actual: InputItem, expected: InputItem): boolean {
    if (actual.type !== expected.type) {
        return false;
    }
    if (expected.type === 'text') {
        return actual.type === 'text' && actual.text === expected.text;
    }
    if (expected.type === 'image') {
        return actual.type === 'image'
            && actual.url === expected.url
            && (expected.detail === undefined || actual.detail === expected.detail);
    }
    return actual.type === 'localImage'
        && actual.path === expected.path
        && (expected.detail === undefined || actual.detail === expected.detail);
}
