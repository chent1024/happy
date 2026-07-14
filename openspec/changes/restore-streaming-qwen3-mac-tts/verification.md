## 2026-07-14 current-Mac provider smoke

- The MLX sidecar listened only on `127.0.0.1:8876`.
- Model: `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`.
- Voice: `Eric`; no `instruct` field was sent for this 0.6B CustomVoice
  request.
- A bounded loopback request returned HTTP 200 after 3,255 ms with 99,840
  bytes of even-length PCM16 and mean absolute sample energy 1,740 (audible).
- A second request through the normal authenticated Happy machine relay returned
  HTTP 200 with `start`, ordered chunks, and `end` after 2,866 ms; its PCM had
  mean absolute sample energy 1,740.

No request text, PCM payload, provider URL, credential, or model path is
recorded here.

## 2026-07-14 generation-ceiling missing-sentence regression

- Physical continuous reading on the 80-character Android build still skipped
  sentence tails, so task 4.3 remains failed and incomplete.
- A synthetic 79-character Chinese fragment with the production 400-token
  budget returned exactly 1,536,000 PCM16 bytes, equal to
  `400 * 1,920 * 2`; the sidecar had hit its hard generation ceiling while
  returning HTTP success. Raising the same fragment to 800 tokens also filled
  the exact 3,072,000-byte ceiling, so merely increasing the budget would extend
  failure latency to 64 seconds.
- A synthetic 37-character fragment with a 400-token budget completed three
  times at 391,680 bytes / 8.16 seconds of audio without hitting the ceiling.
- Android now splits at punctuation to at most 40 characters, while Qwen
  reserves ten tokens per character. Exact generation-ceiling PCM is rejected
  before playback and uses the existing one safe pre-audio retry.
- RED/GREEN evidence: the new 40-character Android contract and ten-token budget
  tests failed against the 80-character/five-token implementation, then passed
  after the fix. Focused provider/manager tests passed 17/17, Android generator
  tests passed 7/7, both package typechecks passed, strict OpenSpec validation
  passed, and `git diff --check` passed.
- A separate repeated-sentence probe showed the sidecar deterministically filled
  the 120-token ceiling at repetition penalties `1.0` and `1.05`. With the
  Qwen3 sampling profile and repetition penalty `1.2`, the same sentence ended
  naturally at 245,760 PCM16 bytes in about 3.1 seconds. The normal authenticated
  relay then returned ordered `start`, `chunk`, and `end` frames with mean
  absolute sample energy 679.
- A scoped callback review against Android TTS Server found that Happy returned
  `ERROR_INVALID_REQUEST` for a blank utterance while the reference engine
  completes it with `callback.start()` and `callback.done()`. This can terminate
  a reader queue at a blank paragraph boundary. A new generator regression was
  observed RED against that behavior and GREEN after Happy completed blank
  utterances without sidecar work; Android generator tests now pass 8/8.

All synthesis text used for this reproduction was synthetic test text. No book
text or PCM content was logged or added to the repository.

## 2026-07-14 Android local-update publication

- Production APK: version `1.7.0`, versionCode `1783963074`, size 78,879,029
  bytes.
- `apksigner verify --verbose` passed with APK Signature Scheme v2.
- The published `latest.json` and ranged APK request are reachable through the
  existing tailnet update address, and the source and published APK SHA-256
  values match at
  `b47d67cd17c11fd1cc8f766b854d78be9472e498ce7ee31a77a2fd677454faa3`.
- The generated release Kotlin source contains the 40-character split, first
  real-fragment start, one-fragment lookahead, and successful blank-utterance
  completion implementation; the merged manifest registers
  `com.ex3ndr.happy.HappyTextToSpeechService` and uses the production package
  `com.ex3ndr.happy`.
- No Android device was connected during publication, so installation and
  continuous-reading acceptance remain pending.

## 2026-07-14 generation-ceiling fix APK publication

- Supersedes the earlier APK above: production APK version `1.7.0`, versionCode
  `1783962378`, size 78,879,029 bytes, SHA-256
  `270d9af64886722a8dbd72b10df26024f6a3dfb9ecdcb3b41b196360a904eb3a`.
- The generated native service contains the 40-character maximum fragment and
  punctuation cut-off contract, and Gradle reported `BUILD SUCCESSFUL`.
- `apksigner verify --verbose` passed with APK Signature Scheme v2.
- The tailnet `latest.json` reports versionCode `1783962378`; a ranged APK
  request returned the `504b` ZIP/APK header, and the published APK SHA-256
  matches the local release artifact.
- No Android device was connected through ADB. Installation and physical
  continuous-reading acceptance remain pending, so task 4.3 stays incomplete.

## 2026-07-14 blank-utterance callback compatibility APK

- Android TTS Server completes a blank reader utterance with `start()` and
  `done()` without provider work. Happy previously returned
  `ERROR_INVALID_REQUEST`, which can terminate Legado's queued narration.
- A generator regression now requires the same blank-utterance callback
  lifecycle, while preserving the 40-character split and authenticated stream
  contract. The focused generator suite passed 8/8.
- Production APK version `1.7.0`, versionCode `1783963074`, size 78,879,029
  bytes, SHA-256
  `b47d67cd17c11fd1cc8f766b854d78be9472e498ce7ee31a77a2fd677454faa3`.
- Gradle reported `BUILD SUCCESSFUL`; APK Signature Scheme v2 verification
  passed. The remote manifest and ranged APK probe report the same version and
  a valid `504b` APK header, and the published SHA-256 matches the build.
- No Android device was connected through ADB. Installation and physical
  continuous-reading acceptance remain pending, so task 4.3 stays incomplete.

## 2026-07-14 punctuation-first 20-character APK

- Redacted physical-runtime diagnostics observed four successful provider
  fragments (46,080 / 65,280 / 145,920 / 130,560 PCM16 bytes in 514 / 658 /
  1,312 / 1,183 ms), followed by an Android cancellation after 3,704 ms before
  the next fragment produced PCM. This identifies a later-fragment generation
  gap and Android cancellation as the observed missing-sentence boundary; no
  narration text or PCM content was logged.
- The Android split contract now prefers sentence-ending marks (`。！？；` and
  line breaks) within the next 20 characters. It uses soft pause marks
  (`：，、`) only after ten characters, otherwise hard-cutting at 20. This keeps
  short comma clauses from multiplying remote fragment overhead.
- The strong-before-soft generator assertions were observed RED against the
  previous max-position implementation and GREEN after the policy changed. The
  focused Android generator/native tests pass 8/8; provider/manager/API tests
  pass 24/24; app, CLI, wire, and server typechecks pass; strict OpenSpec
  validation and `git diff --check` pass.
- Production APK version `1.7.0`, versionCode `1783964344`, size 86,345,641
  bytes, SHA-256
  `7a832c9ad50eb5f08ef76b464f4d497b5ebb50c5c8a10dde4e0c88f9ab018dd8`.
  Gradle reported `BUILD SUCCESSFUL`; APK Signature Scheme v2 verification
  passed; the remote manifest and full remote APK hash match the local build.
- Current authenticated `tts/status` reports the selected Mac Qwen3 provider
  ready. No Android device is connected through ADB, so installation and the
  no-skipped-sentence physical acceptance remain pending; task 4.3 stays open.

## 2026-07-14 deterministic generation-ceiling recovery

- After the 20-character production APK was installed, redacted daemon
  diagnostics showed many successful physical-reading fragments and one
  fragment reaching the Qwen generation ceiling twice in about 4.1 seconds per
  attempt. Repeating the same input could not recover a deterministic model
  failure, so task 4.3 remained incomplete.
- The provider now rejects the original ceiling PCM, splits near the midpoint
  with punctuation preference, raises only recovery fragments' repetition
  penalty from `1.2` to `1.35`, and synthesizes them sequentially. Recovery is
  bounded to two split levels and all descendant PCM is buffered before one
  concatenated result can reach Android; a failed descendant exposes no partial
  replacement.
- RED/GREEN coverage includes a direct two-half recovery, punctuation-boundary
  selection, a first-level child that also reaches its ceiling, exact-ceiling
  terminal rejection, cancellation propagation, and manager attempt numbering.
  Focused provider/manager tests pass 21/21 and the Happy CLI typecheck passes.
- The rebuilt local CLI was linked and the daemon was explicitly restarted on
  the final compiled output. Current daemon status is healthy through the
  existing Happy authentication path. A new post-restart physical request has
  not yet reached the daemon, so no-skipped-sentence acceptance and task 4.3
  remain open.
