import type { ApprovalHandler } from '../codexAppServerClient';
import type {
    EventMsg,
    GetAccountRateLimitsResponse,
    InputItem,
    ReadConversationResponse,
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
    CodexRuntimeTurnOptions,
    CodexRuntimeTurnResult,
} from './codexRuntimeAdapter';
import type { CodexRuntimeEventJournal, CodexRuntimeJournalEntry } from './codexRuntimeEventJournal';

export class DaemonBackedCodexRuntimeAdapter implements CodexRuntimeAdapter {
    readonly journal: CodexRuntimeEventJournal;
    private readonly unsubscribe: () => void;
    private forwardingDisabled = false;

    constructor(
        private readonly base: CodexRuntimeAdapter,
        private readonly opts: {
            onJournalEntry: (entry: CodexRuntimeJournalEntry) => Promise<{ error?: string } | unknown> | { error?: string } | unknown;
        },
    ) {
        this.journal = base.journal;
        this.unsubscribe = this.journal.onEntry((entry) => {
            if (this.forwardingDisabled) {
                return;
            }
            void Promise.resolve(this.opts.onJournalEntry(entry))
                .then((result) => {
                    if (result && typeof result === 'object' && typeof (result as { error?: unknown }).error === 'string') {
                        this.forwardingDisabled = true;
                    }
                })
                .catch(() => {
                    this.forwardingDisabled = true;
                });
        });
    }

    get threadId(): string | null {
        return this.base.threadId;
    }

    get turnId(): string | null {
        return this.base.turnId;
    }

    get sandboxEnabled(): boolean {
        return this.base.sandboxEnabled;
    }

    supportsGoalActions(): boolean {
        return this.base.supportsGoalActions();
    }

    setEventHandler(handler: (msg: EventMsg) => void): void {
        this.base.setEventHandler(handler);
    }

    setApprovalHandler(handler: ApprovalHandler): void {
        this.base.setApprovalHandler(handler);
    }

    connect(): Promise<void> {
        return this.base.connect();
    }

    async disconnect(): Promise<void> {
        this.unsubscribe();
        await this.base.disconnect();
    }

    hasActiveThread(): boolean {
        return this.base.hasActiveThread();
    }

    clearThreadState(): void {
        this.base.clearThreadState();
    }

    startThread(opts: CodexRuntimeThreadOptions): Promise<{ threadId: string; model: string }> {
        return this.base.startThread(opts);
    }

    resumeThread(opts?: CodexRuntimeThreadOptions & { threadId?: string }): Promise<{ threadId: string; model: string }> {
        return this.base.resumeThread(opts);
    }

    readThread(opts: { threadId: string; includeTurns?: boolean }): Promise<ReadConversationResponse> {
        return this.base.readThread(opts);
    }

    readAccountRateLimits(): Promise<GetAccountRateLimitsResponse | null> {
        return this.base.readAccountRateLimits();
    }

    setGoal(opts: {
        threadId: string;
        objective: string;
        status?: ThreadGoalSetParams['status'];
        tokenBudget?: number | null;
    }): Promise<ThreadGoalSetResponse> {
        return this.base.setGoal(opts);
    }

    clearGoal(opts: ThreadGoalClearParams): Promise<ThreadGoalClearResponse> {
        return this.base.clearGoal(opts);
    }

    steerTurn(prompt: string, opts?: {
        clientUserMessageId?: string | null;
        extraInputItems?: InputItem[];
    }): Promise<CodexRuntimeSteerResult> {
        return this.base.steerTurn(prompt, opts);
    }

    sendTurnAndWait(prompt: string, opts?: CodexRuntimeTurnOptions): Promise<CodexRuntimeTurnResult> {
        return this.base.sendTurnAndWait(prompt, opts);
    }

    abortTurnWithFallback(opts?: {
        gracePeriodMs?: number;
        forceRestartOnTimeout?: boolean;
    }): Promise<CodexRuntimeAbortResult> {
        return this.base.abortTurnWithFallback(opts);
    }
}
