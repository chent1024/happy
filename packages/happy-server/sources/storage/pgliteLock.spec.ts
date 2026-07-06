import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { acquirePGliteDirectoryLock } from "./pgliteLock";

describe("PGlite directory lock", () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    function tempDataDir(): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "happy-pglite-lock-"));
        tempDirs.push(root);
        return path.join(root, "pglite");
    }

    it("blocks a second active owner for the same data directory", () => {
        const dataDir = tempDataDir();
        const lock = acquirePGliteDirectoryLock(dataDir);
        try {
            expect(() => acquirePGliteDirectoryLock(dataDir)).toThrow(/already in use/);
        } finally {
            lock.release();
        }
    });

    it("allows the directory to be reused after release", () => {
        const dataDir = tempDataDir();
        acquirePGliteDirectoryLock(dataDir).release();

        const lock = acquirePGliteDirectoryLock(dataDir);
        lock.release();
    });

    it("creates the parent directory for a fresh PGlite path", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "happy-pglite-lock-"));
        tempDirs.push(root);
        const dataDir = path.join(root, "missing-parent", "pglite");

        const lock = acquirePGliteDirectoryLock(dataDir);
        expect(fs.existsSync(path.dirname(dataDir))).toBe(true);
        lock.release();
    });

    it("cleans up a stale lock when the owner process is gone", () => {
        const dataDir = tempDataDir();
        const lockDir = `${path.resolve(dataDir)}.lock`;
        fs.mkdirSync(lockDir, { recursive: true });
        fs.writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify({
            pid: -42,
            createdAt: new Date(0).toISOString(),
            dataDir: path.resolve(dataDir),
        }));

        const lock = acquirePGliteDirectoryLock(dataDir);
        lock.release();
    });
});
