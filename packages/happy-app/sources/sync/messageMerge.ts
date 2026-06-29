import type { Message } from './typesMessage';

export type MessageMergeResult = {
    messages: Message[];
    messagesMap: Record<string, Message>;
};

function compareMessagesNewestFirst(a: Message, b: Message): number {
    return b.createdAt - a.createdAt;
}

function mergeSortedMessages(existing: Message[], changed: Message[]): Message[] {
    if (existing.length === 0) {
        return changed;
    }
    if (changed.length === 0) {
        return existing;
    }

    const merged: Message[] = [];
    let existingIndex = 0;
    let changedIndex = 0;

    while (existingIndex < existing.length && changedIndex < changed.length) {
        const existingMessage = existing[existingIndex];
        const changedMessage = changed[changedIndex];
        if (existingMessage.createdAt >= changedMessage.createdAt) {
            merged.push(existingMessage);
            existingIndex++;
        } else {
            merged.push(changedMessage);
            changedIndex++;
        }
    }

    while (existingIndex < existing.length) {
        merged.push(existing[existingIndex]);
        existingIndex++;
    }
    while (changedIndex < changed.length) {
        merged.push(changed[changedIndex]);
        changedIndex++;
    }

    return merged;
}

export function mergeMessagesByCreatedAtDesc(
    existingMessages: Message[],
    existingMessagesMap: Record<string, Message>,
    changedMessagesInput: Message[],
): MessageMergeResult {
    if (changedMessagesInput.length === 0) {
        return {
            messages: existingMessages,
            messagesMap: existingMessagesMap,
        };
    }

    const messagesMap = { ...existingMessagesMap };
    const changedIds = new Set<string>();
    for (const message of changedMessagesInput) {
        messagesMap[message.id] = message;
        changedIds.add(message.id);
    }

    const unchangedMessages = existingMessages.filter((message) => !changedIds.has(message.id));
    const changedMessages = Array.from(changedIds, (id) => messagesMap[id])
        .filter((message): message is Message => Boolean(message))
        .sort(compareMessagesNewestFirst);

    return {
        messages: mergeSortedMessages(unchangedMessages, changedMessages),
        messagesMap,
    };
}
