import { describe, expect, it } from 'vitest';
import { createDaemonCodexRuntimeManager, isDaemonCodexRuntimeManagerEnabled } from './codexRuntimeManager';

describe('DaemonCodexRuntimeManager', () => {
  it('is disabled unless the feature flag is enabled', () => {
    expect(isDaemonCodexRuntimeManagerEnabled({})).toBe(false);
    expect(isDaemonCodexRuntimeManagerEnabled({ HAPPY_CODEX_DAEMON_RUNTIME_MANAGER: '1' })).toBe(true);
    expect(isDaemonCodexRuntimeManagerEnabled({ HAPPIER_CODEX_DAEMON_RUNTIME_MANAGER: 'true' })).toBe(true);
  });

  it('ignores non-Codex sessions and returns no replay when disabled', () => {
    const manager = createDaemonCodexRuntimeManager({ enabled: false });
    manager.registerSession({
      sessionId: 'happy-1',
      pid: 123,
      metadata: { flavor: 'codex', path: '/tmp/project', host: 'mac', codexThreadId: 'thread-1' } as any,
    });

    expect(manager.getSession('happy-1')).toBeNull();
    expect(manager.replay('happy-1')).toEqual([]);
  });

  it('tracks Codex runtime lifecycle and supports replay by sequence', () => {
    let currentTime = 1000;
    const manager = createDaemonCodexRuntimeManager({
      enabled: true,
      now: () => currentTime++,
    });

    manager.registerSession({
      sessionId: 'happy-1',
      pid: 123,
      metadata: {
        flavor: 'codex',
        path: '/tmp/project',
        host: 'mac',
        hostPid: 123,
        codexThreadId: 'thread-1',
      } as any,
    });
    manager.recordWorkerExited('happy-1');
    manager.recordResumeRequested('happy-1');
    manager.recordResumeResult('happy-1', 'success');

    expect(manager.getSession('happy-1')).toMatchObject({
      sessionId: 'happy-1',
      pid: null,
      threadId: 'thread-1',
      path: '/tmp/project',
      active: false,
      stopped: false,
    });
    expect(manager.replay('happy-1').map((entry) => entry.eventType)).toEqual([
      'daemon-runtime-session-registered',
      'daemon-runtime-worker-exited',
      'daemon-runtime-resume-requested',
      'daemon-runtime-resume-result',
    ]);
    expect(manager.replay('happy-1', { afterSeq: 2 }).map((entry) => entry.eventType)).toEqual([
      'daemon-runtime-resume-requested',
      'daemon-runtime-resume-result',
    ]);
  });

  it('can restore a persisted Codex session as inactive', () => {
    const manager = createDaemonCodexRuntimeManager({ enabled: true });

    manager.registerSession({
      sessionId: 'happy-1',
      pid: null,
      active: false,
      metadata: {
        flavor: 'codex',
        path: '/tmp/project',
        host: 'mac',
        hostPid: 999,
        codexThreadId: 'thread-1',
      } as any,
    });

    expect(manager.getSession('happy-1')).toMatchObject({
      pid: null,
      active: false,
      threadId: 'thread-1',
    });
  });

  it('marks a stopped runtime inactive without losing replay history', () => {
    const manager = createDaemonCodexRuntimeManager({ enabled: true });

    manager.registerSession({
      sessionId: 'happy-1',
      pid: 123,
      metadata: { flavor: 'codex', path: '/tmp/project', host: 'mac', codexThreadId: 'thread-1' } as any,
    });
    manager.recordStopRequested('happy-1');

    expect(manager.getSession('happy-1')).toMatchObject({
      active: false,
      stopped: true,
    });
    expect(manager.replay('happy-1').map((entry) => entry.eventType)).toEqual([
      'daemon-runtime-session-registered',
      'daemon-runtime-stop-requested',
    ]);
  });

  it('records adapter journal entries for RPC replay', () => {
    const manager = createDaemonCodexRuntimeManager({ enabled: true });

    manager.registerSession({
      sessionId: 'happy-1',
      pid: 123,
      metadata: { flavor: 'codex', path: '/tmp/project', host: 'mac', codexThreadId: 'thread-1' } as any,
    });
    manager.recordJournalEntry('happy-1', {
      kind: 'event',
      threadId: 'thread-2',
      turnId: 'turn-1',
      eventType: 'task_started',
      payload: { type: 'task_started', turn_id: 'turn-1' },
    });

    expect(manager.getSession('happy-1')).toMatchObject({
      threadId: 'thread-2',
    });
    expect(manager.replay('happy-1').at(-1)).toMatchObject({
      kind: 'event',
      threadId: 'thread-2',
      turnId: 'turn-1',
      eventType: 'task_started',
      payload: { type: 'task_started', turn_id: 'turn-1' },
    });
  });
});
