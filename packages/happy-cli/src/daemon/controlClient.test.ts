import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearDaemonState: vi.fn(),
  readDaemonState: vi.fn(),
  loggerDebug: vi.fn(),
}));

vi.mock('@/persistence', () => ({
  clearDaemonState: mocks.clearDaemonState,
  readDaemonState: mocks.readDaemonState,
}));

vi.mock('@/ui/logger', () => ({
  logger: {
    debug: mocks.loggerDebug,
  },
}));

import {
  checkIfDaemonRunningAndCleanupStaleState,
  inspectDaemonRunningState,
} from './controlClient';

describe('controlClient daemon state inspection', () => {
  const originalKill = process.kill;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.kill = vi.fn(() => true) as unknown as typeof process.kill;
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    process.kill = originalKill;
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it('returns missing-state without cleanup when no daemon state exists', async () => {
    mocks.readDaemonState.mockResolvedValue(null);

    await expect(inspectDaemonRunningState()).resolves.toEqual({
      state: 'missing-state',
      running: false,
    });
    expect(mocks.clearDaemonState).not.toHaveBeenCalled();
  });

  it('cleans up and reports dead-pid when the persisted pid is gone', async () => {
    mocks.readDaemonState.mockResolvedValue(daemonState());
    process.kill = vi.fn(() => {
      throw new Error('missing pid');
    }) as unknown as typeof process.kill;

    await expect(inspectDaemonRunningState()).resolves.toEqual({
      state: 'dead-pid',
      running: false,
      pid: 1234,
    });
    expect(mocks.clearDaemonState).toHaveBeenCalledTimes(1);
  });

  it('reports http-ok and preserves the existing boolean wrapper', async () => {
    mocks.readDaemonState.mockResolvedValue(daemonState());
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

    await expect(inspectDaemonRunningState()).resolves.toEqual({
      state: 'http-ok',
      running: true,
      pid: 1234,
      httpPort: 49214,
    });
    await expect(checkIfDaemonRunningAndCleanupStaleState()).resolves.toBe(true);
  });

  it('cleans up reused-pid state when the health endpoint returns an error', async () => {
    mocks.readDaemonState.mockResolvedValue(daemonState());
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(inspectDaemonRunningState()).resolves.toEqual({
      state: 'http-unhealthy',
      running: false,
      pid: 1234,
      httpPort: 49214,
      status: 503,
    });
    expect(mocks.clearDaemonState).toHaveBeenCalledTimes(1);
  });
});

function daemonState() {
  return {
    pid: 1234,
    httpPort: 49214,
    startTime: '2026-07-08T00:00:00.000Z',
    startedWithCliVersion: '1.1.10',
  };
}
