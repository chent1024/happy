import { buildNewMessageUpdate, eventRouter } from "@/app/events/eventRouter";
import { db } from "@/storage/db";
import { allocateSessionSeqBatch, allocateUserSeq } from "@/storage/seq";
import { delay } from "@/utils/delay";
import { log } from "@/utils/log";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { z } from "zod";
import { type Fastify } from "../types";

// Pagination contract:
//   - after_seq=N  → forward sync: messages with seq > N, ordered ASC.
//                    Used by the client to pull anything new since the highest
//                    seq it has already seen.
//   - before_seq=N → backward paging: messages with seq < N, ordered DESC.
//                    Used by the client to lazy-load older history when the
//                    user scrolls up, so opening a long session does not block
//                    on fetching the entire history first.
// The two are mutually exclusive. With neither, the route defaults to
// `after_seq=0` (forward from the start) for backward compatibility.
const getMessagesQuerySchema = z.object({
    after_seq: z.coerce.number().int().min(0).optional(),
    before_seq: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100)
}).refine(
    (data) => !(data.after_seq !== undefined && data.before_seq !== undefined),
    { message: "after_seq and before_seq are mutually exclusive" }
);

const sendMessagesBodySchema = z.object({
    messages: z.array(z.object({
        content: z.string(),
        localId: z.string().min(1)
    })).min(1).max(100)
});

const BACKWARD_MESSAGES_MIN_INTERVAL_MS = 1000;
const BACKWARD_MESSAGES_EXTENDED_INTERVAL_MS = 2000;
const BACKWARD_MESSAGES_EXTENDED_AFTER_PAGES = 3;
const BACKWARD_MESSAGES_THROTTLE_RESET_MS = 10_000;
const BACKWARD_MESSAGES_MAX_LIMIT = 50;
const MAX_BACKWARD_THROTTLE_KEYS = 10_000;
const FORWARD_EMPTY_CACHE_TTL_MS = 750;
const MAX_FORWARD_EMPTY_CACHE_KEYS = 10_000;

type BackwardThrottleEntry = {
    nextAllowedAt: number;
    lastReservedAt: number;
    streak: number;
};

type ForwardEmptyCacheEntry = {
    expiresAt: number;
    responseBody: {
        messages: [];
        hasMore: false;
    };
    responseBytes: number;
};

const backwardMessagesThrottle = new Map<string, BackwardThrottleEntry>();
const forwardEmptyMessagesCache = new Map<string, ForwardEmptyCacheEntry>();

type SelectedMessage = {
    id: string;
    seq: number;
    content: unknown;
    localId: string | null;
    createdAt: Date;
    updatedAt: Date;
};

function toResponseMessage(message: SelectedMessage) {
    return {
        id: message.id,
        seq: message.seq,
        content: message.content,
        localId: message.localId,
        createdAt: message.createdAt.getTime(),
        updatedAt: message.updatedAt.getTime()
    };
}

function toSendResponseMessage(message: Omit<SelectedMessage, "content">) {
    return {
        id: message.id,
        seq: message.seq,
        localId: message.localId,
        createdAt: message.createdAt.getTime(),
        updatedAt: message.updatedAt.getTime()
    };
}

function estimateJsonBytes(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value));
}

function reserveBackwardMessagesThrottle(userId: string, sessionId: string, now = Date.now()) {
    const key = `${userId}:${sessionId}`;
    const current = backwardMessagesThrottle.get(key);
    const shouldReset = !current || now - current.lastReservedAt > BACKWARD_MESSAGES_THROTTLE_RESET_MS;
    const streak = shouldReset ? 1 : current.streak + 1;
    const intervalMs = streak >= BACKWARD_MESSAGES_EXTENDED_AFTER_PAGES
        ? BACKWARD_MESSAGES_EXTENDED_INTERVAL_MS
        : BACKWARD_MESSAGES_MIN_INTERVAL_MS;
    const nextAllowedAt = shouldReset ? now : current.nextAllowedAt;
    const waitMs = Math.max(0, nextAllowedAt - now);
    backwardMessagesThrottle.set(key, {
        nextAllowedAt: now + waitMs + intervalMs,
        lastReservedAt: now,
        streak
    });

    if (backwardMessagesThrottle.size > MAX_BACKWARD_THROTTLE_KEYS) {
        for (const [entryKey, entry] of backwardMessagesThrottle) {
            if (entry.nextAllowedAt <= now && now - entry.lastReservedAt > BACKWARD_MESSAGES_THROTTLE_RESET_MS) {
                backwardMessagesThrottle.delete(entryKey);
            }
        }
    }

    return { waitMs, intervalMs, streak };
}

function getForwardEmptyCacheKey(userId: string, sessionId: string, afterSeq: number, limit: number) {
    return `${userId}:${sessionId}:${afterSeq}:${limit}`;
}

function readForwardEmptyCache(userId: string, sessionId: string, afterSeq: number, limit: number, now = Date.now()) {
    const key = getForwardEmptyCacheKey(userId, sessionId, afterSeq, limit);
    const cached = forwardEmptyMessagesCache.get(key);
    if (!cached) {
        return null;
    }
    if (cached.expiresAt <= now) {
        forwardEmptyMessagesCache.delete(key);
        return null;
    }
    return cached;
}

function writeForwardEmptyCache(userId: string, sessionId: string, afterSeq: number, limit: number, responseBytes: number, now = Date.now()) {
    const key = getForwardEmptyCacheKey(userId, sessionId, afterSeq, limit);
    forwardEmptyMessagesCache.set(key, {
        expiresAt: now + FORWARD_EMPTY_CACHE_TTL_MS,
        responseBody: { messages: [], hasMore: false },
        responseBytes
    });

    if (forwardEmptyMessagesCache.size > MAX_FORWARD_EMPTY_CACHE_KEYS) {
        for (const [entryKey, entry] of forwardEmptyMessagesCache) {
            if (entry.expiresAt <= now) {
                forwardEmptyMessagesCache.delete(entryKey);
            }
        }
    }
}

function clearForwardEmptyCache(userId: string, sessionId: string) {
    const prefix = `${userId}:${sessionId}:`;
    for (const key of forwardEmptyMessagesCache.keys()) {
        if (key.startsWith(prefix)) {
            forwardEmptyMessagesCache.delete(key);
        }
    }
}

export function v3SessionRoutes(app: Fastify) {
    app.get('/v3/sessions/:sessionId/messages', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string()
            }),
            querystring: getMessagesQuerySchema
        }
    }, async (request, reply) => {
        const startedAt = Date.now();
        const userId = request.userId;
        const { sessionId } = request.params;
        const { after_seq, before_seq, limit } = request.query;

        const sessionLookupStartedAt = Date.now();
        const session = await db.session.findFirst({
            where: {
                id: sessionId,
                accountId: userId
            },
            select: { id: true }
        });
        const sessionLookupMs = Date.now() - sessionLookupStartedAt;

        if (!session) {
            return reply.code(404).send({ error: 'Session not found' });
        }

        // Backward direction is opt-in via `before_seq`; everything else (no
        // params, or explicit `after_seq`) keeps the legacy forward semantics.
        const isBackward = before_seq !== undefined;
        const effectiveLimit = isBackward
            ? Math.min(limit, BACKWARD_MESSAGES_MAX_LIMIT)
            : limit;
        const effectiveAfterSeq = after_seq ?? 0;
        const cachedForwardEmpty = !isBackward
            ? readForwardEmptyCache(userId, sessionId, effectiveAfterSeq, effectiveLimit)
            : null;
        if (cachedForwardEmpty) {
            log({
                module: 'session-messages',
                userId,
                sessionId,
                direction: 'forward',
                afterSeq: after_seq,
                beforeSeq: before_seq,
                requestedLimit: limit,
                limit: effectiveLimit,
                returnedCount: 0,
                fetchedCount: 0,
                hasMore: false,
                responseBytes: cachedForwardEmpty.responseBytes,
                throttleDelayMs: 0,
                throttleIntervalMs: 0,
                backwardThrottleStreak: 0,
                cacheHit: true,
                sessionLookupMs,
                messagesQueryMs: 0,
                dbMs: sessionLookupMs,
                totalMs: Date.now() - startedAt
            }, 'Fetched session messages page');

            return reply.send(cachedForwardEmpty.responseBody);
        }

        const where = isBackward
            ? { sessionId, seq: { lt: before_seq } }
            : { sessionId, seq: { gt: effectiveAfterSeq } };
        const orderBy = isBackward
            ? { seq: 'desc' as const }
            : { seq: 'asc' as const };
        const throttle = isBackward
            ? reserveBackwardMessagesThrottle(userId, sessionId)
            : { waitMs: 0, intervalMs: 0, streak: 0 };
        if (throttle.waitMs > 0) {
            await delay(throttle.waitMs);
        }

        const messagesQueryStartedAt = Date.now();
        const messages = await db.sessionMessage.findMany({
            where,
            orderBy,
            take: effectiveLimit + 1,
            select: {
                id: true,
                seq: true,
                content: true,
                localId: true,
                createdAt: true,
                updatedAt: true
            }
        });
        const messagesQueryMs = Date.now() - messagesQueryStartedAt;

        const hasMore = messages.length > effectiveLimit;
        const page = hasMore ? messages.slice(0, effectiveLimit) : messages;
        const responseBody = {
            messages: page.map(toResponseMessage),
            hasMore
        };
        const responseBytes = estimateJsonBytes(responseBody);
        if (!isBackward && page.length === 0 && !hasMore) {
            writeForwardEmptyCache(userId, sessionId, effectiveAfterSeq, effectiveLimit, responseBytes);
        }

        log({
            module: 'session-messages',
            userId,
            sessionId,
            direction: isBackward ? 'backward' : 'forward',
            afterSeq: after_seq,
            beforeSeq: before_seq,
            requestedLimit: limit,
            limit: effectiveLimit,
            returnedCount: page.length,
            fetchedCount: messages.length,
            hasMore,
            responseBytes,
            throttleDelayMs: throttle.waitMs,
            throttleIntervalMs: throttle.intervalMs,
            backwardThrottleStreak: throttle.streak,
            cacheHit: false,
            sessionLookupMs,
            messagesQueryMs,
            dbMs: sessionLookupMs + messagesQueryMs,
            totalMs: Date.now() - startedAt
        }, 'Fetched session messages page');

        return reply.send(responseBody);
    });

    app.post('/v3/sessions/:sessionId/messages', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string()
            }),
            body: sendMessagesBodySchema
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.params;
        const { messages } = request.body;

        const session = await db.session.findFirst({
            where: {
                id: sessionId,
                accountId: userId
            },
            select: { id: true }
        });

        if (!session) {
            return reply.code(404).send({ error: 'Session not found' });
        }

        const firstMessageByLocalId = new Map<string, { localId: string; content: string }>();
        for (const message of messages) {
            if (!firstMessageByLocalId.has(message.localId)) {
                firstMessageByLocalId.set(message.localId, message);
            }
        }

        const uniqueMessages = Array.from(firstMessageByLocalId.values());
        const contentByLocalId = new Map(uniqueMessages.map((message) => [message.localId, message.content]));

        const txResult = await db.$transaction(async (tx) => {
            const localIds = uniqueMessages.map((message) => message.localId);
            const existing = await tx.sessionMessage.findMany({
                where: {
                    sessionId,
                    localId: { in: localIds }
                },
                select: {
                    id: true,
                    seq: true,
                    localId: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            const existingByLocalId = new Map<string, Omit<SelectedMessage, 'content'>>();
            for (const message of existing) {
                if (message.localId) {
                    existingByLocalId.set(message.localId, message);
                }
            }

            const newMessages = uniqueMessages.filter((message) => !existingByLocalId.has(message.localId));
            const seqs = await allocateSessionSeqBatch(sessionId, newMessages.length, tx);

            const createdMessages: Omit<SelectedMessage, 'content'>[] = [];
            for (let i = 0; i < newMessages.length; i += 1) {
                const message = newMessages[i];
                const createdMessage = await tx.sessionMessage.create({
                    data: {
                        sessionId,
                        seq: seqs[i],
                        content: {
                            t: 'encrypted',
                            c: message.content
                        },
                        localId: message.localId
                    },
                    select: {
                        id: true,
                        seq: true,
                        content: true,
                        localId: true,
                        createdAt: true,
                        updatedAt: true
                    }
                });
                createdMessages.push(createdMessage);
            }

            const responseMessages = [...existing, ...createdMessages].sort((a, b) => a.seq - b.seq);

            return {
                responseMessages,
                createdMessages
            };
        });
        clearForwardEmptyCache(userId, sessionId);

        for (const message of txResult.createdMessages) {
            const content = message.localId ? contentByLocalId.get(message.localId) : null;
            if (!content) {
                continue;
            }
            const updSeq = await allocateUserSeq(userId);
            const updatePayload = buildNewMessageUpdate({
                ...message,
                content: {
                    t: 'encrypted',
                    c: content
                }
            }, sessionId, updSeq, randomKeyNaked(12));

            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'all-interested-in-session', sessionId }
            });
        }

        return reply.send({
            messages: txResult.responseMessages.map(toSendResponseMessage)
        });
    });
}
