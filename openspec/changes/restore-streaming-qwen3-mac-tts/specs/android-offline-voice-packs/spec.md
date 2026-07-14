## MODIFIED Requirements

### Requirement: Local voice packs remain a pre-acceptance rollback only
Happy SHALL retain existing local ZipVoice pack assets and settings only while
the authenticated streaming Qwen3 replacement has not passed the physical
Android continuous-reading acceptance. The restored remote provider MUST NOT
depend on local pack assets. After acceptance passes, Happy SHALL remove the
ZipVoice import, local inference, and settings path in the scoped migration.

#### Scenario: Streaming acceptance has not passed
- **WHEN** the current Mac Qwen3 route has not yet produced physical-device
  continuous-reading evidence
- **THEN** Happy retains the local pack data as inactive rollback and does not
  delete it or claim the migration is complete

#### Scenario: Streaming acceptance passes
- **WHEN** the current Mac Qwen3 route passes the recorded physical-device
  first-audio, ordered-stream, cancellation, and no-skip reading smoke
- **THEN** the scoped follow-up removes ZipVoice runtime/import/settings and
  preserves only the remote selected-machine configuration required by Qwen3
