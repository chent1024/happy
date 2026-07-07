import type { Metadata } from '@/sync/storageTypes';

type AgentInputFlavor = 'claude' | 'codex' | 'gemini' | 'openclaw';

export function canPressAgentInputSendButton(input: {
    isSending?: boolean;
    isSendDisabled?: boolean;
    isSendBlocked: boolean;
    hasText: boolean;
    hasImages: boolean;
    hasMicAction: boolean;
}): boolean {
    if (input.isSending || input.isSendDisabled) {
        return false;
    }
    if (input.isSendBlocked) {
        return input.hasText || input.hasImages;
    }
    return input.hasText || input.hasImages || input.hasMicAction;
}

export function canOpenAgentInputSettings(input: {
    hasPermissionModeChange: boolean;
    hasModelModeChange: boolean;
    hasEffortLevelChange: boolean;
}): boolean {
    return input.hasPermissionModeChange
        || input.hasModelModeChange
        || input.hasEffortLevelChange;
}

export function resolveAgentInputFlavor(
    metadata: Metadata | null | undefined,
    agentType: AgentInputFlavor | undefined,
): AgentInputFlavor | null {
    const flavor = metadata?.flavor;
    if (flavor === 'codex' || flavor === 'gemini' || flavor === 'openclaw') {
        return flavor;
    }
    return agentType ?? null;
}

export function isAgentInputSandboxEnabled(metadata: Metadata | null | undefined): boolean {
    const sandbox = metadata?.sandbox as unknown;
    if (!sandbox) {
        return false;
    }
    if (typeof sandbox === 'object' && sandbox !== null && 'enabled' in sandbox) {
        return Boolean((sandbox as { enabled?: unknown }).enabled);
    }
    return true;
}
