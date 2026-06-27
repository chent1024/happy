import { trimIdent } from "@/utils/trimIdent";

export const systemPrompt = trimIdent(`
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
