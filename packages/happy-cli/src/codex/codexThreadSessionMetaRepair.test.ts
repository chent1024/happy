import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { repairOversizedCodexSessionMetaFromError } from './codexThreadSessionMetaRepair';

describe('repairOversizedCodexSessionMetaFromError', () => {
    it('backs up and compacts an oversized matching session_meta first line', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'happy-codex-meta-'));
        const path = join(dir, 'rollout.jsonl');
        const firstLine = JSON.stringify({
            timestamp: '2026-06-26T09:26:10.647Z',
            type: 'session_meta',
            payload: {
                session_id: 'thread-1',
                id: 'thread-1',
                timestamp: '2026-06-26T09:25:10.128Z',
                cwd: '/tmp/project',
                source: 'vscode',
                base_instructions: { text: 'x'.repeat(40_000) },
                dynamic_tools: [{ name: 'tool', description: 'y'.repeat(10_000) }],
            },
        });
        await writeFile(path, `${firstLine}\n{"type":"response_item","payload":{}}\n`, 'utf8');

        const result = await repairOversizedCodexSessionMetaFromError({
            threadId: 'thread-1',
            errorMessage: `thread/resume: failed to read thread: thread-store internal error: failed to read thread ${path}: rollout at ${path} does not start with session metadata (code=-32603)`,
            now: () => 123,
        });

        expect(result).toMatchObject({
            repaired: true,
            path,
            backupPath: `${path}.happy-backup-123`,
        });
        const repaired = await readFile(path, 'utf8');
        const repairedFirstLine = repaired.split('\n')[0]!;
        expect(repairedFirstLine.length).toBeLessThan(1000);
        expect(JSON.parse(repairedFirstLine)).toMatchObject({
            type: 'session_meta',
            payload: {
                id: 'thread-1',
                cwd: '/tmp/project',
                source: 'vscode',
            },
        });
        expect(await readFile(`${path}.happy-backup-123`, 'utf8')).toContain('base_instructions');
        expect(repaired).toContain('"response_item"');
    });

    it('does not rewrite when the first line is not the requested thread', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'happy-codex-meta-'));
        const path = join(dir, 'rollout.jsonl');
        await writeFile(path, JSON.stringify({
            type: 'session_meta',
            payload: { id: 'other-thread', cwd: '/tmp/project' },
        }), 'utf8');

        await expect(repairOversizedCodexSessionMetaFromError({
            threadId: 'thread-1',
            errorMessage: `failed to read thread ${path}: rollout at ${path} does not start with session metadata`,
        })).resolves.toEqual({
            repaired: false,
            reason: 'first-line-not-matching-session-meta',
            path,
        });
    });
});
