## 1. Contract and regression harness

- [x] 1.1 Add failing TypeScript tests for selected-machine TTS authorization, ordered start/chunk/end frames, invalid frame rejection, cancellation, and no post-audio retry.
- [x] 1.2 Add failing provider tests for MLX Qwen3 readiness, bounded FIFO behavior, PCM16 framing, pre-audio silence retry, and redacted diagnostics.
- [x] 1.3 Add failing Android generator/native contract tests for stream callback lifecycle, fragment bounds, prebuffer, ordered sequence handling, and terminal cancellation.

## 2. Current-Mac Qwen3 runtime

- [ ] 2.1 Implement daemon-owned loopback-only MLX Audio Qwen3 provider configuration, health/model readiness probe, warmup, and typed unavailable state.
- [x] 2.2 Implement one warmed worker, finite queue/cache budgets, complete bounded PCM16 fragment validation, ordered transport frames, cancellation, safe pre-audio retry, and fully buffered generation-ceiling recovery with at most two split levels.
- [x] 2.3 Register selected-machine `tts-status` and bounded streaming synthesis handlers through the existing Happy RPC path without new credentials or plaintext diagnostics.

## 3. Authenticated relay and Android system TTS

- [x] 3.1 Restore or implement authenticated server relay framing with machine ownership validation, start/chunk/end/error ordering, bounded relay buffers, and disconnect cancellation.
- [x] 3.2 Restore or implement Android native stream consumption with exact `SynthesisCallback` lifecycle, sequence validation, strong-before-soft punctuation-aware 20-character split, ten-token-per-character Qwen budget, generation-ceiling rejection, first-fragment bounded prebuffer, one-fragment lookahead, and no later fragments after cancellation/error.
- [x] 3.3 Update the Happy app TTS settings/status to select the existing paired current-Mac machine, show redacted provider readiness/diagnostics, and provide safe test synthesis without a second authentication flow.

## 4. Verification and staged migration

- [x] 4.1 Run focused RED/GREEN provider, daemon, server relay, app/native-generator, and schema regressions plus scoped typecheck and OpenSpec strict validation.
- [x] 4.2 Validate the current Mac's MLX sidecar/model with a loopback-only complete raw PCM fragment smoke; record redacted readiness and first-audio evidence.
- [ ] 4.3 Build/install the scoped Android release and perform measured continuous-reading smoke on the physical device: first audible PCM, ordered terminal stream, cancellation, unavailable provider, and no skipped sentence.
- [ ] 4.4 After and only after 4.3 passes, remove ZipVoice local import/runtime/settings and run focused regression/build/device acceptance again.
- [ ] 4.5 Run `rv`, completion-gate, scoped diff review, and record all OpenSpec verification evidence; do not mark the change complete with an unresolved physical-device condition.
