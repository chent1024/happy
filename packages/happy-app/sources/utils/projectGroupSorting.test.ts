import { describe, expect, it } from 'vitest';
import { compareProjectGroupsByStablePath, type ProjectGroupSortEntry } from './projectGroupSorting';

describe('project group sorting helpers', () => {
    it('keeps project order stable when session activity changes', () => {
        const projects: ProjectGroupSortEntry<{ displayPath: string; sessions: Array<{ updatedAt: number }> }>[] = [
            ['/workspace/zeta', { displayPath: '~/workspace/zeta', sessions: [{ updatedAt: 10 }] }],
            ['/workspace/alpha', { displayPath: '~/workspace/alpha', sessions: [{ updatedAt: 999 }] }],
        ];

        expect([...projects].sort(compareProjectGroupsByStablePath).map(([projectPath]) => projectPath)).toEqual([
            '/workspace/alpha',
            '/workspace/zeta',
        ]);
    });

    it('uses project path as a deterministic fallback for equal display paths', () => {
        const projects: ProjectGroupSortEntry[] = [
            ['/b/project', { displayPath: 'project' }],
            ['/a/project', { displayPath: 'project' }],
        ];

        expect([...projects].sort(compareProjectGroupsByStablePath).map(([projectPath]) => projectPath)).toEqual([
            '/a/project',
            '/b/project',
        ]);
    });
});
