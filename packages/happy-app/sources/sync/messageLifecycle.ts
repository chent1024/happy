export type MessageLifecycleState = {
    isTaskStarted: boolean;
    isTaskComplete: boolean;
};

function getSessionEventType(raw: unknown): string | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const record = raw as {
        role?: unknown;
        content?: unknown;
    };
    if (record.role !== 'session' || !record.content || typeof record.content !== 'object') {
        return undefined;
    }

    const content = record.content as {
        type?: unknown;
        data?: unknown;
        ev?: { t?: unknown };
    };

    if (content.type === 'session' && content.data && typeof content.data === 'object') {
        const envelope = content.data as { ev?: { t?: unknown } };
        return typeof envelope.ev?.t === 'string' ? envelope.ev.t : undefined;
    }

    return typeof content.ev?.t === 'string' ? content.ev.t : undefined;
}

export function getMessageLifecycleState(raw: unknown): MessageLifecycleState {
    const content = raw && typeof raw === 'object'
        ? (raw as { content?: { type?: unknown; data?: { type?: unknown } } }).content
        : undefined;
    const contentType = content?.type;
    const dataType = content?.data?.type;
    const sessionEventType = getSessionEventType(raw);

    return {
        isTaskComplete:
            ((contentType === 'acp' || contentType === 'codex') &&
                (dataType === 'task_complete' || dataType === 'turn_aborted')) ||
            sessionEventType === 'turn-end',
        isTaskStarted:
            ((contentType === 'acp' || contentType === 'codex') && dataType === 'task_started') ||
            sessionEventType === 'turn-start',
    };
}
