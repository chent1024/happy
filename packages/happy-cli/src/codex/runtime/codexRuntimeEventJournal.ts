import type { EventMsg } from '../codexAppServerTypes';

export type CodexRuntimeJournalEntry = {
    seq: number;
    createdAt: number;
    kind: 'lifecycle' | 'event';
    threadId: string | null;
    turnId: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
};

export class CodexRuntimeEventJournal {
    private readonly maxEntries: number;
    private entries: CodexRuntimeJournalEntry[] = [];
    private nextSeq = 1;
    private readonly listeners = new Set<(entry: CodexRuntimeJournalEntry) => void>();

    constructor(opts?: { maxEntries?: number }) {
        this.maxEntries = opts?.maxEntries ?? 500;
    }

    recordLifecycle(eventType: string, opts?: {
        threadId?: string | null;
        turnId?: string | null;
        payload?: Record<string, unknown>;
    }): CodexRuntimeJournalEntry {
        return this.push({
            kind: 'lifecycle',
            eventType,
            threadId: opts?.threadId ?? null,
            turnId: opts?.turnId ?? null,
            payload: opts?.payload,
        });
    }

    recordEvent(msg: EventMsg, opts?: {
        threadId?: string | null;
        turnId?: string | null;
    }): CodexRuntimeJournalEntry {
        return this.push({
            kind: 'event',
            eventType: msg.type,
            threadId: opts?.threadId ?? null,
            turnId: extractEventTurnId(msg) ?? opts?.turnId ?? null,
            payload: msg,
        });
    }

    snapshot(): CodexRuntimeJournalEntry[] {
        return [...this.entries];
    }

    onEntry(listener: (entry: CodexRuntimeJournalEntry) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    recordExternalEntry(entry: Omit<CodexRuntimeJournalEntry, 'seq' | 'createdAt'>): CodexRuntimeJournalEntry {
        return this.push(entry);
    }

    replay(opts?: { afterSeq?: number; limit?: number }): CodexRuntimeJournalEntry[] {
        const afterSeq = opts?.afterSeq ?? 0;
        const limit = opts?.limit ?? this.maxEntries;
        return this.entries
            .filter((entry) => entry.seq > afterSeq)
            .slice(-Math.max(0, limit));
    }

    clear(): void {
        this.entries = [];
    }

    private push(entry: Omit<CodexRuntimeJournalEntry, 'seq' | 'createdAt'>): CodexRuntimeJournalEntry {
        const next: CodexRuntimeJournalEntry = {
            ...entry,
            seq: this.nextSeq++,
            createdAt: Date.now(),
        };
        this.entries.push(next);
        if (this.entries.length > this.maxEntries) {
            this.entries.splice(0, this.entries.length - this.maxEntries);
        }
        for (const listener of this.listeners) {
            listener(next);
        }
        return next;
    }
}

function extractEventTurnId(msg: EventMsg): string | null {
    const turnId = msg.turn_id ?? msg.turnId;
    return typeof turnId === 'string' && turnId.length > 0 ? turnId : null;
}
