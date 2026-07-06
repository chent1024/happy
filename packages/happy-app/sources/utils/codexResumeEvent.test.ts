import { describe, expect, it } from 'vitest';

import { parseCodexResumeEvent } from './codexResumeEvent';

describe('parseCodexResumeEvent', () => {
    it('parses Codex resume status events and shortens long thread ids', () => {
        expect(parseCodexResumeEvent('Resumed Codex thread 019f1218-a5f3-7c71-a2bc-50522e07cde4')).toEqual({
            threadId: '019f1218-a5f3-7c71-a2bc-50522e07cde4',
            shortThreadId: '019f1218...cde4',
        });
    });

    it('ignores unrelated agent event messages', () => {
        expect(parseCodexResumeEvent('Switched to local mode')).toBeNull();
    });
});
