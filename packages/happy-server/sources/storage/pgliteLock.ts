import * as fs from "fs";
import * as path from "path";

export interface PGliteDirectoryLock {
    lockDir: string;
    release(): void;
}

interface LockOwner {
    pid: number;
    createdAt: string;
    dataDir: string;
}

function lockDirFor(dataDir: string): string {
    return `${path.resolve(dataDir)}.lock`;
}

function ownerFileFor(lockDir: string): string {
    return path.join(lockDir, "owner.json");
}

function isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function readLockOwner(lockDir: string): LockOwner | null {
    try {
        return JSON.parse(fs.readFileSync(ownerFileFor(lockDir), "utf8")) as LockOwner;
    } catch {
        return null;
    }
}

function createLock(lockDir: string, dataDir: string): PGliteDirectoryLock {
    fs.mkdirSync(lockDir);
    const owner: LockOwner = {
        pid: process.pid,
        createdAt: new Date().toISOString(),
        dataDir: path.resolve(dataDir),
    };
    fs.writeFileSync(ownerFileFor(lockDir), JSON.stringify(owner, null, 2));
    let released = false;

    return {
        lockDir,
        release() {
            if (released) {
                return;
            }
            released = true;
            try {
                fs.rmSync(lockDir, { recursive: true, force: true });
            } catch {
                // Best effort. A later startup will treat a dead-owner lock as stale.
            }
        },
    };
}

export function acquirePGliteDirectoryLock(dataDir: string): PGliteDirectoryLock {
    const lockDir = lockDirFor(dataDir);
    fs.mkdirSync(path.dirname(lockDir), { recursive: true });
    try {
        return createLock(lockDir, dataDir);
    } catch (error: any) {
        if (error?.code !== "EEXIST") {
            throw error;
        }
    }

    const owner = readLockOwner(lockDir);
    if (owner && isProcessAlive(owner.pid)) {
        throw new Error(
            `PGlite data directory is already in use by process ${owner.pid}: ${path.resolve(dataDir)}`
        );
    }

    fs.rmSync(lockDir, { recursive: true, force: true });
    return createLock(lockDir, dataDir);
}
