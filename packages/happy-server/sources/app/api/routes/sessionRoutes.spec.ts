import fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fastify } from "../types";

const {
    state,
    dbMock,
    resetState,
    allocateUserSeqMock,
    emitUpdateSpy,
} = vi.hoisted(() => {
    const emitUpdateSpy = vi.fn();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const state = {
        sessions: [] as any[],
        seq: 0,
    };

    const resetState = () => {
        state.sessions = [];
        state.seq = 0;
    };

    const matchesWhere = (row: any, where: any): boolean => {
        if (where.accountId && row.accountId !== where.accountId) return false;
        if (where.tag && row.tag !== where.tag) return false;
        if (where.OR) {
            return where.OR.some((clause: any) => {
                if (clause.active !== undefined && row.active !== clause.active) return false;
                if (clause.tag?.startsWith && !row.tag.startsWith(clause.tag.startsWith)) return false;
                return true;
            });
        }
        if (where.active !== undefined && row.active !== where.active) return false;
        return true;
    };

    const sessionFindFirst = vi.fn(async (args: any) => (
        state.sessions.find((row) => matchesWhere(row, args.where)) ?? null
    ));
    const sessionFindMany = vi.fn(async (args: any) => (
        state.sessions
            .filter((row) => matchesWhere(row, args.where))
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, args.take)
    ));
    const sessionCreate = vi.fn(async (args: any) => {
        const createdAt = args.data.createdAt ?? now;
        const updatedAt = args.data.updatedAt ?? now;
        const lastActiveAt = args.data.lastActiveAt ?? now;
        const row = {
            id: `session-${state.sessions.length + 1}`,
            seq: state.sessions.length + 1,
            accountId: args.data.accountId,
            tag: args.data.tag,
            metadata: args.data.metadata,
            metadataVersion: 0,
            agentState: args.data.agentState ?? null,
            agentStateVersion: 0,
            dataEncryptionKey: args.data.dataEncryptionKey ?? null,
            active: args.data.active ?? true,
            lastActiveAt,
            createdAt,
            updatedAt,
        };
        state.sessions.push(row);
        return row;
    });
    const sessionUpdate = vi.fn(async (args: any) => {
        const row = state.sessions.find((session) => session.id === args.where.id);
        if (!row) {
            throw new Error(`Session not found: ${args.where.id}`);
        }
        Object.assign(row, args.data);
        return row;
    });

    const dbMock = {
        session: {
            findFirst: sessionFindFirst,
            findMany: sessionFindMany,
            create: sessionCreate,
            update: sessionUpdate,
        },
    };
    const allocateUserSeqMock = vi.fn(async () => ++state.seq);

    return { state, dbMock, resetState, allocateUserSeqMock, emitUpdateSpy };
});

vi.mock("@/app/events/eventRouter", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/app/events/eventRouter")>();
    return { ...actual, eventRouter: { emitUpdate: emitUpdateSpy } };
});
vi.mock("@/storage/db", () => ({ db: dbMock }));
vi.mock("@/storage/seq", () => ({ allocateUserSeq: allocateUserSeqMock }));
vi.mock("@/utils/log", () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/app/session/sessionDelete", () => ({ sessionDelete: vi.fn() }));

import { sessionRoutes } from "./sessionRoutes";

async function createApp() {
    const app = fastify();
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
    sessionRoutes(typed);
    await typed.ready();
    return typed;
}

describe("sessionRoutes - historical Codex imports", () => {
    let app: Fastify;

    beforeEach(() => {
        resetState();
        emitUpdateSpy.mockClear();
        allocateUserSeqMock.mockClear();
    });

    afterEach(async () => {
        if (app) await app.close();
    });

    it("creates a session as inactive when requested", async () => {
        app = await createApp();

        const response = await app.inject({
            method: "POST",
            url: "/v1/sessions",
            headers: { "x-user-id": "user-1" },
            payload: {
                tag: "codex:machine-1:thread-1",
                metadata: "encrypted-metadata",
                dataEncryptionKey: Buffer.from("key").toString("base64"),
                active: false,
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().session.active).toBe(false);
        expect(state.sessions[0].active).toBe(false);
        expect(emitUpdateSpy.mock.calls[0][0].payload.body.active).toBe(false);
    });

    it("persists an imported Codex session using the Codex updatedAt timestamp", async () => {
        app = await createApp();

        const response = await app.inject({
            method: "POST",
            url: "/v1/sessions",
            headers: { "x-user-id": "user-1" },
            payload: {
                tag: "codex:machine-1:thread-new",
                metadata: "encrypted-metadata",
                dataEncryptionKey: Buffer.from("key").toString("base64"),
                active: false,
                updatedAt: 1700000005,
            },
        });

        expect(response.statusCode).toBe(200);
        expect(state.sessions[0].updatedAt.getTime()).toBe(1700000005000);
        expect(state.sessions[0].lastActiveAt.getTime()).toBe(1700000005000);
        expect(response.json().session.updatedAt).toBe(1700000005000);
    });

    it("updates an existing imported Codex session timestamp", async () => {
        app = await createApp();
        state.sessions = [{
            id: "codex-import",
            seq: 1,
            accountId: "user-1",
            tag: "codex:machine-1:thread-new",
            metadata: "codex-metadata",
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            active: false,
            lastActiveAt: new Date("1970-01-20T16:13:20.005Z"),
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("1970-01-20T16:13:20.005Z"),
        }];

        const response = await app.inject({
            method: "POST",
            url: "/v1/sessions",
            headers: { "x-user-id": "user-1" },
            payload: {
                tag: "codex:machine-1:thread-new",
                metadata: "encrypted-metadata",
                dataEncryptionKey: Buffer.from("key").toString("base64"),
                active: false,
                updatedAt: 1700000005,
            },
        });

        expect(response.statusCode).toBe(200);
        expect(state.sessions[0].updatedAt.getTime()).toBe(1700000005000);
        expect(state.sessions[0].lastActiveAt.getTime()).toBe(1700000005000);
        expect(response.json().session.id).toBe("codex-import");
        expect(response.json().session.updatedAt).toBe(1700000005000);
    });

    it("ignores client-supplied updatedAt for ordinary sessions", async () => {
        app = await createApp();

        const response = await app.inject({
            method: "POST",
            url: "/v1/sessions",
            headers: { "x-user-id": "user-1" },
            payload: {
                tag: "regular-session",
                metadata: "encrypted-metadata",
                dataEncryptionKey: Buffer.from("key").toString("base64"),
                updatedAt: 1700000005000,
            },
        });

        expect(response.statusCode).toBe(200);
        expect(state.sessions[0].updatedAt.getTime()).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
        expect(response.json().session.updatedAt).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
    });

    it("lists active sessions and inactive Codex imports, but not ordinary inactive sessions", async () => {
        app = await createApp();

        state.sessions = [
            {
                id: "active-session",
                seq: 1,
                accountId: "user-1",
                tag: "regular-active",
                metadata: "active-metadata",
                metadataVersion: 0,
                agentState: null,
                agentStateVersion: 0,
                dataEncryptionKey: null,
                active: true,
                lastActiveAt: new Date("2026-01-01T00:00:00.000Z"),
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            },
            {
                id: "codex-import",
                seq: 2,
                accountId: "user-1",
                tag: "codex:machine-1:thread-1",
                metadata: "codex-metadata",
                metadataVersion: 0,
                agentState: null,
                agentStateVersion: 0,
                dataEncryptionKey: null,
                active: false,
                lastActiveAt: new Date("2026-01-02T00:00:00.000Z"),
                createdAt: new Date("2026-01-02T00:00:00.000Z"),
                updatedAt: new Date("2026-01-02T00:00:00.000Z"),
            },
            {
                id: "archived-session",
                seq: 3,
                accountId: "user-1",
                tag: "regular-archived",
                metadata: "archived-metadata",
                metadataVersion: 0,
                agentState: null,
                agentStateVersion: 0,
                dataEncryptionKey: null,
                active: false,
                lastActiveAt: new Date("2026-01-03T00:00:00.000Z"),
                createdAt: new Date("2026-01-03T00:00:00.000Z"),
                updatedAt: new Date("2026-01-03T00:00:00.000Z"),
            },
        ];

        const response = await app.inject({
            method: "GET",
            url: "/v1/sessions",
            headers: { "x-user-id": "user-1" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().sessions.map((session: any) => session.id)).toEqual([
            "codex-import",
            "active-session",
        ]);
        expect(response.json().sessions.find((session: any) => session.id === "codex-import").active).toBe(false);
    });
});
