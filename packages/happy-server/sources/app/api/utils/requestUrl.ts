export function normalizeLeadingSlashes(url: string | undefined): string | undefined {
    if (!url?.startsWith("//")) return url;
    return url.replace(/^\/+/, "/");
}
