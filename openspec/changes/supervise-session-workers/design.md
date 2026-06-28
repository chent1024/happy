## Context

Happy already has a long-running desktop daemon that registers a machine with Happy Server and spawns per-session Happy CLI/agent worker processes. The daemon tracks spawned workers in memory, persists session encryption data for resume, and exposes `spawn-happy-session` and `resume-happy-session` machine RPCs. Mobile sends encrypted messages through Happy Server; a live worker must be available on the desktop machine to consume those messages and drive Claude, Codex, Gemini, or OpenClaw.

The current system can preserve resume data after a worker exits, but normal mobile message sending does not automatically ensure a live worker. This creates a connected-but-not-processing failure mode.

## Goals / Non-Goals

**Goals:**
- Classify session worker availability in the daemon using existing tracked and persisted session data.
- Provide a machine RPC that ensures a session has a live worker, resuming it when the daemon can safely do so.
- Trigger the liveness check from the mobile send path without blocking local echo, outbox enqueueing, or composer behavior.
- Report structured failure reasons when a session cannot be resumed.
- Keep active workers running during CLI upgrades while ensuring future resumes use the current CLI.

**Non-Goals:**
- No changes to `happy-wire` message protocol or encrypted server message shape.
- No replacement of Happy Server with direct mobile-to-daemon transport.
- No database migration or server-side session storage redesign.
- No forced termination of active worker processes during upgrade detection.
- No broad UI redesign of the session screen.

## Decisions

1. **Add an explicit "ensure live" RPC instead of overloading spawn or resume.**

   The daemon will expose `ensure-happy-session-live` as a machine RPC. `spawn-happy-session` remains for creating a new Happy session. `resume-happy-session` remains the manual resume primitive. The ensure RPC wraps the availability check and conditional resume decision for send-path use.

   Alternatives considered:
   - Reuse `resume-happy-session` directly from send: rejected because callers need to distinguish already-running, resumed, not-resumable, and unavailable-machine states without treating all failures as manual resume failures.
   - Auto-resume inside `sendMessage`: rejected because `sync.sendMessage()` should remain responsible for local encryption/outbox behavior and should not become daemon lifecycle orchestration.

2. **Classify worker state from existing daemon data.**

   The daemon will derive worker state from `pidToTrackedSession`, `sessionIdToFinishedSession`, persisted sessions, provider resume metadata, encryption data, and process liveness. This avoids introducing a new persistent model before the behavior is proven.

   Worker states:
   - `running`: tracked PID exists and `process.kill(pid, 0)` succeeds.
   - `exited-resumable`: worker has exited but daemon has encryption data and enough provider metadata to resume.
   - `exited-not-resumable`: worker has exited but resume prerequisites are missing.
   - `stale-version`: worker was started with an older CLI bundle/version than the daemon currently owns.
   - `unknown`: daemon has no usable record for the session.

3. **Keep mobile send non-blocking.**

   The app will enqueue and locally apply the user message exactly as it does today. It will then trigger `ensure-happy-session-live` asynchronously for sessions that have machine metadata. The input box must not wait for this RPC before clearing or accepting the next message.

   If ensure fails, the app should record or surface a recoverable warning, not roll back the sent message.

4. **Do not kill active stale-version workers.**

   The daemon already detects when its CLI bundle has been replaced. This change will not terminate active workers. It will mark them stale where visible and rely on normal exit/manual stop/next resume to start a fresh worker from the current bundle.

## Risks / Trade-offs

- **Duplicate workers for the same session** -> The ensure RPC must treat a live tracked PID as authoritative and must avoid resuming when `running`.
- **Resume races from repeated sends** -> The daemon should serialize or de-duplicate ensure/resume attempts per session.
- **Messages still unprocessed if resume fails** -> The app must show a structured warning so the user knows the message is queued but no local worker is processing it.
- **Stale metadata can hide provider resume IDs** -> The daemon should reuse the existing server metadata refresh path before declaring a session not resumable.
- **Active old-version workers keep running old code** -> This is intentional to avoid killing user work; the next safe resume uses the current CLI.

## Migration Plan

1. Add daemon classification and ensure-live RPC behind existing machine RPC plumbing.
2. Add mobile operation wrapper and non-blocking send-path trigger.
3. Add targeted tests for daemon, RPC routing, and app send behavior.
4. Verify existing manual resume and spawn flows still pass.
5. No data backfill is required.
