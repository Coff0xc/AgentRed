import type { RiskLevel, SearchFrontierItem } from '../domain/types.js';
import type { DispatchResult, Dispatcher } from '../dispatcher/dispatcher.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { PlatformStore } from '../storage/store.js';
import type { AttackSurfaceService } from '../surface/attack-surface-service.js';
import type { StrategyRecommendation, StrategyService } from './strategy-service.js';

export type SearchPlanSource =
  | 'approval'
  | 'worker_intent'
  | 'evidence_review'
  | 'finding_validation'
  | 'tool_blocker'
  | 'strategy'
  | 'surface_frontier'
  | 'reporting';

export type SearchPlanItemStatus = 'blocked' | 'active' | 'queued' | 'ready' | 'review' | 'manual';
export type SearchPlanAutomation = 'dispatch' | 'queue_intent' | 'tool_gateway' | 'operator_review' | 'report' | 'none';

export interface SearchPlanItem {
  id: string;
  source: SearchPlanSource;
  title: string;
  rationale: string;
  status: SearchPlanItemStatus;
  automation: SearchPlanAutomation;
  score: number;
  riskLevel: RiskLevel;
  entityId?: string;
  suggestedTool?: string;
  suggestedTemplate?: string;
  blockers: string[];
}

export interface RunSearchPlan {
  runId: string;
  generatedAt: string;
  mode: 'dispatcher_state_space_search';
  summary: string;
  topItem?: SearchPlanItem;
  items: SearchPlanItem[];
  counts: {
    total: number;
    blocked: number;
    active: number;
    ready: number;
    review: number;
    automatable: number;
  };
  scoringNotes: string[];
  safetyNotes: string[];
}

export type SearchPlanAdvanceStatus =
  | 'dispatched'
  | 'queued_and_dispatched'
  | 'operator_review_required'
  | 'waiting_worker'
  | 'stopped'
  | 'skipped';

export interface SearchPlanAdvanceResult {
  runId: string;
  status: SearchPlanAdvanceStatus;
  item?: SearchPlanItem;
  reason?: string;
  intentId?: string;
  dispatch?: DispatchResult;
}

export class SearchPlanService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly strategy: StrategyService,
    private readonly surface: AttackSurfaceService,
    private readonly dispatcher?: Dispatcher,
    private readonly events?: RunEventService,
  ) {}

  async advance(runId: string): Promise<SearchPlanAdvanceResult> {
    this.graph.releaseExpiredIntents(runId);
    const run = this.graph.getRun(runId);
    if (run.status !== 'active') {
      return this.recordAdvance(runId, { status: 'stopped', reason: 'run is not active' });
    }
    const plan = this.getPlan(runId);
    const item = plan.topItem;
    if (!item) {
      return this.recordAdvance(runId, { status: 'skipped', reason: 'search plan is empty' });
    }
    if (item.status === 'active') {
      return this.recordAdvance(runId, {
        status: 'waiting_worker',
        item,
        reason: item.blockers[0] ?? 'an Agent Worker lease is still active',
      });
    }
    if (item.automation === 'dispatch') {
      if (!this.dispatcher) {
        return this.recordAdvance(runId, { status: 'skipped', item, reason: 'dispatcher is not configured' });
      }
      const dispatch = await this.dispatcher.dispatchOnce(runId);
      return this.recordAdvance(runId, {
        status: 'dispatched',
        item,
        reason: dispatchReason(dispatch),
        intentId: item.entityId,
        dispatch,
      });
    }
    if (item.automation === 'queue_intent' || item.automation === 'tool_gateway') {
      if (!this.dispatcher) {
        return this.recordAdvance(runId, { status: 'skipped', item, reason: 'dispatcher is not configured' });
      }
      const queued = this.queueItemIntent(runId, item);
      if (!queued) {
        return this.recordAdvance(runId, {
          status: 'operator_review_required',
          item,
          reason: 'search item cannot be safely converted into an Agent Worker intent',
        });
      }
      const dispatch = await this.dispatcher.dispatchOnce(runId);
      return this.recordAdvance(runId, {
        status: 'queued_and_dispatched',
        item,
        reason: dispatchReason(dispatch),
        intentId: queued.intentId,
        dispatch,
      });
    }
    return this.recordAdvance(runId, {
      status: 'operator_review_required',
      item,
      reason: `${item.source} requires operator review before autonomous progress continues`,
    });
  }

  getPlan(runId: string): RunSearchPlan {
    const snapshot = this.graph.getGraph(runId);
    const strategy = this.strategy.getBrief(runId);
    const surface = this.surface.getMap(runId);
    const approvals = Object.values(this.store.state.approvals).filter((item) => item.runId === runId);
    const toolInvocations = Object.values(this.store.state.toolInvocations).filter((item) => item.runId === runId);
    const evidenceReviews = Object.values(this.store.state.evidenceReviews).filter((item) => item.runId === runId);
    const activeEvidence = snapshot.evidence.filter((item) => item.kind !== 'replay_bundle');
    const reviewedEvidenceIds = new Set(evidenceReviews.map((item) => item.evidenceId));
    const items: SearchPlanItem[] = [
      ...approvals
        .filter((approval) => approval.status === 'pending')
        .map((approval) => ({
          id: `approval.${approval.id}`,
          source: 'approval' as const,
          title: `Review approval for ${approval.tool}`,
          rationale: approval.reason,
          status: 'blocked' as const,
          automation: 'operator_review' as const,
          score: 100,
          riskLevel: approval.riskLevel,
          entityId: approval.id,
          suggestedTool: approval.tool,
          blockers: ['Pending approval pauses higher-risk autonomous progress.'],
        })),
      ...snapshot.intents
        .filter((intent) => intent.status === 'claimed')
        .map((intent) => ({
          id: `intent.active.${intent.id}`,
          source: 'worker_intent' as const,
          title: `Wait for active Worker intent`,
          rationale: intent.hypothesis,
          status: 'active' as const,
          automation: 'none' as const,
          score: 95,
          riskLevel: intent.riskLevel,
          entityId: intent.id,
          blockers: [`${intent.claimedBy ?? 'Worker'} currently owns this lease.`],
        })),
      ...snapshot.intents
        .filter((intent) => intent.status === 'open' || intent.status === 'released')
        .map((intent, index) => ({
          id: `intent.queue.${intent.id}`,
          source: 'worker_intent' as const,
          title: 'Dispatch queued intent',
          rationale: intent.releaseReason ? `${intent.hypothesis} (${intent.releaseReason})` : intent.hypothesis,
          status: 'queued' as const,
          automation: 'dispatch' as const,
          score: 90 - index * 2 - riskPenalty(intent.riskLevel),
          riskLevel: intent.riskLevel,
          entityId: intent.id,
          blockers: [],
        })),
      ...activeEvidence
        .filter((evidence) => !reviewedEvidenceIds.has(evidence.id))
        .slice(-6)
        .map((evidence, index) => ({
          id: `evidence.review.${evidence.id}`,
          source: 'evidence_review' as const,
          title: `Review ${evidence.kind} evidence`,
          rationale: 'Evidence must be triaged before it can support confirmed findings or commercial reports.',
          status: 'review' as const,
          automation: 'operator_review' as const,
          score: 78 - index,
          riskLevel: 'R0' as RiskLevel,
          entityId: evidence.id,
          blockers: [],
        })),
      ...snapshot.findings
        .filter((finding) => finding.validationState === 'candidate')
        .map((finding, index) => ({
          id: `finding.validate.${finding.id}`,
          source: 'finding_validation' as const,
          title: `Validate candidate finding: ${finding.title}`,
          rationale: 'Candidate findings must be confirmed or rejected before commercial report generation.',
          status: 'review' as const,
          automation: 'operator_review' as const,
          score: 76 - index,
          riskLevel: severityRisk(finding.severity),
          entityId: finding.id,
          blockers: [],
        })),
      ...toolInvocations
        .filter((tool) => tool.status === 'blocked')
        .slice(-5)
        .map((tool, index) => ({
          id: `tool.blocked.${tool.id}`,
          source: 'tool_blocker' as const,
          title: `Inspect blocked tool call: ${tool.tool}`,
          rationale: tool.reason ?? `${tool.method} ${tool.target}`,
          status: 'review' as const,
          automation: 'operator_review' as const,
          score: 66 - index,
          riskLevel: tool.riskLevel,
          entityId: tool.id,
          suggestedTool: tool.tool,
          blockers: ['Blocked tool calls reveal scope, policy, approval, or runtime gaps.'],
        })),
      ...strategy.recommendations.map(strategyItem),
      ...surface.frontier.map(frontierItem),
      ...reportingItems(snapshot.findings.length, snapshot.findings.filter((item) => item.validationState === 'confirmed').length),
    ].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

    const counts = {
      total: items.length,
      blocked: items.filter((item) => item.status === 'blocked').length,
      active: items.filter((item) => item.status === 'active').length,
      ready: items.filter((item) => item.status === 'ready' || item.status === 'queued').length,
      review: items.filter((item) => item.status === 'review').length,
      automatable: items.filter((item) => item.automation === 'dispatch' || item.automation === 'queue_intent' || item.automation === 'tool_gateway').length,
    };
    return {
      runId,
      generatedAt: new Date().toISOString(),
      mode: 'dispatcher_state_space_search',
      summary: `${counts.total} search item(s): ${counts.blocked} blocked, ${counts.active} active, ${counts.ready} ready/queued, ${counts.review} review item(s).`,
      topItem: items[0],
      items: items.slice(0, 20),
      counts,
      scoringNotes: [
        'Pending approvals and active Worker leases outrank new exploration.',
        'Queued intents outrank newly generated strategy/frontier items because they are already in the graph.',
        'Evidence review and candidate finding validation outrank fresh scanning when commercial delivery is close.',
        'Lower-risk R0/R1/R2 actions score higher than approval-gated R3 actions.',
      ],
      safetyNotes: [
        'This Search Plan response is read-only and does not dispatch Workers or execute tools.',
        'Search Plan Advance can move one automatable item only through Dispatcher-owned intent queueing and dispatch.',
        'Automatable means the item can be sent through existing Dispatcher, Strategy, Surface, or Tool Gateway APIs; it is not a permission grant.',
        'Workers still receive one task through the Dispatcher and cannot see raw tools or write graph state directly.',
      ],
    };
  }

  private queueItemIntent(runId: string, item: SearchPlanItem): { intentId: string } | undefined {
    if (item.source === 'strategy' && item.entityId) {
      const queued = this.strategy.queueRecommendationIntent(runId, item.entityId);
      return { intentId: queued.intent.id };
    }
    if (item.source === 'surface_frontier' && item.entityId) {
      const queued = this.surface.queueFrontierIntent(runId, item.entityId);
      return { intentId: queued.intent.id };
    }
    return undefined;
  }

  private recordAdvance(runId: string, result: Omit<SearchPlanAdvanceResult, 'runId'>): SearchPlanAdvanceResult {
    this.events?.record({
      runId,
      type: 'search.advance',
      title: 'Search Plan advance',
      detail: [
        result.status,
        result.item ? result.item.title : undefined,
        result.reason,
        result.dispatch ? `Dispatch: ${result.dispatch.status}` : undefined,
      ].filter(Boolean).join(' | '),
      level: result.status === 'operator_review_required' || result.status === 'waiting_worker' ? 'warning' : 'info',
      entityId: result.intentId ?? result.item?.entityId,
    });
    return { runId, ...result };
  }
}

function dispatchReason(dispatch: DispatchResult): string | undefined {
  return 'reason' in dispatch ? dispatch.reason : undefined;
}

function strategyItem(recommendation: StrategyRecommendation, index: number): SearchPlanItem {
  return {
    id: `strategy.${recommendation.id}`,
    source: 'strategy',
    title: recommendation.title,
    rationale: recommendation.rationale,
    status: recommendation.toolRequest ? 'ready' : 'manual',
    automation: recommendation.toolRequest ? 'queue_intent' : 'operator_review',
    score: 62 - index * 2 - riskPenalty(recommendation.riskLevel),
    riskLevel: recommendation.riskLevel,
    entityId: recommendation.id,
    suggestedTool: recommendation.toolRequest?.tool,
    suggestedTemplate: stringArg(recommendation.toolRequest?.args?.template),
    blockers: recommendation.toolRequest ? [] : ['No direct tool request is mapped; operator review is required.'],
  };
}

function frontierItem(frontier: SearchFrontierItem, index: number): SearchPlanItem {
  return {
    id: `frontier.${frontier.id}`,
    source: 'surface_frontier',
    title: frontier.title,
    rationale: frontier.rationale,
    status: frontier.suggestedTool ? 'ready' : 'queued',
    automation: frontier.suggestedTool ? 'tool_gateway' : 'queue_intent',
    score: priorityScore(frontier.priority) - index - riskPenalty(frontier.riskLevel),
    riskLevel: frontier.riskLevel,
    entityId: frontier.id,
    suggestedTool: frontier.suggestedTool,
    suggestedTemplate: frontier.suggestedTemplate,
    blockers: [],
  };
}

function reportingItems(totalFindings: number, confirmedFindings: number): SearchPlanItem[] {
  if (confirmedFindings === 0 || totalFindings === 0) {
    return [];
  }
  return [
    {
      id: 'report.generate',
      source: 'reporting',
      title: 'Generate commercial report bundle',
      rationale: `${confirmedFindings} confirmed finding(s) are available for report generation.`,
      status: 'ready',
      automation: 'report',
      score: 72,
      riskLevel: 'R0',
      blockers: [],
    },
  ];
}

function priorityScore(priority: SearchFrontierItem['priority']): number {
  if (priority === 'high') return 58;
  if (priority === 'medium') return 48;
  return 38;
}

function riskPenalty(riskLevel: RiskLevel): number {
  return { R0: 0, R1: 1, R2: 3, R3: 8, R4: 100 }[riskLevel];
}

function severityRisk(severity: string): RiskLevel {
  if (severity === 'critical' || severity === 'high') return 'R3';
  if (severity === 'medium') return 'R2';
  return 'R1';
}

function stringArg(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input : undefined;
}
