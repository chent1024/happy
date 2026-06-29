import { describe, expect, it } from 'vitest';
import { getMessageLifecycleState } from './messageLifecycle';

describe('getMessageLifecycleState', () => {
    it('detects Codex task lifecycle messages', () => {
        expect(getMessageLifecycleState({
            role: 'agent',
            content: {
                type: 'codex',
                data: { type: 'task_started' },
            },
        })).toEqual({ isTaskStarted: true, isTaskComplete: false });

        expect(getMessageLifecycleState({
            role: 'agent',
            content: {
                type: 'codex',
                data: { type: 'task_complete' },
            },
        })).toEqual({ isTaskStarted: false, isTaskComplete: true });

        expect(getMessageLifecycleState({
            role: 'agent',
            content: {
                type: 'codex',
                data: { type: 'turn_aborted' },
            },
        })).toEqual({ isTaskStarted: false, isTaskComplete: true });
    });

    it('detects wrapped session protocol turn lifecycle messages', () => {
        expect(getMessageLifecycleState({
            role: 'session',
            content: {
                type: 'session',
                data: {
                    id: 'env-start',
                    time: 1,
                    role: 'agent',
                    turn: 'turn-1',
                    ev: { t: 'turn-start' },
                },
            },
        })).toEqual({ isTaskStarted: true, isTaskComplete: false });

        expect(getMessageLifecycleState({
            role: 'session',
            content: {
                type: 'session',
                data: {
                    id: 'env-end',
                    time: 2,
                    role: 'agent',
                    turn: 'turn-1',
                    ev: { t: 'turn-end', status: 'completed' },
                },
            },
        })).toEqual({ isTaskStarted: false, isTaskComplete: true });
    });

    it('detects direct session protocol envelopes before raw normalization', () => {
        expect(getMessageLifecycleState({
            role: 'session',
            content: {
                id: 'env-start',
                time: 1,
                role: 'agent',
                turn: 'turn-1',
                ev: { t: 'turn-start' },
            },
        })).toEqual({ isTaskStarted: true, isTaskComplete: false });

        expect(getMessageLifecycleState({
            role: 'session',
            content: {
                id: 'env-end',
                time: 2,
                role: 'agent',
                turn: 'turn-1',
                ev: { t: 'turn-end', status: 'completed' },
            },
        })).toEqual({ isTaskStarted: false, isTaskComplete: true });
    });

    it('ignores unrelated messages', () => {
        expect(getMessageLifecycleState({
            role: 'agent',
            content: {
                type: 'output',
                data: { type: 'assistant' },
            },
        })).toEqual({ isTaskStarted: false, isTaskComplete: false });
    });
});
