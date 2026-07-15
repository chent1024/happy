import { Fastify } from "../types";
import { log } from "@/utils/log";
import { auth } from "@/app/auth/auth";

export function enableAuthentication(app: Fastify) {
    const verify = async (request: any, reply: any) => {
        try {
            const authHeader = request.headers.authorization;
            // Never include a bearer value (or its prefix) in logs. This route
            // is used by the Android system TTS relay as well as normal API calls.
            log({ module: 'auth-decorator' }, `Auth check - path: ${request.url}, has bearer header: ${typeof authHeader === 'string' && authHeader.startsWith('Bearer ')}`);
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                log({ module: 'auth-decorator' }, `Auth failed - missing or invalid header`);
                return reply.code(401).send({ error: 'Missing authorization header' });
            }

            const token = authHeader.substring(7);
            const verified = await auth.verifyToken(token);
            if (!verified) {
                log({ module: 'auth-decorator' }, `Auth failed - invalid token`);
                return reply.code(401).send({ error: 'Invalid token' });
            }
            return verified;
        } catch (error) {
            return reply.code(401).send({ error: 'Authentication failed' });
        }
    };

    app.decorate('authenticate', async function (request: any, reply: any) {
        const verified = await verify(request, reply);
        if (!verified || reply.sent) return;
        if (verified.extras?.purpose === 'tts-client') {
            return reply.code(403).send({ error: 'Token is restricted to TTS' });
        }
        log({ module: 'auth-decorator' }, `Auth success - user: ${verified.userId}`);
        request.userId = verified.userId;
    });

    app.decorate('authenticateTts', async function (request: any, reply: any) {
        const verified = await verify(request, reply);
        if (!verified || reply.sent) return;
        if (verified.extras?.purpose === 'tts-client'
            && verified.extras.machineId !== request.params?.id) {
            return reply.code(403).send({ error: 'Token is not valid for this machine' });
        }
        log({ module: 'auth-decorator' }, `TTS auth success - user: ${verified.userId}`);
        request.userId = verified.userId;
    });
}
