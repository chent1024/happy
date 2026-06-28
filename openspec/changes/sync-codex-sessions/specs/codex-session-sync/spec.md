## ADDED Requirements

### Requirement: Manual Codex Session Sync

Happy SHALL provide a user-triggered action to synchronize recent local Codex.app sessions for a selected machine.

#### Scenario: User manually syncs latest Codex sessions

- **GIVEN** a machine is connected to Happy
- **WHEN** the user clicks the Codex session sync action for that machine
- **THEN** Happy requests the latest local Codex threads from that machine
- **AND** no automatic background sync is started

### Requirement: Codex App-Server Source

Happy SHALL obtain Codex session list data through `codex app-server` and SHALL NOT read Codex sqlite or state database files directly.

#### Scenario: Daemon lists Codex threads

- **GIVEN** the daemon handles the manual sync request
- **WHEN** it needs local Codex session metadata
- **THEN** it calls the Codex app-server `thread/list` method
- **AND** it uses typed request and response definitions in the Happy Codex app-server client

### Requirement: Default Sync Scope

Happy SHALL limit the first manual sync implementation to recent non-archived Codex thread metadata updated within the last 3 days and process at most 15 threads per project path.

#### Scenario: Default sync query

- **GIVEN** the user requests manual Codex sync
- **WHEN** Happy asks the machine for Codex threads
- **THEN** it requests up to 200 threads
- **AND** it filters out archived threads
- **AND** it sorts by latest updated time descending

#### Scenario: Three-day recency filter

- **GIVEN** Codex returns a thread whose latest timestamp is more than 3 days old
- **WHEN** Happy processes manual Codex sync results
- **THEN** it leaves that thread unimported

#### Scenario: Per-project sync cap

- **GIVEN** one project has more than 15 returned Codex threads
- **WHEN** Happy processes manual Codex sync results
- **THEN** it processes only the 15 most recently updated threads for that project
- **AND** it leaves older returned threads for that project unimported

### Requirement: Imported Session Semantics

Happy SHALL import Codex thread metadata as historical sessions without starting or marking them as live agents.

#### Scenario: Imported thread appears in Happy

- **GIVEN** a Codex thread is returned by `thread/list`
- **WHEN** Happy imports it
- **THEN** the resulting Happy session has `flavor` set to `codex`
- **AND** the session metadata includes the Codex thread id
- **AND** the session `updatedAt` matches the Codex thread updated time normalized to milliseconds
- **AND** the session is not marked online by the import
- **AND** the imported session remains visible in the project-group session list

### Requirement: Idempotent Sync

Happy SHALL avoid duplicate imported sessions for the same machine and Codex thread id.

#### Scenario: User repeats manual sync

- **GIVEN** a Codex thread was already imported for a machine
- **WHEN** the user runs manual sync again
- **THEN** Happy does not create a second session for that same machine and Codex thread id
- **AND** Happy refreshes the existing imported session timestamp from the normalized Codex updated time
