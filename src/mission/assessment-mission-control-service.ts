import { nowIso } from '../domain/ids.js';
import type { EvaluationCheckStatus, RiskLevel, RunPhase } from '../domain/types.js';
import type { AgentHarnessService } from '../agents/agent-harness-service.js';
import type { AgentWorkbenchAction, AgentWorkbenchService } from '../agents/agent-workbench-service.js';
import type { LocalRunnerWorkbenchService } from '../desktop/local-runner-workbench-service.js';
import type { LocalExecutionNodeService } from '../execution/local-execution-node-service.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { RunFlowService, RunFlowStep } from '../flow/run-flow-service.js';
import type { DeliveryReadinessService } from '../observability/delivery-readiness-service.js';
import type { EvidenceQualityService } from '../observability/evidence-quality-service.js';
import type { ReferenceBenchmarkService } from '../observability/reference-benchmark-service.js';
import type { RunCapabilityRadarService } from '../observability/run-capability-radar-service.js';
import type { PlatformStore } from '../storage/store.js';
import type { SearchPlanItem, SearchPlanService } from '../strategy/search-plan-service.js';
import type { ToolEcosystemWorkbenchService } from '../tools/tool-ecosystem-workbench-service.js';

export type MissionPosture =
  | 'on_track'
  | 'needs_operator'
  | 'collecting_evidence'
  | 'blocked'
  | 'ready_for_delivery';
export type MissionLaneStatus = 'ready' | 'active' | 'queued' | 'review' | 'warn' | 'blocked' | 'done';
export type MissionDecisionStatus = 'done' | 'active' | 'blocked' | 'review' | 'next';

export interface MissionLane {
  id: string;
  title: string;
  status: MissionLaneStatus;
  summary: string;
  signals: string[];
  nextActions: string[];
}

export interface MissionDecisionTrailItem {
  id: string;
  title: string;
  status: MissionDecisionStatus;
  detail: string;
  sourceRefs: string[];
  evidenceIds?: string[];
}

export interface MissionOperatorAction {
  label: string;
  actionKind: string;
  endpoint?: string;
  riskLevel: RiskLevel;
  reason: string;
  blockedBy: string[];
}

export interface MissionAcceptanceGate {
  id: string;
  title: string;
  status: EvaluationCheckStatus;
  detail: string;
}

export interface AssessmentMissionControlReport {
  runId: string;
  generatedAt: string;
  mode: 'assessment_mission_control';
  posture: MissionPosture;
  headline: string;
  currentObjective: string;
  currentReasoning: {
    phase: RunPhase;
    topSearchItem?: {
      title: string;
      rationale: string;
      source: string;
      automation: string;
      score: number;
      riskLevel: RiskLevel;
      blockers: string[];
    };
    selectedNextAction: string;
    whyNow: string[];
    stopConditions: string[];
  };
  progress: {
    facts: number;
    intents: number;
    evidence: number;
    reviewedEvidence: number;
    findings: number;
    confirmedFindings: number;
    pendingApprovals: number;
    blockedTools: number;
    runnableTemplates: number;
    healthyWorkers: number;
    deliveryStatus: string;
    harnessScore: number;
    referenceUsableDimensions: number;
  };
  lanes: MissionLane[];
  decisionTrail: MissionDecisionTrailItem[];
  operatorNextActions: MissionOperatorAction[];
  blockers: string[];
  acceptanceGates: MissionAcceptanceGate[];
  referenceAlignment: string[];
  safetyNotes: string[];
  audit: {
    readOnly: true;
    dispatchesWorkers: false;
    invokesTools: false;
    approvesActions: false;
    writesEvidence: false;
    validatesFindings: false;
    mutatesGraph: false;
  };
}

export class AssessmentMissionControlService {
  constructor(
    private readonly store: PlatformStore,
    private readonly events: RunEventService,
    private readonly flow: RunFlowService,
    private readonly workbench: AgentWorkbenchService,
    private readonly searchPlan: SearchPlanService,
    private readonly capabilityRadar: RunCapabilityRadarService,
    private readonly evidenceQuality: EvidenceQualityService,
    private readonly deliveryReadiness: DeliveryReadinessService,
    private readonly toolEcosystemWorkbench: ToolEcosystemWorkbenchService,
    private readonly executionNode: LocalExecutionNodeService,
    private readonly localRunnerWorkbench: LocalRunnerWorkbenchService,
    private readonly agentHarness: AgentHarnessService,
    private readonly referenceBenchmark: ReferenceBenchmarkService,
  ) {}

  async get(runId: string, baseUrl: string): Promise<AssessmentMissionControlReport> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const progress = this.events.progress(runId);
    const flow = this.flow.getBrief(runId);
    const [
      workbench,
      searchPlan,
      capabilityRadar,
      evidenceQuality,
      delivery,
      toolEcosystem,
      executionNode,
      localRunner,
      harness,
      referenceBenchmark,
    ] = await Promise.all([
      Promise.resolve(this.workbench.getRunWorkbench(runId)),
      Promise.resolve(this.searchPlan.getPlan(runId)),
      Promise.resolve(this.capabilityRadar.get(runId)),
      Promise.resolve(this.evidenceQuality.get(runId)),
      Promise.resolve(this.deliveryReadiness.get(runId)),
      this.toolEcosystemWorkbench.get(runId),
      this.executionNode.get(runId),
      Promise.resolve(this.localRunnerWorkbench.get(runId, baseUrl)),
      this.agentHarness.get(runId),
      this.referenceBenchmark.get(runId),
    ]);

    const counts = {
      facts: progress.counts.facts,
      intents: progress.counts.intents.total,
      evidence: evidenceQuality.counts.evidence,
      reviewedEvidence: evidenceQuality.counts.reviewedEvidence,
      findings: evidenceQuality.counts.findings,
      confirmedFindings: evidenceQuality.counts.confirmedFindings,
      pendingApprovals: progress.counts.approvals.pending,
      blockedTools: progress.counts.tools.blocked,
      runnableTemplates: toolEcosystem.counts.runnableTemplates,
      healthyWorkers: executionNode.counts.healthyWorkers,
      deliveryStatus: delivery.status,
      harnessScore: harness.score,
      referenceUsableDimensions: referenceBenchmark.counts.matched + referenceBenchmark.counts.usable,
    };
    const topItem = searchPlan.topItem;
    const blockers = [
      ...workbench.blockers,
      ...capabilityRadar.gaps.slice(0, 4),
      ...toolEcosystem.ecosystemGates
        .filter((gate) => gate.status === 'fail')
        .map((gate) => `${gate.title}: ${gate.detail}`),
      ...delivery.gates
        .filter((gate) => gate.status === 'fail')
        .map((gate) => `${gate.title}: ${gate.detail}`),
    ];
    const acceptanceGates = buildAcceptanceGates({
      runDestructiveAllowed: run.scopePolicy.destructiveAllowed,
      allowedAssets: run.scopePolicy.allowedAssets.length,
      counts,
      toolEcosystemPosture: toolEcosystem.posture,
      executionNodeStatus: executionNode.status,
      evidencePosture: evidenceQuality.posture,
      deliveryStatus: delivery.status,
      harnessPosture: harness.posture,
    });
    const posture = missionPosture(counts, progress.phase, run.status, delivery.status, evidenceQuality.posture, topItem);

    return {
      runId,
      generatedAt: nowIso(),
      mode: 'assessment_mission_control',
      posture,
      headline: headline(posture, counts, topItem),
      currentObjective: run.goal,
      currentReasoning: {
        phase: progress.phase,
        topSearchItem: topItem ? topSearchItem(topItem) : undefined,
        selectedNextAction: selectedNextAction(topItem, workbench.nextActions, delivery.nextActions),
        whyNow: whyNow(topItem, searchPlan.scoringNotes, counts, delivery.status),
        stopConditions: [
          'Stop or ask the operator when scope, risk, approval, rate-limit, runtime, or evidence gates block progress.',
          'Do not convert Worker text directly into Findings without same-run Evidence and review state.',
          'Do not introduce Worker-to-Worker messages, role trees, generic pentest RAG, or raw tool context.',
          'R3 actions need human approval; R4/destructive actions remain denied unless the run policy explicitly allows them.',
        ],
      },
      progress: counts,
      lanes: lanes({
        phase: progress.phase,
        counts,
        workbenchBlockers: workbench.blockers,
        searchPlanSummary: searchPlan.summary,
        topItem,
        toolEcosystemPosture: toolEcosystem.posture,
        executionNodeStatus: executionNode.status,
        localRunnerStatus: localRunner.status,
        evidenceSummary: evidenceQuality.summary,
        deliverySummary: delivery.summary.latestReportScope
          ? `Latest report scope: ${delivery.summary.latestReportScope}.`
          : delivery.nextActions[0] ?? 'No delivery action available.',
        harnessSummary: harness.summary,
      }),
      decisionTrail: decisionTrail(flow.steps, topItem),
      operatorNextActions: operatorNextActions(topItem, workbench.nextActions, delivery.nextActions, toolEcosystem.operatorNextActions),
      blockers: unique(blockers).slice(0, 10),
      acceptanceGates,
      referenceAlignment: [
        'Cairn: Mission Control keeps the state-space graph visible without becoming a second orchestrator.',
        'HexStrike/AutoRedTeam: tool breadth appears as governed ecosystem readiness, not raw tool sprawl.',
        'AIDA/WonderSuite/CyberStrike: operator sees browser/proxy/OAST, evidence review, and delivery status in one run view.',
        'CAI/Apex: trace, cost, leaderboard, scorecard, and eval readiness stay part of the mission picture.',
        'ai-engineering-from-scratch: Agent Harness, tool registry, verification gates, observation budget, sandbox boundary, and eval fixtures are productized as readiness gates.',
        'Android-Pentesting-Skill: specialization remains narrow and artifact-shaped; no generic pentest Skill is promoted.',
      ],
      safetyNotes: [
        'Mission Control is a read-only command surface; it does not dispatch Workers, run tools, approve actions, validate Findings, or mutate graph state.',
        'The selected next action is a decision aid. Execution must still go through Dispatcher, Search Plan Advance, Tool Gateway, evidence review, or report APIs.',
        'Cloud-facing summaries should use redacted evidence metadata; raw evidence remains local-first.',
      ],
      audit: {
        readOnly: true,
        dispatchesWorkers: false,
        invokesTools: false,
        approvesActions: false,
        writesEvidence: false,
        validatesFindings: false,
        mutatesGraph: false,
      },
    };
  }
}

function topSearchItem(item: SearchPlanItem): AssessmentMissionControlReport['currentReasoning']['topSearchItem'] {
  return {
    title: item.title,
    rationale: item.rationale,
    source: item.source,
    automation: item.automation,
    score: item.score,
    riskLevel: item.riskLevel,
    blockers: item.blockers,
  };
}

function missionPosture(
  counts: AssessmentMissionControlReport['progress'],
  phase: RunPhase,
  runStatus: string,
  deliveryStatus: string,
  evidencePosture: string,
  topItem: SearchPlanItem | undefined,
): MissionPosture {
  if (runStatus === 'stopped' || phase === 'stopped') return 'blocked';
  if (deliveryStatus === 'ready' && counts.confirmedFindings > 0) return 'ready_for_delivery';
  if (counts.pendingApprovals > 0 || counts.reviewedEvidence < counts.evidence || counts.findings > counts.confirmedFindings) {
    return 'needs_operator';
  }
  if (counts.healthyWorkers === 0 && counts.intents > 0) return 'blocked';
  if (counts.evidence === 0) return 'collecting_evidence';
  if (evidencePosture === 'blocked') return 'blocked';
  if (topItem && (topItem.status === 'blocked' || topItem.status === 'review' || topItem.automation === 'operator_review')) {
    return 'needs_operator';
  }
  return 'on_track';
}

function headline(
  posture: MissionPosture,
  counts: AssessmentMissionControlReport['progress'],
  topItem: SearchPlanItem | undefined,
): string {
  if (posture === 'ready_for_delivery') {
    return `${counts.confirmedFindings} confirmed finding(s) are ready for confirmed-scope delivery.`;
  }
  if (posture === 'needs_operator') {
    return 'Operator review is the current bottleneck before autonomous work should expand.';
  }
  if (posture === 'collecting_evidence') {
    return 'The run is still building its first evidence-backed branch.';
  }
  if (posture === 'blocked') {
    return 'Mission progress is blocked by safety, runtime, or evidence integrity gates.';
  }
  return topItem ? `Next best move: ${topItem.title}.` : 'Run is on track; keep advancing the state-space search.';
}

function selectedNextAction(
  topItem: SearchPlanItem | undefined,
  workbenchActions: AgentWorkbenchAction[],
  deliveryActions: string[],
): string {
  if (topItem) {
    if (topItem.automation === 'dispatch') return `Dispatch Worker for: ${topItem.rationale}`;
    if (topItem.automation === 'queue_intent') return `Queue and dispatch: ${topItem.title}`;
    if (topItem.automation === 'tool_gateway') return `Preview governed Tool Gateway action for: ${topItem.title}`;
    if (topItem.automation === 'operator_review') return `Operator review: ${topItem.title}`;
    return topItem.title;
  }
  if (workbenchActions[0]) return workbenchActions[0].label;
  if (deliveryActions[0]) return deliveryActions[0];
  return 'Add a human hint or advance the search plan when the run is active.';
}

function whyNow(
  topItem: SearchPlanItem | undefined,
  scoringNotes: string[],
  counts: AssessmentMissionControlReport['progress'],
  deliveryStatus: string,
): string[] {
  const reasons: string[] = [];
  if (counts.pendingApprovals > 0) reasons.push('Pending approvals outrank fresh exploration.');
  if (counts.evidence > 0 && counts.reviewedEvidence < counts.evidence) {
    reasons.push('Evidence review unlocks reliable Findings and reports.');
  }
  if (counts.findings > counts.confirmedFindings) reasons.push('Candidate Findings need validation before commercial delivery.');
  if (deliveryStatus === 'ready') reasons.push('Delivery gates are ready; report handoff should outrank new probing.');
  if (topItem) {
    reasons.push(`${topItem.source} scored ${topItem.score} with ${topItem.automation} automation.`);
  }
  return unique([...reasons, ...scoringNotes]).slice(0, 5);
}

function lanes(input: {
  phase: RunPhase;
  counts: AssessmentMissionControlReport['progress'];
  workbenchBlockers: string[];
  searchPlanSummary: string;
  topItem?: SearchPlanItem;
  toolEcosystemPosture: string;
  executionNodeStatus: string;
  localRunnerStatus: string;
  evidenceSummary: string;
  deliverySummary: string;
  harnessSummary: string;
}): MissionLane[] {
  const { counts } = input;
  return [
    lane({
      id: 'scope_and_authorization',
      title: 'Scope and authorization',
      status: counts.pendingApprovals > 0 ? 'blocked' : counts.blockedTools > 0 ? 'warn' : 'ready',
      summary: `${counts.pendingApprovals} pending approval(s), ${counts.blockedTools} blocked tool call(s).`,
      signals: [`phase=${input.phase}`, `blockedTools=${counts.blockedTools}`],
      nextActions: counts.pendingApprovals > 0 ? ['Review approval queue before expanding active testing.'] : ['Keep scope and approval gates fail-closed.'],
    }),
    lane({
      id: 'search_and_reasoning',
      title: 'Search and reasoning',
      status: input.topItem?.status === 'active' ? 'active' : input.topItem?.status === 'blocked' ? 'blocked' : input.topItem ? 'queued' : 'ready',
      summary: input.searchPlanSummary,
      signals: input.topItem ? [`top=${input.topItem.title}`, `automation=${input.topItem.automation}`] : ['no top item'],
      nextActions: input.topItem ? [selectedNextAction(input.topItem, [], [])] : ['Advance the run or add a human hint.'],
    }),
    lane({
      id: 'worker_execution',
      title: 'Worker execution',
      status: counts.healthyWorkers > 0 ? (counts.intents > 0 ? 'active' : 'ready') : 'warn',
      summary: `${counts.healthyWorkers} healthy Worker runtime(s), ${counts.intents} intent(s), harness=${counts.harnessScore}/100.`,
      signals: [`healthyWorkers=${counts.healthyWorkers}`, `harnessScore=${counts.harnessScore}`],
      nextActions: counts.healthyWorkers > 0 ? ['Use Worker selection and harness eval to compare output quality.'] : ['Configure a healthy Worker runtime before relying on autonomy.'],
    }),
    lane({
      id: 'tool_and_runtime',
      title: 'Tool and runtime',
      status: input.toolEcosystemPosture === 'blocked' || input.executionNodeStatus === 'blocked' ? 'blocked' : input.toolEcosystemPosture === 'ready' ? 'ready' : 'warn',
      summary: `Tool ecosystem=${input.toolEcosystemPosture}, execution node=${input.executionNodeStatus}, local runner=${input.localRunnerStatus}.`,
      signals: [`runnableTemplates=${counts.runnableTemplates}`, `executionNode=${input.executionNodeStatus}`],
      nextActions: counts.runnableTemplates > 0 ? ['Keep tools behind Tool Gateway and evidence output.'] : ['Install or enable governed runtime profiles before promising broad scanning.'],
    }),
    lane({
      id: 'evidence_and_findings',
      title: 'Evidence and findings',
      status: counts.evidence === 0 ? 'queued' : counts.reviewedEvidence < counts.evidence || counts.findings > counts.confirmedFindings ? 'review' : 'ready',
      summary: input.evidenceSummary,
      signals: [`evidence=${counts.evidence}`, `reviewed=${counts.reviewedEvidence}`, `confirmedFindings=${counts.confirmedFindings}`],
      nextActions: ['Review evidence first; only confirmed evidence-backed Findings should reach reports.'],
    }),
    lane({
      id: 'delivery',
      title: 'Delivery',
      status: counts.confirmedFindings > 0 && counts.deliveryStatus === 'ready' ? 'done' : counts.deliveryStatus === 'blocked' ? 'blocked' : 'review',
      summary: input.deliverySummary,
      signals: [`delivery=${counts.deliveryStatus}`, `referenceUsableDimensions=${counts.referenceUsableDimensions}`],
      nextActions: counts.confirmedFindings > 0 ? ['Generate or refresh a confirmed-only report bundle.'] : ['Validate candidate Findings before report handoff.'],
    }),
    lane({
      id: 'agent_framework_quality',
      title: 'Agent framework quality',
      status: counts.harnessScore >= 75 ? 'ready' : counts.harnessScore >= 45 ? 'warn' : 'blocked',
      summary: input.harnessSummary,
      signals: [`harnessScore=${counts.harnessScore}`, `benchmarkUsable=${counts.referenceUsableDimensions}`],
      nextActions: ['Use harness fixtures, observation budget, and scorecards to harden the framework without adding role-tree multi-agent complexity.'],
    }),
  ];
}

function lane(input: MissionLane): MissionLane {
  return input;
}

function decisionTrail(flowSteps: RunFlowStep[], topItem: SearchPlanItem | undefined): MissionDecisionTrailItem[] {
  const steps: MissionDecisionTrailItem[] = flowSteps.slice(-8).map((step) => ({
    id: step.id,
    title: step.title,
    status: decisionStatus(step.status),
    detail: step.detail,
      sourceRefs: [step.kind, step.entityId].filter(isString),
    evidenceIds: step.evidenceIds,
  }));
  if (topItem) {
    steps.push({
      id: `mission_next_${topItem.id}`,
      title: `Selected next action: ${topItem.title}`,
      status: topItem.status === 'blocked' ? 'blocked' : topItem.status === 'review' ? 'review' : 'next',
      detail: topItem.rationale,
      sourceRefs: [topItem.source, topItem.automation, topItem.entityId].filter(isString),
    });
  }
  return steps;
}

function decisionStatus(status: RunFlowStep['status']): MissionDecisionStatus {
  if (status === 'done') return 'done';
  if (status === 'active') return 'active';
  if (status === 'blocked') return 'blocked';
  if (status === 'review') return 'review';
  return 'next';
}

function operatorNextActions(
  topItem: SearchPlanItem | undefined,
  workbenchActions: AgentWorkbenchAction[],
  deliveryActions: string[],
  toolActions: string[],
): MissionOperatorAction[] {
  const actions: MissionOperatorAction[] = [];
  if (topItem) {
    actions.push({
      label: selectedNextAction(topItem, [], []),
      actionKind: topItem.automation,
      endpoint: topItem.automation === 'dispatch' || topItem.automation === 'queue_intent' ? '/runs/{id}/search-plan/advance' : undefined,
      riskLevel: topItem.riskLevel,
      reason: topItem.rationale,
      blockedBy: topItem.blockers,
    });
  }
  for (const action of workbenchActions.slice(0, 4)) {
    actions.push({
      label: action.label,
      actionKind: action.kind,
      endpoint: action.endpoint,
      riskLevel: 'R0',
      reason: action.entityId ? `Workbench action for ${action.entityId}.` : 'Workbench surfaced this as an operator action.',
      blockedBy: [],
    });
  }
  for (const label of deliveryActions.slice(0, 3)) {
    actions.push({
      label,
      actionKind: 'delivery',
      riskLevel: 'R0',
      reason: 'Delivery readiness gate is not fully satisfied.',
      blockedBy: [],
    });
  }
  for (const label of toolActions.slice(0, 3)) {
    actions.push({
      label,
      actionKind: 'tool_ecosystem',
      riskLevel: 'R0',
      reason: 'Tool ecosystem readiness indicates a platform setup or mapping action.',
      blockedBy: [],
    });
  }
  return uniqueBy(actions, (item) => `${item.actionKind}:${item.label}`).slice(0, 8);
}

function buildAcceptanceGates(input: {
  runDestructiveAllowed: boolean;
  allowedAssets: number;
  counts: AssessmentMissionControlReport['progress'];
  toolEcosystemPosture: string;
  executionNodeStatus: string;
  evidencePosture: string;
  deliveryStatus: string;
  harnessPosture: string;
}): MissionAcceptanceGate[] {
  return [
    gate(
      'scope_policy',
      'Authorized scope loaded',
      input.allowedAssets > 0 && !input.runDestructiveAllowed ? 'pass' : input.allowedAssets > 0 ? 'warn' : 'fail',
      input.allowedAssets > 0
        ? `${input.allowedAssets} allowed asset rule(s); destructiveAllowed=${input.runDestructiveAllowed}.`
        : 'No allowed asset rules are configured.',
    ),
    gate(
      'approval_queue',
      'Approval queue clear',
      input.counts.pendingApprovals === 0 ? 'pass' : 'fail',
      `${input.counts.pendingApprovals} pending approval request(s).`,
    ),
    gate(
      'worker_runtime',
      'Worker runtime available',
      input.counts.healthyWorkers > 0 ? 'pass' : 'warn',
      `${input.counts.healthyWorkers} healthy Worker runtime(s).`,
    ),
    gate(
      'tool_gateway_runtime',
      'Tool Gateway runtime usable',
      input.toolEcosystemPosture === 'blocked' || input.executionNodeStatus === 'blocked'
        ? 'fail'
        : input.toolEcosystemPosture === 'thin'
          ? 'warn'
          : 'pass',
      `Tool ecosystem=${input.toolEcosystemPosture}; execution node=${input.executionNodeStatus}; runnable templates=${input.counts.runnableTemplates}.`,
    ),
    gate(
      'evidence_integrity',
      'Evidence integrity',
      input.evidencePosture === 'blocked' ? 'fail' : input.counts.evidence === 0 || input.evidencePosture === 'weak' ? 'warn' : 'pass',
      `${input.counts.reviewedEvidence}/${input.counts.evidence} evidence item(s) reviewed; evidence posture=${input.evidencePosture}.`,
    ),
    gate(
      'finding_delivery',
      'Finding delivery gate',
      input.deliveryStatus === 'ready' ? 'pass' : input.deliveryStatus === 'blocked' ? 'fail' : 'warn',
      `${input.counts.confirmedFindings}/${input.counts.findings} finding(s) confirmed; delivery=${input.deliveryStatus}.`,
    ),
    gate(
      'agent_harness',
      'Agent harness and eval path',
      input.harnessPosture === 'ready' || input.harnessPosture === 'usable' ? 'pass' : input.harnessPosture === 'gap' ? 'fail' : 'warn',
      `Harness=${input.harnessPosture}; score=${input.counts.harnessScore}/100.`,
    ),
  ];
}

function gate(id: string, title: string, status: EvaluationCheckStatus, detail: string): MissionAcceptanceGate {
  return { id, title, status, detail };
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function isString(value: string | undefined): value is string {
  return Boolean(value);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
