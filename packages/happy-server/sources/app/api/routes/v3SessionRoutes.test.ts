import fastify from "fastify";
import fastifyCompress from "@fastify/compress";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fastify } from "../types";

type SessionRecord = {
    id: string;
    accountId: string;
    seq: number;
};

type MessageRecord = {
    id: string;
    sessionId: string;
    seq: number;
    localId: string | null;
    content: unknown;
    createdAt: Date;
    updatedAt: Date;
};

const {
    state,
    emitUpdateMock,
    logMock,
    dbMock,
    resetState,
    seedSession,
    seedMessage
} = vi.hoisted(() => {
    const state = {
        sessions: [] as SessionRecord[],
        messages: [] as MessageRecord[],
        accountSeqById: new Map<string, number>(),
        nextMessageId: 1,
        nowMs: 1700000000000
    };

    const resetState = () => {
        state.sessions = [];
        state.messages = [];
        state.accountSeqById = new Map<string, number>();
        state.nextMessageId = 1;
        state.nowMs = 1700000000000;
    };

    const seedSession = (input: Partial<SessionRecord> & Pick<SessionRecord, "id" | "accountId">) => {
        state.sessions.push({
            id: input.id,
            accountId: input.accountId,
            seq: input.seq ?? 0
        });
        if (!state.accountSeqById.has(input.accountId)) {
            state.accountSeqById.set(input.accountId, 0);
        }
    };

    const seedMessage = (input: {
        sessionId: string;
        seq: number;
        localId: string | null;
        content: unknown;
    }) => {
        const createdAt = new Date(state.nowMs);
        state.nowMs += 1;
        const msg: MessageRecord = {
            id: `seed-${state.nextMessageId}`,
            sessionId: input.sessionId,
            seq: input.seq,
            localId: input.localId,
            content: input.content,
            createdAt,
            updatedAt: createdAt
        };
        state.nextMessageId += 1;
        state.messages.push(msg);
    };

    const selectFields = <T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>) => {
        if (!select) {
            return { ...row };
        }
        const picked: Record<string, unknown> = {};
        for (const [key, enabled] of Object.entries(select)) {
            if (enabled) {
                picked[key] = row[key];
            }
        }
        return picked;
    };

    const sessionFindFirst = vi.fn(async (args: any) => {
        const row = state.sessions.find((session) => (
            session.id === args?.where?.id &&
            session.accountId === args?.where?.accountId
        ));
        if (!row) {
            return null;
        }
        return selectFields(row as unknown as Record<string, unknown>, args?.select) as SessionRecord;
    });

    const sessionUpdate = vi.fn(async (args: any) => {
        const session = state.sessions.find((item) => item.id === args?.where?.id);
        if (!session) {
            throw new Error("Session not found");
        }
        const increment = args?.data?.seq?.increment ?? 0;
        session.seq += increment;
        return selectFields(session as unknown as Record<string, unknown>, args?.select);
    });

    const accountUpdate = vi.fn(async (args: any) => {
        const accountId = args?.where?.id as string;
        const current = state.accountSeqById.get(accountId) ?? 0;
        const increment = args?.data?.seq?.increment ?? 0;
        const next = current + increment;
        state.accountSeqById.set(accountId, next);
        return selectFields({ seq: next }, args?.select);
    });

    const sessionMessageFindMany = vi.fn(async (args: any) => {
        let rows = [...state.messages];

        if (args?.where?.sessionId) {
            rows = rows.filter((message) => message.sessionId === args.where.sessionId);
        }
        if (typeof args?.where?.seq?.gt === "number") {
            rows = rows.filter((message) => message.seq > args.where.seq.gt);
        }
        if (typeof args?.where?.seq?.lt === "number") {
            rows = rows.filter((message) => message.seq < args.where.seq.lt);
        }
        if (Array.isArray(args?.where?.localId?.in)) {
            const localIds = new Set(args.where.localId.in);
            rows = rows.filter((message) => localIds.has(message.localId));
        }
        if (args?.orderBy?.seq === "asc") {
            rows.sort((a, b) => a.seq - b.seq);
        }
        if (args?.orderBy?.seq === "desc") {
            rows.sort((a, b) => b.seq - a.seq);
        }
        if (args?.orderBy?.createdAt === "desc") {
            rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (typeof args?.take === "number") {
            rows = rows.slice(0, args.take);
        }

        return rows.map((row) => selectFields(row as unknown as Record<string, unknown>, args?.select));
    });

    const sessionMessageCreate = vi.fn(async (args: any) => {
        const createdAt = new Date(state.nowMs);
        state.nowMs += 1;
        const row: MessageRecord = {
            id: `msg-${state.nextMessageId}`,
            sessionId: args?.data?.sessionId,
            seq: args?.data?.seq,
            localId: args?.data?.localId ?? null,
            content: args?.data?.content,
            createdAt,
            updatedAt: createdAt
        };
        state.nextMessageId += 1;
        state.messages.push(row);
        return selectFields(row as unknown as Record<string, unknown>, args?.select);
    });

    const txClient = {
        session: {
            update: sessionUpdate
        },
        sessionMessage: {
            findMany: sessionMessageFindMany,
            create: sessionMessageCreate
        },
        account: {
            update: accountUpdate
        }
    };

    const dbMock = {
        session: {
            findFirst: sessionFindFirst,
            update: sessionUpdate
        },
        account: {
            update: accountUpdate
        },
        sessionMessage: {
            findMany: sessionMessageFindMany,
            create: sessionMessageCreate
        },
        $transaction: vi.fn(async (fn: any) => fn(txClient))
    };

    const emitUpdateMock = vi.fn();
    const logMock = vi.fn();

    return {
        state,
        emitUpdateMock,
        logMock,
        dbMock,
        resetState,
        seedSession,
        seedMessage
    };
});

vi.mock("@/storage/db", () => ({
    db: dbMock
}));

vi.mock("@/utils/randomKeyNaked", () => ({
    randomKeyNaked: vi.fn(() => "update-id")
}));

vi.mock("@/utils/log", () => ({
    log: logMock
}));

vi.mock("@/app/events/eventRouter", () => ({
    eventRouter: {
        emitUpdate: emitUpdateMock
    },
    buildNewMessageUpdate: vi.fn((message: unknown, sessionId: string, updateSeq: number, updateId: string) => ({
        id: updateId,
        seq: updateSeq,
        body: {
            t: "new-message",
            sid: sessionId,
            message
        },
        createdAt: Date.now()
    }))
}));

import { v3SessionRoutes } from "./v3SessionRoutes";

async function createApp() {
    const app = fastify();
    await app.register(fastifyCompress, {
        global: true,
        threshold: 1024
    });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;

    typed.decorate("authenticate", async (request: any, reply: any) => {
        const userId = request.headers["x-user-id"];
        if (typeof userId !== "string") {
            return reply.code(401).send({ error: "Unauthorized" });
        }
        request.userId = userId;
    });

    v3SessionRoutes(typed);
    await typed.ready();
    return typed;
}

describe("v3SessionRoutes", () => {
    let app: Fastify;

    beforeEach(() => {
        resetState();
        emitUpdateMock.mockClear();
        logMock.mockClear();
    });

    afterEach(async () => {
        vi.useRealTimers();
        if (app) {
            await app.close();
        }
    });

    it("reads messages in seq order from the beginning", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        seedMessage({ sessionId: "session-1", seq: 2, localId: "l2", content: { t: "encrypted", c: "b" } });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "l1", content: { t: "encrypted", c: "a" } });

        app = await createApp();
        const response = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "user-1" }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.hasMore).toBe(false);
        expect(body.messages.map((message: any) => message.seq)).toEqual([1, 2]);
    });

    it("logs read performance and response size for message pages", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "l1", content: { t: "encrypted", c: "a" } });

        app = await createApp();
        const response = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=0&limit=2",
            headers: { "x-user-id": "user-1" }
        });

        expect(response.statusCode).toBe(200);
        expect(logMock).toHaveBeenCalledWith(
            expect.objectContaining({
                module: "session-messages",
                userId: "user-1",
                sessionId: "session-1",
                direction: "forward",
                limit: 2,
                returnedCount: 1,
                hasMore: false,
                responseBytes: expect.any(Number),
                dbMs: expect.any(Number),
                totalMs: expect.any(Number)
            }),
            "Fetched session messages page"
        );
    });

    it("compresses large message pages when the client accepts gzip", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        for (let seq = 1; seq <= 3; seq += 1) {
            seedMessage({
                sessionId: "session-1",
                seq,
                localId: `l${seq}`,
                content: { t: "encrypted", c: "x".repeat(1200) }
            });
        }

        app = await createApp();
        const response = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=0&limit=3",
            headers: {
                "x-user-id": "user-1",
                "accept-encoding": "gzip"
            }
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-encoding"]).toBe("gzip");
        expect(response.headers["vary"]).toContain("accept-encoding");
    });

    it("supports cursor pagination with hasMore", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        for (let seq = 1; seq <= 5; seq += 1) {
            seedMessage({ sessionId: "session-1", seq, localId: `l${seq}`, content: { t: "encrypted", c: String(seq) } });
        }

        app = await createApp();
        const page1 = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=0&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        const body1 = page1.json();
        expect(body1.messages.map((message: any) => message.seq)).toEqual([1, 2]);
        expect(body1.hasMore).toBe(true);

        const page2 = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=2&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        const body2 = page2.json();
        expect(body2.messages.map((message: any) => message.seq)).toEqual([3, 4]);
        expect(body2.hasMore).toBe(true);

        const page3 = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=4&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        const body3 = page3.json();
        expect(body3.messages.map((message: any) => message.seq)).toEqual([5]);
        expect(body3.hasMore).toBe(false);
    });

    it("supports backward pagination with before_seq returning newest first", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));

        seedSession({ id: "session-1", accountId: "user-1" });
        for (let seq = 1; seq <= 5; seq += 1) {
            seedMessage({ sessionId: "session-1", seq, localId: `l${seq}`, content: { t: "encrypted", c: String(seq) } });
        }

        app = await createApp();
        // No before_seq cursor → ask for the latest page.
        // Use Number.MAX_SAFE_INTEGER as the upper bound so the server returns
        // the newest messages first without the client needing to know the
        // current max seq.
        const latest = await app.inject({
            method: "GET",
            url: `/v3/sessions/session-1/messages?before_seq=${Number.MAX_SAFE_INTEGER}&limit=2`,
            headers: { "x-user-id": "user-1" }
        });
        expect(latest.statusCode).toBe(200);
        const body1 = latest.json();
        expect(body1.messages.map((message: any) => message.seq)).toEqual([5, 4]);
        expect(body1.hasMore).toBe(true);

        // Cursor backward from the lowest seq returned in the previous page.
        const olderPromise = app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?before_seq=4&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        await vi.advanceTimersByTimeAsync(1000);
        const older = await olderPromise;
        const body2 = older.json();
        expect(body2.messages.map((message: any) => message.seq)).toEqual([3, 2]);
        expect(body2.hasMore).toBe(true);

        // Final page: only seq=1 remains.
        const oldestPromise = app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?before_seq=2&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        await vi.advanceTimersByTimeAsync(1000);
        const oldest = await oldestPromise;
        const body3 = oldest.json();
        expect(body3.messages.map((message: any) => message.seq)).toEqual([1]);
        expect(body3.hasMore).toBe(false);
    });

    it("caps backward history pages at 50 messages without reducing forward pages", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));

        seedSession({ id: "cap-session", accountId: "cap-user" });
        for (let seq = 1; seq <= 80; seq += 1) {
            seedMessage({ sessionId: "cap-session", seq, localId: `l${seq}`, content: { t: "encrypted", c: String(seq) } });
        }

        app = await createApp();
        const forward = await app.inject({
            method: "GET",
            url: "/v3/sessions/cap-session/messages?after_seq=0&limit=80",
            headers: { "x-user-id": "cap-user" }
        });
        expect(forward.statusCode).toBe(200);
        expect(forward.json().messages).toHaveLength(80);

        const backwardPromise = app.inject({
            method: "GET",
            url: `/v3/sessions/cap-session/messages?before_seq=${Number.MAX_SAFE_INTEGER}&limit=100`,
            headers: { "x-user-id": "cap-user" }
        });
        const backward = await backwardPromise;
        const backwardBody = backward.json();
        expect(backward.statusCode).toBe(200);
        expect(backwardBody.messages).toHaveLength(50);
        expect(backwardBody.messages[0].seq).toBe(80);
        expect(backwardBody.messages[49].seq).toBe(31);
        expect(backwardBody.hasMore).toBe(true);
        expect(logMock).toHaveBeenCalledWith(
            expect.objectContaining({
                module: "session-messages",
                direction: "backward",
                requestedLimit: 100,
                limit: 50,
                returnedCount: 50,
                fetchedCount: 51,
                hasMore: true
            }),
            "Fetched session messages page"
        );
    });

    it("coalesces repeated empty forward pages for a short TTL", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));

        seedSession({ id: "empty-forward-session", accountId: "user-1" });
        dbMock.sessionMessage.findMany.mockClear();

        app = await createApp();
        const first = await app.inject({
            method: "GET",
            url: "/v3/sessions/empty-forward-session/messages?after_seq=10&limit=100",
            headers: { "x-user-id": "user-1" }
        });
        expect(first.statusCode).toBe(200);
        expect(first.json()).toEqual({ messages: [], hasMore: false });
        expect(dbMock.sessionMessage.findMany).toHaveBeenCalledTimes(1);

        const second = await app.inject({
            method: "GET",
            url: "/v3/sessions/empty-forward-session/messages?after_seq=10&limit=100",
            headers: { "x-user-id": "user-1" }
        });
        expect(second.statusCode).toBe(200);
        expect(second.json()).toEqual({ messages: [], hasMore: false });
        expect(dbMock.sessionMessage.findMany).toHaveBeenCalledTimes(1);
        expect(logMock).toHaveBeenLastCalledWith(
            expect.objectContaining({
                module: "session-messages",
                direction: "forward",
                cacheHit: true,
                returnedCount: 0,
                messagesQueryMs: 0
            }),
            "Fetched session messages page"
        );

        await vi.advanceTimersByTimeAsync(751);
        const third = await app.inject({
            method: "GET",
            url: "/v3/sessions/empty-forward-session/messages?after_seq=10&limit=100",
            headers: { "x-user-id": "user-1" }
        });
        expect(third.statusCode).toBe(200);
        expect(dbMock.sessionMessage.findMany).toHaveBeenCalledTimes(2);
    });

    it("soft-throttles repeated backward history pages per user session", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));

        seedSession({ id: "throttle-session", accountId: "user-1" });
        for (let seq = 1; seq <= 5; seq += 1) {
            seedMessage({ sessionId: "throttle-session", seq, localId: `l${seq}`, content: { t: "encrypted", c: String(seq) } });
        }

        app = await createApp();
        const first = await app.inject({
            method: "GET",
            url: "/v3/sessions/throttle-session/messages?before_seq=6&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        expect(first.statusCode).toBe(200);

        const secondPromise = app.inject({
            method: "GET",
            url: "/v3/sessions/throttle-session/messages?before_seq=4&limit=2",
            headers: { "x-user-id": "user-1" }
        });

        await vi.advanceTimersByTimeAsync(999);
        let settled = false;
        void secondPromise.then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        const second = await secondPromise;
        expect(second.statusCode).toBe(200);
        expect(logMock).toHaveBeenLastCalledWith(
            expect.objectContaining({
                module: "session-messages",
                direction: "backward",
                throttleDelayMs: 1000
            }),
            "Fetched session messages page"
        );
    });

    it("backs off continuous backward history pages after the first pages", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));

        seedSession({ id: "backoff-session", accountId: "user-1" });
        for (let seq = 1; seq <= 10; seq += 1) {
            seedMessage({ sessionId: "backoff-session", seq, localId: `l${seq}`, content: { t: "encrypted", c: String(seq) } });
        }

        app = await createApp();
        const first = await app.inject({
            method: "GET",
            url: "/v3/sessions/backoff-session/messages?before_seq=11&limit=1",
            headers: { "x-user-id": "user-1" }
        });
        expect(first.statusCode).toBe(200);

        const secondPromise = app.inject({
            method: "GET",
            url: "/v3/sessions/backoff-session/messages?before_seq=10&limit=1",
            headers: { "x-user-id": "user-1" }
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect((await secondPromise).statusCode).toBe(200);

        const thirdPromise = app.inject({
            method: "GET",
            url: "/v3/sessions/backoff-session/messages?before_seq=9&limit=1",
            headers: { "x-user-id": "user-1" }
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect((await thirdPromise).statusCode).toBe(200);

        const fourthPromise = app.inject({
            method: "GET",
            url: "/v3/sessions/backoff-session/messages?before_seq=8&limit=1",
            headers: { "x-user-id": "user-1" }
        });
        let settled = false;
        void fourthPromise.then(() => {
            settled = true;
        });
        await vi.advanceTimersByTimeAsync(1999);
        await Promise.resolve();
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        const fourth = await fourthPromise;
        expect(fourth.statusCode).toBe(200);
        expect(logMock).toHaveBeenLastCalledWith(
            expect.objectContaining({
                module: "session-messages",
                direction: "backward",
                backwardThrottleStreak: 4,
                throttleDelayMs: 2000,
                throttleIntervalMs: 2000
            }),
            "Fetched session messages page"
        );
    });

    it("rejects requests that combine after_seq and before_seq", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "l1", content: { t: "encrypted", c: "a" } });

        app = await createApp();
        const response = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=0&before_seq=10",
            headers: { "x-user-id": "user-1" }
        });
        expect(response.statusCode).toBe(400);
    });

    it("returns empty results for empty sessions and after_seq beyond latest", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "l1", content: { t: "encrypted", c: "a" } });

        app = await createApp();
        const emptyResponse = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=1",
            headers: { "x-user-id": "user-1" }
        });

        expect(emptyResponse.statusCode).toBe(200);
        const body = emptyResponse.json();
        expect(body.messages).toEqual([]);
        expect(body.hasMore).toBe(false);
    });

    it("enforces read query bounds and auth/session ownership", async () => {
        seedSession({ id: "session-1", accountId: "owner-user" });
        app = await createApp();

        const invalidLimit = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?limit=0",
            headers: { "x-user-id": "owner-user" }
        });
        expect(invalidLimit.statusCode).toBe(400);

        const tooLargeLimit = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?limit=501",
            headers: { "x-user-id": "owner-user" }
        });
        expect(tooLargeLimit.statusCode).toBe(400);

        const unauthorized = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages"
        });
        expect(unauthorized.statusCode).toBe(401);

        const wrongOwner = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "another-user" }
        });
        expect(wrongOwner.statusCode).toBe(404);
    });

    it("sends a single message and emits a new-message update", async () => {
        seedSession({ id: "session-1", accountId: "user-1", seq: 0 });

        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "user-1" },
            payload: {
                messages: [
                    { localId: "l1", content: "enc-content-1" }
                ]
            }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.messages).toHaveLength(1);
        expect(body.messages[0].seq).toBe(1);
        expect(body.messages[0].localId).toBe("l1");

        expect(state.messages).toHaveLength(1);
        expect(state.messages[0].content).toEqual({ t: "encrypted", c: "enc-content-1" });
        expect(emitUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("sends multiple messages with sequential seq numbers", async () => {
        seedSession({ id: "session-1", accountId: "user-1", seq: 0 });

        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "user-1" },
            payload: {
                messages: [
                    { localId: "l1", content: "enc-1" },
                    { localId: "l2", content: "enc-2" },
                    { localId: "l3", content: "enc-3" }
                ]
            }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.messages.map((message: any) => message.seq)).toEqual([1, 2, 3]);
        expect(emitUpdateMock).toHaveBeenCalledTimes(3);
    });

    it("deduplicates by localId and returns mixed existing/new messages sorted by seq", async () => {
        seedSession({ id: "session-1", accountId: "user-1", seq: 1 });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "existing", content: { t: "encrypted", c: "old" } });

        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "user-1" },
            payload: {
                messages: [
                    { localId: "new-1", content: "new-content" },
                    { localId: "existing", content: "ignored" }
                ]
            }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.messages.map((message: any) => message.localId)).toEqual(["existing", "new-1"]);
        expect(body.messages.map((message: any) => message.seq)).toEqual([1, 2]);
        expect(state.messages).toHaveLength(2);
        expect(emitUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("enforces send validation limits and auth/session ownership", async () => {
        seedSession({ id: "session-1", accountId: "owner-user" });
        app = await createApp();

        const emptyBatch = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "owner-user" },
            payload: { messages: [] }
        });
        expect(emptyBatch.statusCode).toBe(400);

        const overLimitBatch = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "owner-user" },
            payload: {
                messages: Array.from({ length: 101 }, (_, index) => ({
                    localId: `l-${index}`,
                    content: `enc-${index}`
                }))
            }
        });
        expect(overLimitBatch.statusCode).toBe(400);

        const unauthorized = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            payload: {
                messages: [{ localId: "l1", content: "enc-1" }]
            }
        });
        expect(unauthorized.statusCode).toBe(401);

        const wrongOwner = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "another-user" },
            payload: {
                messages: [{ localId: "l1", content: "enc-1" }]
            }
        });
        expect(wrongOwner.statusCode).toBe(404);
    });
});
