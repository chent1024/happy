# Dev Environments

This document covers the local environment manager in [`environments/environments.ts`](../environments/environments.ts).

For the unified Happy CLI management surface (`happy status`, `happy services`,
`happy config`, `happy logs`, and `happy env`), see
[`cli-management.md`](./cli-management.md).

## What `pnpm env:*` Does

- `pnpm env:new`: create a new isolated environment under `environments/data/envs/<name>`.
- `pnpm env:use <name>`: switch the current environment.
- `pnpm env:server`: run the server inside the current environment.
- `pnpm env:web`: run the web app inside the current environment.
- `pnpm env:cli`: run the CLI inside the current environment.

Each environment injects its own:

- `HAPPY_HOME_DIR`
- `HAPPY_SERVER_URL`
- `HAPPY_WEBAPP_URL`
- `HAPPY_PROJECT_DIR`
- Expo/server port settings
- dev auth values when seeded

Each fresh environment also gets a copied lightweight fixture project from
`environments/lab-rat-todo-project/` at `environments/data/envs/<name>/project`.

Current limitation: the lab-rat project is copied as plain files only. It does
not include git history yet, so provider tests that depend on realistic repo
history still need a later fixture upgrade.

## `pnpm env:cli` Is A Passthrough

`pnpm env:cli` forwards extra arguments directly to `happy`.

Examples:

```bash
pnpm env:cli --help
pnpm env:cli codex
pnpm env:cli daemon status
pnpm env:cli daemon stop
pnpm env:cli daemon start
```

This is equivalent to sourcing the environment and running the CLI manually:

```bash
source environments/data/envs/<name>/env.sh
happy daemon status
```

## Why `env:cli` Exists

It is a convenience wrapper for the current environment. It does not create or pick an environment on its own. It just:

1. Reads `environments/data/current.json`
2. Builds env vars for that environment
3. Launches the CLI with those vars applied

If you want a lower-level, shell-native workflow, use the generated env file directly:

```bash
source environments/data/envs/<name>/env.sh
happy
```

## Restarting The Current Environment Daemon

Either of these now works:

```bash
pnpm env:cli daemon stop
pnpm env:cli daemon start
```

Or:

```bash
source environments/data/envs/<name>/env.sh
happy daemon stop
happy daemon start
```

## Android And iOS Remote Dev Over Tailscale

For testing Android and iOS development builds at the same time over Tailscale,
use the root `dev:tailscale` helper instead of ad hoc Metro ports:

```bash
pnpm dev:tailscale status
pnpm dev:tailscale setup
pnpm dev:tailscale urls
pnpm dev:tailscale stop
```

The standard topology is:

- Happy API: `https://<tailnet-host>` -> `http://127.0.0.1:3005`
- Metro dev client: `https://<tailnet-host>:8443` -> `http://127.0.0.1:8081`

`setup` starts Metro on local `127.0.0.1:8081` and injects the external Metro
proxy URL plus both app-side Happy server variables into the dev bundle:

```bash
EXPO_PACKAGER_PROXY_URL=https://<tailnet-host>:8443
EXPO_PUBLIC_HAPPY_SERVER_URL=https://<tailnet-host>
EXPO_PUBLIC_SERVER_URL=https://<tailnet-host>
```

Use the printed `exp+happy://expo-development-client/?url=...` URL from both
Android and iOS development builds. The helper exposes Metro through Tailscale
HTTPS and sets `EXPO_PACKAGER_PROXY_URL` so Expo manifests advertise HTTPS
bundle URLs instead of HTTP URLs blocked by App Transport Security. This keeps
both platforms on the same JS bundle and the same Happy self-host server.

If stale Tailscale Serve mappings need to be removed, run:

```bash
pnpm dev:tailscale setup --reset-serve
```

`--reset-serve` clears this machine's current Tailscale Serve config before
installing the Happy dev mappings. It does not enable Funnel.
