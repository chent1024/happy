import { describe, expect, it, vi, beforeEach } from 'vitest';
import { encodeBase64, encrypt } from '@/api/encryption';
import { fetchServerSessionSnapshot } from './serverSessionSnapshot';

const { mockAxiosGet } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
  },
}));

vi.mock('@/configuration', () => ({
  configuration: {
    serverUrl: 'https://server.test',
  },
}));

describe('fetchServerSessionSnapshot', () => {
  const encryptionKey = new Uint8Array(32);
  const encryptionVariant = 'legacy' as const;

  beforeEach(() => {
    mockAxiosGet.mockReset();
  });

  it('returns current seq and version counters with decrypted metadata', async () => {
    const metadata = {
      flavor: 'codex',
      path: '/tmp/project',
      codexThreadId: 'thread-1',
    };
    mockAxiosGet.mockResolvedValueOnce({
      data: {
        sessions: [
          {
            id: 'session-1',
            seq: 42,
            metadata: encodeBase64(encrypt(encryptionKey, encryptionVariant, metadata)),
            metadataVersion: 7,
            agentStateVersion: 3,
          },
        ],
      },
    });

    await expect(fetchServerSessionSnapshot({
      sessionId: 'session-1',
      token: 'token-1',
      encryptionKey,
      encryptionVariant,
    })).resolves.toEqual({
      metadata,
      seq: 42,
      metadataVersion: 7,
      agentStateVersion: 3,
    });

    expect(mockAxiosGet).toHaveBeenCalledWith('https://server.test/v1/sessions', {
      headers: { Authorization: 'Bearer token-1' },
      timeout: 10_000,
    });
  });

  it('returns null when the session is not present', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: { sessions: [] } });

    await expect(fetchServerSessionSnapshot({
      sessionId: 'missing',
      token: 'token-1',
      encryptionKey,
      encryptionVariant,
    })).resolves.toBeNull();
  });
});
