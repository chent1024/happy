import axios from 'axios';

import { decodeBase64, decrypt } from '@/api/encryption';
import type { Metadata } from '@/api/types';
import { configuration } from '@/configuration';

export type ServerSessionSnapshot = {
  metadata: Metadata | null;
  seq: number;
  metadataVersion: number;
  agentStateVersion: number;
};

type RawServerSession = {
  id: string;
  seq?: number;
  metadata?: string;
  metadataVersion?: number;
  agentStateVersion?: number;
};

export async function fetchServerSessionSnapshot(opts: {
  sessionId: string;
  token: string;
  encryptionKey: Uint8Array;
  encryptionVariant: 'legacy' | 'dataKey';
  log?: (message: string) => void;
}): Promise<ServerSessionSnapshot | null> {
  try {
    const response = await axios.get(`${configuration.serverUrl}/v1/sessions`, {
      headers: { Authorization: `Bearer ${opts.token}` },
      timeout: 10_000,
    });
    const sessions = (response.data as { sessions?: RawServerSession[] }).sessions;
    const matched = Array.isArray(sessions)
      ? sessions.find(session => session.id === opts.sessionId)
      : undefined;
    if (!matched) {
      return null;
    }

    const metadata = matched.metadata
      ? decrypt(opts.encryptionKey, opts.encryptionVariant, decodeBase64(matched.metadata)) as Metadata
      : null;

    return {
      metadata,
      seq: typeof matched.seq === 'number' ? matched.seq : 0,
      metadataVersion: typeof matched.metadataVersion === 'number' ? matched.metadataVersion : 0,
      agentStateVersion: typeof matched.agentStateVersion === 'number' ? matched.agentStateVersion : 0,
    };
  } catch (error) {
    opts.log?.(`Failed to fetch session snapshot from server: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}
