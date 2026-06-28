import type { Machine, Session } from '@/sync/storageTypes';
import { isMachineOnline } from '@/utils/machineUtils';

export type SessionActionAvailability = {
    canResume: boolean;
    canShowResume: boolean;
    subtitle: string;
    message: string;
};

export type SessionActionAvailabilityLabels = {
    resumeSessionSubtitle: string;
    resumeSessionMissingMachine: string;
    resumeSessionMissingBackendId: string;
    resumeSessionSameMachineOnly: string;
    resumeSessionMachineOffline: string;
    restartSession: string;
};

const unavailable = (): SessionActionAvailability => ({
    canResume: false,
    canShowResume: false,
    subtitle: '',
    message: '',
});

export function getResumeAvailability(
    session: Session,
    machine: Machine | null | undefined,
    isConnected: boolean,
    labels: SessionActionAvailabilityLabels,
): SessionActionAvailability {
    if (isConnected) {
        return unavailable();
    }

    const machineId = session.metadata?.machineId;
    if (!machineId) {
        const message = labels.resumeSessionMissingMachine;
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    const hasBackendResumeId = Boolean(session.metadata?.claudeSessionId || session.metadata?.codexThreadId);
    if (!hasBackendResumeId) {
        const message = labels.resumeSessionMissingBackendId;
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (!machine) {
        const message = labels.resumeSessionSameMachineOnly;
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (!isMachineOnline(machine)) {
        return {
            canResume: false,
            canShowResume: true,
            subtitle: labels.resumeSessionMachineOffline,
            message: labels.resumeSessionMachineOffline,
        };
    }

    return {
        canResume: true,
        canShowResume: true,
        subtitle: labels.resumeSessionSubtitle,
        message: labels.resumeSessionSubtitle,
    };
}

export function getRestartAvailability(
    session: Session,
    machine: Machine | null | undefined,
    isConnected: boolean,
    labels: SessionActionAvailabilityLabels,
): SessionActionAvailability {
    if (!isConnected) {
        return unavailable();
    }

    const machineId = session.metadata?.machineId;
    if (!machineId || !machine || !isMachineOnline(machine)) {
        return unavailable();
    }

    return {
        canResume: true,
        canShowResume: true,
        subtitle: labels.restartSession,
        message: labels.restartSession,
    };
}
