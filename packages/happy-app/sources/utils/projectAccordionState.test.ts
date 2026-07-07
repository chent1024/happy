import { describe, expect, it } from 'vitest';
import {
    resolveExpandedProjectKey,
    toggleExpandedProjectKey,
} from './projectAccordionState';

describe('project accordion state', () => {
    const projectKeys = ['machine-a:/workspace/alpha', 'machine-a:/workspace/beta'];

    it('defaults to the first project when no project has been selected', () => {
        expect(resolveExpandedProjectKey(projectKeys, undefined, false)).toBe(projectKeys[0]);
    });

    it('keeps the selected project when it is still visible', () => {
        expect(resolveExpandedProjectKey(projectKeys, projectKeys[1], false)).toBe(projectKeys[1]);
    });

    it('falls back to the first visible project when the selected project disappears', () => {
        expect(resolveExpandedProjectKey(projectKeys, 'machine-a:/workspace/missing', false)).toBe(projectKeys[0]);
    });

    it('allows all projects to stay collapsed after closing the current project', () => {
        expect(resolveExpandedProjectKey(projectKeys, null, false)).toBeNull();
    });

    it('collapses all projects when the whole section is collapsed', () => {
        expect(resolveExpandedProjectKey(projectKeys, projectKeys[0], true)).toBeNull();
    });

    it('switches expansion to a different project', () => {
        expect(toggleExpandedProjectKey(projectKeys[0], projectKeys[1])).toBe(projectKeys[1]);
    });

    it('collapses the current project when toggled again', () => {
        expect(toggleExpandedProjectKey(projectKeys[0], projectKeys[0])).toBeNull();
    });
});
