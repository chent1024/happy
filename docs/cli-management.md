# Happy CLI Management

This document explains the current Happy CLI management surface. The goal is to
make local runtime, self-host server, Tailscale, auth, logs, and development
environment state discoverable from one place while keeping destructive actions
explicit.

## Unified Commands

Use these first when diagnosing a local setup:

```bash
happy status
happy services status
happy config
happy logs
happy env
```

All of these are read-only. Use `--json` when another tool needs to parse the
result:

```bash
happy status --json
happy services status --json
happy config --json
happy logs --json
happy env --json
```

## `happy status`

`happy status` is the main overview. It aggregates:

- effective `serverUrl` and `webappUrl`
- where each URL came from: env, `settings.json`, or default
- current `HAPPY_HOME_DIR`
- current `pnpm env:*` environment, if one exists
- CLI credentials presence
- machine registration presence
- session cache presence
- self-host master-secret presence without printing the value
- server data and PGlite paths
- provider config presence for Codex, Gemini, and Claude/Anthropic
- daemon status, PID, local control port, version, and log path
- self-host server port health
- app log receiver health
- Tailscale Serve mappings and stale targets
- recent log files
- suggested next actions

The command intentionally reports secret-bearing files only by presence and
path. It must not print token, secret, master-secret, or private-key contents.

## `happy services`

`happy services status` focuses on runtime services:

```bash
happy services status
happy services status --json
```

It shows:

- self-host server health
- app log receiver health
- Tailscale mappings and stale targets
- daemon status

Limited lifecycle operations are available:

```bash
happy services start daemon
happy services stop daemon
happy services restart daemon
happy services start server
```

`happy services start server` starts the self-host server in the foreground. It
does not install a launch agent, daemonize the server, or guarantee persistence
after reboot. Use `Ctrl-C` to stop the foreground server.

Server stop is not automated yet because `happy server` does not persist a
server PID. Avoid killing by port unless the user explicitly confirms that the
process on that port should be terminated.

Tailscale repair is intentionally not automated from `happy services` yet. The
status command can identify stale mappings, but changing `tailscale serve` or
`tailscale funnel` is external network state and should require explicit user
authorization.

## `happy config`

`happy config` shows the effective local configuration:

```bash
happy config
happy config --json
```

The important fields are:

- `serverUrl`
- `serverUrlSource`
- `webappUrl`
- `webappUrlSource`
- `happyHomeDir`
- `settingsFile`
- `HAPPY_VARIANT`, when set

URL precedence is:

1. `HAPPY_SERVER_URL` / `HAPPY_WEBAPP_URL`
2. `~/.happy/settings.json`
3. built-in defaults

For isolated development environments, the generated env file under
`environments/data/envs/<name>/env.sh` typically sets these variables.

## `happy logs`

`happy logs` lists recent logs from:

- `~/.happy/logs`
- `~/.happy/app-logs`, when present

Kinds are classified as:

- `daemon`
- `server`
- `app`
- `regular`

Use the returned file path with normal shell tools, for example:

```bash
tail -f ~/.happy/logs/<file>
```

## `happy env`

`happy env` shows the current `pnpm env:*` environment, if any:

```bash
happy env
happy env --json
```

It reads `environments/data/current.json` and the selected environment config.
This command does not create, switch, or remove environments.

Use `pnpm env:*` for full environment lifecycle:

```bash
pnpm env:new
pnpm env:use <name>
pnpm env:up --template authenticated-empty
pnpm env:down
pnpm env:cli daemon status
```

## Existing Commands

The older command surface still exists and remains valid:

```bash
happy daemon start
happy daemon stop
happy daemon status
happy daemon list

happy auth login
happy auth logout
happy auth status

happy server --port 3005 --host 127.0.0.1
happy doctor
happy doctor clean
```

The unified commands do not replace these commands. They provide a safer first
diagnostic layer and a grouped entry for low-risk daemon lifecycle operations.

## Self-Host And iOS Triage

When an iPhone or iPad cannot connect to a self-hosted Happy server:

1. Run `happy status`.
2. Confirm the `Server URL` and its source.
3. Confirm `CLI credentials`, `Machine`, and `Self-host master secret` are
   present.
4. Check `self-host server` under `Services`.
5. Check Tailscale mappings and whether any target is stale.
6. Start the server if the configured local port is not listening.
7. Only modify Tailscale after confirming the intended public URL and ports.

Common interpretation:

- `self-host server: not listening`: local Happy server is not running.
- `Tailscale: stale mapping`: Tailscale still points at a local port with no
  listener.
- credentials present but server not listening: fix the server before resetting
  auth.
- server listening but Tailscale stale: repair or recreate Tailscale mappings
  after confirming desired ports.

## Safety Rules

Do not run these without explicit user authorization:

- `happy doctor clean`
- `happy auth logout`
- `happy auth login --force`
- deleting `~/.happy/access.key`
- deleting `~/.happy/sessions.json`
- deleting or resetting `~/.happy/server-data`
- deleting or rotating `~/.happy/server-data/master-secret`
- changing `tailscale serve` or `tailscale funnel` mappings

Never print secret contents. It is acceptable to report whether a credential
file exists and where it is located.

## Current Limitations

- `happy services start server` runs in the foreground.
- `happy services stop server` is not supported yet.
- Tailscale repair is status-only; mapping changes are still manual.
- Provider status is presence-based and does not perform live OAuth/API probes.
- `happy status` performs local port checks, not full end-to-end mobile checks.

