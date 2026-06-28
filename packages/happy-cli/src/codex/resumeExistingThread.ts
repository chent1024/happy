import { trimIdent } from '@/utils/trimIdent';
import { repairOversizedCodexSessionMetaFromError } from './codexThreadSessionMetaRepair';

type ResumeThreadClient = {
    resumeThread: (opts: {
        threadId: string;
        cwd: string;
        mcpServers: Record<string, unknown>;
    }) => Promise<{ threadId: string; model: string }>;
};

type ResumeThreadSession = {
    updateMetadata: (handler: (currentMetadata: any) => any) => void;
    sendSessionEvent: (event: { type: 'message'; message: string }) => void;
};

type ResumeThreadMessageBuffer = {
    addMessage: (message: string, type: 'status') => void;
};

export async function resumeExistingThread(opts: {
    client: ResumeThreadClient;
    session: ResumeThreadSession;
    messageBuffer: ResumeThreadMessageBuffer;
    threadId: string;
    cwd: string;
    mcpServers: Record<string, unknown>;
}): Promise<{ threadId: string; model: string }> {
    const resume = async () => {
        const resumedThread = await opts.client.resumeThread({
            threadId: opts.threadId,
            cwd: opts.cwd,
            mcpServers: opts.mcpServers,
        });
        if (resumedThread.threadId !== opts.threadId) {
            throw new Error(`Codex app-server resumed a different thread: expected ${opts.threadId}, got ${resumedThread.threadId}`);
        }
        return resumedThread;
    };

    try {
        let resumedThread: { threadId: string; model: string };
        try {
            resumedThread = await resume();
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            const repair = await repairOversizedCodexSessionMetaFromError({
                threadId: opts.threadId,
                errorMessage: reason,
            });
            if (!repair.repaired) {
                throw error;
            }
            opts.messageBuffer.addMessage(`Repaired Codex session metadata for ${trimIdent(opts.threadId)}`, 'status');
            opts.session.sendSessionEvent({
                type: 'message',
                message: `Repaired oversized Codex session metadata and retrying resume. Backup: ${repair.backupPath}`,
            });
            resumedThread = await resume();
        }

        opts.session.updateMetadata((currentMetadata) => ({
            ...currentMetadata,
            codexThreadId: resumedThread.threadId,
        }));
        opts.messageBuffer.addMessage(`Resumed thread ${trimIdent(resumedThread.threadId)}`, 'status');
        opts.session.sendSessionEvent({
            type: 'message',
            message: `Resumed Codex thread ${resumedThread.threadId}`,
        });

        return resumedThread;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to resume Codex thread ${opts.threadId}: ${reason}`);
    }
}
