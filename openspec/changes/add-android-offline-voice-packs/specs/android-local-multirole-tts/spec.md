## ADDED Requirements

### Requirement: Happy can synthesize locally as an Android system TTS engine
When a ready pack exists, Happy's Android `TextToSpeechService` SHALL synthesize through the on-device runtime and return bounded PCM directly through `SynthesisCallback`. It MUST NOT require the Happy daemon, server, network, a TTS-specific credential, or an unauthenticated local HTTP listener.

#### Scenario: Legado reads with a ready offline pack
- **WHEN** Legado selects Happy as its Android TTS engine and submits Chinese
  narration while local mode has a ready pack
- **THEN** Happy produces the utterance locally and completes exactly one Android
  synthesis callback lifecycle

#### Scenario: Local pack is not ready
- **WHEN** Android requests synthesis while Happy has no ready local pack
- **THEN** Happy returns a typed local synthesis error and does not fall back to
  a network, daemon, or unknown engine

### Requirement: Experimental remote TTS execution is removed
Happy MUST NOT retain a Qwen/CosyVoice sidecar, authenticated TTS relay route,
daemon TTS RPC handler, or remote-provider fallback after this change. Reusable
Android system-service registration and deterministic role-routing behavior MAY
be retained only when they serve the local provider.

#### Scenario: Happy system TTS receives an utterance
- **WHEN** Legado invokes Happy after the remote service removal
- **THEN** no request is made to Happy Server, a paired daemon, or a desktop
  local sidecar

### Requirement: Local narration uses one selected catalog voice
Happy SHALL use the selected narrator speaker for every local narration fragment.
It MUST NOT infer characters, apply dialogue routing, or inspect narration text
for speaker selection. A selected speaker MUST exist in the active pack catalog;
otherwise Happy MUST use the recommended narrator and record only bounded
metadata without book text or PCM.

#### Scenario: Selected voice is used for all narration
- **WHEN** the user selects an installed ZipVoice catalog speaker
- **THEN** Happy synthesizes narration and quoted dialogue with that same speaker

#### Scenario: Legacy role bindings are present
- **WHEN** old local settings contain explicit character or dialogue bindings
- **THEN** Happy ignores them and continues to use the selected narrator

#### Scenario: No narrator is explicitly selected
- **WHEN** the active pack declares a recommended narrator and the user has not
  selected a valid speaker
- **THEN** Happy uses that recommended narrator before falling back to the first
  speaker in the pack catalog

### Requirement: ZipVoice packs are local and catalog-selectable
Happy SHALL synthesize a `sherpa-onnx-zipvoice` pack only after its asset hashes,
bounded eSpeak data directory, and every catalog speaker's PCM WAV/reference
transcript pass local validation. It MUST use the selected narrator's reference
audio and transcript through the same one local worker. Happy MUST NOT bundle, download,
or publish a ZipVoice model or reference recording solely from a manifest
attestation.

#### Scenario: ZipVoice selected narrator is synthesized locally
- **WHEN** a valid ZipVoice pack with selected narrator reference is active
- **THEN** Happy streams PCM from the local ZipVoice runtime using that selected
  reference WAV and transcript without daemon, server, or network access

#### Scenario: A ZipVoice manifest lacks reference material
- **WHEN** import metadata omits a role's reference WAV/transcript
- **THEN** Happy rejects the pack before activation and leaves the previous
  active pack intact

### Requirement: Local narration protects battery and playback continuity
Happy SHALL keep at most one local model worker and one loaded pack model. It MUST bound text fragment size and pending work, cancel active synthesis on Android stop/output failure, and never replay a fragment after audible PCM has been emitted.

#### Scenario: Android stops an utterance
- **WHEN** Android invokes `onStop` or a synthesis callback reports output
  failure
- **THEN** Happy cancels the local inference and emits no later PCM or queued
  fragments for that utterance

#### Scenario: Continuous reading on the target device
- **WHEN** a valid pack is used for continuous reading on the Xiaomi K50 Ultra
- **THEN** Happy records bounded timing/resource diagnostics and the acceptance
  run can verify first-audio latency, no skipped sentence, and terminal state
  without retaining narration text or audio

### Requirement: Local performance profile protects thermal headroom and continuity
Happy SHALL offer device-local `eco` (two threads), `balanced` (three threads,
the compatibility default), and `turbo` (four threads) profiles while retaining
one model worker, bounded fragments, cancellation, and offline-only synthesis.
Battery Saver or severe Android thermal status MUST force the effective worker
to two threads. The worker cache key MUST include its effective thread count.
Before `SynthesisCallback` output begins, Happy MAY retain only up to 220 ms of
PCM. It MUST flush that PCM on normal completion and discard it on stop, callback
output failure, or synthesis failure.

#### Scenario: Balanced local mode is generated
- **WHEN** Happy builds its production Android local TTS engine with no saved
  profile or with `balanced` selected
- **THEN** the one local worker uses three CPU threads and no network or daemon
  fallback

#### Scenario: Thermal or power saving protects the device
- **WHEN** Android enters Battery Saver or reports severe thermal status before
  the worker is loaded
- **THEN** Happy loads the one local worker with two CPU threads regardless of
  the saved profile

#### Scenario: Callback output is interrupted
- **WHEN** Android stops synthesis or rejects callback PCM output before normal
  completion
- **THEN** Happy discards any unplayed initial PCM and emits no later buffered audio
