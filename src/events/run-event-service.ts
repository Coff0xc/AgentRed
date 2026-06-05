import { newId, nowIso } from '../domain/ids.js';
import type { RunEvent, RunEventLevel, RunEventType, RunPhase, RunProgress } from '../domain/types.js';
import { redactText } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';
import type { ProgressWebSocketServer } from './progress-websocket-server.js';

export class RunEventService {
  constructor(
    private readonly store: PlatformStore,
    private readonly wsServer?: ProgressWebSocketServer,
  ) {}

  record(input: {
    runId: string;
    type: RunEventType;
    title: string;
    detail?: string;
    level?: RunEventLevel;
    entityId?: string;
  }): RunEvent {
    if (!this.store.state.runs[input.runId]) {
      throw new Error(`Run not found: ${input.runId}`);
    }
    const event: RunEvent = {
      id: newId('event'),
      runId: input.runId,
      type: input.type,
      title: redactText(input.title),
      detail: input.detail ? redactText(input.detail) : undefined,
      level: input.level ?? 'info',
      entityId: input.entityId,
      createdAt: nowIso(),
    };
    this.store.state.runEvents[event.id] = event;
    this.store.commit();

    // Broadcast to WebSocket subscribers (non-blocking)
    // Failures do not affect event persistence
    if (this.wsServer) {
      try {
        this.wsServer.broadcast(input.runId, {
          type: input.type,
          runId: input.runId,
          timestamp: event.createdAt,
          data: {
            id: event.id,
            title: event.title,
            detail: event.detail,
            level: event.level,
            entityId: event.entityId,
          },
        });
      } catch (error) {
        // WebSocket broadcast failures are logged but do not throw
        console.error('[RunEventService] WebSocket broadcast failed:', error);
      }
    }

    return event;
  }

  list(runId: string): RunEvent[] {
    this.assertRun(runId);
    return Object.values(this.store.state.runEvents)
      .filter((event) => event.runId === runId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  }

  progress(runId: string): RunProgress {
    const run = this.assertRun(runId);
    const facts = Object.values(this.store.state.facts).filter((item) => item.runId === runId);
    const hints = Object.values(this.store.state.hints).filter((item) => item.runId === runId);
    const intents = Object.values(this.store.state.intents).filter((item) => item.runId === runId);
    const evidence = Object.values(this.store.state.evidence).filter((item) => item.runId === runId);
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId);
    const approvals = Object.values(this.store.state.approvals).filter((item) => item.runId === runId);
    const tools = Object.values(this.store.state.toolInvocations).filter((item) => item.runId === runId);
    const events = this.list(runId);

    return {
      runId,
      status: run.status,
      phase: derivePhase(run.status, facts.length, intents, approvals),
      counts: {
        facts: facts.length,
        hints: hints.length,
        intents: {
          total: intents.length,
          open: intents.filter((item) => item.status === 'open').length,
          claimed: intents.filter((item) => item.status === 'claimed').length,
          released: intents.filter((item) => item.status === 'released').length,
          concluded: intents.filter((item) => item.status === 'concluded').length,
        },
        evidence: evidence.length,
        findings: findings.length,
        approvals: {
          total: approvals.length,
          pending: approvals.filter((item) => item.status === 'pending').length,
          approved: approvals.filter((item) => item.status === 'approved').length,
          rejected: approvals.filter((item) => item.status === 'rejected').length,
        },
        tools: {
          total: tools.length,
          allowed: tools.filter((item) => item.status === 'allowed').length,
          blocked: tools.filter((item) => item.status === 'blocked').length,
          approvalRequired: tools.filter((item) => item.status === 'approval_required').length,
        },
        reports: evidence.filter((item) => item.kind === 'replay_bundle').length,
      },
      lastEvent: events.at(-1),
    };
  }

  private assertRun(runId: string) {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }
}

function derivePhase(
  status: RunProgress['status'],
  factCount: number,
  intents: Array<{ status: string }>,
  approvals: Array<{ status: string }>,
): RunPhase {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'stopped') {
    return 'stopped';
  }
  if (approvals.some((item) => item.status === 'pending')) {
    return 'awaiting_approval';
  }
  if (intents.some((item) => item.status === 'claimed')) {
    return 'exploring';
  }
  if (intents.some((item) => item.status === 'open' || item.status === 'released')) {
    return 'queued';
  }
  if (factCount <= 2) {
    return 'bootstrapping';
  }
  return 'reasoning';
}
