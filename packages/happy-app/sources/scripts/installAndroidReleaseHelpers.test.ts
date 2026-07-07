import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    adbArgs,
    parseAdbDevices,
    parseArgs,
    parseInstalledPackageInfo,
    resolveDeviceSerialFromAdbOutput,
} = require('../../scripts/installAndroidReleaseHelpers.cjs') as {
    adbArgs: (serial: string, args: string[]) => string[];
    parseAdbDevices: (output: string) => string[];
    parseArgs: (argv: string[]) => { apk: string | null; skipBuild: boolean; help: boolean };
    parseInstalledPackageInfo: (output: string) => {
        versionName: string;
        versionCode: string;
        lastUpdateTime: string;
    };
    resolveDeviceSerialFromAdbOutput: (output: string, envSerial?: string) => string;
};

describe('installAndroidReleaseHelpers', () => {
    it('parses pnpm forwarded release install args', () => {
        expect(parseArgs(['--', '--apk', 'dist/app.apk', '--skip-build'])).toEqual({
            apk: 'dist/app.apk',
            skipBuild: true,
            help: false,
        });
        expect(parseArgs(['--help'])).toEqual({
            apk: null,
            skipBuild: false,
            help: true,
        });
        expect(() => parseArgs(['--unknown'])).toThrow('Unknown option: --unknown');
    });

    it('selects exactly one connected adb device unless ANDROID_SERIAL is set', () => {
        const output = [
            'List of devices attached',
            '152329c9\tdevice',
            'emulator-5554\toffline',
            '',
        ].join('\n');

        expect(parseAdbDevices(output)).toEqual(['152329c9']);
        expect(resolveDeviceSerialFromAdbOutput(output)).toBe('152329c9');
        expect(resolveDeviceSerialFromAdbOutput(output, 'manual-device')).toBe('manual-device');
    });

    it('rejects missing or ambiguous adb devices', () => {
        expect(() => resolveDeviceSerialFromAdbOutput('List of devices attached\n'))
            .toThrow('No Android device connected');
        expect(() => resolveDeviceSerialFromAdbOutput([
            'List of devices attached',
            'device-a\tdevice',
            'device-b\tdevice',
            '',
        ].join('\n'))).toThrow('Multiple Android devices connected: device-a, device-b');
    });

    it('builds scoped adb args and parses installed package info', () => {
        expect(adbArgs('152329c9', ['install', '-r', 'app-release.apk']))
            .toEqual(['-s', '152329c9', 'install', '-r', 'app-release.apk']);
        expect(parseInstalledPackageInfo([
            'Packages:',
            '  versionCode=1783440506 minSdk=23 targetSdk=35',
            '  versionName=1.7.0',
            '  lastUpdateTime=2026-07-08 00:09:28',
        ].join('\n'))).toEqual({
            versionName: '1.7.0',
            versionCode: '1783440506',
            lastUpdateTime: '2026-07-08 00:09:28',
        });
    });
});
