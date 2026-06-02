import { nowIso } from '../domain/ids.js';
import type { CostLedgerEntry, EvaluationCheckStatus, Fact, Finding, Run, RunEvaluation, ToolInvocation, TraceSpan } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';

export interface RunScorecard {
  runId: string;
  generatedAt: string;
  quality: {
    score?: number;
    grade?: RunEvaluation['grade'];
    source: 'latest_evaluation' | 'heuristic';
  };
  summary: {
    evidence: number;
    findings: number;
    confirmedFindings: number;
    candidateFindings: number;
    toolCalls: number;
    blockedToolCalls: number;
    pendingApprovals: number;
    totalRuntimeMs: number;
    estimatedUsd: number;
  };
  workerCards: WorkerScorecard[];
  workerComparisons: WorkerComparison[];
  toolCards: ToolScorecard[];
  gates: Array<{ id: string; status: EvaluationCheckStatus; detail: string; observed: number }>;
  recommendations: string[];
}

export interface WorkerScorecard {
  worker: string;
  tasks: number;
  ok: number;
  errors: number;
  timeouts: number;
  totalRuntimeMs: number;
  avgRuntimeMs: number;
}

export interface WorkerComparison {
  worker: string;
  type: Run['workerPool'][number]['type'];
  configured: boolean;
  tasks: number;
  successRate: number;
  timeoutRate: number;
  evidenceContributed: number;
  findingsInfluenced: number;
  totalRuntimeMs: number;
  avgRuntimeMs: number;
  estimatedUsd: number;
  recommendation: string;
}

export interface ToolScorecard {
  tool: string;
  calls: number;
  allowed: number;
  blocked: number;
  approvalRequired: number;
  evidenceProduced: number;
  totalRuntimeMs: number;
  avgRuntimeMs: number;
}

export class RunScorecardService {
  constructor(private readonly store: PlatformStore) {}

  getRunScorecard(runId: string): RunScorecard {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
    const run = this.store.state.runs[runId];
    const spans = Object.values(this.store.state.traceSpans).filter((span) => span.runId === runId);
    const tools = Object.values(this.store.state.toolInvocations).filter((tool) => tool.runId === runId);
    const evidence = Object.values(this.store.state.evidence).filter((item) => item.runId === runId);
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId);
    const facts = Object.values(this.store.state.facts).filter((item) => item.runId === runId);
    const approvals = Object.values(this.store.state.approvals).filter((item) => item.runId === runId);
    const costs = Object.values(this.store.state.costLedger).filter((item) => item.runId === runId);
    const evaluations = Object.values(this.store.state.evaluations)
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latestEvaluation = evaluations[0];
    const gates = latestEvaluation
      ? latestEvaluation.checks.map((check) => ({
          id: check.id,
          status: check.status,
          detail: check.detail,
          observed: check.observed,
        }))
      : heuristicGates(evidence.length, findings.length, tools);
    const score = latestEvaluation?.score ?? heuristicScore(gates);
    return {
      runId,
      generatedAt: nowIso(),
      quality: {
        score,
        grade: latestEvaluation?.grade ?? heuristicGrade(score),
        source: latestEvaluation ? 'latest_evaluation' : 'heuristic',
      },
      summary: {
        evidence: evidence.length,
        findings: findings.length,
        confirmedFindings: findings.filter((item) => item.validationState === 'confirmed').length,
        candidateFindings: findings.filter((item) => item.validationState === 'candidate').length,
        toolCalls: tools.length,
        blockedToolCalls: tools.filter((tool) => tool.status === 'blocked').length,
        pendingApprovals: approvals.filter((approval) => approval.status === 'pending').length,
        totalRuntimeMs: spans.reduce((total, span) => total + span.durationMs, 0),
        estimatedUsd: costs.reduce((total, cost) => total + cost.estimatedUsd, 0),
      },
      workerCards: workerCards(spans),
      workerComparisons: workerComparisons(run, spans, facts, findings, costs),
      toolCards: toolCards(spans, tools, evidence),
      gates,
      recommendations: recommendations(evidence.length, findings.length, tools, approvals.length, gates),
    };
  }
}

function workerCards(spans: TraceSpan[]): WorkerScorecard[] {
  const grouped = new Map<string, TraceSpan[]>();
  for (const span of spans.filter((item) => item.kind === 'worker')) {
    const worker = typeof span.attributes.worker === 'string' ? span.attributes.worker : span.name.split('.')[0] || 'unknown';
    grouped.set(worker, [...(grouped.get(worker) ?? []), span]);
  }
  return [...grouped.entries()]
    .map(([worker, items]) => {
      const totalRuntimeMs = items.reduce((total, span) => total + span.durationMs, 0);
      return {
        worker,
        tasks: items.length,
        ok: items.filter((span) => span.status === 'ok').length,
        errors: items.filter((span) => span.status === 'error').length,
        timeouts: items.filter((span) => span.status === 'timeout').length,
        totalRuntimeMs,
        avgRuntimeMs: items.length > 0 ? Math.round(totalRuntimeMs / items.length) : 0,
      };
    })
    .sort((left, right) => right.tasks - left.tasks || right.totalRuntimeMs - left.totalRuntimeMs);
}

function workerComparisons(
  run: Run,
  spans: TraceSpan[],
  facts: Fact[],
  findings: Finding[],
  costs: CostLedgerEntry[],
): WorkerComparison[] {
  return run.workerPool.map((config) => {
    const workerSpans = spans.filter((span) => span.kind === 'worker' && workerName(span) === config.name);
    const workerFacts = facts.filter((fact) => fact.createdBy.startsWith(`${config.name}:`));
    const evidenceIds = new Set(workerFacts.flatMap((fact) => fact.evidenceIds));
    const findingsInfluenced = findings.filter((finding) => finding.evidenceIds.some((id) => evidenceIds.has(id))).length;
    const totalRuntimeMs = workerSpans.reduce((total, span) => total + span.durationMs, 0);
    const tasks = workerSpans.length;
    const ok = workerSpans.filter((span) => span.status === 'ok').length;
    const timeouts = workerSpans.filter((span) => span.status === 'timeout').length;
    const estimatedUsd = costs
      .filter((cost) => cost.worker === config.name)
      .reduce((total, cost) => total + cost.estimatedUsd, 0);
    return {
      worker: config.name,
      type: config.type,
      configured: config.type === 'mock' || Boolean(config.command),
      tasks,
      successRate: tasks > 0 ? Math.round((ok / tasks) * 100) : 0,
      timeoutRate: tasks > 0 ? Math.round((timeouts / tasks) * 100) : 0,
      evidenceContributed: evidenceIds.size,
      findingsInfluenced,
      totalRuntimeMs,
      avgRuntimeMs: tasks > 0 ? Math.round(totalRuntimeMs / tasks) : 0,
      estimatedUsd,
      recommendation: workerRecommendation({
        configured: config.type === 'mock' || Boolean(config.command),
        tasks,
        ok,
        timeouts,
        evidenceContributed: evidenceIds.size,
        findingsInfluenced,
      }),
    };
  });
}

function workerName(span: TraceSpan): string {
  return typeof span.attributes.worker === 'string' ? span.attributes.worker : span.name.split('.')[0] || 'unknown';
}

function workerRecommendation(input: {
  configured: boolean;
  tasks: number;
  ok: number;
  timeouts: number;
  evidenceContributed: number;
  findingsInfluenced: number;
}): string {
  if (!input.configured) {
    return 'Configure the CLI command before assigning real work.';
  }
  if (input.tasks === 0) {
    return 'Not exercised yet; dispatch a low-risk intent before comparing quality.';
  }
  if (input.timeouts > 0) {
    return 'Investigate timeout or session-resume behavior before increasing concurrency.';
  }
  if (input.ok === 0) {
    return 'Do not prioritize this worker until errors are resolved.';
  }
  if (input.evidenceContributed > 0 || input.findingsInfluenced > 0) {
    return 'Keep in the active pool for evidence-producing work.';
  }
  return 'Useful for reasoning; steer it toward toolRequests that produce evidence.';
}

function toolCards(spans: TraceSpan[], tools: ToolInvocation[], evidence: Array<{ toolCallId?: string }>): ToolScorecard[] {
  const spansByTool = new Map<string, TraceSpan[]>();
  for (const span of spans.filter((item) => item.kind === 'tool')) {
    const tool = typeof span.attributes.tool === 'string' ? span.attributes.tool : span.name;
    spansByTool.set(tool, [...(spansByTool.get(tool) ?? []), span]);
  }
  const toolsByName = new Map<string, ToolInvocation[]>();
  for (const invocation of tools) {
    toolsByName.set(invocation.tool, [...(toolsByName.get(invocation.tool) ?? []), invocation]);
  }
  const names = new Set([...spansByTool.keys(), ...toolsByName.keys()]);
  return [...names]
    .map((tool) => {
      const invocations = toolsByName.get(tool) ?? [];
      const toolSpans = spansByTool.get(tool) ?? [];
      const totalRuntimeMs = toolSpans.reduce((total, span) => total + span.durationMs, 0);
      const invocationIds = new Set(invocations.map((item) => item.id));
      return {
        tool,
        calls: invocations.length,
        allowed: invocations.filter((item) => item.status === 'allowed').length,
        blocked: invocations.filter((item) => item.status === 'blocked').length,
        approvalRequired: invocations.filter((item) => item.status === 'approval_required').length,
        evidenceProduced: evidence.filter((item) => item.toolCallId && invocationIds.has(item.toolCallId)).length,
        totalRuntimeMs,
        avgRuntimeMs: toolSpans.length > 0 ? Math.round(totalRuntimeMs / toolSpans.length) : 0,
      };
    })
    .sort((left, right) => right.calls - left.calls || right.evidenceProduced - left.evidenceProduced);
}

function heuristicGates(evidenceCount: number, findingCount: number, tools: ToolInvocation[]) {
  const blocked = tools.filter((tool) => tool.status === 'blocked').length;
  return [
    {
      id: 'evidence_progress',
      status: evidenceCount > 0 ? 'pass' : 'warn',
      detail: evidenceCount > 0 ? `${evidenceCount} evidence item(s) captured.` : 'No evidence captured yet.',
      observed: evidenceCount,
    },
    {
      id: 'finding_progress',
      status: findingCount > 0 ? 'pass' : 'warn',
      detail: findingCount > 0 ? `${findingCount} finding(s) proposed.` : 'No findings proposed yet.',
      observed: findingCount,
    },
    {
      id: 'tool_blocking',
      status: blocked === 0 ? 'pass' : 'warn',
      detail: blocked === 0 ? 'No blocked tool calls.' : `${blocked} tool call(s) blocked by policy or runtime gates.`,
      observed: blocked,
    },
  ] satisfies Array<{ id: string; status: EvaluationCheckStatus; detail: string; observed: number }>;
}

function heuristicScore(gates: Array<{ status: EvaluationCheckStatus }>): number {
  if (gates.length === 0) {
    return 0;
  }
  return Math.round((gates.reduce((total, gate) => total + gateValue(gate.status), 0) / gates.length) * 100);
}

function gateValue(status: EvaluationCheckStatus): number {
  if (status === 'pass') {
    return 1;
  }
  if (status === 'warn') {
    return 0.5;
  }
  return 0;
}

function heuristicGrade(score: number): RunEvaluation['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function recommendations(
  evidenceCount: number,
  findingCount: number,
  tools: ToolInvocation[],
  approvalCount: number,
  gates: Array<{ status: EvaluationCheckStatus }>,
): string[] {
  const result: string[] = [];
  if (approvalCount > 0) {
    result.push('Resolve pending approvals before spending more worker cycles.');
  }
  if (evidenceCount === 0) {
    result.push('Capture low-risk baseline evidence before proposing findings.');
  }
  if (findingCount === 0 && evidenceCount > 0) {
    result.push('Review evidence and propose candidate findings only when impact is real.');
  }
  if (tools.some((tool) => tool.status === 'blocked')) {
    result.push('Inspect blocked tool calls to tune scope, profile readiness, or approval policy.');
  }
  if (gates.some((gate) => gate.status === 'fail')) {
    result.push('Fix failing quality gates before report generation.');
  }
  return result.length > 0 ? result : ['Run posture is healthy; continue controlled exploration or generate a report.'];
}
