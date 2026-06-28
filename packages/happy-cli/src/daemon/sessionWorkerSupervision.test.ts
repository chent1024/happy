import { describe, expect, it } from 'vitest';
import {
  classifySessionWorker,
  ensureSessionWorkerLive,
  findLiveTrackedSessionForId,
  metadataNeedsServerRefresh,
  restartSessionWorker,
} from './sessionWorkerSupervision';
import type { TrackedSession } from './types';

function session(overrides: Partial<TrackedSession> = {}): TrackedSession {
  return {
    startedBy: 'daemon',
    happySessionId: 'session-1',
    pid: 1234,
    happySessionMetadataFromLocalWebhook: {
      path: '/tmp/project',
      host: 'macbook',
      version: '1.0.0',
      flavor: 'codex',
      codexThreadId: 'thread-1',
    } as any,
    encryption: {
      encryptionKey: new Uint8Array(32),
      encryptionVariant: 'legacy',
      seq: 1,
      metadataVersion: 1,
      agentStateVersion: 1,
    },
    ...overrides,
  };
}

describe('session worker supervision', () => {
  it('classifies an alive worker as running', () => {
    const result = classifySessionWorker({
      sessionId: 'session-1',
      tracked: session(),
      currentCliVersion: '1.0.0',
      isAlive: () => true,
    });

    expect(result).toEqual({
      state: 'running',
      sessionId: 'session-1',
      pid: 1234,
      startedVersion: '1.0.0',
    });
  });

  it('classifies an alive worker from an older CLI as stale but still running', () => {
    const result = classifySessionWorker({
      sessionId: 'session-1',
      tracked: session(),
      currentCliVersion: '1.1.0',
      isAlive: () => true,
    });

    expect(result).toEqual({
      state: 'stale-version',
      sessionId: 'session-1',
      pid: 1234,
      startedVersion: '1.0.0',
      currentVersion: '1.1.0',
    });
  });

  it('classifies an exited Codex worker with encryption and thread id as resumable', () => {
    const result = classifySessionWorker({
      sessionId: 'session-1',
      finished: session(),
      currentCliVersion: '1.0.0',
      isAlive: () => false,
    });

    expect(result).toEqual({
      state: 'exited-resumable',
      sessionId: 'session-1',
      startedVersion: '1.0.0',
    });
  });

  it('rejects exited workers that cannot be resumed safely', () => {
    const result = classifySessionWorker({
      sessionId: 'session-1',
      finished: session({
        happySessionMetadataFromLocalWebhook: {
          path: '/tmp/project',
          host: 'macbook',
          flavor: 'codex',
        } as any,
      }),
      currentCliVersion: '1.0.0',
      isAlive: () => false,
    });

    expect(result).toMatchObject({
      state: 'exited-not-resumable',
      sessionId: 'session-1',
      reason: 'missing-provider-resume-id',
    });
  });

  it('reports unknown sessions without treating them as resumable', () => {
    const result = classifySessionWorker({
      sessionId: 'missing-session',
      currentCliVersion: '1.0.0',
      isAlive: () => false,
    });

    expect(result).toMatchObject({
      state: 'unknown',
      sessionId: 'missing-session',
      reason: 'missing-session-record',
    });
  });

  it('detects metadata that needs a server refresh before resume', () => {
    expect(metadataNeedsServerRefresh({ flavor: 'codex', path: '/tmp', host: 'macbook' } as any)).toBe(true);
    expect(metadataNeedsServerRefresh({ flavor: 'codex', path: '/tmp', host: 'macbook', codexThreadId: 'thread-1' } as any)).toBe(false);
    expect(metadataNeedsServerRefresh({ path: '/tmp', host: 'macbook' } as any)).toBe(true);
    expect(metadataNeedsServerRefresh({ path: '/tmp', host: 'macbook', claudeSessionId: 'claude-1' } as any)).toBe(false);
  });

  it('prunes dead tracked sessions and continues to a later live worker for the same session', () => {
    const dead = session({ pid: 1111 });
    const live = session({ pid: 2222 });
    const pruned: number[] = [];

    const result = findLiveTrackedSessionForId({
      sessionId: 'session-1',
      trackedSessions: [
        [1111, dead],
        [2222, live],
      ],
      isAlive: (pid) => pid === 2222,
      onDeadTrackedSession: (pid) => pruned.push(pid),
    });

    expect(result).toBe(live);
    expect(pruned).toEqual([1111]);
  });

  it('returns running from ensure-live without resuming live workers', async () => {
    let resumeCalls = 0;
    const result = await ensureSessionWorkerLive({
      sessionId: 'session-1',
      tracked: session(),
      currentCliVersion: '1.0.0',
      isAlive: () => true,
      resumeSession: async () => {
        resumeCalls++;
        return { type: 'success', sessionId: 'session-1' };
      },
    });

    expect(result).toEqual({
      type: 'running',
      sessionId: 'session-1',
      workerState: 'running',
      pid: 1234,
      startedVersion: '1.0.0',
    });
    expect(resumeCalls).toBe(0);
  });

  it('resumes exited resumable workers through the provided resume path', async () => {
    const result = await ensureSessionWorkerLive({
      sessionId: 'session-1',
      finished: session(),
      currentCliVersion: '1.0.0',
      isAlive: () => false,
      options: { model: 'gpt-5.5', permissionMode: 'yolo', reason: 'send-message' },
      resumeSession: async (sessionId, options) => {
        expect(sessionId).toBe('session-1');
        expect(options).toEqual({ model: 'gpt-5.5', permissionMode: 'yolo' });
        return { type: 'success', sessionId: 'session-1' };
      },
    });

    expect(result).toEqual({
      type: 'resumed',
      sessionId: 'session-1',
    });
  });

  it('returns structured not-resumable when resume fails', async () => {
    const result = await ensureSessionWorkerLive({
      sessionId: 'session-1',
      finished: session(),
      currentCliVersion: '1.0.0',
      isAlive: () => false,
      resumeSession: async () => ({ type: 'error', errorMessage: 'resume failed' }),
    });

    expect(result).toEqual({
      type: 'not-resumable',
      sessionId: 'session-1',
      workerState: 'exited-not-resumable',
      reason: 'resume-failed',
      detail: 'resume failed',
    });
  });

  it('stops a running worker before resuming it during restart', async () => {
    const events: string[] = [];
    const running = session();

    const result = await restartSessionWorker({
      sessionId: 'session-1',
      tracked: running,
      currentCliVersion: '1.0.0',
      isAlive: () => true,
      stopSession: async (sessionId) => {
        events.push(`stop:${sessionId}`);
        return true;
      },
      resumeSession: async (sessionId, options) => {
        events.push(`resume:${sessionId}:${options?.model}:${options?.permissionMode}`);
        return { type: 'success', sessionId };
      },
      options: { model: 'gpt-5.5', permissionMode: 'yolo' },
    });

    expect(result).toEqual({ type: 'resumed', sessionId: 'session-1' });
    expect(events).toEqual(['stop:session-1', 'resume:session-1:gpt-5.5:yolo']);
  });

  it('returns not-resumable when restart cannot stop a running worker', async () => {
    const result = await restartSessionWorker({
      sessionId: 'session-1',
      tracked: session(),
      currentCliVersion: '1.0.0',
      isAlive: () => true,
      stopSession: async () => false,
      resumeSession: async () => {
        throw new Error('should not resume');
      },
    });

    expect(result).toEqual({
      type: 'not-resumable',
      sessionId: 'session-1',
      workerState: 'running',
      reason: 'stop-failed',
      detail: 'Failed to stop the running session before restart.',
    });
  });
});
