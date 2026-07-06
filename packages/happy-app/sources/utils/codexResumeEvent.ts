const CODEX_RESUME_EVENT_PREFIX = 'Resumed Codex thread ';

export type CodexResumeEvent = {
    threadId: string;
    shortThreadId: string;
};

export function parseCodexResumeEvent(message: string): CodexResumeEvent | null {
    const trimmed = message.trim();
    if (!trimmed.startsWith(CODEX_RESUME_EVENT_PREFIX)) {
        return null;
    }

    const threadId = trimmed.slice(CODEX_RESUME_EVENT_PREFIX.length).trim();
    if (!threadId) {
        return null;
    }

    const shortThreadId = threadId.length > 16
        ? `${threadId.slice(0, 8)}...${threadId.slice(-4)}`
        : threadId;

    return {
        threadId,
        shortThreadId,
    };
}
