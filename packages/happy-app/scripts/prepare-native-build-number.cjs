#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const MAX_ANDROID_VERSION_CODE = 2100000000;

function loadNativeBuildNumber() {
  const rawBuildNumber =
    process.env.HAPPY_NATIVE_BUILD_NUMBER ||
    process.env.HAPPY_ANDROID_VERSION_CODE ||
    process.env.EAS_BUILD_VERSION_CODE ||
    process.env.HAPPY_BUILD_NUMBER;

  if (rawBuildNumber && /^\d+$/.test(rawBuildNumber)) {
    return Number(rawBuildNumber);
  }

  return Math.floor(Date.now() / 1000);
}

function updateFile(filePath, updater) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const updated = updater(original);
  if (updated === original) {
    return true;
  }

  fs.writeFileSync(filePath, updated);
  return true;
}

function prepareAndroid(buildNumber) {
  const versionCode = Math.min(buildNumber, MAX_ANDROID_VERSION_CODE);
  const buildGradlePath = path.join(workspaceRoot, "android/app/build.gradle");
  const updated = updateFile(buildGradlePath, (contents) => {
    if (!/versionCode\s+\S+/.test(contents)) {
      throw new Error(`Could not find versionCode in ${buildGradlePath}`);
    }
    return contents.replace(/versionCode\s+\S+/, `versionCode ${versionCode}`);
  });

  if (updated) {
    console.log(`Android versionCode=${versionCode}`);
  }
}

function prepareIos(buildNumber) {
  const iosDir = path.join(workspaceRoot, "ios");
  if (!fs.existsSync(iosDir)) {
    return;
  }

  const projectFiles = fs
    .readdirSync(iosDir)
    .filter((name) => name.endsWith(".xcodeproj"))
    .map((name) => path.join(iosDir, name, "project.pbxproj"));

  for (const projectFile of projectFiles) {
    updateFile(projectFile, (contents) => {
      if (!/CURRENT_PROJECT_VERSION = [^;]+;/.test(contents)) {
        throw new Error(`Could not find CURRENT_PROJECT_VERSION in ${projectFile}`);
      }
      return contents.replace(
        /CURRENT_PROJECT_VERSION = [^;]+;/g,
        `CURRENT_PROJECT_VERSION = ${buildNumber};`
      );
    });
  }

  if (projectFiles.length > 0) {
    console.log(`iOS buildNumber=${buildNumber}`);
  }
}

const target = process.argv[2] || "all";
const nativeBuildNumber = loadNativeBuildNumber();

if (target === "all" || target === "android") {
  prepareAndroid(nativeBuildNumber);
}
if (target === "all" || target === "ios") {
  prepareIos(nativeBuildNumber);
}
