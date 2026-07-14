## Why

The experimental paired-daemon Qwen path is not usable for continuous novel
narration and cannot meet the user's reliable, low-power, no-network requirement
on a Xiaomi K50 Ultra. Happy needs a personal, app-owned offline ZipVoice mode
that can select one Chinese voice for all narration, without importing or
reverse-engineering closed third-party voice packs.

## What Changes

- Add an Android-only, fully local TTS provider that runs inside Happy's existing
  `TextToSpeechService` and returns PCM directly to Android without daemon,
  server, network, or a second credential.
- **BREAKING** Remove the experimental remote Qwen/CosyVoice provider, its
  authenticated relay routes, daemon sidecar configuration/runtime, and remote
  TTS management flows. Retain only code needed by the local Android engine.
- Add a strict Happy offline voice-pack import format with a manifest, asset
  hashes, a bounded speaker catalog, and safe app-private storage. In addition
  to VITS multi-speaker packs, support ZipVoice packs with a bounded reference
  WAV and exact transcript for each role.
- Add one selected local catalog voice for all narration; legacy character and
  dialogue rules are ignored.
- Add an on-device eco/balanced/turbo performance profile (2/3/4 CPU threads),
  force eco under Battery Saver or severe thermal state, and retain one worker
  with a bounded initial PCM prebuffer for steadier playback.
- Add app controls for importing, inspecting, selecting, deleting, and testing
  local voice packs, including truthful model-ready and failure status.

## Capabilities

### New Capabilities

- `android-offline-voice-packs`: Personal local voice-pack import, integrity validation,
  app-private storage, model lifecycle, and local-only status.
- `android-local-multirole-tts`: Android system TTS synthesis and deterministic
  multi-role routing wholly on the phone.

### Modified Capabilities

- None. The local mode owns a new device-local contract; the experimental
  authenticated-machine TTS contract is removed with its unshipped code.

## Impact

- `packages/happy-app`: Expo native plugin, generated Android Kotlin service,
  local pack import/storage, local TTS UI, encrypted configuration, and tests.
- `packages/happy-cli` and `packages/happy-server`: remove the unshipped remote
  TTS relay, Qwen/CosyVoice provider, and sidecar-specific runtime/configuration.
- Android build: a pinned on-device TTS runtime and ABI assets
  with optional ZipVoice reference-audio generation; no model weights are
  bundled or downloaded by Happy.
- `packages/happy-cli` and `packages/happy-server`: no local audio/model relay or
  inference changes; existing remote TTS remains untouched.
