import { describe, expect, it } from 'vitest';

import {
    canOpenAgentInputSettings,
    canPressAgentInputSendButton,
    isAgentInputSandboxEnabled,
    resolveAgentInputFlavor,
} from './agentInputState';

describe('agentInputState', () => {
    it('allows send from text, images, or mic when not disabled', () => {
        expect(canPressAgentInputSendButton({
            isSendBlocked: false,
            hasText: true,
            hasImages: false,
            hasMicAction: false,
        })).toBe(true);
        expect(canPressAgentInputSendButton({
            isSendBlocked: false,
            hasText: false,
            hasImages: true,
            hasMicAction: false,
        })).toBe(true);
        expect(canPressAgentInputSendButton({
            isSendBlocked: false,
            hasText: false,
            hasImages: false,
            hasMicAction: true,
        })).toBe(true);
    });

    it('keeps blocked send pressable only when there is content to shake', () => {
        expect(canPressAgentInputSendButton({
            isSendBlocked: true,
            hasText: true,
            hasImages: false,
            hasMicAction: true,
        })).toBe(true);
        expect(canPressAgentInputSendButton({
            isSendBlocked: true,
            hasText: false,
            hasImages: false,
            hasMicAction: true,
        })).toBe(false);
    });

    it('disables send while sending or explicitly disabled', () => {
        expect(canPressAgentInputSendButton({
            isSending: true,
            isSendBlocked: false,
            hasText: true,
            hasImages: false,
            hasMicAction: false,
        })).toBe(false);
        expect(canPressAgentInputSendButton({
            isSendDisabled: true,
            isSendBlocked: false,
            hasText: true,
            hasImages: false,
            hasMicAction: false,
        })).toBe(false);
    });

    it('opens settings when any mode selector can change', () => {
        expect(canOpenAgentInputSettings({
            hasPermissionModeChange: false,
            hasModelModeChange: true,
            hasEffortLevelChange: false,
        })).toBe(true);
        expect(canOpenAgentInputSettings({
            hasPermissionModeChange: false,
            hasModelModeChange: false,
            hasEffortLevelChange: false,
        })).toBe(false);
    });

    it('prefers metadata flavor over new-session agent type', () => {
        expect(resolveAgentInputFlavor({ flavor: 'codex' } as any, 'claude')).toBe('codex');
        expect(resolveAgentInputFlavor(null, 'gemini')).toBe('gemini');
        expect(resolveAgentInputFlavor(null, undefined)).toBeNull();
    });

    it('normalizes sandbox metadata', () => {
        expect(isAgentInputSandboxEnabled(null)).toBe(false);
        expect(isAgentInputSandboxEnabled({ sandbox: { enabled: false } } as any)).toBe(false);
        expect(isAgentInputSandboxEnabled({ sandbox: { enabled: true } } as any)).toBe(true);
        expect(isAgentInputSandboxEnabled({ sandbox: 'workspace-write' } as any)).toBe(true);
    });
});
