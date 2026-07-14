import { describe, expect, it } from 'vitest';
import { DaemonStateSchema } from './storageTypes';

describe('DaemonStateSchema', () => {
    it('keeps the encrypted machine TTS readiness state available to the settings screen', () => {
        const parsed = DaemonStateSchema.parse({
            status: 'running',
            tts: {
                state: 'ready',
                provider: 'cosyvoice',
                modelRevision: 'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit',
                cache: { entries: 0, bytes: 0 },
                lastError: null,
                diagnostics: { pendingRequests: 0, preAudioRetries: 0, lastFailure: null },
            },
        });

        expect(parsed.tts?.state).toBe('ready');
        expect(parsed.tts?.modelRevision).toContain('Qwen3-TTS');
    });
});
