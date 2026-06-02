import { randomBytes } from 'node:crypto';

import { newId, nowIso } from '../domain/ids.js';
import type { OastCallback, OastSession } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import { redactHeaders, redactText } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

export interface RecordOastCallbackInput {
  token?: string;
  sessionId?: string;
  protocol?: 'http' | 'dns' | 'manual';
  method: string;
  path: string;
  headers?: Record<string, string>;
  bodyPreview?: string;
  source?: string;
  remoteAddress?: string;
}

export class OastService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly events?: RunEventService,
  ) {}

  start(input: { runId: string; baseUrl: string }): OastSession {
    this.assertRun(input.runId);
    const token = randomBytes(16).toString('hex');
    const session: OastSession = {
      id: newId('oastsession'),
      runId: input.runId,
      status: 'active',
      token,
      callbackUrl: `${input.baseUrl.replace(/\/$/, '')}/oast/${token}`,
      interactionCount: 0,
      limitations: ['Local HTTP callback inbox only', 'No public DNS canary domain yet', 'Use R3 approval before sending payloads to targets'],
      createdAt: nowIso(),
    };
    this.store.state.oastSessions[session.id] = session;
    this.store.commit();
    this.events?.record({
      runId: input.runId,
      type: 'oast.session.started',
      title: 'OAST session started',
      detail: session.callbackUrl,
      entityId: session.id,
    });
    return session;
  }

  list(runId: string): OastSession[] {
    this.assertRun(runId);
    return Object.values(this.store.state.oastSessions)
      .filter((session) => session.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  listCallbacks(runId: string): OastCallback[] {
    this.assertRun(runId);
    return Object.values(this.store.state.oastCallbacks)
      .filter((callback) => callback.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  close(sessionId: string): OastSession {
    const session = this.store.state.oastSessions[sessionId];
    if (!session) {
      throw new Error(`OAST session not found: ${sessionId}`);
    }
    if (session.status === 'closed') {
      return session;
    }
    session.status = 'closed';
    session.closedAt = nowIso();
    this.store.commit();
    this.events?.record({
      runId: session.runId,
      type: 'oast.session.closed',
      title: 'OAST session closed',
      entityId: session.id,
    });
    return session;
  }

  recordCallback(input: RecordOastCallbackInput): OastCallback {
    const session = this.resolveSession(input);
    if (session.status !== 'active') {
      throw new Error(`OAST session is not active: ${session.id}`);
    }
    const timestamp = nowIso();
    const content = {
      source: input.source ?? 'callback',
      protocol: input.protocol ?? 'http',
      sessionId: session.id,
      token: session.token,
      request: {
        method: input.method.toUpperCase(),
        path: redactText(input.path),
        headers: redactHeaders(input.headers ?? {}),
        bodyPreview: input.bodyPreview ? redactText(input.bodyPreview).slice(0, 4096) : undefined,
        bodyTruncated: Boolean(input.bodyPreview && input.bodyPreview.length > 4096),
        remoteAddress: input.remoteAddress,
      },
      receivedAt: timestamp,
    };
    const evidence = this.evidence.addEvidence({
      runId: session.runId,
      kind: 'oast_callback',
      content: JSON.stringify(content),
      redactionState: 'redacted',
    });
    const callback: OastCallback = {
      id: newId('oastcallback'),
      runId: session.runId,
      sessionId: session.id,
      evidenceId: evidence.id,
      protocol: input.protocol ?? 'http',
      method: input.method.toUpperCase(),
      path: redactText(input.path).slice(0, 500),
      source: input.source ?? 'callback',
      remoteAddress: input.remoteAddress,
      createdAt: timestamp,
    };
    this.store.state.oastCallbacks[callback.id] = callback;
    session.interactionCount += 1;
    this.store.commit();
    this.events?.record({
      runId: session.runId,
      type: 'oast.callback.received',
      title: 'OAST callback received',
      detail: `${callback.method} ${callback.path}`,
      level: 'warning',
      entityId: callback.id,
    });
    return callback;
  }

  private resolveSession(input: RecordOastCallbackInput): OastSession {
    if (input.sessionId) {
      const session = this.store.state.oastSessions[input.sessionId];
      if (!session) {
        throw new Error(`OAST session not found: ${input.sessionId}`);
      }
      return session;
    }
    if (!input.token) {
      throw new Error('OAST callback requires token or sessionId');
    }
    const session = Object.values(this.store.state.oastSessions).find((item) => item.token === input.token);
    if (!session) {
      throw new Error('OAST callback token was not found');
    }
    return session;
  }

  private assertRun(runId: string): void {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
  }
}
