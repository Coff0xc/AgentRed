import type { DispatchResult, Dispatcher } from '../dispatcher/dispatcher.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { PlatformStore } from '../storage/store.js';
import type { StrategyRecommendation, StrategyService } from '../strategy/strategy-service.js';

export type AutopilotTickStatus =
  | 'dispatched'
  | 'queued_and_dispatched'
  | 'waiting_approval'
  | 'waiting_worker'
  | 'operator_review_required'
  | 'stopped'
  | 'skipped';

export interface AutopilotTickResult {
  runId: string;
  status: AutopilotTickStatus;
  reason?: string;
  recommendationId?: string;
  recommendationTitle?: string;
  intentId?: string;
  dispatch?: DispatchResult;
}

export class AutopilotService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly strategy: StrategyService,
    private readonly dispatcher: Dispatcher,
    private readonly events?: RunEventService,
  ) {}

  async tick(runId: string): Promise<AutopilotTickResult> {
    this.graph.releaseExpiredIntents(runId);
    const snapshot = this.graph.getGraph(runId);
    if (snapshot.run.status !== 'active') {
      return this.result(runId, { status: 'stopped', reason: 'run is not active' });
    }

    const pendingApprovals = Object.values(this.store.state.approvals).filter(
      (approval) => approval.runId === runId && approval.status === 'pending',
    );
    if (pendingApprovals.length > 0) {
      return this.result(runId, {
        status: 'waiting_approval',
        reason: `${pendingApprovals.length} pending approval(s) must be decided before autopilot continues`,
      });
    }

    const activeLease = snapshot.intents.find((intent) => intent.status === 'claimed');
    if (activeLease) {
      return this.result(runId, {
        status: 'waiting_worker',
        reason: `${activeLease.claimedBy ?? 'Worker'} is still exploring ${activeLease.id}`,
        intentId: activeLease.id,
      });
    }

    const queuedIntent = snapshot.intents.find((intent) => intent.status === 'open' || intent.status === 'released');
    if (queuedIntent) {
      const dispatch = await this.dispatcher.dispatchOnce(runId);
      return this.result(runId, {
        status: 'dispatched',
        reason: dispatchReason(dispatch),
        intentId: queuedIntent.id,
        dispatch,
      });
    }

    const recommendation = this.nextAutomatableRecommendation(runId);
    if (!recommendation) {
      return this.result(runId, {
        status: 'operator_review_required',
        reason: 'No automatable strategy recommendation is available; operator review is required',
      });
    }
    const queued = this.strategy.queueRecommendationIntent(runId, recommendation.id);
    const dispatch = await this.dispatcher.dispatchOnce(runId);
    return this.result(runId, {
      status: 'queued_and_dispatched',
      reason: dispatchReason(dispatch),
      recommendationId: queued.recommendation.id,
      recommendationTitle: queued.recommendation.title,
      intentId: queued.intent.id,
      dispatch,
    });
  }

  private nextAutomatableRecommendation(runId: string): StrategyRecommendation | undefined {
    const brief = this.strategy.getBrief(runId);
    // Only pick recommendations that explicitly match the current phase.
    // This prevents autopilot from issuing R2 surface probes before baseline evidence exists,
    // or jumping to report generation while candidate findings are still unvalidated.
    return brief.recommendations.find(
      (r) => r.toolRequest && r.phase === brief.currentPhase,
    );
  }

  private result(runId: string, result: Omit<AutopilotTickResult, 'runId'>): AutopilotTickResult {
    const detailParts = [
      result.reason,
      result.recommendationTitle ? `Recommendation: ${result.recommendationTitle}` : undefined,
      result.intentId ? `Intent: ${result.intentId}` : undefined,
      result.dispatch ? `Dispatch: ${result.dispatch.status}` : undefined,
    ].filter(Boolean);
    this.events?.record({
      runId,
      type: 'autopilot.tick',
      title: 'Autopilot tick',
      detail: detailParts.join(' | ') || result.status,
      level: result.status === 'waiting_approval' || result.status === 'operator_review_required' ? 'warning' : 'info',
      entityId: result.intentId,
    });
    return { runId, ...result };
  }
}

function dispatchReason(dispatch: DispatchResult): string | undefined {
  return 'reason' in dispatch ? dispatch.reason : undefined;
}
