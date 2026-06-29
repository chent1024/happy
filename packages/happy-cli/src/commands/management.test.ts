import { describe, expect, it } from 'vitest'
import { managementInternals, type UnifiedStatus, printUnifiedStatus } from './management'

describe('management status helpers', () => {
    it('detects URL sources without exposing secrets', () => {
        const previous = process.env.HAPPY_SERVER_URL
        process.env.HAPPY_SERVER_URL = 'http://127.0.0.1:3005'
        try {
            const source = managementInternals.urlSource(
                'HAPPY_SERVER_URL',
                { serverUrl: 'https://settings.example' },
                'serverUrl',
                'https://default.example',
            )
            expect(source).toEqual({ value: 'http://127.0.0.1:3005', source: 'env:HAPPY_SERVER_URL' })
        } finally {
            if (previous === undefined) delete process.env.HAPPY_SERVER_URL
            else process.env.HAPPY_SERVER_URL = previous
        }
    })

    it('parses tailscale serve mappings and target ports', () => {
        const mappings = managementInternals.parseTailscaleServeStatus(`
https://chent.taile37c91.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:3005

https://chent.taile37c91.ts.net:8443 (tailnet only)
|-- / proxy http://127.0.0.1:8081
`)
        expect(mappings).toEqual([
            { source: 'https://chent.taile37c91.ts.net', target: 'http://127.0.0.1:3005', targetPort: 3005 },
            { source: 'https://chent.taile37c91.ts.net:8443', target: 'http://127.0.0.1:8081', targetPort: 8081 },
        ])
    })

    it('prints auth status without token or master secret values', () => {
        const status: UnifiedStatus = {
            generatedAt: '2026-06-29T00:00:00.000Z',
            config: {
                happyHomeDir: '/tmp/.happy',
                settingsFile: '/tmp/.happy/settings.json',
                serverUrl: 'http://127.0.0.1:3005',
                serverUrlSource: 'settings.json',
                webappUrl: 'http://127.0.0.1:3005',
                webappUrlSource: 'settings.json',
            },
            auth: {
                credentials: { label: 'CLI credentials', level: 'ok', detail: 'present in access.key' },
                machine: { label: 'Machine', level: 'ok', detail: 'registered (machine-1)' },
                sessionsCache: { label: 'Session cache', level: 'info', detail: 'present' },
                masterSecret: { label: 'Self-host master secret', level: 'ok', detail: 'present; value hidden' },
            },
            data: [
                { label: 'Server data', level: 'ok', detail: '/tmp/.happy/server-data' },
                { label: 'PGlite', level: 'ok', detail: '/tmp/.happy/server-data/pglite' },
            ],
            providers: [
                { label: 'Codex / ChatGPT', level: 'info', detail: 'no local auth file detected' },
            ],
            daemon: {
                status: { label: 'Daemon', level: 'ok', detail: 'running on 127.0.0.1:49214' },
                pid: 123,
                port: 49214,
                version: '1.1.10',
            },
            services: [
                { label: 'self-host server', level: 'error', detail: 'http://127.0.0.1:3005 (not listening)' },
            ],
            tailscale: {
                status: { label: 'Tailscale', level: 'warn', detail: '1 stale mapping(s)' },
                mappings: [{ source: 'https://host.ts.net', target: 'http://127.0.0.1:3005', targetPort: 3005, stale: true }],
            },
            logs: [],
            nextActions: ['Start the self-host server: happy server --port 3005 --host 127.0.0.1'],
        }
        const lines: string[] = []
        const original = console.log
        console.log = (line?: unknown) => { lines.push(String(line ?? '')) }
        try {
            printUnifiedStatus(status)
        } finally {
            console.log = original
        }
        const output = lines.join('\n')
        expect(output).toContain('value hidden')
        expect(output).not.toContain('token')
        expect(output).not.toContain('secret-value')
    })
})
