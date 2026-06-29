/**
 * Session operations for remote procedure calls
 * Provides strictly typed functions for all session-related RPC operations
 */

import { apiSocket } from './apiSocket';
import { sync } from './sync';
import { storage } from './storage';
import type { AgentState, MachineMetadata, Metadata, Session } from './storageTypes';
import { encodeBase64 } from '@/encryption/base64';
import { getRandomBytes } from 'expo-crypto';
import { sanitizeCodexTitle } from '@/utils/codexTitle';
export { machineEnsureSessionLive } from './sessionWorkerLive';

// Strict type definitions for all operations

// Permission operation types
interface SessionPermissionRequest {
    id: string;
    approved: boolean;
    reason?: string;
    mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
    allowTools?: string[];
    updatedInput?: Record<string, unknown>;
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}

// Mode change operation types
interface SessionModeChangeRequest {
    to: 'remote' | 'local';
}

interface SessionGoalActionRequest {
    action: 'clear' | 'stop' | 'edit';
    objective?: string;
}

// Bash operation types
interface SessionBashRequest {
    command: string;
    cwd?: string;
    timeout?: number;
}

interface SessionBashResponse {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
}

// Read file operation types
interface SessionReadFileRequest {
    path: string;
}

interface SessionReadFileResponse {
    success: boolean;
    content?: string; // base64 encoded
    error?: string;
}

// Write file operation types
interface SessionWriteFileRequest {
    path: string;
    content: string; // base64 encoded
    expectedHash?: string | null;
}

interface SessionWriteFileResponse {
    success: boolean;
    hash?: string;
    error?: string;
}

// List directory operation types
interface SessionListDirectoryRequest {
    path: string;
}

interface DirectoryEntry {
    name: string;
    type: 'file' | 'directory' | 'other';
    size?: number;
    modified?: number;
}

interface SessionListDirectoryResponse {
    success: boolean;
    entries?: DirectoryEntry[];
    error?: string;
}

// Directory tree operation types
interface SessionGetDirectoryTreeRequest {
    path: string;
    maxDepth: number;
}

interface TreeNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: number;
    children?: TreeNode[];
}

interface SessionGetDirectoryTreeResponse {
    success: boolean;
    tree?: TreeNode;
    error?: string;
}

// Ripgrep operation types
interface SessionRipgrepRequest {
    args: string[];
    cwd?: string;
}

interface SessionRipgrepResponse {
    success: boolean;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
}

// Kill session operation types
interface SessionKillRequest {
    // No parameters needed
}

interface SessionKillResponse {
    success: boolean;
    message: string;
}

// Response types for spawn session
export type SpawnSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'requestToApproveDirectoryCreation'; directory: string }
    | { type: 'error'; errorMessage: string };

export type RestartSessionResult =
    | {
        type: 'running';
        sessionId: string;
        workerState: 'running' | 'stale-version';
        pid?: number;
        startedVersion?: string;
        currentVersion?: string;
    }
    | {
        type: 'resumed';
        sessionId: string;
    }
    | {
        type: 'not-resumable';
        sessionId: string;
        workerState: string;
        reason: string;
        detail?: string;
    }
    | {
        type: 'error';
        sessionId: string;
        errorMessage: string;
    };

// Options for spawning a session
export interface SpawnSessionOptions {
    machineId: string;
    directory: string;
    approvedNewDirectoryCreation?: boolean;
    token?: string;
    agent?: 'codex' | 'claude' | 'gemini' | 'openclaw';
    /**
     * If set, the daemon spawns the agent with `--resume <id>` so the new
     * Happy session attaches to a pre-existing on-disk Claude conversation
     * file. Used by the session fork / duplicate flow.
     */
    resumeClaudeSessionId?: string;
    /**
     * If set, the daemon spawns Codex with `--resume <id>` so the new Happy
     * session attaches to an app-server thread created by fork / duplicate.
     */
    resumeCodexThreadId?: string;
    /** Happy session id this fork was branched from (lineage). */
    parentSessionId?: string;
    /** Happy message id used as the rewind point (only set for "duplicate"). */
    forkedFromMessageId?: string;
}

// Options for forking a Claude session on a machine
export interface ClaudeForkSessionOptions {
    machineId: string;
    /** Working directory of the source session — used to derive the Claude project dir. */
    directory: string;
    /** Source Claude session UUID (Session.metadata.claudeSessionId on the parent). */
    claudeSessionId: string;
}

export type ClaudeForkSessionResult =
    | { type: 'success'; newClaudeSessionId: string }
    | { type: 'error'; errorMessage: string };

export interface ClaudeRewindPoint {
    uuid: string;
    text: string;
    timestamp: number;
}

export type ClaudeListRewindPointsResult =
    | { type: 'success'; points: ClaudeRewindPoint[] }
    | { type: 'error'; errorMessage: string };

export interface CodexForkThreadOptions {
    machineId: string;
    /** Working directory of the source session, passed to Codex thread/fork. */
    directory: string;
    /** Source Codex app-server thread id (Session.metadata.codexThreadId). */
    codexThreadId: string;
}

export type CodexForkThreadResult =
    | { type: 'success'; newCodexThreadId: string }
    | { type: 'error'; errorMessage: string };

export interface CodexRewindPoint {
    itemId: string;
    text: string;
    timestamp: number;
}

export type CodexListRewindPointsResult =
    | { type: 'success'; points: CodexRewindPoint[] }
    | { type: 'error'; errorMessage: string };

export interface CodexThreadListItem {
    id: string;
    sessionId?: string | null;
    preview?: string | null;
    name?: string | null;
    path?: string | null;
    cwd?: string | null;
    projectPath?: string | null;
    workspaceRoot?: string | null;
    workspaceRoots?: string[] | null;
    gitInfo?: {
        originUrl?: string | null;
        [key: string]: unknown;
    } | null;
    codexProjectPath?: string | null;
    createdAt?: number | null;
    updatedAt?: number | null;
    recencyAt?: number | null;
    cliVersion?: string | null;
}

interface ImportedSessionCreateResponse {
    session?: {
        id: string;
        seq?: number;
        metadataVersion?: number;
        agentState?: string | null;
        agentStateVersion?: number;
        active?: boolean;
        activeAt?: number;
        createdAt?: number;
        updatedAt?: number;
    };
}

export type CodexListThreadsResult =
    | {
        type: 'success';
        threads: CodexThreadListItem[];
        nextCursor: string | null;
        backwardsCursor: string | null;
    }
    | { type: 'error'; errorMessage: string };

export type CodexSessionSyncResult =
    | { type: 'success'; fetched: number; imported: number; refreshed: number; skipped: number }
    | { type: 'error'; errorMessage: string };

export type CodexAccountRateLimitsRefreshResult =
    | { type: 'success'; updated: boolean }
    | { type: 'error'; errorMessage: string };

const CODEX_SYNC_MAX_THREADS_PER_PROJECT = 15;
const CODEX_SYNC_MAX_THREAD_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const CODEX_SECONDS_TIMESTAMP_THRESHOLD = 10_000_000_000;

export interface ResumeSessionOptions {
    machineId: string;
    sessionId: string;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
    for (const value of values) {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (trimmed.length > 0) {
            return trimmed;
        }
    }
    return null;
}

function normalizeCodexPath(value: string | null | undefined): string | null {
    const path = firstNonEmpty(value);
    if (!path) {
        return null;
    }

    if (path === '/') {
        return path;
    }

    return path.replace(/\/+$/g, '');
}

function isSameOrChildPath(path: string, parent: string): boolean {
    if (path === parent) {
        return true;
    }

    if (parent === '/') {
        return path.startsWith('/');
    }

    return path.startsWith(`${parent}/`);
}

function errorMessageFromUnknown(error: unknown, fallback: string): string {
    return firstNonEmpty(
        error instanceof Error ? error.message : null,
        typeof error === 'string' ? error : null,
    ) ?? fallback;
}

function codexThreadExplicitProjectPath(thread: CodexThreadListItem): string | null {
    return normalizeCodexPath(firstNonEmpty(
        thread.codexProjectPath,
        thread.projectPath,
        thread.workspaceRoot,
        thread.workspaceRoots?.[0],
    ));
}

function codexThreadPath(thread: CodexThreadListItem): string | null {
    return normalizeCodexPath(firstNonEmpty(thread.cwd, thread.path));
}

function codexThreadGitOrigin(thread: CodexThreadListItem): string | null {
    return firstNonEmpty(thread.gitInfo?.originUrl);
}

function findCodexProjectPathForThread(
    thread: CodexThreadListItem,
    candidatePathsByOrigin: Map<string, string[]>,
): string | null {
    const explicitPath = codexThreadExplicitProjectPath(thread);
    if (explicitPath) {
        return explicitPath;
    }

    const threadPath = codexThreadPath(thread);
    const origin = codexThreadGitOrigin(thread);
    if (!threadPath || !origin) {
        return threadPath;
    }

    const candidates = candidatePathsByOrigin.get(origin) ?? [];
    const ancestor = candidates.find((candidate) => isSameOrChildPath(threadPath, candidate));
    return ancestor ?? threadPath;
}

function withCodexProjectPaths(threads: CodexThreadListItem[]): CodexThreadListItem[] {
    const candidatePathsByOrigin = new Map<string, string[]>();
    for (const thread of threads) {
        const origin = codexThreadGitOrigin(thread);
        const threadPath = codexThreadPath(thread);
        if (!origin || !threadPath) {
            continue;
        }

        const candidates = candidatePathsByOrigin.get(origin) ?? [];
        if (!candidates.includes(threadPath)) {
            candidates.push(threadPath);
            candidatePathsByOrigin.set(origin, candidates);
        }
    }

    for (const candidates of candidatePathsByOrigin.values()) {
        candidates.sort((a, b) => a.length - b.length || a.localeCompare(b));
    }

    return threads.map((thread) => {
        const codexProjectPath = findCodexProjectPathForThread(thread, candidatePathsByOrigin);
        if (!codexProjectPath || codexProjectPath === thread.codexProjectPath) {
            return thread;
        }

        return {
            ...thread,
            codexProjectPath,
        };
    });
}

function codexThreadProjectPath(thread: CodexThreadListItem): string {
    return codexThreadExplicitProjectPath(thread) ?? codexThreadPath(thread) ?? '~';
}

function codexThreadProjectKey(thread: CodexThreadListItem): string {
    return codexThreadProjectPath(thread);
}

function normalizeCodexTimestamp(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return Math.trunc(value < CODEX_SECONDS_TIMESTAMP_THRESHOLD ? value * 1000 : value);
}

function codexThreadUpdatedAt(thread: CodexThreadListItem): number {
    return normalizeCodexTimestamp(thread.updatedAt)
        ?? normalizeCodexTimestamp(thread.recencyAt)
        ?? normalizeCodexTimestamp(thread.createdAt)
        ?? 0;
}

function selectCodexThreadsForSync(
    threads: CodexThreadListItem[],
    perProjectLimit = CODEX_SYNC_MAX_THREADS_PER_PROJECT,
    now = Date.now(),
): { selected: CodexThreadListItem[]; skippedByProjectLimit: number; skippedByAge: number } {
    const selected: CodexThreadListItem[] = [];
    const perProjectCounts = new Map<string, number>();
    let skippedByProjectLimit = 0;
    let skippedByAge = 0;

    const sortedThreads = withCodexProjectPaths(threads)
        .sort((a, b) => codexThreadUpdatedAt(b) - codexThreadUpdatedAt(a));
    for (const thread of sortedThreads) {
        const updatedAt = codexThreadUpdatedAt(thread);
        if (updatedAt <= 0 || now - updatedAt > CODEX_SYNC_MAX_THREAD_AGE_MS) {
            skippedByAge++;
            continue;
        }

        const projectKey = codexThreadProjectKey(thread);
        const projectCount = perProjectCounts.get(projectKey) ?? 0;
        if (projectCount >= perProjectLimit) {
            skippedByProjectLimit++;
            continue;
        }

        perProjectCounts.set(projectKey, projectCount + 1);
        selected.push(thread);
    }

    return { selected, skippedByProjectLimit, skippedByAge };
}

export function buildCodexImportedSessionMetadata(
    thread: CodexThreadListItem,
    machineId: string,
    machineMetadata?: MachineMetadata | null,
): Metadata {
    const path = codexThreadProjectPath(thread);
    const title = sanitizeCodexTitle(firstNonEmpty(thread.name, thread.preview)) ?? `Codex ${thread.id.slice(0, 8)}`;
    const updatedAt = codexThreadUpdatedAt(thread) || Date.now();

    return {
        path,
        host: machineMetadata?.host ?? 'codex.app',
        name: title,
        summary: {
            text: title,
            updatedAt,
        },
        machineId,
        homeDir: machineMetadata?.homeDir,
        happyHomeDir: machineMetadata?.happyHomeDir,
        codexThreadId: thread.id,
        flavor: 'codex',
        version: thread.cliVersion ?? undefined,
        lifecycleState: 'imported',
        archivedBy: 'codex-session-sync',
    };
}

function findImportedCodexThread(machineId: string, codexThreadId: string): Session | null {
    return Object.values(storage.getState().sessions).find((session) => (
        session.metadata?.machineId === machineId
        && session.metadata?.flavor === 'codex'
        && session.metadata?.codexThreadId === codexThreadId
    )) ?? null;
}

async function applyImportedCodexSessionLocally(response: Response, metadata: Metadata): Promise<void> {
    if (typeof response.json !== 'function') {
        return;
    }

    const payload = await response.json() as ImportedSessionCreateResponse;
    const created = payload.session;
    if (!created?.id) {
        return;
    }

    const active = created.active ?? false;
    const activeAt = metadata.summary?.updatedAt ?? created.activeAt ?? Date.now();
    const localSession: Omit<Session, 'presence'> & { presence?: 'online' | number } = {
        id: created.id,
        seq: created.seq ?? 0,
        createdAt: metadata.summary?.updatedAt ?? created.createdAt ?? activeAt,
        updatedAt: metadata.summary?.updatedAt ?? created.updatedAt ?? activeAt,
        active,
        activeAt,
        metadata,
        metadataVersion: created.metadataVersion ?? 0,
        agentState: null,
        agentStateVersion: created.agentStateVersion ?? 0,
        thinking: false,
        thinkingAt: 0,
        presence: active ? 'online' : activeAt,
    };

    storage.getState().applySessions([localSession]);
}

async function createImportedCodexSession(machineId: string, thread: CodexThreadListItem): Promise<void> {
    const machineMetadata = storage.getState().machines[machineId]?.metadata ?? null;
    const metadata = buildCodexImportedSessionMetadata(thread, machineId, machineMetadata);
    const dataEncryptionKey = getRandomBytes(32);
    const encryptedDataKey = await sync.encryption.encryptEncryptionKey(dataEncryptionKey);
    const sessionEncryption = await sync.encryption.openEncryption(dataEncryptionKey);
    const encryptedMetadata = await sessionEncryption.encrypt([metadata]);
    const tag = `codex:${machineId}:${thread.id}`;

    const response = await apiSocket.request('/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tag,
            metadata: encodeBase64(encryptedMetadata[0], 'base64'),
            agentState: null,
            dataEncryptionKey: encodeBase64(encryptedDataKey, 'base64'),
            active: false,
            updatedAt: metadata.summary?.updatedAt,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to import Codex session ${thread.id}: ${response.status}`);
    }

    await applyImportedCodexSessionLocally(response, metadata);
}

// Exported session operation functions

/**
 * Spawn a new remote session on a specific machine
 */
export async function machineSpawnNewSession(options: SpawnSessionOptions): Promise<SpawnSessionResult> {

    const { machineId, directory, approvedNewDirectoryCreation = false, token, agent, resumeClaudeSessionId, resumeCodexThreadId, parentSessionId, forkedFromMessageId } = options;

    try {
        const result = await apiSocket.machineRPC<SpawnSessionResult, {
            type: 'spawn-in-directory'
            directory: string
            approvedNewDirectoryCreation?: boolean,
            token?: string,
            agent?: 'codex' | 'claude' | 'gemini' | 'openclaw',
            resumeClaudeSessionId?: string,
            resumeCodexThreadId?: string,
            parentSessionId?: string,
            forkedFromMessageId?: string,
        }>(
            machineId,
            'spawn-happy-session',
            { type: 'spawn-in-directory', directory, approvedNewDirectoryCreation, token, agent, resumeClaudeSessionId, resumeCodexThreadId, parentSessionId, forkedFromMessageId }
        );
        return result;
    } catch (error) {
        // Handle RPC errors
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to spawn session'
        };
    }
}

/**
 * Copy the source session's Claude JSONL on the daemon machine and return
 * the new Claude session UUID. Caller then spawns a fresh Happy session
 * with `resumeClaudeSessionId` set to that UUID to attach a new Happy
 * session row to the copied conversation.
 */
export async function claudeForkSession(options: ClaudeForkSessionOptions): Promise<ClaudeForkSessionResult> {
    const { machineId, directory, claudeSessionId } = options;
    try {
        const result = await apiSocket.machineRPC<ClaudeForkSessionResult, {
            directory: string;
            claudeSessionId: string;
        }>(
            machineId,
            'claude-fork-session',
            { directory, claudeSessionId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to fork session',
        };
    }
}

/**
 * Read the on-disk Claude JSONL on the daemon machine and return user-text
 * messages with their underlying claudeUuid + timestamp. Disk is the
 * source of truth for the rewind picker — server-side envelopes miss
 * claudeUuid for any user message that travelled via the legacy
 * `sentFrom: 'web'` path.
 */
export async function claudeListRewindPoints(
    options: ClaudeForkSessionOptions,
): Promise<ClaudeListRewindPointsResult> {
    const { machineId, directory, claudeSessionId } = options;
    try {
        const result = await apiSocket.machineRPC<ClaudeListRewindPointsResult, {
            directory: string;
            claudeSessionId: string;
        }>(
            machineId,
            'claude-list-rewind-points',
            { directory, claudeSessionId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to list rewind points',
        };
    }
}

/**
 * Same as claudeForkSession, but truncates the copied JSONL right after the
 * line with `cutAfterUuid` (keeping the chosen message as the last entry,
 * dropping every line after — including the agent's response). Use this
 * for "rewind to message N and try again" flows. Daemon hard-fails if the
 * UUID isn't present in the source — never silently produces a
 * non-truncated copy.
 */
export async function claudeDuplicateSession(
    options: ClaudeForkSessionOptions & { cutAfterUuid: string },
): Promise<ClaudeForkSessionResult> {
    const { machineId, directory, claudeSessionId, cutAfterUuid } = options;
    try {
        const result = await apiSocket.machineRPC<ClaudeForkSessionResult, {
            directory: string;
            claudeSessionId: string;
            cutAfterUuid: string;
        }>(
            machineId,
            'claude-duplicate-session',
            { directory, claudeSessionId, cutAfterUuid },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to duplicate session',
        };
    }
}

export async function codexForkThread(options: CodexForkThreadOptions): Promise<CodexForkThreadResult> {
    const { machineId, directory, codexThreadId } = options;
    try {
        const result = await apiSocket.machineRPC<CodexForkThreadResult, {
            directory: string;
            codexThreadId: string;
        }>(
            machineId,
            'codex-fork-thread',
            { directory, codexThreadId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to fork Codex thread',
        };
    }
}

export async function codexDuplicateThread(
    options: CodexForkThreadOptions & { cutAfterItemId: string },
): Promise<CodexForkThreadResult> {
    const { machineId, directory, codexThreadId, cutAfterItemId } = options;
    try {
        const result = await apiSocket.machineRPC<CodexForkThreadResult, {
            directory: string;
            codexThreadId: string;
            cutAfterItemId: string;
        }>(
            machineId,
            'codex-duplicate-thread',
            { directory, codexThreadId, cutAfterItemId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to duplicate Codex thread',
        };
    }
}

export async function codexListRewindPoints(
    options: CodexForkThreadOptions,
): Promise<CodexListRewindPointsResult> {
    const { machineId, directory, codexThreadId } = options;
    try {
        const result = await apiSocket.machineRPC<CodexListRewindPointsResult, {
            directory: string;
            codexThreadId: string;
        }>(
            machineId,
            'codex-list-rewind-points',
            { directory, codexThreadId },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to list Codex rewind points',
        };
    }
}

export async function codexListThreads(machineId: string): Promise<CodexListThreadsResult> {
    try {
        return await apiSocket.machineRPC<CodexListThreadsResult, Record<string, never>>(
            machineId,
            'codex-list-threads',
            {},
        );
    } catch (error) {
        return {
            type: 'error',
            errorMessage: errorMessageFromUnknown(error, 'Failed to list Codex threads'),
        };
    }
}

export async function syncCodexSessions(machineId: string): Promise<CodexSessionSyncResult> {
    try {
        const listResult = await codexListThreads(machineId);
        if (listResult.type !== 'success') {
            return {
                type: 'error',
                errorMessage: firstNonEmpty(listResult.errorMessage) ?? 'Failed to list Codex threads',
            };
        }

        let imported = 0;
        let refreshed = 0;
        let skipped = 0;
        const { selected, skippedByProjectLimit, skippedByAge } = selectCodexThreadsForSync(listResult.threads);
        skipped += skippedByProjectLimit + skippedByAge;

        for (const thread of selected) {
            if (!thread.id) {
                skipped++;
                continue;
            }

            const existingImportedSession = findImportedCodexThread(machineId, thread.id);
            await createImportedCodexSession(machineId, thread);
            if (existingImportedSession) {
                refreshed++;
            } else {
                imported++;
            }
        }

        if (imported > 0 || refreshed > 0) {
            await sync.refreshSessions();
        }

        return {
            type: 'success',
            fetched: listResult.threads.length,
            imported,
            refreshed,
            skipped,
        };
    } catch (error) {
        return {
            type: 'error',
            errorMessage: errorMessageFromUnknown(error, 'Failed to sync Codex sessions'),
        };
    }
}

export async function refreshCodexAccountRateLimits(sessionId: string): Promise<CodexAccountRateLimitsRefreshResult> {
    const session = storage.getState().sessions[sessionId];
    if (!session) {
        return { type: 'error', errorMessage: 'Session not found' };
    }
    const machineId = session.metadata?.machineId;
    if (session.metadata?.flavor !== 'codex' || !machineId) {
        return { type: 'success', updated: false };
    }

    try {
        const result = await apiSocket.machineRPC<{
            type: 'success';
            rateLimits: AgentState['codexAccountRateLimits'] | null;
        }, Record<string, never>>(
            machineId,
            'codex-read-account-rate-limits',
            {},
        );

        if (result.type !== 'success' || !result.rateLimits) {
            return { type: 'success', updated: false };
        }

        const currentSession = storage.getState().sessions[sessionId];
        if (!currentSession) {
            return { type: 'error', errorMessage: 'Session not found' };
        }

        storage.getState().applySessions([{
            ...currentSession,
            agentState: {
                ...(currentSession.agentState ?? {}),
                codexAccountRateLimits: result.rateLimits,
            },
        }]);

        return { type: 'success', updated: true };
    } catch (error) {
        return {
            type: 'error',
            errorMessage: errorMessageFromUnknown(error, 'Failed to refresh Codex account rate limits'),
        };
    }
}

export async function machineResumeSession(options: ResumeSessionOptions & { model?: string; permissionMode?: string }): Promise<SpawnSessionResult> {
    const { machineId, sessionId, model, permissionMode } = options;

    try {
        const result = await apiSocket.machineRPC<SpawnSessionResult, { sessionId: string; model?: string; permissionMode?: string }>(
            machineId,
            'resume-happy-session',
            { sessionId, model, permissionMode },
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to resume session',
        };
    }
}

export function canResumeImportedCodexSession(session: Session): boolean {
    return Boolean(
        session.metadata?.flavor === 'codex'
        && session.metadata.lifecycleState === 'imported'
        && session.metadata.machineId
        && session.metadata.codexThreadId
        && session.metadata.path,
    );
}

function applyImportedCodexTitleToResumedSession(source: Session, resumedSessionId: string): void {
    const resumedSession = storage.getState().sessions[resumedSessionId];
    const sourceMetadata = source.metadata;
    if (!resumedSession?.metadata || !sourceMetadata) {
        return;
    }

    const inheritedName = firstNonEmpty(sourceMetadata.name, sourceMetadata.summary?.text);
    const inheritedSummary = sourceMetadata.summary;

    if (!inheritedName && !inheritedSummary) {
        return;
    }

    storage.getState().applySessions([{
        ...resumedSession,
        metadata: {
            ...resumedSession.metadata,
            ...(inheritedName ? { name: inheritedName } : {}),
            ...(inheritedSummary ? { summary: inheritedSummary } : {}),
        },
    }]);
}

function findRunningCodexSessionForImportedThread(source: Session): Session | null {
    const sourceMetadata = source.metadata;
    if (!sourceMetadata?.machineId || !sourceMetadata.codexThreadId) {
        return null;
    }

    const matches = Object.values(storage.getState().sessions)
        .filter((session) => (
            session.id !== source.id
            && session.metadata?.machineId === sourceMetadata.machineId
            && session.metadata?.flavor === 'codex'
            && session.metadata?.codexThreadId === sourceMetadata.codexThreadId
            && session.metadata?.lifecycleState !== 'imported'
            && (session.active || session.metadata?.lifecycleState === 'running')
        ))
        .sort((a, b) => (b.activeAt || b.updatedAt || 0) - (a.activeAt || a.updatedAt || 0));

    return matches[0] ?? null;
}

function refreshSessionsInBackground(afterRefresh?: () => void): void {
    let refreshResult: Promise<void> | void;
    try {
        refreshResult = sync.refreshSessions();
    } catch {
        return;
    }

    void Promise.resolve(refreshResult)
        .then(() => {
            afterRefresh?.();
        })
        .catch(() => {
            // Broadcast sync will still hydrate sessions when this fetch flakes.
        });
}

export async function resumeImportedCodexSession(session: Session): Promise<SpawnSessionResult> {
    const metadata = session.metadata;
    if (!metadata?.machineId || !metadata.codexThreadId || !metadata.path) {
        return {
            type: 'error',
            errorMessage: 'Imported Codex session is missing machine, thread, or path metadata.',
        };
    }

    const runningSession = findRunningCodexSessionForImportedThread(session);
    if (runningSession) {
        return { type: 'success', sessionId: runningSession.id };
    }

    const spawnResult = await machineSpawnNewSession({
        machineId: metadata.machineId,
        directory: metadata.path,
        agent: 'codex',
        approvedNewDirectoryCreation: false,
        resumeCodexThreadId: metadata.codexThreadId,
        parentSessionId: session.id,
    });

    if (spawnResult.type === 'success') {
        applyImportedCodexTitleToResumedSession(session, spawnResult.sessionId);
        refreshSessionsInBackground(() => {
            applyImportedCodexTitleToResumedSession(session, spawnResult.sessionId);
        });
    }

    return spawnResult;
}

export async function machineRestartSession(options: ResumeSessionOptions & { model?: string; permissionMode?: string }): Promise<RestartSessionResult> {
    const { machineId, sessionId, model, permissionMode } = options;

    try {
        return await apiSocket.machineRPC<RestartSessionResult, { sessionId: string; model?: string; permissionMode?: string; reason: string }>(
            machineId,
            'restart-happy-session',
            { sessionId, model, permissionMode, reason: 'manual-restart' },
        );
    } catch (error) {
        return {
            type: 'error',
            sessionId,
            errorMessage: error instanceof Error ? error.message : 'Failed to restart session',
        };
    }
}

/**
 * Permanently remove a machine from the server. Sessions spawned by the
 * machine are preserved; only the Machine row and its AccessKeys are deleted.
 */
export async function machineDelete(machineId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const response = await apiSocket.request(`/v1/machines/${machineId}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            return { success: true };
        }
        const error = await response.text();
        return { success: false, message: error || 'Failed to delete machine' };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Stop the daemon on a specific machine
 */
export async function machineStopDaemon(machineId: string): Promise<{ message: string }> {
    const result = await apiSocket.machineRPC<{ message: string }, {}>(
        machineId,
        'stop-daemon',
        {}
    );
    return result;
}

export async function machineStopSession(machineId: string, sessionId: string): Promise<{ message: string }> {
    return await apiSocket.machineRPC<{ message: string }, { sessionId: string }>(
        machineId,
        'stop-session',
        { sessionId },
    );
}

/**
 * Execute a bash command on a specific machine
 */
export async function machineBash(
    machineId: string,
    command: string,
    cwd: string
): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}> {
    try {
        const result = await apiSocket.machineRPC<{
            success: boolean;
            stdout: string;
            stderr: string;
            exitCode: number;
        }, {
            command: string;
            cwd: string;
        }>(
            machineId,
            'bash',
            { command, cwd }
        );
        return result;
    } catch (error) {
        return {
            success: false,
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            exitCode: -1
        };
    }
}

/**
 * Update machine metadata with optimistic concurrency control and automatic retry
 */
export async function machineUpdateMetadata(
    machineId: string,
    metadata: MachineMetadata,
    expectedVersion: number,
    maxRetries: number = 3
): Promise<{ version: number; metadata: string }> {
    let currentVersion = expectedVersion;
    let currentMetadata = { ...metadata };
    let retryCount = 0;

    const machineEncryption = sync.encryption.getMachineEncryption(machineId);
    if (!machineEncryption) {
        throw new Error(`Machine encryption not found for ${machineId}`);
    }

    while (retryCount < maxRetries) {
        const encryptedMetadata = await machineEncryption.encryptRaw(currentMetadata);

        const result = await apiSocket.emitWithAck<{
            result: 'success' | 'version-mismatch' | 'error';
            version?: number;
            metadata?: string;
            message?: string;
        }>('machine-update-metadata', {
            machineId,
            metadata: encryptedMetadata,
            expectedVersion: currentVersion
        });

        if (result.result === 'success') {
            return {
                version: result.version!,
                metadata: result.metadata!
            };
        } else if (result.result === 'version-mismatch') {
            // Get the latest version and metadata from the response
            currentVersion = result.version!;
            const latestMetadata = await machineEncryption.decryptRaw(result.metadata!) as MachineMetadata;

            // Merge our changes with the latest metadata
            // Preserve the displayName we're trying to set, but use latest values for other fields
            currentMetadata = {
                ...latestMetadata,
                displayName: metadata.displayName // Keep our intended displayName change
            };

            retryCount++;

            // If we've exhausted retries, throw error
            if (retryCount >= maxRetries) {
                throw new Error(`Failed to update after ${maxRetries} retries due to version conflicts`);
            }

            // Otherwise, loop will retry with updated version and merged metadata
        } else {
            throw new Error(result.message || 'Failed to update machine metadata');
        }
    }

    throw new Error('Unexpected error in machineUpdateMetadata');
}

/**
 * Abort the current session operation
 */
export async function sessionAbort(sessionId: string): Promise<void> {
    await apiSocket.sessionRPC(sessionId, 'abort', {
        reason: `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.`
    });
}

const PERMISSION_RESPONSE_TIMEOUT_MS = 10_000;

function withPermissionResponseTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return new Promise<T>((resolve, reject) => {
        timeout = setTimeout(() => {
            reject(new Error('Permission response timed out. The session may still be restarting; please retry.'));
        }, PERMISSION_RESPONSE_TIMEOUT_MS);

        promise.then(
            (value) => resolve(value),
            (error) => reject(error),
        ).finally(() => {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
        });
    });
}

/**
 * Allow a permission request
 */
export async function sessionAllow(sessionId: string, id: string, mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan', allowedTools?: string[], decision?: 'approved' | 'approved_for_session', updatedInput?: Record<string, unknown>): Promise<void> {
    const request: SessionPermissionRequest = { id, approved: true, mode, allowTools: allowedTools, decision, updatedInput };
    await withPermissionResponseTimeout(apiSocket.sessionRPC(sessionId, 'permission', request));
}

/**
 * Deny a permission request
 */
export async function sessionDeny(sessionId: string, id: string, mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan', allowedTools?: string[], decision?: 'denied' | 'abort'): Promise<void> {
    const request: SessionPermissionRequest = { id, approved: false, mode, allowTools: allowedTools, decision };
    await withPermissionResponseTimeout(apiSocket.sessionRPC(sessionId, 'permission', request));
}

/**
 * Request mode change for a session
 */
export async function sessionSwitch(sessionId: string, to: 'remote' | 'local'): Promise<boolean> {
    const request: SessionModeChangeRequest = { to };
    const response = await apiSocket.sessionRPC<boolean, SessionModeChangeRequest>(
        sessionId,
        'switch',
        request,
    );
    return response;
}

/**
 * Request an agent-owned goal action.
 */
export async function sessionGoalAction(
    sessionId: string,
    action: SessionGoalActionRequest['action'],
    objective?: string,
): Promise<void> {
    await apiSocket.sessionRPC(sessionId, 'goal-action', {
        action,
        ...(objective !== undefined ? { objective } : {}),
    } satisfies SessionGoalActionRequest);
}

/**
 * Execute a bash command in the session
 */
export async function sessionBash(sessionId: string, request: SessionBashRequest): Promise<SessionBashResponse> {
    try {
        const response = await apiSocket.sessionRPC<SessionBashResponse, SessionBashRequest>(
            sessionId,
            'bash',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            exitCode: -1,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Read a file from the session
 */
export async function sessionReadFile(sessionId: string, path: string): Promise<SessionReadFileResponse> {
    try {
        const request: SessionReadFileRequest = { path };
        const response = await apiSocket.sessionRPC<SessionReadFileResponse, SessionReadFileRequest>(
            sessionId,
            'readFile',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Write a file to the session
 */
export async function sessionWriteFile(
    sessionId: string,
    path: string,
    content: string,
    expectedHash?: string | null
): Promise<SessionWriteFileResponse> {
    try {
        const request: SessionWriteFileRequest = { path, content, expectedHash };
        const response = await apiSocket.sessionRPC<SessionWriteFileResponse, SessionWriteFileRequest>(
            sessionId,
            'writeFile',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * List directory contents in the session
 */
export async function sessionListDirectory(sessionId: string, path: string): Promise<SessionListDirectoryResponse> {
    try {
        const request: SessionListDirectoryRequest = { path };
        const response = await apiSocket.sessionRPC<SessionListDirectoryResponse, SessionListDirectoryRequest>(
            sessionId,
            'listDirectory',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get directory tree from the session
 */
export async function sessionGetDirectoryTree(
    sessionId: string,
    path: string,
    maxDepth: number
): Promise<SessionGetDirectoryTreeResponse> {
    try {
        const request: SessionGetDirectoryTreeRequest = { path, maxDepth };
        const response = await apiSocket.sessionRPC<SessionGetDirectoryTreeResponse, SessionGetDirectoryTreeRequest>(
            sessionId,
            'getDirectoryTree',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Run ripgrep in the session
 */
export async function sessionRipgrep(
    sessionId: string,
    args: string[],
    cwd?: string
): Promise<SessionRipgrepResponse> {
    try {
        const request: SessionRipgrepRequest = { args, cwd };
        const response = await apiSocket.sessionRPC<SessionRipgrepResponse, SessionRipgrepRequest>(
            sessionId,
            'ripgrep',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Kill the session process immediately
 */
export async function sessionKill(sessionId: string): Promise<SessionKillResponse> {
    try {
        const response = await apiSocket.sessionRPC<SessionKillResponse, {}>(
            sessionId,
            'killSession',
            {}
        );
        return response;
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Archive a session by deactivating it on the server.
 * Use this when the CLI process is already dead and sessionKill can't reach it.
 */
export async function sessionArchive(sessionId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const response = await apiSocket.request(`/v1/sessions/${sessionId}/archive`, {
            method: 'POST'
        });
        if (!response.ok) {
            return { success: false, message: `Server error: ${response.status}` };
        }
        return { success: true };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function sessionArchiveWithStop(options: {
    sessionId: string;
    machineId?: string | null;
    requireStop?: boolean;
}): Promise<{ success: boolean; message?: string }> {
    const stopFailures: string[] = [];
    let stopped = false;
    const killResult = await sessionKill(options.sessionId);
    if (!killResult.success) {
        stopFailures.push(killResult.message);
    } else {
        stopped = true;
    }

    if (options.machineId) {
        try {
            await machineStopSession(options.machineId, options.sessionId);
            stopped = true;
        } catch (error) {
            stopFailures.push(error instanceof Error ? error.message : 'Failed to stop session through daemon');
        }
    }

    if (options.requireStop && !stopped) {
        return {
            success: false,
            message: `Failed to stop session before archive: ${stopFailures.join('; ')}`,
        };
    }

    const result = await sessionArchive(options.sessionId);
    await sync.refreshSessions();
    return result;
}

/**
 * Permanently delete a session from the server
 * This will remove the session and all its associated data (messages, usage reports, access keys)
 * The session should be inactive/archived before deletion
 */
export async function sessionDelete(sessionId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const response = await apiSocket.request(`/v1/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            const result = await response.json();
            return { success: true };
        } else {
            const error = await response.text();
            return {
                success: false,
                message: error || 'Failed to delete session'
            };
        }
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

type ClaudeForkSource = {
    kind?: 'claude';
    sessionId: string;
    machineId: string;
    directory: string;
    claudeSessionId: string;
};

type CodexForkSource = {
    kind: 'codex';
    sessionId: string;
    machineId: string;
    directory: string;
    codexThreadId: string;
};

// Forking source description used by forkAndSpawn.
export type ForkSource = ClaudeForkSource | CodexForkSource;

type ForkOptions = {
    cutAfterUuid?: string;
    cutAfterItemId?: string;
    forkedFromMessageId?: string;
};

/**
 * Two-step orchestrator for the session fork / duplicate flow:
 *   1. Ask the daemon to copy (and optionally truncate) the source Claude
 *      JSONL — returns a fresh Claude session UUID.
 *   2. Spawn a new Happy session on the same machine with
 *      `resumeClaudeSessionId` set to that UUID so `claude --resume` picks
 *      up the copied conversation.
 *
 * Lineage (parentSessionId, forkedFromMessageId) rides through the spawn
 * RPC into env vars, then into the new Happy session's metadata at start
 * — so the parent link survives without any server-side schema change.
 */
export async function forkAndSpawn(
    source: ForkSource,
    opts: ForkOptions = {},
): Promise<SpawnSessionResult> {
    if (source.kind === 'codex') {
        const forkResult = opts.cutAfterItemId
            ? await codexDuplicateThread({
                machineId: source.machineId,
                directory: source.directory,
                codexThreadId: source.codexThreadId,
                cutAfterItemId: opts.cutAfterItemId,
            })
            : await codexForkThread({
                machineId: source.machineId,
                directory: source.directory,
                codexThreadId: source.codexThreadId,
            });

        if (forkResult.type !== 'success') {
            return { type: 'error', errorMessage: forkResult.errorMessage };
        }

        const spawnResult = await machineSpawnNewSession({
            machineId: source.machineId,
            directory: source.directory,
            agent: 'codex',
            approvedNewDirectoryCreation: false,
            resumeCodexThreadId: forkResult.newCodexThreadId,
            parentSessionId: source.sessionId,
            forkedFromMessageId: opts.forkedFromMessageId,
        });

        if (spawnResult.type === 'success') {
            refreshSessionsInBackground();
        }

        return spawnResult;
    }

    const forkResult = opts.cutAfterUuid
        ? await claudeDuplicateSession({
            machineId: source.machineId,
            directory: source.directory,
            claudeSessionId: source.claudeSessionId,
            cutAfterUuid: opts.cutAfterUuid,
        })
        : await claudeForkSession({
            machineId: source.machineId,
            directory: source.directory,
            claudeSessionId: source.claudeSessionId,
        });

    if (forkResult.type !== 'success') {
        return { type: 'error', errorMessage: forkResult.errorMessage };
    }

    const spawnResult = await machineSpawnNewSession({
        machineId: source.machineId,
        directory: source.directory,
        agent: 'claude',
        approvedNewDirectoryCreation: false,
        resumeClaudeSessionId: forkResult.newClaudeSessionId,
        parentSessionId: source.sessionId,
        forkedFromMessageId: opts.forkedFromMessageId,
    });

    // Pull the newly-created session row into local sync state in the
    // background. The spawn RPC already returned the new ID, so refresh must
    // not keep action buttons spinning on slow mobile links.
    if (spawnResult.type === 'success') {
        refreshSessionsInBackground();
    }

    return spawnResult;
}

// Export types for external use
export type {
    SessionBashRequest,
    SessionBashResponse,
    SessionReadFileResponse,
    SessionWriteFileResponse,
    SessionListDirectoryResponse,
    DirectoryEntry,
    SessionGetDirectoryTreeResponse,
    TreeNode,
    SessionRipgrepResponse,
    SessionKillResponse
};
