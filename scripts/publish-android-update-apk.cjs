#!/usr/bin/env node
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const appDir = path.join(rootDir, 'packages/happy-app');
const defaultApkRoot = path.join(appDir, 'android/app/build/outputs/apk');
const publishDir = process.env.HAPPY_ANDROID_UPDATE_DIR || '/tmp/happy-apk';
const publishName = process.env.HAPPY_ANDROID_UPDATE_APK_NAME || 'app-release.apk';
const manifestName = 'latest.json';
const port = Number(process.env.HAPPY_ANDROID_UPDATE_PORT || 8766);

function usage() {
    console.log(`Usage: node scripts/publish-android-update-apk.cjs [--apk <path>]

Publishes a local Android APK using the Codex-style latest.json update mode.

Options:
  --apk <path>      APK to publish. Defaults to latest APK under packages/happy-app/android/app/build/outputs/apk.
  -h, --help        Show this help.
`);
}

function parseArgs(argv) {
    const args = { apk: null };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--') {
            continue;
        } else if (arg === '--apk') {
            args.apk = argv[i + 1] || null;
            i += 1;
        } else if (arg === '-h' || arg === '--help') {
            usage();
            process.exit(0);
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }
    return args;
}

function walkFiles(directory, predicate, output = []) {
    if (!fs.existsSync(directory)) {
        return output;
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walkFiles(fullPath, predicate, output);
        } else if (predicate(fullPath)) {
            output.push(fullPath);
        }
    }
    return output;
}

function findLatestApk() {
    const apks = walkFiles(defaultApkRoot, (filePath) => filePath.endsWith('.apk'));
    apks.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
    return apks[0] || null;
}

function run(command, args, options = {}) {
    try {
        return execFileSync(command, args, {
            cwd: rootDir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            ...options,
        }).trim();
    } catch {
        return '';
    }
}

function resolveTailscaleIpv4() {
    const tailscaleIp = run('tailscale', ['ip', '-4']).split(/\s+/).find(Boolean);
    if (tailscaleIp) {
        return tailscaleIp;
    }

    const ifconfig = run('ifconfig', []);
    const match = ifconfig.match(/\b100\.\d+\.\d+\.\d+\b/);
    return match?.[0] || null;
}

function beijingIsoNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(new Date()).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function readAppVersion() {
    const appConfig = fs.readFileSync(path.join(appDir, 'app.config.js'), 'utf8');
    const match = appConfig.match(/\bversion:\s*["']([^"']+)["']/);
    if (!match) {
        throw new Error('Could not find expo.version in packages/happy-app/app.config.js');
    }
    return match[1];
}

function resolveBuildDate() {
    return process.env.HAPPY_ANDROID_UPDATE_BUILD_DATE
        || process.env.HAPPY_APP_BUILD_TIMESTAMP
        || beijingIsoNow();
}

function writeServerScript(serverScriptPath) {
    fs.writeFileSync(serverScriptPath, `import os
import re
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class UpdateRequestHandler(SimpleHTTPRequestHandler):
    range_re = re.compile(r"bytes=(\\d*)-(\\d*)$")

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.exists(path):
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None

        file_size = os.path.getsize(path)
        range_header = self.headers.get("Range", "").strip()
        range_match = self.range_re.match(range_header)
        if not range_match:
            file_handle = open(path, "rb")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-type", self.guess_type(path))
            self.send_header("Content-Length", str(file_size))
            self.send_header("Last-Modified", self.date_time_string(os.path.getmtime(path)))
            self.end_headers()
            return file_handle

        first_raw, last_raw = range_match.groups()
        if not first_raw and not last_raw:
            self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            return None

        if first_raw:
            start = int(first_raw)
            end = int(last_raw) if last_raw else file_size - 1
        else:
            suffix_length = int(last_raw)
            start = max(file_size - suffix_length, 0)
            end = file_size - 1

        if start >= file_size or end < start:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{file_size}")
            self.end_headers()
            return None

        end = min(end, file_size - 1)
        length = end - start + 1
        file_handle = open(path, "rb")
        file_handle.seek(start)
        file_handle.range = (start, end, length)
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Length", str(length))
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Last-Modified", self.date_time_string(os.path.getmtime(path)))
        self.end_headers()
        return file_handle

    def copyfile(self, source, outputfile):
        range_info = getattr(source, "range", None)
        if not range_info:
            return super().copyfile(source, outputfile)
        _, _, remaining = range_info
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", ${port}), UpdateRequestHandler).serve_forever()
`);
}

function stopExistingServer() {
    const pids = run('lsof', ['-ti', `tcp:${port}`]).split(/\s+/).filter(Boolean);
    for (const pid of pids) {
        try {
            process.kill(Number(pid), 'SIGTERM');
        } catch {
            // Ignore stale PIDs.
        }
    }
}

function startServer(serverScriptPath) {
    const out = fs.openSync(path.join(publishDir, 'server.log'), 'a');
    const err = fs.openSync(path.join(publishDir, 'server.err.log'), 'a');
    const child = spawn('python3', [serverScriptPath], {
        cwd: publishDir,
        detached: true,
        stdio: ['ignore', out, err],
    });
    child.unref();
}

function waitForUrl(url) {
    return new Promise((resolve) => {
        let attempts = 0;
        const attempt = () => {
            attempts += 1;
            const request = http.get(url, { timeout: 2000 }, (response) => {
                response.resume();
                if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
                    resolve(true);
                    return;
                }
                if (attempts >= 15) {
                    resolve(false);
                    return;
                }
                setTimeout(attempt, 300);
            });
            request.on('timeout', () => {
                request.destroy();
            });
            request.on('error', () => {
                if (attempts >= 15) {
                    resolve(false);
                    return;
                }
                setTimeout(attempt, 300);
            });
        };
        attempt();
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const sourceApk = path.resolve(rootDir, args.apk || findLatestApk() || '');
    if (!sourceApk || !fs.existsSync(sourceApk)) {
        throw new Error(`APK not found. Build release APK first or pass --apk <path>. Looked under ${defaultApkRoot}`);
    }

    const tailscaleIp = resolveTailscaleIpv4();
    if (!tailscaleIp) {
        throw new Error('Tailscale IPv4 not found. The mobile app expects the update host to match your Happy server host.');
    }
    if (!run('python3', ['--version'])) {
        throw new Error('python3 is required to serve Android update files.');
    }

    fs.mkdirSync(publishDir, { recursive: true });
    const targetApk = path.join(publishDir, publishName);
    fs.copyFileSync(sourceApk, targetApk);

    const baseUrl = `http://${tailscaleIp}:${port}`;
    const manifest = {
        version: readAppVersion(),
        displayVersion: readAppVersion(),
        buildDate: resolveBuildDate(),
        publishedAt: beijingIsoNow(),
        apkUrl: `${baseUrl}/${publishName}`,
        size: fs.statSync(targetApk).size,
    };
    fs.writeFileSync(path.join(publishDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);

    const serverScriptPath = path.join(publishDir, 'update_server.py');
    writeServerScript(serverScriptPath);
    stopExistingServer();
    startServer(serverScriptPath);

    const manifestUrl = `${baseUrl}/${manifestName}`;
    const apkUrl = `${baseUrl}/${publishName}`;
    if (!await waitForUrl(manifestUrl)) {
        throw new Error(`Android update server failed to start on ${manifestUrl}. Check ${publishDir}/server.err.log`);
    }

    console.log(`Android update manifest: ${manifestUrl}`);
    console.log(`Android update URL: ${apkUrl}`);
    console.log(`Published APK: ${targetApk}`);
}

main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
});
