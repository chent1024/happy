## Context

Happy's Android `TextToSpeechService` currently has two synthesis implementations:
an on-device Sherpa/ZipVoice runtime and an authenticated stream to a selected
Mac running Qwen. The device-local runtime is thermally unsuitable for long
narration, and the Qwen route adds network and real-time inference variance.

The user has explicitly accepted transmitting each requested book fragment to
Microsoft's Edge Read Aloud service and selected a direct phone route with no
offline or Mac fallback. The existing Android service already owns system-TTS
callback ordering, punctuation-aware 80-character splitting, cancellation, and
redacted diagnostics. It is the correct integration boundary because Legado
continues to see only one ordinary Android speech engine.

## Goals / Non-Goals

**Goals:**

- Directly synthesize a bounded Chinese request on Android through Edge Read
  Aloud and feed 24 kHz PCM to `SynthesisCallback` with a bounded initial
  prebuffer.
- Preserve cancellation, one-at-a-time synthesis, callback lifecycle, and no
  text/audio/credential logging.
- Provide one device-local voice choice, defaulting to `zh-CN-YunxiNeural`, and
  remove Happy's model, voice-pack, selected-Mac, and relay-specific controls.
- Remove only TTS-owned daemon/server/wire code; preserve all unrelated Happy
  account, authentication, sync, and machine features.

**Non-Goals:**

- A provider account, API key, Happy relay, public HTTP endpoint, offline
  fallback, multi-role routing, voice cloning, device audio cache, or iOS TTS.
- A promise that the unofficial Edge Read Aloud endpoint is permanently
  available; network or provider failures are reported as synthesis errors.
- Deleting imported packs or MLX model files already stored by the user. They
  are no longer read by Happy after migration.

## Decisions

### 1. Use the Edge Read Aloud WebSocket protocol from the native TTS service

The generated Kotlin service will open a TLS WebSocket directly to Edge Read
Aloud, generate its time-bound protocol token locally, request
`raw-24khz-16bit-mono-pcm`, and parse only `Path:audio` binary frames. Raw PCM
matches `SynthesisCallback` directly, avoiding an MP3 decoder, decoder startup,
and an extra audio buffer. The connection, request text, and audio bytes exist
only for one framework utterance and are cancelled from `onStop`.

An Android-native WebSocket client is added through a pinned OkHttp dependency.
`HttpURLConnection` is not used because it cannot receive the provider's
full-duplex streaming protocol. A JavaScript client is rejected because the
Android system service can start without a React Native runtime and browser APIs
cannot reliably control the WebSocket headers used by this protocol.

### 2. Keep the system-TTS contract, not the former relay contract

The service keeps 80-character punctuation-aware fragments and one synchronized
utterance at a time. For each fragment, it starts `SynthesisCallback` only after
valid PCM arrives, prebuffers up to 800 ms, and writes aligned PCM blocks until
the provider's terminal event. A provider error, malformed frame, no-audio
timeout, unexpected sample format, or cancellation stops the utterance without
retrying audio that might replay text. No Mac or offline engine is attempted.

The Edge protocol is deliberately internal to `HappyTextToSpeechService`; React
Native settings only persist the selected supported Edge voice. This prevents a
provider endpoint, protocol token, or raw request from entering sync state.

### 3. Make Edge voice choice local and bounded

The initial UI exposes a small curated Chinese male voice list and persists only
the selected voice identifier in existing device-local settings. It defaults to
`zh-CN-YunxiNeural`. The native side validates against the same allowlist and
falls back to that default for absent or stale settings. There is no dynamic
voice catalogue request and no arbitrary voice/SSML input surface.

This is simpler and safer than importing all provider voices while preserving a
clear user control. It can be expanded in a later change after physical
acceptance proves the direct transport.

### 4. Remove TTS-owned local and Mac paths atomically in source

The Android plugin no longer generates the Sherpa engine, pack store, encrypted
remote credentials, or remote HTTP stream client. The settings screen becomes
an Edge voice settings screen. TTS-specific daemon, server relay, wire schemas,
and selected-Mac settings are removed only when repository searches establish
they have no non-TTS callers. Existing model files and installed voice-pack
files are not destructively removed.

Keeping dead routes as fallback would contradict the user's “Edge only” product
decision and would leave security and test surface that no UI can configure.

## Risks / Trade-offs

- [Edge changes or blocks its Read Aloud protocol] → validate on the physical
  device, use bounded typed errors, and make no availability guarantee.
- [Network loss or captive portal] → finite connect/first-audio/overall
  timeouts, cancellation closes the socket, and the system receives one error.
- [Malformed/unsupported audio payload] → accept only `Path:audio`, content
  type `audio/raw`, 24 kHz PCM, and even-sized payloads before callback writes.
- [Protocol token clock skew] → on initial authorization failure use the
  provider response date for one bounded token regeneration; otherwise fail.
- [Removal touches broad dirty worktree] → scope all edits to current TTS-owned
  files and preserve unrelated user changes; verify with targeted searches.

## Migration Plan

1. Write failing generator/settings tests for direct Edge selection, raw-PCM
   protocol validation, cancellation, and absence of offline/Mac paths.
2. Implement the native Edge client, settings bridge/UI, and build dependency.
3. Remove TTS-only local/Mac/relay code after checking direct callers and run
   focused typechecks/tests plus strict OpenSpec validation.
4. Build and install the production Android package, select Happy in Android
   text-to-speech settings, and run a multi-sentence physical reading smoke.
5. Only after the direct phone smoke passes, stop the optional local Mac Qwen
   sidecar. If it fails, keep source at the requested Edge-only design and
   report the external provider failure rather than silently restoring a model.

## Open Questions

- Physical first-audio and continuous-reading measurements remain acceptance
  evidence, not assumptions; they must be collected from the user's device.
