import type {
  ApprovalRequest,
  Evidence,
  Fact,
  Finding,
  Hint,
  Intent,
  RunPhase,
  ToolInvocation,
} from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { PlatformStore } from '../storage/store.js';

export type RunFlowStepKind = 'fact' | 'hint' | 'intent' | 'evidence' | 'finding' | 'approval' | 'report';
export type RunFlowStepStatus = 'done' | 'queued' | 'active' | 'blocked' | 'review';

export interface RunFlowStep {
  id: string;
  runId: string;
  kind: RunFlowStepKind;
  title: string;
  detail: string;
  status: RunFlowStepStatus;
  entityId: string;
  createdAt: string;
  riskLevel?: string;
  evidenceIds?: string[];
  fromFactIds?: string[];
}

export interface RunFlowBrief {
  runId: string;
  target: string;
  goal: string;
  phase: RunPhase;
  summary: string;
  steps: RunFlowStep[];
  nextActions: string[];
  riskNotes: string[];
}

export class RunFlowService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly events: RunEventService,
  ) {}

  getBrief(runId: string): RunFlowBrief {
    const snapshot = this.graph.getGraph(runId);
    const progress = this.events.progress(runId);
    const approvals = Object.values(this.store.state.approvals).filter((approval) => approval.runId === runId);
    const toolInvocations = Object.values(this.store.state.toolInvocations).filter((tool) => tool.runId === runId);
    const reports = snapshot.evidence.filter((item) => item.kind === 'replay_bundle');
    const steps = [
      ...snapshot.facts.map(factStep),
      ...snapshot.hints.map(hintStep),
      ...snapshot.intents.map(intentStep),
      ...snapshot.evidence.filter((item) => item.kind !== 'replay_bundle').map(evidenceStep),
      ...snapshot.findings.map(findingStep),
      ...approvals.map(approvalStep),
      ...reports.map(reportStep),
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));

    return {
      runId,
      target: snapshot.run.target,
      goal: snapshot.run.goal,
      phase: progress.phase,
      summary: [
        `Goal: ${snapshot.run.goal}`,
        `Current phase: ${progress.phase}`,
        `${progress.counts.facts} facts, ${progress.counts.intents.total} intents, ${progress.counts.evidence} evidence items, ${progress.counts.findings} findings.`,
      ].join(' '),
      steps,
      nextActions: nextActions(snapshot.intents, snapshot.evidence, snapshot.findings, approvals, reports, snapshot.run.status),
      riskNotes: riskNotes(snapshot.evidence, approvals, toolInvocations),
    };
  }
}

function factStep(fact: Fact): RunFlowStep {
  const title =
    fact.createdBy === 'system.origin'
      ? 'Target anchored'
      : fact.createdBy === 'system.goal'
        ? 'Goal anchored'
        : 'Fact recorded';
  return {
    id: `flow_fact_${fact.id}`,
    runId: fact.runId,
    kind: 'fact',
    title,
    detail: fact.statement,
    status: 'done',
    entityId: fact.id,
    createdAt: fact.createdAt,
    evidenceIds: fact.evidenceIds,
  };
}

function hintStep(hint: Hint): RunFlowStep {
  return {
    id: `flow_hint_${hint.id}`,
    runId: hint.runId,
    kind: 'hint',
    title: 'Human hint added',
    detail: hint.text,
    status: 'done',
    entityId: hint.id,
    createdAt: hint.createdAt,
  };
}

function intentStep(intent: Intent): RunFlowStep {
  return {
    id: `flow_intent_${intent.id}`,
    runId: intent.runId,
    kind: 'intent',
    title: 'Intent proposed',
    detail: intent.hypothesis,
    status: intentStatus(intent),
    entityId: intent.id,
    createdAt: intent.createdAt,
    riskLevel: intent.riskLevel,
    fromFactIds: intent.fromFactIds,
  };
}

function evidenceStep(evidence: Evidence): RunFlowStep {
  return {
    id: `flow_evidence_${evidence.id}`,
    runId: evidence.runId,
    kind: 'evidence',
    title: `${evidence.kind} evidence`,
    detail: `${evidence.id} is ${evidence.redactionState}`,
    status: 'done',
    entityId: evidence.id,
    createdAt: evidence.createdAt,
    evidenceIds: [evidence.id],
  };
}

function findingStep(finding: Finding): RunFlowStep {
  return {
    id: `flow_finding_${finding.id}`,
    runId: finding.runId,
    kind: 'finding',
    title: finding.title,
    detail: `${finding.severity} / ${finding.confidence} / ${finding.validationState}`,
    status: finding.validationState === 'confirmed' ? 'done' : 'review',
    entityId: finding.id,
    createdAt: finding.createdAt,
    evidenceIds: finding.evidenceIds,
  };
}

function approvalStep(approval: ApprovalRequest): RunFlowStep {
  return {
    id: `flow_approval_${approval.id}`,
    runId: approval.runId,
    kind: 'approval',
    title: `Approval ${approval.status}: ${approval.tool}`,
    detail: approval.reason,
    status: approval.status === 'pending' ? 'blocked' : 'done',
    entityId: approval.id,
    createdAt: approval.createdAt,
    riskLevel: approval.riskLevel,
  };
}

function reportStep(evidence: Evidence): RunFlowStep {
  return {
    id: `flow_report_${evidence.id}`,
    runId: evidence.runId,
    kind: 'report',
    title: 'Report bundle generated',
    detail: `${evidence.id} / ${evidence.sha256}`,
    status: 'done',
    entityId: evidence.id,
    createdAt: evidence.createdAt,
    evidenceIds: [evidence.id],
  };
}

function intentStatus(intent: Intent): RunFlowStepStatus {
  if (intent.status === 'concluded') return 'done';
  if (intent.status === 'claimed') return 'active';
  if (intent.status === 'released') return 'queued';
  return 'queued';
}

function nextActions(
  intents: Intent[],
  evidence: Evidence[],
  findings: Finding[],
  approvals: ApprovalRequest[],
  reports: Evidence[],
  runStatus: string,
): string[] {
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
  if (pendingApprovals.length > 0) {
    return [`Review ${pendingApprovals.length} pending approval before higher-risk work continues.`];
  }
  const claimedIntent = intents.find((intent) => intent.status === 'claimed');
  if (claimedIntent) {
    return [`Watch active Agent Worker progress on: ${claimedIntent.hypothesis}`];
  }
  const queuedIntent = intents.find((intent) => intent.status === 'open' || intent.status === 'released');
  if (queuedIntent) {
    return [`Dispatch an Agent Worker to explore: ${queuedIntent.hypothesis}`];
  }
  if (evidence.some((item) => item.kind !== 'replay_bundle') && findings.length === 0) {
    return ['Review evidence inbox and propose an evidence-backed finding if impact is real.'];
  }
  if (findings.length > 0 && reports.length === 0) {
    return ['Generate a report bundle for the candidate findings.'];
  }
  if (runStatus === 'active') {
    return ['Dispatch the next reasoning tick or add a human hint to steer exploration.'];
  }
  return ['Review completed findings, evidence, and generated reports.'];
}

function riskNotes(evidence: Evidence[], approvals: ApprovalRequest[], toolInvocations: ToolInvocation[]): string[] {
  const notes: string[] = [];
  const pendingHighRisk = approvals.filter((approval) => approval.status === 'pending');
  if (pendingHighRisk.length > 0) {
    notes.push(`${pendingHighRisk.length} action needs approval before execution.`);
  }
  const blockedTools = toolInvocations.filter((tool) => tool.status === 'blocked');
  if (blockedTools.length > 0) {
    notes.push(`${blockedTools.length} tool call was blocked by policy or scope.`);
  }
  const rawEvidence = evidence.filter((item) => item.redactionState === 'raw_local_only');
  if (rawEvidence.length > 0) {
    notes.push(`${rawEvidence.length} evidence item remains raw local only and should not sync to cloud.`);
  }
  return notes;
}
