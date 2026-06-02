import { nowIso } from '../domain/ids.js';
import type { CostLedgerEntry, Fact, Finding, Run, TraceSpan, WorkerType } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';

export type WorkerLeaderboardRecommendation = 'promote' | 'observe' | 'deprioritize' | 'not_exercised';

export interface WorkerLeaderboardCard {
  worker: string;
  type: WorkerType;
  configuredRuns: number;
  exercisedRuns: number;
  tasks: number;
  successRate: number;
  timeoutRate: number;
  errorRate: number;
  evidenceContributed: number;
  findingsInfluenced: number;
  totalRuntimeMs: number;
  avgRuntimeMs: number;
  estimatedUsd: number;
  score: number;
  recommendation: WorkerLeaderboardRecommendation;
  rationale: string;
}

export interface WorkerTypeLeaderboardCard {
  type: WorkerType;
  workers: number;
  tasks: number;
  successRate: number;
  timeoutRate: number;
  evidenceContributed: number;
  findingsInfluenced: number;
  estimatedUsd: number;
  score: number;
}

export interface WorkerLeaderboardReport {
  generatedAt: string;
  mode: 'cross_run_agent_worker_eval';
  summary: string;
  counts: {
    runs: number;
    configuredWorkers: number;
    exercisedWorkers: number;
    workerTasks: number;
    evidenceContributed: number;
    findingsInfluenced: number;
    estimatedUsd: number;
  };
  workers: WorkerLeaderboardCard[];
  types: WorkerTypeLeaderboardCard[];
  recommendations: string[];
  safetyNotes: string[];
}

export class WorkerLeaderboardService {
  constructor(private readonly store: PlatformStore) {}

  get(): WorkerLeaderboardReport {
    const runs = Object.values(this.store.state.runs);
    const spans = Object.values(this.store.state.traceSpans).filter((span) => span.kind === 'worker');
    const facts = Object.values(this.store.state.facts);
    const findings = Object.values(this.store.state.findings);
    const costs = Object.values(this.store.state.costLedger);
    const workers = workerCards(runs, spans, facts, findings, costs);
    const types = typeCards(workers);
    const counts = {
      runs: runs.length,
      configuredWorkers: runs.reduce((total, run) => total + run.workerPool.length, 0),
      exercisedWorkers: workers.filter((worker) => worker.tasks > 0).length,
      workerTasks: workers.reduce((total, worker) => total + worker.tasks, 0),
      evidenceContributed: workers.reduce((total, worker) => total + worker.evidenceContributed, 0),
      findingsInfluenced: workers.reduce((total, worker) => total + worker.findingsInfluenced, 0),
      estimatedUsd: roundMoney(workers.reduce((total, worker) => total + worker.estimatedUsd, 0)),
    };
    return {
      generatedAt: nowIso(),
      mode: 'cross_run_agent_worker_eval',
      summary:
        `${counts.exercisedWorkers}/${counts.configuredWorkers} configured Worker slot(s) have runtime evidence across ${counts.runs} run(s). ` +
        `${counts.workerTasks} worker task(s), ${counts.evidenceContributed} evidence link(s), ${counts.findingsInfluenced} influenced finding(s).`,
      counts,
      workers,
      types,
      recommendations: recommendations(workers, types),
      safetyNotes: [
        'Worker Leaderboard is a read-only evaluation view.',
        'Scores are derived from platform trace spans, cost ledger entries, graph facts, evidence links, and findings.',
        'Workers do not self-report quality and cannot mutate leaderboard state.',
        'Leaderboard recommendations do not bypass Dispatcher selection, scope policy, approvals, Tool Gateway checks, or evidence requirements.',
      ],
    };
  }
}

function workerCards(
  runs: Run[],
  spans: TraceSpan[],
  facts: Fact[],
  findings: Finding[],
  costs: CostLedgerEntry[],
): WorkerLeaderboardCard[] {
  const configured = new Map<string, { type: WorkerType; runIds: Set<string> }>();
  for (const run of runs) {
    for (const worker of run.workerPool) {
      const current = configured.get(worker.name) ?? { type: worker.type, runIds: new Set<string>() };
      current.type = worker.type;
      current.runIds.add(run.id);
      configured.set(worker.name, current);
    }
  }
  const spanNames = new Set(spans.map(workerName));
  for (const name of spanNames) {
    if (!configured.has(name)) {
      configured.set(name, { type: 'mock', runIds: new Set<string>() });
    }
  }
  const cards = [...configured.entries()].map(([worker, config]) => {
    const workerSpans = spans.filter((span) => workerName(span) === worker);
    const workerFacts = facts.filter((fact) => fact.createdBy.startsWith(`${worker}:`));
    const evidenceIds = new Set(workerFacts.flatMap((fact) => fact.evidenceIds));
    const influencedFindings = findings.filter((finding) => finding.evidenceIds.some((id) => evidenceIds.has(id)));
    const workerCosts = costs.filter((cost) => cost.worker === worker);
    const tasks = workerSpans.length;
    const ok = workerSpans.filter((span) => span.status === 'ok').length;
    const timeouts = workerSpans.filter((span) => span.status === 'timeout').length;
    const errors = workerSpans.filter((span) => span.status === 'error').length;
    const totalRuntimeMs = workerSpans.reduce((total, span) => total + span.durationMs, 0);
    const successRate = percent(ok, tasks);
    const timeoutRate = percent(timeouts, tasks);
    const errorRate = percent(errors, tasks);
    const estimatedUsd = roundMoney(workerCosts.reduce((total, cost) => total + cost.estimatedUsd, 0));
    const score = workerScore({
      tasks,
      successRate,
      timeoutRate,
      errorRate,
      evidenceContributed: evidenceIds.size,
      findingsInfluenced: influencedFindings.length,
      avgRuntimeMs: tasks > 0 ? Math.round(totalRuntimeMs / tasks) : 0,
    });
    const recommendation = recommendationFor(tasks, score, timeoutRate, errorRate, evidenceIds.size, influencedFindings.length);
    return {
      worker,
      type: config.type,
      configuredRuns: config.runIds.size,
      exercisedRuns: new Set(workerSpans.map((span) => span.runId)).size,
      tasks,
      successRate,
      timeoutRate,
      errorRate,
      evidenceContributed: evidenceIds.size,
      findingsInfluenced: influencedFindings.length,
      totalRuntimeMs,
      avgRuntimeMs: tasks > 0 ? Math.round(totalRuntimeMs / tasks) : 0,
      estimatedUsd,
      score,
      recommendation,
      rationale: rationaleFor(recommendation),
    };
  });
  return cards.sort((left, right) => right.score - left.score || right.tasks - left.tasks || left.worker.localeCompare(right.worker));
}

function typeCards(workers: WorkerLeaderboardCard[]): WorkerTypeLeaderboardCard[] {
  const grouped = new Map<WorkerType, WorkerLeaderboardCard[]>();
  for (const worker of workers) {
    grouped.set(worker.type, [...(grouped.get(worker.type) ?? []), worker]);
  }
  return [...grouped.entries()]
    .map(([type, items]) => {
      const tasks = items.reduce((total, worker) => total + worker.tasks, 0);
      const weighted = (selector: (worker: WorkerLeaderboardCard) => number) =>
        tasks === 0 ? 0 : Math.round(items.reduce((total, worker) => total + selector(worker) * worker.tasks, 0) / tasks);
      return {
        type,
        workers: items.length,
        tasks,
        successRate: weighted((worker) => worker.successRate),
        timeoutRate: weighted((worker) => worker.timeoutRate),
        evidenceContributed: items.reduce((total, worker) => total + worker.evidenceContributed, 0),
        findingsInfluenced: items.reduce((total, worker) => total + worker.findingsInfluenced, 0),
        estimatedUsd: roundMoney(items.reduce((total, worker) => total + worker.estimatedUsd, 0)),
        score: items.length > 0 ? Math.round(items.reduce((total, worker) => total + worker.score, 0) / items.length) : 0,
      };
    })
    .sort((left, right) => right.score - left.score || right.tasks - left.tasks || left.type.localeCompare(right.type));
}

function recommendations(workers: WorkerLeaderboardCard[], types: WorkerTypeLeaderboardCard[]): string[] {
  const result: string[] = [];
  const promoted = workers.filter((worker) => worker.recommendation === 'promote');
  if (promoted[0]) {
    result.push(`Prefer ${promoted[0].worker} for evidence-producing work until another Worker beats its score.`);
  }
  const notExercised = workers.filter((worker) => worker.recommendation === 'not_exercised');
  if (notExercised.length > 0) {
    result.push(`Exercise ${notExercised.length} configured Worker(s) with low-risk intents before comparing quality.`);
  }
  const risky = workers.filter((worker) => worker.recommendation === 'deprioritize');
  if (risky.length > 0) {
    result.push(`Deprioritize ${risky.map((worker) => worker.worker).join(', ')} until errors/timeouts are resolved.`);
  }
  const topType = types.find((type) => type.tasks > 0);
  if (topType) {
    result.push(`Current strongest Worker type is ${topType.type} with score ${topType.score}.`);
  }
  return result.length > 0 ? result : ['No Worker runtime evidence yet; run controlled low-risk dispatches to build the leaderboard.'];
}

function workerScore(input: {
  tasks: number;
  successRate: number;
  timeoutRate: number;
  errorRate: number;
  evidenceContributed: number;
  findingsInfluenced: number;
  avgRuntimeMs: number;
}): number {
  if (input.tasks === 0) {
    return 0;
  }
  const evidenceScore = Math.min(25, input.evidenceContributed * 5);
  const findingScore = Math.min(20, input.findingsInfluenced * 10);
  const speedPenalty = input.avgRuntimeMs > 120_000 ? 10 : input.avgRuntimeMs > 30_000 ? 4 : 0;
  return clamp(Math.round(input.successRate * 0.45 + evidenceScore + findingScore - input.timeoutRate * 0.25 - input.errorRate * 0.2 - speedPenalty));
}

function recommendationFor(
  tasks: number,
  score: number,
  timeoutRate: number,
  errorRate: number,
  evidenceContributed: number,
  findingsInfluenced: number,
): WorkerLeaderboardRecommendation {
  if (tasks === 0) return 'not_exercised';
  if (timeoutRate >= 30 || errorRate >= 30 || score < 35) return 'deprioritize';
  if (score >= 70 || findingsInfluenced > 0 || evidenceContributed >= 3) return 'promote';
  return 'observe';
}

function rationaleFor(recommendation: WorkerLeaderboardRecommendation): string {
  if (recommendation === 'promote') {
    return 'Prioritize for similar work; platform evidence shows useful contribution.';
  }
  if (recommendation === 'observe') {
    return 'Keep in the pool, but collect more evidence before increasing concurrency.';
  }
  if (recommendation === 'deprioritize') {
    return 'Resolve runtime failures or low-quality output before assigning important intents.';
  }
  return 'Configured but not exercised; run a low-risk task before comparing.';
}

function workerName(span: TraceSpan): string {
  return typeof span.attributes.worker === 'string' ? span.attributes.worker : span.name.split('.')[0] || 'unknown';
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}
