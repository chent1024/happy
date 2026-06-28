import type { Metadata } from '@/api/types';
import { CodexRuntimeEventJournal, type CodexRuntimeJournalEntry } from '@/codex/runtime/codexRuntimeEventJournal';

export type DaemonCodexRuntimeSession = {
  sessionId: string;
  pid: number | null;
  threadId: string | null;
  path: string | null;
  active: boolean;
  stopped: boolean;
  createdAt: number;
  updatedAt: number;
  journal: CodexRuntimeEventJournal;
};

export type DaemonCodexRuntimeStatus = Omit<DaemonCodexRuntimeSession, 'journal'>;

export type DaemonCodexRuntimeReplayOptions = {
  afterSeq?: number;
  limit?: number;
};

export type DaemonCodexRuntimeManager = {
  readonly enabled: boolean;
  registerSession(opts: {
    sessionId: string;
    pid?: number | null;
    metadata?: Metadata | null;
    active?: boolean;
  }): void;
  recordWorkerExited(sessionId: string): void;
  recordStopRequested(sessionId: string): void;
  recordResumeRequested(sessionId: string): void;
  recordResumeResult(sessionId: string, result: 'success' | 'error'): void;
  recordJournalEntry(sessionId: string, entry: Omit<CodexRuntimeJournalEntry, 'seq' | 'createdAt'>): void;
  replay(sessionId: string, opts?: DaemonCodexRuntimeReplayOptions): CodexRuntimeJournalEntry[];
  getSession(sessionId: string): DaemonCodexRuntimeStatus | null;
  clearSession(sessionId: string): void;
};

export function isDaemonCodexRuntimeManagerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.HAPPY_CODEX_DAEMON_RUNTIME_MANAGER ?? env.HAPPIER_CODEX_DAEMON_RUNTIME_MANAGER;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function createDaemonCodexRuntimeManager(opts?: {
  enabled?: boolean;
  now?: () => number;
}): DaemonCodexRuntimeManager {
  const enabled = opts?.enabled ?? isDaemonCodexRuntimeManagerEnabled();
  const now = opts?.now ?? Date.now;
  const sessions = new Map<string, DaemonCodexRuntimeSession>();

  const getOrCreate = (sessionId: string): DaemonCodexRuntimeSession => {
    const existing = sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const timestamp = now();
    const created: DaemonCodexRuntimeSession = {
      sessionId,
      pid: null,
      threadId: null,
      path: null,
      active: false,
      stopped: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      journal: new CodexRuntimeEventJournal(),
    };
    sessions.set(sessionId, created);
    return created;
  };

  const touch = (session: DaemonCodexRuntimeSession) => {
    session.updatedAt = now();
  };

  const recordLifecycle = (
    session: DaemonCodexRuntimeSession,
    eventType: string,
    payload?: Record<string, unknown>,
  ) => {
    session.journal.recordLifecycle(eventType, {
      threadId: session.threadId,
      payload: {
        sessionId: session.sessionId,
        pid: session.pid,
        ...payload,
      },
    });
  };

  const manager: DaemonCodexRuntimeManager = {
    enabled,

    registerSession({ sessionId, pid, metadata, active }) {
      if (!enabled || metadata?.flavor !== 'codex') {
        return;
      }
      const session = getOrCreate(sessionId);
      session.pid = pid !== undefined ? pid : metadata.hostPid ?? session.pid;
      session.threadId = metadata.codexThreadId ?? session.threadId;
      session.path = metadata.path ?? session.path;
      session.active = active ?? true;
      session.stopped = false;
      touch(session);
      recordLifecycle(session, 'daemon-runtime-session-registered');
    },

    recordWorkerExited(sessionId) {
      if (!enabled) return;
      const session = sessions.get(sessionId);
      if (!session) return;
      session.active = false;
      session.pid = null;
      touch(session);
      recordLifecycle(session, 'daemon-runtime-worker-exited');
    },

    recordStopRequested(sessionId) {
      if (!enabled) return;
      const session = sessions.get(sessionId);
      if (!session) return;
      session.active = false;
      session.stopped = true;
      touch(session);
      recordLifecycle(session, 'daemon-runtime-stop-requested');
    },

    recordResumeRequested(sessionId) {
      if (!enabled) return;
      const session = sessions.get(sessionId);
      if (!session) return;
      touch(session);
      recordLifecycle(session, 'daemon-runtime-resume-requested');
    },

    recordResumeResult(sessionId, result) {
      if (!enabled) return;
      const session = sessions.get(sessionId);
      if (!session) return;
      if (result === 'success') {
        session.stopped = false;
      }
      touch(session);
      recordLifecycle(session, 'daemon-runtime-resume-result', { result });
    },

    recordJournalEntry(sessionId, entry) {
      if (!enabled) return;
      const session = sessions.get(sessionId);
      if (!session) return;
      session.threadId = entry.threadId ?? session.threadId;
      touch(session);
      session.journal.recordExternalEntry(entry);
    },

    replay(sessionId, replayOpts) {
      if (!enabled) return [];
      return sessions.get(sessionId)?.journal.replay(replayOpts) ?? [];
    },

    getSession(sessionId) {
      if (!enabled) return null;
      const session = sessions.get(sessionId);
      if (!session) return null;
      const { journal: _journal, ...rest } = session;
      return { ...rest };
    },

    clearSession(sessionId) {
      if (!enabled) return;
      sessions.delete(sessionId);
    },
  };

  return manager;
}
