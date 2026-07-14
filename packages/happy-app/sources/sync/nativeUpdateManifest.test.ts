import { describe, expect, it } from 'vitest';
import {
    buildFallbackNativeUpdateApkUrl,
    buildNativeUpdateManifestUrl,
    isNativeUpdateManifestNewer,
    normalizeNativeUpdateManifest,
} from './nativeUpdateManifest';

describe('nativeUpdateManifest', () => {
    it('builds a Codex-style latest.json URL from a Happy server URL', () => {
        expect(buildNativeUpdateManifestUrl('https://device.tailnet.ts.net')).toBe('https://device.tailnet.ts.net:8766/latest.json');
        expect(buildNativeUpdateManifestUrl('https://device.tailnet.ts.net:3005')).toBe('https://device.tailnet.ts.net:8766/latest.json');
        expect(buildNativeUpdateManifestUrl('http://192.168.1.20:3005')).toBe('http://192.168.1.20:8766/latest.json');
    });

    it('keeps IPv6 hosts bracketed in the latest.json URL', () => {
        expect(buildNativeUpdateManifestUrl('http://[fd7a:115c:a1e0::1]:3005')).toBe('http://[fd7a:115c:a1e0::1]:8766/latest.json');
    });

    it('uses manifest apkUrl and falls back beside latest.json when missing', () => {
        const manifestUrl = 'http://device.tailnet.ts.net:8766/latest.json';

        expect(normalizeNativeUpdateManifest({
            version: '1.8.0',
            apkUrl: 'http://device.tailnet.ts.net:8766/happy-release.apk',
        }, manifestUrl)?.apkUrl).toBe('http://device.tailnet.ts.net:8766/happy-release.apk');

        expect(buildFallbackNativeUpdateApkUrl(manifestUrl)).toBe('http://device.tailnet.ts.net:8766/app-release.apk');
        expect(normalizeNativeUpdateManifest({ version: '1.8.0' }, manifestUrl)?.apkUrl).toBe('http://device.tailnet.ts.net:8766/app-release.apk');
    });

    it('rejects a manifest apkUrl that is not an APK', () => {
        expect(normalizeNativeUpdateManifest({
            version: '1.8.0',
            apkUrl: 'http://device.tailnet.ts.net:8766/latest.json',
        }, 'http://device.tailnet.ts.net:8766/latest.json')).toBeNull();
    });

    it('detects newer versions and same-version newer build dates', () => {
        expect(isNativeUpdateManifestNewer({ version: '1.8.0' }, '1.7.0')).toBe(true);
        expect(isNativeUpdateManifestNewer({ version: '1.6.9' }, '1.7.0')).toBe(false);
        expect(isNativeUpdateManifestNewer({
            version: '1.7.0',
            buildDate: '2026-06-30T12:00:00.000Z',
        }, '1.7.0', '2026-06-29T12:00:00.000Z')).toBe(true);
        expect(isNativeUpdateManifestNewer({
            version: '1.7.0',
            publishedAt: '2026-06-28T12:00:00.000Z',
        }, '1.7.0', '2026-06-29T12:00:00.000Z')).toBe(false);
    });

    it('uses build numbers before dates for the same display version', () => {
        expect(isNativeUpdateManifestNewer({
            version: '1.7.0',
            versionCode: 1783434607,
            buildDate: '2026-07-07T22:30:06+08:00',
        }, '1.7.0', '2026-07-01T00:00:00.000Z', '1783437685')).toBe(false);

        expect(isNativeUpdateManifestNewer({
            version: '1.7.0',
            versionCode: 1783437685,
            buildDate: '2026-07-07T22:30:06+08:00',
        }, '1.7.0', '2026-07-01T00:00:00.000Z', 1783437685)).toBe(false);

        expect(isNativeUpdateManifestNewer({
            version: '1.7.0',
            buildNumber: '1783439000',
            buildDate: '2026-07-07T22:30:06+08:00',
        }, '1.7.0', '2026-07-01T00:00:00.000Z', '1783437685')).toBe(true);
    });
});
