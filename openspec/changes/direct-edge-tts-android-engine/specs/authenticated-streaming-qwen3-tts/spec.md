## REMOVED Requirements

### Requirement: Android narration uses only the authenticated selected machine
**Reason**: The user replaced Mac Qwen narration with direct Edge synthesis.
**Migration**: Remove selected-Mac narration settings and use the direct Edge
voice setting instead.

### Requirement: Mac Qwen streaming provider is the Android narration backend
**Reason**: Variable real-time Qwen throughput does not meet the required
continuous-reading responsiveness.
**Migration**: The optional Mac model runtime is no longer invoked by Happy;
it is not automatically deleted from the user's Mac.
