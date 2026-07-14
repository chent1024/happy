## ADDED Requirements

### Requirement: Offline voice packs use a Happy-defined verified format
Happy SHALL import local voice packs only through a Happy-defined archive format with a versioned JSON manifest, declared engine format, per-asset SHA-256 digests, and bounded speaker catalog. Happy MUST NOT interpret third-party package configuration, executable code, or native library assets from an imported pack.

For V1 VITS packs, the manifest SHALL declare `model.onnx`, token and optional
lexicon paths, optional bounded normalization FST paths, the engine speaker ID
for each safe display speaker, and an optional recommended narrator. Every
declared runtime file MUST be present in the hashed asset catalog.

#### Scenario: Valid personal pack is imported
- **WHEN** a user selects an archive whose manifest, asset hashes, engine format,
  speaker IDs all pass validation
- **THEN** Happy atomically stores it in app-private storage and exposes its safe
  pack and speaker metadata for local selection

#### Scenario: Pack contains an undeclared or corrupted asset
- **WHEN** an archive has an undeclared file, traversal path, duplicate path,
invalid hash, unsupported engine, or malformed optional metadata
- **THEN** Happy rejects the archive, removes temporary data, and leaves the
active pack unchanged

#### Scenario: ZipVoice eSpeak paths use official punctuation and spaces
- **WHEN** a ZipVoice pack declares a hashed eSpeak data file with an official
  safe name such as `espeak-ng-data/voices/!v/Mr serious`
- **THEN** Happy accepts that file name while still rejecting `.` or `..` path
  segments and any canonical destination outside the app-private pack root

### Requirement: Local pack state remains private to the device
Happy SHALL store pack bytes, model paths, and selected local speaker bindings only on the Android device. It MUST NOT upload those assets, plaintext synthesis input, rendered PCM, or an external provider credential to Happy Server or a paired daemon.

#### Scenario: Device has no network connection after import
- **WHEN** an installed local pack is selected and the phone has no network
  connectivity
- **THEN** local status and synthesis remain available without attempting a
  server, daemon, or provider request

### Requirement: Pack activation is truthful and reversible
Happy SHALL mark a pack ready only after manifest validation and a bounded local engine readiness check. It MUST preserve the previously active pack when a new pack fails import or initialization, and it MUST permit deleting an inactive or stopped active pack without changing remote TTS configuration.

#### Scenario: Local model cannot initialize
- **WHEN** the selected pack passes archive validation but its model cannot load
- **THEN** Happy reports a typed local unavailable state and does not advertise
  the pack as ready

### Requirement: Personal models are not silently distributed
Happy SHALL distinguish a locally imported model candidate from a model supplied
by Happy. A personal local import MUST NOT cause Happy to bundle the model into
an APK, publish it as a Happy download, or sync it to another device.

#### Scenario: Personal candidate is imported
- **WHEN** a model candidate is prepared for device acceptance from the user's
  local device
- **THEN** Happy MAY import it but MUST NOT bundle it into an APK, publish it as
  a Happy download, or sync it to another device
