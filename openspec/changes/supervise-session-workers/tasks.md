## 1. Daemon Worker Supervision

- [x] 1.1 Add typed session worker availability/result types for running, exited-resumable, exited-not-resumable, stale-version, unknown, resumed, and errors.
- [x] 1.2 Implement daemon-side worker classification using tracked sessions, finished sessions, persisted resume data, provider metadata, process liveness, and CLI version/bundle state.
- [x] 1.3 Add per-session in-flight ensure/resume de-duplication so concurrent ensure calls cannot spawn duplicate workers.
- [x] 1.4 Implement daemon ensure-live orchestration that returns running for live workers, resumes resumable workers through the existing resume path, and returns structured not-resumable reasons.

## 2. Machine RPC Contract

- [x] 2.1 Register `ensure-happy-session-live` in the machine RPC layer with structured request and response handling.
- [x] 2.2 Keep existing `spawn-happy-session` and `resume-happy-session` semantics unchanged.
- [x] 2.3 Add app-side `machineEnsureSessionLive` operation wrapper without changing existing manual resume APIs.

## 3. Mobile Send Integration

- [x] 3.1 Trigger ensure-live asynchronously from the mobile send path after the message is locally encrypted/enqueued.
- [x] 3.2 Ensure composer/local echo/outbox behavior does not wait for or roll back on ensure-live results.
- [x] 3.3 Surface or record recoverable ensure-live failure state without treating it as message send failure.

## 4. Upgrade Safety

- [x] 4.1 Preserve current daemon bundle replacement restart behavior for the daemon itself.
- [x] 4.2 Avoid killing active session workers solely because they are stale-version.
- [x] 4.3 Ensure resumed workers use the current CLI launch path.

## 5. Tests and Review

- [x] 5.1 Add daemon tests for worker classification and ensure-live running/resumed/not-resumable behavior.
- [x] 5.2 Add machine RPC tests for `ensure-happy-session-live` routing and response mapping.
- [x] 5.3 Add app sync tests proving mobile send remains non-blocking while ensure-live is triggered.
- [x] 5.4 Run targeted happy-cli and happy-app tests plus typecheck for touched packages.
- [x] 5.5 Perform a self-review against proposal/design/spec to confirm no protocol changes, no direct transport replacement, and no active-worker force kill.
