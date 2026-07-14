> Superseded: pending physical-device tasks and experimental remote provider
> implementation are replaced by `add-android-offline-voice-packs`. This change
> remains as design/verification history and must not be marked complete.

## 1. Contract and shared encrypted state

- [x] 1.1 Add failing wire-schema tests for optional encrypted TTS configuration and runtime state while preserving existing machine fields.
- [x] 1.2 Add versioned TTS request/result, provider status, role-routing, and redacted error schemas to `happy-wire`.
- [x] 1.3 Extend app and daemon machine state handling to preserve optional TTS configuration/runtime fields through encrypted machine updates.
- [x] 1.4 Run focused wire and synchronization regression tests.

## 2. Daemon TTS authorization and provider boundary

- [x] 2.1 Add failing daemon tests proving `tts-synthesize` is machine-scoped, rejects unavailable providers, enforces request/output limits, and never falls back to an HTTP or secondary credential path.
- [x] 2.2 Implement the daemon TTS manager, bounded synthesis queue, cache-key construction, deterministic role routing, typed redacted errors, and machine-scoped `tts-synthesize`/`tts-status` RPC handlers.
- [x] 2.3 Implement a loopback-only CosyVoice-compatible provider adapter with health probe, timeout, and truthful unavailable status.
- [x] 2.4 Run daemon unit tests, CLI typecheck, and targeted RPC integration tests.

## 3. App configuration and machine observability

- [x] 3.1 Add failing app tests for TTS state rendering, offline/disabled controls, provider-unavailable diagnostics, and narrator fallback status.
- [x] 3.2 Add encrypted selected-machine TTS configuration operations and typed machine RPC clients.
- [x] 3.3 Add machine-detail and settings entry points for TTS status, provider setup diagnostics, narrator and quoted-dialogue voice profiles, cache policy, and safe test synthesis.
- [x] 3.4 Add multi-profile editor for explicit/regex role rules without overwriting existing rules.
- [x] 3.5 Run app unit tests and TypeScript typecheck.

## 4. Android Legado integration

- [x] 4.1 Add a failing Android/native contract test or build-time validation proving Happy declares a system `TextToSpeechService` without a public unauthenticated HTTP listener.
- [x] 4.2 Implement the Android TTS service and native bridge that uses existing authenticated Happy app state and a server-to-paired-daemon relay without exporting credentials to Legado.
- [x] 4.3 Implement PCM callback streaming, Android audio/language/error behavior, bounded utterance splitting, and daemon-offline/provider-unavailable failure propagation.
- [ ] 4.4 Build a Happy Android development variant and smoke-test Legado selection, narrator synthesis, configured-role synthesis, offline daemon, and unavailable provider paths.

## 5. Verification and documentation

- [x] 5.1 Add provider setup documentation that states supported sidecar contract, local data boundary, model/license responsibility, and no-second-authentication rule.
- [x] 5.2 Run full relevant test/typecheck/build verification; record actual commands, results, and any unverified Android/device conditions in the change artifacts.
- [x] 5.3 Re-read the final diff and OpenSpec requirements; only mark tasks complete when their listed validation evidence exists.
- [x] 5.4 On the selected local host, install and preload an approved loopback model sidecar; prove model-ready status and one PCM synthesis without exposing a second credential.

## 6. Low-latency PCM streaming

- [x] 6.1 Add failing wire and relay tests for ordered, bounded, terminal PCM chunk streams and legacy unary compatibility.
- [x] 6.2 Add daemon-side cancellation/backpressure and MLX raw PCM chunk forwarding without relaxing machine/account authorization.
- [x] 6.3 Add Android stream consumption with exact `SynthesisCallback` lifecycle semantics, disconnect cancellation, and unary fallback.
- [ ] 6.4 Run server/daemon/app tests plus a device smoke that measures first-audio latency and verifies offline/provider-error cancellation.

## 7. Reliable Android narration

- [x] 7.1 Add failing daemon and wire tests for one pre-audio retry, no retry after emitted PCM, finite pending diagnostics, and redacted runtime state.
- [x] 7.2 Implement fragment-local retry, bounded local diagnostic counters, and encrypted runtime-status propagation without plaintext narration data.
- [x] 7.3 Add failing Android native contract tests for callback maximum-buffer handling, terminal callback behavior, and stop/error cancellation.
- [x] 7.4 Implement Android callback-result handling, per-request cancellation, and fragment-loop termination without exporting credentials or adding a second auth path.
- [x] 7.5 Add a regression for model-token truncation, align Android fragment bounds with Qwen output capacity, and preserve the daemon PCM ceiling.
- [x] 7.6 Add a near-silent PCM regression and retry locally before the first Android audio callback without retaining narration data.
- [x] 7.7 Reduce Android Qwen narration fragments from 180 to 80 characters to bound model prefill and retry latency.
- [ ] 7.8 Run focused wire/daemon/app tests, production APK build, and actual Legado continuous-reading smoke; record latency and no-skip evidence.
