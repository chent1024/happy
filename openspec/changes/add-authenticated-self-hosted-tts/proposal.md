## Status

Superseded before acceptance by `add-android-offline-voice-packs`. The
experimental remote Qwen/CosyVoice execution introduced by this unarchived
change is being removed; reusable Android system-service and deterministic role
routing concepts move into the phone-local change. Do not complete or archive
this change as a shipped capability.

## Why

Happy already pairs a mobile app with a user-owned daemon and server, but it cannot provide a private, self-hosted narration service to Legado or manage the voice and role settings required for audiobook listening. The service must reuse Happy's existing paired-user and paired-machine authorization rather than creating a second token, API-key, or unauthenticated LAN trust boundary.

## What Changes

- Add an Android system TTS capability managed by the Happy daemon for Legado-compatible narration requests.
- Reuse Happy's existing account, machine pairing, encrypted machine metadata, and daemon RPC authorization for TTS configuration and service access; do not introduce a TTS-specific credential, bearer token, API key, or anonymous endpoint.
- Add shared TTS configuration and runtime-status contracts for selected host machine, voice profiles, role rules, cache policy, and model availability.
- Add app entry points for configuring and observing the selected machine's TTS service. Legado selects Happy through Android system TTS settings; no bearer token is exported to Legado.
- Define a provider boundary for a self-hosted synthesis sidecar. The first implementation must report an unavailable provider truthfully and must not claim that a model is installed, healthy, or synthesizing when it is not.
- Keep generated audio, source novel text, reference audio, and model weights on the selected machine. Happy Server synchronizes encrypted configuration and status only; it does not proxy model inference or persist narration audio.

## Capabilities

### New Capabilities

- `authenticated-machine-tts-service`: Machine-scoped synthesis capability reached by Happy's Android system TTS service through the existing Happy trust model.
- `tts-configuration-and-role-routing`: Encrypted TTS configuration, voice profiles, role-routing rules, cache behavior, and app management surfaces.
- `tts-service-observability`: Accurate model/provider, endpoint, cache, and failure status across daemon, server, and app.

### Modified Capabilities

- None.

## Impact

- `packages/happy-wire`: encrypted machine configuration and capability/status schemas.
- `packages/happy-cli`: daemon RPC, local TTS lifecycle, existing authorization validation, cache, and provider-sidecar boundary.
- `packages/happy-server`: authenticated configuration/status synchronization only.
- `packages/happy-app`: machine detail and settings entry points, TTS status, voice/role configuration, and Legado import configuration.
- New local Python/CosyVoice runtime integration is optional at installation time; it must remain outside the hosted Happy Server and must not place model weights or reference audio in the repository.
