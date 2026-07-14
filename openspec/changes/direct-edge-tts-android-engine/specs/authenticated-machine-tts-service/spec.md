## REMOVED Requirements

### Requirement: System TTS uses an authenticated selected machine
**Reason**: Direct Edge synthesis is phone-to-provider and does not use Happy's
machine relay.
**Migration**: No machine selection is required; existing normal Happy account
and machine authorization remain available for non-TTS features.

### Requirement: Selected-machine PCM relay protects narration transport
**Reason**: The selected-machine relay is removed from the direct Edge TTS
product path.
**Migration**: The Android engine uses its provider TLS connection directly and
reports provider/network errors through the Android callback.
