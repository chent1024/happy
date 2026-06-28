## Why

Happy mobile sessions currently depend on a desktop daemon plus a per-session Happy CLI/agent worker process. When a session worker exits, becomes stale after an upgrade, or is no longer tracked by the daemon, the mobile app can still send encrypted messages to Happy Server while no live local worker consumes them, making the session appear connected but unusable.

## What Changes

- Add daemon-side session worker supervision that classifies each session worker as running, resumable, not resumable, stale-version, or unknown.
- Add a machine RPC that ensures a session has a live worker before or after mobile sends new input, reusing existing resume mechanics when safe.
- Update the mobile send path to trigger this liveness check without blocking local echo, outbox enqueueing, or composer clearing.
- Surface structured failure reasons when a session cannot be resumed instead of silently leaving messages unprocessed.
- Preserve the current Happy Server relay and encrypted message transport. This change does not alter the wire protocol or replace Happy Server with direct mobile-to-daemon transport.
- Avoid killing active workers during CLI upgrades; mark stale workers and let the next safe resume use the current CLI.

## Capabilities

### New Capabilities
- `session-worker-supervision`: Daemon and mobile behavior for detecting, resuming, and reporting per-session worker availability.

### Modified Capabilities
- None.

## Impact

- `packages/happy-cli/src/daemon/*`: session worker classification, resume orchestration, and version-staleness handling.
- `packages/happy-cli/src/api/apiMachine.ts`: new machine RPC contract.
- `packages/happy-app/sources/sync/ops.ts` and `sync.ts`: non-blocking send-path liveness check and structured failure handling.
- Tests for daemon supervision, machine RPC behavior, and mobile send-path non-blocking behavior.
- No database migration, no protocol migration, no OTA/update-system changes, and no direct mobile-to-daemon transport changes.
