# Verification evidence

Executed locally on 2026-07-12:

| Command | Result |
|---|---|
| `openspec validate add-authenticated-self-hosted-tts --strict` | Passed |
| `corepack pnpm --filter @slopus/happy-wire test` | Passed: 23 tests |
| `corepack pnpm --filter happy exec vitest run --project unit src/api/apiMachine.test.ts src/tts/TtsManager.test.ts src/tts/CosyVoiceProvider.test.ts` | Passed: 13 tests |
| `corepack pnpm --filter happy typecheck` | Passed |
| `corepack pnpm --filter happy-server-self-host test` | Passed: 98 tests |
| `corepack pnpm --filter happy-server-self-host typecheck` | Passed |
| `corepack pnpm --filter happy-app exec vitest run sources/sync/apiTypes.spec.ts sources/tts/ttsStatus.test.ts sources/tts/ttsConfiguration.test.ts` | Passed: 15 tests |
| `corepack pnpm --filter happy-app typecheck` | Passed |
| `corepack pnpm --filter happy-app exec expo prebuild --platform android --no-install` | Passed; generated manifest declares `HappyTextToSpeechService` with bind permission |
| `NODE_ENV=development ./gradlew :app:compileDebugKotlin --console=plain` | Passed; generated Kotlin system service and Keystore bridge compile |
| `APP_ENV=development NODE_ENV=development ./gradlew generateCodegenArtifactsFromSchema :app:assembleDebug --console=plain` | Passed after regenerating React Native codegen; produced debug APK |
| `aapt dump badging/xmltree app-debug.apk` | Verified final package `com.slopus.happy.dev`, `HappyTextToSpeechService`, bind permission, and TTS metadata |
| `APP_ENV=production NODE_ENV=production ./gradlew generateCodegenArtifactsFromSchema :app:assembleRelease --console=plain` | Passed; produced the production-variant APK (`78,888,429` bytes) |
| `aapt` / `apksigner verify --print-certs app-release.apk` | Verified package `com.ex3ndr.happy` version `1.7.0` (`1783836941`), TTS service/metadata, and a valid v2 signature |
| `mlx-audio` loopback sidecar with `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16` | Installed in `~/.happy/tts-runtime`, preloaded via a user LaunchAgent on `127.0.0.1:8876`; `/v1/models` returned the configured model |
| Local Qwen smoke (`Uncle_Fu`, Chinese male narrator instruction, PCM) | Passed: generated 983,084 bytes at 24 kHz with mean absolute PCM amplitude 383 and peak 22,248; model and sidecar received no provider credential |
| `corepack pnpm --filter happy exec vitest run --project unit src/tts/CosyVoiceProvider.test.ts src/persistence.test.ts` | Passed: 11 tests, including model-loaded health gating, bounded MLX request, and strict local sidecar config |
| `APP_ENV=production NODE_ENV=production ./gradlew generateCodegenArtifactsFromSchema :app:compileReleaseKotlin --console=plain` | Passed after reducing Android framework utterance chunks from 1,000 to 250 characters to fit the 4 MiB PCM boundary |
| `corepack pnpm --filter @slopus/happy-wire test` | Passed: 24 tests, including bounded stream event schema validation |
| `corepack pnpm --filter happy-server-self-host test` | Passed: 102 tests, including ordered stream relay and authenticated NDJSON route coverage |
| `corepack pnpm --filter happy exec vitest run --project unit src/api/apiMachine.test.ts src/tts/TtsManager.test.ts src/tts/CosyVoiceProvider.test.ts` | Passed: 17 tests; covers MLX chunk forwarding, bounded daemon chunks, exact stream cancellation, and no end event after cancellation |
| `corepack pnpm --filter happy-server-self-host typecheck` / `corepack pnpm --filter happy typecheck` | Passed |
| `corepack pnpm --filter happy-app exec vitest run sources/sync/apiTypes.spec.ts sources/tts/ttsStatus.test.ts sources/tts/ttsConfiguration.test.ts` / `corepack pnpm --filter happy-app typecheck` | Passed: 15 tests and TypeScript check |
| Direct MLX stream smoke on `127.0.0.1:8876` | Passed: 17 raw PCM chunks of about 96 KB arrived at roughly one-second intervals; 1,474,560 bytes total, proving sidecar chunking is not a buffered unary response |
| `corepack pnpm --filter happy cli:install` / `happy status --json` | Passed; rebuilt, relinked, and restarted daemon PID `63508` with the current stream handler |
| `APP_ENV=production NODE_ENV=production ./gradlew :app:assembleRelease --console=plain` | Passed; rebuilt production APK with stream reading and `onStop()` connection cancellation |
| `aapt` / `apksigner verify --verbose --print-certs app-release.apk` | Verified current package `com.ex3ndr.happy`, version code `1783840983`, declared TTS service and bind permission, valid v2 signature |
| Encrypted selected-machine TTS configuration | Saved through the existing account-authenticated machine metadata channel: narrator `Uncle_Fu`, 512 entries, 256 MiB cache; no TTS credential was created |
| Authenticated local relay smoke: `POST /v1/machines/<selected>/tts/stream` | Passed after server/daemon reload: HTTP 200, `start + 11 chunks + end`, 24 kHz PCM, first relay audio at 1.234 s; request used only the current Happy bearer token and exact paired machine |
| Stream rejection and timeout regression | Passed: server awaits daemon acceptance and returns typed `configuration_invalid` on rejection; daemon aborts a stalled sidecar after 60 seconds with typed `timeout` |
| Current runtime relay smoke after reload | Passed: daemon rebuilt/restarted and server restarted from current source; HTTP 200, `start + 11 chunks + end`, 24 kHz PCM, first relay audio at 1.250 s |
| `APP_ENV=development NODE_ENV=development expo prebuild` then `:app:assembleDebug` | Passed; regenerated the actual development native variant, avoiding a production package reused from stale prebuild output |
| `aapt dump ... app-debug.apk` | Verified current development APK `com.slopus.happy.dev` version `1783841839`, with `HappyTextToSpeechService` and `BIND_TEXT_TO_SPEECH_ENGINE` |
| `sources/auth/logout.test.ts` | Passed: logout clears the package-private Android TTS credential record before deleting the normal Happy credentials |
| `sources/sync/nativeUpdateManifest.test.ts` / app typecheck | Passed: an HTTPS Happy server now derives an HTTPS `latest.json` endpoint; HTTP/LAN URLs retain HTTP |
| `APP_ENV=production NODE_ENV=production expo prebuild` then `:app:assembleRelease` | Passed: regenerated release APK `com.ex3ndr.happy` version code `1783842752` containing the HTTPS update-client fix |
| `pnpm android:update-server -- --apk .../app-release.apk` | Passed: copied the final APK to `/tmp/happy-apk`, listens only on `127.0.0.1:8766`, and reuses the pre-existing tailnet-only HTTPS proxy without changing Tailscale state |
| HTTPS update smoke | Passed: `https://chent.taile37c91.ts.net:8766/latest.json` returns matching version/code/hash source and range request of APK returns ZIP magic `504b0304` |
| Final release artifact inspection | Passed: 78,889,445-byte APK, SHA-256 `1d35426f4cc6dd00cfbb52fa1f519f0bb3bf5f5c0ecb870b8e8d3a7f8eb30ad2`, matching served copy, valid v2 signature, and final manifest retains the TTS service/bind permission |
| `sources/plugins/withAndroidSystemTts.spec.ts` | Passed: TTS plugin idempotently adds the Android 11 TTS package query, service metadata, and `android.intent.category.DEFAULT` required by default-only service discovery |
| `APP_ENV=production NODE_ENV=production expo prebuild` then `:app:assembleRelease` | Passed after Android discovery repair; final APK is `com.ex3ndr.happy` version code `1783844969` |
| Final discovery-repair APK inspection | Passed: service declares `TTS_SERVICE`, `DEFAULT`, `android.speech.tts` metadata, valid v2 signature, matching served SHA-256 `ec632d240c94c6c988d7e408b3e5aac5677a558fe9666cd6313a7d891101c72d`, and HTTPS range response starts with `504b0304` |
| Current authenticated relay smoke after BF16 switch | Passed: HTTP 200, `start + 8 chunks + end`, 24 kHz PCM, 368,640 bytes, mean absolute amplitude 2,518 and peak 32,768; proves the selected daemon and relay no longer emit the previously near-silent waveform |
| `sources/plugins/withAndroidSystemTts.spec.ts` / app typecheck | Passed: generated system service keeps `onSynthesizeText` on Android's synthesis thread until one terminal `done()` or `error()`, rather than returning before callback completion |
| `CosyVoiceProvider` PCM16 framing regressions | Passed: malformed network chunks are reassembled on two-byte PCM16 boundaries; a stream ending with one dangling byte fails as a provider error instead of emitting corrupt audio |
| Real authenticated relay after daemon restart | Passed: previous stream had 8/8 odd-sized PCM chunks; after the framing repair it returned 8 chunks, 368,640 total bytes, and 0 odd-sized chunks |
| `APP_ENV=production NODE_ENV=production expo prebuild --clean` + `:app:assembleRelease` | Passed: regenerated native service omits `executor.execute`, keeps the terminal callback inside `onSynthesizeText`, and built `com.ex3ndr.happy` version code `1783847394` |
| Final framing-repair APK / HTTPS update manifest | Passed: 78,889,541 bytes, SHA-256 `49d558ae0d8efaca340f467f81f4b0bfc518ae7d3834b4123472f86efa01b36c`, valid v2 signature; `https://chent.taile37c91.ts.net:8766/latest.json` serves matching version code and artifact |
| Bounded FIFO queue regressions | Passed: an overlapping request waits for the existing single worker; only requests beyond the pending bound return `queue_full` |
| Real authenticated concurrent relay smoke after daemon restart | Passed: two simultaneous requests both returned `start + 8 chunks + end`; first completed in 6.161 s and queued second in 11.529 s, with no error event |
| Reliability TDD: `src/tts.test.ts`, `TtsManager.test.ts`, `CosyVoiceProvider.test.ts` | Passed: 6 wire tests and 16 daemon tests; one retry occurs only before first PCM, later failure is not replayed, diagnostics remain bounded and redacted |
| Server and app regressions | Passed: 103 server tests; 14 app tests cover Chinese status text, TTS configuration compatibility, and native callback source contract |
| `happy cli:install` / `happy services status --json` | Passed: rebuilt and restarted daemon with the reliability queue/retry/runtime-status implementation; self-host service and daemon are listening |
| Final reliable-TTS Chinese APK / update source | Passed: production APK version code `1783849613`, 78,889,177 bytes, SHA-256 `2f37c1ff98a620a1e6904c224a8080435a2105114b45c5ef982623a5d30ae831`, valid v2 signature; HTTPS manifest and range probe match the served artifact |
| Qwen token-cap reproduction | Confirmed: a `你好` request with the previous `max_tokens=96` produced exactly 368,640 bytes / 7.68 seconds at 24 kHz, which is precisely 96 × 1,920 samples. The MLX decoder therefore stops at the requested token cap rather than proving a natural utterance end. |
| Token-cap regression tests | Passed: `CosyVoiceProvider.test.ts` (8 tests) verifies that an Android-maximum 180-character fragment receives 900 Qwen tokens; `withAndroidSystemTts.spec.ts` (2 tests) verifies native 180-character splitting. |
| Current daemon activation | Passed: `corepack pnpm --filter happy cli:install`, then `happy status --json`, rebuilt and restarted daemon PID `27496` on `127.0.0.1:55284` with the 1,000-token provider ceiling. |
| Current release APK / update source | Passed: clean production prebuild and `:app:assembleRelease`; package `com.ex3ndr.happy` version code `1783851332`, 78,889,177 bytes, SHA-256 `c6335a0dd1056a6a54c02e04697c4784c54262b37d4b9bf5878c8fd06609c816`, valid v2 signature. The served copy has the same SHA-256, HTTPS range response starts `504b0304`, and `latest.json` build date is `2026-07-12T18:15:31+08:00`. |
| Intermittent-silence reproduction | Confirmed on the configured BF16 sidecar without book text: one valid 9.6-second PCM response had all 20 half-second RMS windows at 1–2, while three subsequent responses had mean absolute PCM amplitudes 160, 216, and 170. The relay previously treated the silent response as success, which can manifest as a skipped sentence. |
| Silent-prelude TDD | Passed: 18 focused daemon/provider tests. The new regression proves a 48 KB all-zero first PCM buffer emits no Android callback, retries once before audio, and preserves redacted retry diagnostics; a post-callback error still does not replay audio. |
| Current daemon activation and authenticated relay smoke | Passed: `cli:install` restarted daemon PID `75869` on `127.0.0.1:57129`. A synthetic authenticated stream to the selected machine returned HTTP 200, two PCM chunks, first audio at 1.380 s, explicit `end`, and no error. No book text or PCM was recorded. |
| Live-device diagnostic during missing-audio report | Confirmed: encrypted runtime diagnostics changed to `preAudioRetries=1`, proving the user request reached the current daemon and its first provider prelude was rejected as near-silent. The later `machine_offline` result was the Android client disconnecting before retry audio, not daemon unavailability. |
| Faster silent-prelude retry | Passed: focused 18-test daemon/provider suite, CLI typecheck, strict OpenSpec validation, and daemon restart PID `93203` on `127.0.0.1:57791`. MLX stream interval is 0.5 seconds and silence is decided at 0.75 seconds. A post-restart synthetic authenticated relay returned HTTP 200, 3 chunks, first audio at 0.913 s, explicit `end`, and no error. |
| Current daemon lifecycle monitor | Passed: focused tests/typecheck/OpenSpec validation then daemon restart PID `99591` on `127.0.0.1:58013`. A current authenticated relay produced `TTS stream received` and `TTS stream completed: success` daemon logs, HTTP 200, 19 chunks, first audio at 0.872 s, and explicit `end`; no narration text, PCM, request id, or credential was logged. |
| Android liveness acknowledgement | Passed: 19 focused daemon/provider tests, CLI typecheck, strict OpenSpec validation, then daemon restart PID `9603` on `127.0.0.1:58457`. A current authenticated relay produced stream `start` at 64 ms, first PCM at 885 ms, 19 chunks, HTTP 200, explicit `end`, and no error. The start event is intentionally independent of first PCM so Android does not cancel model prefill or a silent-prelude retry. |
| Android audio-callback liveness | Passed: 19 focused daemon/provider tests, CLI typecheck, strict OpenSpec validation, then daemon restart PID `16958` on `127.0.0.1:58830`. A current authenticated relay emitted `start` and a silent heartbeat PCM chunk at 58 ms, first audible PCM at 889 ms, 21 chunks, HTTP 200, explicit `end`, and no error. Heartbeat PCM is local zero-valued audio only and does not inhibit a silent-prelude retry. |
| Qwen low-rate clamp | Passed: 20 focused daemon/provider tests, CLI typecheck, strict OpenSpec validation, then daemon restart PID `34397` on `127.0.0.1:59320`. A rate-0.5 authenticated relay logged its redacted locale/rate, emitted start at 51 ms, and produced first audible PCM at 890 ms because the MLX request was clamped to speed 0.8; it completed successfully without logging narration text or PCM. |
| 80-character Android fragment regression | Passed: `corepack pnpm --filter happy-app exec vitest run sources/plugins/withAndroidSystemTts.spec.ts` (2 tests), `corepack pnpm --filter happy-app typecheck`, `openspec validate add-authenticated-self-hosted-tts --strict`, and `git diff --check`. The generated native service sets `maxSynthesisTextChars = 80`; its matching Qwen output budget is 400 tokens. |
| Current 80-character production update APK | Passed: clean production prebuild and `:app:assembleRelease`; package `com.ex3ndr.happy` version `1.7.0`, version code `1783854086`, 78,889,177 bytes. `apksigner verify --verbose` confirmed v2 signing; the deployed copy has matching SHA-256 `2987d0957044bdadc9ce863fe7a86f690bbec58c57d8dad0e99e744b4a80d1fc`. `https://chent.taile37c91.ts.net:8766/latest.json` reports build date `2026-07-12T19:01:25+08:00`, and its ranged APK response begins `504b0304`. |
| Streaming false-silence regression | Passed: two new TDD regressions prove that a 0.75-second silent prelude followed by audible PCM is emitted without retry, while a fully silent two-second prelude cancels its active provider attempt before the one safe retry. `corepack pnpm --filter happy exec vitest run --project unit src/tts/TtsManager.test.ts src/tts/CosyVoiceProvider.test.ts` passed 21 tests; CLI typecheck, strict OpenSpec validation, and `git diff --check` passed. |
| Current daemon activation and authenticated stream | Passed: `corepack pnpm --filter happy cli:install` rebuilt/relinked/restarted daemon PID `72936` on `127.0.0.1:61989`. A redacted fixed-text authenticated relay at requested rate 0.5 emitted stream start at 1.303 s, first audible PCM at 1.593 s, 21 chunks, terminal end, and no error in 6.511 s. No book text, PCM, credential, or request identifier was retained in diagnostics. |

The CLI unit invocation rebuilds the CLI and emits existing package-rollup
warnings about `bin` files outside `dist` and empty chunks. The command still
completed successfully.

## Not verified

- The debug APK was built but not installed; no Legado/device smoke test was
  run. The service exists, compiles, and is present in the final manifest, but
  selection/playback on a real device remains unverified.
- The release variant currently inherits `signingConfigs.debug`; its valid v2
  signature is the Android Debug certificate, not a distributable production
  release key. It must be re-signed with the intended release keystore before
  external distribution.
- `adb devices -l` reported no connected Android device. The local update server
  now uses the existing tailnet-only HTTPS mapping at port 8766; no Tailscale
  mapping was changed. Device update detection/install confirmation remains
  unverified.
- The local daemon was rebuilt, relinked, and restarted to load the persisted
  sidecar configuration. No deployment, commit, or push was run.
- End-to-end Android/Legado playback still needs a physical device, an HTTPS
  Happy server, and an enabled encrypted machine TTS configuration. The local
  sidecar readiness and synthesis proof does not replace that device test.
- A physical Android device is still required for 4.4/6.4: install version code
  `1783849613`, select Happy in Android system TTS, invoke it from
  Legado, measure first-audio latency, and verify cancellation plus
  offline/provider-error behavior. `adb devices -l` currently reports no
  device, so these tasks remain open.
- A physical continuous-reading smoke is still required for 7.8: after installing
  version code `1783854086`, read enough consecutive text in Legado to exercise
  queued fragments, verify no skipped sentence or duplicated audio, and inspect
  the Chinese reliability diagnostics without exposing book text.

Android system services cannot assume the JavaScript machine-RPC key is alive.
The implementation therefore uses the current existing Happy bearer token only
inside a package-private Android Keystore record, then calls an authenticated
server-to-paired-daemon relay. It creates no TTS-specific credential and never
exports the account token to Legado.
