## ADDED Requirements

### Requirement: System TTS is the only first-release Legado entry point
The Happy Android application SHALL expose a system `TextToSpeechService` for authorized users to select in Legado. The first release MUST NOT expose a Legado HTTP-TTS URL, anonymous HTTP endpoint, TTS-specific bearer token, query credential, or shared secret.

#### Scenario: Legado selects Happy as the Android speech engine
- **WHEN** an authenticated user selects Happy in Android text-to-speech settings and starts reading in Legado
- **THEN** Android sends the utterance to Happy's system TTS service without requiring the user to copy a Happy credential into Legado

#### Scenario: A network client attempts direct synthesis
- **WHEN** a caller tries to synthesize through an unauthenticated daemon HTTP endpoint
- **THEN** no such endpoint is available in the first release

### Requirement: Synthesis reuses Happy authorization and encrypted machine RPC
The Android TTS service SHALL route a synthesis request only through the existing authenticated Happy account and selected machine. Because Android system services can run without the JavaScript encryption runtime, Happy MAY use a package-private Android Keystore record of the current existing account token and an authenticated server-to-paired-daemon relay. The service and daemon MUST NOT create, persist, or accept a TTS-specific credential, and MUST NOT expose the existing account token to Legado.

#### Scenario: Selected paired machine synthesizes an utterance
- **WHEN** the authenticated Happy TTS service requests synthesis from its selected paired machine
- **THEN** the request is delivered to that machine's registered TTS RPC handler through the existing Happy authorization path

#### Scenario: Daemon is offline
- **WHEN** the selected machine has no registered TTS RPC handler
- **THEN** the service reports synthesis failure to Android without retrying through an anonymous or alternate endpoint

#### Scenario: Machine ownership does not match
- **WHEN** a request targets a machine not paired to the authenticated Happy account
- **THEN** Happy rejects the request before it reaches a daemon

### Requirement: Daemon exposes bounded local synthesis capability
The daemon SHALL expose a machine-scoped synthesis RPC handler that accepts only bounded normalized text and provider-safe voice identifiers. It MUST enforce timeout, queue, and output-size limits and MUST return a typed unavailable, busy, timeout, provider, or success result.

#### Scenario: Provider is unavailable
- **WHEN** the local provider health check fails or no supported sidecar is configured
- **THEN** the daemon returns `provider_unavailable` and does not claim synthesis success

#### Scenario: Provider output exceeds a limit
- **WHEN** a provider produces audio larger than the configured maximum for one utterance
- **THEN** the daemon rejects the result, removes any partial cache entry, and returns a typed provider error

### Requirement: Audio and sensitive narration data remain on the selected machine
The daemon SHALL retain generated audio cache, model assets, provider paths, reference audio, and plaintext narration text locally. Happy Server MAY transiently relay bounded plaintext text and PCM between an authenticated Happy system service and its paired daemon over TLS, but MUST NOT persist or log either; configuration/status metadata remains encrypted.

#### Scenario: Successful cached synthesis
- **WHEN** the same normalized request is synthesized again on the same provider revision
- **THEN** the daemon returns the local cached result without uploading audio or narration text to Happy Server

### Requirement: Fragment synthesis is reliable without replaying spoken audio
The daemon SHALL serialize bounded overlapping synthesis requests and SHALL retry a fragment at most once only when its local provider attempt failed before emitting any audible PCM. It MUST NOT retry after an emitted audible PCM chunk, because that could replay spoken audio. The daemon MAY emit the stream start event and bounded inaudible 24 kHz PCM liveness heartbeats while the local model pre-fills or safely retries; these acknowledgements alone MUST NOT prevent the pre-audio retry. The Android engine SHALL treat framework output-stop signals as cancellation and must not continue sending later fragments for that request.

Before its first emitted PCM chunk, the daemon SHALL inspect no more than two
seconds of local PCM for a near-silent provider response, while releasing a
non-silent chunk immediately. A near-silent prelude MUST be treated as a
pre-audio provider failure, its active sidecar attempt MUST be cancelled before
retrying, and it may use the same one safe retry. The daemon MUST NOT log or
synchronize the PCM or input text used by this check.

#### Scenario: A provider fails before the first PCM chunk
- **WHEN** the local provider fails a fragment before the daemon emits a PCM `chunk`
- **THEN** the daemon makes one same-provider retry through the existing selected-machine authorization path

#### Scenario: A provider returns an all-but-silent PCM stream
- **WHEN** the first second of a local provider response has near-silent PCM
- **THEN** the daemon emits no Android audible PCM from that attempt and performs the
  same bounded pre-audio retry without retaining the PCM or narration text

#### Scenario: A provider fails after PCM begins
- **WHEN** a fragment fails after any PCM chunk was emitted
- **THEN** the daemon terminates the request with a typed error and does not replay the fragment

#### Scenario: Android stops playback
- **WHEN** Android reports `STOPPED` or `ERROR` while consuming a callback buffer
- **THEN** Happy cancels the active relay and emits no further audio or later text fragments

### Requirement: Model generation budgets preserve a complete bounded fragment
For Qwen local synthesis, Happy SHALL not use a token limit that can end a
bounded Android fragment before a natural utterance end. Android SHALL split
expressive narration at no more than 80 characters. The daemon SHALL reserve
at least five acoustic tokens per character for that fragment and cap output at
1,000 acoustic tokens so that the existing 4 MiB PCM limit remains effective.
The Qwen provider SHALL clamp a requested speed below 0.8 to 0.8, because lower
rates can delay first audible PCM beyond Android system TTS's response window.

#### Scenario: A long narration fragment is submitted
- **WHEN** Android submits its longest allowed 80-character fragment to Qwen
- **THEN** the daemon requests at least 400 generation tokens and the fragment's
  worst-case PCM output remains below the daemon's 4 MiB limit
