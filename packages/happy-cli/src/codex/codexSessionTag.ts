export function buildCodexSessionTag(
    machineId: string,
    resumeThreadId: string | null | undefined,
    fallbackTag: string,
    opts: { parentSessionId?: string | null } = {},
): string {
    return resumeThreadId && !opts.parentSessionId
        ? `codex:${machineId}:${resumeThreadId}`
        : fallbackTag;
}
