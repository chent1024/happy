import { describe, expect, it } from 'vitest';
import { MessageMetaSchema } from './typesMessageMeta';

describe('MessageMetaSchema', () => {
    it('accepts arbitrary permission mode keys', () => {
        const parsed = MessageMetaSchema.parse({
            permissionMode: 'team-custom-mode',
            model: 'custom-model',
            effort: 'medium',
            deliveryIntent: 'steer',
        });

        expect(parsed.permissionMode).toBe('team-custom-mode');
        expect(parsed.model).toBe('custom-model');
        expect(parsed.effort).toBe('medium');
        expect(parsed.deliveryIntent).toBe('steer');
    });
});
