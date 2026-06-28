import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDaemonControlServer } from './controlServer';
import type { TrackedSession } from './types';

type ControlServerHandle = Awaited<ReturnType<typeof startDaemonControlServer>>;

describe('daemon control server Codex runtime bridge', () => {
  let server: ControlServerHandle | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it('accepts Codex runtime journal entries from session workers', async () => {
    const recordCodexRuntimeJournalEntry = vi.fn();
    server = await startDaemonControlServer({
      getChildren: () => [] as TrackedSession[],
      stopSession: vi.fn(() => false),
      spawnSession: vi.fn(async () => ({ type: 'error' as const, errorMessage: 'not used' })),
      requestShutdown: vi.fn(),
      onHappySessionWebhook: vi.fn(),
      recordCodexRuntimeJournalEntry,
    });

    const response = await fetch(`http://127.0.0.1:${server.port}/codex-runtime/journal-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'happy-1',
        entry: {
          kind: 'event',
          threadId: 'thread-1',
          turnId: 'turn-1',
          eventType: 'task_started',
          payload: { type: 'task_started', turn_id: 'turn-1' },
        },
      }),
    });

    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(response.status).toBe(200);
    expect(recordCodexRuntimeJournalEntry).toHaveBeenCalledWith('happy-1', {
      kind: 'event',
      threadId: 'thread-1',
      turnId: 'turn-1',
      eventType: 'task_started',
      payload: { type: 'task_started', turn_id: 'turn-1' },
    });
  });
});
