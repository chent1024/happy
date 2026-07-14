## ADDED Requirements

### Requirement: TTS configuration is encrypted machine configuration
The system SHALL store TTS configuration as optional encrypted data associated with a selected Happy machine. The configuration MUST contain no bearer token, API key, provider secret, reference audio, generated audio, or plaintext book content.

#### Scenario: User saves a narrator profile
- **WHEN** the user selects a machine and saves a narrator voice profile
- **THEN** Happy synchronizes the encrypted machine configuration using the existing machine metadata update flow

#### Scenario: Existing client reads an updated machine
- **WHEN** a client that does not support TTS reads a machine with TTS configuration
- **THEN** it continues to handle the machine without failing on the optional TTS fields

### Requirement: Explicit role rules take precedence over inference
The daemon SHALL resolve an utterance to a configured voice profile by explicit rule first, quotation-based dialogue detection second, and narrator fallback last. It MUST only select profiles configured by the user.

#### Scenario: Explicit role rule matches text
- **WHEN** a configured explicit role rule matches an utterance
- **THEN** the daemon synthesizes with that role's configured profile

#### Scenario: Dialogue has no configured role profile
- **WHEN** dialogue is detected but no matching configured role profile exists
- **THEN** the daemon uses the narrator profile and emits a non-fatal role-fallback status

### Requirement: Configuration changes invalidate affected local cache entries
The daemon SHALL ensure that cached audio cannot be reused when normalized text, selected profile, speaking rate, role resolution, provider revision, or model revision differs.

#### Scenario: Narrator voice changes
- **WHEN** the user changes the narrator profile
- **THEN** subsequent narrator requests do not reuse audio generated with the previous profile
