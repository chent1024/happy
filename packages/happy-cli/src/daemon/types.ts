/**
 * Daemon-specific types (not related to API/server communication)
 */

import { Metadata } from '@/api/types';
import { ChildProcess } from 'child_process';

export interface SessionEncryptionData {
  encryptionKey: Uint8Array;
  encryptionVariant: 'legacy' | 'dataKey';
  seq: number;
  metadataVersion: number;
  agentStateVersion: number;
}

/**
 * Session tracking for daemon
 */
export interface TrackedSession {
  startedBy: 'daemon' | string;
  happySessionId?: string;
  happySessionMetadataFromLocalWebhook?: Metadata;
  encryption?: SessionEncryptionData;
  pid: number;
  childProcess?: ChildProcess;
  error?: string;
  directoryCreated?: boolean;
  message?: string;
  /** tmux session identifier (format: session:window) */
  tmuxSessionId?: string;
}

export type SessionWorkerUnavailableReason =
  | 'missing-session-record'
  | 'missing-metadata'
  | 'missing-encryption'
  | 'missing-provider-resume-id'
  | 'unsupported-provider'
  | 'stop-failed'
  | 'resume-failed';

export type SessionWorkerAvailability =
  | {
      state: 'running';
      sessionId: string;
      pid: number;
      startedVersion?: string;
    }
  | {
      state: 'stale-version';
      sessionId: string;
      pid: number;
      startedVersion?: string;
      currentVersion: string;
    }
  | {
      state: 'exited-resumable';
      sessionId: string;
      startedVersion?: string;
    }
  | {
      state: 'exited-not-resumable';
      sessionId: string;
      reason: SessionWorkerUnavailableReason;
      detail?: string;
    }
  | {
      state: 'unknown';
      sessionId: string;
      reason: SessionWorkerUnavailableReason;
      detail?: string;
    };

export type EnsureSessionLiveResult =
  | {
      type: 'running';
      sessionId: string;
      workerState: 'running' | 'stale-version';
      pid?: number;
      startedVersion?: string;
      currentVersion?: string;
    }
  | {
      type: 'resumed';
      sessionId: string;
    }
  | {
      type: 'not-resumable';
      sessionId: string;
      workerState: SessionWorkerAvailability['state'];
      reason: SessionWorkerUnavailableReason;
      detail?: string;
    }
  | {
      type: 'error';
      sessionId: string;
      errorMessage: string;
    };
