import { newId, nowIso } from '../domain/ids.js';
import type {
  CostLedgerEntry,
  CostLedgerSource,
  CostLedgerUnit,
  EvaluationCheckStatus,
  RunEvaluation,
  RunEvaluationCheck,
  RunObservabilitySummary,
  TraceSpan,
  TraceSpanKind,
  TraceSpanStatus,
} from '../domain/types.js';
import { redactText, redactUrl } from '../security/redaction.js';
import { getIndexedStoreMutator } from '../storage/indexed-store.js';
import type { PlatformStore } from '../storage/store.js';

type SpanAttributeValue = string | number | boolean | undefined;

export class ObservabilityService {
  constructor(private readonly store: PlatformStore) {}

  recordSpan(input: {
    runId: string;
    kind: TraceSpanKind;
    name: string;
    status: TraceSpanStatus;
    startedAt?: string;
    endedAt?: string;
    durationMs?: number;
    entityId?: string;
    parentId?: string;
    attributes?: Record<string, SpanAttributeValue>;
  }): TraceSpan {
    this.assertRun(input.runId);
    const endedAt = input.endedAt ?? nowIso();
    const startedAt = input.startedAt ?? endedAt;
    const span: TraceSpan = {
      id: newId('span'),
      runId: input.runId,
      kind: input.kind,
      name: redactText(input.name),
      status: input.status,
      startedAt,
      endedAt,
      durationMs:
        input.durationMs ??
        Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
      entityId: input.entityId,
      parentId: input.parentId,
      attributes: sanitizeAttributes(input.attributes ?? {}),
    };
    this.store.state.traceSpans[span.id] = span;
    getIndexedStoreMutator(this.store)?.onTraceSpanAdded(span.id, span);
    this.store.commit();
    return span;
  }

  recordDuration(input: {
    runId: string;
    kind: TraceSpanKind;
    name: string;
    status: TraceSpanStatus;
    startedMs: number;
    entityId?: string;
    parentId?: string;
    attributes?: Record<string, SpanAttributeValue>;
  }): TraceSpan {
    const endedMs = Date.now();
    return this.recordSpan({
      ...input,
      startedAt: new Date(input.startedMs).toISOString(),
      endedAt: new Date(endedMs).toISOString(),
      durationMs: Math.max(0, endedMs - input.startedMs),
    });
  }

  recordCost(input: {
    runId: string;
    source: CostLedgerSource;
    unit: CostLedgerUnit;
    quantity: number;
    estimatedUsd?: number;
    model?: string;
    worker?: string;
    tool?: string;
    entityId?: string;
  }): CostLedgerEntry {
    this.assertRun(input.runId);
    const entry: CostLedgerEntry = {
      id: newId('cost'),
      runId: input.runId,
      source: input.source,
      unit: input.unit,
      quantity: Math.max(0, input.quantity),
      estimatedUsd: Math.max(0, input.estimatedUsd ?? 0),
      model: input.model ? redactText(input.model) : undefined,
      worker: input.worker ? redactText(input.worker) : undefined,
      tool: input.tool ? redactText(input.tool) : undefined,
      entityId: input.entityId,
      createdAt: nowIso(),
    };
    this.store.state.costLedger[entry.id] = entry;
    getIndexedStoreMutator(this.store)?.onCostLedgerAdded(entry.id, entry);
    this.store.commit();
    return entry;
  }

  summary(runId: string): RunObservabilitySummary {
    this.assertRun(runId);
    const spans = Object.values(this.store.state.traceSpans)
      .filter((span) => span.runId === runId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id));
    const entries = Object.values(this.store.state.costLedger)
      .filter((entry) => entry.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const evaluations = Object.values(this.store.state.evaluations)
      .filter((evaluation) => evaluation.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const byKind = emptyKindDurations();
    for (const span of spans) {
      byKind[span.kind] += span.durationMs;
    }
    return {
      runId,
      spans: spans.slice(0, 50),
      latestEvaluation: evaluations[0],
      counts: {
        spans: spans.length,
        errors: spans.filter((span) => span.status === 'error' || span.status === 'timeout').length,
        blocked: spans.filter((span) => span.status === 'blocked').length,
        approvalRequired: spans.filter((span) => span.status === 'approval_required').length,
      },
      duration: {
        totalMs: spans.reduce((total, span) => total + span.durationMs, 0),
        byKind,
      },
      cost: {
        entries: entries.slice(0, 50),
        totalEstimatedUsd: entries.reduce((total, entry) => total + entry.estimatedUsd, 0),
        localRuntimeMs: entries
          .filter((entry) => entry.unit === 'millisecond')
          .reduce((total, entry) => total + entry.quantity, 0),
      },
    };
  }

  evaluateRun(runId: string): RunEvaluation {
    this.assertRun(runId);
    const checks = this.buildChecks(runId);
    const score = Math.round((checks.reduce((total, check) => total + checkValue(check.status), 0) / checks.length) * 100);
    const evaluation: RunEvaluation = {
      id: newId('eval'),
      runId,
      score,
      grade: grade(score),
      checks,
      createdAt: nowIso(),
    };
    this.store.state.evaluations[evaluation.id] = evaluation;
    this.recordSpan({
      runId,
      kind: 'evaluation',
      name: 'run.quality_evaluation',
      status: score >= 60 ? 'ok' : 'error',
      entityId: evaluation.id,
      attributes: { score, grade: evaluation.grade },
    });
    this.recordCost({
      runId,
      source: 'evaluation',
      unit: 'request',
      quantity: 1,
      entityId: evaluation.id,
    });
    this.store.commit();
    return evaluation;
  }

  private buildChecks(runId: string): RunEvaluationCheck[] {
    const evidence = Object.values(this.store.state.evidence).filter((item) => item.runId === runId);
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId);
    const activeFindings = findings.filter((item) => item.validationState !== 'rejected');
    const tools = Object.values(this.store.state.toolInvocations).filter((item) => item.runId === runId);
    const spans = Object.values(this.store.state.traceSpans).filter((item) => item.runId === runId);
    const reports = evidence.filter((item) => item.kind === 'replay_bundle');
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    const evidenceBacked = findings.every(
      (finding) => finding.evidenceIds.length > 0 && finding.evidenceIds.every((id) => evidenceById.has(id)),
    );
    const rawEvidenceInActiveFindings = activeFindings.some((finding) =>
      finding.evidenceIds.some((id) => evidenceById.get(id)?.redactionState === 'raw_local_only'),
    );
    const scopeBlocked = tools.filter((tool) => tool.status === 'blocked' && /scope|denied|method|asset/i.test(tool.reason ?? ''));
    const approvalsById = new Map(Object.values(this.store.state.approvals).filter((item) => item.runId === runId).map((item) => [item.id, item]));
    const unauthorizedR4 = tools.filter(
      (tool) => tool.riskLevel === 'R4' && tool.status === 'allowed' && (!tool.approvalId || approvalsById.get(tool.approvalId)?.status !== 'approved'),
    );
    const candidateFindings = findings.filter((finding) => finding.validationState === 'candidate');

    return [
      check(
        'scope_controls',
        'Scope and destructive-action controls',
        unauthorizedR4.length === 0 ? 'pass' : 'fail',
        unauthorizedR4.length === 0
          ? `Scope gate active; ${scopeBlocked.length} out-of-policy tool requests were blocked.`
          : `${unauthorizedR4.length} R4 tool requests were allowed without approved break-glass approval.`,
        unauthorizedR4.length,
      ),
      check(
        'evidence_backed_findings',
        'Findings have reproducible evidence',
        evidenceBacked ? 'pass' : 'fail',
        evidenceBacked
          ? `${findings.length} findings reference local evidence.`
          : 'At least one finding is missing evidence or references missing evidence.',
        findings.length,
      ),
      check(
        'human_review_coverage',
        'Human validation coverage',
        findings.length === 0 ? 'warn' : candidateFindings.length === 0 ? 'pass' : 'warn',
        findings.length === 0
          ? 'No findings have been proposed yet.'
          : candidateFindings.length === 0
            ? 'All proposed findings have been confirmed or rejected.'
            : `${candidateFindings.length} findings are still candidate state.`,
        candidateFindings.length,
      ),
      check(
        'report_safety',
        'Report safety and redaction',
        rawEvidenceInActiveFindings ? 'fail' : reports.length > 0 ? 'pass' : 'warn',
        rawEvidenceInActiveFindings
          ? 'An active finding references raw-local-only evidence.'
          : reports.length > 0
            ? `${reports.length} replay bundle reports are stored as redacted evidence.`
            : 'No report bundle has been generated yet.',
        reports.length,
      ),
      check(
        'traceability',
        'Trace and cost observability',
        spans.length > 0 ? 'pass' : 'warn',
        spans.length > 0 ? `${spans.length} trace spans are available for replay and model/tool comparison.` : 'No trace spans recorded yet.',
        spans.length,
      ),
    ];
  }

  private assertRun(runId: string): void {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
  }
}

function sanitizeAttributes(attributes: Record<string, SpanAttributeValue>): Record<string, string | number | boolean> {
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === 'string') {
      sanitized[key] = /url|target|uri/i.test(key) ? redactUrl(value).slice(0, 500) : redactText(value).slice(0, 500);
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function emptyKindDurations(): Record<TraceSpanKind, number> {
  return {
    dispatch: 0,
    worker: 0,
    tool: 0,
    report: 0,
    evaluation: 0,
  };
}

function check(
  id: string,
  title: string,
  status: EvaluationCheckStatus,
  detail: string,
  observed: number,
): RunEvaluationCheck {
  return { id, title, status, detail, observed };
}

function checkValue(status: EvaluationCheckStatus): number {
  if (status === 'pass') {
    return 1;
  }
  if (status === 'warn') {
    return 0.5;
  }
  return 0;
}

function grade(score: number): RunEvaluation['grade'] {
  if (score >= 90) {
    return 'A';
  }
  if (score >= 75) {
    return 'B';
  }
  if (score >= 60) {
    return 'C';
  }
  return 'D';
}
