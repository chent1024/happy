## 1. OpenSpec

- [x] 1.1 Record proposal, design, tasks, and spec delta.
- [x] 1.2 Validate the change strictly.

## 2. Codex App-Server Client

- [x] 2.1 Add minimal typed `ThreadListParams`, `ThreadListResponse`, and thread fields needed by Happy.
- [x] 2.2 Add `CodexAppServerClient.listThreads`.
- [x] 2.3 Add targeted client test coverage.

## 3. Daemon RPC

- [x] 3.1 Add a machine RPC for listing local Codex threads.
- [x] 3.2 Apply manual sync defaults: latest 200, non-archived, updated descending.
- [x] 3.3 Add targeted RPC test coverage or a focused lower-level equivalent.

## 4. App Manual Sync

- [x] 4.1 Add app-side sync operation and metadata mapping.
- [x] 4.2 Add manual sync button scoped to a machine.
- [x] 4.3 Make repeated sync idempotent for existing imported Codex sessions.
- [x] 4.4 Limit app-side processing to the 15 most recently updated threads per project path.
- [x] 4.5 Show a concise success/failure result.
- [x] 4.6 Keep imported Codex sessions visible in the project-group list without marking them as live.

## 5. Review And Verify

- [x] 5.1 Run targeted tests/type checks.
- [x] 5.2 Self-review diff against proposal boundaries.
- [x] 5.3 Fix issues found during review.
