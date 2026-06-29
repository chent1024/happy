# Agent Workflow

## Happy CLI Management

When diagnosing local Happy runtime, iOS self-host, Tailscale, daemon, auth, or
port issues, start with the unified read-only commands before using lower-level
commands:

1. `happy status`
2. `happy services status`
3. `happy config`
4. `happy logs`
5. `happy env`

Use `--json` on these commands when the result needs to be parsed or compared
programmatically.

The old commands still exist and remain valid for explicit operations:

- `happy daemon start|stop|status|list`
- `happy auth login|logout|status`
- `happy server [--port 3005] [--host 127.0.0.1] ...`
- `happy doctor`
- `happy doctor clean`

Prefer `happy services start|stop|restart daemon` for daemon lifecycle from the
new grouped surface. `happy services start server` is allowed, but it starts the
self-host server in the foreground; do not assume it backgrounds or persists
across reboots.

Safety boundaries:

- Do not run `happy doctor clean` unless the user explicitly asks to terminate
  Happy processes.
- Do not run `happy auth logout`, `happy auth login --force`, or remove
  `~/.happy/access.key` unless the user explicitly asks to reset auth.
- Do not delete, reset, or rotate `~/.happy/server-data`, PGlite data, or
  `~/.happy/server-data/master-secret` unless the user explicitly asks for a
  destructive self-host reset.
- Treat Tailscale changes as external network state. `happy status` and
  `happy services status` may be used freely, but changing `tailscale serve` or
  `tailscale funnel` mappings requires explicit user authorization.
- Never print token, secret, master-secret, private key, full connection string,
  or credential file contents. Report only presence, path, source, and health.

Typical self-host/iOS triage order:

1. Run `happy status` and inspect `Configuration`, `Authentication`,
   `Services`, and `Tailscale`.
2. If `self-host server` is not listening, start it with
   `happy services start server` or the explicit `happy server ...` command.
3. If Tailscale mappings are stale, confirm the desired public ports with the
   user before changing Tailscale state.
4. If auth is present but server probes fail, fix server/Tailscale first before
   resetting credentials.

Runtime effectiveness rules:

- Source edits under `packages/happy-cli/src` are not live until the CLI is
  rebuilt and the daemon process is restarted. Already-running session workers
  can still be using older code.
- After CLI/runtime edits, verify the runtime state, not just the source tree:
  check `happy status`, `happy doctor`, the daemon PID, and any relevant session
  worker PID.
- If local validation fails because dependencies are missing or the lockfile is
  out of date, prefer fixing the local install explicitly before changing
  application behavior.

Self-host and Tailscale checks:

- Before blaming the mobile app or auth, check whether `HAPPY_SERVER_URL` is set
  in the shell environment. It can override `~/.happy/settings.json` and point
  the CLI or daemon at an old server.
- For Tailscale HTTPS self-host checks, verify all three layers: local listener
  such as `lsof -nP -iTCP:3005 -sTCP:LISTEN`, `tailscale serve status`, and a
  curl probe to the tailnet URL.
- A Tailscale `502` usually means the Serve mapping exists but the local backend
  is not reachable. Fix the local Happy server before changing auth or mobile
  state.
- Use Tailscale Serve for private tailnet access by default. Do not enable
  Tailscale Funnel unless the user explicitly asks for public internet exposure.

Android+iOS remote dev over Tailscale:

- When the user wants Android and iOS development builds to test remotely at the
  same time, prefer the root helper over ad hoc port changes:
  `pnpm dev:tailscale status`, `pnpm dev:tailscale setup`, and
  `pnpm dev:tailscale urls`.
- The standard topology is Happy API on `https://<tailnet-host>` forwarding to
  `http://127.0.0.1:3005`, and Metro dev-client access on
  `https://<tailnet-host>:8443` forwarding to local Metro at
  `http://127.0.0.1:8081`.
- If stale Tailscale Serve mappings need to be replaced, use
  `pnpm dev:tailscale setup --reset-serve` only after confirming that changing
  this machine's Tailscale Serve config is intended.
- Do not start temporary Metro ports such as `8082` or `8083` as the remote-dev
  fix unless the user explicitly asks for a one-off workaround. Keep Android and
  iOS development clients on the printed `exp+happy://expo-development-client`
  URL from `pnpm dev:tailscale urls`.
- `pnpm dev:tailscale setup` injects `EXPO_PUBLIC_HAPPY_SERVER_URL` and
  `EXPO_PUBLIC_SERVER_URL` into the Metro dev bundle so the mobile app uses the
  same tailnet Happy API address as the dev-client manifest. It also sets
  `EXPO_PACKAGER_PROXY_URL=https://<tailnet-host>:8443` so Expo manifests
  advertise HTTPS bundle URLs.

iOS and mobile network rules:

- On a physical iPhone, `localhost` and `127.0.0.1` refer to the phone, not the
  Mac. Use a LAN address or Tailscale HTTPS URL for Mac-hosted services.
- The App Store app can point at a self-host Happy server, but it cannot load a
  local Metro bundle. Local development needs a development build.
- iOS development clients open Expo with
  `exp+happy://expo-development-client/?url=<encoded manifest URL>`.
- For Metro over Tailscale on iOS, use the helper's printed
  `exp+happy://expo-development-client/?url=...` URL. It encodes the HTTPS
  tailnet Metro URL. Do not use an HTTP Metro URL on iOS; App Transport Security
  can block it before the dev bundle loads. If iOS reports ATS after opening
  the HTTPS dev-client URL, verify that `EXPO_PACKAGER_PROXY_URL` was set before
  Metro started and restart Metro with `pnpm dev:tailscale setup --restart-metro`.

Android local development rules:

- When a specific Android device is known, prefer
  `ANDROID_SERIAL=<serial> corepack pnpm --filter happy-app android:dev` over
  relying on Expo's device-name selection.
- USB development clients need `adb reverse tcp:8081 tcp:8081` restored before
  assuming Metro or the app is broken.
- `packages/happy-app/android/` is generated and ignored. Do not treat churn in
  that directory as source unless the task is explicitly about native project
  generation.
- For Gradle OOM, daemon lock, or journal cache issues, stop the specific stale
  Gradle daemon first. Only clear narrow Gradle cache paths when the error
  points to corruption or locking.

Session recovery rules:

- When the user asks how to recover, resume, or add a Happy session, answer with
  the high-level command first: `happy resume <session-id>`.
- Distinguish Happy session IDs from Codex thread IDs. `happy codex --resume
  <thread-id>` is a lower-level backend resume path.
- Mobile resume visibility depends on the feature flag, an eligible disconnected
  session, matching machine/backend metadata, and the machine being online.
- Do not promise that the phone can restart a stopped daemon through the same
  daemon channel. For restart flows, prefer a daemon-side atomic operation over
  app-side `kill` followed by `resume`.

Credential and local-data boundaries:

- Files such as `~/.happy/sessions.json`, `~/.happy/access.key`, and
  `~/.happy/server-data/master-secret` may be inspected for presence, path,
  ownership, timestamps, and structural health only. Do not print their secret
  contents.
- Switching to a fresh self-host server can invalidate old tokens. Prefer a
  normal login flow after confirming the server and Tailscale path are healthy;
  do not jump directly to destructive auth or server-data resets.

See `docs/cli-management.md` for the full command map.

## Sync To Main

When the user says `sync to main` or `synt to main`, they mean:

1. Fetch `origin/main`.
2. Rebase the current branch on `origin/main`.
3. Push the current HEAD directly to `main` with a normal push, for example:
   `git push origin HEAD:main`

Do not force push for this workflow.
