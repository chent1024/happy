import { describe, expect, it } from 'vitest';
import { sanitizeCodexTitle } from './codexTitle';

describe('sanitizeCodexTitle', () => {
    it('keeps ordinary Codex titles unchanged', () => {
        expect(sanitizeCodexTitle('迁移Chub数据库服务器')).toBe('迁移Chub数据库服务器');
    });

    it('extracts the user request from injected Options instructions', () => {
        const title = [
            '# Options',
            'You have a way to give a user a easy way to answer your questions if you know possible answers.',
            '<options>\n    <option>Option 1</option>\n</options>',
            '# Plan mode with options',
            'When you are in the plan mode, you must use the options mode.',
            '继续分析当前会话发你的问题',
            'Based on this message, call functions.happy__change_title to change chat session title that would represent the current task.',
        ].join('\n\n');

        expect(sanitizeCodexTitle(title)).toBe('继续分析当前会话发你的问题');
    });
});
