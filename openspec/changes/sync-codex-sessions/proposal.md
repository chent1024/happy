# Change: Manual Codex Session Sync

## Why

Happy already integrates with Codex app-server for live Codex workflows, but older or externally created Codex.app sessions do not appear in Happy unless they were launched through Happy. Users need an explicit way to import the latest local Codex session list into Happy on demand.

Automatic background sync would add surprising cross-app state changes, extra daemon traffic, and unclear timing semantics. This change keeps the first version manual and bounded.

## What Changes

- Add a typed `thread/list` method to the Codex app-server client protocol and client wrapper.
- Add a machine RPC that asks the connected daemon to list recent local Codex threads through `codex app-server`.
- Add a manual sync action in the app for a specific machine.
- Import latest Codex thread metadata as Happy sessions without starting agents or marking them online.
- Deduplicate imported sessions by machine and Codex thread id.

## What Does Not Change

- No automatic or background Codex session sync.
- No direct reads from Codex sqlite/state files.
- No full transcript/message import.
- No deploy, release, commit, or push as part of this change.

## Acceptance

- Clicking the manual sync action requests recent non-archived Codex threads for the selected machine, ordered by latest update time, and processes at most 15 threads per project path.
- Existing imported Codex sessions are not duplicated on repeated sync.
- Imported rows are visible in Happy session lists as historical Codex sessions and are not treated as live/online agent sessions.
- The Codex app-server protocol and client method are typed together.
- Targeted tests cover the list client and sync/import mapping.
