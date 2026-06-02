import type { EvaluationCheckStatus } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';

export type DeliveryReadinessStatus = 'ready' | 'needs_review' | 'blocked';

export interface DeliveryReadinessGate {
  id: string;
  title: string;
  status: EvaluationCheckStatus;
  detail: string;
  observed: number;
}

export interface DeliveryReadiness {
  runId: string;
  status: DeliveryReadinessStatus;
  summary: {
    evidence: number;
    usefulEvidence: number;
    unreviewedEvidence: number;
    candidateFindings: number;
    confirmedFindings: number;
    rejectedFindings: number;
    pendingApprovals: number;
    blockedToolCalls: number;
    latestReportScope?: string;
  };
  gates: DeliveryReadinessGate[];
  nextActions: string[];
}

export class DeliveryReadinessService {
  constructor(private readonly store: PlatformStore) {}

  get(runId: string): DeliveryReadiness {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
    const evidence = Object.values(this.store.state.evidence).filter((item) => item.runId === runId);
    const nonReportEvidence = evidence.filter((item) => item.kind !== 'replay_bundle');
    const reviews = Object.values(this.store.state.evidenceReviews).filter((item) => item.runId === runId);
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId);
    const approvals = Object.values(this.store.state.approvals).filter((item) => item.runId === runId);
    const tools = Object.values(this.store.state.toolInvocations).filter((item) => item.runId === runId);
    const reports = evidence
      .filter((item) => item.kind === 'replay_bundle')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const reviewsByEvidence = new Map(reviews.map((review) => [review.evidenceId, review]));
    const usefulEvidence = nonReportEvidence.filter((item) => reviewsByEvidence.get(item.id)?.status === 'useful');
    const unreviewedEvidence = nonReportEvidence.filter((item) => !reviewsByEvidence.has(item.id));
    const candidateFindings = findings.filter((item) => item.validationState === 'candidate');
    const confirmedFindings = findings.filter((item) => item.validationState === 'confirmed');
    const rejectedFindings = findings.filter((item) => item.validationState === 'rejected');
    const pendingApprovals = approvals.filter((item) => item.status === 'pending');
    const blockedToolCalls = tools.filter((item) => item.status === 'blocked');
    const confirmedMissingUsefulReview = confirmedFindings.filter((finding) =>
      finding.evidenceIds.some((id) => reviewsByEvidence.get(id)?.status !== 'useful'),
    );
    const latestReportScope = reports[0] ? reportScope(this.store.state.evidenceBlobs[reports[0].localUri]?.content) : undefined;

    const gates: DeliveryReadinessGate[] = [
      gate(
        'pending_approvals',
        'Approval queue cleared',
        pendingApprovals.length === 0 ? 'pass' : 'fail',
        pendingApprovals.length === 0 ? 'No pending high-risk approvals.' : `${pendingApprovals.length} approval request(s) still need a decision.`,
        pendingApprovals.length,
      ),
      gate(
        'evidence_review',
        'Evidence triage coverage',
        nonReportEvidence.length === 0 ? 'warn' : unreviewedEvidence.length === 0 ? 'pass' : 'warn',
        nonReportEvidence.length === 0
          ? 'No non-report evidence has been collected yet.'
          : unreviewedEvidence.length === 0
            ? `${usefulEvidence.length} useful evidence item(s), all evidence triaged.`
            : `${unreviewedEvidence.length} evidence item(s) still need operator triage.`,
        unreviewedEvidence.length,
      ),
      gate(
        'confirmed_findings',
        'Confirmed finding gate',
        confirmedMissingUsefulReview.length > 0 ? 'fail' : confirmedFindings.length > 0 ? 'pass' : 'warn',
        confirmedMissingUsefulReview.length > 0
          ? `${confirmedMissingUsefulReview.length} confirmed finding(s) are missing useful-reviewed evidence.`
          : confirmedFindings.length > 0
            ? `${confirmedFindings.length} confirmed finding(s) are evidence-review gated.`
            : 'No confirmed findings yet; commercial report will be empty by default.',
        confirmedFindings.length,
      ),
      gate(
        'report_scope',
        'Commercial report scope',
        !reports[0] ? 'warn' : latestReportScope === 'confirmed_only' ? 'pass' : 'warn',
        !reports[0]
          ? 'No report bundle has been generated yet.'
          : latestReportScope === 'confirmed_only'
            ? 'Latest report uses confirmed-only scope.'
            : `Latest report scope is ${latestReportScope || 'unknown'}; treat it as triage output.`,
        reports.length,
      ),
      gate(
        'blocked_tools',
        'Tool audit review',
        blockedToolCalls.length === 0 ? 'pass' : 'warn',
        blockedToolCalls.length === 0
          ? 'No blocked tool calls require operator review.'
          : `${blockedToolCalls.length} blocked tool call(s) should be reviewed for scope or configuration gaps.`,
        blockedToolCalls.length,
      ),
    ];
    return {
      runId,
      status: readinessStatus(gates),
      summary: {
        evidence: nonReportEvidence.length,
        usefulEvidence: usefulEvidence.length,
        unreviewedEvidence: unreviewedEvidence.length,
        candidateFindings: candidateFindings.length,
        confirmedFindings: confirmedFindings.length,
        rejectedFindings: rejectedFindings.length,
        pendingApprovals: pendingApprovals.length,
        blockedToolCalls: blockedToolCalls.length,
        latestReportScope,
      },
      gates,
      nextActions: nextActions(gates),
    };
  }
}

function gate(
  id: string,
  title: string,
  status: EvaluationCheckStatus,
  detail: string,
  observed: number,
): DeliveryReadinessGate {
  return { id, title, status, detail, observed };
}

function readinessStatus(gates: DeliveryReadinessGate[]): DeliveryReadinessStatus {
  if (gates.some((item) => item.status === 'fail')) {
    return 'blocked';
  }
  if (gates.some((item) => item.status === 'warn')) {
    return 'needs_review';
  }
  return 'ready';
}

function nextActions(gates: DeliveryReadinessGate[]): string[] {
  const actions: string[] = [];
  for (const gate of gates) {
    if (gate.status === 'pass') continue;
    if (gate.id === 'pending_approvals') actions.push('Decide pending approvals before delivery.');
    if (gate.id === 'evidence_review') actions.push('Review untriaged evidence and mark useful, needs context, or not relevant.');
    if (gate.id === 'confirmed_findings') actions.push('Confirm useful-reviewed candidate findings or leave them out of commercial reports.');
    if (gate.id === 'report_scope') actions.push('Generate a confirmed-only report bundle for customer-facing delivery.');
    if (gate.id === 'blocked_tools') actions.push('Review blocked tool calls for scope mistakes or missing toolbox configuration.');
  }
  return actions.length > 0 ? actions : ['Ready for confirmed-scope report handoff.'];
}

function reportScope(content: string | undefined): string | undefined {
  const match = content?.match(/\*\*Finding scope\*\*: ([^\n]+)/);
  return match ? match[1].trim() : undefined;
}
