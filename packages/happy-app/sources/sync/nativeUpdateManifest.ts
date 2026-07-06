export const ANDROID_UPDATE_PORT = 8766;
const FALLBACK_APK_NAME = 'app-release.apk';

export type NativeUpdateManifest = {
    version?: string;
    displayVersion?: string;
    buildDate?: string;
    publishedAt?: string;
    apkUrl?: string;
    size?: number;
};

export type NormalizedNativeUpdateManifest = NativeUpdateManifest & {
    apkUrl: string;
};

function bracketHostIfNeeded(hostname: string): string {
    if (hostname.includes(':') && !hostname.startsWith('[')) {
        return `[${hostname}]`;
    }
    return hostname;
}

export function resolveNativeUpdateHost(serverUrlOrHost: string): string | null {
    const value = serverUrlOrHost.trim();
    if (!value) {
        return null;
    }

    try {
        return bracketHostIfNeeded(new URL(value).hostname);
    } catch {
        const match = value.match(/^(?:https?:\/\/)?(\[[^\]]+\]|[^/:?#]+)(?::\d+)?(?:[/?#].*)?$/i);
        if (!match?.[1]) {
            return null;
        }
        return bracketHostIfNeeded(match[1].replace(/^\[|\]$/g, ''));
    }
}

export function buildNativeUpdateManifestUrl(serverUrlOrHost: string): string | null {
    const host = resolveNativeUpdateHost(serverUrlOrHost);
    if (!host) {
        return null;
    }
    return `http://${host}:${ANDROID_UPDATE_PORT}/latest.json`;
}

export function buildFallbackNativeUpdateApkUrl(manifestUrl: string): string {
    return manifestUrl.replace(/\/latest\.json(?:[?#].*)?$/i, `/${FALLBACK_APK_NAME}`);
}

function isApkUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
            && parsed.pathname.toLowerCase().endsWith('.apk');
    } catch {
        return false;
    }
}

export function normalizeNativeUpdateManifest(
    manifest: NativeUpdateManifest,
    manifestUrl: string,
): NormalizedNativeUpdateManifest | null {
    const apkUrl = manifest.apkUrl || buildFallbackNativeUpdateApkUrl(manifestUrl);
    if (!isApkUrl(apkUrl)) {
        return null;
    }

    return {
        ...manifest,
        apkUrl,
    };
}

function versionParts(version: string): number[] {
    return version
        .split(/[.-]/)
        .map((part) => Number.parseInt(part, 10))
        .filter((part) => Number.isFinite(part));
}

function compareVersions(left: string, right: string): number {
    const leftParts = versionParts(left);
    const rightParts = versionParts(right);
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let i = 0; i < maxLength; i += 1) {
        const leftPart = leftParts[i] ?? 0;
        const rightPart = rightParts[i] ?? 0;
        if (leftPart > rightPart) {
            return 1;
        }
        if (leftPart < rightPart) {
            return -1;
        }
    }

    return 0;
}

function compareDates(left?: string, right?: string): number {
    if (!left || !right) {
        return 0;
    }

    const leftTime = Date.parse(left);
    const rightTime = Date.parse(right);
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
        return 0;
    }

    return leftTime === rightTime ? 0 : (leftTime > rightTime ? 1 : -1);
}

export function isNativeUpdateManifestNewer(
    manifest: NativeUpdateManifest,
    currentVersion: string,
    currentBuildDate?: string,
): boolean {
    if (manifest.version) {
        const versionComparison = compareVersions(manifest.version, currentVersion);
        if (versionComparison > 0) {
            return true;
        }
        if (versionComparison < 0) {
            return false;
        }
    }

    return compareDates(manifest.buildDate || manifest.publishedAt, currentBuildDate) > 0;
}
