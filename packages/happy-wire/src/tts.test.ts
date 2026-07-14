import { describe, expect, it } from 'vitest';
import {
    TtsRuntimeStatusSchema,
    TtsStatusResultSchema,
    TtsServiceConfigurationSchema,
    TtsSynthesisRequestSchema,
    TtsSynthesisResultSchema,
} from './tts';

describe('TTS wire contracts', () => {
    const configuration = {
        version: 1, enabled: true, provider: 'cosyvoice', narratorProfileId: 'narrator',
        voiceProfiles: [{ id: 'narrator', label: '旁白', providerVoiceId: 'Uncle_Fu' }],
        roleRules: [], cache: { maxEntries: 64, maxBytes: 64_000_000 },
    };

    it('accepts a versioned configuration with no credential or local asset path', () => {
        expect(TtsServiceConfigurationSchema.safeParse(configuration).success).toBe(true);
        expect(TtsServiceConfigurationSchema.safeParse({ ...configuration, apiKey: 'secret' }).success).toBe(false);
        expect(TtsServiceConfigurationSchema.safeParse({
            ...configuration,
            voiceProfiles: [{ ...configuration.voiceProfiles[0], referenceAudioPath: '/private/voice.wav' }],
        }).success).toBe(false);
    });

    it('bounds requests and exposes only typed outcomes and diagnostics', () => {
        expect(TtsSynthesisRequestSchema.safeParse({
            requestId: 'request-1', text: '小说朗读文本', locale: 'zh-CN', rate: 1,
        }).success).toBe(true);
        expect(TtsSynthesisRequestSchema.safeParse({
            requestId: 'request-2', text: 'x'.repeat(1001), locale: 'zh-CN', rate: 1,
        }).success).toBe(false);
        expect(TtsSynthesisResultSchema.safeParse({ type: 'error', code: 'provider_unavailable' }).success).toBe(true);
        expect(TtsRuntimeStatusSchema.safeParse({
            state: 'failed', provider: 'cosyvoice', modelRevision: null, cache: { entries: 0, bytes: 0 },
            lastError: 'provider_error', rawProviderResponse: 'secret',
        }).success).toBe(false);
        expect(TtsStatusResultSchema.safeParse({
            type: 'success',
            status: {
                state: 'ready', provider: 'cosyvoice', modelRevision: 'qwen3',
                cache: { entries: 0, bytes: 0 }, lastError: null,
                diagnostics: { pendingRequests: 0, preAudioRetries: 1, lastFailure: null },
            },
        }).success).toBe(true);
        expect(TtsStatusResultSchema.safeParse({
            type: 'success',
            status: {
                state: 'ready', provider: 'cosyvoice', modelRevision: 'qwen3',
                cache: { entries: 0, bytes: 0 }, lastError: null,
                providerPath: '/private/provider',
            },
        }).success).toBe(false);
    });
});
