import { describe, expect, it } from 'vitest';
import type { Machine, Session } from '@/sync/storageTypes';
import { getRestartAvailability, getResumeAvailability, type SessionActionAvailabilityLabels } from './sessionQuickActionAvailability';

const labels: SessionActionAvailabilityLabels = {
    resumeSessionSubtitle: 'resume on same machine',
    resumeSessionMissingMachine: 'missing machine',
    resumeSessionMissingBackendId: 'missing backend id',
    resumeSessionSameMachineOnly: 'same machine only',
    resumeSessionMachineOffline: 'machine offline',
    restartSession: 'restart session',
};

function session(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            machineId: 'machine-1',
            codexThreadId: 'thread-1',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
        ...overrides,
    } as Session;
}

function machine(overrides: Partial<Machine> = {}): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: null,
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
        ...overrides,
    };
}

describe('session quick action availability', () => {
    it('shows resume and hides restart for disconnected resumable sessions', () => {
        const sourceSession = session();
        const sourceMachine = machine();

        expect(getResumeAvailability(sourceSession, sourceMachine, false, labels)).toMatchObject({
            canResume: true,
            canShowResume: true,
            subtitle: labels.resumeSessionSubtitle,
        });
        expect(getRestartAvailability(sourceSession, sourceMachine, false, labels)).toEqual({
            canResume: false,
            canShowResume: false,
            subtitle: '',
            message: '',
        });
    });

    it('shows restart only for connected sessions on an online machine', () => {
        expect(getRestartAvailability(session(), machine(), true, labels)).toEqual({
            canResume: true,
            canShowResume: true,
            subtitle: labels.restartSession,
            message: labels.restartSession,
        });
    });

    it('hides restart when the machine is missing or offline', () => {
        expect(getRestartAvailability(session(), null, true, labels).canShowResume).toBe(false);
        expect(getRestartAvailability(session(), machine({ active: false }), true, labels).canShowResume).toBe(false);
    });
});
