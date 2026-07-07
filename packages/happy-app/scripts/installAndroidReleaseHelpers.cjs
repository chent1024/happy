function parseArgs(argv) {
  const args = { apk: null, skipBuild: false, help: false };
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
      args.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return args;
}

function parseAdbDevices(output) {
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);
}

function resolveDeviceSerialFromAdbOutput(output, envSerial = '') {
  if (envSerial) {
    return envSerial;
  }

  const devices = parseAdbDevices(output);
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

function parseInstalledPackageInfo(output) {
  return {
    versionName: output.match(/\bversionName=([^\s]+)/)?.[1] || 'unknown',
    versionCode: output.match(/\bversionCode=(\d+)/)?.[1] || 'unknown',
    lastUpdateTime: output.match(/\blastUpdateTime=([^\n]+)/)?.[1]?.trim() || 'unknown',
  };
}

module.exports = {
  adbArgs,
  parseAdbDevices,
  parseArgs,
  parseInstalledPackageInfo,
  resolveDeviceSerialFromAdbOutput,
};
