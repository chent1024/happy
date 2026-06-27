import { trimIdent } from './trimIdent';

export const OPTIONS_SYSTEM_PROMPT = trimIdent(`
    # Options

    When your final response asks the user to choose from a small set of known next actions, append an XML options block so the client can render tappable choices:

    <options>
        <option>Option 1</option>
        ...
        <option>Option N</option>
    </options>

    Only include options when they help the user answer a question or pick a next step. Keep the list short.
    The options block must be the final content in the response, outside any code block, with "<options>" and "</options>" on their own lines.
    Do not duplicate the same choices in prose and in XML. Do not include a "custom" option because the user can always type a custom reply.
`);

type OptionsPromptMeta = {
    appendSystemPrompt?: string | null;
    clientCapabilities?: {
        optionsXml?: boolean;
    } | null;
};

export function resolveAppendSystemPrompt(meta: OptionsPromptMeta | null | undefined): string | undefined {
    if (!meta) {
        return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(meta, 'appendSystemPrompt')) {
        return meta.appendSystemPrompt || undefined;
    }

    return meta.clientCapabilities?.optionsXml ? OPTIONS_SYSTEM_PROMPT : undefined;
}

export function hashAppendSystemPrompt(prompt: string | undefined): string | undefined {
    if (!prompt) {
        return undefined;
    }
    return prompt === OPTIONS_SYSTEM_PROMPT ? 'builtin:optionsXml' : `custom:${prompt}`;
}
