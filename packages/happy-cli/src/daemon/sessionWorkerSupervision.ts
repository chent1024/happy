import type { Metadata } from '@/api/types';
import type {
  EnsureSessionLiveResult,
  SessionWorkerAvailability,
  SessionWorkerUnavailableReason,
  TrackedSession,
} from './types';

export type ProcessAliveCheck = (pid: number) => boolean;

export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function findLiveTrackedSessionForId(params: {
  sessionId: string;
  trackedSessions: Iterable<[number, TrackedSession]>;
  isAlive?: ProcessAliveCheck;
  onDeadTrackedSession?: (pid: number, session: TrackedSession) => void;
}): TrackedSession | undefined {
  const isAlive = params.isAlive ?? isProcessAlive;

  for (const [pid, session] of params.trackedSessions) {
    if (session.happySessionId !== params.sessionId) {
      continue;
    }

    if (isAlive(pid)) {
      return session;
    }

    params.onDeadTrackedSession?.(pid, session);
  }

  return undefined;
}

export function metadataNeedsServerRefresh(metadata: Metadata): boolean {
  return (!metadata.claudeSessionId && (!metadata.flavor || metadata.flavor === 'claude'))
    || (!metadata.codexThreadId && metadata.flavor === 'codex');
}

function providerResumeIssue(metadata: Metadata): SessionWorkerUnavailableReason | null {
  const flavor = metadata.flavor ?? 'claude';
  if (flavor === 'codex') {
    return metadata.codexThreadId ? null : 'missing-provider-resume-id';
  }
  if (flavor === 'claude' || flavor === null || flavor === undefined) {
    return metadata.claudeSessionId ? null : 'missing-provider-resume-id';
  }
  return 'unsupported-provider';
}

function startedVersion(session: TrackedSession | undefined): string | undefined {
  return session?.happySessionMetadataFromLocalWebhook?.version;
}

function notResumable(
  sessionId: string,
  reason: SessionWorkerUnavailableReason,
  detail?: string,
): SessionWorkerAvailability {
  return {
    state: 'exited-not-resumable',
    sessionId,
    reason,
    ...(detail ? { detail } : {}),
  };
}

export function classifySessionWorker(params: {
  sessionId: string;
  tracked?: TrackedSession;
  finished?: TrackedSession;
  currentCliVersion: string;
  isAlive?: ProcessAliveCheck;
}): SessionWorkerAvailability {
  const { sessionId, tracked, finished, currentCliVersion } = params;
  const isAlive = params.isAlive ?? isProcessAlive;
  const candidate = tracked ?? finished;

  if (!candidate) {
    return {
      state: 'unknown',
      sessionId,
      reason: 'missing-session-record',
      detail: `Session ${sessionId} is not tracked by this daemon.`,
    };
  }

  if (tracked && isAlive(tracked.pid)) {
    const version = startedVersion(tracked);
    if (version && version !== currentCliVersion) {
      return {
        state: 'stale-version',
        sessionId,
        pid: tracked.pid,
        startedVersion: version,
        currentVersion: currentCliVersion,
      };
    }
    return {
      state: 'running',
      sessionId,
      pid: tracked.pid,
      ...(version ? { startedVersion: version } : {}),
    };
  }

  const metadata = candidate.happySessionMetadataFromLocalWebhook;
  if (!metadata) {
    return notResumable(sessionId, 'missing-metadata');
  }
  if (!candidate.encryption) {
    return notResumable(sessionId, 'missing-encryption');
  }

  const providerIssue = providerResumeIssue(metadata);
  if (providerIssue) {
    return notResumable(sessionId, providerIssue, `Unsupported or incomplete provider metadata for flavor ${metadata.flavor ?? 'claude'}.`);
  }

  return {
    state: 'exited-resumable',
    sessionId,
    ...(startedVersion(candidate) ? { startedVersion: startedVersion(candidate) } : {}),
  };
}

type EnsureResumeResult =
  | { type: 'success'; sessionId: string }
  | { type: 'requestToApproveDirectoryCreation'; directory: string }
  | { type: 'error'; errorMessage: string };

export async function ensureSessionWorkerLive(params: {
  sessionId: string;
  tracked?: TrackedSession;
  finished?: TrackedSession;
  currentCliVersion: string;
  options?: { model?: string; permissionMode?: string; reason?: string };
  isAlive?: ProcessAliveCheck;
  refreshMetadataIfNeeded?: (session: TrackedSession | undefined) => Promise<void>;
  resumeSession: (sessionId: string, options?: { model?: string; permissionMode?: string }) => Promise<EnsureResumeResult>;
  log?: (message: string) => void;
}): Promise<EnsureSessionLiveResult> {
  const {
    sessionId,
    tracked,
    finished,
    currentCliVersion,
    options,
    refreshMetadataIfNeeded,
    resumeSession,
    log,
  } = params;
  const candidate = tracked ?? finished;

  await refreshMetadataIfNeeded?.(candidate);

  const availability = classifySessionWorker({
    sessionId,
    tracked,
    finished,
    currentCliVersion,
    isAlive: params.isAlive,
  });

  if (availability.state === 'running' || availability.state === 'stale-version') {
    log?.(`ensure-live: session ${sessionId} already ${availability.state}`);
    return {
      type: 'running',
      sessionId,
      workerState: availability.state,
      pid: availability.pid,
      ...(availability.startedVersion ? { startedVersion: availability.startedVersion } : {}),
      ...(availability.state === 'stale-version' ? { currentVersion: availability.currentVersion } : {}),
    };
  }

  if (availability.state !== 'exited-resumable') {
    log?.(`ensure-live: session ${sessionId} is not resumable (${availability.state})`);
    return {
      type: 'not-resumable',
      sessionId,
      workerState: availability.state,
      reason: availability.reason,
      ...(availability.detail ? { detail: availability.detail } : {}),
    };
  }

  log?.(`ensure-live: resuming session ${sessionId} reason=${options?.reason ?? 'unknown'}`);
  const result = await resumeSession(sessionId, {
    model: options?.model,
    permissionMode: options?.permissionMode,
  });
  if (result.type === 'success') {
    return {
      type: 'resumed',
      sessionId: result.sessionId,
    };
  }
  if (result.type === 'requestToApproveDirectoryCreation') {
    return {
      type: 'not-resumable',
      sessionId,
      workerState: 'exited-not-resumable',
      reason: 'resume-failed',
      detail: `Resume unexpectedly requested directory creation for ${result.directory}.`,
    };
  }
  return {
    type: 'not-resumable',
    sessionId,
    workerState: 'exited-not-resumable',
    reason: 'resume-failed',
    detail: result.errorMessage,
  };
}

export async function restartSessionWorker(params: {
  sessionId: string;
  tracked?: TrackedSession;
  finished?: TrackedSession;
  currentCliVersion: string;
  options?: { model?: string; permissionMode?: string; reason?: string };
  isAlive?: ProcessAliveCheck;
  refreshMetadataIfNeeded?: (session: TrackedSession | undefined) => Promise<void>;
  stopSession: (sessionId: string) => boolean | Promise<boolean>;
  resumeSession: (sessionId: string, options?: { model?: string; permissionMode?: string }) => Promise<EnsureResumeResult>;
  log?: (message: string) => void;
}): Promise<EnsureSessionLiveResult> {
  const {
    sessionId,
    tracked,
    finished,
    currentCliVersion,
    options,
    refreshMetadataIfNeeded,
    stopSession,
    resumeSession,
    log,
  } = params;
  const candidate = tracked ?? finished;

  await refreshMetadataIfNeeded?.(candidate);

  const availability = classifySessionWorker({
    sessionId,
    tracked,
    finished,
    currentCliVersion,
    isAlive: params.isAlive,
  });

  if (availability.state === 'running' || availability.state === 'stale-version') {
    log?.(`restart-session: stopping running session ${sessionId} before resume`);
    const stopped = await stopSession(sessionId);
    if (!stopped) {
      return {
        type: 'not-resumable',
        sessionId,
        workerState: availability.state,
        reason: 'stop-failed',
        detail: 'Failed to stop the running session before restart.',
      };
    }
  } else if (availability.state !== 'exited-resumable') {
    log?.(`restart-session: session ${sessionId} is not resumable (${availability.state})`);
    return {
      type: 'not-resumable',
      sessionId,
      workerState: availability.state,
      reason: availability.reason,
      ...(availability.detail ? { detail: availability.detail } : {}),
    };
  }

  log?.(`restart-session: resuming session ${sessionId} reason=${options?.reason ?? 'manual-restart'}`);
  const result = await resumeSession(sessionId, {
    model: options?.model,
    permissionMode: options?.permissionMode,
  });
  if (result.type === 'success') {
    return {
      type: 'resumed',
      sessionId: result.sessionId,
    };
  }
  if (result.type === 'requestToApproveDirectoryCreation') {
    return {
      type: 'not-resumable',
      sessionId,
      workerState: 'exited-not-resumable',
      reason: 'resume-failed',
      detail: `Resume unexpectedly requested directory creation for ${result.directory}.`,
    };
  }
  return {
    type: 'not-resumable',
    sessionId,
    workerState: 'exited-not-resumable',
    reason: 'resume-failed',
    detail: result.errorMessage,
  };
}
