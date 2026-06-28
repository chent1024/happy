import type {
    ApprovalPolicy,
    EventMsg,
    GetAccountRateLimitsResponse,
    InputItem,
    ReasoningEffort,
    ReadConversationResponse,
    ReviewDecision,
    SandboxMode,
    ThreadGoalClearParams,
    ThreadGoalClearResponse,
    ThreadGoalSetParams,
    ThreadGoalSetResponse,
} from '../codexAppServerTypes';
import type { ApprovalHandler } from '../codexAppServerClient';
import type { CodexRuntimeEventJournal } from './codexRuntimeEventJournal';

export type CodexRuntimeThreadOptions = {
    model?: string;
    cwd?: string;
    approvalPolicy?: ApprovalPolicy;
    sandbox?: SandboxMode;
    mcpServers?: Record<string, unknown>;
};

export type CodexRuntimeTurnOptions = {
    model?: string;
    cwd?: string;
    approvalPolicy?: ApprovalPolicy;
    sandbox?: SandboxMode;
    effort?: ReasoningEffort;
    extraInputItems?: InputItem[];
    turnTimeoutMs?: number;
};

export type CodexRuntimeTurnResult = {
    aborted: boolean;
    runtimeInterrupted?: boolean;
    recoveredFromRuntime?: boolean;
    recoveredFromHistory?: boolean;
    retried?: boolean;
    threadId?: string;
};

export type CodexRuntimeSteerResult = {
    steered: boolean;
    reason?: 'no-active-turn' | 'turn-mismatch' | 'non-steerable' | 'empty-input' | 'error';
    error?: unknown;
};

export type CodexRuntimeAbortResult = {
    hadActiveTurn: boolean;
    aborted: boolean;
    forcedRestart: boolean;
    resumedThread: boolean;
};

export interface CodexRuntimeAdapter {
    readonly threadId: string | null;
    readonly turnId: string | null;
    readonly sandboxEnabled: boolean;
    readonly journal: CodexRuntimeEventJournal;

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
    sendTurnAndWait(prompt: string, opts?: CodexRuntimeTurnOptions): Promise<CodexRuntimeTurnResult>;
    abortTurnWithFallback(opts?: {
        gracePeriodMs?: number;
        forceRestartOnTimeout?: boolean;
    }): Promise<CodexRuntimeAbortResult>;
}

export type CodexRuntimeApprovalHandler = (params: Parameters<ApprovalHandler>[0]) => Promise<ReviewDecision>;
