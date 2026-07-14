## ADDED Requirements

### Requirement: Happy directly synthesizes through Edge Read Aloud on Android
Happy's Android `TextToSpeechService` SHALL submit each non-empty supported
Chinese request directly from the device to Edge Read Aloud and return 24 kHz,
mono, signed-16-bit PCM to Android's `SynthesisCallback`. It MUST NOT require a
Happy server, daemon, selected machine, Happy bearer token, provider API key, or
an unauthenticated local HTTP listener.

#### Scenario: Legado reads with Happy selected
- **WHEN** Legado selects Happy as the Android speech engine and requests a
  supported Chinese sentence while the device has working Internet access
- **THEN** Happy streams valid PCM to the Android callback and completes the
  utterance without contacting a Mac or Happy backend

#### Scenario: Device is offline or Edge is unavailable
- **WHEN** a direct Edge request cannot connect, emits no valid audio before
  its timeout, or terminates with a provider error
- **THEN** Happy terminates the one framework utterance with an Android
  synthesis error and MUST NOT try a local model or Mac route

### Requirement: Direct Edge transport is bounded and cancellable
Happy SHALL split long requests at punctuation into fragments of at most 80
characters, process one framework utterance at a time, use finite connection,
first-audio, and stream timeouts, and close the active socket when Android
cancels the utterance. It SHALL accept only valid raw 24 kHz mono PCM Edge audio
frames and SHALL emit exactly one callback terminal result.

#### Scenario: Android cancels during Edge synthesis
- **WHEN** Android calls `onStop` before the Edge stream terminates
- **THEN** Happy closes the active socket, writes no later audio, and does not
  emit a second terminal callback result

#### Scenario: Edge sends an invalid audio frame
- **WHEN** an Edge response has an unexpected path, unsupported content type,
  invalid sample format, or an odd-sized PCM payload
- **THEN** Happy rejects the stream before replaying or corrupting narration
  and returns one synthesis error

### Requirement: Book content remains transient and redacted
Happy SHALL send only the fragment required for active synthesis to Edge. It
MUST NOT persist request text, synthesized audio, protocol tokens, or provider
response payloads to Happy Server, daemon, local caches, settings, or logs.

#### Scenario: Direct synthesis diagnostic is emitted
- **WHEN** the native service records a connection, terminal, or error
  diagnostic
- **THEN** the diagnostic contains only bounded state, counts, or error class
  and contains no request text, PCM data, protocol token, or account credential

### Requirement: User selects a supported direct Edge voice locally
Happy SHALL expose a device-local Edge voice selection for Chinese male voices,
defaulting to `zh-CN-YunxiNeural`. The native service SHALL validate the stored
value against its supported list and use the default for missing or stale values.

#### Scenario: User chooses an Edge narrator voice
- **WHEN** the user selects a supported Edge voice in Happy's Android TTS
  settings
- **THEN** the next system-TTS utterance uses that voice and no account or Mac
  selection is requested

#### Scenario: Stored voice is no longer supported
- **WHEN** the native service reads a missing or invalid stored Edge voice
- **THEN** it uses `zh-CN-YunxiNeural` without failing or sending the invalid
  identifier to Edge
