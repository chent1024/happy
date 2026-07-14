## ADDED Requirements

### Requirement: Current Mac runs a truthful loopback-only Qwen3 provider
The selected current Apple Silicon Mac SHALL own the initial Qwen3 provider via
MLX Audio bound to loopback only. It SHALL use a configured Qwen3 CustomVoice
model and selected narrator voice, initially `Eric`. For a Qwen3 0.6B
CustomVoice model, it SHALL omit the optional `instruct` field because that
runtime can otherwise return inaudible PCM. It SHALL reject complete but
inaudible PCM rather than claiming that a synthesis result is playable.

#### Scenario: Model is ready
- **WHEN** the sidecar is loopback-reachable and the configured model is loaded
- **THEN** the daemon reports ready with a redacted model revision/status and
  accepts one bounded synthesis request; that request is only playable after it
  passes PCM completeness and audibility validation

#### Scenario: Model is missing or sidecar fails
- **WHEN** the sidecar is unavailable, not loopback-only, lacks the configured
  model, or returns invalid PCM
- **THEN** the daemon reports `provider_unavailable` or typed initialization
  failure and does not claim that synthesis is ready

#### Scenario: 0.6B instructed or silent response is not played
- **WHEN** a 0.6B CustomVoice narration request is constructed
- **THEN** the provider omits `instruct`, and a complete PCM response whose
  average sample energy is below the audible threshold fails as a typed provider
  error without being forwarded to Android

### Requirement: Buffered provider output favors continuous playback
The provider SHALL keep one warmed worker and a bounded FIFO queue, generate a
complete bounded PCM16 fragment before emitting ordered transport frames, and
preserve PCM16 frame boundaries. It SHALL expose bounded first-audio, queue,
retry, cancellation, and failure counters without retaining request content.

#### Scenario: Multiple fragments arrive
- **WHEN** more fragments arrive than the single worker can synthesize
- **THEN** the daemon queues only up to its configured bound and returns a typed
  busy result for excess work without starting a second model copy

#### Scenario: Provider emits incomplete PCM16 output
- **WHEN** a loopback response ends on an odd PCM byte boundary
- **THEN** the provider returns a typed provider failure and does not forward
  malformed PCM to Android
