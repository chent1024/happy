## Context

Happy has a signed account token, an account secret held by the app, encrypted per-machine data, and a user-scoped Socket.IO relay. The app already calls a selected machine through `machineRPC`, which encrypts request and response payloads for that machine. The daemon is the appropriate owner for a local synthesis sidecar, model cache, and generated audio cache. The hosted server is not a GPU worker and must never persist novel text, reference audio, model files, or generated audio.

Legado can use Android's system text-to-speech API. A system `TextToSpeechService` is the only safe first integration path that permits a normal Legado selection while retaining Happy's existing authorization: it runs inside Happy's Android package and does not require copying a Happy bearer token into a third-party HTTP-TTS configuration.

## Goals / Non-Goals

**Goals:**

- Let an authenticated Happy Android installation expose a system TTS engine to Legado.
- Route synthesis from that engine to one selected, paired Happy daemon through the existing encrypted machine RPC transport.
- Let the daemon own provider lifecycle, model discovery, voice/role selection, bounded synthesis, and local audio caching.
- Synchronize encrypted TTS configuration and non-sensitive runtime status through existing machine updates.
- Make every unavailable, offline, timeout, provider, cache, and fallback state observable to the app and testable.

**Non-Goals:**

- No anonymous, LAN-trusted, query-token, shared-secret, TTS-specific bearer token, or provider API key authentication.
- No Legado HTTP-TTS import URL in the first release. Giving a third-party app the current Happy bearer token would weaken the existing authorization boundary.
- No model weights, reference audio, novel text, or rendered audio stored on Happy Server.
- No cloud TTS provider, voice cloning workflow, automatic book-wide character extraction, background music, or iOS system-TTS integration in this change.
- No claim that a CosyVoice model is installed or usable unless the daemon's health probe verifies it.

## Decisions

### 1. Android system TTS is the first Legado entry point

The Happy app will register an Android `TextToSpeechService`. Legado invokes it through the Android framework after the user selects Happy in system TTS settings. The service accepts framework requests only; it does not run an unauthenticated local HTTP server.

Alternative considered: a Legado HTTP-TTS URL. Rejected for the first release because an HTTP caller needs a credential. Copying Happy's current bearer token into Legado is credential disclosure, while adding a dedicated TTS token violates the no-second-authentication constraint.

### 2. Existing Happy account and machine RPC are the only authorization path

Android system services may be launched without the React Native runtime, so they cannot depend on the JavaScript-only machine-RPC key. The Happy package therefore copies the *current existing Happy account token* into a package-private Android Keystore record when the user configures TTS, and deletes it on logout. It is never exposed through an Intent, Android TTS extras, log, UI, or Legado configuration.

The service calls an authenticated Happy-internal HTTPS relay for its selected machine. The server verifies the existing bearer token and machine ownership, then sends the bounded request to that exact paired daemon socket. The relay may transiently handle text and PCM over TLS but MUST NOT log or persist either. This is not a Legado HTTP-TTS URL and does not create a TTS-specific token, secret, account, or public daemon address.

The daemon MUST verify that the request arrives through its registered, machine-scoped RPC handler and MUST reject a request when no selected machine configuration matches itself. The handler MUST not listen on an unauthenticated HTTP port.

Alternative considered: direct daemon HTTP with Tailscale or LAN address. Rejected because network reachability does not prove a caller is the paired Happy account.

### 3. TTS configuration is encrypted machine metadata; runtime state is encrypted daemon state

`MachineMetadata` gains a versioned optional `tts` configuration. It contains the selected provider mode, selected voice profiles, role rules, cache policy, and only provider-safe identifiers. `DaemonState` gains an optional `tts` runtime block containing availability, provider/model status, active cache metrics, and a redacted last error code. Neither structure includes credentials, reference-audio paths, plaintext novel text, or generated-audio paths.

Alternative considered: a new server table and TTS REST CRUD routes. Rejected because it duplicates existing encrypted per-machine configuration synchronization and increases server-side data retention.

### 4. Provider boundary is explicit and bounded

The daemon owns a `TtsProvider` boundary with `status`, `listVoices`, and `synthesize` operations. The initial provider adapter talks only to a locally configured CosyVoice-compatible sidecar over loopback. For an Apple Silicon host, the same bounded adapter may use MLX Audio's OpenAI-compatible endpoint with the Apache-2.0 Qwen3-TTS 0.6B 8-bit CustomVoice model. It must enforce a maximum normalized text length per request, a timeout, a finite queue, and an output-size limit. MLX mode is ready only when its configured model appears in `GET /v1/models`; a listening process without a preloaded model remains unavailable.

The RPC response contains a bounded PCM/WAV result for one framework utterance. The Android engine writes PCM chunks to `SynthesisCallback`; it does not persist audio on the phone in this change. The daemon cache key includes normalized text, voice profile, role, speaking rate, and provider/model revision.

Alternative considered: install or bundle CosyVoice/model weights automatically. Rejected as a default because model size, hardware support, and runtime installation differ by host; this change must expose truthful unavailable state until the user explicitly installs a supported sidecar. This host-specific Qwen installation is an explicit operator action, remains loopback-only, and must use a permissive model license.

### 5. Role routing is deterministic and safe by default

The daemon first applies explicit user rules, then quotation-based dialogue detection, then defaults to the narrator profile. It must never infer a real person's identity, synthesize a role without a configured voice, or select a provider-native voice based only on a name. Missing role profiles fall back to narrator and report a non-fatal fallback event.

## Risks / Trade-offs

- [Native Android service must bridge existing account state] → Implement a package-private Keystore credential bridge and authenticated server-to-paired-daemon relay; verify authorization, selected-machine mismatch, and daemon-offline paths before adding provider functionality.
- [CosyVoice availability depends on the user's host hardware] → Maintain an unavailable state, health probe, install diagnostics, and no false-ready UI state.
- [RPC response size and synthesis latency] → Limit each utterance, normalize/split upstream, cache locally, enforce timeouts, and add error-path tests.
- [Long-running synthesis can hold a daemon worker] → Use a bounded queue and return a busy error instead of unbounded work.
- [Role parsing can select an unsuitable voice] → Explicit rules win; implicit parsing only selects configured profiles and always has narrator fallback.
- [Provider/model licensing or reference audio rights] → Do not bundle weights or voices; require user-provided, locally installed provider assets and show their license/source in the app setup view.

## Migration Plan

1. Add optional wire fields so existing machines and clients remain valid.
2. Add daemon TTS RPC disabled by default and unavailable until a local sidecar passes health checks.
3. Add app configuration/status UI behind the capability reported by the selected daemon.
4. Register the Android TTS service only in new Android builds; existing clients continue unaffected.
5. Roll back by disabling the machine TTS configuration or uninstalling the app update. No server migration, data backfill, credential rotation, or model deletion is required.

### 6. PCM streaming is an additive low-latency transport

The MLX sidecar can return chunked raw PCM while decoding. To avoid a first-audio
delay, Happy will add a versioned chunk stream to the existing authenticated
Android relay: a stream has a request id, strictly increasing sequence number,
sample rate, bounded PCM chunks, and one explicit terminal success or error.
The server still authorizes the existing bearer token and exact machine once at
stream creation; it neither stores nor logs chunks. The daemon preserves its
single-worker and byte/time ceilings, cancels the sidecar when the HTTP client
disconnects, and sends no chunks after terminal state. Android calls
`start()`, then `audioAvailable()` per chunk, then exactly one `done()` or
`error()` on `SynthesisCallback`.

The current one-response PCM contract remains as a compatibility fallback for
older app/daemon pairs. Streaming must be capability-negotiated; it is not safe
to enable merely by setting the sidecar's `stream` flag because existing relay
and Android response parsing buffer whole JSON payloads.

### 7. Reliability is fragment-local and output-aware

Android may submit overlapping framework requests while a local model is still
generating. The daemon retains one model worker for predictable power use, with
a finite FIFO pending queue. A request that fails before its first PCM event is
safe to retry once against the same local sidecar. Once `start` or a PCM chunk
has been emitted, retrying could repeat spoken content and is prohibited.

The Android engine calls `audioAvailable` with at most the framework-provided
maximum buffer length and checks the returned status. A stopped or failed output
is cancellation, not a recoverable provider failure: it closes the active relay
and prevents later internal text fragments from being synthesized. Local
diagnostics contain only typed counters and error codes; neither book text nor
provider payloads leave the host.

Qwen3-TTS emits 12.5 acoustic tokens per second at 24 kHz, and hitting
`max_tokens` ends generation even when the sentence has not naturally ended.
Android therefore limits an internal narration fragment to 80 characters. The
MLX adapter reserves five tokens per character, with a 120-token minimum and a
1,000-token maximum. A longest Android fragment receives 400 tokens (32
seconds / 1.536 MB PCM16); the absolute adapter maximum is 80 seconds / 3.84
MB, which remains below the daemon's 4 MiB output ceiling.
Requests below Qwen speed 0.8 are clamped to 0.8: local measurement showed a
180-character Chinese fragment at 0.5 taking about 20 seconds to first audible
PCM, which is incompatible with Android system TTS responsiveness.

Some local Qwen responses can be structurally valid PCM but effectively silent.
Before exposing its first PCM to Android, the daemon buffers at most two seconds,
but immediately releases any audibly non-silent chunk. A fully near-silent
two-second prelude is rejected as a pre-audio provider failure and its active
sidecar request is cancelled before retrying, so it cannot occupy the single
model worker ahead of that retry. This reuses the existing
one-attempt retry boundary and adds no narration/audio logging or retention.
It emits the supported 24 kHz stream-start acknowledgement after acquiring the
model worker but before provider prefill, so Android keeps the framework request
alive through the bounded retry; only an emitted audible PCM chunk makes retry
unsafe.
For Android implementations that require an audio callback as well as a start
callback, Happy emits a bounded 20 ms silent 24 kHz heartbeat every 0.75 seconds
until audible PCM begins. Heartbeats carry no narration content and do not make
the provider attempt non-retryable.
The daemon logs only a stream lifecycle event and a final typed result for local
operator diagnosis; it never logs a request id, narration text, PCM, provider
payload, path, or credential.

## Open Questions

- The first supported CosyVoice sidecar command, API version, and host hardware support must be verified on the user's selected machine before it can be marked ready.
- The Android native bridge uses the existing Happy account token only inside Happy's package-private Keystore. It MUST NOT export the token to Legado; server relay requests are authenticated, machine-owned, bounded, transient, and non-persistent.
