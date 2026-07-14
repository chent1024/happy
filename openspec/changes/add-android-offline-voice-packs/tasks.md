## 1. Remove experimental remote TTS and establish device-local state

- [x] 1.1 Add failing app/native tests proving system TTS local mode has no server/daemon fallback and preserves reusable Android service lifecycle behavior.
- [x] 1.2 Remove remote Qwen/CosyVoice relay routes, daemon manager/provider/sidecar configuration, remote TTS UI state, and no-longer-used shared contracts without touching unrelated Happy functionality.
- [x] 1.3 Implement typed device-local offline pack settings, bounded catalog/settings helpers, and safe local diagnostics without model paths, text, or PCM.

## 2. Safe pack import and lifecycle

- [ ] 2.1 Add failing tests for a valid manifest, optional malformed metadata, path traversal, duplicate/undeclared assets, hash mismatch, size/count limits, and atomic rollback.
- [x] 2.2 Implement Android Storage Access Framework import into temporary app-private storage, hash verification, atomic promotion, readiness-gated activation, deletion, and bounded local status.
- [x] 2.3 Add app management UI for selecting/importing/inspecting/deleting a local pack and binding narrator/role speakers from its catalog.

## 3. Local Android synthesis runtime

- [x] 3.1 Add the pinned, Apache-2.0 Sherpa-ONNX on-device VITS runtime behind an Android `OfflineSynthesisEngine` abstraction without bundling an unreviewed model pack.
- [x] 3.2 Add failing native contract tests for one local worker, model readiness, bounded fragments, cancellation, terminal callback lifecycle, and no daemon/network fallback in local mode.
- [x] 3.3 Implement local PCM synthesis and streaming in `HappyTextToSpeechService`, exact callback cancellation, and typed unavailable/output failure behavior.
- [x] 3.4 Extend the strict local-pack contract and the single Sherpa worker for ZipVoice role reference WAVs, exact transcripts, bounded flow steps, and local streamed PCM; do not bundle or download model weights.

## 4. Deterministic multi-role routing

- [x] 4.1 Add shared role-routing fixtures for explicit rule, dialogue fallback, narrator fallback, and missing-speaker fallback.
- [x] 4.2 Implement Kotlin local role routing against the active pack catalog with explicit-rule, dialogue, then narrator precedence.
- [x] 4.3 Add app controls for narrator and role speaker selection that reject a speaker absent from the active pack.
- [x] 4.4 Replace role/dialogue routing with one selected catalog voice for all text, retaining recommended-narrator fallback and compatibility with old local settings.
- [x] 4.5 Simplify the local voice-pack UI to selectable voices only and remove character/dialogue controls.
- [x] 4.6 Raise the K50 local ZipVoice runtime from two to four CPU threads and add regression coverage for the fast-mode contract.
- [x] 4.7 Replace the fixed fast mode with a local eco/balanced/turbo profile, thermal/power override, and cancellation-safe bounded initial PCM prebuffer.

## 5. K50 Ultra acceptance and release evidence

- [x] 5.1 Produce one personal, locally importable Chinese multi-speaker test pack and record its hashes, size, and speaker catalog without bundling or publishing it. (ZipVoice INT8 personal package is recorded in `verification.md`.)
- [ ] 5.2 Build/install an Android development variant on the Xiaomi K50 Ultra and verify offline startup, import failure rollback, narrator and role playback, stop/cancel, and absence of server/daemon dependence.
- [ ] 5.3 Run a 30-minute continuous Legado reading smoke; record bounded first-audio/real-time/resource diagnostics and verify no skipped sentence or network/daemon dependency.
- [x] 5.4 Run focused tests, app typecheck, Android build, strict OpenSpec validation, final diff review, and document unverified physical-device conditions. (See `verification.md`; physical-device acceptance remains pending.)
