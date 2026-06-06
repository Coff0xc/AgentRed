import type { Intent, WorkerConfig, WorkerRole } from '../domain/types.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { Dispatcher, DispatchResult } from '../dispatcher/dispatcher.js';
import { nowIso } from '../domain/ids.js';

export interface ParallelDispatchResult {
  runId: string;
  dispatchedAt: string;
  mode: 'parallel';
  dispatches: Array<{
    intentId: string;
    intentRole?: WorkerRole;
    worker: string;
    workerRole?: WorkerRole;
    result: DispatchResult;
  }>;
  summary: {
    total: number;
    dispatched: number;
    blocked: number;
    failed: number;
    skipped: number;
  };
}

export interface ParallelDispatchStrategy {
  /** Maximum number of intents to dispatch in parallel. Default: 3 */
  maxParallel?: number;
  /** Whether to require role matching for parallel dispatch. Default: true */
  requireRoleMatch?: boolean;
  /** Whether to allow generalist workers to claim specialized intents. Default: true */
  allowGeneralistFallback?: boolean;
}

export class ParallelDispatchService {
  constructor(
    private readonly graph: GraphServer,
    private readonly dispatcher: Dispatcher,
  ) {}

  /**
   * Dispatch multiple open intents in parallel, prioritizing role-matched workers.
   * This enables Scout/Exploit/Credential workers to operate concurrently on different
   * exploration paths within the same run.
   */
  async dispatchParallel(
    runId: string,
    strategy: ParallelDispatchStrategy = {},
  ): Promise<ParallelDispatchResult> {
    const maxParallel = strategy.maxParallel ?? 3;
    const requireRoleMatch = strategy.requireRoleMatch ?? true;
    const allowGeneralistFallback = strategy.allowGeneralistFallback ?? true;

    const snapshot = this.graph.getGraph(runId);
    if (snapshot.run.status !== 'active') {
      return {
        runId,
        dispatchedAt: nowIso(),
        mode: 'parallel',
        dispatches: [],
        summary: { total: 0, dispatched: 0, blocked: 0, failed: 0, skipped: 0 },
      };
    }

    // Release expired intents first
    this.graph.releaseExpiredIntents(runId);

    // Get all claimable intents (open or released)
    const claimableIntents = snapshot.intents
      .filter((intent) => intent.status === 'open' || intent.status === 'released')
      .slice(0, maxParallel);

    if (claimableIntents.length === 0) {
      return {
        runId,
        dispatchedAt: nowIso(),
        mode: 'parallel',
        dispatches: [],
        summary: { total: 0, dispatched: 0, blocked: 0, failed: 0, skipped: 0 },
      };
    }

    // Group workers by role
    const workersByRole = this.groupWorkersByRole(snapshot.run.workerPool);

    // Match intents to workers based on role
    const assignments = this.assignIntentsToWorkers(
      claimableIntents,
      workersByRole,
      requireRoleMatch,
      allowGeneralistFallback,
    );

    // Dispatch each assignment
    const dispatches: ParallelDispatchResult['dispatches'] = [];
    for (const assignment of assignments) {
      // Note: We don't actually dispatch here because the current Dispatcher.dispatchOnce
      // is designed to handle one intent at a time. Instead, we return the plan.
      // The actual parallel dispatch would need to be implemented by the caller
      // (e.g., Autopilot) by calling dispatchOnce multiple times in parallel.
      dispatches.push({
        intentId: assignment.intent.id,
        intentRole: assignment.intent.role,
        worker: assignment.worker.name,
        workerRole: assignment.worker.role,
        result: { status: 'skipped', reason: 'parallel dispatch plan only' },
      });
    }

    const summary = {
      total: claimableIntents.length,
      dispatched: 0,
      blocked: 0,
      failed: 0,
      skipped: dispatches.length,
    };

    return {
      runId,
      dispatchedAt: nowIso(),
      mode: 'parallel',
      dispatches,
      summary,
    };
  }

  private groupWorkersByRole(workerPool: WorkerConfig[]): Map<WorkerRole | 'unspecified', WorkerConfig[]> {
    const groups = new Map<WorkerRole | 'unspecified', WorkerConfig[]>();
    for (const worker of workerPool) {
      const role = worker.role ?? 'unspecified';
      if (!groups.has(role)) {
        groups.set(role, []);
      }
      groups.get(role)!.push(worker);
    }
    return groups;
  }

  private assignIntentsToWorkers(
    intents: Intent[],
    workersByRole: Map<WorkerRole | 'unspecified', WorkerConfig[]>,
    requireRoleMatch: boolean,
    allowGeneralistFallback: boolean,
  ): Array<{ intent: Intent; worker: WorkerConfig }> {
    const assignments: Array<{ intent: Intent; worker: WorkerConfig }> = [];
    const usedWorkers = new Set<string>();

    for (const intent of intents) {
      const intentRole = intent.role;
      let worker: WorkerConfig | undefined;

      // Try exact role match first if intent has a role
      if (intentRole) {
        const roleWorkers = workersByRole.get(intentRole) ?? [];
        worker = roleWorkers.find((w) => !usedWorkers.has(w.name));
      }

      // Try generalist fallback if enabled
      if (!worker && allowGeneralistFallback) {
        const generalists = workersByRole.get('generalist') ?? [];
        worker = generalists.find((w) => !usedWorkers.has(w.name));
      }

      // Try unspecified workers (no role)
      if (!worker) {
        const unspecified = workersByRole.get('unspecified') ?? [];
        worker = unspecified.find((w) => !usedWorkers.has(w.name));
      }

      // If still no match and we don't require role match, try any available worker
      if (!worker && !requireRoleMatch) {
        for (const [_, workers] of workersByRole) {
          worker = workers.find((w) => !usedWorkers.has(w.name));
          if (worker) break;
        }
      }

      if (worker) {
        assignments.push({ intent, worker });
        usedWorkers.add(worker.name);
      }
    }

    return assignments;
  }

  /**
   * Get a preview of how intents would be assigned to workers for parallel dispatch
   * without actually dispatching them.
   */
  async previewParallelDispatch(
    runId: string,
    strategy: ParallelDispatchStrategy = {},
  ): Promise<{
    runId: string;
    mode: 'parallel_preview';
    assignments: Array<{
      intent: { id: string; role?: WorkerRole; hypothesis: string };
      worker: { name: string; role?: WorkerRole; type: string } | null;
      reason: string;
    }>;
    unassigned: Array<{ id: string; role?: WorkerRole; hypothesis: string; reason: string }>;
  }> {
    const maxParallel = strategy.maxParallel ?? 3;
    const requireRoleMatch = strategy.requireRoleMatch ?? true;
    const allowGeneralistFallback = strategy.allowGeneralistFallback ?? true;

    const snapshot = this.graph.getGraph(runId);
    this.graph.releaseExpiredIntents(runId);

    const claimableIntents = snapshot.intents
      .filter((intent) => intent.status === 'open' || intent.status === 'released')
      .slice(0, maxParallel);

    const workersByRole = this.groupWorkersByRole(snapshot.run.workerPool);
    const assignments = this.assignIntentsToWorkers(
      claimableIntents,
      workersByRole,
      requireRoleMatch,
      allowGeneralistFallback,
    );

    const assignedIntentIds = new Set(assignments.map((a) => a.intent.id));
    const unassigned = claimableIntents
      .filter((intent) => !assignedIntentIds.has(intent.id))
      .map((intent) => ({
        id: intent.id,
        role: intent.role,
        hypothesis: intent.hypothesis,
        reason: intent.role
          ? `No available ${intent.role} worker or generalist found`
          : 'No available worker found',
      }));

    return {
      runId,
      mode: 'parallel_preview',
      assignments: assignments.map((a) => ({
        intent: {
          id: a.intent.id,
          role: a.intent.role,
          hypothesis: a.intent.hypothesis,
        },
        worker: {
          name: a.worker.name,
          role: a.worker.role,
          type: a.worker.type,
        },
        reason:
          a.intent.role === a.worker.role
            ? 'Exact role match'
            : a.worker.role === 'generalist'
              ? 'Generalist fallback'
              : a.worker.role
                ? `Role mismatch: ${a.worker.role} handling ${a.intent.role ?? 'unspecified'}`
                : 'Unspecified worker role',
      })),
      unassigned,
    };
  }
}
