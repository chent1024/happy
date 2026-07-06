import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterEach, describe, expect, it } from "vitest";
import { type Fastify } from "../types";
import { versionRoutes } from "./versionRoutes";

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    versionRoutes(typed);
    await typed.ready();
    return typed;
}

describe("versionRoutes", () => {
    let app: Fastify | undefined;
    const previousManifest = process.env.HAPPY_ANDROID_UPDATE_MANIFEST;

    afterEach(async () => {
        if (app) {
            await app.close();
            app = undefined;
        }
        if (previousManifest === undefined) {
            delete process.env.HAPPY_ANDROID_UPDATE_MANIFEST;
        } else {
            process.env.HAPPY_ANDROID_UPDATE_MANIFEST = previousManifest;
        }
    });

    it("returns a local Android APK update URL when a latest.json manifest is configured", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "happy-version-route-"));
        const manifestPath = path.join(tempDir, "latest.json");
        fs.writeFileSync(manifestPath, JSON.stringify({
            version: "1.7.0",
            apkUrl: "http://100.101.252.110:8766/app-release.apk",
        }));
        process.env.HAPPY_ANDROID_UPDATE_MANIFEST = manifestPath;
        app = await createApp();

        const response = await app.inject({
            method: "POST",
            url: "/v1/version",
            payload: {
                platform: "android",
                version: "1.7.0",
                app_id: "com.ex3ndr.happy",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            updateUrl: "http://100.101.252.110:8766/app-release.apk",
            update_url: "http://100.101.252.110:8766/app-release.apk",
        });
    });

    it("keeps Android up-to-date responses null when no local manifest exists", async () => {
        process.env.HAPPY_ANDROID_UPDATE_MANIFEST = path.join(os.tmpdir(), "missing-happy-latest.json");
        app = await createApp();

        const response = await app.inject({
            method: "POST",
            url: "/v1/version",
            payload: {
                platform: "android",
                version: "1.7.0",
                app_id: "com.ex3ndr.happy",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ updateUrl: null });
    });
});
