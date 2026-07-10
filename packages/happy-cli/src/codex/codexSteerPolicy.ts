export type CodexMessageSource = 'codex-app' | string;

export function shouldAttemptCodexSteer(opts: {
    deliveryIntent?: 'queue' | 'steer' | 'interrupt';
    source?: CodexMessageSource;
    hasActiveThread: boolean;
    hasActiveTurn: boolean;
    isClearText: boolean;
    isGoalCommand: boolean;
}): boolean {
    return opts.deliveryIntent === 'steer'
        && opts.source !== 'codex-app'
        && opts.hasActiveThread
        && opts.hasActiveTurn
        && !opts.isClearText
        && !opts.isGoalCommand;
}
