## REMOVED Requirements

### Requirement: Happy can synthesize locally as an Android system TTS engine
**Reason**: The user selected direct Edge-only narration because long-running
phone-local inference overheats the target device.
**Migration**: Imported packs remain user files but Happy no longer imports,
selects, previews, or synthesizes from them; select Happy and configure an Edge
voice in the TTS settings.

### Requirement: Offline multi-role routing
**Reason**: The user explicitly does not require multi-role playback and chose a
single selected Edge narrator voice.
**Migration**: Existing role bindings are ignored and are not migrated to Edge.
