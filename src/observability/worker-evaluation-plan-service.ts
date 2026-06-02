import { nowIso } from '../domain/ids.js';
import type { CostLedgerEntry, Fact, Finding, Run, TraceSpan, WorkerConfig } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';

export type WorkerEvaluationReadiness = 'ready' | 'needs_warmup' | 'insufficient_data' | 'blocked';
export type WorkerEvaluationDimensionStatus = 'pass' | 'warn' | 'fail';
export type WorkerEvaluationTask = 'bootstrap' | 'reason' | 'explore';

export interface WorkerEvaluationCard {
  worker: string;
  type: WorkerConfig['type'];
  commandConfigured: boolean;
  priority: number;
  score: number;
  readiness: WorkerEvaluationReadiness;
  tasks: number;
  tasksByKind: Record<WorkerEvaluationTask, number>;
  successRate: number;
  timeoutRate: number;
  errorRate: number;
  evidenceContributed: number;
  findingsInfluenced: number;
  avgRuntimeMs: number;
  estimatedUsd: number;
  missingTasks: WorkerEvaluationTask[];
  strengths: string[];
  gaps: string[];
}

export interface WorkerEvaluationDimension {
  id: string;
  title: string;
  score: number;
  status: WorkerEvaluationDimensionStatus;
  detail: string;
  signals: string[];
  gaps: string[];
}

export interface WorkerEvaluationExperiment {
  id: string;
  title: string;
  status: 'ready' | 'needs_setup' | 'waiting_for_data';
  objective: string;
  task: WorkerEvaluationTask | 'mixed';
  workerNames: string[];
  successCriteria: string[];
  safetyGates: string[];
}

export interface WorkerEvaluationPlan {
  runId: string;
  generatedAt: string;
  mode: 'agent_worker_evaluation_plan';
  readiness: WorkerEvaluationReadiness;
  summary: string;
  counts: {
    configuredWorkers: number;
    comparableWorkers: number;
    exercisedWorkers: number;
    workerTasks: number;
    coveredTaskCells: number;
    totalTaskCells: number;
    missingTaskCells: number;
    evidenceProducingWorkers: number;
    findingInfluencingWorkers: number;
    estimatedUsd: number;
  };
  workers: WorkerEvaluationCard[];
  dimensions: WorkerEvaluationDimension[];
  experiments: WorkerEvaluationExperiment[];
  nextActions: string[];
  safetyNotes: string[];
}

const TASKS: WorkerEvaluationTask[] = ['bootstrap', 'reason', 'explore'];

export class WorkerEvaluationPlanService {
  constructor(private readonly store: PlatformStore) {}

  get(runId: string): WorkerEvaluationPlan {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const spans = Object.values(this.store.state.traceSpans).filter((item) => item.runId === runId && item.kind === 'worker');
    const facts = Object.values(this.store.state.facts).filter((item) => item.runId === runId);
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId);
    const costs = Object.values(this.store.state.costLedger).filter((item) => item.runId === runId);
    const workers = run.workerPool.map((worker) => workerCard(worker, spans, facts, findings, costs));
    const counts = {
      configuredWorkers: workers.filter((worker) => worker.commandConfigured).length,
      comparableWorkers: workers.filter((worker) => worker.commandConfigured).length >= 2 ? workers.filter((worker) => worker.commandConfigured).length : 0,
      exercisedWorkers: workers.filter((worker) => worker.tasks > 0).length,
      workerTasks: workers.reduce((total, worker) => total + worker.tasks, 0),
      coveredTaskCells: workers.reduce((total, worker) => total + TASKS.filter((task) => worker.tasksByKind[task] > 0).length, 0),
      totalTaskCells: workers.length * TASKS.length,
      missingTaskCells: workers.reduce((total, worker) => total + worker.missingTasks.length, 0),
      evidenceProducingWorkers: workers.filter((worker) => worker.evidenceContributed > 0).length,
      findingInfluencingWorkers: workers.filter((worker) => worker.findingsInfluenced > 0).length,
      estimatedUsd: roundMoney(workers.reduce((total, worker) => total + worker.estimatedUsd, 0)),
    };
    const dimensions = dimensionsFor(run, workers, counts, spans);
    const readiness = readinessFor(dimensions, counts);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'agent_worker_evaluation_plan',
      readiness,
      summary:
        `${counts.exercisedWorkers}/${counts.configuredWorkers} configured Worker(s) exercised; ` +
        `${counts.coveredTaskCells}/${counts.totalTaskCells} task cell(s) covered; ` +
        `${counts.evidenceProducingWorkers} evidence-producing Worker(s).`,
      counts,
      workers,
      dimensions,
      experiments: experimentsFor(run, workers, counts),
      nextActions: nextActions(workers, dimensions, counts),
      safetyNotes: [
        'Worker Evaluation Plan is read-only and does not dispatch Workers or claim intents.',
        'Worker quality is derived from trace spans, cost ledger, facts, evidence links, and finding influence rather than Worker self-reporting.',
        'Comparison work must still go through Dispatcher, ScopePolicy, Tool Gateway, approvals, evidence review, and finding validation.',
        'The plan measures Agent Worker runtime quality; it does not create Worker-to-Worker communication or multi-agent role ownership.',
      ],
    };
  }
}

function workerCard(
  config: WorkerConfig,
  spans: TraceSpan[],
  facts: Fact[],
  findings: Finding[],
  costs: CostLedgerEntry[],
): WorkerEvaluationCard {
  const workerSpans = spans.filter((span) => workerName(span) === config.name);
  const tasksByKind = {
    bootstrap: workerSpans.filter((span) => workerTask(span) === 'bootstrap').length,
    reason: workerSpans.filter((span) => workerTask(span) === 'reason').length,
    explore: workerSpans.filter((span) => workerTask(span) === 'explore').length,
  };
  const missingTasks = TASKS.filter((task) => tasksByKind[task] === 0);
  const workerFacts = facts.filter((fact) => fact.createdBy.startsWith(`${config.name}:`));
  const evidenceIds = new Set(workerFacts.flatMap((fact) => fact.evidenceIds));
  const influencedFindings = findings.filter((finding) => finding.evidenceIds.some((id) => evidenceIds.has(id)));
  const workerCosts = costs.filter((cost) => cost.worker === config.name);
  const tasks = workerSpans.length;
  const ok = workerSpans.filter((span) => span.status === 'ok').length;
  const timeouts = workerSpans.filter((span) => span.status === 'timeout').length;
  const errors = workerSpans.filter((span) => span.status === 'error').length;
  const totalRuntimeMs = workerSpans.reduce((total, span) => total + span.durationMs, 0);
  const successRate = percent(ok, tasks);
  const timeoutRate = percent(timeouts, tasks);
  const errorRate = percent(errors, tasks);
  const avgRuntimeMs = tasks > 0 ? Math.round(totalRuntimeMs / tasks) : 0;
  const commandConfigured = config.type === 'mock' || Boolean(config.command);
  const score = workerEvalScore({
    commandConfigured,
    tasks,
    successRate,
    timeoutRate,
    errorRate,
    taskCoverage: percent(TASKS.length - missingTasks.length, TASKS.length),
    evidenceContributed: evidenceIds.size,
    findingsInfluenced: influencedFindings.length,
    avgRuntimeMs,
  });
  return {
    worker: config.name,
    type: config.type,
    commandConfigured,
    priority: config.priority,
    score,
    readiness: workerReadiness(commandConfigured, tasks, missingTasks.length, score, timeoutRate, errorRate),
    tasks,
    tasksByKind,
    successRate,
    timeoutRate,
    errorRate,
    evidenceContributed: evidenceIds.size,
    findingsInfluenced: influencedFindings.length,
    avgRuntimeMs,
    estimatedUsd: roundMoney(workerCosts.reduce((total, cost) => total + cost.estimatedUsd, 0)),
    missingTasks,
    strengths: workerStrengths(successRate, evidenceIds.size, influencedFindings.length, avgRuntimeMs, missingTasks.length),
    gaps: workerGaps(commandConfigured, tasks, missingTasks, timeoutRate, errorRate, evidenceIds.size),
  };
}

function dimensionsFor(
  run: Run,
  workers: WorkerEvaluationCard[],
  counts: WorkerEvaluationPlan['counts'],
  spans: TraceSpan[],
): WorkerEvaluationDimension[] {
  const configuredRatio = ratio(counts.configuredWorkers, run.workerPool.length);
  const exerciseRatio = ratio(counts.exercisedWorkers, Math.max(counts.configuredWorkers, 1));
  const taskCoverageRatio = ratio(counts.coveredTaskCells, Math.max(counts.totalTaskCells, 1));
  const reliableSpans = spans.filter((span) => span.status === 'ok').length;
  const reliabilityRatio = ratio(reliableSpans, spans.length);
  const evidenceRatio = ratio(counts.evidenceProducingWorkers, Math.max(counts.exercisedWorkers, 1));
  const comparable = counts.configuredWorkers >= 2;
  return [
    dimension({
      id: 'worker_runtime_setup',
      title: 'Worker runtime setup',
      score: clamp(Math.round(configuredRatio * 80) + (run.workerPool.length > 0 ? 20 : 0)),
      detail: `${counts.configuredWorkers}/${run.workerPool.length} Worker slot(s) have a runnable runtime contract.`,
      signals: [`configured=${counts.configuredWorkers}`, `pool=${run.workerPool.length}`],
      gaps: workers.filter((worker) => !worker.commandConfigured).map((worker) => `${worker.worker} has no command configured.`),
    }),
    dimension({
      id: 'task_cell_coverage',
      title: 'Task cell coverage',
      score: clamp(Math.round(taskCoverageRatio * 100)),
      detail: `${counts.coveredTaskCells}/${counts.totalTaskCells} bootstrap/reason/explore cells have trace data.`,
      signals: [`coverage=${percent(counts.coveredTaskCells, Math.max(counts.totalTaskCells, 1))}%`, `missing=${counts.missingTaskCells}`],
      gaps: workers
        .filter((worker) => worker.missingTasks.length > 0)
        .slice(0, 4)
        .map((worker) => `${worker.worker} missing ${worker.missingTasks.join(', ')} task data.`),
    }),
    dimension({
      id: 'reliability',
      title: 'Worker reliability',
      score: clamp(Math.round(reliabilityRatio * 100) - workers.reduce((total, worker) => total + worker.timeoutRate + worker.errorRate, 0) * 0.05),
      detail: `${reliableSpans}/${spans.length} Worker span(s) completed successfully.`,
      signals: workers.map((worker) => `${worker.worker}: success ${worker.successRate}%`).slice(0, 4),
      gaps: workers
        .filter((worker) => worker.timeoutRate > 0 || worker.errorRate > 0)
        .map((worker) => `${worker.worker} has timeout/error pressure.`),
    }),
    dimension({
      id: 'evidence_output',
      title: 'Evidence output',
      score: clamp(Math.round(evidenceRatio * 70) + Math.min(counts.findingInfluencingWorkers, 3) * 10),
      detail: `${counts.evidenceProducingWorkers} Worker(s) produced evidence-linked facts; ${counts.findingInfluencingWorkers} influenced findings.`,
      signals: workers.map((worker) => `${worker.worker}: evidence ${worker.evidenceContributed}`).slice(0, 4),
      gaps: [
        ...(counts.exercisedWorkers > 0 && counts.evidenceProducingWorkers === 0
          ? ['No exercised Worker has produced evidence-linked facts yet.']
          : []),
      ],
    }),
    dimension({
      id: 'pairwise_comparison',
      title: 'Pairwise comparison readiness',
      score: clamp((comparable ? 45 : 0) + Math.round(exerciseRatio * 35) + (counts.coveredTaskCells >= 2 ? 20 : 0)),
      detail: comparable
        ? `${counts.configuredWorkers} configured Workers can be compared under the same run policy.`
        : 'At least two configured Workers are needed for meaningful comparison.',
      signals: [`comparable=${comparable}`, `exercised=${counts.exercisedWorkers}`],
      gaps: [
        ...(!comparable ? ['Configure a second real Worker, such as Claude Code plus Codex, for head-to-head evaluation.'] : []),
        ...(counts.exercisedWorkers < 2 ? ['Exercise at least two Workers before trusting a ranking.'] : []),
      ],
    }),
  ];
}

function experimentsFor(
  run: Run,
  workers: WorkerEvaluationCard[],
  counts: WorkerEvaluationPlan['counts'],
): WorkerEvaluationExperiment[] {
  const configured = workers.filter((worker) => worker.commandConfigured);
  const experiments: WorkerEvaluationExperiment[] = [
    {
      id: 'same_scope_low_risk_bakeoff',
      title: 'Same-scope low-risk Worker bakeoff',
      status: configured.length >= 2 ? 'ready' : 'needs_setup',
      objective: 'Compare configured Agent Workers on the same authorized target without changing scope or tool permissions.',
      task: 'mixed',
      workerNames: configured.slice(0, 4).map((worker) => worker.worker),
      successCriteria: [
        'Each Worker completes bootstrap and reason without schema errors.',
        'Explore output produces at least one evidence-linked fact through Tool Gateway requests.',
        'No scope violation, R4 bypass, or raw secret leakage occurs.',
      ],
      safetyGates: [
        `destructiveAllowed=${run.scopePolicy.destructiveAllowed}`,
        'Tool Gateway remains the only active execution path.',
        'Findings still require same-run evidence and human validation.',
      ],
    },
    {
      id: 'missing_task_cells',
      title: 'Missing task-cell warmup',
      status: counts.missingTaskCells > 0 ? 'waiting_for_data' : 'ready',
      objective: 'Fill missing bootstrap/reason/explore trace cells before trusting leaderboard scores.',
      task: 'mixed',
      workerNames: workers.filter((worker) => worker.missingTasks.length > 0).map((worker) => worker.worker),
      successCriteria: [
        'Every configured Worker has at least one bootstrap, reason, and explore span.',
        'Timeouts and non-JSON outputs are visible in trace data.',
        'Cost and runtime are comparable across task shapes.',
      ],
      safetyGates: ['Use low-risk R0/R1 intents for warmup.', 'Do not increase autonomy just to create eval data.'],
    },
    {
      id: 'evidence_quality_scoring',
      title: 'Evidence-quality scoring loop',
      status: counts.evidenceProducingWorkers > 0 ? 'ready' : 'waiting_for_data',
      objective: 'Rank Workers by evidence that survives review, replay/reproduction checks, and finding delivery gates.',
      task: 'explore',
      workerNames: workers.filter((worker) => worker.evidenceContributed > 0).map((worker) => worker.worker),
      successCriteria: [
        'Evidence is reviewed as useful.',
        'Evidence Quality Index marks the linked finding as delivery-ready or explains the gap.',
        'Worker ranking uses useful evidence and finding influence, not raw task count.',
      ],
      safetyGates: ['Evidence content stays local unless redacted or safe_for_cloud.', 'Workers cannot mark their own evidence useful.'],
    },
  ];
  return experiments;
}

function nextActions(
  workers: WorkerEvaluationCard[],
  dimensions: WorkerEvaluationDimension[],
  counts: WorkerEvaluationPlan['counts'],
): string[] {
  const actions: string[] = [];
  for (const dimension of dimensions) {
    if (dimension.status !== 'pass') {
      actions.push(...dimension.gaps);
    }
  }
  if (counts.configuredWorkers < 2) {
    actions.push('Configure at least two Agent Workers for CAI-style model/runtime comparison.');
  }
  for (const worker of workers.filter((item) => item.readiness !== 'ready').slice(0, 4)) {
    actions.push(`${worker.worker}: ${worker.gaps[0] || 'collect more comparable trace data'}`);
  }
  return unique(actions).slice(0, 10);
}

function dimension(input: Omit<WorkerEvaluationDimension, 'status'>): WorkerEvaluationDimension {
  return { ...input, status: statusFromScore(input.score) };
}

function readinessFor(
  dimensions: WorkerEvaluationDimension[],
  counts: WorkerEvaluationPlan['counts'],
): WorkerEvaluationReadiness {
  if (dimensions.some((dimension) => dimension.status === 'fail') && counts.configuredWorkers === 0) return 'blocked';
  if (counts.configuredWorkers < 2) return 'insufficient_data';
  if (counts.missingTaskCells > 0 || counts.exercisedWorkers < 2) return 'needs_warmup';
  if (dimensions.some((dimension) => dimension.status === 'fail')) return 'insufficient_data';
  return 'ready';
}

function workerReadiness(
  commandConfigured: boolean,
  tasks: number,
  missingTasks: number,
  score: number,
  timeoutRate: number,
  errorRate: number,
): WorkerEvaluationReadiness {
  if (!commandConfigured) return 'blocked';
  if (tasks === 0 || missingTasks > 0) return 'needs_warmup';
  if (timeoutRate >= 30 || errorRate >= 30 || score < 45) return 'insufficient_data';
  return 'ready';
}

function workerStrengths(
  successRate: number,
  evidenceContributed: number,
  findingsInfluenced: number,
  avgRuntimeMs: number,
  missingTasks: number,
): string[] {
  return [
    ...(successRate >= 80 ? [`${successRate}% success rate`] : []),
    ...(evidenceContributed > 0 ? [`${evidenceContributed} evidence link(s)`] : []),
    ...(findingsInfluenced > 0 ? [`${findingsInfluenced} influenced finding(s)`] : []),
    ...(avgRuntimeMs > 0 && avgRuntimeMs <= 30_000 ? ['fast enough for interactive scheduling'] : []),
    ...(missingTasks === 0 ? ['all task cells covered'] : []),
  ];
}

function workerGaps(
  commandConfigured: boolean,
  tasks: number,
  missingTasks: WorkerEvaluationTask[],
  timeoutRate: number,
  errorRate: number,
  evidenceContributed: number,
): string[] {
  return [
    ...(!commandConfigured ? ['Configure a command or keep this Worker out of commercial runs.'] : []),
    ...(tasks === 0 ? ['Not exercised yet; dispatch low-risk work before comparing quality.'] : []),
    ...(missingTasks.length > 0 ? [`Missing ${missingTasks.join(', ')} task data.`] : []),
    ...(timeoutRate > 0 ? [`Timeout rate is ${timeoutRate}%.`] : []),
    ...(errorRate > 0 ? [`Error rate is ${errorRate}%.`] : []),
    ...(tasks > 0 && evidenceContributed === 0 ? ['No evidence-linked facts yet.'] : []),
  ];
}

function workerEvalScore(input: {
  commandConfigured: boolean;
  tasks: number;
  successRate: number;
  timeoutRate: number;
  errorRate: number;
  taskCoverage: number;
  evidenceContributed: number;
  findingsInfluenced: number;
  avgRuntimeMs: number;
}): number {
  if (!input.commandConfigured) return 0;
  if (input.tasks === 0) return 20;
  const speedPenalty = input.avgRuntimeMs > 120_000 ? 8 : input.avgRuntimeMs > 45_000 ? 4 : 0;
  return clamp(
    input.successRate * 0.35 +
      input.taskCoverage * 0.2 +
      Math.min(20, input.evidenceContributed * 5) +
      Math.min(15, input.findingsInfluenced * 8) -
      input.timeoutRate * 0.2 -
      input.errorRate * 0.2 -
      speedPenalty,
  );
}

function workerName(span: TraceSpan): string {
  return typeof span.attributes.worker === 'string' ? span.attributes.worker : span.name.split('.')[0] || 'unknown';
}

function workerTask(span: TraceSpan): WorkerEvaluationTask | undefined {
  const task = typeof span.attributes.task === 'string' ? span.attributes.task : span.name.split('.')[1];
  return task === 'bootstrap' || task === 'reason' || task === 'explore' ? task : undefined;
}

function statusFromScore(score: number): WorkerEvaluationDimensionStatus {
  if (score >= 75) return 'pass';
  if (score >= 45) return 'warn';
  return 'fail';
}

function ratio(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
