const CODEX_DERIVED_TITLE_MAX_LENGTH = 80;

export function sanitizeCodexTitle(value: unknown): string | null {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) {
        return null;
    }

    let text = raw.replace(/\r\n/g, '\n').trim();
    const titleInstructionIndex = text.indexOf('\n\nBased on this message, call functions.happy__change_title');
    if (titleInstructionIndex >= 0) {
        text = text.slice(0, titleInstructionIndex).trim();
    }

    if (text.startsWith('# Options')) {
        const paragraphs = text
            .split(/\n{2,}/)
            .map((paragraph) => paragraph.trim())
            .filter((paragraph) => paragraph.length > 0);

        for (let i = paragraphs.length - 1; i >= 0; i--) {
            const paragraph = paragraphs[i];
            if (
                paragraph.startsWith('#')
                || paragraph.includes('<options>')
                || paragraph.includes('</options>')
                || paragraph.startsWith('You have a way to give a user')
                || paragraph.startsWith('You must output this')
                || paragraph.startsWith('Always prefer to use the options mode')
                || paragraph.startsWith('When you are in the plan mode')
            ) {
                continue;
            }

            text = paragraph;
            break;
        }
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return null;
    }

    return normalized.length > CODEX_DERIVED_TITLE_MAX_LENGTH
        ? normalized.slice(0, CODEX_DERIVED_TITLE_MAX_LENGTH).trimEnd()
        : normalized;
}
