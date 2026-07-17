export type SendMessageSource = 'chat' | 'new_session' | 'option' | 'question' | 'voice' | 'codex-app';
export type SendMessageDeliveryIntent = 'queue' | 'steer' | 'interrupt';

export function resolveSendMessageDeliveryIntent(opts: {
    source: SendMessageSource;
    sessionThinking: boolean;
    explicitIntent?: SendMessageDeliveryIntent;
}): SendMessageDeliveryIntent | undefined {
    if (opts.source === 'codex-app') {
        return 'queue';
    }

    if (opts.explicitIntent !== undefined) {
        if (opts.explicitIntent === 'steer' && !opts.sessionThinking) {
            return undefined;
        }
        return opts.explicitIntent;
    }

    return opts.source === 'chat' && opts.sessionThinking ? 'steer' : undefined;
}
