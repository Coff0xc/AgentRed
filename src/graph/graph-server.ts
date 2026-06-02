import { newId, nowIso } from '../domain/ids.js';
import type {
  CreateRunInput,
  Fact,
  GraphSnapshot,
  Hint,
  Intent,
  RiskLevel,
  Run,
} from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { PlatformStore } from '../storage/store.js';

export class GraphServer {
  constructor(
    private readonly store: PlatformStore,
    private readonly events?: RunEventService,
  ) {}

  createRun(input: CreateRunInput): Run {
    const run: Run = {
      id: newId('run'),
      target: input.target,
      goal: input.goal,
      scopePolicy: input.scopePolicy,
      workerPool: input.workerPool,
      status: 'active',
      createdAt: nowIso(),
    };
    this.store.state.runs[run.id] = run;
    this.events?.record({
      runId: run.id,
      type: 'run.created',
      title: 'Run created',
      detail: `Goal: ${input.goal}`,
      entityId: run.id,
    });
    this.addFactInternal({
      runId: run.id,
      statement: `Origin target: ${input.target}`,
      evidenceIds: [],
      confidence: 'confirmed',
      createdBy: 'system.origin',
    });
    this.addFactInternal({
      runId: run.id,
      statement: `Goal: ${input.goal}`,
      evidenceIds: [],
      confidence: 'confirmed',
      createdBy: 'system.goal',
    });
    this.store.commit();
    return run;
  }

  getRun(runId: string): Run {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }

  getGraph(runId: string): GraphSnapshot {
    const run = this.getRun(runId);
    return {
      run,
      facts: Object.values(this.store.state.facts).filter((item) => item.runId === runId),
      intents: Object.values(this.store.state.intents).filter((item) => item.runId === runId),
      hints: Object.values(this.store.state.hints).filter((item) => item.runId === runId),
      evidence: Object.values(this.store.state.evidence).filter((item) => item.runId === runId),
      findings: Object.values(this.store.state.findings).filter((item) => item.runId === runId),
    };
  }

  addHint(runId: string, text: string): Hint {
    this.getRun(runId);
    const hint: Hint = { id: newId('hint'), runId, text, createdAt: nowIso() };
    this.store.state.hints[hint.id] = hint;
    this.events?.record({
      runId,
      type: 'hint.added',
      title: 'Human hint added',
      detail: text,
      entityId: hint.id,
    });
    this.store.commit();
    return hint;
  }

  addFact(input: {
    runId: string;
    fromIntentId?: string;
    statement: string;
    evidenceIds?: string[];
    createdBy: string;
  }): Fact {
    this.getRun(input.runId);
    const fact = this.addFactInternal({
      ...input,
      evidenceIds: input.evidenceIds ?? [],
      confidence: 'likely',
    });
    this.store.commit();
    return fact;
  }

  createIntent(input: {
    runId: string;
    fromFactIds: string[];
    hypothesis: string;
    riskLevel: RiskLevel;
    createdBy: string;
  }): Intent {
    this.getRun(input.runId);
    const intent: Intent = {
      id: newId('intent'),
      runId: input.runId,
      fromFactIds: input.fromFactIds,
      hypothesis: input.hypothesis,
      riskLevel: input.riskLevel,
      status: 'open',
      createdBy: input.createdBy,
      createdAt: nowIso(),
    };
    this.store.state.intents[intent.id] = intent;
    this.events?.record({
      runId: input.runId,
      type: 'intent.created',
      title: 'Intent created',
      detail: input.hypothesis,
      entityId: intent.id,
    });
    this.store.commit();
    return intent;
  }

  concludeIntent(intentId: string, statement: string, createdBy: string, evidenceIds: string[] = []): Fact {
    const intent = this.store.state.intents[intentId];
    if (!intent) {
      throw new Error(`Intent not found: ${intentId}`);
    }
    intent.status = 'concluded';
    intent.concludedAt = nowIso();
    this.events?.record({
      runId: intent.runId,
      type: 'intent.concluded',
      title: 'Intent concluded',
      detail: statement,
      entityId: intent.id,
    });
    const fact = this.addFactInternal({
      runId: intent.runId,
      fromIntentId: intent.id,
      statement,
      evidenceIds,
      confidence: 'likely',
      createdBy,
    });
    this.store.commit();
    return fact;
  }

  claimIntent(intentId: string, workerName: string, leaseMs: number): Intent {
    const intent = this.getIntent(intentId);
    if (intent.status !== 'open' && intent.status !== 'released') {
      throw new Error(`Intent ${intentId} is not claimable`);
    }
    const now = Date.now();
    intent.status = 'claimed';
    intent.claimedBy = workerName;
    intent.leaseId = newId('lease');
    intent.heartbeatAt = new Date(now).toISOString();
    intent.leaseExpiresAt = new Date(now + leaseMs).toISOString();
    delete intent.releasedAt;
    delete intent.releaseReason;
    this.events?.record({
      runId: intent.runId,
      type: 'intent.claimed',
      title: 'Intent claimed by worker',
      detail: `${workerName} claimed ${intent.hypothesis}`,
      entityId: intent.id,
    });
    this.store.commit();
    return intent;
  }

  heartbeatIntent(intentId: string, leaseId: string, leaseMs: number): Intent {
    const intent = this.getIntent(intentId);
    if (intent.status !== 'claimed' || intent.leaseId !== leaseId) {
      throw new Error(`Intent lease mismatch: ${intentId}`);
    }
    const now = Date.now();
    if (intent.leaseExpiresAt && Date.parse(intent.leaseExpiresAt) < now) {
      throw new Error(`Intent lease expired: ${intentId}`);
    }
    intent.heartbeatAt = new Date(now).toISOString();
    intent.leaseExpiresAt = new Date(now + leaseMs).toISOString();
    this.events?.record({
      runId: intent.runId,
      type: 'intent.heartbeat',
      title: 'Intent lease heartbeat',
      detail: intent.claimedBy ? `${intent.claimedBy} extended its lease` : 'Lease extended',
      entityId: intent.id,
    });
    this.store.commit();
    return intent;
  }

  releaseIntent(intentId: string, reason: string): Intent {
    const intent = this.getIntent(intentId);
    if (intent.status === 'concluded') {
      return intent;
    }
    intent.status = 'released';
    intent.releaseReason = reason;
    intent.releasedAt = nowIso();
    delete intent.leaseExpiresAt;
    this.events?.record({
      runId: intent.runId,
      type: 'intent.released',
      title: 'Intent released',
      detail: reason,
      level: 'warning',
      entityId: intent.id,
    });
    this.store.commit();
    return intent;
  }

  releaseExpiredIntents(runId: string, now: Date = new Date()): Intent[] {
    this.getRun(runId);
    const released: Intent[] = [];
    for (const intent of Object.values(this.store.state.intents)) {
      if (intent.runId !== runId || intent.status !== 'claimed' || !intent.leaseExpiresAt) {
        continue;
      }
      if (Date.parse(intent.leaseExpiresAt) >= now.getTime()) {
        continue;
      }
      intent.status = 'open';
      intent.releaseReason = `Lease expired for ${intent.claimedBy ?? 'unknown worker'}`;
      intent.releasedAt = now.toISOString();
      delete intent.leaseExpiresAt;
      this.events?.record({
        runId,
        type: 'intent.released',
        title: 'Intent lease expired',
        detail: intent.releaseReason,
        level: 'warning',
        entityId: intent.id,
      });
      released.push(intent);
    }
    if (released.length > 0) {
      this.store.commit();
    }
    return released;
  }

  completeRun(runId: string): Run {
    const run = this.getRun(runId);
    run.status = 'completed';
    run.completedAt = nowIso();
    this.events?.record({
      runId,
      type: 'run.completed',
      title: 'Run completed',
      detail: `Run ${runId} completed`,
      entityId: runId,
    });
    this.store.commit();
    return run;
  }

  private addFactInternal(input: {
    runId: string;
    fromIntentId?: string;
    statement: string;
    evidenceIds: string[];
    confidence: Fact['confidence'];
    createdBy: string;
  }): Fact {
    const fact: Fact = {
      id: newId('fact'),
      runId: input.runId,
      fromIntentId: input.fromIntentId,
      statement: input.statement,
      evidenceIds: input.evidenceIds,
      confidence: input.confidence,
      createdBy: input.createdBy,
      createdAt: nowIso(),
    };
    this.store.state.facts[fact.id] = fact;
    this.events?.record({
      runId: input.runId,
      type: 'fact.added',
      title: 'Fact added',
      detail: input.statement,
      entityId: fact.id,
    });
    return fact;
  }

  private getIntent(intentId: string): Intent {
    const intent = this.store.state.intents[intentId];
    if (!intent) {
      throw new Error(`Intent not found: ${intentId}`);
    }
    return intent;
  }
}
