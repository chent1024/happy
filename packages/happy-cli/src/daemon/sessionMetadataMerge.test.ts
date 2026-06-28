import { describe, expect, it } from 'vitest';

import { mergeServerSessionMetadataForResume } from './sessionMetadataMerge';

describe('mergeServerSessionMetadataForResume', () => {
  it('preserves a local Codex thread id when refreshed server metadata is stale', () => {
    const merged = mergeServerSessionMetadataForResume(
      {
        flavor: 'codex',
        path: '/tmp/project',
        host: 'mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-local',
      } as any,
      {
        flavor: 'codex',
        path: '/tmp/project',
        host: 'mac',
        machineId: 'machine-1',
        lifecycleState: 'running',
      } as any,
    );

    expect(merged).toMatchObject({
      codexThreadId: 'thread-local',
      lifecycleState: 'running',
    });
  });

  it('uses the server Codex thread id when the server has one', () => {
    const merged = mergeServerSessionMetadataForResume(
      {
        flavor: 'codex',
        path: '/tmp/project',
        host: 'mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-local',
      } as any,
      {
        flavor: 'codex',
        path: '/tmp/project',
        host: 'mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-server',
      } as any,
    );

    expect(merged.codexThreadId).toBe('thread-server');
  });

  it('preserves a local Claude session id when refreshed server metadata is stale', () => {
    const merged = mergeServerSessionMetadataForResume(
      {
        flavor: 'claude',
        path: '/tmp/project',
        host: 'mac',
        machineId: 'machine-1',
        claudeSessionId: 'claude-local',
      } as any,
      {
        flavor: 'claude',
        path: '/tmp/project',
        host: 'mac',
        machineId: 'machine-1',
        lifecycleState: 'running',
      } as any,
    );

    expect(merged).toMatchObject({
      claudeSessionId: 'claude-local',
      lifecycleState: 'running',
    });
  });
});
