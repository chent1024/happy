#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const packageName = process.env.HAPPY_ANDROID_PACKAGE || 'com.ex3ndr.happy';
const defaultApk = path.join(workspaceRoot, 'android/app/build/outputs/apk/release/app-release.apk');

function usage() {
  console.log(`Usage: node scripts/install-android-release.cjs [--apk <path>] [--skip-build]

Builds and installs the production Android release APK without opening Expo's
development-client URL.

Options:
  --apk <path>      Install this APK instead of the default release output.
  --skip-build      Install the existing APK without running Gradle.
  -h, --help        Show this help.
`);
}

function parseArgs(argv) {
  const args = { apk: null, skipBuild: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    } else if (arg === '--apk') {
      args.apk = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--skip-build') {
      args.skipBuild = true;
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return args;
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: { ...process.env, APP_ENV: 'production' },
    ...options,
  });
}

function read(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, APP_ENV: 'production' },
    ...options,
  }).trim();
}

function resolveDeviceSerial() {
  if (process.env.ANDROID_SERIAL) {
    return process.env.ANDROID_SERIAL;
  }

  const devices = read('adb', ['devices'])
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);

  if (devices.length === 0) {
    throw new Error('No Android device connected. Connect a device or start an emulator.');
  }
  if (devices.length > 1) {
    throw new Error(`Multiple Android devices connected: ${devices.join(', ')}. Set ANDROID_SERIAL.`);
  }
  return devices[0];
}

function adbArgs(serial, args) {
  return ['-s', serial, ...args];
}

function printInstalledPackage(serial) {
  const output = read('adb', adbArgs(serial, ['shell', 'dumpsys', 'package', packageName]));
  const versionName = output.match(/\bversionName=([^\s]+)/)?.[1] || 'unknown';
  const versionCode = output.match(/\bversionCode=(\d+)/)?.[1] || 'unknown';
  const lastUpdateTime = output.match(/\blastUpdateTime=([^\n]+)/)?.[1]?.trim() || 'unknown';

  console.log(`Installed package: ${packageName}`);
  console.log(`versionName=${versionName}`);
  console.log(`versionCode=${versionCode}`);
  console.log(`lastUpdateTime=${lastUpdateTime}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const apk = path.resolve(workspaceRoot, args.apk || defaultApk);

  if (!args.skipBuild) {
    run('node', ['scripts/prepare-native-build-number.cjs', 'android']);
    const gradle = path.join(workspaceRoot, 'android/gradlew');
    if (!fs.existsSync(gradle)) {
      throw new Error('Android native project is missing. Run Expo prebuild before installing release.');
    }
    run(gradle, [':app:assembleRelease'], { cwd: path.join(workspaceRoot, 'android') });
  }

  if (!fs.existsSync(apk)) {
    throw new Error(`Release APK not found: ${apk}`);
  }

  const serial = resolveDeviceSerial();
  console.log(`Installing release APK on ${serial}: ${apk}`);
  run('adb', adbArgs(serial, ['install', '-r', apk]));
  printInstalledPackage(serial);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
