import { describe, expect, it } from 'vitest';
import { mergeMessagesByCreatedAtDesc } from './messageMerge';
import type { Message } from './typesMessage';

function textMessage(id: string, createdAt: number, text = id): Message {
    return {
        kind: 'agent-text',
        id,
        localId: null,
        createdAt,
        text,
    };
}

function mapOf(messages: Message[]): Record<string, Message> {
    return Object.fromEntries(messages.map((message) => [message.id, message]));
}

describe('mergeMessagesByCreatedAtDesc', () => {
    it('keeps existing references when there are no changed messages', () => {
        const existing = [textMessage('newer', 30), textMessage('older', 20)];
        const existingMap = mapOf(existing);

        const result = mergeMessagesByCreatedAtDesc(existing, existingMap, []);

        expect(result.messages).toBe(existing);
        expect(result.messagesMap).toBe(existingMap);
    });

    it('inserts newer realtime messages at the head without disturbing existing order', () => {
        const existing = [textMessage('old-newer', 30), textMessage('old-older', 20)];

        const result = mergeMessagesByCreatedAtDesc(existing, mapOf(existing), [
            textMessage('incoming-older', 35),
            textMessage('incoming-newer', 40),
        ]);

        expect(result.messages.map((message) => message.id)).toEqual([
            'incoming-newer',
            'incoming-older',
            'old-newer',
            'old-older',
        ]);
    });

    it('appends older paged messages at the tail', () => {
        const existing = [textMessage('latest', 30), textMessage('oldest-loaded', 20)];

        const result = mergeMessagesByCreatedAtDesc(existing, mapOf(existing), [
            textMessage('older-page-newer', 10),
            textMessage('older-page-older', 5),
        ]);

        expect(result.messages.map((message) => message.id)).toEqual([
            'latest',
            'oldest-loaded',
            'older-page-newer',
            'older-page-older',
        ]);
    });

    it('replaces an existing message and repositions it by timestamp', () => {
        const existing = [textMessage('first', 30), textMessage('target', 20), textMessage('last', 10)];

        const result = mergeMessagesByCreatedAtDesc(existing, mapOf(existing), [
            textMessage('target', 40, 'updated'),
        ]);

        expect(result.messages.map((message) => message.id)).toEqual(['target', 'first', 'last']);
        expect(result.messages[0]).toMatchObject({ id: 'target', text: 'updated', createdAt: 40 });
        expect(result.messagesMap.target).toMatchObject({ text: 'updated', createdAt: 40 });
    });

    it('deduplicates repeated updates in one batch using the final update', () => {
        const existing = [textMessage('existing', 30)];

        const result = mergeMessagesByCreatedAtDesc(existing, mapOf(existing), [
            textMessage('target', 20, 'first update'),
            textMessage('target', 40, 'final update'),
        ]);

        expect(result.messages.map((message) => message.id)).toEqual(['target', 'existing']);
        expect(result.messages[0]).toMatchObject({ text: 'final update', createdAt: 40 });
    });
});
