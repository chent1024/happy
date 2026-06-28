import { copyFile, readFile, writeFile } from 'fs/promises';

type RepairResult =
    | { repaired: true; path: string; backupPath: string; originalLength: number; repairedLength: number }
    | { repaired: false; reason: string; path?: string };

const READ_FAILURE_PATH_RE = /failed to read thread ([^:]+):/;

function extractThreadPathFromResumeError(message: string): string | null {
    if (!message.includes('does not start with session metadata')) {
        return null;
    }
    const match = READ_FAILURE_PATH_RE.exec(message);
    return match?.[1] ?? null;
}

function compactSessionMetaLine(value: any, threadId: string): string | null {
    if (value?.type !== 'session_meta') {
        return null;
    }
    const payload = value.payload;
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const payloadId = typeof payload.id === 'string' ? payload.id : undefined;
    const payloadSessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;
    if (payloadId !== threadId && payloadSessionId !== threadId) {
        return null;
    }

    const compactPayload: Record<string, unknown> = {
        ...('session_id' in payload ? { session_id: payload.session_id } : {}),
        id: payloadId ?? payloadSessionId,
        ...('timestamp' in payload ? { timestamp: payload.timestamp } : {}),
        ...('cwd' in payload ? { cwd: payload.cwd } : {}),
        ...('originator' in payload ? { originator: payload.originator } : {}),
        ...('cli_version' in payload ? { cli_version: payload.cli_version } : {}),
        ...('source' in payload ? { source: payload.source } : {}),
        ...('thread_source' in payload ? { thread_source: payload.thread_source } : {}),
        ...('model_provider' in payload ? { model_provider: payload.model_provider } : {}),
        ...('git' in payload ? { git: payload.git } : {}),
    };

    return JSON.stringify({
        ...('timestamp' in value ? { timestamp: value.timestamp } : {}),
        type: 'session_meta',
        payload: compactPayload,
    });
}

export async function repairOversizedCodexSessionMetaFromError(opts: {
    threadId: string;
    errorMessage: string;
    now?: () => number;
}): Promise<RepairResult> {
    const path = extractThreadPathFromResumeError(opts.errorMessage);
    if (!path) {
        return { repaired: false, reason: 'not-session-meta-start-error' };
    }

    const content = await readFile(path, 'utf8');
    const newlineIndex = content.indexOf('\n');
    const firstLine = newlineIndex >= 0 ? content.slice(0, newlineIndex) : content;
    const rest = newlineIndex >= 0 ? content.slice(newlineIndex) : '';
    let parsed: unknown;
    try {
        parsed = JSON.parse(firstLine);
    } catch {
        return { repaired: false, reason: 'first-line-not-json', path };
    }

    const compactLine = compactSessionMetaLine(parsed, opts.threadId);
    if (!compactLine) {
        return { repaired: false, reason: 'first-line-not-matching-session-meta', path };
    }

    if (compactLine.length >= firstLine.length) {
        return { repaired: false, reason: 'compact-line-not-smaller', path };
    }

    const backupPath = `${path}.happy-backup-${opts.now?.() ?? Date.now()}`;
    await copyFile(path, backupPath);
    await writeFile(path, `${compactLine}${rest}`, 'utf8');

    return {
        repaired: true,
        path,
        backupPath,
        originalLength: firstLine.length,
        repairedLength: compactLine.length,
    };
}
