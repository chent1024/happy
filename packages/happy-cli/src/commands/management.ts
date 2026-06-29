import chalk from 'chalk'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import net from 'node:net'
import { configuration } from '@/configuration'
import { readCredentials, readDaemonState, readSettings } from '@/persistence'
import { checkIfDaemonRunningAndCleanupStaleState, stopDaemon } from '@/daemon/controlClient'
import { projectPath } from '@/projectPath'
import { spawnHappyCLI } from '@/utils/spawnHappyCLI'
import { handleServerCommand } from './server'

const execFileAsync = promisify(execFile)
const DEFAULT_SERVER_URL = 'https://api.cluster-fluster.com'
const DEFAULT_WEBAPP_URL = 'https://app.happy.engineering'

export type StatusLevel = 'ok' | 'warn' | 'error' | 'info'

export interface StatusItem {
    label: string
    level: StatusLevel
    detail: string
}

export interface LogSummary {
    file: string
    path: string
    kind: 'daemon' | 'server' | 'app' | 'regular'
    modifiedAt: string
}

export interface TailscaleMapping {
    source: string
    target: string
    targetPort?: number
    stale?: boolean
}

export interface UnifiedStatus {
    generatedAt: string
    config: {
        happyHomeDir: string
        settingsFile: string
        serverUrl: string
        serverUrlSource: string
        webappUrl: string
        webappUrlSource: string
        happyVariant?: string
    }
    env?: {
        name?: string
        path?: string
        serverPort?: number
        expoPort?: number
        currentFile?: string
    }
    auth: {
        credentials: StatusItem
        machine: StatusItem
        sessionsCache: StatusItem
        masterSecret: StatusItem
    }
    data: StatusItem[]
    providers: StatusItem[]
    daemon: {
        status: StatusItem
        pid?: number
        port?: number
        version?: string
        logPath?: string
    }
    services: StatusItem[]
    tailscale: {
        status: StatusItem
        mappings: TailscaleMapping[]
    }
    logs: LogSummary[]
    nextActions: string[]
}

interface RawSettings {
    serverUrl?: string
    webappUrl?: string
}

function readRawSettings(settingsFile: string): RawSettings {
    try {
        if (!existsSync(settingsFile)) return {}
        return JSON.parse(readFileSync(settingsFile, 'utf8')) as RawSettings
    } catch {
        return {}
    }
}

function urlSource(envName: string, rawSettings: RawSettings, key: 'serverUrl' | 'webappUrl', fallback: string): { value: string, source: string } {
    const envValue = process.env[envName]
    if (envValue) return { value: envValue, source: `env:${envName}` }
    const settingValue = rawSettings[key]
    if (settingValue) return { value: settingValue, source: 'settings.json' }
    return { value: fallback, source: 'default' }
}

function parseUrlPort(url: string): number | undefined {
    try {
        const parsed = new URL(url)
        if (parsed.port) return Number(parsed.port)
        if (parsed.protocol === 'https:') return 443
        if (parsed.protocol === 'http:') return 80
        return undefined
    } catch {
        return undefined
    }
}

async function isPortListening(port: number, host = '127.0.0.1', timeoutMs = 300): Promise<boolean> {
    return await new Promise(resolve => {
        const socket = net.createConnection({ port, host })
        const done = (result: boolean) => {
            socket.removeAllListeners()
            socket.destroy()
            resolve(result)
        }
        socket.setTimeout(timeoutMs)
        socket.once('connect', () => done(true))
        socket.once('timeout', () => done(false))
        socket.once('error', () => done(false))
    })
}

function parseTailscaleServeStatus(output: string): TailscaleMapping[] {
    const mappings: TailscaleMapping[] = []
    let source: string | undefined
    for (const rawLine of output.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (line.startsWith('https://')) {
            source = line.replace(/\s+\(.*\)$/, '')
            continue
        }
        const proxyMatch = line.match(/\|\--\s+\/\s+proxy\s+(.+)$/)
        if (source && proxyMatch) {
            const target = proxyMatch[1].trim()
            mappings.push({ source, target, targetPort: parseUrlPort(target) })
        }
    }
    return mappings
}

async function collectTailscale(listeningPorts: Set<number>): Promise<UnifiedStatus['tailscale']> {
    try {
        const { stdout } = await execFileAsync('tailscale', ['serve', 'status'], { timeout: 2_000 })
        const mappings = parseTailscaleServeStatus(stdout).map(mapping => ({
            ...mapping,
            stale: mapping.targetPort !== undefined && !listeningPorts.has(mapping.targetPort),
        }))
        if (mappings.length === 0) {
            return {
                status: { label: 'Tailscale', level: 'info', detail: 'no serve mappings configured' },
                mappings,
            }
        }
        const staleCount = mappings.filter(mapping => mapping.stale).length
        return {
            status: {
                label: 'Tailscale',
                level: staleCount > 0 ? 'warn' : 'ok',
                detail: staleCount > 0 ? `${staleCount} stale mapping(s)` : `${mappings.length} mapping(s) healthy by local port check`,
            },
            mappings,
        }
    } catch (error) {
        return {
            status: {
                label: 'Tailscale',
                level: 'info',
                detail: error instanceof Error ? `unavailable: ${error.message}` : 'unavailable',
            },
            mappings: [],
        }
    }
}

function collectLogs(happyHomeDir: string): LogSummary[] {
    const dirs = [
        { path: join(happyHomeDir, 'logs'), kind: 'regular' as const },
        { path: join(happyHomeDir, 'app-logs'), kind: 'app' as const },
    ]
    const logs: LogSummary[] = []
    for (const dir of dirs) {
        if (!existsSync(dir.path)) continue
        for (const file of readdirSync(dir.path)) {
            if (!file.endsWith('.log')) continue
            const path = join(dir.path, file)
            const stats = statSync(path)
            const kind = file.includes('daemon') ? 'daemon' : file.includes('server') ? 'server' : dir.kind
            logs.push({ file, path, kind, modifiedAt: stats.mtime.toISOString() })
        }
    }
    return logs.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 20)
}

function collectProviderStatus(): StatusItem[] {
    const codexAuth = join(homedir(), '.codex', 'auth.json')
    const geminiConfig = join(homedir(), '.gemini', 'config.json')
    const claudeConfig = join(homedir(), '.claude.json')
    return [
        existsSync(codexAuth)
            ? { label: 'Codex / ChatGPT', level: 'ok', detail: `configured (${codexAuth})` }
            : { label: 'Codex / ChatGPT', level: 'info', detail: 'no local auth file detected' },
        existsSync(geminiConfig) || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
            ? { label: 'Gemini', level: 'ok', detail: existsSync(geminiConfig) ? `configured (${geminiConfig})` : 'configured via environment' }
            : { label: 'Gemini', level: 'info', detail: 'no local config or env key detected' },
        existsSync(claudeConfig) || process.env.ANTHROPIC_API_KEY
            ? { label: 'Claude / Anthropic', level: 'ok', detail: existsSync(claudeConfig) ? `configured (${claudeConfig})` : 'configured via environment' }
            : { label: 'Claude / Anthropic', level: 'info', detail: 'no local config or env key detected' },
    ]
}

function collectCurrentEnv(repoRoot: string): UnifiedStatus['env'] | undefined {
    const currentFile = join(repoRoot, 'environments', 'data', 'current.json')
    try {
        if (!existsSync(currentFile)) return undefined
        const current = JSON.parse(readFileSync(currentFile, 'utf8')) as { current?: string }
        if (!current.current) return { currentFile }
        const envPath = join(repoRoot, 'environments', 'data', 'envs', current.current)
        const configPath = join(envPath, 'config.json')
        const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {}
        return {
            name: current.current,
            path: envPath,
            currentFile,
            serverPort: typeof config.serverPort === 'number' ? config.serverPort : undefined,
            expoPort: typeof config.expoPort === 'number' ? config.expoPort : undefined,
        }
    } catch {
        return { currentFile }
    }
}

export async function collectUnifiedStatus(): Promise<UnifiedStatus> {
    const rawSettings = readRawSettings(configuration.settingsFile)
    const settings = await readSettings()
    const credentials = await readCredentials()
    const daemonState = await readDaemonState()
    const daemonRunning = await checkIfDaemonRunningAndCleanupStaleState().catch(() => false)
    const serverConfig = urlSource('HAPPY_SERVER_URL', rawSettings, 'serverUrl', DEFAULT_SERVER_URL)
    const webappConfig = urlSource('HAPPY_WEBAPP_URL', rawSettings, 'webappUrl', DEFAULT_WEBAPP_URL)
    const configuredServerPort = parseUrlPort(serverConfig.value)
    const env = collectCurrentEnv(projectPath())
    const portsToCheck = new Set<number>()
    if (configuredServerPort) portsToCheck.add(configuredServerPort)
    if (env?.serverPort) portsToCheck.add(env.serverPort)
    if (env?.expoPort) portsToCheck.add(env.expoPort)
    portsToCheck.add(8787)

    const listeningPorts = new Set<number>()
    await Promise.all([...portsToCheck].map(async port => {
        if (await isPortListening(port)) listeningPorts.add(port)
    }))

    const serverListening = configuredServerPort !== undefined && listeningPorts.has(configuredServerPort)
    const services: StatusItem[] = [
        {
            label: 'self-host server',
            level: configuredServerPort === undefined ? 'warn' : serverListening ? 'ok' : 'error',
            detail: configuredServerPort === undefined ? `cannot parse port from ${serverConfig.value}` : `${serverConfig.value} (${serverListening ? 'listening' : 'not listening'})`,
        },
        {
            label: 'app log receiver',
            level: listeningPorts.has(8787) ? 'ok' : 'info',
            detail: `127.0.0.1:8787 (${listeningPorts.has(8787) ? 'listening' : 'not listening'})`,
        },
    ]
    if (env?.expoPort) {
        services.push({
            label: 'Expo/Metro',
            level: listeningPorts.has(env.expoPort) ? 'ok' : 'info',
            detail: `127.0.0.1:${env.expoPort} (${listeningPorts.has(env.expoPort) ? 'listening' : 'not listening'})`,
        })
    }

    const masterSecretPath = join(configuration.happyHomeDir, 'server-data', 'master-secret')
    const serverDataPath = join(configuration.happyHomeDir, 'server-data')
    const pglitePath = join(serverDataPath, 'pglite')
    const sessionsFile = join(configuration.happyHomeDir, 'sessions.json')
    const tailscale = await collectTailscale(listeningPorts)
    const nextActions = buildNextActions({ serverListening, daemonRunning, tailscale })

    return {
        generatedAt: new Date().toISOString(),
        config: {
            happyHomeDir: configuration.happyHomeDir,
            settingsFile: configuration.settingsFile,
            serverUrl: serverConfig.value,
            serverUrlSource: serverConfig.source,
            webappUrl: webappConfig.value,
            webappUrlSource: webappConfig.source,
            happyVariant: process.env.HAPPY_VARIANT,
        },
        env,
        auth: {
            credentials: credentials
                ? { label: 'CLI credentials', level: 'ok', detail: 'present in access.key' }
                : { label: 'CLI credentials', level: 'warn', detail: 'missing; run happy auth login' },
            machine: settings.machineId
                ? { label: 'Machine', level: 'ok', detail: `registered (${settings.machineId})` }
                : { label: 'Machine', level: 'warn', detail: 'missing machineId' },
            sessionsCache: existsSync(sessionsFile)
                ? { label: 'Session cache', level: 'info', detail: 'present' }
                : { label: 'Session cache', level: 'info', detail: 'not present' },
            masterSecret: existsSync(masterSecretPath)
                ? { label: 'Self-host master secret', level: 'ok', detail: 'present; value hidden' }
                : { label: 'Self-host master secret', level: 'info', detail: 'not created yet' },
        },
        data: [
            existsSync(serverDataPath)
                ? { label: 'Server data', level: 'ok', detail: serverDataPath }
                : { label: 'Server data', level: 'info', detail: 'not created yet' },
            existsSync(pglitePath)
                ? { label: 'PGlite', level: 'ok', detail: pglitePath }
                : { label: 'PGlite', level: 'info', detail: 'not created yet' },
            existsSync(configuration.logsDir)
                ? { label: 'Logs directory', level: 'ok', detail: configuration.logsDir }
                : { label: 'Logs directory', level: 'warn', detail: 'missing' },
        ],
        providers: collectProviderStatus(),
        daemon: {
            status: daemonRunning && daemonState
                ? { label: 'Daemon', level: 'ok', detail: `running on 127.0.0.1:${daemonState.httpPort}` }
                : daemonState
                    ? { label: 'Daemon', level: 'warn', detail: 'state file exists but daemon is not running' }
                    : { label: 'Daemon', level: 'warn', detail: 'not running' },
            pid: daemonState?.pid,
            port: daemonState?.httpPort,
            version: daemonState?.startedWithCliVersion,
            logPath: daemonState?.daemonLogPath,
        },
        services,
        tailscale,
        logs: collectLogs(configuration.happyHomeDir),
        nextActions,
    }
}

function buildNextActions(input: { serverListening: boolean, daemonRunning: boolean, tailscale: UnifiedStatus['tailscale'] }): string[] {
    const actions: string[] = []
    if (!input.serverListening) {
        actions.push('Start the self-host server: happy server --port 3005 --host 127.0.0.1')
    }
    if (!input.daemonRunning) {
        actions.push('Start the daemon: happy daemon start')
    }
    if (input.tailscale.mappings.some(mapping => mapping.stale)) {
        actions.push('Repair Tailscale mappings after confirming the desired public ports')
    }
    return actions
}

function marker(level: StatusLevel): string {
    switch (level) {
        case 'ok': return chalk.green('✓')
        case 'warn': return chalk.yellow('!')
        case 'error': return chalk.red('✗')
        case 'info': return chalk.gray('-')
    }
}

function printItem(item: StatusItem): void {
    console.log(`  ${marker(item.level)} ${item.label}: ${item.detail}`)
}

export function printUnifiedStatus(status: UnifiedStatus, section: 'all' | 'services' | 'config' | 'logs' | 'env' = 'all'): void {
    if (section === 'all') console.log(chalk.bold.cyan('\nHappy Status\n'))

    if (section === 'all' || section === 'config') {
        console.log(chalk.bold('Configuration'))
        console.log(`  Server URL: ${status.config.serverUrl} (${status.config.serverUrlSource})`)
        console.log(`  Webapp URL: ${status.config.webappUrl} (${status.config.webappUrlSource})`)
        console.log(`  Happy home: ${status.config.happyHomeDir}`)
        console.log(`  Settings:   ${status.config.settingsFile}`)
        if (status.config.happyVariant) console.log(`  Variant:    ${status.config.happyVariant}`)
    }

    if (section === 'all' || section === 'env') {
        console.log(chalk.bold('\nEnvironment'))
        if (status.env?.name) {
            console.log(`  Current env: ${status.env.name}`)
            console.log(`  Path:        ${status.env.path}`)
            if (status.env.serverPort) console.log(`  Server port: ${status.env.serverPort}`)
            if (status.env.expoPort) console.log(`  Expo port:   ${status.env.expoPort}`)
        } else {
            console.log('  - No pnpm env current environment detected')
        }
    }

    if (section === 'all') {
        console.log(chalk.bold('\nAuthentication'))
        printItem(status.auth.credentials)
        printItem(status.auth.machine)
        printItem(status.auth.sessionsCache)
        printItem(status.auth.masterSecret)

        console.log(chalk.bold('\nData'))
        for (const item of status.data) printItem(item)

        console.log(chalk.bold('\nProviders'))
        for (const item of status.providers) printItem(item)

        console.log(chalk.bold('\nDaemon'))
        printItem(status.daemon.status)
        if (status.daemon.logPath) console.log(`    log: ${status.daemon.logPath}`)
    }

    if (section === 'all' || section === 'services') {
        console.log(chalk.bold('\nServices'))
        for (const service of status.services) printItem(service)
        printItem(status.tailscale.status)
        for (const mapping of status.tailscale.mappings) {
            const stale = mapping.stale ? chalk.yellow(' stale') : ''
            console.log(`    ${mapping.source} -> ${mapping.target}${stale}`)
        }
    }

    if (section === 'all' || section === 'logs') {
        console.log(chalk.bold('\nLogs'))
        if (status.logs.length === 0) {
            console.log('  - No logs found')
        } else {
            for (const log of status.logs.slice(0, 10)) {
                console.log(`  ${log.kind.padEnd(7)} ${log.file} (${relative(status.config.happyHomeDir, log.path)})`)
            }
        }
    }

    if (section === 'all' && status.nextActions.length > 0) {
        console.log(chalk.bold('\nSuggested next actions'))
        for (const action of status.nextActions) console.log(`  - ${action}`)
    }

    console.log()
}

function wantsJson(args: string[]): boolean {
    return args.includes('--json')
}

export async function handleStatusCommand(args: string[]): Promise<void> {
    const status = await collectUnifiedStatus()
    if (wantsJson(args)) {
        console.log(JSON.stringify(status, null, 2))
        return
    }
    printUnifiedStatus(status)
}

export async function handleServicesCommand(args: string[]): Promise<void> {
    const subcommand = args[0] ?? 'status'
    if (subcommand === 'status') {
        const status = await collectUnifiedStatus()
        if (wantsJson(args)) console.log(JSON.stringify({ services: status.services, tailscale: status.tailscale, daemon: status.daemon }, null, 2))
        else printUnifiedStatus(status, 'services')
        return
    }
    if (subcommand === 'start' || subcommand === 'stop' || subcommand === 'restart') {
        await handleServiceMutation(subcommand, args.slice(1))
        return
    }
    console.log(`
${chalk.bold('happy services')} - Unified service management

${chalk.bold('Usage:')}
  happy services status [--json]   Show daemon, server, Expo, app-log, and Tailscale state
  happy services start daemon      Start the daemon
  happy services stop daemon       Stop the daemon
  happy services restart daemon    Restart the daemon
  happy services start server      Start the self-host server in the foreground

${chalk.bold('Notes:')}
  Server stop is not automated yet because happy server does not persist a server PID.
  Tailscale repair is intentionally not automatic; inspect happy services status first.
`)
}

async function handleServiceMutation(action: 'start' | 'stop' | 'restart', services: string[]): Promise<void> {
    const targets = services.length > 0 ? services : ['daemon']
    for (const service of targets) {
        if (service === 'daemon') {
            if (action === 'stop' || action === 'restart') {
                await stopDaemon().catch(() => undefined)
                console.log(chalk.gray('Stopped daemon if it was running'))
            }
            if (action === 'start' || action === 'restart') {
                await runHappySubcommand(['daemon', 'start'])
            }
            continue
        }
        if (service === 'server' && action === 'start') {
            console.log(chalk.yellow('Starting self-host server in the foreground. Press Ctrl-C to stop it.'))
            await handleServerCommand(['--port', '3005', '--host', '127.0.0.1'])
            continue
        }
        console.error(chalk.red(`Unsupported service operation: ${action} ${service}`))
        console.error(chalk.gray('Supported: start|stop|restart daemon, start server'))
        process.exitCode = 1
        return
    }
}

async function runHappySubcommand(args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const child = spawnHappyCLI(args, { stdio: 'inherit' })
        child.on('error', reject)
        child.on('exit', code => {
            if (code && code !== 0) reject(new Error(`happy ${args.join(' ')} exited with code ${code}`))
            else resolve()
        })
    })
}

export async function handleConfigCommand(args: string[]): Promise<void> {
    const status = await collectUnifiedStatus()
    if (wantsJson(args)) {
        console.log(JSON.stringify({ config: status.config }, null, 2))
        return
    }
    printUnifiedStatus(status, 'config')
}

export async function handleLogsCommand(args: string[]): Promise<void> {
    const status = await collectUnifiedStatus()
    if (wantsJson(args)) {
        console.log(JSON.stringify({ logs: status.logs }, null, 2))
        return
    }
    printUnifiedStatus(status, 'logs')
}

export async function handleEnvCommand(args: string[]): Promise<void> {
    const status = await collectUnifiedStatus()
    if (wantsJson(args)) {
        console.log(JSON.stringify({ env: status.env ?? null }, null, 2))
        return
    }
    printUnifiedStatus(status, 'env')
}

export function getDefaultCredentialLocations(): string[] {
    return [
        join(configuration.happyHomeDir, 'access.key'),
        join(configuration.happyHomeDir, 'sessions.json'),
        join(configuration.happyHomeDir, 'server-data', 'master-secret'),
        join(homedir(), '.codex', 'auth.json'),
        join(homedir(), '.gemini', 'config.json'),
    ]
}

export const managementInternals = {
    parseTailscaleServeStatus,
    parseUrlPort,
    urlSource,
}
