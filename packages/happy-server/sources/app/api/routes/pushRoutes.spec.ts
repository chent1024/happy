import fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fastify } from "../types";

const { dbMock, authMock } = vi.hoisted(() => {
    const dbMock = {
        accountPushToken: {
            deleteMany: vi.fn(async () => ({ count: 1 })),
        },
    };
    const authMock = {
        verifyToken: vi.fn(),
    };

    return { dbMock, authMock };
});

vi.mock("@/storage/db", () => ({ db: dbMock }));
vi.mock("@/app/auth/auth", () => ({ auth: authMock }));
vi.mock("@/utils/log", () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }));

import { pushRoutes } from "./pushRoutes";

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
    pushRoutes(typed);
    await typed.ready();
    return typed;
}

describe("pushRoutes - DELETE /v1/push-tokens/:token", () => {
    let app: Fastify;

    beforeEach(() => {
        authMock.verifyToken.mockReset();
        dbMock.accountPushToken.deleteMany.mockClear();
    });

    afterEach(async () => {
        if (app) await app.close();
    });

    it("is idempotent when a logout request carries an invalid token", async () => {
        authMock.verifyToken.mockResolvedValue(null);
        app = await createApp();

        const response = await app.inject({
            method: "DELETE",
            url: "/v1/push-tokens/expo-token",
            headers: { authorization: "Bearer stale-token" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ success: true });
        expect(dbMock.accountPushToken.deleteMany).toHaveBeenCalledWith({
            where: { token: "expo-token" },
        });
    });

    it("keeps account-scoped deletion when the token is valid", async () => {
        authMock.verifyToken.mockResolvedValue({ userId: "account-1" });
        app = await createApp();

        const response = await app.inject({
            method: "DELETE",
            url: "/v1/push-tokens/expo-token",
            headers: { authorization: "Bearer valid-token" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ success: true });
        expect(dbMock.accountPushToken.deleteMany).toHaveBeenCalledWith({
            where: {
                accountId: "account-1",
                token: "expo-token",
            },
        });
    });
});
