# Verification record

## Single-voice fast-mode update (2026-07-13)

- User decision supersedes the earlier multi-role acceptance target: ZipVoice remains the local engine, but one selected catalog voice is used for all narration; character and dialogue routing are ignored.
- The settings page now exposes only voice selection and per-voice audition. It clears legacy role bindings whenever a pack or voice is selected.
- The local Sherpa configuration now defaults to balanced (three CPU threads), allows eco/turbo (two/four), and forces two threads under Battery Saver or severe Android thermal status. It retains one worker and bounded 80-character fragments.
- The Android service holds at most 220 ms of first PCM before callback output, flushes it on normal completion, and drops it on cancellation or output failure.
- Focused profile regressions (31 tests), Happy app typecheck, strict OpenSpec validation, Kotlin compilation, and release signature validation passed.
- The production artifact is recorded with its version code and SHA-256 in the external execution contract evidence. It is installed on the K50 without clearing local data, and Happy remains the selected system TTS engine.
- K50 manual continuous-reading thermal/continuity evidence remains pending. No battery, thermal-improvement, or skipped-sentence claim is made.

## Automated evidence

- `corepack pnpm --filter happy-app exec vitest run sources/offlineTts/packageAishell3VoicePack.test.ts sources/offlineTts/packageZipVoiceVoicePack.test.ts sources/offlineTts/voicePack.test.ts sources/plugins/withAndroidSystemTts.spec.ts`: 30 tests passed on 2026-07-13. This includes the ZipVoice `lexicon.txt` requirement and replacement of an existing archive without stale assets.
- `corepack pnpm --filter happy-app typecheck`, `corepack pnpm --filter happy typecheck`, and `corepack pnpm --filter happy-server-self-host typecheck`: passed.
- `./gradlew :app:compileDebugKotlin --no-daemon --max-workers=4 --console=plain --quiet`: passed after Expo prebuild.
- `./gradlew :app:assembleRelease --no-daemon --max-workers=4 --console=plain --quiet`: passed.
- APK: `packages/happy-app/android/app/build/outputs/apk/release/app-release.apk`; production package `com.ex3ndr.happy`, version code `1783923594`, SHA-256 `3fc98ea409ab3857cb626b6a88747accf8f5ff3a507d7b6d60754b9318bfbb91`; APK Signature Scheme v2 verifies and contains `lib/arm64-v8a/libsherpa-onnx-jni.so`.
- Android in-app update publication: `https://chent.taile37c91.ts.net:8766/latest.json`; HTTPS manifest, APK HEAD, byte-range response, and copied-APK SHA-256 were verified.
- `openspec validate add-android-offline-voice-packs --strict` and `git diff --check`: passed.
- K50 Ultra live regression (2026-07-13): production package `com.ex3ndr.happy` version code `1783923594` is installed and registered as the default Android TTS engine. The ZipVoice v2 pack imported and became active; both narrator and female-role previews produced 24 kHz mono PCM AudioTracks. Legado completed consecutive utterances while Happy created `CONTENT_TYPE_SPEECH` AudioTracks; the user confirmed audible output. Stopping Legado released Happy's playback path. The prior `sherpa-onnx` JNI `NoSuchMethodError`/`SIGABRT` did not recur.

## Unverified physical-device conditions

The K50 Ultra installation, Happy system-TTS discovery, active ZipVoice v2
pack import, narrator/female preview playback, repeated Legado utterance
completion, and stop/cancel behavior have been verified. SAF import rollback,
explicit character-to-speaker playback inside Legado, offline network
isolation, first-audio timing, 30-minute Legado continuity, heat, and battery
observations remain unverified. The AISHELL-3 candidate is functionally neutral
and does not satisfy the requested expressive male novel-reading acceptance
target.

## Candidate-pack status

`aishell3-zh-multirole-v1.zip` is a local acceptance candidate only. Although
the AISHELL-3 dataset is labelled Apache-2.0, the converted upstream weight
archive has no independent weight redistribution license. It must not be
bundled into the APK or published as a Happy download.

An alternate direct model source, `jackyqs/vits-aishell3-175-chinese`, declares
Apache-2.0 on its model card. It was evaluated as a possible source for a
reviewed pack and rejected for now: its legacy VITS export traced a fixed
three-token reshape and failed ONNX Runtime inference for normal Chinese text.
No converter, ONNX file, or pack from that source is retained in Happy.
# ZipVoice personal pack artifact (2026-07-13)

- Archive: `/Users/xihe0000/codex-tmp/happy/offline-tts/zipvoice-zh-personal-multirole-v2.zip`
- SHA-256: `2508080b54ed2befea514db28881de05f07e2fa517b5b9b2932ff2f9bb6808fd`
- Size: 157,919,953 bytes (151 MiB), 362 hashed files.
- Catalog: `narrator-male` (男旁白（ZipVoice）) and `female-role` (女角色（ZipVoice）).
- Runtime: ZipVoice INT8 encoder/decoder, `vocos_24khz.onnx`, `lexicon.txt`, and complete eSpeak data. The archive is device-local only; it is not bundled, published, or synced.
- Device transfer: the exact SHA-256 archive was copied to `/sdcard/Download/zipvoice-zh-personal-multirole-v2.zip` on Xiaomi K50 Ultra, imported, enabled, and heard through both the Happy preview and Legado system-TTS paths.
