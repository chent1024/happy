export type SessionRecoveryUi = {
    icon: 'play-circle-outline' | 'reload-outline';
    showContinueLabel: boolean;
};

export function resolveSessionRecoveryUi(options: {
    isDisconnected: boolean;
    isImportedCodexSession: boolean;
}): SessionRecoveryUi {
    if (options.isDisconnected && options.isImportedCodexSession) {
        return {
            icon: 'play-circle-outline',
            showContinueLabel: true,
        };
    }

    return {
        icon: 'reload-outline',
        showContinueLabel: false,
    };
}
