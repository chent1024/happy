import { z } from "zod";
import { type Fastify } from "../types";
import type { FastifyReply } from "fastify";
import * as semver from 'semver';
import { ANDROID_UP_TO_DATE, IOS_UP_TO_DATE } from "@/versions";
import fs from "node:fs";

const DEFAULT_ANDROID_UPDATE_MANIFEST = "/tmp/happy-apk/latest.json";

function readLocalAndroidUpdateUrl(): string | null {
    const manifestPath = process.env.HAPPY_ANDROID_UPDATE_MANIFEST || DEFAULT_ANDROID_UPDATE_MANIFEST;
    try {
        if (!fs.existsSync(manifestPath)) {
            return null;
        }
        const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const apkUrl = typeof parsed.apkUrl === "string" ? parsed.apkUrl : null;
        if (!apkUrl) {
            return null;
        }
        const url = new URL(apkUrl);
        if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.pathname.toLowerCase().endsWith(".apk")) {
            return null;
        }
        return apkUrl;
    } catch {
        return null;
    }
}

function sendUpdateUrl(reply: FastifyReply, updateUrl: string | null) {
    if (updateUrl) {
        reply.send({ updateUrl, update_url: updateUrl });
        return;
    }
    reply.send({ updateUrl: null });
}

export function versionRoutes(app: Fastify) {
    app.post('/v1/version', {
        schema: {
            body: z.object({
                platform: z.string(),
                version: z.string(),
                app_id: z.string()
            }),
            response: {
                200: z.object({
                    updateUrl: z.string().nullable(),
                    update_url: z.string().nullable().optional()
                })
            }
        }
    }, async (request, reply) => {
        const { platform, version, app_id } = request.body;

        // Check ios
        if (platform.toLowerCase() === 'ios') {
            if (semver.satisfies(version, IOS_UP_TO_DATE)) {
                reply.send({ updateUrl: null });
            } else {
                reply.send({ updateUrl: 'https://apps.apple.com/us/app/happy-claude-code-client/id6748571505' });
            }
            return;
        }

        // Check android
        if (platform.toLowerCase() === 'android') {
            const localUpdateUrl = readLocalAndroidUpdateUrl();
            if (localUpdateUrl) {
                sendUpdateUrl(reply, localUpdateUrl);
                return;
            }
            if (semver.satisfies(version, ANDROID_UP_TO_DATE)) {
                reply.send({ updateUrl: null });
            } else {
                reply.send({ updateUrl: 'https://play.google.com/store/apps/details?id=com.ex3ndr.happy' });
            }
            return;
        }

        // Fallbacke
        reply.send({ updateUrl: null });
    });
}
