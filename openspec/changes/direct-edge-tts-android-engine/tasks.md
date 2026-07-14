## 1. Contract and regression harness

- [x] 1.1 Add failing generator/native-contract tests for direct Edge raw-PCM
  framing, default voice validation, cancellation, and redacted diagnostics.
- [x] 1.2 Add failing settings tests proving voice selection is device-local and
  no selected-Mac or offline voice-pack control remains.
- [x] 1.3 Record the final REQ-to-code-to-verification matrix in the external
  completion contract and pass its ready gate.

## 2. Android direct Edge implementation

- [x] 2.1 Add the pinned Android WebSocket dependency and generate a native
  Edge Read Aloud client that requests raw 24 kHz PCM with bounded timeouts.
- [x] 2.2 Integrate direct Edge synthesis with the existing Android system-TTS
  callback lifecycle, fragment bound, prebuffer, cancellation, and typed error
  behavior.
- [x] 2.3 Add native device-local Edge voice persistence/validation and the
  Chinese male default without syncing it or exposing provider tokens.

## 3. Remove incompatible TTS paths

- [x] 3.1 Replace the app TTS settings UI with direct Edge voice configuration
  and remove offline-pack import/preview/performance/role controls.
- [x] 3.2 Remove Android generated local Sherpa/ZipVoice and selected-Mac
  credential/relay code, dependencies, and tests after tracing their callers.
- [x] 3.3 Remove only TTS-owned Qwen/relay types, handlers, and settings from
  Happy CLI, server, and wire packages; retain unrelated authentication and
  machine behavior.

## 4. Verification and device acceptance

- [ ] 4.1 Run focused RED/GREEN tests, typechecks, scoped diff checks, and
  OpenSpec strict validation.
- [ ] 4.2 Build a signed production Android APK and verify package identity,
  TTS manifest metadata, and signature.
- [ ] 4.3 Install the APK on the connected device and verify a direct Edge
  multi-sentence Legado reading smoke, cancellation, and offline/provider error
  behavior without changing device orientation settings.
- [ ] 4.4 Run `rv` and the structured completion-gate evidence checks; do not
  mark this change complete if the physical-device acceptance is missing.
