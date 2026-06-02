import type { RunFlowBrief } from '../flow/run-flow-service.js';
import type { RunFlowService } from '../flow/run-flow-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { StrategyService } from '../strategy/strategy-service.js';
import type { AttackSurfaceService } from '../surface/attack-surface-service.js';
import type {
  ApprovalRequest,
  Evidence,
  EvidenceReview,
  Finding,
  Intent,
  RunEvent,
  RunPhase,
  ToolInvocation,
} from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';

export type AgentWorkbenchItemStatus = 'ready' | 'queued' | 'active' | 'blocked' | 'review' | 'done';

export interface AgentWorkbenchAction {
  id: string;
  label: string;
  kind:
    | 'dispatch'
    | 'autopilot_tick'
    | 'approval_review'
    | 'evidence_review'
    | 'finding_validation'
    | 'report'
    | 'strategy'
    | 'surface_frontier';
  entityId?: string;
  endpoint?: string;
}

export interface AgentWorkbenchItem {
  id: string;
  title: string;
  detail: string;
  status: AgentWorkbenchItemStatus;
  kind: string;
  entityId?: string;
  riskLevel?: string;
  evidenceIds?: string[];
  action?: AgentWorkbenchAction;
}

export interface AgentWorkbenchLane {
  id: string;
  title: string;
  status: AgentWorkbenchItemStatus;
  items: AgentWorkbenchItem[];
}

export interface AgentRunWorkbench {
  runId: string;
  generatedAt: string;
  target: string;
  goal: string;
  phase: RunPhase;
  summary: string;
  counts: {
    workers: number;
    facts: number;
    openIntents: number;
    claimedIntents: number;
    releasedIntents: number;
    evidence: number;
    unreviewedEvidence: number;
    findings: number;
    candidateFindings: number;
    confirmedFindings: number;
    pendingApprovals: number;
    blockedTools: number;
    strategyRecommendations: number;
    surfaceFrontier: number;
  };
  lanes: AgentWorkbenchLane[];
  blockers: string[];
  nextActions: AgentWorkbenchAction[];
  recentEvents: RunEvent[];
  safetyNotes: string[];
}

export class AgentWorkbenchService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly events: RunEventService,
    private readonly flow: RunFlowService,
    private readonly strategy: StrategyService,
    private readonly surface: AttackSurfaceService,
  ) {}

  getRunWorkbench(runId: string): AgentRunWorkbench {
    const snapshot = this.graph.getGraph(runId);
    const progress = this.events.progress(runId);
    const flowBrief = this.flow.getBrief(runId);
    const strategyBrief = this.strategy.getBrief(runId);
    const surfaceMap = this.surface.getMap(runId);
    const approvals = byRun(Object.values(this.store.state.approvals), runId);
    const toolInvocations = byRun(Object.values(this.store.state.toolInvocations), runId);
    const evidenceReviews = byRun(Object.values(this.store.state.evidenceReviews), runId);
    const activeEvidence = snapshot.evidence.filter((item) => item.kind !== 'replay_bundle');
    const candidateFindings = snapshot.findings.filter((item) => item.validationState === 'candidate');
    const confirmedFindings = snapshot.findings.filter((item) => item.validationState === 'confirmed');
    const pendingApprovals = approvals.filter((item) => item.status === 'pending');
    const blockedTools = toolInvocations.filter((item) => item.status === 'blocked');
    const unreviewedEvidence = activeEvidence.filter(
      (evidence) => !evidenceReviews.some((review) => review.evidenceId === evidence.id),
    );
    const counts = {
      workers: snapshot.run.workerPool.length,
      facts: snapshot.facts.length,
      openIntents: snapshot.intents.filter((item) => item.status === 'open').length,
      claimedIntents: snapshot.intents.filter((item) => item.status === 'claimed').length,
      releasedIntents: snapshot.intents.filter((item) => item.status === 'released').length,
      evidence: activeEvidence.length,
      unreviewedEvidence: unreviewedEvidence.length,
      findings: snapshot.findings.length,
      candidateFindings: candidateFindings.length,
      confirmedFindings: confirmedFindings.length,
      pendingApprovals: pendingApprovals.length,
      blockedTools: blockedTools.length,
      strategyRecommendations: strategyBrief.recommendations.length,
      surfaceFrontier: surfaceMap.frontier.length,
    };
    return {
      runId,
      generatedAt: new Date().toISOString(),
      target: snapshot.run.target,
      goal: snapshot.run.goal,
      phase: progress.phase,
      summary: workbenchSummary(flowBrief, counts),
      counts,
      lanes: [
        runLane(snapshot.run.target, snapshot.run.goal, progress.lastEvent),
        workerLane(snapshot.intents, snapshot.run.workerPool),
        strategyLane(strategyBrief.recommendations, surfaceMap.frontier),
        gatewayLane(pendingApprovals, blockedTools, toolInvocations),
        evidenceLane(activeEvidence, evidenceReviews, snapshot.findings),
        deliveryLane(snapshot.findings, activeEvidence, evidenceReviews),
      ],
      blockers: blockers(pendingApprovals, blockedTools, unreviewedEvidence, candidateFindings),
      nextActions: nextActions(flowBrief, pendingApprovals, unreviewedEvidence, candidateFindings, confirmedFindings, snapshot.evidence),
      recentEvents: this.events.list(runId).slice(-8),
      safetyNotes: [
        'Agent Workbench is a read-only operator view over graph, event, strategy, surface, evidence, and finding state.',
        'Workbench actions point back to existing Dispatcher, Tool Gateway, evidence review, finding validation, and report APIs.',
        'No Worker-to-Worker messaging, raw tool execution, scope changes, approvals, or finding confirmation happen through this read model.',
      ],
    };
  }
}

function runLane(target: string, goal: string, lastEvent?: RunEvent): AgentWorkbenchLane {
  return {
    id: 'run_context',
    title: 'Run Context',
    status: lastEvent ? 'active' : 'ready',
    items: [
      {
        id: 'run_target',
        title: 'Target',
        detail: target,
        status: 'ready',
        kind: 'target',
      },
      {
        id: 'run_goal',
        title: 'Goal',
        detail: goal,
        status: 'ready',
        kind: 'goal',
      },
      {
        id: 'run_last_event',
        title: 'Last event',
        detail: lastEvent ? `${lastEvent.title}${lastEvent.detail ? `: ${lastEvent.detail}` : ''}` : 'No events recorded yet.',
        status: lastEvent ? 'active' : 'ready',
        kind: 'event',
        entityId: lastEvent?.id,
      },
    ],
  };
}

function workerLane(intents: Intent[], workers: Array<{ name: string; type: string; priority: number; maxRunning: number }>): AgentWorkbenchLane {
  const intentItems = [...intents]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
    .slice(0, 8)
    .map((intent) => ({
      id: `intent_${intent.id}`,
      title: intent.status === 'claimed' ? `Active intent: ${intent.claimedBy ?? 'worker'}` : `Intent: ${intent.status}`,
      detail: intent.releaseReason ? `${intent.hypothesis} (${intent.releaseReason})` : intent.hypothesis,
      status: intentWorkbenchStatus(intent),
      kind: 'intent',
      entityId: intent.id,
      riskLevel: intent.riskLevel,
      action:
        intent.status === 'open' || intent.status === 'released'
          ? {
              id: `dispatch_${intent.id}`,
              label: 'Dispatch Agent Worker',
              kind: 'dispatch' as const,
              entityId: intent.id,
              endpoint: '/runs/{id}/dispatch',
            }
          : undefined,
    }));
  return {
    id: 'worker_loop',
    title: 'Worker Loop',
    status: laneStatus(intentItems),
    items: [
      ...workers.map((worker) => ({
        id: `worker_${worker.name}`,
        title: `${worker.name} (${worker.type})`,
        detail: `priority=${worker.priority}, maxRunning=${worker.maxRunning}`,
        status: 'ready' as const,
        kind: 'worker',
      })),
      ...intentItems,
    ],
  };
}

function strategyLane(
  recommendations: Array<{ id: string; title: string; rationale: string; riskLevel: string; toolRequest?: unknown }>,
  frontier: Array<{ id: string; title: string; rationale: string; riskLevel: string; priority: string; suggestedTool?: string }>,
): AgentWorkbenchLane {
  const recommendationItems = recommendations.map((item) => ({
    id: `strategy_${item.id}`,
    title: item.title,
    detail: item.rationale,
    status: item.toolRequest ? ('ready' as const) : ('review' as const),
    kind: 'strategy',
    entityId: item.id,
    riskLevel: item.riskLevel,
    action: {
      id: `strategy_${item.id}_action`,
      label: item.toolRequest ? 'Preview or run recommendation' : 'Operator review',
      kind: 'strategy' as const,
      entityId: item.id,
    },
  }));
  const frontierItems = frontier.slice(0, 5).map((item) => ({
    id: `frontier_${item.id}`,
    title: item.title,
    detail: `${item.priority}: ${item.rationale}`,
    status: item.suggestedTool ? ('ready' as const) : ('queued' as const),
    kind: 'surface_frontier',
    entityId: item.id,
    riskLevel: item.riskLevel,
    action: {
      id: `frontier_${item.id}_action`,
      label: item.suggestedTool ? 'Act on frontier' : 'Queue frontier intent',
      kind: 'surface_frontier' as const,
      entityId: item.id,
    },
  }));
  const items = [...recommendationItems, ...frontierItems];
  return {
    id: 'strategy_frontier',
    title: 'Strategy And Search Frontier',
    status: items.length > 0 ? laneStatus(items) : 'ready',
    items: items.length > 0 ? items : [emptyLaneItem('strategy_empty', 'No current recommendations', 'Dispatch or add evidence to generate next actions.')],
  };
}

function gatewayLane(
  pendingApprovals: ApprovalRequest[],
  blockedTools: ToolInvocation[],
  toolInvocations: ToolInvocation[],
): AgentWorkbenchLane {
  const approvalItems = pendingApprovals.map((approval) => ({
    id: `approval_${approval.id}`,
    title: `Approval needed: ${approval.tool}`,
    detail: approval.reason,
    status: 'blocked' as const,
    kind: 'approval',
    entityId: approval.id,
    riskLevel: approval.riskLevel,
    action: {
      id: `approval_${approval.id}_review`,
      label: 'Review approval',
      kind: 'approval_review' as const,
      entityId: approval.id,
    },
  }));
  const blockedItems = blockedTools.slice(-5).map((tool) => ({
    id: `blocked_tool_${tool.id}`,
    title: `Blocked: ${tool.tool}`,
    detail: tool.reason ?? `${tool.method} ${tool.target}`,
    status: 'blocked' as const,
    kind: 'tool_invocation',
    entityId: tool.id,
    riskLevel: tool.riskLevel,
  }));
  const recentAllowed = toolInvocations
    .filter((tool) => tool.status === 'allowed')
    .slice(-4)
    .map((tool) => ({
      id: `tool_${tool.id}`,
      title: `Allowed: ${tool.tool}`,
      detail: `${tool.method} ${tool.target}`,
      status: 'done' as const,
      kind: 'tool_invocation',
      entityId: tool.id,
      riskLevel: tool.riskLevel,
    }));
  const items = [...approvalItems, ...blockedItems, ...recentAllowed];
  return {
    id: 'tool_gateway',
    title: 'Tool Gateway',
    status: laneStatus(items),
    items: items.length > 0 ? items : [emptyLaneItem('tool_gateway_empty', 'No tool calls yet', 'Tool requests will appear here after Worker or operator actions.')],
  };
}

function evidenceLane(evidence: Evidence[], reviews: EvidenceReview[], findings: Finding[]): AgentWorkbenchLane {
  const evidenceItems = evidence.slice(-6).map((item) => {
    const review = reviews.find((candidate) => candidate.evidenceId === item.id);
    return {
      id: `evidence_${item.id}`,
      title: `${item.kind} evidence`,
      detail: `${item.redactionState}${review ? `, review=${review.status}` : ', review=pending'}`,
      status: review ? ('done' as const) : ('review' as const),
      kind: 'evidence',
      entityId: item.id,
      evidenceIds: [item.id],
      action: review
        ? undefined
        : {
            id: `evidence_${item.id}_review`,
            label: 'Review evidence',
            kind: 'evidence_review' as const,
            entityId: item.id,
          },
    };
  });
  const findingItems = findings.slice(-4).map((finding) => ({
    id: `finding_${finding.id}`,
    title: finding.title,
    detail: `${finding.severity}, ${finding.confidence}, ${finding.validationState}`,
    status: finding.validationState === 'confirmed' ? ('done' as const) : ('review' as const),
    kind: 'finding',
    entityId: finding.id,
    evidenceIds: finding.evidenceIds,
    action:
      finding.validationState === 'candidate'
        ? {
            id: `finding_${finding.id}_validate`,
            label: 'Validate finding',
            kind: 'finding_validation' as const,
            entityId: finding.id,
          }
        : undefined,
  }));
  const items = [...evidenceItems, ...findingItems];
  return {
    id: 'evidence_findings',
    title: 'Evidence And Findings',
    status: laneStatus(items),
    items: items.length > 0 ? items : [emptyLaneItem('evidence_empty', 'No evidence yet', 'Capture in-scope evidence before proposing findings.')],
  };
}

function deliveryLane(findings: Finding[], evidence: Evidence[], reviews: EvidenceReview[]): AgentWorkbenchLane {
  const confirmed = findings.filter((finding) => finding.validationState === 'confirmed');
  const candidate = findings.filter((finding) => finding.validationState === 'candidate');
  const usefulEvidence = evidence.filter((item) =>
    reviews.some((review) => review.evidenceId === item.id && review.status === 'useful'),
  );
  return {
    id: 'delivery',
    title: 'Delivery Readiness',
    status: confirmed.length > 0 ? 'ready' : candidate.length > 0 ? 'review' : 'queued',
    items: [
      {
        id: 'delivery_evidence',
        title: 'Useful evidence',
        detail: `${usefulEvidence.length}/${evidence.length} evidence item(s) reviewed as useful.`,
        status: usefulEvidence.length > 0 ? 'done' : 'queued',
        kind: 'delivery_gate',
      },
      {
        id: 'delivery_findings',
        title: 'Finding validation',
        detail: `${confirmed.length} confirmed, ${candidate.length} candidate.`,
        status: confirmed.length > 0 ? 'done' : candidate.length > 0 ? 'review' : 'queued',
        kind: 'delivery_gate',
        action:
          candidate.length > 0
            ? { id: 'delivery_validate_findings', label: 'Validate findings', kind: 'finding_validation' }
            : undefined,
      },
      {
        id: 'delivery_report',
        title: 'Report handoff',
        detail: confirmed.length > 0 ? 'Confirmed findings can be exported into a report bundle.' : 'Report waits for confirmed findings.',
        status: confirmed.length > 0 ? 'ready' : 'queued',
        kind: 'delivery_gate',
        action: confirmed.length > 0 ? { id: 'delivery_report_generate', label: 'Generate report', kind: 'report' } : undefined,
      },
    ],
  };
}

function workbenchSummary(flow: RunFlowBrief, counts: AgentRunWorkbench['counts']): string {
  return [
    `Phase: ${flow.phase}.`,
    `${counts.openIntents + counts.releasedIntents} queued intent(s), ${counts.claimedIntents} active intent(s).`,
    `${counts.evidence} evidence item(s), ${counts.unreviewedEvidence} awaiting review.`,
    `${counts.pendingApprovals} pending approval(s), ${counts.blockedTools} blocked tool call(s).`,
  ].join(' ');
}

function blockers(
  pendingApprovals: ApprovalRequest[],
  blockedTools: ToolInvocation[],
  unreviewedEvidence: Evidence[],
  candidateFindings: Finding[],
): string[] {
  const notes: string[] = [];
  if (pendingApprovals.length > 0) {
    notes.push(`${pendingApprovals.length} approval request(s) are waiting for an operator decision.`);
  }
  if (blockedTools.length > 0) {
    notes.push(`${blockedTools.length} tool invocation(s) were blocked by scope, risk, policy, or readiness gates.`);
  }
  if (unreviewedEvidence.length > 0) {
    notes.push(`${unreviewedEvidence.length} evidence item(s) need review before commercial reporting.`);
  }
  if (candidateFindings.length > 0) {
    notes.push(`${candidateFindings.length} candidate finding(s) need human validation.`);
  }
  return notes;
}

function nextActions(
  flow: RunFlowBrief,
  pendingApprovals: ApprovalRequest[],
  unreviewedEvidence: Evidence[],
  candidateFindings: Finding[],
  confirmedFindings: Finding[],
  evidence: Evidence[],
): AgentWorkbenchAction[] {
  if (pendingApprovals.length > 0) {
    return pendingApprovals.slice(0, 3).map((approval) => ({
      id: `review_${approval.id}`,
      label: `Review approval for ${approval.tool}`,
      kind: 'approval_review',
      entityId: approval.id,
    }));
  }
  if (unreviewedEvidence.length > 0) {
    return unreviewedEvidence.slice(0, 3).map((item) => ({
      id: `review_${item.id}`,
      label: `Review ${item.kind} evidence`,
      kind: 'evidence_review',
      entityId: item.id,
    }));
  }
  if (candidateFindings.length > 0) {
    return candidateFindings.slice(0, 3).map((finding) => ({
      id: `validate_${finding.id}`,
      label: `Validate ${finding.title}`,
      kind: 'finding_validation',
      entityId: finding.id,
    }));
  }
  if (confirmedFindings.length > 0) {
    return [{ id: 'generate_report', label: 'Generate commercial report bundle', kind: 'report', endpoint: '/reports' }];
  }
  if (evidence.length === 0) {
    return [{ id: 'autopilot_tick', label: 'Run one controlled Autopilot Tick', kind: 'autopilot_tick', endpoint: '/runs/{id}/autopilot/tick' }];
  }
  return flow.nextActions.slice(0, 3).map((action, index) => ({
    id: `flow_next_${index + 1}`,
    label: action,
    kind: 'strategy',
  }));
}

function intentWorkbenchStatus(intent: Intent): AgentWorkbenchItemStatus {
  if (intent.status === 'claimed') return 'active';
  if (intent.status === 'concluded') return 'done';
  if (intent.status === 'released') return 'queued';
  return 'queued';
}

function laneStatus(items: Array<{ status: AgentWorkbenchItemStatus }>): AgentWorkbenchItemStatus {
  if (items.some((item) => item.status === 'blocked')) return 'blocked';
  if (items.some((item) => item.status === 'active')) return 'active';
  if (items.some((item) => item.status === 'review')) return 'review';
  if (items.some((item) => item.status === 'ready')) return 'ready';
  if (items.some((item) => item.status === 'queued')) return 'queued';
  return 'done';
}

function emptyLaneItem(id: string, title: string, detail: string): AgentWorkbenchItem {
  return { id, title, detail, status: 'queued', kind: 'empty' };
}

function byRun<T extends { runId: string }>(items: T[], runId: string): T[] {
  return items.filter((item) => item.runId === runId);
}
