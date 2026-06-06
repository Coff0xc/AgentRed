import { newId, nowIso } from '../domain/ids.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { Intent } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import type { RunEventService } from '../events/run-event-service.js';
import { GraphSerializer, type SerializedGraph } from './graph-serializer.js';

export type RestoreStrategy = 'resume' | 'replay' | 'branch';
export type CheckpointTrigger = 'manual' | 'auto_interval' | 'pre_shutdown' | 'pre_timeout';

export interface RunCheckpoint {
  id: string;
  runId: string;
  checkpointId: string;
  timestamp: string;
  trigger: CheckpointTrigger;
  dispatchCount: number;
  graphSnapshot: SerializedGraph;
  pendingIntentIds: string[];
  completedIntentIds: string[];
  releasedIntentIds: string[];
  workerState: Record<string, unknown>;
  evidenceBlobRefs: string[];
  metadata: {
    factCount: number;
    intentCount: number;
    evidenceCount: number;
    findingCount: number;
    compressionRatio: number;
  };
  createdAt: string;
}

export interface CheckpointListEntry {
  id: string;
  checkpointId: string;
  timestamp: string;
  trigger: CheckpointTrigger;
  dispatchCount: number;
  factCount: number;
  intentCount: number;
  evidenceCount: number;
  findingCount: number;
  sizeBytes: number;
  createdAt: string;
}

export interface RestoreResult {
  checkpointId: string;
  strategy: RestoreStrategy;
  runId: string;
  restoredAt: string;
  dispatchCount: number;
  resumedFromTimestamp: string;
}

export interface CheckpointServiceOptions {
  maxCheckpointsPerRun?: number;
  autoCheckpointInterval?: number;
  compressGraphs?: boolean;
  events?: RunEventService;
}

export class CheckpointService {
  private readonly serializer: GraphSerializer;
  private readonly maxCheckpointsPerRun: number;
  private readonly autoCheckpointInterval: number;
  private readonly compressGraphs: boolean;
  private readonly events?: RunEventService;
  private readonly dispatchCounters: Map<string, number>;

  constructor(
    private readonly graph: GraphServer,
    private readonly store: PlatformStore,
    options: CheckpointServiceOptions = {},
  ) {
    this.serializer = new GraphSerializer();
    this.maxCheckpointsPerRun = options.maxCheckpointsPerRun ?? 10;
    this.autoCheckpointInterval = options.autoCheckpointInterval ?? 10;
    this.compressGraphs = options.compressGraphs ?? true;
    this.events = options.events;
    this.dispatchCounters = new Map();
  }

  /**
   * Create a checkpoint for a run
   */
  async createCheckpoint(runId: string, trigger: CheckpointTrigger = 'manual'): Promise<RunCheckpoint> {
    const run = this.graph.getRun(runId);
    if (run.status !== 'active') {
      throw new Error(`Cannot checkpoint completed or stopped run: ${runId}`);
    }

    const snapshot = this.graph.getGraph(runId);
    const serialized = this.serializer.serialize(snapshot, this.compressGraphs);

    const dispatchCount = this.dispatchCounters.get(runId) ?? 0;
    const pendingIntentIds = snapshot.intents.filter((i) => i.status === 'open' || i.status === 'released').map((i) => i.id);
    const completedIntentIds = snapshot.intents.filter((i) => i.status === 'concluded').map((i) => i.id);
    const releasedIntentIds = snapshot.intents.filter((i) => i.status === 'released').map((i) => i.id);
    const evidenceBlobRefs = snapshot.evidence.map((e) => e.id);

    const compressionRatio = serialized.compressed
      ? serialized.uncompressedSizeBytes / serialized.sizeBytes
      : 1.0;

    const checkpoint: RunCheckpoint = {
      id: newId('checkpoint'),
      runId,
      checkpointId: newId('ckpt'),
      timestamp: nowIso(),
      trigger,
      dispatchCount,
      graphSnapshot: serialized,
      pendingIntentIds,
      completedIntentIds,
      releasedIntentIds,
      workerState: {},
      evidenceBlobRefs,
      metadata: {
        factCount: snapshot.facts.length,
        intentCount: snapshot.intents.length,
        evidenceCount: snapshot.evidence.length,
        findingCount: snapshot.findings.length,
        compressionRatio,
      },
      createdAt: nowIso(),
    };

    // Store in platform state
    if (!this.store.state.checkpoints) {
      (this.store.state as any).checkpoints = {};
    }
    (this.store.state as any).checkpoints[checkpoint.id] = checkpoint;

    // Clean up old checkpoints
    await this.cleanupOldCheckpoints(runId);

    this.store.commit();

    this.events?.record({
      runId,
      type: 'checkpoint.created' as any,
      title: 'Checkpoint created',
      detail: `Checkpoint ${checkpoint.checkpointId} created (trigger: ${trigger}, dispatch: ${dispatchCount})`,
      entityId: checkpoint.id,
    });

    return checkpoint;
  }

  /**
   * List checkpoints for a run
   */
  async listCheckpoints(runId: string): Promise<CheckpointListEntry[]> {
    const checkpoints = this.getCheckpointsForRun(runId);

    return checkpoints
      .map((cp) => ({
        id: cp.id,
        checkpointId: cp.checkpointId,
        timestamp: cp.timestamp,
        trigger: cp.trigger,
        dispatchCount: cp.dispatchCount,
        factCount: cp.metadata.factCount,
        intentCount: cp.metadata.intentCount,
        evidenceCount: cp.metadata.evidenceCount,
        findingCount: cp.metadata.findingCount,
        sizeBytes: cp.graphSnapshot.sizeBytes,
        createdAt: cp.createdAt,
      }))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Get a specific checkpoint
   */
  async getCheckpoint(checkpointId: string): Promise<RunCheckpoint> {
    const checkpoints = (this.store.state as any).checkpoints ?? {};
    const checkpoint = Object.values(checkpoints).find((cp: any) => cp.checkpointId === checkpointId) as
      | RunCheckpoint
      | undefined;

    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    return checkpoint;
  }

  /**
   * Restore from a checkpoint
   */
  async restoreCheckpoint(checkpointId: string, strategy: RestoreStrategy): Promise<RestoreResult> {
    const checkpoint = await this.getCheckpoint(checkpointId);
    const snapshot = this.serializer.deserialize(checkpoint.graphSnapshot);

    switch (strategy) {
      case 'resume':
        return await this.restoreResume(checkpoint, snapshot);
      case 'replay':
        return await this.restoreReplay(checkpoint, snapshot);
      case 'branch':
        return await this.restoreBranch(checkpoint, snapshot);
      default:
        throw new Error(`Unknown restore strategy: ${strategy}`);
    }
  }

  /**
   * Check if auto-checkpoint should be triggered for a run
   */
  shouldAutoCheckpoint(runId: string): boolean {
    const dispatchCount = this.dispatchCounters.get(runId) ?? 0;
    return dispatchCount > 0 && dispatchCount % this.autoCheckpointInterval === 0;
  }

  /**
   * Increment dispatch counter for a run
   */
  incrementDispatchCount(runId: string): number {
    const current = this.dispatchCounters.get(runId) ?? 0;
    const next = current + 1;
    this.dispatchCounters.set(runId, next);
    return next;
  }

  /**
   * Get current dispatch count for a run
   */
  getDispatchCount(runId: string): number {
    return this.dispatchCounters.get(runId) ?? 0;
  }

  /**
   * Resume strategy: restore state and continue from checkpoint
   */
  private async restoreResume(checkpoint: RunCheckpoint, snapshot: any): Promise<RestoreResult> {
    const runId = checkpoint.runId;

    // Restore run state
    this.store.state.runs[runId] = snapshot.run;

    // Clear existing graph entities for this run
    for (const factId of Object.keys(this.store.state.facts)) {
      if (this.store.state.facts[factId].runId === runId) {
        delete this.store.state.facts[factId];
      }
    }
    for (const intentId of Object.keys(this.store.state.intents)) {
      if (this.store.state.intents[intentId].runId === runId) {
        delete this.store.state.intents[intentId];
      }
    }
    for (const hintId of Object.keys(this.store.state.hints)) {
      if (this.store.state.hints[hintId].runId === runId) {
        delete this.store.state.hints[hintId];
      }
    }
    for (const evidenceId of Object.keys(this.store.state.evidence)) {
      if (this.store.state.evidence[evidenceId].runId === runId) {
        delete this.store.state.evidence[evidenceId];
      }
    }
    for (const findingId of Object.keys(this.store.state.findings)) {
      if (this.store.state.findings[findingId].runId === runId) {
        delete this.store.state.findings[findingId];
      }
    }

    // Restore graph entities from checkpoint
    for (const fact of snapshot.facts) {
      this.store.state.facts[fact.id] = fact;
    }
    for (const intent of snapshot.intents) {
      this.store.state.intents[intent.id] = intent;
    }
    for (const hint of snapshot.hints) {
      this.store.state.hints[hint.id] = hint;
    }
    for (const evidence of snapshot.evidence) {
      this.store.state.evidence[evidence.id] = evidence;
    }
    for (const finding of snapshot.findings) {
      this.store.state.findings[finding.id] = finding;
    }

    // Restore dispatch counter
    this.dispatchCounters.set(runId, checkpoint.dispatchCount);

    this.store.commit();

    this.events?.record({
      runId,
      type: 'checkpoint.restored' as any,
      title: 'Checkpoint restored',
      detail: `Resumed from checkpoint ${checkpoint.checkpointId} (strategy: resume)`,
      entityId: checkpoint.id,
    });

    return {
      checkpointId: checkpoint.checkpointId,
      strategy: 'resume',
      runId,
      restoredAt: nowIso(),
      dispatchCount: checkpoint.dispatchCount,
      resumedFromTimestamp: checkpoint.timestamp,
    };
  }

  /**
   * Replay strategy: restore state and replay dispatch history
   */
  private async restoreReplay(checkpoint: RunCheckpoint, snapshot: any): Promise<RestoreResult> {
    // For now, replay is the same as resume
    // In a full implementation, this would re-execute dispatches
    return await this.restoreResume(checkpoint, snapshot);
  }

  /**
   * Branch strategy: create a new run from checkpoint state
   */
  private async restoreBranch(checkpoint: RunCheckpoint, snapshot: any): Promise<RestoreResult> {
    const originalRunId = checkpoint.runId;
    const newRunId = newId('run');

    // Create new run based on original
    const newRun = {
      ...snapshot.run,
      id: newRunId,
      status: 'active' as const,
      createdAt: nowIso(),
      completedAt: undefined,
    };
    this.store.state.runs[newRunId] = newRun;

    // Clone graph entities with new runId
    const idMap = new Map<string, string>();

    for (const fact of snapshot.facts) {
      const newFactId = newId('fact');
      idMap.set(fact.id, newFactId);
      this.store.state.facts[newFactId] = {
        ...fact,
        id: newFactId,
        runId: newRunId,
        createdAt: nowIso(),
      };
    }

    for (const intent of snapshot.intents) {
      const newIntentId = newId('intent');
      idMap.set(intent.id, newIntentId);
      this.store.state.intents[newIntentId] = {
        ...intent,
        id: newIntentId,
        runId: newRunId,
        fromFactIds: intent.fromFactIds.map((fid: string) => idMap.get(fid) ?? fid),
        status: intent.status === 'concluded' ? 'concluded' : 'open',
        claimedBy: undefined,
        leaseId: undefined,
        heartbeatAt: undefined,
        leaseExpiresAt: undefined,
        createdAt: nowIso(),
      };
    }

    for (const hint of snapshot.hints) {
      const newHintId = newId('hint');
      this.store.state.hints[newHintId] = {
        ...hint,
        id: newHintId,
        runId: newRunId,
        createdAt: nowIso(),
      };
    }

    // Evidence and findings reference original IDs
    for (const evidence of snapshot.evidence) {
      const newEvidenceId = newId('evidence');
      idMap.set(evidence.id, newEvidenceId);
      this.store.state.evidence[newEvidenceId] = {
        ...evidence,
        id: newEvidenceId,
        runId: newRunId,
        createdAt: nowIso(),
      };
    }

    for (const finding of snapshot.findings) {
      const newFindingId = newId('finding');
      this.store.state.findings[newFindingId] = {
        ...finding,
        id: newFindingId,
        runId: newRunId,
        evidenceIds: finding.evidenceIds.map((eid: string) => idMap.get(eid) ?? eid),
        createdAt: nowIso(),
      };
    }

    // Reset dispatch counter for new run
    this.dispatchCounters.set(newRunId, 0);

    this.store.commit();

    this.events?.record({
      runId: newRunId,
      type: 'checkpoint.restored' as any,
      title: 'Checkpoint branched',
      detail: `Branched from checkpoint ${checkpoint.checkpointId} of run ${originalRunId}`,
      entityId: checkpoint.id,
    });

    return {
      checkpointId: checkpoint.checkpointId,
      strategy: 'branch',
      runId: newRunId,
      restoredAt: nowIso(),
      dispatchCount: 0,
      resumedFromTimestamp: checkpoint.timestamp,
    };
  }

  /**
   * Clean up old checkpoints, keeping only the most recent N
   */
  private async cleanupOldCheckpoints(runId: string): Promise<void> {
    const checkpoints = this.getCheckpointsForRun(runId);

    if (checkpoints.length <= this.maxCheckpointsPerRun) {
      return;
    }

    // Sort by timestamp descending
    const sorted = checkpoints.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Remove oldest checkpoints
    const toRemove = sorted.slice(this.maxCheckpointsPerRun);
    const checkpointsStore = (this.store.state as any).checkpoints;

    for (const checkpoint of toRemove) {
      delete checkpointsStore[checkpoint.id];
    }
  }

  /**
   * Get all checkpoints for a run
   */
  private getCheckpointsForRun(runId: string): RunCheckpoint[] {
    const checkpoints = (this.store.state as any).checkpoints ?? {};
    return Object.values(checkpoints).filter((cp: any) => cp.runId === runId) as RunCheckpoint[];
  }

  /**
   * Delete a specific checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const checkpoint = await this.getCheckpoint(checkpointId);
    const checkpointsStore = (this.store.state as any).checkpoints;
    delete checkpointsStore[checkpoint.id];
    this.store.commit();

    this.events?.record({
      runId: checkpoint.runId,
      type: 'checkpoint.deleted' as any,
      title: 'Checkpoint deleted',
      detail: `Checkpoint ${checkpointId} deleted`,
      entityId: checkpoint.id,
    });
  }

  /**
   * Delete all checkpoints for a run
   */
  async deleteAllCheckpoints(runId: string): Promise<number> {
    const checkpoints = this.getCheckpointsForRun(runId);
    const checkpointsStore = (this.store.state as any).checkpoints;

    for (const checkpoint of checkpoints) {
      delete checkpointsStore[checkpoint.id];
    }

    this.store.commit();
    return checkpoints.length;
  }
}
