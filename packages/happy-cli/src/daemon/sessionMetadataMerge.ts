import type { Metadata } from '@/api/types';

export function mergeServerSessionMetadataForResume(
  localMetadata: Metadata,
  serverMetadata: Metadata,
): Metadata {
  return {
    ...serverMetadata,
    ...(!serverMetadata.codexThreadId && localMetadata.codexThreadId
      ? { codexThreadId: localMetadata.codexThreadId }
      : {}),
    ...(!serverMetadata.claudeSessionId && localMetadata.claudeSessionId
      ? { claudeSessionId: localMetadata.claudeSessionId }
      : {}),
  };
}
