## ADDED Requirements

### Requirement: Daemon classifies session worker availability
The daemon SHALL classify a Happy session worker using tracked process state, persisted session resume data, provider resume metadata, and current CLI version information.

#### Scenario: Running worker is classified as running
- **WHEN** a session is tracked by the daemon with a live process ID
- **THEN** the daemon reports the worker state as `running`

#### Scenario: Exited worker with resume data is classified as resumable
- **WHEN** a session worker has exited and the daemon has stored encryption data plus provider resume metadata for the same session
- **THEN** the daemon reports the worker state as `exited-resumable`

#### Scenario: Missing resume data is classified as not resumable
- **WHEN** a session worker has exited but is missing encryption data or provider resume metadata
- **THEN** the daemon reports the worker state as `exited-not-resumable` with a structured reason

#### Scenario: Unknown session is classified as unknown
- **WHEN** the daemon has no tracked or persisted record for a requested session
- **THEN** the daemon reports the worker state as `unknown`

### Requirement: Daemon ensures a session has a live worker
The daemon SHALL expose a machine RPC that ensures a session has a live worker without creating duplicate workers for sessions that are already running.

#### Scenario: Already running session is not resumed
- **WHEN** the ensure-live RPC is called for a session with a live worker process
- **THEN** the daemon returns `running` and does not spawn a replacement worker

#### Scenario: Resumable session is resumed
- **WHEN** the ensure-live RPC is called for a session classified as `exited-resumable`
- **THEN** the daemon resumes the session through the existing resume launch path and returns `resumed` on success

#### Scenario: Non-resumable session returns a structured failure
- **WHEN** the ensure-live RPC is called for a session classified as `exited-not-resumable` or `unknown`
- **THEN** the daemon returns `not-resumable` with a reason instead of throwing an unstructured error

#### Scenario: Concurrent ensure calls do not spawn duplicate workers
- **WHEN** multiple ensure-live RPC calls target the same resumable session concurrently
- **THEN** the daemon performs at most one resume attempt and all callers receive a consistent result

### Requirement: Mobile send remains non-blocking
The mobile app SHALL preserve existing optimistic send behavior while triggering session worker liveness checks asynchronously.

#### Scenario: User message is enqueued before liveness check completes
- **WHEN** the user sends a message from the mobile composer
- **THEN** the app enqueues and locally applies the encrypted message without waiting for the ensure-live RPC to complete

#### Scenario: Successful automatic resume processes queued message
- **WHEN** a sent message targets a resumable session without a live worker
- **THEN** the app triggers ensure-live and the daemon resumes the worker so it can consume the queued message

#### Scenario: Failed automatic resume surfaces a recoverable warning
- **WHEN** ensure-live returns a non-resumable or error result after a mobile send
- **THEN** the app preserves the sent message and surfaces a recoverable warning rather than clearing or rolling back the message

### Requirement: CLI upgrades do not interrupt active workers
The daemon SHALL avoid killing active session workers solely because the daemon or CLI bundle has been updated.

#### Scenario: Active stale worker is not force-killed
- **WHEN** the daemon detects that the CLI bundle has been replaced while a session worker is still running
- **THEN** the daemon keeps the worker running and does not terminate it solely for upgrade synchronization

#### Scenario: Future resume uses current CLI
- **WHEN** a stale or exited session is later resumed
- **THEN** the daemon launches the worker through the current CLI entrypoint
