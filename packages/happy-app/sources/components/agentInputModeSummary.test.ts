import { describe, expect, it } from 'vitest';
import { buildAgentInputModeSummary, compactModelSummary } from './agentInputModeSummary';

describe('agent input mode summary', () => {
    it('formats Codex mode, model, and effort with middle-dot separators', () => {
        expect(buildAgentInputModeSummary({
            permissionLabel: 'YOLO',
            permissionModeKey: 'yolo',
            modelMode: { key: 'gpt-5.5', name: 'gpt-5.5' },
            effortLevel: { key: 'high', name: 'high' },
        })).toBe('YOLO · 5.5 · high');
    });

    it('compacts Codex model names to the version number', () => {
        expect(compactModelSummary({ key: 'gpt-5.3-codex', name: 'gpt-5.3-codex' })).toBe('5.3');
    });

    it('shows default model compactly', () => {
        expect(compactModelSummary({ key: 'default', name: 'default model' })).toBe('default');
    });

    it('falls back to CLI when there is no explicit mode context', () => {
        expect(buildAgentInputModeSummary({
            permissionLabel: null,
            permissionModeKey: 'default',
            modelMode: { key: 'default', name: 'default model' },
            effortLevel: null,
        })).toBe('CLI');
    });
});
