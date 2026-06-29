#!/usr/bin/env node

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const STATE_DIR = path.join(os.homedir(), ".happy", "dev-tailscale");
const PID_FILE = path.join(STATE_DIR, "metro.pid");
const LOG_FILE = path.join(STATE_DIR, "metro.log");

const DEFAULT_SERVER_PORT = 3005;
const DEFAULT_METRO_PORT = 8081;
const DEFAULT_METRO_HTTPS_PORT = 8443;
const CONFLICTING_METRO_LAUNCHD_LABELS = ["com.slopus.happy-app-metro"];

function usage() {
  console.log(`Usage:
  pnpm dev:tailscale status
  pnpm dev:tailscale setup [--dry-run] [--reset-serve] [--restart-metro]
  pnpm dev:tailscale stop [--reset-serve]
  pnpm dev:tailscale urls

Options:
  --server-port <port>       Local Happy server port. Default: ${DEFAULT_SERVER_PORT}
  --metro-port <port>        Local Metro port. Default: ${DEFAULT_METRO_PORT}
  --metro-https-port <port>  Tailnet HTTPS port for Metro. Default: ${DEFAULT_METRO_HTTPS_PORT}
  --dry-run                  Print actions without changing processes or Tailscale.
  --reset-serve              Reset Tailscale Serve before setup, or during stop.
  --restart-metro            Stop script-managed Metro before starting it again.

Remote dev topology:
  https://<tailnet-host>                  -> http://127.0.0.1:${DEFAULT_SERVER_PORT}
  https://<tailnet-host>:${DEFAULT_METRO_HTTPS_PORT}             -> http://127.0.0.1:${DEFAULT_METRO_PORT}
  exp+happy://expo-development-client/?url=<encoded HTTPS Metro URL>`);
}

function parseArgs(argv) {
  const opts = {
    command: argv[0] || "status",
    dryRun: false,
    resetServe: false,
    restartMetro: false,
    serverPort: DEFAULT_SERVER_PORT,
    metroPort: DEFAULT_METRO_PORT,
    metroHttpsPort: DEFAULT_METRO_HTTPS_PORT,
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--reset-serve") {
      opts.resetServe = true;
    } else if (arg === "--restart-metro") {
      opts.restartMetro = true;
    } else if (arg === "--server-port") {
      opts.serverPort = readPort(argv[++i], arg);
    } else if (arg === "--metro-port") {
      opts.metroPort = readPort(argv[++i], arg);
    } else if (arg === "--metro-https-port") {
      opts.metroHttpsPort = readPort(argv[++i], arg);
    } else if (arg === "--help" || arg === "-h") {
      opts.command = "help";
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function readPort(raw, flag) {
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${flag} requires a TCP port number`);
  }
  return port;
}

function run(command, args, opts = {}) {
  if (opts.dryRun) {
    console.log(`$ ${[command, ...args].join(" ")}`);
    return "";
  }
  return execFileSync(command, args, {
    cwd: opts.cwd || REPO_ROOT,
    encoding: "utf8",
    stdio: opts.stdio || ["ignore", "pipe", "pipe"],
    env: opts.env || process.env,
  });
}

function runBestEffort(command, args, opts = {}) {
  try {
    return run(command, args, opts);
  } catch (error) {
    if (!opts.quiet) {
      const rendered = [command, ...args].join(" ");
      console.warn(`Warning: ${rendered} failed; continuing`);
    }
    return "";
  }
}

function commandExists(command) {
  try {
    execFileSync("command", ["-v", command], { shell: true, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getTailnetHost() {
  const output = run("tailscale", ["status", "--self", "--json"]);
  const status = JSON.parse(output);
  const dnsName = status?.Self?.DNSName;
  if (!dnsName) throw new Error("Tailscale did not return a self DNS name");
  return dnsName.replace(/\.$/, "");
}

function getServeStatus() {
  try {
    return JSON.parse(run("tailscale", ["serve", "status", "--json"]));
  } catch {
    return null;
  }
}

function getProcessTable() {
  const table = new Map();
  let output = "";
  try {
    output = execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" });
  } catch {
    return table;
  }

  for (const line of output.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    table.set(pid, { pid, ppid, command: match[3] });
  }
  return table;
}

function getDescendantPids(rootPid, processTable = getProcessTable()) {
  const descendants = new Set();
  const queue = [rootPid];
  while (queue.length > 0) {
    const parentPid = queue.shift();
    for (const processInfo of processTable.values()) {
      if (processInfo.ppid === parentPid && !descendants.has(processInfo.pid)) {
        descendants.add(processInfo.pid);
        queue.push(processInfo.pid);
      }
    }
  }
  return descendants;
}

function parseLsofFieldOutput(output) {
  const records = [];
  let current = null;
  for (const line of output.split("\n")) {
    if (!line) continue;
    const type = line[0];
    const value = line.slice(1);
    if (type === "p") {
      if (current) records.push(current);
      current = { pid: Number(value), command: "", protocol: "", name: "" };
    } else if (current && type === "c") {
      current.command = value;
    } else if (current && type === "t") {
      current.protocol = value;
    } else if (current && type === "n") {
      current.name = value;
    }
  }
  if (current) records.push(current);
  return records.filter(record => Number.isInteger(record.pid));
}

function getPortListeners(port) {
  try {
    const output = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpctn"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const processTable = getProcessTable();
    return parseLsofFieldOutput(output).map(listener => ({
      ...listener,
      fullCommand: processTable.get(listener.pid)?.command || listener.command,
    }));
  } catch {
    return [];
  }
}

function getLaunchdLabelInfo(label) {
  if (process.platform !== "darwin") return null;
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid === null) return null;

  try {
    const output = execFileSync("launchctl", ["print", `gui/${uid}/${label}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const state = output.match(/^\s*state = (.+)$/m)?.[1]?.trim() || "loaded";
    const pid = Number(output.match(/^\s*pid = (\d+)$/m)?.[1]);
    const path = output.match(/^\s*path = (.+)$/m)?.[1]?.trim() || null;
    const program = output.match(/^\s*program = (.+)$/m)?.[1]?.trim() || null;
    return {
      label,
      domain: `gui/${uid}/${label}`,
      state,
      pid: Number.isInteger(pid) ? pid : null,
      path,
      program,
      loaded: true,
    };
  } catch {
    return null;
  }
}

function getConflictingMetroLaunchdServices() {
  return CONFLICTING_METRO_LAUNCHD_LABELS
    .map(getLaunchdLabelInfo)
    .filter(Boolean);
}

function commandHasPort(command, port) {
  const escapedPort = String(port).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`--port(?:=|\\s+)${escapedPort}(?:\\s|$)`).test(command);
}

function isHappyAppMetroCommand(command, port) {
  return (
    command.includes("expo start") &&
    commandHasPort(command, port) &&
    (
      command.includes("--filter happy-app") ||
      command.includes("packages/happy-app") ||
      command.includes(path.join("packages", "happy-app")) ||
      command.includes(REPO_ROOT)
    )
  );
}

function getManagedMetroPids(managedPid, processTable = getProcessTable()) {
  if (!managedPid || !isProcessAlive(managedPid)) return new Set();
  return new Set([managedPid, ...getDescendantPids(managedPid, processTable)]);
}

function classifyPortListeners(port, managedPid = readManagedMetroPid()) {
  const processTable = getProcessTable();
  const managedPids = getManagedMetroPids(managedPid, processTable);
  return getPortListeners(port).map(listener => {
    const fullCommand = processTable.get(listener.pid)?.command || listener.fullCommand || listener.command;
    const managed = managedPids.has(listener.pid);
    const happyMetro = isHappyAppMetroCommand(fullCommand, port);
    const hostMode = fullCommand.includes("--host lan")
      ? "lan"
      : fullCommand.includes("--host localhost") || fullCommand.includes("--localhost")
        ? "localhost"
        : "unknown";
    return {
      ...listener,
      fullCommand,
      managed,
      happyMetro,
      hostMode,
      issue: managed ? null : happyMetro ? "unmanaged-happy-metro" : "unknown-listener",
    };
  });
}

function findUnmanagedHappyMetroRoots(port, managedPid = readManagedMetroPid()) {
  const processTable = getProcessTable();
  const managedPids = getManagedMetroPids(managedPid, processTable);
  const matchingPids = new Set();

  for (const processInfo of processTable.values()) {
    if (managedPids.has(processInfo.pid)) continue;
    if (isHappyAppMetroCommand(processInfo.command, port)) {
      matchingPids.add(processInfo.pid);
    }
  }

  return [...matchingPids]
    .filter(pid => !matchingPids.has(processTable.get(pid)?.ppid))
    .sort((a, b) => a - b);
}

function stopUnmanagedHappyMetro(port, { dryRun = false, managedPid = readManagedMetroPid() } = {}) {
  const roots = findUnmanagedHappyMetroRoots(port, managedPid);
  if (roots.length === 0) return 0;

  const processTable = getProcessTable();
  const pidsToStop = new Set();
  for (const rootPid of roots) {
    pidsToStop.add(rootPid);
    for (const pid of getDescendantPids(rootPid, processTable)) {
      pidsToStop.add(pid);
    }
  }

  const sortedPids = [...pidsToStop].sort((a, b) => b - a);
  console.log(`Stopping unmanaged Happy Metro process(es) on port ${port}: ${sortedPids.join(", ")}`);
  if (dryRun) return sortedPids.length;

  for (const rootPid of roots) {
    try {
      process.kill(-rootPid, "SIGTERM");
    } catch {}
  }
  for (const pid of sortedPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  return sortedPids.length;
}

function stopConflictingMetroLaunchd({ dryRun = false } = {}) {
  const services = getConflictingMetroLaunchdServices();
  if (services.length === 0) return 0;

  for (const service of services) {
    const suffix = service.pid ? ` (PID ${service.pid})` : "";
    console.log(`Stopping conflicting LaunchAgent ${service.label}${suffix}`);
    if (dryRun) continue;

    try {
      execFileSync("launchctl", ["bootout", service.domain], { stdio: "ignore" });
    } catch {
      if (service.path) {
        try {
          execFileSync("launchctl", ["unload", service.path], { stdio: "ignore" });
        } catch {}
      }
    }
  }

  return services.length;
}

function analyzeServeStatus(status, tailnetHost, opts) {
  const expected = new Map([
    [`${tailnetHost}:443`, `http://127.0.0.1:${opts.serverPort}`],
    [`${tailnetHost}:${opts.metroHttpsPort}`, `http://127.0.0.1:${opts.metroPort}`],
  ]);
  const web = status?.Web || {};
  const findings = [];

  for (const [source, expectedProxy] of expected) {
    const actualProxy = web[source]?.Handlers?.["/"]?.Proxy;
    if (actualProxy === expectedProxy) {
      findings.push({ level: "ok", message: `${source} -> ${expectedProxy}` });
    } else if (actualProxy) {
      findings.push({ level: "warn", message: `${source} -> ${actualProxy}; expected ${expectedProxy}` });
    } else {
      findings.push({ level: "warn", message: `${source} missing; expected ${expectedProxy}` });
    }
  }

  for (const [source, config] of Object.entries(web)) {
    if (expected.has(source)) continue;
    const proxy = config?.Handlers?.["/"]?.Proxy;
    findings.push({
      level: "warn",
      message: `${source}${proxy ? ` -> ${proxy}` : ""} is outside the standard Happy remote-dev topology`,
    });
  }

  return findings;
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readManagedMetroPid() {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf8").trim();
    const pid = Number(raw);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function canBind(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

async function isLocalPortListening(host, port) {
  return !(await canBind(host, port));
}

async function httpOk(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(label, fn, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function stopManagedMetro({ dryRun = false } = {}) {
  const pid = readManagedMetroPid();
  if (!pid) {
    console.log("Metro: no script-managed PID file");
    return;
  }
  if (!isProcessAlive(pid)) {
    console.log(`Metro: managed PID ${pid} is not running`);
    if (!dryRun) fs.rmSync(PID_FILE, { force: true });
    return;
  }

  console.log(`Stopping script-managed Metro PID ${pid}`);
  if (!dryRun) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
    fs.rmSync(PID_FILE, { force: true });
  }
}

function printLogTail(filePath, lines = 40) {
  try {
    const content = fs.readFileSync(filePath, "utf8").trimEnd();
    if (!content) return;
    console.error(`Last ${lines} Metro log line(s):`);
    console.error(content.split("\n").slice(-lines).join("\n"));
  } catch {}
}

async function startMetro(opts, tailnetHost) {
  const existingPid = readManagedMetroPid();
  if (existingPid && isProcessAlive(existingPid)) {
    if (!opts.restartMetro) {
      const listeners = classifyPortListeners(opts.metroPort, existingPid);
      const unsafeListeners = listeners.filter(listener => listener.issue);
      if (unsafeListeners.length === 0) {
        console.log(`Metro: script-managed process already running (PID ${existingPid})`);
        return;
      }
      throw new Error(
        `Metro port ${opts.metroPort} also has unmanaged listener(s). ` +
        "Run `pnpm dev:tailscale setup --restart-metro` to clean Happy Metro leftovers.",
      );
    }
    stopManagedMetro({ dryRun: opts.dryRun });
    stopConflictingMetroLaunchd({ dryRun: opts.dryRun });
    stopUnmanagedHappyMetro(opts.metroPort, { dryRun: opts.dryRun, managedPid: existingPid });
  } else if (opts.restartMetro) {
    stopConflictingMetroLaunchd({ dryRun: opts.dryRun });
    stopUnmanagedHappyMetro(opts.metroPort, { dryRun: opts.dryRun, managedPid: existingPid });
  }

  if (!opts.dryRun) {
    const existingListeners = classifyPortListeners(opts.metroPort);
    if (existingListeners.length > 0) {
      const unmanagedHappyMetro = existingListeners.filter(listener => listener.issue === "unmanaged-happy-metro");
      const unknownListeners = existingListeners.filter(listener => listener.issue === "unknown-listener");
      if (unmanagedHappyMetro.length > 0) {
        throw new Error(
          `Metro port ${opts.metroPort} is already used by unmanaged Happy Metro process(es): ` +
          unmanagedHappyMetro.map(listener => listener.pid).join(", ") +
          ". Run `pnpm dev:tailscale setup --restart-metro`.",
        );
      }
      if (unknownListeners.length > 0) {
        throw new Error(
          `Metro port ${opts.metroPort} is already used by non-Happy process(es): ` +
          unknownListeners.map(listener => `${listener.pid} ${listener.name}`).join(", "),
        );
      }
    }
  }

  const serverUrl = `https://${tailnetHost}`;
  const metroUrl = `https://${tailnetHost}:${opts.metroHttpsPort}`;
  const env = {
    ...process.env,
    APP_ENV: "development",
    EXPO_NO_TELEMETRY: "1",
    EXPO_PACKAGER_PROXY_URL: metroUrl,
    EXPO_PUBLIC_HAPPY_SERVER_URL: serverUrl,
    EXPO_PUBLIC_SERVER_URL: serverUrl,
  };
  const args = [
    "pnpm",
    "--filter",
    "happy-app",
    "exec",
    "expo",
    "start",
    "--dev-client",
    "--host",
    "localhost",
    "--port",
    String(opts.metroPort),
    "--clear",
  ];

  if (opts.dryRun) {
    console.log(`$ corepack ${args.join(" ")}`);
    console.log(`  env EXPO_PACKAGER_PROXY_URL=${metroUrl}`);
    console.log(`  env EXPO_PUBLIC_HAPPY_SERVER_URL=${serverUrl}`);
    console.log(`  env EXPO_PUBLIC_SERVER_URL=${serverUrl}`);
    return;
  }

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, "a");
  const child = spawn("corepack", args, {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", logFd, logFd],
    detached: true,
  });
  child.unref();
  fs.closeSync(logFd);
  fs.writeFileSync(PID_FILE, String(child.pid));

  try {
    await waitFor(
      `Metro on 127.0.0.1:${opts.metroPort}`,
      () => isLocalPortListening("127.0.0.1", opts.metroPort),
    );
  } catch (error) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {}
    }
    fs.rmSync(PID_FILE, { force: true });
    printLogTail(LOG_FILE);
    throw error;
  }
  console.log(`Metro: started on 127.0.0.1:${opts.metroPort} (PID ${child.pid})`);
  console.log(`Metro log: ${LOG_FILE}`);
}

function setupServe(opts) {
  if (opts.resetServe) {
    run("tailscale", ["serve", "reset"], { dryRun: opts.dryRun, stdio: "inherit" });
  }

  run("tailscale", ["serve", "--bg", "--https=443", String(opts.serverPort)], {
    dryRun: opts.dryRun,
    stdio: "inherit",
  });
  runBestEffort("tailscale", ["serve", `--http=${opts.metroPort}`, "off"], {
    dryRun: opts.dryRun,
    stdio: "ignore",
    quiet: true,
  });
  run("tailscale", ["serve", "--bg", `--https=${opts.metroHttpsPort}`, String(opts.metroPort)], {
    dryRun: opts.dryRun,
    stdio: "inherit",
  });
}

async function commandSetup(opts) {
  ensureTools();
  const tailnetHost = getTailnetHost();
  const serverUrl = `https://${tailnetHost}`;
  const metroHttpsUrl = `https://${tailnetHost}:${opts.metroHttpsPort}`;

  const serverHealthy = await httpOk(`http://127.0.0.1:${opts.serverPort}/`);
  if (!serverHealthy) {
    console.warn(`Warning: local Happy server is not healthy at http://127.0.0.1:${opts.serverPort}/`);
    console.warn("Start it first, for example: happy services start server");
  }

  setupServe(opts);
  await startMetro(opts, tailnetHost);
  printUrls({ tailnetHost, serverUrl, metroHttpsUrl });
}

async function commandStatus(opts) {
  ensureTools();
  const tailnetHost = getTailnetHost();
  const serverUrl = `https://${tailnetHost}`;
  const metroHttpsUrl = `https://${tailnetHost}:${opts.metroHttpsPort}`;
  const serveStatus = getServeStatus();
  const managedPid = readManagedMetroPid();
  const metroListeners = classifyPortListeners(opts.metroPort, managedPid);
  const conflictingLaunchdServices = getConflictingMetroLaunchdServices();
  const serveFindings = analyzeServeStatus(serveStatus, tailnetHost, opts);

  console.log("Happy remote dev status");
  console.log("");
  console.log(`Tailnet host: ${tailnetHost}`);
  console.log(`Happy API:    ${serverUrl} -> http://127.0.0.1:${opts.serverPort}`);
  console.log(`Metro HTTPS:  ${metroHttpsUrl} -> http://127.0.0.1:${opts.metroPort}`);
  console.log("");
  console.log(`Local Happy server: ${(await httpOk(`http://127.0.0.1:${opts.serverPort}/`)) ? "ok" : "not healthy"}`);
  console.log(`Local Metro port:   ${metroListeners.length > 0 ? "listening" : "not listening"}`);
  console.log(`Managed Metro PID:  ${managedPid && isProcessAlive(managedPid) ? managedPid : "none"}`);
  console.log("");
  console.log("Metro listeners:");
  if (metroListeners.length === 0) {
    console.log("  - none");
  } else {
    for (const listener of metroListeners) {
      const mark = listener.issue ? "!" : "✓";
      const owner = listener.managed ? "managed" : listener.happyMetro ? "unmanaged Happy Metro" : "unknown";
      console.log(`  ${mark} PID ${listener.pid} ${listener.name} (${owner}, host=${listener.hostMode})`);
      if (listener.issue) {
        console.log(`    ${listener.fullCommand}`);
      }
    }
  }
  console.log("");
  console.log("Conflicting LaunchAgents:");
  if (conflictingLaunchdServices.length === 0) {
    console.log("  - none");
  } else {
    for (const service of conflictingLaunchdServices) {
      const suffix = service.pid ? ` PID ${service.pid}` : "";
      console.log(`  ! ${service.label} (${service.state}${suffix})`);
      if (service.program) console.log(`    ${service.program}`);
    }
  }
  console.log("");
  console.log("Tailscale Serve:");
  console.log(JSON.stringify(serveStatus, null, 2));
  console.log("");
  console.log("Serve diagnostics:");
  for (const finding of serveFindings) {
    const mark = finding.level === "ok" ? "✓" : "!";
    console.log(`  ${mark} ${finding.message}`);
  }
  console.log("");
  if (serveFindings.some(f => f.level === "warn")) {
    console.log("Run `pnpm dev:tailscale setup --reset-serve` to replace stale Serve mappings.");
    console.log("");
  }
  if (metroListeners.some(listener => listener.issue) || conflictingLaunchdServices.length > 0) {
    console.log("Run `pnpm dev:tailscale setup --restart-metro` to clean unmanaged Happy Metro leftovers.");
    console.log("");
  }
  printUrls({ tailnetHost, serverUrl, metroHttpsUrl });
}

function commandStop(opts) {
  stopManagedMetro({ dryRun: opts.dryRun });
  stopConflictingMetroLaunchd({ dryRun: opts.dryRun });
  stopUnmanagedHappyMetro(opts.metroPort, { dryRun: opts.dryRun });
  if (opts.resetServe) {
    run("tailscale", ["serve", "reset"], { dryRun: opts.dryRun, stdio: "inherit" });
  }
}

function commandUrls(opts) {
  ensureTools();
  const tailnetHost = getTailnetHost();
  printUrls({
    tailnetHost,
    serverUrl: `https://${tailnetHost}`,
    metroHttpsUrl: `https://${tailnetHost}:${opts.metroHttpsPort}`,
  });
}

function printUrls({ tailnetHost, serverUrl, metroHttpsUrl }) {
  const encodedMetroUrl = encodeURIComponent(metroHttpsUrl);
  console.log("Remote dev URLs");
  console.log(`  Happy server URL: ${serverUrl}`);
  console.log(`  Metro HTTPS URL:  ${metroHttpsUrl}`);
  console.log(`  Dev client URL:   exp+happy://expo-development-client/?url=${encodedMetroUrl}`);
  console.log("");
  console.log("Metro injects:");
  console.log(`  EXPO_PACKAGER_PROXY_URL=${metroHttpsUrl}`);
  console.log(`  EXPO_PUBLIC_HAPPY_SERVER_URL=${serverUrl}`);
  console.log(`  EXPO_PUBLIC_SERVER_URL=${serverUrl}`);
  console.log("");
  console.log("Use the Dev client URL on Android and iOS development builds.");
  console.log(`Host: ${tailnetHost}`);
}

function ensureTools() {
  if (!commandExists("tailscale")) {
    throw new Error("Missing tailscale CLI");
  }
  if (!commandExists("corepack")) {
    throw new Error("Missing corepack");
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  switch (opts.command) {
    case "help":
      usage();
      return;
    case "setup":
      await commandSetup(opts);
      return;
    case "status":
      await commandStatus(opts);
      return;
    case "stop":
      commandStop(opts);
      return;
    case "urls":
      commandUrls(opts);
      return;
    default:
      throw new Error(`Unknown command: ${opts.command}`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
