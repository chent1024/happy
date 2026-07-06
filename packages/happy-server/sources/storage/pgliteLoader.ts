import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";
import { acquirePGliteDirectoryLock, PGliteDirectoryLock } from "./pgliteLock";

type WebAssemblyModuleCtor = new (bytes: Buffer) => WebAssembly.Module;

function getWebAssemblyModuleCtor(): WebAssemblyModuleCtor | null {
    const moduleCtor = (globalThis as { WebAssembly?: { Module?: unknown } }).WebAssembly?.Module;
    return typeof moduleCtor === "function"
        ? (moduleCtor as WebAssemblyModuleCtor)
        : null;
}

function findWasmFiles(): { wasmModule: WebAssembly.Module; fsBundle: Blob } | null {
    const wasmModuleCtor = getWebAssemblyModuleCtor();
    if (!wasmModuleCtor) {
        return null;
    }
    const searchPaths = [
        process.cwd(),
        path.dirname(process.execPath),
    ];

    for (const dir of searchPaths) {
        const wasmPath = path.join(dir, "pglite.wasm");
        const dataPath = path.join(dir, "pglite.data");
        if (fs.existsSync(wasmPath) && fs.existsSync(dataPath)) {
            const wasmModule = new wasmModuleCtor(fs.readFileSync(wasmPath));
            const fsBundle = new Blob([fs.readFileSync(dataPath)]);
            return { wasmModule, fsBundle };
        }
    }
    return null;
}

export function createPGlite(dataDir: string): PGlite {
    const lock = acquirePGliteDirectoryLock(dataDir);
    const wasmOpts = findWasmFiles();
    let pg: PGlite;
    try {
        if (wasmOpts) {
            pg = new PGlite({ dataDir, ...wasmOpts });
        } else {
            pg = new PGlite(dataDir);
        }
    } catch (error) {
        lock.release();
        throw error;
    }
    pgliteLocks.set(pg, lock);
    return pg;
}

const pgliteLocks = new WeakMap<PGlite, PGliteDirectoryLock>();

export async function closePGlite(pg: PGlite | null | undefined): Promise<void> {
    if (!pg) {
        return;
    }
    const lock = pgliteLocks.get(pg);
    try {
        await pg.close();
    } finally {
        lock?.release();
        pgliteLocks.delete(pg);
    }
}
