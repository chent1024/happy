## Why

The phone-local ZipVoice runtime overheats the target device, while the Mac-hosted
Qwen route introduces a relay hop and variable real-time generation speed that
causes delayed or missing narration. The user has chosen a single direct online
provider: Microsoft Edge Read Aloud voices from the Android Happy system TTS
engine.

## What Changes

- Add a phone-direct Edge Read Aloud synthesis client to Happy's Android
  `TextToSpeechService`, with a Chinese male Edge voice as the default.
- Stream and decode the provider's audio on the phone into Android PCM callback
  frames with bounded text, cancellation, timeout, and typed network/provider
  failures.
- Add a device-local Happy setting for the selected Edge voice and speaking
  speed; no Happy account token, provider API key, machine selection, or Mac is
  required for this route.
- **BREAKING** Remove Happy's Android offline voice-pack import/runtime/UI and
  the Mac Qwen remote-narration UI/configuration. The system TTS engine has no
  offline or Mac fallback after this change.
- Keep novel text transient: it is sent only to Edge during synthesis and is
  not written to Happy Server, a daemon, device logs, or an audio cache.

## Capabilities

### New Capabilities

- `android-direct-edge-tts`: Direct, bounded Edge Read Aloud synthesis and
  Android system-TTS playback without a Happy backend or additional login.

### Modified Capabilities

- `android-local-multirole-tts`: Replace the offline voice-pack system-TTS
  requirement with the direct online Edge engine selected by the user.
- `authenticated-machine-tts-service`: Remove the selected-machine relay as a
  Happy Android system-TTS synthesis path.
- `authenticated-streaming-qwen3-tts`: Retire Qwen/Mac narration from the
  Android system-TTS path.

## Impact

- `packages/happy-app`: Android config plugin/native TTS service, device-local
  settings, TTS settings UI, tests, and Android dependencies.
- `packages/happy-cli`, `packages/happy-server`, and `packages/happy-wire`:
  remove the TTS-specific machine/relay/provider code only where it is owned by
  Happy narration; ordinary Happy authentication and machine RPC remain intact.
- Existing imported local voice packs and current Mac Qwen runtime are no
  longer selectable by Happy. This change does not delete user files or models
  from the device or Mac.
