import { newId, nowIso } from '../domain/ids.js';
import type { BrowserSession, RiskLevel } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import { evaluateScope } from '../scope/policy.js';
import { redactHeaders, redactText, redactUrl } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

const DEFAULT_USER_AGENT = 'AuthorizedAIPentestPlatform/0.1 local-browser-controller';

export interface BrowserNavigateInput {
  sessionId?: string;
  runId: string;
  target: string;
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  riskLevel?: RiskLevel;
}

export class BrowserSessionService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly events?: RunEventService,
  ) {}

  start(input: { runId: string; startUrl?: string }): BrowserSession {
    this.assertRun(input.runId);
    if (input.startUrl) {
      this.assertInScope(input.runId, input.startUrl, 'GET', 'R1');
    }
    const session: BrowserSession = {
      id: newId('browsersession'),
      runId: input.runId,
      status: 'active',
      mode: 'local_fetch_controller',
      currentUrl: input.startUrl,
      userAgent: DEFAULT_USER_AGENT,
      limitations: ['HTTP fetch controller only', 'No JavaScript DOM execution yet', 'No TLS MITM certificate handling yet'],
      createdAt: nowIso(),
    };
    this.store.state.browserSessions[session.id] = session;
    this.store.commit();
    this.events?.record({
      runId: input.runId,
      type: 'browser.session.started',
      title: 'Browser session started',
      detail: input.startUrl ? redactUrl(input.startUrl) : undefined,
      entityId: session.id,
    });
    return session;
  }

  list(runId: string): BrowserSession[] {
    this.assertRun(runId);
    return Object.values(this.store.state.browserSessions)
      .filter((session) => session.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async navigate(input: BrowserNavigateInput) {
    const method = (input.method ?? 'GET').toUpperCase();
    const run = this.assertRun(input.runId);
    const session = input.sessionId ? this.getActiveSession(input.sessionId) : this.getOrCreateSession(input.runId, input.target);
    if (session.runId !== input.runId) {
      throw new Error(`Browser session ${session.id} does not belong to run ${input.runId}`);
    }
    this.assertInScope(input.runId, input.target, method, input.riskLevel ?? 'R1');
    const headers = { 'user-agent': session.userAgent, ...(input.headers ?? {}) };
    const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 10_000, 100), 30_000);
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'http_exchange',
      content: JSON.stringify({
        source: 'browser-controller',
        sessionId: session.id,
        mode: session.mode,
        request: {
          method,
          target: redactUrl(input.target),
          headers: redactHeaders(headers),
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: redactHeaders(Object.fromEntries(response.headers.entries())),
          bodyPreview: redactText(body).slice(0, 4096),
          bodyTruncated: body.length > 4096,
        },
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    session.currentUrl = input.target;
    session.lastNavigatedAt = nowIso();
    this.store.commit();
    this.events?.record({
      runId: input.runId,
      type: 'browser.session.navigated',
      title: 'Browser session navigated',
      detail: redactUrl(input.target),
      entityId: session.id,
    });
    return { session, evidence };
  }

  close(sessionId: string): BrowserSession {
    const session = this.store.state.browserSessions[sessionId];
    if (!session) {
      throw new Error(`Browser session not found: ${sessionId}`);
    }
    if (session.status === 'closed') {
      return session;
    }
    session.status = 'closed';
    session.closedAt = nowIso();
    this.store.commit();
    this.events?.record({
      runId: session.runId,
      type: 'browser.session.closed',
      title: 'Browser session closed',
      entityId: session.id,
    });
    return session;
  }

  private getOrCreateSession(runId: string, startUrl: string): BrowserSession {
    return this.list(runId).find((session) => session.status === 'active') ?? this.start({ runId, startUrl });
  }

  private getActiveSession(sessionId: string): BrowserSession {
    const session = this.store.state.browserSessions[sessionId];
    if (!session) {
      throw new Error(`Browser session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new Error(`Browser session is not active: ${sessionId}`);
    }
    return session;
  }

  private assertRun(runId: string) {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }

  private assertInScope(runId: string, target: string, method: string, riskLevel: RiskLevel): void {
    const run = this.assertRun(runId);
    const decision = evaluateScope(run.scopePolicy, target, method, riskLevel);
    if (decision.action !== 'allow') {
      throw new Error(decision.reason);
    }
  }
}
