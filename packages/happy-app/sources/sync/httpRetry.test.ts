import { describe, expect, it } from 'vitest';

import {
    fetchWithRetry,
    isIdempotentHttpMethod,
    shouldRetryHttpStatus,
} from './httpRetry';

describe('httpRetry', () => {
    it('retries only idempotent methods by default', () => {
        expect(isIdempotentHttpMethod(undefined)).toBe(true);
        expect(isIdempotentHttpMethod('GET')).toBe(true);
        expect(isIdempotentHttpMethod('HEAD')).toBe(true);
        expect(isIdempotentHttpMethod('POST')).toBe(false);
    });

    it('classifies transient HTTP statuses', () => {
        expect(shouldRetryHttpStatus(408)).toBe(true);
        expect(shouldRetryHttpStatus(429)).toBe(true);
        expect(shouldRetryHttpStatus(503)).toBe(true);
        expect(shouldRetryHttpStatus(404)).toBe(false);
    });

    it('retries GET failures with backoff', async () => {
        const waits: number[] = [];
        let attempts = 0;
        const response = await fetchWithRetry('https://example.test/messages', {
            retry: { attempts: 3, baseDelayMs: 0 },
            timeoutMs: 0,
        }, {
            random: () => 0,
            sleep: async (ms) => {
                waits.push(ms);
            },
            fetchImpl: async () => {
                attempts += 1;
                if (attempts < 3) {
                    throw new Error('network down');
                }
                return new Response('ok', { status: 200 });
            },
        });

        expect(response.status).toBe(200);
        expect(attempts).toBe(3);
        expect(waits).toEqual([0, 0]);
    });

    it('does not retry POST by default', async () => {
        let attempts = 0;
        const response = await fetchWithRetry('https://example.test/messages', {
            method: 'POST',
            timeoutMs: 0,
        }, {
            fetchImpl: async () => {
                attempts += 1;
                return new Response('busy', { status: 503 });
            },
        });

        expect(response.status).toBe(503);
        expect(attempts).toBe(1);
    });
});
