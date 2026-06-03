import { nowIso } from '../domain/ids.js';
import type { EvidenceKind, Run, ToolInvocation, TraceSpan } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import { capabilityMatrix, type CapabilityArea } from '../tools/toolbox-registry.js';

export type RunCapabilityRadarPosture = 'strong' | 'usable' | 'thin' | 'blocked';
export type RunCapabilityDimensionId =
  | 'scope_safety'
  | 'evidence_depth'
  | 'autonomous_progress'
  | 'worker_performance'
  | 'tool_ecosystem'
  | 'domain_depth'
  | 'delivery_readiness'
  | 'observability';

export interface RunCapabilityDimension {
  id: RunCapabilityDimensionId;
  title: string;
  score: number;
  status: RunCapabilityRadarPosture;
  detail: string;
  signals: string[];
  gaps: string[];
}

export interface RunCapabilityRadar {
  runId: string;
  generatedAt: string;
  overallScore: number;
  posture: RunCapabilityRadarPosture;
  summary: {
    workersConfigured: number;
    workerTasks: number;
    toolCalls: number;
    blockedToolCalls: number;
    evidence: number;
    evidenceKinds: EvidenceKind[];
    findings: number;
    confirmedFindings: number;
    pendingApprovals: number;
    enabledDomainSkills: number;
    enabledPocTemplates: number;
    enabledConnectors: number;
    enabledToolboxBundles: number;
    domainImports: number;
    traceSpans: number;
    estimatedUsd: number;
  };
  dimensions: RunCapabilityDimension[];
  schedulingHints: string[];
  gaps: string[];
}

export class RunCapabilityRadarService {
  constructor(private readonly store: PlatformStore) {}

  get(runId: string): RunCapabilityRadar {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const evidence = Object.values(this.store.state.evidence).filter((item) => item.runId === runId && item.kind !== 'replay_bundle');
    const reviews = Object.values(this.store.state.evidenceReviews).filter((item) => item.runId === runId);
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId);
    const approvals = Object.values(this.store.state.approvals).filter((item) => item.runId === runId);
    const tools = Object.values(this.store.state.toolInvocations).filter((item) => item.runId === runId);
    const spans = Object.values(this.store.state.traceSpans).filter((item) => item.runId === runId);
    const costs = Object.values(this.store.state.costLedger).filter((item) => item.runId === runId);
    const intents = Object.values(this.store.state.intents).filter((item) => item.runId === runId);
    const facts = Object.values(this.store.state.facts).filter((item) => item.runId === runId);
    const reports = Object.values(this.store.state.evidence).filter((item) => item.runId === runId && item.kind === 'replay_bundle');
    const enabledDomainSkills = Object.values(this.store.state.runSkillBindings).filter((item) => item.runId === runId);
    const enabledPocTemplates = Object.values(this.store.state.runPocTemplateBindings).filter((item) => item.runId === runId);
    const enabledConnectors = Object.values(this.store.state.runConnectorBindings).filter((item) => item.runId === runId);
    const enabledToolboxBundles = Object.values(this.store.state.runToolboxBundleBindings).filter((item) => item.runId === runId);
    const domainImports = [
      ...Object.values(this.store.state.sarifImports).filter((item) => item.runId === runId),
      ...Object.values(this.store.state.androidManifestImports).filter((item) => item.runId === runId),
      ...Object.values(this.store.state.cloudIamImports).filter((item) => item.runId === runId),
      ...Object.values(this.store.state.identityGraphImports).filter((item) => item.runId === runId),
    ];
    const dimensions = [
      safetyDimension(run, approvals, tools),
      evidenceDimension(evidence, reviews),
      autonomyDimension(intents, facts, evidence),
      workerDimension(run, spans, facts),
      toolDimension(tools, evidence),
      domainDimension(enabledDomainSkills.length, enabledPocTemplates.length, enabledConnectors.length, enabledToolboxBundles.length, domainImports.length),
      deliveryDimension(evidence, reviews, findings, reports, approvals, tools),
      observabilityDimension(spans, costs),
    ];
    const overallScore = weightedScore(dimensions);
    const posture = dimensions.some((item) => item.id === 'scope_safety' && item.status === 'blocked')
      ? 'blocked'
      : postureFromScore(overallScore);
    const gaps = dimensions.flatMap((item) => item.gaps.map((gap) => `${item.title}: ${gap}`)).slice(0, 10);
    return {
      runId,
      generatedAt: nowIso(),
      overallScore,
      posture,
      summary: {
        workersConfigured: run.workerPool.filter((worker) => worker.type === 'mock' || Boolean(worker.command)).length,
        workerTasks: spans.filter((span) => span.kind === 'worker').length,
        toolCalls: tools.length,
        blockedToolCalls: tools.filter((tool) => tool.status === 'blocked').length,
        evidence: evidence.length,
        evidenceKinds: [...new Set(evidence.map((item) => item.kind))].sort(),
        findings: findings.length,
        confirmedFindings: findings.filter((item) => item.validationState === 'confirmed').length,
        pendingApprovals: approvals.filter((item) => item.status === 'pending').length,
        enabledDomainSkills: enabledDomainSkills.length,
        enabledPocTemplates: enabledPocTemplates.length,
        enabledConnectors: enabledConnectors.length,
        enabledToolboxBundles: enabledToolboxBundles.length,
        domainImports: domainImports.length,
        traceSpans: spans.length,
        estimatedUsd: roundMoney(costs.reduce((total, cost) => total + cost.estimatedUsd, 0)),
      },
      dimensions,
      schedulingHints: schedulingHints(dimensions, tools, approvals, evidence.length, enabledDomainSkills.length, enabledPocTemplates.length),
      gaps,
    };
  }
}

function safetyDimension(run: Run, approvals: Array<{ id?: string; status: string }>, tools: ToolInvocation[]): RunCapabilityDimension {
  const pendingApprovals = approvals.filter((item) => item.status === 'pending').length;
  const approvalsById = new Map(approvals.filter((item): item is { id: string; status: string } => Boolean(item.id)).map((item) => [item.id, item]));
  const unauthorizedR4 = tools.filter(
    (tool) => tool.riskLevel === 'R4' && tool.status === 'allowed' && (!tool.approvalId || approvalsById.get(tool.approvalId)?.status !== 'approved'),
  ).length;
  const approvedR4 = tools.filter(
    (tool) => tool.riskLevel === 'R4' && tool.status === 'allowed' && Boolean(tool.approvalId && approvalsById.get(tool.approvalId)?.status === 'approved'),
  ).length;
  const scopeBlocked = tools.filter((tool) => tool.status === 'blocked' && /scope|denied|method|asset|R4|destructive/i.test(tool.reason ?? '')).length;
  const score = unauthorizedR4 > 0 ? 0 : clamp(100 - pendingApprovals * 12 - approvedR4 * 4);
  return dimension({
    id: 'scope_safety',
    title: 'Scope and safety',
    score,
    detail: unauthorizedR4 > 0
      ? `${unauthorizedR4} R4 request(s) were allowed without approved break-glass approval.`
      : `${scopeBlocked} out-of-policy request(s) blocked; approvedR4=${approvedR4}; destructiveAllowed=${run.scopePolicy.destructiveAllowed}.`,
    signals: [
      `${pendingApprovals} pending approval(s)`,
      `${scopeBlocked} policy block(s)`,
      `${approvedR4} approved R4 break-glass call(s)`,
      `${run.scopePolicy.allowedAssets.length} allowed asset rule(s)`,
    ],
    gaps: [
      ...(pendingApprovals > 0 ? ['Resolve pending approvals before expanding autonomous execution.'] : []),
      ...(unauthorizedR4 > 0 ? ['R4 requests must require a matching token and approved break-glass approval before execution.'] : []),
    ],
  });
}

function evidenceDimension(
  evidence: Array<{ id: string; kind: EvidenceKind }>,
  reviews: Array<{ evidenceId: string; status: string }>,
): RunCapabilityDimension {
  const reviewsByEvidence = new Map(reviews.map((review) => [review.evidenceId, review]));
  const reviewed = evidence.filter((item) => reviewsByEvidence.has(item.id)).length;
  const useful = evidence.filter((item) => reviewsByEvidence.get(item.id)?.status === 'useful').length;
  const kinds = new Set(evidence.map((item) => item.kind));
  const reviewScore = evidence.length > 0 ? Math.round((reviewed / evidence.length) * 35) : 0;
  const usefulScore = evidence.length > 0 ? Math.round((useful / evidence.length) * 25) : 0;
  const score = clamp(Math.min(evidence.length, 5) * 8 + Math.min(kinds.size, 4) * 5 + reviewScore + usefulScore);
  return dimension({
    id: 'evidence_depth',
    title: 'Evidence depth',
    score,
    detail: `${evidence.length} evidence item(s), ${reviewed} reviewed, ${useful} marked useful.`,
    signals: [`kinds=${[...kinds].sort().join(', ') || 'none'}`, `${reviews.length} review record(s)`],
    gaps: [
      ...(evidence.length === 0 ? ['Capture low-risk baseline evidence before allowing finding proposals.'] : []),
      ...(evidence.length > 0 && reviewed < evidence.length ? ['Triage evidence so commercial findings can cite useful material.'] : []),
      ...(kinds.size < 2 && evidence.length > 0 ? ['Add a second evidence type such as screenshot, HTTP exchange, command output, or OAST callback.'] : []),
    ],
  });
}

function autonomyDimension(
  intents: Array<{ status: string }>,
  facts: Array<{ evidenceIds: string[] }>,
  evidence: unknown[],
): RunCapabilityDimension {
  const open = intents.filter((item) => item.status === 'open' || item.status === 'released').length;
  const claimed = intents.filter((item) => item.status === 'claimed').length;
  const concluded = intents.filter((item) => item.status === 'concluded').length;
  const evidenceBackedFacts = facts.filter((fact) => fact.evidenceIds.length > 0).length;
  const score = clamp(
    Math.min(intents.length, 5) * 8 +
      Math.min(concluded, 5) * 8 +
      Math.min(facts.length, 5) * 6 +
      Math.min(evidenceBackedFacts, 5) * 6 +
      (evidence.length > 0 ? 10 : 0),
  );
  return dimension({
    id: 'autonomous_progress',
    title: 'Autonomous progress',
    score,
    detail: `${intents.length} intent(s), ${concluded} concluded, ${facts.length} fact(s), ${evidenceBackedFacts} evidence-backed fact(s).`,
    signals: [`${open} queued intent(s)`, `${claimed} active lease(s)`, `${concluded} concluded intent(s)`],
    gaps: [
      ...(intents.length === 0 ? ['Create or queue a low-risk intent for the Dispatcher loop.'] : []),
      ...(facts.length > 0 && evidenceBackedFacts === 0 ? ['Steer Workers toward tool requests that attach evidence to facts.'] : []),
      ...(claimed > 0 ? ['Wait for active Worker leases before adding parallel work.'] : []),
    ],
  });
}

function workerDimension(run: Run, spans: TraceSpan[], facts: Array<{ createdBy: string; evidenceIds: string[] }>): RunCapabilityDimension {
  const configured = run.workerPool.filter((worker) => worker.type === 'mock' || Boolean(worker.command)).length;
  const workerSpans = spans.filter((span) => span.kind === 'worker');
  const ok = workerSpans.filter((span) => span.status === 'ok').length;
  const timeout = workerSpans.filter((span) => span.status === 'timeout').length;
  const errors = workerSpans.filter((span) => span.status === 'error').length;
  const successRate = workerSpans.length > 0 ? ok / workerSpans.length : 0;
  const evidenceWorkers = new Set(
    facts
      .filter((fact) => fact.evidenceIds.length > 0)
      .map((fact) => fact.createdBy.split(':')[0])
      .filter(Boolean),
  );
  const score = clamp(
    configured * 18 +
      (workerSpans.length > 0 ? Math.round(successRate * 45) : 0) +
      Math.min(evidenceWorkers.size, configured) * 12 -
      timeout * 12 -
      errors * 10,
  );
  return dimension({
    id: 'worker_performance',
    title: 'Worker performance',
    score,
    detail: `${configured}/${run.workerPool.length} configured Worker(s), ${workerSpans.length} task span(s), ${Math.round(successRate * 100)}% success.`,
    signals: [`${timeout} timeout(s)`, `${errors} error(s)`, `${evidenceWorkers.size} evidence-producing Worker(s)`],
    gaps: [
      ...(configured === 0 ? ['Configure at least one real CLI Worker for non-mock runs.'] : []),
      ...(workerSpans.length === 0 ? ['Exercise Workers with a low-risk dispatch before comparing quality.'] : []),
      ...(timeout > 0 ? ['Investigate timeout/session-resume before raising concurrency.'] : []),
      ...(configured > 1 && evidenceWorkers.size <= 1 ? ['Compare Workers on evidence contribution, not only task completion.'] : []),
    ],
  });
}

function toolDimension(tools: ToolInvocation[], evidence: Array<{ toolCallId?: string }>): RunCapabilityDimension {
  const capabilities = capabilityMatrix();
  const availableAreas = new Set(capabilities.filter((item) => item.status === 'available' || item.status === 'partial').map((item) => item.area));
  const plannedAreas = new Set(capabilities.filter((item) => item.status === 'planned').map((item) => item.area));
  const usedTools = new Set(tools.map((tool) => tool.tool));
  const blocked = tools.filter((tool) => tool.status === 'blocked').length;
  const approvalRequired = tools.filter((tool) => tool.status === 'approval_required').length;
  const evidenceToolCallIds = new Set(evidence.map((item) => item.toolCallId).filter(Boolean));
  const evidenceProducingCalls = tools.filter((tool) => evidenceToolCallIds.has(tool.id)).length;
  const breadthScore = Math.round((availableAreas.size / allCapabilityAreas().length) * 35);
  const usageScore = Math.min(usedTools.size, 6) * 7;
  const evidenceScore = tools.length > 0 ? Math.round((evidenceProducingCalls / tools.length) * 25) : 0;
  const score = clamp(breadthScore + usageScore + evidenceScore - blocked * 5 - approvalRequired * 2);
  return dimension({
    id: 'tool_ecosystem',
    title: 'Tool ecosystem',
    score,
    detail: `${availableAreas.size} available/partial capability area(s), ${usedTools.size} tool(s) exercised, ${evidenceProducingCalls} evidence-producing call(s).`,
    signals: [`${blocked} blocked call(s)`, `${approvalRequired} approval-gated call(s)`, `${plannedAreas.size} planned area(s)`],
    gaps: [
      ...(usedTools.size === 0 ? ['Run a governed baseline tool pack or scanner template to prove the Tool Gateway path.'] : []),
      ...(blocked > 0 ? ['Inspect blocked calls for scope, approval, runtime, or toolbox-readiness gaps.'] : []),
      ...(plannedAreas.size > 0 ? [`Productize planned areas: ${[...plannedAreas].sort().join(', ')}.`] : []),
    ],
  });
}

function domainDimension(
  skills: number,
  pocTemplates: number,
  connectors: number,
  bundles: number,
  imports: number,
): RunCapabilityDimension {
  const score = clamp(skills * 12 + pocTemplates * 10 + connectors * 8 + bundles * 8 + imports * 16);
  return dimension({
    id: 'domain_depth',
    title: 'Rigid domain depth',
    score,
    detail: `${skills} skill(s), ${pocTemplates} PoC template(s), ${imports} domain import(s), ${connectors} connector(s), ${bundles} bundle(s).`,
    signals: [`skills=${skills}`, `templates=${pocTemplates}`, `imports=${imports}`],
    gaps: [
      ...(skills === 0 ? ['Enable only relevant rigid domain Skills such as Android, SAST, Cloud IAM, AD, or CTF flag submission.'] : []),
      ...(pocTemplates === 0 ? ['Enable vulnerability-specific PoC templates when concrete evidence requirements are known.'] : []),
      ...(imports === 0 ? ['Use SARIF, Android Manifest, Cloud IAM, or Identity Graph imports when the target domain fits.'] : []),
    ],
  });
}

function deliveryDimension(
  evidence: Array<{ id: string }>,
  reviews: Array<{ evidenceId: string; status: string }>,
  findings: Array<{ validationState: string; evidenceIds: string[] }>,
  reports: unknown[],
  approvals: Array<{ status: string }>,
  tools: ToolInvocation[],
): RunCapabilityDimension {
  const usefulEvidence = new Set(reviews.filter((review) => review.status === 'useful').map((review) => review.evidenceId));
  const candidate = findings.filter((finding) => finding.validationState === 'candidate').length;
  const confirmed = findings.filter((finding) => finding.validationState === 'confirmed').length;
  const confirmedWithUsefulEvidence = findings.filter(
    (finding) => finding.validationState === 'confirmed' && finding.evidenceIds.some((id) => usefulEvidence.has(id)),
  ).length;
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length;
  const blockedTools = tools.filter((tool) => tool.status === 'blocked').length;
  const score = clamp(
    (evidence.length > 0 ? 15 : 0) +
      Math.min(usefulEvidence.size, 5) * 7 +
      confirmed * 18 +
      confirmedWithUsefulEvidence * 10 +
      (reports.length > 0 ? 15 : 0) -
      candidate * 5 -
      pendingApprovals * 8 -
      blockedTools * 3,
  );
  return dimension({
    id: 'delivery_readiness',
    title: 'Delivery readiness',
    score,
    detail: `${confirmed} confirmed finding(s), ${candidate} candidate finding(s), ${reports.length} report bundle(s).`,
    signals: [`${usefulEvidence.size} useful evidence item(s)`, `${pendingApprovals} pending approval(s)`, `${blockedTools} blocked tool call(s)`],
    gaps: [
      ...(candidate > 0 ? ['Confirm or reject candidate findings before customer-facing reports.'] : []),
      ...(confirmed > 0 && confirmedWithUsefulEvidence < confirmed ? ['Confirmed findings should cite useful-reviewed evidence.'] : []),
      ...(confirmed > 0 && reports.length === 0 ? ['Generate a confirmed-only report bundle for handoff.'] : []),
    ],
  });
}

function observabilityDimension(spans: TraceSpan[], costs: Array<{ estimatedUsd: number }>): RunCapabilityDimension {
  const kinds = new Set(spans.map((span) => span.kind));
  const statuses = spanStatusCounts(spans);
  const score = clamp(Math.min(spans.length, 10) * 5 + kinds.size * 9 + (costs.length > 0 ? 15 : 0) - statuses.error * 5 - statuses.timeout * 7);
  return dimension({
    id: 'observability',
    title: 'Trace and cost observability',
    score,
    detail: `${spans.length} trace span(s), ${costs.length} cost ledger entry/entries, ${kinds.size} span kind(s).`,
    signals: [`errors=${statuses.error}`, `timeouts=${statuses.timeout}`, `kinds=${[...kinds].sort().join(', ') || 'none'}`],
    gaps: [
      ...(spans.length === 0 ? ['Record trace spans before comparing Worker/runtime quality.'] : []),
      ...(costs.length === 0 ? ['Record cost/runtime ledger entries for model and tool comparison.'] : []),
      ...(statuses.timeout > 0 ? ['Timeout spans should influence Worker scheduling and concurrency.'] : []),
    ],
  });
}

function dimension(input: Omit<RunCapabilityDimension, 'status'>): RunCapabilityDimension {
  return { ...input, score: clamp(input.score), status: postureFromScore(input.score) };
}

function weightedScore(dimensions: RunCapabilityDimension[]): number {
  const weights: Record<RunCapabilityDimensionId, number> = {
    scope_safety: 1.3,
    evidence_depth: 1.2,
    autonomous_progress: 1,
    worker_performance: 1,
    tool_ecosystem: 1,
    domain_depth: 0.85,
    delivery_readiness: 1.15,
    observability: 0.9,
  };
  const totalWeight = dimensions.reduce((total, item) => total + weights[item.id], 0);
  return Math.round(dimensions.reduce((total, item) => total + item.score * weights[item.id], 0) / totalWeight);
}

function postureFromScore(score: number): RunCapabilityRadarPosture {
  if (score >= 80) return 'strong';
  if (score >= 55) return 'usable';
  if (score >= 25) return 'thin';
  return 'blocked';
}

function schedulingHints(
  dimensions: RunCapabilityDimension[],
  tools: ToolInvocation[],
  approvals: Array<{ status: string }>,
  evidenceCount: number,
  skillCount: number,
  templateCount: number,
): string[] {
  const hints: string[] = [];
  if (approvals.some((approval) => approval.status === 'pending')) {
    hints.push('Pause higher-risk automation until pending approvals are decided.');
  }
  if (evidenceCount === 0) {
    hints.push('Prioritize R0/R1 baseline capture through browser.navigate, http.request, or built-in scanner templates.');
  }
  if (tools.some((tool) => tool.status === 'blocked')) {
    hints.push('Use blocked Tool Gateway records as a scope/toolbox backlog instead of exposing raw tools to Workers.');
  }
  const weak = dimensions.filter((item) => item.score < 55).sort((left, right) => left.score - right.score);
  if (weak[0]) {
    hints.push(`Next capability investment: ${weak[0].title}.`);
  }
  if (skillCount === 0 && templateCount === 0) {
    hints.push('Add rigid domain Skills or concrete PoC templates only when the target domain justifies them.');
  }
  return hints.length > 0 ? hints : ['Capability posture is healthy; continue Search Plan Advance or prepare confirmed-scope delivery.'];
}

function spanStatusCounts(spans: TraceSpan[]): Record<TraceSpan['status'], number> {
  return spans.reduce(
    (counts, span) => {
      counts[span.status] += 1;
      return counts;
    },
    { ok: 0, error: 0, blocked: 0, approval_required: 0, skipped: 0, timeout: 0 } satisfies Record<TraceSpan['status'], number>,
  );
}

function allCapabilityAreas(): CapabilityArea[] {
  return ['web', 'network', 'auth', 'oast', 'sast', 'mobile', 'cloud', 'identity', 'platform'];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}
