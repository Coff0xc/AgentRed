import { nowIso } from '../domain/ids.js';
import type { RunEvent, TraceSpan } from '../domain/types.js';
import type { LocalRunnerWorkbenchService } from '../desktop/local-runner-workbench-service.js';
import type { LocalExecutionNodeService } from '../execution/local-execution-node-service.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { PlatformStore } from '../storage/store.js';

export type RuntimeOperationsPosture = 'ready' | 'usable' | 'partial' | 'blocked';
export type RuntimeOperationsLaneStatus = 'ready' | 'active' | 'partial' | 'planned' | 'blocked';
export type RuntimeEventKind =
  | 'run_event'
  | 'thinking_delta'
  | 'text_delta'
  | 'tool_call'
  | 'tool_result'
  | 'worker_task'
  | 'subagent_task'
  | 'sandbox_event'
  | 'evidence_event'
  | 'approval_event'
  | 'trace_span';

export interface RuntimeOperationsLane {
  id: string;
  title: string;
  status: RuntimeOperationsLaneStatus;
  summary: string;
  signals: string[];
  gaps: string[];
  nextActions: string[];
}

export interface RuntimeEventContract {
  kind: RuntimeEventKind;
  status: 'implemented' | 'mapped' | 'planned' | 'deliberately_avoided';
  source: string;
  payloadShape: string[];
  frontendUse: string;
  safetyBoundary: string;
}

export interface NormalizedRuntimeEvent {
  id: string;
  kind: RuntimeEventKind;
  title: string;
  detail?: string;
  level: 'info' | 'warning' | 'error';
  entityId?: string;
  createdAt: string;
  source: string;
}

export interface RuntimeOperationsWorkbenchReport {
  runId: string;
  generatedAt: string;
  mode: 'runtime_operations_workbench';
  posture: RuntimeOperationsPosture;
  summary: string;
  counts: {
    runEvents: number;
    normalizedEvents: number;
    traceSpans: number;
    workerSpans: number;
    toolSpans: number;
    activeIntents: number;
    releasedIntents: number;
    openIntents: number;
    pendingApprovals: number;
    activeBrowserSessions: number;
    activeProxySessions: number;
    activeOastSessions: number;
    captureProfiles: number;
    runnableTemplates: number;
    healthyWorkers: number;
    evidence: number;
    reviewableEvidence: number;
  };
  lanes: RuntimeOperationsLane[];
  eventContract: RuntimeEventContract[];
  normalizedEvents: NormalizedRuntimeEvent[];
  operatorNextActions: string[];
  referenceAlignment: string[];
  safetyNotes: string[];
  audit: {
    readOnly: true;
    opensStreams: false;
    dispatchesWorkers: false;
    startsSandbox: false;
    runsCommands: false;
    mutatesSessionState: false;
    readsRawEvidence: false;
  };
}

export class RuntimeOperationsWorkbenchService {
  constructor(
    private readonly store: PlatformStore,
    private readonly events: RunEventService,
    private readonly executionNode: LocalExecutionNodeService,
    private readonly localRunnerWorkbench: LocalRunnerWorkbenchService,
  ) {}

  async get(runId: string, baseUrl: string): Promise<RuntimeOperationsWorkbenchReport> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const [executionNode, localRunner] = await Promise.all([
      this.executionNode.get(runId),
      Promise.resolve(this.localRunnerWorkbench.get(runId, baseUrl)),
    ]);
    const progress = this.events.progress(runId);
    const runEvents = this.events.list(runId);
    const traceSpans = byRun(Object.values(this.store.state.traceSpans), runId);
    const evidence = byRun(Object.values(this.store.state.evidence), runId).filter((item) => item.kind !== 'replay_bundle');
    const reviews = byRun(Object.values(this.store.state.evidenceReviews), runId);
    const approvals = byRun(Object.values(this.store.state.approvals), runId);
    const normalizedEvents = normalizeEvents(runEvents, traceSpans);
    const counts = {
      runEvents: runEvents.length,
      normalizedEvents: normalizedEvents.length,
      traceSpans: traceSpans.length,
      workerSpans: traceSpans.filter((span) => span.kind === 'worker').length,
      toolSpans: traceSpans.filter((span) => span.kind === 'tool').length,
      activeIntents: progress.counts.intents.claimed,
      releasedIntents: progress.counts.intents.released,
      openIntents: progress.counts.intents.open,
      pendingApprovals: progress.counts.approvals.pending,
      activeBrowserSessions: executionNode.counts.activeBrowserSessions,
      activeProxySessions: executionNode.counts.activeProxySessions,
      activeOastSessions: executionNode.counts.activeOastSessions,
      captureProfiles: localRunner.captureProfiles.length,
      runnableTemplates: executionNode.counts.runnableScannerTemplates,
      healthyWorkers: executionNode.counts.healthyWorkers,
      evidence: evidence.length,
      reviewableEvidence: reviews.length,
    };
    const lanes = runtimeLanes(counts, executionNode.status, localRunner.status);
    const posture = runtimePosture(lanes, counts);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'runtime_operations_workbench',
      posture,
      summary:
        `${counts.normalizedEvents} normalized runtime event(s), ${counts.traceSpans} trace span(s), ` +
        `${counts.healthyWorkers} healthy Worker(s), ${counts.activeBrowserSessions + counts.activeProxySessions + counts.activeOastSessions} active local session(s).`,
      counts,
      lanes,
      eventContract: eventContract(),
      normalizedEvents: normalizedEvents.slice(-24),
      operatorNextActions: operatorNextActions(lanes, counts),
      referenceAlignment: [
        'Z3r0: adopts the stable event-contract idea, session/runtime visibility, sandbox binding checks, and operator-facing runtime surfaces.',
        'Cairn: keeps Dispatcher-owned graph mutation and simple Worker scheduling instead of a role-tree agent graph.',
        'AIDA/WonderSuite: local browser/proxy/OAST and future shell/file/noVNC surfaces are treated as operator workbench capabilities.',
        'CAI/Apex: trace spans, cost/eval surfaces, and Worker comparison remain the measurement layer for runtime quality.',
        'HexStrike/AutoRedTeam: sandbox/tool breadth must become governed templates, Tool Packs, connectors, or runtime profiles before execution.',
      ],
      safetyNotes: [
        'Runtime Operations Workbench is read-only and never opens live streams, dispatches Workers, starts sandboxes, executes commands, or reads raw evidence blobs.',
        'Z3r0-style subagent delegation is deliberately mapped to Dispatcher intents and future background jobs; Workers still do not chat with each other.',
        'Sandbox shell, file manager, and GUI/noVNC surfaces remain operator-controlled product capabilities, not Worker-granted permissions.',
        'Normalized events are presentation contracts over existing timeline, trace, tool, approval, and evidence state.',
      ],
      audit: {
        readOnly: true,
        opensStreams: false,
        dispatchesWorkers: false,
        startsSandbox: false,
        runsCommands: false,
        mutatesSessionState: false,
        readsRawEvidence: false,
      },
    };
  }
}

function runtimeLanes(
  counts: RuntimeOperationsWorkbenchReport['counts'],
  executionStatus: string,
  localRunnerStatus: string,
): RuntimeOperationsLane[] {
  return [
    lane({
      id: 'runtime.event_contract',
      title: 'Stable runtime event contract',
      status: counts.normalizedEvents > 0 ? 'active' : 'ready',
      summary: `${counts.runEvents} run event(s) and ${counts.traceSpans} trace span(s) can be projected into frontend-safe runtime events.`,
      signals: [`normalized=${counts.normalizedEvents}`, `traceSpans=${counts.traceSpans}`],
      gaps: counts.normalizedEvents === 0 ? ['No runtime events have been produced by this run yet.'] : [],
      nextActions: ['Use normalized events as the future WebSocket/SSE contract for live operator progress.'],
    }),
    lane({
      id: 'runtime.session_pool',
      title: 'Session lifecycle and resume',
      status: counts.activeIntents > 0 ? 'active' : counts.openIntents + counts.releasedIntents > 0 ? 'ready' : 'partial',
      summary: `${counts.activeIntents} active lease(s), ${counts.openIntents} open intent(s), ${counts.releasedIntents} released/resumable intent(s).`,
      signals: [`active=${counts.activeIntents}`, `open=${counts.openIntents}`, `released=${counts.releasedIntents}`],
      gaps: counts.openIntents + counts.releasedIntents + counts.activeIntents === 0 ? ['No resumable Worker intent exists yet.'] : [],
      nextActions: ['Keep Worker resume/timeout behavior tied to intent leases rather than role ownership.'],
    }),
    lane({
      id: 'runtime.interrupts',
      title: 'Interrupt and cancellation model',
      status: counts.pendingApprovals > 0 || counts.activeIntents > 0 ? 'active' : 'partial',
      summary: `${counts.pendingApprovals} approval pause(s); active Worker leases and approval gates are the current safe interrupt points.`,
      signals: [`pendingApprovals=${counts.pendingApprovals}`, `workerSpans=${counts.workerSpans}`],
      gaps: ['True streamed interrupt signals and cancellation endpoints are still planned product work.'],
      nextActions: ['Model streamed interruptions as safe points after tool calls finish, following Z3r0-style atomicity.'],
    }),
    lane({
      id: 'runtime.sandbox_binding',
      title: 'Sandbox and local surface binding',
      status: executionStatus === 'blocked' ? 'blocked' : counts.runnableTemplates > 0 || counts.activeBrowserSessions + counts.activeProxySessions + counts.activeOastSessions > 0 ? 'ready' : 'partial',
      summary: `Execution node=${executionStatus}, local runner=${localRunnerStatus}, runnable templates=${counts.runnableTemplates}.`,
      signals: [
        `browser=${counts.activeBrowserSessions}`,
        `proxy=${counts.activeProxySessions}`,
        `oast=${counts.activeOastSessions}`,
        `captureProfiles=${counts.captureProfiles}`,
      ],
      gaps: counts.runnableTemplates === 0 ? ['No external/container scanner template is runnable on this node.'] : [],
      nextActions: ['Bind shell/file/gui/browser surfaces through run-local scope, audit, evidence, and sandbox lifecycle gates.'],
    }),
    lane({
      id: 'runtime.delegation_jobs',
      title: 'Background job and delegation model',
      status: 'planned',
      summary: 'Z3r0-style persistent subagent jobs map to future background run jobs, not Worker-to-Worker chat.',
      signals: [`workerSpans=${counts.workerSpans}`, `toolSpans=${counts.toolSpans}`],
      gaps: ['No persistent background job table exists yet for long-running sandbox/tool tasks.'],
      nextActions: ['Represent future background work as Dispatcher-owned jobs with progress events, cancellation, and evidence outputs.'],
    }),
    lane({
      id: 'runtime.context_projection',
      title: 'Context projection and compaction',
      status: counts.evidence > 0 || counts.runEvents > 0 ? 'ready' : 'partial',
      summary: `${counts.evidence} evidence item(s), ${counts.reviewableEvidence} review record(s), and graph snapshots provide bounded Worker context.`,
      signals: [`evidence=${counts.evidence}`, `reviews=${counts.reviewableEvidence}`],
      gaps: ['Long-context compaction policy is visible in design but not yet a persisted runtime artifact.'],
      nextActions: ['Keep raw evidence out of Worker context; project only graph facts, evidence ids, reviews, and governed capability metadata.'],
    }),
    lane({
      id: 'runtime.operator_surfaces',
      title: 'Operator shell, files, and GUI',
      status: counts.activeProxySessions + counts.activeBrowserSessions > 0 ? 'partial' : 'planned',
      summary: 'The current local workbench has browser/proxy/OAST surfaces; shell, file manager, and noVNC-style GUI remain future desktop/runtime surfaces.',
      signals: [`captureProfiles=${counts.captureProfiles}`, `healthyWorkers=${counts.healthyWorkers}`],
      gaps: ['Interactive shell, file manager, and GUI/noVNC controls are not implemented in this TypeScript kernel yet.'],
      nextActions: ['Add these as operator-only sandbox surfaces, never as raw Worker permissions.'],
    }),
  ];
}

function lane(input: RuntimeOperationsLane): RuntimeOperationsLane {
  return input;
}

function runtimePosture(lanes: RuntimeOperationsLane[], counts: RuntimeOperationsWorkbenchReport['counts']): RuntimeOperationsPosture {
  if (lanes.some((item) => item.status === 'blocked')) return 'blocked';
  if (counts.normalizedEvents > 0 && counts.healthyWorkers > 0 && counts.runnableTemplates > 0) return 'ready';
  if (counts.normalizedEvents > 0 && counts.healthyWorkers > 0) return 'usable';
  return 'partial';
}

function eventContract(): RuntimeEventContract[] {
  return [
    contract('run_event', 'implemented', 'RunEventService', ['id', 'type', 'title', 'detail', 'level', 'entityId', 'createdAt'], 'Timeline, Mission Control, runtime activity feed', 'Event detail is redacted before persistence.'),
    contract('trace_span', 'implemented', 'ObservabilityService', ['id', 'kind', 'name', 'status', 'durationMs', 'entityId'], 'Trace, cost, eval, Worker/tool scorecards', 'No raw prompts or raw evidence blobs are exposed.'),
    contract('tool_call', 'mapped', 'ToolInvocation', ['tool', 'target', 'riskLevel', 'status', 'approvalId', 'reason'], 'Tool audit and gated execution visibility', 'Targets and arguments are redacted; execution remains in Tool Gateway.'),
    contract('tool_result', 'mapped', 'Evidence metadata', ['evidenceId', 'kind', 'sha256', 'redactionState', 'toolCallId'], 'Evidence inbox and finding support chain', 'Blob content stays behind local evidence APIs.'),
    contract('worker_task', 'mapped', 'Dispatcher + TraceSpan', ['worker', 'task', 'status', 'durationMs', 'entityId'], 'Worker health, leaderboard, selection, and resume view', 'Worker output is accepted only through Dispatcher schema validation.'),
    contract('approval_event', 'mapped', 'ApprovalService', ['approvalId', 'tool', 'riskLevel', 'status'], 'Approval queue and interruption points', 'R3 pauses for a human; R4 remains blocked by default.'),
    contract('evidence_event', 'mapped', 'EvidenceEngine', ['evidenceId', 'kind', 'redactionState', 'sha256'], 'Evidence review and report gates', 'Raw-local-only evidence is not cloud safe.'),
    contract('thinking_delta', 'planned', 'Future streaming Worker adapter', ['worker', 'delta', 'turnId'], 'Live thought/progress display without exposing private prompts', 'Do not persist raw chain-of-thought; use safe summaries only.'),
    contract('text_delta', 'planned', 'Future streaming Worker adapter', ['worker', 'delta', 'turnId'], 'Live answer/report drafting display', 'Streamed content must still be redacted before persistence.'),
    contract('subagent_task', 'deliberately_avoided', 'Dispatcher intents / future background jobs', ['jobId', 'parentIntentId', 'status'], 'Long-running job progress without role-tree multi-agent protocol', 'No Worker-to-Worker messaging or autonomous role ownership.'),
    contract('sandbox_event', 'planned', 'Future sandbox manager', ['sandboxId', 'surface', 'status', 'runId'], 'Shell/file/noVNC/browser sandbox status', 'Operator-only; Workers see governed results, not raw sandbox handles.'),
  ];
}

function contract(
  kind: RuntimeEventKind,
  status: RuntimeEventContract['status'],
  source: string,
  payloadShape: string[],
  frontendUse: string,
  safetyBoundary: string,
): RuntimeEventContract {
  return { kind, status, source, payloadShape, frontendUse, safetyBoundary };
}

function normalizeEvents(runEvents: RunEvent[], traceSpans: TraceSpan[]): NormalizedRuntimeEvent[] {
  const timeline = runEvents.map((event) => ({
    id: `runtime_event_${event.id}`,
    kind: eventKind(event.type),
    title: event.title,
    detail: event.detail,
    level: event.level,
    entityId: event.entityId,
    createdAt: event.createdAt,
    source: event.type,
  }));
  const spans = traceSpans.map((span) => ({
    id: `runtime_span_${span.id}`,
    kind: 'trace_span' as const,
    title: `${span.kind}: ${span.name}`,
    detail: `${span.status} in ${span.durationMs}ms`,
    level: span.status === 'error' || span.status === 'blocked' ? ('error' as const) : span.status === 'approval_required' || span.status === 'timeout' ? ('warning' as const) : ('info' as const),
    entityId: span.entityId,
    createdAt: span.endedAt,
    source: 'trace_span',
  }));
  return [...timeline, ...spans].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function eventKind(type: string): RuntimeEventKind {
  if (type.startsWith('tool.')) return 'tool_call';
  if (type.startsWith('approval.')) return 'approval_event';
  if (type.startsWith('evidence.') || type.startsWith('capture.') || type.startsWith('browser.snapshot')) return 'evidence_event';
  if (type.startsWith('dispatch.') || type.startsWith('intent.')) return 'worker_task';
  if (type.startsWith('browser.') || type.startsWith('proxy.') || type.startsWith('oast.')) return 'sandbox_event';
  return 'run_event';
}

function operatorNextActions(lanes: RuntimeOperationsLane[], counts: RuntimeOperationsWorkbenchReport['counts']): string[] {
  const actions = lanes.flatMap((item) => item.status === 'ready' || item.status === 'active' ? [] : item.nextActions);
  if (counts.normalizedEvents === 0) actions.unshift('Create or advance a run to produce runtime events for the operator feed.');
  if (counts.healthyWorkers === 0) actions.unshift('Configure at least one healthy Worker runtime before relying on live task execution.');
  return [...new Set(actions)].slice(0, 8);
}

function byRun<T extends { runId: string }>(items: T[], runId: string): T[] {
  return items.filter((item) => item.runId === runId);
}
