import { describe, expect, it } from 'vitest';
import { resolveSessionRecoveryUi } from './sessionRecoveryUi';

describe('resolveSessionRecoveryUi', () => {
    it('uses an explicit continue action for disconnected imported Codex sessions', () => {
        expect(resolveSessionRecoveryUi({
            isDisconnected: true,
            isImportedCodexSession: true,
        })).toEqual({
            icon: 'play-circle-outline',
            showContinueLabel: true,
        });
    });

    it('keeps the compact recovery icon for other recovery states', () => {
        expect(resolveSessionRecoveryUi({
            isDisconnected: false,
            isImportedCodexSession: true,
        })).toEqual({
            icon: 'reload-outline',
            showContinueLabel: false,
        });
        expect(resolveSessionRecoveryUi({
            isDisconnected: true,
            isImportedCodexSession: false,
        })).toEqual({
            icon: 'reload-outline',
            showContinueLabel: false,
        });
    });
});
