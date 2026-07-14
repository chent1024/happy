## Why

The phone-local ZipVoice path overheats the user's Xiaomi K50 Ultra during
long-form narration. The prior authenticated Qwen prototype was removed before
physical acceptance because its PCM transport could stall or skip sentences.
Happy now needs a low-latency, reliable replacement that keeps inference on the
user's current Apple Silicon Mac while the phone only plays system-TTS PCM.

## What Changes

- Restore a machine-scoped Qwen3-TTS CustomVoice provider backed by the current
  Mac's loopback-only MLX Audio runtime; begin with the Chinese male
  `Eric` narrator and a 0.6B quantized model. The 0.6B CustomVoice route does
  not send an emotion instruction because the current MLX runtime can render
  that request as inaudible PCM; richer instructed narration is reserved for a
  later, separately verified 1.7B model rollout.
- Restore the existing-account, selected-machine authorization path between
  Happy Android system TTS and its paired daemon. No second login, TTS token,
  public HTTP endpoint, or anonymous LAN endpoint is introduced.
- Use bounded complete-PCM fragment buffering, ordered transport frames,
  cancellation, pre-audio retry, queueing, redacted diagnostics, provider
  readiness, generation-ceiling rejection, and punctuation-aware 20-character
  fragmentation that prefers sentence-ending punctuation and uses comma-like
  punctuation only after a useful minimum length, to make
  continuous reading observable and recoverable.
- Keep novel text, PCM, model files, provider paths, and audio cache on the
  current Mac; Happy Server relays only authenticated transient stream traffic
  and encrypted typed status/configuration.
- **BREAKING after acceptance** Remove the ZipVoice voice-pack import, local
  inference, and local-TTS settings only after a physical Android
  continuous-reading smoke validates the replacement. Until then it remains an
  inactive rollback path and is not selected by the restored remote provider.

## Capabilities

### New Capabilities

- `authenticated-streaming-qwen3-tts`: Authenticated machine-scoped Qwen3
  synthesis, MLX streaming PCM transport, Android system-TTS lifecycle, and
  bounded reliable failure semantics.
- `mac-qwen3-tts-runtime`: Loopback-only Mac MLX Audio provider lifecycle,
  model readiness, warmup, and redacted operational status.

### Modified Capabilities

- `android-offline-voice-packs`: Retire the temporary phone-local ZipVoice
  provider only after the authenticated streaming replacement passes physical
  acceptance; preserve safe rollback before that condition is met.

## Impact

- `packages/happy-cli`: daemon provider manager, model-sidecar lifecycle,
  machine RPC handlers, streaming cancellation/backpressure, and tests.
- `packages/happy-server`: reuse the authenticated machine relay; extend only
  where streaming forwarding or typed TTS state is necessary.
- `packages/happy-app`: Android native system TTS PCM consumption, encrypted
  selected-machine settings/status, and migration from the temporary local UI.
- `~/.happy/tts-runtime`: local-only MLX Audio environment/model cache and
  loopback sidecar; no model or audio is committed to the repository.
