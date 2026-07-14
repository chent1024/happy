## ADDED Requirements

### Requirement: Android narration uses only the authenticated selected machine
Happy Android SHALL expose its existing Android `TextToSpeechService` as the
Legado entry point and SHALL route a non-empty synthesis request only through
the authenticated user's selected paired machine. The system MUST NOT create,
persist, accept, or reveal a TTS-specific credential, public TTS URL, anonymous
HTTP endpoint, or alternate machine fallback.

#### Scenario: Selected machine synthesizes narration
- **WHEN** an authenticated user selects Happy as Android system TTS and a
  selected paired machine is ready
- **THEN** the request is delivered only through that account's existing
  machine-scoped RPC route and Android does not require a copied credential

#### Scenario: Selected machine is unavailable
- **WHEN** the selected machine is offline or does not register the synthesis
  capability
- **THEN** Android reports one typed synthesis failure and does not try another
  host or an unauthenticated endpoint

### Requirement: PCM stream is ordered, bounded, and terminal
The daemon SHALL emit an authenticated stream with one `start` containing the
sample rate, monotonically increasing PCM16 `chunk` sequence values, and
exactly one `end` or typed `error`. Android SHALL reject duplicate, skipped,
malformed, oversized, or post-terminal chunks and SHALL deliver valid PCM once
through the Android `SynthesisCallback` lifecycle.

#### Scenario: Valid streamed narration
- **WHEN** the Qwen3 provider produces valid PCM chunks for a bounded fragment
- **THEN** Android receives each chunk once in sequence and receives one
  successful terminal event

#### Scenario: A malformed or out-of-order stream arrives
- **WHEN** any chunk is malformed, has a non-increasing sequence, exceeds its
  byte budget, or follows a terminal event
- **THEN** Android terminates the utterance with a typed error and emits no
  later fragment for that request

### Requirement: Cancellation and retries never replay audible narration
The system SHALL propagate Android `STOPPED` or output error cancellation to the
relay and provider. It MAY retry once only when the local provider fails before
audible PCM is emitted; it MUST NOT retry after audible PCM begins. The provider
MUST cancel a detected all-but-silent prelude before the one safe retry and MUST
NOT log or synchronize source text or PCM used for that decision.

#### Scenario: Provider fails before audio
- **WHEN** the provider fails or returns an all-but-silent prelude before
  Android receives audible PCM
- **THEN** the daemon cancels that provider attempt and makes at most one
  same-provider retry

#### Scenario: Reader stops playback
- **WHEN** Android reports a stopped or failed callback after output begins
- **THEN** the daemon cancels the current stream, sends no later chunks, and
  does not replay the fragment

### Requirement: Narration work is finite and privacy-preserving
Android SHALL normalize and split input to fragments of no more than 20
characters. It SHALL prefer sentence-ending punctuation before comma-like soft
punctuation, and SHALL use soft punctuation only when the resulting fragment is
at least ten characters; otherwise it SHALL hard-cut at 20 characters. Before
calling the Android audio callback, it SHALL prepare
the first bounded fragment buffer. While Android consumes the current PCM, it
SHALL request at most one following fragment through the existing selected
machine route. The daemon SHALL enforce finite queue, request timeout,
output-byte, and stream-duration budgets. It MUST keep plaintext narration,
PCM, model files, sidecar paths, and audio cache on the selected Mac; Happy
Server MUST NOT persist or log them.

For Qwen3, the provider SHALL reserve at least ten acoustic generation tokens
per input character and SHALL use the verified `1.2` repetition penalty to
prevent ordinary Chinese narration from repeatedly filling the token budget.
If complete PCM reaches the exact configured generation ceiling, the provider
MUST treat it as a truncated pre-audio failure and MUST NOT forward it as
successful narration. It SHALL attempt a bounded internal recovery of at most
two split levels, preferring punctuation near the midpoint and using a `1.35`
repetition penalty only for recovery fragments. It MUST synthesize those
fragments sequentially and buffer every successful descendant before emitting
their concatenated PCM. If any descendant still fails, it MUST discard the
whole internal recovery result; only the existing one outer pre-audio retry MAY
then run.

#### Scenario: Empty or oversized input
- **WHEN** Android receives empty text or input requiring more than the bounded
  fragment limit
- **THEN** it finishes empty input without model work or submits ordered bounded
  fragments without exceeding daemon limits

#### Scenario: Strong and soft punctuation share a bounded window
- **WHEN** a 20-character candidate contains sentence-ending punctuation and a
  later comma-like punctuation mark
- **THEN** Android cuts at the sentence-ending punctuation, while a candidate
  with only early soft punctuation hard-cuts at 20 instead of creating a tiny
  remote synthesis fragment

#### Scenario: Qwen reaches its generation ceiling
- **WHEN** the sidecar returns PCM whose length equals the configured Qwen
  acoustic-token ceiling
- **THEN** Happy rejects that PCM before Android playback, performs at most two
  sequential punctuation-aware split levels, and emits the concatenated
  replacement only after every descendant succeeds; otherwise it emits no PCM
  and leaves only the existing bounded outer pre-audio retry

#### Scenario: Buffered fragments play continuously
- **WHEN** the provider completes a bounded first fragment and a following
  fragment exists
- **THEN** Android starts the `SynthesisCallback` only with the first real PCM
  fragment and requests no more than one following fragment while delivering
  the current fragment

#### Scenario: Diagnostics are inspected
- **WHEN** app or daemon status is viewed after synthesis
- **THEN** it exposes only typed state and bounded counters without text, PCM,
  provider paths, model cache paths, or credentials
