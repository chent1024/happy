# Design: Manual Codex Session Sync

## Entry Point

The app exposes a manual sync action scoped to a machine. The user explicitly clicks the action when they want the latest Codex.app thread list pulled into Happy.

Default query:

- `limit: 200`
- `sortKey: "updated_at"`
- `sortDirection: "desc"`
- `archived: false`

## Data Source

The daemon uses the existing `CodexAppServerClient`, which launches `codex app-server --listen stdio://`, and calls the official `thread/list` app-server method. The app and daemon do not inspect Codex sqlite files directly.

## Import Shape

Each Codex thread maps to one Happy session keyed by:

- `machineId`
- `metadata.flavor = "codex"`
- `metadata.codexThreadId`

Metadata uses existing Happy session fields where possible:

- `path`: Codex `cwd` or `path`
- `title`: Codex `name`, `preview`, or a fallback label
- `codexThreadId`: Codex thread id
- `flavor`: `codex`
- `machineId`: selected machine id

Imported sessions are historical. They should not start an agent process, create live permissions, or report online presence.

## Sync Semantics

The app receives the thread list from the machine RPC, normalizes Codex timestamps to Happy's millisecond timestamp convention, filters out threads whose latest timestamp is more than 3 days old, sorts by `updatedAt`, then `recencyAt`, then `createdAt`, groups it by project path (`cwd` falling back to `path`), and processes at most 15 threads per project. It compares processed threads with local/server sessions already known to Happy, imports missing Codex thread ids, and refreshes timestamps for existing imported Codex thread ids. Imported Happy sessions reuse the normalized Codex thread `updatedAt` as their session `updatedAt` so the existing session list sort orders them by the original Codex recency. Re-running sync is idempotent for already imported threads.

The first version synchronizes metadata only. Full message import, transcript indexing, and automatic polling are intentionally left out.

## Failure Handling

If Codex app-server is unavailable or too old to support `thread/list`, the manual sync action reports the failure to the user and leaves existing Happy sessions unchanged.

## Validation

Targeted tests should cover:

- `CodexAppServerClient.listThreads` sends `thread/list` and returns typed data.
- Machine RPC calls Codex app-server with the expected default filters.
- App sync mapping creates imported session payloads without duplicates.
