import { nowIso } from '../domain/ids.js';
import type { Intent, ToolInvocation, TraceSpan } from '../domain/types.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { PlatformStore } from '../storage/store.js';

export type RunSupervisorPosture = 'healthy' | 'watch' | 'needs_operator' | 'stuck';
export type RunSupervisorSignalSeverity = 'info' | 'warn' | 'critical';
export type RunSupervisorActionKind =
  | 'release_expired_leases'
  | 'review_approvals'
  | 'review_blocked_tools'
  | 'deprioritize_worker'
  | 'collect_evidence'
  | 'advance_search_plan'
  | 'operator_review';

export interface RunSupervisorSignal {
  id: string;
  severity: RunSupervisorSignalSeverity;
  title: string;
  detail: string;
  observed: number;
  entityIds: string[];
}

export interface RunSupervisorAction {
  kind: RunSupervisorActionKind;
  label: string;
  endpoint?: string;
  reason: string;
  blockedBy: string[];
  safeToAutomate: boolean;
}

export interface RunSupervisorReport {
  runId: string;
  generatedAt: string;
  mode: 'run_supervisor';
  posture: RunSupervisorPosture;
  summary: string;
  counts: {
    openIntents: number;
    releasedIntents: number;
    claimedIntents: number;
    expiredClaimedIntents: number;
    pendingApprovals: number;
    blockedToolCalls: number;
    repeatedBlockedTools: number;
    workerTimeouts: number;
    workerErrors: number;
    evidence: number;
    findings: number;
  };
  signals: RunSupervisorSignal[];
  actions: RunSupervisorAction[];
  stuckWorkers: Array<{
    worker: string;
    timeouts: number;
    errors: number;
    lastStatus: TraceSpan['status'];
    recommendation: string;
  }>;
  audit: {
    readOnly: true;
    dispatchesWorkers: false;
    invokesTools: false;
    approvesActions: false;
    mutatesGraph: false;
    releasesExpiredLeases: false;
  };
}

export interface RunSupervisorTick {
  runId: string;
  generatedAt: string;
  mode: 'run_supervisor_tick';
  releasedExpiredIntents: Array<{
    id: string;
    hypothesis: string;
    claimedBy?: string;
    releaseReason?: string;
  }>;
  before: Pick<RunSupervisorReport, 'posture' | 'counts'>;
  after: Pick<RunSupervisorReport, 'posture' | 'counts'>;
  actions: RunSupervisorAction[];
  audit: {
    dispatchesWorkers: false;
    invokesTools: false;
    approvesActions: false;
    releasesExpiredLeases: true;
  };
}

export class RunSupervisorService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
  ) {}

  get(runId: string, now: Date = new Date()): RunSupervisorReport {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const intents = Object.values(this.store.state.intents).filter((item) => item.runId === runId);
    const approvals = Object.values(this.store.state.approvals).filter((item) => item.runId === runId);
    const tools = Object.values(this.store.state.toolInvocations).filter((item) => item.runId === runId);
    const spans = Object.values(this.store.state.traceSpans).filter((item) => item.runId === runId);
    const evidence = Object.values(this.store.state.evidence).filter((item) => item.runId === runId && item.kind !== 'replay_bundle');
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId && item.validationState !== 'rejected');
    const expiredClaimed = expiredClaimedIntents(intents, now);
    const pendingApprovals = approvals.filter((item) => item.status === 'pending');
    const blockedTools = tools.filter((item) => item.status === 'blocked');
    const repeatedBlocked = repeatedBlockedToolGroups(blockedTools);
    const workerSpans = spans.filter((item) => item.kind === 'worker');
    const workerTimeouts = workerSpans.filter((item) => item.status === 'timeout');
    const workerErrors = workerSpans.filter((item) => item.status === 'error');
    const counts = {
      openIntents: intents.filter((item) => item.status === 'open').length,
      releasedIntents: intents.filter((item) => item.status === 'released').length,
      claimedIntents: intents.filter((item) => item.status === 'claimed').length,
      expiredClaimedIntents: expiredClaimed.length,
      pendingApprovals: pendingApprovals.length,
      blockedToolCalls: blockedTools.length,
      repeatedBlockedTools: repeatedBlocked.reduce((total, item) => total + item.items.length, 0),
      workerTimeouts: workerTimeouts.length,
      workerErrors: workerErrors.length,
      evidence: evidence.length,
      findings: findings.length,
    };
    const stuckWorkers = workerHealth(workerSpans);
    const signals = supervisorSignals({
      counts,
      expiredClaimed,
      pendingApprovals,
      blockedTools,
      repeatedBlocked,
      stuckWorkers,
    });
    const posture = supervisorPosture(counts, signals);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'run_supervisor',
      posture,
      summary:
        `${counts.expiredClaimedIntents} expired lease(s), ${counts.pendingApprovals} pending approval(s), ` +
        `${counts.workerTimeouts} timeout(s), ${counts.workerErrors} worker error(s), ${counts.repeatedBlockedTools} repeated blocked tool call(s).`,
      counts,
      signals,
      actions: supervisorActions(counts, signals, stuckWorkers),
      stuckWorkers,
      audit: {
        readOnly: true,
        dispatchesWorkers: false,
        invokesTools: false,
        approvesActions: false,
        mutatesGraph: false,
        releasesExpiredLeases: false,
      },
    };
  }

  tick(runId: string, now: Date = new Date()): RunSupervisorTick {
    const before = this.get(runId, now);
    const released = this.graph.releaseExpiredIntents(runId, now);
    const after = this.get(runId, now);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'run_supervisor_tick',
      releasedExpiredIntents: released.map((intent) => ({
        id: intent.id,
        hypothesis: intent.hypothesis,
        claimedBy: intent.claimedBy,
        releaseReason: intent.releaseReason,
      })),
      before: { posture: before.posture, counts: before.counts },
      after: { posture: after.posture, counts: after.counts },
      actions: after.actions,
      audit: {
        dispatchesWorkers: false,
        invokesTools: false,
        approvesActions: false,
        releasesExpiredLeases: true,
      },
    };
  }
}

function expiredClaimedIntents(intents: Intent[], now: Date): Intent[] {
  return intents.filter(
    (item) => item.status === 'claimed' && item.leaseExpiresAt && Date.parse(item.leaseExpiresAt) < now.getTime(),
  );
}

function repeatedBlockedToolGroups(tools: ToolInvocation[]): Array<{ key: string; items: ToolInvocation[] }> {
  const groups = new Map<string, ToolInvocation[]>();
  for (const tool of tools) {
    const template = typeof tool.args.template === 'string' ? tool.args.template : '';
    const reason = (tool.reason ?? '').replace(/\s+/g, ' ').slice(0, 120);
    const key = [tool.tool, template, reason].filter(Boolean).join(':');
    groups.set(key, [...(groups.get(key) ?? []), tool]);
  }
  return [...groups.entries()]
    .map(([key, items]) => ({ key, items }))
    .filter((item) => item.items.length >= 2);
}

function workerHealth(spans: TraceSpan[]): RunSupervisorReport['stuckWorkers'] {
  const groups = new Map<string, TraceSpan[]>();
  for (const span of spans) {
    const worker = typeof span.attributes.worker === 'string' ? span.attributes.worker : span.name.split('.')[0] || 'unknown';
    groups.set(worker, [...(groups.get(worker) ?? []), span]);
  }
  return [...groups.entries()]
    .map(([worker, items]) => {
      const sorted = [...items].sort((left, right) => right.endedAt.localeCompare(left.endedAt));
      const timeouts = items.filter((item) => item.status === 'timeout').length;
      const errors = items.filter((item) => item.status === 'error').length;
      return {
        worker,
        timeouts,
        errors,
        lastStatus: sorted[0]?.status ?? 'ok',
        recommendation:
          timeouts + errors >= 2
            ? 'Deprioritize until command/runtime health is investigated.'
            : timeouts > 0 || errors > 0
              ? 'Watch before assigning high-impact intents.'
              : 'Worker health is acceptable.',
      };
    })
    .filter((item) => item.timeouts > 0 || item.errors > 0)
    .sort((left, right) => right.timeouts + right.errors - (left.timeouts + left.errors));
}

function supervisorSignals(input: {
  counts: RunSupervisorReport['counts'];
  expiredClaimed: Intent[];
  pendingApprovals: Array<{ id: string }>;
  blockedTools: ToolInvocation[];
  repeatedBlocked: Array<{ key: string; items: ToolInvocation[] }>;
  stuckWorkers: RunSupervisorReport['stuckWorkers'];
}): RunSupervisorSignal[] {
  const signals: RunSupervisorSignal[] = [];
  if (input.expiredClaimed.length > 0) {
    signals.push(signal('expired_leases', 'critical', 'Expired Worker leases', `${input.expiredClaimed.length} claimed intent lease(s) are expired.`, input.expiredClaimed.length, input.expiredClaimed.map((item) => item.id)));
  }
  if (input.pendingApprovals.length > 0) {
    signals.push(signal('pending_approvals', 'warn', 'Pending approvals block progress', `${input.pendingApprovals.length} approval request(s) need operator decision.`, input.pendingApprovals.length, input.pendingApprovals.map((item) => item.id)));
  }
  if (input.repeatedBlocked.length > 0) {
    signals.push(signal('repeated_blocked_tools', 'warn', 'Repeated blocked tool loop', `${input.repeatedBlocked.length} repeated blocked tool pattern(s) detected.`, input.counts.repeatedBlockedTools, input.repeatedBlocked.flatMap((item) => item.items.map((tool) => tool.id))));
  }
  if (input.counts.workerTimeouts > 0 || input.counts.workerErrors > 0) {
    signals.push(signal('worker_failures', input.counts.workerTimeouts + input.counts.workerErrors >= 2 ? 'critical' : 'warn', 'Worker timeout or error loop', `${input.counts.workerTimeouts} timeout(s), ${input.counts.workerErrors} error(s).`, input.counts.workerTimeouts + input.counts.workerErrors, input.stuckWorkers.map((item) => item.worker)));
  }
  if (input.counts.evidence === 0 && input.counts.openIntents + input.counts.releasedIntents === 0) {
    signals.push(signal('no_evidence_no_queue', 'warn', 'No evidence and no queued work', 'The run has not produced evidence and has no queued intent to recover progress.', 1, []));
  }
  if (signals.length === 0) {
    signals.push(signal('healthy', 'info', 'No stuck-loop signal', 'No expired leases, repeated blocked tools, pending approvals, or worker failure loop detected.', 0, []));
  }
  return signals;
}

function signal(
  id: string,
  severity: RunSupervisorSignalSeverity,
  title: string,
  detail: string,
  observed: number,
  entityIds: string[],
): RunSupervisorSignal {
  return { id, severity, title, detail, observed, entityIds };
}

function supervisorPosture(
  counts: RunSupervisorReport['counts'],
  signals: RunSupervisorSignal[],
): RunSupervisorPosture {
  if (signals.some((item) => item.severity === 'critical')) return 'stuck';
  if (counts.pendingApprovals > 0) return 'needs_operator';
  if (signals.some((item) => item.severity === 'warn')) return 'watch';
  return 'healthy';
}

function supervisorActions(
  counts: RunSupervisorReport['counts'],
  signals: RunSupervisorSignal[],
  stuckWorkers: RunSupervisorReport['stuckWorkers'],
): RunSupervisorAction[] {
  const actions: RunSupervisorAction[] = [];
  if (counts.expiredClaimedIntents > 0) {
    actions.push(action('release_expired_leases', 'Release expired Worker leases', '/runs/{id}/supervisor/tick', 'Expired leases prevent queued work from being reclaimed.', [], true));
  }
  if (counts.pendingApprovals > 0) {
    actions.push(action('review_approvals', 'Review pending approvals', '/runs/{id}/approvals', 'Higher-risk work is paused until approvals are decided.', [], false));
  }
  if (counts.repeatedBlockedTools > 0) {
    actions.push(action('review_blocked_tools', 'Review repeated blocked tool calls', '/runs/{id}/tool-invocations', 'Repeated blocks usually mean scope, runtime profile, template, or approval mismatch.', [], false));
  }
  for (const worker of stuckWorkers.slice(0, 3)) {
    actions.push(action('deprioritize_worker', `Deprioritize ${worker.worker}`, '/runs/{id}/worker-selection', worker.recommendation, [worker.worker], false));
  }
  if (counts.evidence === 0) {
    actions.push(action('collect_evidence', 'Collect low-risk baseline evidence', '/runs/{id}/search-plan/advance', 'A run without evidence should recover through a low-risk Search Plan item.', [], false));
  }
  if (counts.openIntents + counts.releasedIntents > 0 && !signals.some((item) => item.id === 'expired_leases')) {
    actions.push(action('advance_search_plan', 'Advance the next queued intent', '/runs/{id}/search-plan/advance', 'Queued or released work is available and no expired lease blocks it.', [], false));
  }
  return actions.length > 0
    ? uniqueActions(actions)
    : [action('operator_review', 'Continue monitored execution', '/runs/{id}/mission-control', 'No stuck-loop recovery action is currently required.', [], false)];
}

function action(
  kind: RunSupervisorActionKind,
  label: string,
  endpoint: string | undefined,
  reason: string,
  blockedBy: string[],
  safeToAutomate: boolean,
): RunSupervisorAction {
  return { kind, label, endpoint, reason, blockedBy, safeToAutomate };
}

function uniqueActions(actions: RunSupervisorAction[]): RunSupervisorAction[] {
  const seen = new Set<string>();
  return actions.filter((item) => {
    const key = `${item.kind}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
