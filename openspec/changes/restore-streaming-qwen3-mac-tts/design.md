## Context

Happy already has an Android `TextToSpeechService`, authenticated selected-machine
RPC, encrypted machine metadata, and an Apple Silicon MLX Audio environment. A
previous remote-TTS attempt supplied useful stream semantics but was superseded
before physical acceptance. The current phone-local ZipVoice fallback has lower
network dependency but causes unacceptable device heat on long narration.

The user has selected the current Mac as the sole Qwen3 inference host. The
model must remain loopback-local to that Mac; the Android device must only
receive ordered PCM through Happy's existing authenticated path.

## Goals / Non-Goals

**Goals:**

- Make a selected Happy machine synthesize bounded Chinese narration with MLX
  Audio Qwen3 CustomVoice and stream PCM promptly to Android system TTS.
- Reuse account/machine authorization and preserve a strict no-second-secret
  boundary.
- Make cancellation, queue saturation, sidecar/model unavailability, malformed
  chunks, and pre-audio failures explicit, bounded, and non-replaying.
- Prove model readiness, first-audio latency, and continuous Android reading
  before retiring the local ZipVoice runtime.

**Non-Goals:**

- Multi-role voice routing, reference-voice cloning, a Legado HTTP URL, cloud
  inference, a model in the APK, or accepting arbitrary third-party providers.
- Persisting book text, PCM, or audio on Happy Server or the Android device.
- Deleting ZipVoice before the new route passes physical-device acceptance.

## Decisions

### 1. MLX Audio Qwen3 is a daemon-owned, loopback-only provider

The daemon owns one warmed provider worker and a finite FIFO queue. It launches
or probes MLX Audio only on `127.0.0.1`, selects a pinned Qwen3 0.6B
CustomVoice quantized model and the verified Chinese male `Eric`. The 0.6B
CustomVoice request deliberately omits `instruct`: this MLX runtime accepts an
instruction but can return a long inaudible PCM response. The provider rejects
complete-but-inaudible PCM rather than presenting it as a playable result.
Because the selected MLX runtime does not provide reliable audio-generation
streaming for this model, the provider generates one bounded PCM16 fragment
before it emits ordered transport frames.
Android starts as soon as the first complete real-PCM fragment is buffered,
then prefetches at most one following fragment while the current PCM is
consumed. This follows Android TTS Server's callback timing: delaying
`SynthesisCallback.start()` for a second remote fragment lets some readers
cancel the utterance before Android receives audio.

Using the existing loopback-only MLX Audio endpoint avoids a custom
CUDA/decoder fork and is native to the selected Apple Silicon host. The daemon
adds the bounded buffer, ordered frames, and cancellation semantics that the
endpoint itself does not provide.

### 2. Existing machine RPC remains the authorization and relay boundary

Android uses its already-authenticated Happy account and selected paired machine.
The service must not export credentials to Legado; the server may transiently
relay encrypted request/control traffic and stream frames only after existing
account/machine checks. The daemon registers only machine-scoped RPC handlers.
No provider token, sidecar URL, model path, or text/audio is added to sync
metadata or logs.

### 3. Stream protocol is ordered and terminal

The relay uses `start(sampleRate, requestId)`, strictly increasing
`chunk(sequence, pcm16)`, and exactly one `end` or typed `error` terminal event.
The Android consumer rejects sequence gaps/duplicates and calls
`SynthesisCallback` only after format/start lifecycle success. Cancellation from
Android is propagated to the relay and provider; later text fragments are not
submitted after cancellation.

Android starts only after a complete real-PCM fragment is available. It then
requests at most one following fragment while Android consumes the current one. The
daemon does not emit `start` or silent liveness PCM during model prefill. If
the provider fails or is near-silent before audible PCM,
one same-provider retry is allowed. Once audible PCM is emitted, no retry is
allowed because it could replay narration.

### 4. Work is bounded around continuous narration

The Android service normalizes and splits to no more than 20 characters. It
prefers sentence-ending punctuation (`。！？；` and line breaks), then uses
comma-like punctuation (`：，、`) only when it leaves at least ten characters;
otherwise it hard-cuts at 20. It retains one completed initial fragment and
requests at most one following fragment while writing the current PCM. The daemon imposes
request, queue, stream duration, output-byte, and provider timeout limits.
Cache keys include normalized text, selected voice, model revision, sample
rate, and rate; they never leave the Mac. A single warmed worker favors stable
thermal and memory behavior on the Mac over parallel model loads.

The MLX decoder can return HTTP 200 and exactly fill `max_tokens` without
reaching a natural utterance end. The provider therefore reserves ten acoustic
tokens per input character, uses the verified Qwen3 sampling profile with a
`1.2` repetition penalty, and rejects PCM whose byte length reaches the exact
generation ceiling. Before the existing outer pre-audio retry, the provider
recovers that deterministic failure by splitting near the midpoint (preferring
nearby punctuation), raising only the recovery fragments' repetition penalty
to `1.35`, and synthesizing them sequentially. Recovery is capped at two split
levels. Every descendant must finish and pass PCM validation before their
buffers are concatenated and emitted, so Android cannot hear a partial
replacement. A terminal recovery failure may still use the one existing outer
pre-audio retry, but truncated ceiling PCM is never forwarded as success.

### 5. ZipVoice removal is a gated migration

The restored remote route is added alongside an inactive local fallback. The app
will show truthful current-Mac provider state and test playback. Only after the
physical continuous-reading smoke meets the stream/no-skip acceptance does the
follow-up removal delete ZipVoice assets/import/settings. Failure rolls back by
reselecting the local fallback, not by creating an external endpoint.

## Risks / Trade-offs

- [Model load or unsupported MLX version] → Probe the exact installed sidecar,
  pin a compatible model, run a local raw-PCM smoke, and report unavailable
  rather than ready.
- [Android callback timeout before audio] → Retain a bounded complete-fragment
  prebuffer and instrument first-audio latency without text/PCM logs.
- [Dropped/reordered stream data] → Sequence validation and one terminal event;
  stop safely rather than speaking corrupted/replayed audio.
- [Mac CPU/GPU load during lengthy reading] → One bounded worker, finite queue,
  model warmup, backpressure, and status counters; no concurrent model copies.
- [User loses a working fallback] → Do not remove ZipVoice until the physical
  acceptance evidence exists.

## Migration Plan

1. Add specs and tests for the provider/stream contract before restoring code.
2. Recover or reimplement the bounded daemon/relay/Android route behind the
   existing selected-machine authorization.
3. Verify the current Mac MLX sidecar/model with a local raw PCM smoke, then
   restart only the Happy daemon after rebuilt code is installed.
4. Build/install a scoped Android release, select Happy, and run a measured
   multi-sentence Legado smoke covering success, cancellation, and unavailable
   provider behavior.
5. If acceptance passes, create the gated ZipVoice-removal follow-up within
   this change; otherwise retain it as rollback and leave this change incomplete.

## Open Questions

- The exact model repository/quantization supported by the locally installed
  MLX Audio version must be confirmed by a model-ready probe before it becomes
  the persisted default.
- Physical-device first-audio and no-skip thresholds are acceptance evidence,
  not assumptions; they remain unresolved until measured.
