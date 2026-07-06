import { PrismaClient } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { closePGlite, createPGlite } from "./pgliteLoader";

let pgliteInstance: PGlite | null = null;

function createClient(): PrismaClient {
    const provider = process.env.DB_PROVIDER || "postgres";

    if (provider === "pglite") {
        const pgliteDir = process.env.PGLITE_DIR || "./data/pglite";
        pgliteInstance = createPGlite(pgliteDir);
        const adapter = new PrismaPGlite(pgliteInstance);
        return new PrismaClient({ adapter } as any);
    }

    return new PrismaClient();
}

export const db = createClient();

export function getPGlite(): PGlite | null {
    return pgliteInstance;
}

export async function closeDbStorage(): Promise<void> {
    await closePGlite(pgliteInstance);
    pgliteInstance = null;
}
