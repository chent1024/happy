## Context

Happy already exposes an Android `TextToSpeechService`, but its experimental
implementation relays text to a paired daemon and desktop-local Qwen model. That
path is being removed: it is neither phone-local nor reliable enough for the
target use case. The target device is a Xiaomi K50 Ultra with 12 GB RAM and a
Snapdragon 8+ Gen 1: it can run one modest VITS-class model, but battery and
thermal behavior must be measured rather than inferred from desktop synthesis.

## Goals / Non-Goals

**Goals:**

- Expose an Android system TTS mode that synthesizes Chinese narration without a
  network connection, Happy server, daemon, or a second credential after a pack
  has been imported.
- Import only a Happy-defined, hash-verified local voice pack
  into Android app-private storage.
- Select one user-chosen catalog voice for all narration, with recommended
  narrator fallback only when the selection is invalid.
- Keep one model worker, a bounded 220 ms initial PCM prebuffer, and a local
  eco/balanced/turbo profile suitable for long novel listening on the target
  device.
- Remove all experimental remote TTS execution and make the local provider the
  sole Happy system-TTS mode.

**Non-Goals:**

- MultiTTS package compatibility, reverse engineering, extracting vendor voice
  assets, cloud download, or public Happy voice-pack distribution.
- Automatic book-wide character discovery, LLM role inference, cloud download,
  background music, or iOS support.
- Claiming that a multi-speaker pack has expressive/emotional quality before the
  target-device listening benchmark accepts it.

## Decisions

### 1. Device-local provider state is isolated from remote TTS configuration

`OfflineVoicePackSettings` lives in Android app-private preferences and contains
only a pack ID/version, selected narrator speaker ID, optional role bindings,
and safe playback settings. Pack files live in app-private
files. The setting is never uploaded through machine metadata because another
device cannot use this phone's imported assets.

Alternative considered: retain a remote fallback. Rejected because user evidence
shows it is not usable, it keeps a second audio execution path alive, and it
contradicts a strictly phone-local mode.

### 2. Happy voice packs use a strict zip manifest, never a third-party format

An import archive contains a root `manifest.json`, a declared engine format,
model assets, a bounded speaker catalog, and a
SHA-256 digest for every declared asset. Android imports via the Storage Access
Framework into a temporary directory, rejects duplicate/archive-traversal/
undeclared/oversized assets, verifies hashes, then atomically promotes the
directory. Imported YAML, executable files, arbitrary JNI libraries, and
network URLs are never executed.

Alternative considered: accept MultiTTS-compatible YAML packages. Rejected: the
format, binary engines, and voice licenses are not a public Happy contract and
would make imported content unreviewable.

### 3. Use one pinned on-device Sherpa runtime and one loaded model worker

The Android native layer owns a pinned Sherpa-ONNX runtime behind a small
`OfflineSynthesisEngine` interface. It supports the VITS pack format
and a ZipVoice pack format that uses a per-role reference WAV plus exact
reference transcript through the same single worker. Only one selected pack
model is loaded at a time. Pack download/import happens while connected, but
all synthesis is offline after import.

Alternative considered: ship Qwen 0.6B or invoke the desktop sidecar. Rejected
because sustained phone thermal/power behavior is the primary constraint and
desktop routing is not phone-local.

### 4. Selected-voice resolution runs in Kotlin at the system-service boundary

Android can launch `TextToSpeechService` with no React Native runtime. The
native service therefore resolves only the selected narrator speaker from its
device-local settings. It validates that speaker against the imported pack
catalog; missing or invalid selections fall back to the recommended narrator.
Legacy role bindings remain parseable for old settings but never affect routing.
The Android service streams PCM through `SynthesisCallback` with one terminal
callback and cancels its local worker on `onStop`.

Alternative considered: retain character/dialogue rules. Rejected because the
user requested a single voice and text-based character detection adds complexity
without improving single-voice narration.

### 5. ZipVoice packs require bounded reference audio and transcripts

A ZipVoice manifest declares one bounded PCM WAV asset and exact transcript for
every speaker. Happy validates the manifest, hashes, WAV format and reference
presence locally. Happy never bundles, hosts, auto-downloads, or publishes a
ZipVoice model or reference recording; the pack is imported only from the
user's local device.

### 6. Target-device performance gates decide whether a pack can become default

A pack is `ready` only after manifest validation and a local short synthesis.
The K50 Ultra spike records no text/audio, only bounded timing/resource outcome:
first audible PCM, real-time factor, terminal error code, and process memory.
The intended acceptance targets are warm first audio under 800 ms, cold first
audio under 2 s, generation at least as fast as 1x playback, and no skipped
sentence during a 30-minute continuous-reading run. Battery and temperature are
reported as device observations, not hard-coded claims.

The default K50 performance profile uses three Sherpa CPU threads; the user may
choose two-thread eco or four-thread turbo. Battery Saver and severe Android
thermal state force eco before the one model worker is loaded. The service keeps
at most 220 ms of initial PCM before callback output and drops unplayed data on
stop/output failure. Battery and thermal observations remain an acceptance
requirement rather than a claim.

## Risks / Trade-offs

- [A multi-speaker model sounds flat or lacks the desired male narrator] → keep
  it an importable candidate, require target-device listening acceptance, and do
  not market it as expressive before that evidence exists.
- [Reference recording is malformed] → reject missing, non-PCM, oversized, or
  transcript-less WAV assets before activation.
- [Malicious or corrupt zip consumes storage] → cap archive/asset counts and
  sizes, stream hash validation, app-private temporary extraction, and atomic
  cleanup on failure.
- [Long narration heats the phone] → one worker/model, bounded text chunks,
  a 2/3/4-thread profile with thermal/power override, bounded first-audio
  prebuffer, foreground playback-aware work, and measured K50 limits.
- [Native process dies or model is unavailable] → typed local error, no network
  fallback, and no replay after PCM.
- [Duplicated Kotlin/TypeScript role behavior drifts] → use shared fixtures and
  identical rule precedence tests at both boundaries.

## Migration Plan

1. Remove remote TTS HTTP/socket/daemon/provider/configuration code and its
   remote-only UI state while retaining reusable Android service and role rules.
2. Add isolated local settings and disabled-by-default offline pack UI.
3. Ship runtime code without a bundled model; users may import a local candidate
   pack for the device spike.
4. Import and test one Chinese multi-speaker candidate pack on the K50 Ultra.
5. Enable local mode only after the pack passes the documented device smoke.
6. Roll back by disabling local TTS or deleting the local pack/settings; no
   remote Qwen service is restored automatically.

## Open Questions

- The AISHELL-3 candidate remains a locally imported acceptance candidate. It
  MUST NOT be bundled into the APK or published from Happy.
- Does the selected model meet the user's expressive male-narrator standard on
  the K50 Ultra? The answer requires the dedicated listening spike.
