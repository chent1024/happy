import { describe, expect, it } from 'vitest';

import {
    OPTIONS_SYSTEM_PROMPT,
    hashAppendSystemPrompt,
    resolveAppendSystemPrompt,
} from './optionsSystemPrompt';

describe('resolveAppendSystemPrompt', () => {
    it('uses the built-in options prompt for the options XML client capability', () => {
        expect(resolveAppendSystemPrompt({
            clientCapabilities: { optionsXml: true },
        })).toBe(OPTIONS_SYSTEM_PROMPT);
    });

    it('keeps legacy appendSystemPrompt overrides compatible', () => {
        expect(resolveAppendSystemPrompt({
            appendSystemPrompt: 'legacy prompt',
            clientCapabilities: { optionsXml: true },
        })).toBe('legacy prompt');
    });

    it('allows legacy appendSystemPrompt null to reset the current prompt', () => {
        expect(resolveAppendSystemPrompt({
            appendSystemPrompt: null,
            clientCapabilities: { optionsXml: true },
        })).toBeUndefined();
    });
});

describe('hashAppendSystemPrompt', () => {
    it('hashes the built-in options prompt by capability key', () => {
        expect(hashAppendSystemPrompt(OPTIONS_SYSTEM_PROMPT)).toBe('builtin:optionsXml');
    });

    it('keeps custom prompts distinct', () => {
        expect(hashAppendSystemPrompt('custom prompt')).toBe('custom:custom prompt');
        expect(hashAppendSystemPrompt('optionsXml')).toBe('custom:optionsXml');
    });
});
