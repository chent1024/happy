import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { closePGlite, createPGlite } from "./pgliteLoader";

describe("PGlite loader lifecycle", () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    function tempDataDir(): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "happy-pglite-loader-"));
        tempDirs.push(root);
        return path.join(root, "pglite");
    }

    it("releases the directory lock when the PGlite instance is closed", async () => {
        const dataDir = tempDataDir();
        const pg = createPGlite(dataDir);
        expect(() => createPGlite(dataDir)).toThrow(/already in use/);

        await closePGlite(pg);

        const reopened = createPGlite(dataDir);
        await closePGlite(reopened);
    });
});
