import { newId, nowIso } from '../domain/ids.js';
import type { ProxySession } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { PlatformStore } from '../storage/store.js';

export class ProxySessionService {
  constructor(
    private readonly store: PlatformStore,
    private readonly events?: RunEventService,
  ) {}

  start(input: { runId: string; proxyUrl: string }): ProxySession {
    this.assertRun(input.runId);
    const session: ProxySession = {
      id: newId('proxysession'),
      runId: input.runId,
      status: 'active',
      proxyUrl: input.proxyUrl,
      requiredHeaders: {
        'X-Capture-Run-Id': input.runId,
        'X-Platform-Token': '<local token>',
      },
      limitations: ['HTTP absolute-form only', 'CONNECT/TLS interception is not implemented'],
      createdAt: nowIso(),
    };
    this.store.state.proxySessions[session.id] = session;
    this.store.commit();
    this.events?.record({
      runId: input.runId,
      type: 'proxy.session.started',
      title: 'Proxy session started',
      detail: session.proxyUrl,
      entityId: session.id,
    });
    return session;
  }

  list(runId: string): ProxySession[] {
    this.assertRun(runId);
    return Object.values(this.store.state.proxySessions)
      .filter((session) => session.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  close(sessionId: string): ProxySession {
    const session = this.store.state.proxySessions[sessionId];
    if (!session) {
      throw new Error(`Proxy session not found: ${sessionId}`);
    }
    if (session.status === 'closed') {
      return session;
    }
    session.status = 'closed';
    session.closedAt = nowIso();
    this.store.commit();
    this.events?.record({
      runId: session.runId,
      type: 'proxy.session.closed',
      title: 'Proxy session closed',
      entityId: session.id,
    });
    return session;
  }

  hasActive(runId: string): boolean {
    return Object.values(this.store.state.proxySessions).some(
      (session) => session.runId === runId && session.status === 'active',
    );
  }

  private assertRun(runId: string): void {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
  }
}
