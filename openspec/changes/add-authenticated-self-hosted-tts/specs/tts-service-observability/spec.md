## ADDED Requirements

### Requirement: App displays truthful selected-machine TTS state
The Happy app SHALL display the selected machine's TTS state as disabled, offline, provider unavailable, initializing, ready, busy, or failed. It MUST NOT show ready unless the daemon has reported a successful local provider health check.

#### Scenario: Model sidecar is not installed
- **WHEN** the selected daemon reports that no supported provider is healthy
- **THEN** the app displays provider unavailable and an install/configuration diagnostic instead of a ready control

#### Scenario: Daemon disconnects
- **WHEN** the selected machine becomes offline
- **THEN** the app marks its TTS service offline and disables synthesis-dependent controls

### Requirement: TTS failures are redacted and actionable
The daemon SHALL report a typed error code and safe diagnostic category for failures. It MUST NOT synchronize plaintext narration text, reference-audio path, provider credential, or raw provider response in runtime status.

#### Scenario: Provider returns an error
- **WHEN** local provider synthesis fails
- **THEN** the app receives a redacted provider failure category with a retry/configuration action and no sensitive request data

### Requirement: TTS reliability diagnostics are redacted and bounded
The daemon SHALL expose only bounded counters and typed codes for queued requests, pre-audio retries, callback stops, and the last failure. It MUST NOT expose request text, provider responses, audio bytes, paths, or credentials in diagnostics.

#### Scenario: A request is retried before audio begins
- **WHEN** the daemon safely retries a fragment before any audio was emitted
- **THEN** the selected-machine status exposes an incremented retry counter without the fragment text

#### Scenario: Android stops a callback
- **WHEN** the Android callback reports a stop or output error
- **THEN** the service records only the typed local stop reason and cancels the in-flight relay

### Requirement: Runtime status uses existing encrypted machine state updates
The daemon SHALL publish TTS runtime state through the existing encrypted machine state update mechanism and SHALL preserve existing daemon state fields.

#### Scenario: TTS state changes while coding sessions are active
- **WHEN** a daemon updates its TTS runtime state
- **THEN** existing session, CLI availability, and daemon process status fields remain available to current Happy clients
