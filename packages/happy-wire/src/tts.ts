import * as z from 'zod';

const TtsProviderSchema = z.enum(['cosyvoice']);
export type TtsProvider = z.infer<typeof TtsProviderSchema>;

export const TtsVoiceProfileSchema = z.object({
    id: z.string().min(1).max(128),
    label: z.string().min(1).max(128),
    providerVoiceId: z.string().min(1).max(256),
}).strict();
export type TtsVoiceProfile = z.infer<typeof TtsVoiceProfileSchema>;

export const TtsRoleRuleSchema = z.object({
    id: z.string().min(1).max(128),
    kind: z.enum(['exact', 'regex', 'dialogue']),
    pattern: z.string().min(1).max(512).optional(),
    voiceProfileId: z.string().min(1).max(128),
}).strict().superRefine((rule, ctx) => {
    if (rule.kind === 'dialogue' && rule.pattern !== undefined) {
        ctx.addIssue({
            code: 'custom',
            path: ['pattern'],
            message: 'Dialogue role rules do not accept a pattern',
        });
    }
    if (rule.kind !== 'dialogue' && !rule.pattern) {
        ctx.addIssue({
            code: 'custom',
            path: ['pattern'],
            message: 'Exact and regex role rules require a pattern',
        });
    }
});
export type TtsRoleRule = z.infer<typeof TtsRoleRuleSchema>;

export const TtsCachePolicySchema = z.object({
    maxEntries: z.number().int().min(0).max(100_000),
    maxBytes: z.number().int().min(0).max(10 * 1024 * 1024 * 1024),
}).strict();
export type TtsCachePolicy = z.infer<typeof TtsCachePolicySchema>;

/**
 * This structure is encrypted as machine metadata. It intentionally contains
 * only provider-safe identifiers: credentials, provider paths, source text,
 * reference audio, and generated audio stay on the selected machine.
 */
export const TtsServiceConfigurationSchema = z.object({
    version: z.literal(1),
    enabled: z.boolean(),
    provider: TtsProviderSchema,
    narratorProfileId: z.string().min(1).max(128),
    voiceProfiles: z.array(TtsVoiceProfileSchema).min(1).max(128),
    roleRules: z.array(TtsRoleRuleSchema).max(256),
    cache: TtsCachePolicySchema,
}).strict().superRefine((configuration, ctx) => {
    const profileIds = new Set(configuration.voiceProfiles.map((profile) => profile.id));
    if (!profileIds.has(configuration.narratorProfileId)) {
        ctx.addIssue({
            code: 'custom',
            path: ['narratorProfileId'],
            message: 'Narrator profile must exist in voiceProfiles',
        });
    }
    for (const [index, rule] of configuration.roleRules.entries()) {
        if (!profileIds.has(rule.voiceProfileId)) {
            ctx.addIssue({
                code: 'custom',
                path: ['roleRules', index, 'voiceProfileId'],
                message: 'Role rule profile must exist in voiceProfiles',
            });
        }
    }
});
export type TtsServiceConfiguration = z.infer<typeof TtsServiceConfigurationSchema>;

export const TtsServiceStateSchema = z.enum([
    'disabled',
    'offline',
    'provider_unavailable',
    'initializing',
    'ready',
    'busy',
    'failed',
]);
export type TtsServiceState = z.infer<typeof TtsServiceStateSchema>;

export const TtsErrorCodeSchema = z.enum([
    'provider_unavailable',
    'provider_error',
    'request_too_large',
    'output_too_large',
    'queue_full',
    'timeout',
    'machine_offline',
    'configuration_invalid',
]);
export type TtsErrorCode = z.infer<typeof TtsErrorCodeSchema>;

/** Safe-to-sync runtime state. It must never include a provider response or path. */
export const TtsRuntimeStatusSchema = z.object({
    state: TtsServiceStateSchema,
    provider: TtsProviderSchema,
    modelRevision: z.string().min(1).max(256).nullable(),
    cache: z.object({
        entries: z.number().int().min(0),
        bytes: z.number().int().min(0),
    }).strict(),
    lastError: TtsErrorCodeSchema.nullable(),
    diagnostics: z.object({
        pendingRequests: z.number().int().min(0).max(16),
        preAudioRetries: z.number().int().min(0).max(1_000_000),
        lastFailure: TtsErrorCodeSchema.nullable(),
    }).strict().optional(),
}).strict();
export type TtsRuntimeStatus = z.infer<typeof TtsRuntimeStatusSchema>;

/**
 * Encrypted request payload for the selected machine's existing Happy RPC.
 * Text is intentionally bounded so a provider cannot receive an unbounded
 * book chapter in one call.
 */
export const TtsSynthesisRequestSchema = z.object({
    requestId: z.string().min(1).max(128),
    text: z.string().min(1).max(1000),
    locale: z.string().min(2).max(35),
    rate: z.number().min(0.5).max(2),
}).strict();
export type TtsSynthesisRequest = z.infer<typeof TtsSynthesisRequestSchema>;

export const TtsSynthesisSuccessSchema = z.object({
    type: z.literal('success'),
    sampleRateHz: z.number().int().min(8_000).max(96_000),
    pcm16leBase64: z.string().min(1),
    roleResolution: z.enum(['explicit', 'dialogue', 'narrator']),
    cacheHit: z.boolean(),
}).strict();
export type TtsSynthesisSuccess = z.infer<typeof TtsSynthesisSuccessSchema>;

export const TtsSynthesisErrorSchema = z.object({
    type: z.literal('error'),
    code: TtsErrorCodeSchema,
}).strict();
export type TtsSynthesisError = z.infer<typeof TtsSynthesisErrorSchema>;

export const TtsStatusSuccessSchema = z.object({
    type: z.literal('success'),
    status: TtsRuntimeStatusSchema,
}).strict();
export const TtsStatusResultSchema = z.discriminatedUnion('type', [
    TtsStatusSuccessSchema,
    TtsSynthesisErrorSchema,
]);
export type TtsStatusResult = z.infer<typeof TtsStatusResultSchema>;

export const TtsSynthesisResultSchema = z.discriminatedUnion('type', [
    TtsSynthesisSuccessSchema,
    TtsSynthesisErrorSchema,
]);
export type TtsSynthesisResult = z.infer<typeof TtsSynthesisResultSchema>;

/** Bounded transient events for the authenticated Android PCM stream. */
export const TtsSynthesisStreamStartSchema = z.object({
    type: z.literal('start'),
    sampleRateHz: z.number().int().min(8_000).max(96_000),
}).strict();
export const TtsSynthesisStreamChunkSchema = z.object({
    type: z.literal('chunk'),
    sequence: z.number().int().min(0).max(1_000_000),
    // 192 KiB binary PCM after base64 decoding, leaving transport headroom.
    pcm16leBase64: z.string().min(1).max(256 * 1024),
}).strict();
export const TtsSynthesisStreamEndSchema = z.object({ type: z.literal('end') }).strict();
export const TtsSynthesisStreamErrorSchema = z.object({
    type: z.literal('error'),
    code: TtsErrorCodeSchema,
}).strict();
export const TtsSynthesisStreamEventSchema = z.discriminatedUnion('type', [
    TtsSynthesisStreamStartSchema,
    TtsSynthesisStreamChunkSchema,
    TtsSynthesisStreamEndSchema,
    TtsSynthesisStreamErrorSchema,
]);
export type TtsSynthesisStreamEvent = z.infer<typeof TtsSynthesisStreamEventSchema>;

export const TtsSynthesisStreamRequestSchema = z.object({
    streamId: z.string().min(1).max(128),
    request: TtsSynthesisRequestSchema,
}).strict();
export type TtsSynthesisStreamRequest = z.infer<typeof TtsSynthesisStreamRequestSchema>;

export const TtsSynthesisStreamRelayEventSchema = z.object({
    streamId: z.string().min(1).max(128),
    event: TtsSynthesisStreamEventSchema,
}).strict();
export type TtsSynthesisStreamRelayEvent = z.infer<typeof TtsSynthesisStreamRelayEventSchema>;
