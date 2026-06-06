import { nowIso } from '../domain/ids.js';
import type { CostLedgerEntry, Fact, Finding, Intent, Run, TraceSpan, WorkerConfig, WorkerRuntimeStatus } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import { WorkerLeaderboardService, type WorkerLeaderboardCard } from '../observability/worker-leaderboard-service.js';
import { createWorker } from '../workers/factory.js';

export type WorkerSelectionTask = 'bootstrap' | 'reason' | 'explore';
export type WorkerSelectionDecision = 'recommended' | 'eligible' | 'warm_up' | 'deprioritize' | 'blocked';

export interface WorkerSelectionCandidate {
  worker: string;
  type: WorkerConfig['type'];
  role?: WorkerConfig['role'];
  priority: number;
  maxRunning: number;
  commandConfigured: boolean;
  healthy: boolean;
  status: WorkerRuntimeStatus['status'];
  decision: WorkerSelectionDecision;
  selectionScore: number;
  leaderboardScore: number;
  tasks: number;
  successRate: number;
  timeoutRate: number;
  errorRate: number;
  evidenceContributed: number;
  findingsInfluenced: number;
  currentRunTasks: number;
  currentRunEvidenceContributed: number;
  currentRunFindingsInfluenced: number;
  estimatedUsd: number;
  reasons: string[];
  blockers: string[];
}

export interface WorkerSelectionPolicyReport {
  runId: string;
  generatedAt: string;
  mode: 'dispatcher_worker_selection_preview';
  task: WorkerSelectionTask;
  intent?: {
    id: string;
    status: Intent['status'];
    riskLevel: Intent['riskLevel'];
    role?: Intent['role'];
    hypothesis: string;
  };
  selectedWorker?: WorkerSelectionCandidate;
  candidates: WorkerSelectionCandidate[];
  counts: {
    configuredWorkers: number;
    healthyWorkers: number;
    eligibleWorkers: number;
    blockedWorkers: number;
    evidenceProducingWorkers: number;
  };
  summary: string;
  nextActions: string[];
  policy: {
    signals: string[];
    safetyNotes: string[];
  };
}

export class WorkerSelectionPolicyService {
  constructor(private readonly store: PlatformStore) {}

  async preview(runId: string): Promise<WorkerSelectionPolicyReport> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const facts = Object.values(this.store.state.facts).filter((item) => item.runId === runId);
    const intents = Object.values(this.store.state.intents).filter((item) => item.runId === runId);
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId);
    const spans = Object.values(this.store.state.traceSpans).filter((item) => item.runId === runId);
    const costs = Object.values(this.store.state.costLedger).filter((item) => item.runId === runId);
    const task = inferTask(facts, intents);
    const intent = task === 'explore' ? claimableIntent(intents) : undefined;
    const runtimeStatuses = await workerStatuses(run);
    const leaderboard = new WorkerLeaderboardService(this.store).get();
    const leaderboardByWorker = new Map(leaderboard.workers.map((worker) => [worker.worker, worker]));
    const candidates = run.workerPool
      .map((config, index) =>
        buildCandidate({
          run,
          config,
          index,
          task,
          intent,
          runtime: runtimeStatuses.get(config.name),
          leaderboard: leaderboardByWorker.get(config.name),
          facts,
          findings,
          spans,
          costs,
        }),
      )
      .sort(candidateSort);
    const selectedWorker = candidates.find((candidate) => candidate.decision !== 'blocked' && candidate.decision !== 'deprioritize');
    if (selectedWorker) {
      selectedWorker.decision = 'recommended';
    }
    const counts = {
      configuredWorkers: candidates.filter((candidate) => candidate.commandConfigured).length,
      healthyWorkers: candidates.filter((candidate) => candidate.healthy).length,
      eligibleWorkers: candidates.filter((candidate) => candidate.decision !== 'blocked' && candidate.decision !== 'deprioritize').length,
      blockedWorkers: candidates.filter((candidate) => candidate.decision === 'blocked').length,
      evidenceProducingWorkers: candidates.filter((candidate) => candidate.evidenceContributed > 0 || candidate.currentRunEvidenceContributed > 0).length,
    };
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'dispatcher_worker_selection_preview',
      task,
      intent: intent
        ? {
            id: intent.id,
            status: intent.status,
            riskLevel: intent.riskLevel,
            role: intent.role,
            hypothesis: intent.hypothesis,
          }
        : undefined,
      selectedWorker,
      candidates,
      counts,
      summary: summaryFor(task, selectedWorker, counts),
      nextActions: nextActions(task, selectedWorker, candidates, intent),
      policy: {
        signals: [
          'Healthy runtime and configured command are required before a Worker can be recommended.',
          'Run priority, current-run success, cross-run leaderboard score, timeout rate, evidence contribution, and finding influence shape the rank.',
          'Explore tasks prefer Workers with evidence-producing history; bootstrap and reason tasks can warm up unexercised Workers.',
          'When intent.role matches worker.role (scout|exploit|credential), the worker receives a +20 score boost for specialization.',
          'Generalist workers or workers without a role assignment can handle any intent without penalty.',
          'Specialized workers (non-generalist) receive a -8 penalty when handling intents outside their role.',
          'This view recommends scheduling order only; Dispatcher, Tool Gateway, ScopePolicy, approvals, and evidence validation remain authoritative.',
        ],
        safetyNotes: [
          'Read-only preview: no Worker execution, no intent claim, no graph write, no approval decision, and no tool invocation.',
          'Workers cannot submit or override their own selection score.',
          'R3/R4 tool requests still stop at approval or deny gates even when a Worker is recommended.',
          'Role-based matching is a scheduling hint; all workers still operate under the same security boundaries.',
        ],
      },
    };
  }
}

async function workerStatuses(run: Run): Promise<Map<string, WorkerRuntimeStatus>> {
  const result = new Map<string, WorkerRuntimeStatus>();
  for (const config of run.workerPool) {
    const commandConfigured = config.type === 'mock' || Boolean(config.command);
    try {
      const healthy = await createWorker(config).healthcheck();
      result.set(config.name, {
        name: config.name,
        type: config.type,
        maxRunning: config.maxRunning,
        priority: config.priority,
        commandConfigured,
        healthy,
        status: healthy ? 'healthy' : 'unhealthy',
        reason: healthy ? undefined : commandConfigured ? 'healthcheck failed' : 'command is not configured',
        checkedAt: nowIso(),
      });
    } catch (error) {
      result.set(config.name, {
        name: config.name,
        type: config.type,
        maxRunning: config.maxRunning,
        priority: config.priority,
        commandConfigured,
        healthy: false,
        status: 'unhealthy',
        reason: error instanceof Error ? error.message : String(error),
        checkedAt: nowIso(),
      });
    }
  }
  return result;
}

function buildCandidate(input: {
  run: Run;
  config: WorkerConfig;
  index: number;
  task: WorkerSelectionTask;
  intent?: Intent;
  runtime?: WorkerRuntimeStatus;
  leaderboard?: WorkerLeaderboardCard;
  facts: Fact[];
  findings: Finding[];
  spans: TraceSpan[];
  costs: CostLedgerEntry[];
}): WorkerSelectionCandidate {
  const commandConfigured = input.runtime?.commandConfigured ?? (input.config.type === 'mock' || Boolean(input.config.command));
  const healthy = input.runtime?.healthy ?? false;
  const blockers = [
    ...(input.run.status !== 'active' ? ['Run is not active.'] : []),
    ...(!commandConfigured ? ['Worker command is not configured.'] : []),
    ...(commandConfigured && !healthy ? [input.runtime?.reason ?? 'Worker healthcheck failed.'] : []),
    ...(input.task === 'explore' && !input.intent ? ['No claimable intent is available.'] : []),
  ];
  const runStats = currentRunStats(input.config.name, input.facts, input.findings, input.spans, input.costs);
  const global = input.leaderboard;
  const tasks = global?.tasks ?? 0;
  const successRate = global?.successRate ?? 0;
  const timeoutRate = global?.timeoutRate ?? 0;
  const errorRate = global?.errorRate ?? 0;
  const evidenceContributed = global?.evidenceContributed ?? 0;
  const findingsInfluenced = global?.findingsInfluenced ?? 0;
  const reasons: string[] = [];
  let score = 0;
  if (blockers.length === 0) {
    const priorityScore = Math.max(0, 24 - input.config.priority * 4);
    score += priorityScore;
    reasons.push(`priority score ${priorityScore}`);
    if (tasks > 0) {
      const reliabilityScore = Math.round(successRate * 0.24 - timeoutRate * 0.18 - errorRate * 0.16);
      score += reliabilityScore;
      reasons.push(`history success ${successRate}%`);
    } else {
      const warmupScore = input.task === 'bootstrap' ? 14 : input.task === 'reason' ? 10 : 4;
      score += warmupScore;
      reasons.push('no runtime history yet');
    }
    const evidenceScore = Math.min(22, evidenceContributed * 5 + runStats.evidenceContributed * 3);
    const findingScore = Math.min(18, findingsInfluenced * 9 + runStats.findingsInfluenced * 5);
    score += evidenceScore + findingScore;
    if (evidenceScore > 0) {
      reasons.push(`evidence contribution ${evidenceContributed} global / ${runStats.evidenceContributed} current`);
    }
    if (findingScore > 0) {
      reasons.push(`finding influence ${findingsInfluenced} global / ${runStats.findingsInfluenced} current`);
    }
    score += Math.min(12, runStats.ok * 4);
    if (runStats.timeouts > 0) {
      score -= runStats.timeouts * 12;
      reasons.push(`${runStats.timeouts} current-run timeout(s)`);
    }
    if (runStats.errors > 0) {
      score -= runStats.errors * 10;
      reasons.push(`${runStats.errors} current-run error(s)`);
    }
    if (input.task === 'explore') {
      score += evidenceContributed > 0 || runStats.evidenceContributed > 0 ? 10 : -4;
      if (input.intent?.riskLevel === 'R3' && evidenceContributed + runStats.evidenceContributed === 0) {
        score -= 8;
        reasons.push('R3 intent prefers evidence-proven Worker');
      }
      if (input.intent?.riskLevel === 'R4') {
        reasons.push('R4 tool requests remain denied by Tool Gateway policy');
      }
      // Role-based matching: boost score when worker role matches intent role
      if (input.intent?.role && input.config.role) {
        if (input.intent.role === input.config.role) {
          score += 20;
          reasons.push(`role match: ${input.config.role} worker for ${input.intent.role} intent`);
        } else if (input.config.role !== 'generalist') {
          score -= 8;
          reasons.push(`role mismatch: ${input.config.role} worker for ${input.intent.role} intent`);
        }
      } else if (input.config.role === 'generalist' || !input.config.role) {
        // Generalist workers or workers without role can handle any intent
        if (input.intent?.role) {
          reasons.push(`generalist handling ${input.intent.role} intent`);
        }
      }
    }
    if (input.task === 'reason' && evidenceContributed === 0 && findingsInfluenced === 0 && tasks > 0) {
      score += 6;
      reasons.push('suited for reasoning, needs evidence-producing follow-up');
    }
    if (input.config.maxRunning > 1) {
      score += Math.min(4, input.config.maxRunning - 1);
      reasons.push(`parallel capacity ${input.config.maxRunning}`);
    }
  }
  const decision = decisionFor({ blockers, tasks, timeoutRate, errorRate, score, evidenceContributed, findingsInfluenced });
  return {
    worker: input.config.name,
    type: input.config.type,
    role: input.config.role,
    priority: input.config.priority,
    maxRunning: input.config.maxRunning,
    commandConfigured,
    healthy,
    status: healthy ? 'healthy' : 'unhealthy',
    decision,
    selectionScore: clamp(score),
    leaderboardScore: global?.score ?? 0,
    tasks,
    successRate,
    timeoutRate,
    errorRate,
    evidenceContributed,
    findingsInfluenced,
    currentRunTasks: runStats.tasks,
    currentRunEvidenceContributed: runStats.evidenceContributed,
    currentRunFindingsInfluenced: runStats.findingsInfluenced,
    estimatedUsd: roundMoney(global?.estimatedUsd ?? runStats.estimatedUsd),
    reasons: reasons.length > 0 ? reasons : ['Worker is blocked before ranking.'],
    blockers,
  };
}

function currentRunStats(
  worker: string,
  facts: Fact[],
  findings: Finding[],
  spans: TraceSpan[],
  costs: CostLedgerEntry[],
): {
  tasks: number;
  ok: number;
  errors: number;
  timeouts: number;
  evidenceContributed: number;
  findingsInfluenced: number;
  estimatedUsd: number;
} {
  const workerSpans = spans.filter((span) => span.kind === 'worker' && workerName(span) === worker);
  const workerFacts = facts.filter((fact) => fact.createdBy.startsWith(`${worker}:`));
  const evidenceIds = new Set(workerFacts.flatMap((fact) => fact.evidenceIds));
  return {
    tasks: workerSpans.length,
    ok: workerSpans.filter((span) => span.status === 'ok').length,
    errors: workerSpans.filter((span) => span.status === 'error').length,
    timeouts: workerSpans.filter((span) => span.status === 'timeout').length,
    evidenceContributed: evidenceIds.size,
    findingsInfluenced: findings.filter((finding) => finding.evidenceIds.some((id) => evidenceIds.has(id))).length,
    estimatedUsd: costs.filter((cost) => cost.worker === worker).reduce((total, cost) => total + cost.estimatedUsd, 0),
  };
}

function decisionFor(input: {
  blockers: string[];
  tasks: number;
  timeoutRate: number;
  errorRate: number;
  score: number;
  evidenceContributed: number;
  findingsInfluenced: number;
}): WorkerSelectionDecision {
  if (input.blockers.length > 0) return 'blocked';
  if (input.timeoutRate >= 30 || input.errorRate >= 30 || input.score < 22) return 'deprioritize';
  if (input.tasks === 0) return 'warm_up';
  if (input.evidenceContributed > 0 || input.findingsInfluenced > 0 || input.score >= 58) return 'eligible';
  return 'eligible';
}

function inferTask(facts: Fact[], intents: Intent[]): WorkerSelectionTask {
  const nonSystemFacts = facts.filter((fact) => !fact.createdBy.startsWith('system.'));
  if (nonSystemFacts.length === 0 && intents.length === 0) {
    return 'bootstrap';
  }
  return claimableIntent(intents) ? 'explore' : 'reason';
}

function claimableIntent(intents: Intent[]): Intent | undefined {
  return intents.find((intent) => intent.status === 'open' || intent.status === 'released');
}

function candidateSort(left: WorkerSelectionCandidate, right: WorkerSelectionCandidate): number {
  const leftBlocked = left.decision === 'blocked' ? 1 : 0;
  const rightBlocked = right.decision === 'blocked' ? 1 : 0;
  if (leftBlocked !== rightBlocked) return leftBlocked - rightBlocked;
  const leftDeprioritized = left.decision === 'deprioritize' ? 1 : 0;
  const rightDeprioritized = right.decision === 'deprioritize' ? 1 : 0;
  if (leftDeprioritized !== rightDeprioritized) return leftDeprioritized - rightDeprioritized;
  return right.selectionScore - left.selectionScore || left.priority - right.priority || left.worker.localeCompare(right.worker);
}

function summaryFor(
  task: WorkerSelectionTask,
  selected: WorkerSelectionCandidate | undefined,
  counts: WorkerSelectionPolicyReport['counts'],
): string {
  if (!selected) {
    return `No eligible Worker is currently available for ${task}; ${counts.blockedWorkers} Worker(s) are blocked.`;
  }
  return `Recommend ${selected.worker} for ${task}; ${counts.eligibleWorkers}/${counts.configuredWorkers} configured Worker(s) are eligible and ${counts.evidenceProducingWorkers} have evidence-producing history.`;
}

function nextActions(
  task: WorkerSelectionTask,
  selected: WorkerSelectionCandidate | undefined,
  candidates: WorkerSelectionCandidate[],
  intent?: Intent,
): string[] {
  const actions: string[] = [];
  if (selected?.decision === 'recommended') {
    actions.push(`Use ${selected.worker} as the next ${task} Worker unless the operator wants a manual override.`);
  }
  if (task === 'explore' && intent) {
    actions.push(`Review the selected Worker against intent ${intent.id} (${intent.riskLevel}) before dispatching.`);
  }
  if (candidates.some((candidate) => candidate.decision === 'warm_up')) {
    actions.push('Warm up unexercised Workers with low-risk bootstrap/reason tasks before trusting them on higher-risk explore work.');
  }
  if (candidates.some((candidate) => candidate.decision === 'blocked')) {
    actions.push('Fix blocked Worker runtime configuration before expanding the pool.');
  }
  if (candidates.some((candidate) => candidate.decision === 'deprioritize')) {
    actions.push('Investigate Workers with timeout/error or low-score signals before assigning important intents.');
  }
  return actions.length > 0 ? actions : ['Worker pool is usable; continue Dispatcher-owned exploration.'];
}

function workerName(span: TraceSpan): string {
  return typeof span.attributes.worker === 'string' ? span.attributes.worker : span.name.split('.')[0] || 'unknown';
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}
