import type { GraphServer } from '../graph/graph-server.js';
import type { ToolGateway, ToolInvokeResult } from '../tools/tool-gateway.js';
import { createWorker } from '../workers/factory.js';
import type { WorkerAdapter, WorkerTask, WorkerTaskResult, WorkerToolRequest } from '../workers/types.js';
import type { WorkerConfig } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { ObservabilityService } from '../observability/observability-service.js';
import type { DomainSkillService } from '../skills/domain-skill-service.js';
import type { CredentialReferenceService } from '../credentials/credential-reference-service.js';
import type { PocTemplateService } from '../poc/poc-template-service.js';
import type { ToolboxRunner } from '../tools/toolbox-runner.js';
import type { ConnectorRegistryService } from '../connectors/connector-registry-service.js';
import type { CheckpointService } from '../checkpoint/checkpoint-service.js';
import { buildWorkerProtocolEnvelope, type WorkerProtocolEnvelope } from '../workers/protocol.js';
import type { WorkerSelectionCandidate, WorkerSelectionPolicyReport, WorkerSelectionPolicyService } from '../scheduling/worker-selection-policy-service.js';

type AcceptedWorkerTaskResult = Extract<WorkerTaskResult, { accepted: true }>;
export type WorkerEnvelopePreviewTask = 'auto' | 'bootstrap' | 'reason' | 'explore';
export type WorkerSelectionSource = 'policy' | 'pool_order';

export type DispatchResult =
  | { status: 'dispatched'; task: 'bootstrap' | 'reason' | 'explore'; worker: string; selection?: DispatchWorkerSelection }
  | {
      status: 'blocked';
      task: 'explore';
      worker: string;
      reason: string;
      approvalId?: string;
      invocationId?: string;
      selection?: DispatchWorkerSelection;
    }
  | { status: 'skipped'; reason?: string }
  | { status: 'failed'; task: 'bootstrap' | 'reason' | 'explore'; worker: string; reason: string; selection?: DispatchWorkerSelection };

export interface DispatchWorkerSelection {
  source: WorkerSelectionSource;
  worker?: string;
  score?: number;
  decision?: WorkerSelectionCandidate['decision'];
  reason?: string;
}

export interface DispatcherOptions {
  workerFactory?: (config: WorkerConfig) => WorkerAdapter;
  intentLeaseMs?: number;
  workerTimeoutMs?: number;
  events?: RunEventService;
  observability?: ObservabilityService;
  tools?: ToolGateway;
  skills?: DomainSkillService;
  credentials?: CredentialReferenceService;
  pocs?: PocTemplateService;
  toolbox?: ToolboxRunner;
  connectors?: ConnectorRegistryService;
  checkpoints?: CheckpointService;
  workerSelection?: Pick<WorkerSelectionPolicyService, 'preview'>;
}

export interface WorkerEnvelopePreview {
  generatedAt: string;
  runId: string;
  requestedTask: WorkerEnvelopePreviewTask;
  task: WorkerTask['type'];
  selectedBy: 'auto' | 'operator';
  selectionSource: WorkerSelectionSource;
  selectedWorker?: {
    name: string;
    type: WorkerConfig['type'];
    priority: number;
    maxRunning: number;
    commandConfigured: boolean;
  };
  workerCandidates: Array<{
    name: string;
    type: WorkerConfig['type'];
    priority: number;
    maxRunning: number;
    commandConfigured: boolean;
  }>;
  intentId?: string;
  claimWouldOccur: boolean;
  graphCounts: {
    facts: number;
    intents: number;
    evidence: number;
    findings: number;
  };
  contextCounts: {
    domainSkills: number;
    credentialReferences: number;
    pocTemplates: number;
    toolboxBundles: number;
    connectors: number;
    toolSurface: number;
    strategyHints: number;
    strategyRecommendations: number;
  };
  safety: {
    rawSecretsIncluded: false;
    rawEvidenceContentIncluded: false;
    writesState: false;
    executesWorker: false;
  };
  envelope: WorkerProtocolEnvelope;
}

export class Dispatcher {
  private readonly workerFactory: (config: WorkerConfig) => WorkerAdapter;
  private readonly intentLeaseMs: number;
  private readonly workerTimeoutMs: number;
  private readonly events?: RunEventService;
  private readonly observability?: ObservabilityService;
  private readonly tools?: ToolGateway;
  private readonly skills?: DomainSkillService;
  private readonly credentials?: CredentialReferenceService;
  private readonly pocs?: PocTemplateService;
  private readonly toolbox?: ToolboxRunner;
  private readonly connectors?: ConnectorRegistryService;
  private readonly checkpoints?: CheckpointService;
  private readonly workerSelection?: Pick<WorkerSelectionPolicyService, 'preview'>;

  constructor(
    private readonly graph: GraphServer,
    options: DispatcherOptions = {},
  ) {
    this.workerFactory = options.workerFactory ?? createWorker;
    this.intentLeaseMs = options.intentLeaseMs ?? 5 * 60_000;
    this.workerTimeoutMs = options.workerTimeoutMs ?? 60_000;
    this.events = options.events;
    this.observability = options.observability;
    this.tools = options.tools;
    this.skills = options.skills;
    this.credentials = options.credentials;
    this.pocs = options.pocs;
    this.toolbox = options.toolbox;
    this.connectors = options.connectors;
    this.checkpoints = options.checkpoints;
    this.workerSelection = options.workerSelection;
  }

  async dispatchOnce(runId: string): Promise<DispatchResult> {
    const dispatchStartedMs = Date.now();
    this.graph.releaseExpiredIntents(runId);
    const snapshot = this.graph.getGraph(runId);
    this.record(runId, 'dispatch.started', 'Dispatch cycle started', 'Selecting the next Agent Worker task');
    if (snapshot.run.status !== 'active') {
      this.record(runId, 'dispatch.skipped', 'Dispatch skipped', 'Run is not active');
      return this.finishDispatch(runId, { status: 'skipped', reason: 'run is not active' }, dispatchStartedMs, {
        reason: 'run is not active',
      });
    }

    // Auto-checkpoint if configured and interval reached
    if (this.checkpoints?.shouldAutoCheckpoint(runId)) {
      try {
        await this.checkpoints.createCheckpoint(runId, 'auto_interval');
      } catch (error) {
        // Log but don't block dispatch on checkpoint failure
        this.record(runId, 'dispatch.started', 'Auto-checkpoint failed', error instanceof Error ? error.message : 'Unknown error', 'warning');
      }
    }

    const workerSelection = await this.selectWorker(runId, snapshot.run.workerPool);
    if (!workerSelection.worker) {
      this.record(runId, 'dispatch.skipped', 'Dispatch skipped', 'No healthy worker is available', 'warning');
      return this.finishDispatch(runId, { status: 'skipped', reason: 'no healthy worker' }, dispatchStartedMs, {
        reason: 'no healthy worker',
        workerSelectionSource: workerSelection.source,
        workerSelectionReason: workerSelection.reason,
      });
    }
    const worker = workerSelection.worker;
    if (workerSelection.source === 'policy' && workerSelection.candidate) {
      this.record(
        runId,
        'dispatch.started',
        'Worker selected by policy',
        `${workerSelection.candidate.worker} score=${workerSelection.candidate.selectionScore} decision=${workerSelection.candidate.decision}`,
      );
    }

    const nonSystemFacts = snapshot.facts.filter((fact) => !fact.createdBy.startsWith('system.'));
    const openIntent = snapshot.intents.find((intent) => intent.status === 'open' || intent.status === 'released');

    if (nonSystemFacts.length === 0 && snapshot.intents.length === 0) {
      const result = await this.runWorker(runId, worker, this.withWorkerContext(runId, { type: 'bootstrap', graph: snapshot }));
      if (!result.accepted) {
        this.record(runId, 'dispatch.failed', 'Bootstrap failed', result.reason, 'error');
        return this.finishDispatch(
          runId,
        { status: 'failed', task: 'bootstrap', worker: worker.name, reason: result.reason, selection: dispatchSelection(workerSelection) },
        dispatchStartedMs,
        { worker: worker.name, task: 'bootstrap', reason: result.reason, ...dispatchSelectionAttributes(workerSelection) },
      );
      }
      this.applyBootstrap(runId, worker.name, result);
      this.record(runId, 'dispatch.completed', 'Bootstrap completed', `${worker.name} returned a bootstrap result`);
      return this.finishDispatch(
        runId,
      { status: 'dispatched', task: 'bootstrap', worker: worker.name, selection: dispatchSelection(workerSelection) },
      dispatchStartedMs,
      { worker: worker.name, task: 'bootstrap', ...dispatchSelectionAttributes(workerSelection) },
    );
    }

    if (openIntent) {
      const claimedIntent = this.graph.claimIntent(openIntent.id, worker.name, this.intentLeaseMs);
      const exploreTask = this.withWorkerContext(runId, { type: 'explore', graph: snapshot, intent: claimedIntent });
      const result = await this.runWorker(runId, worker, exploreTask).catch(
        (error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          return { accepted: false as const, reason };
        },
      );
      if (!result.accepted) {
        this.graph.releaseIntent(claimedIntent.id, result.reason);
        this.record(runId, 'dispatch.failed', 'Explore failed', result.reason, 'error');
        return this.finishDispatch(
          runId,
          { status: 'failed', task: 'explore', worker: worker.name, reason: result.reason, selection: dispatchSelection(workerSelection) },
          dispatchStartedMs,
          { worker: worker.name, task: 'explore', intentId: claimedIntent.id, reason: result.reason, ...dispatchSelectionAttributes(workerSelection) },
        );
      }
      if (!result.data.description) {
        const reason = 'Worker returned no explore conclusion';
        this.graph.releaseIntent(claimedIntent.id, reason);
        this.record(runId, 'dispatch.failed', 'Explore failed', reason, 'error');
        return this.finishDispatch(
          runId,
          { status: 'failed', task: 'explore', worker: worker.name, reason, selection: dispatchSelection(workerSelection) },
          dispatchStartedMs,
          { worker: worker.name, task: 'explore', intentId: claimedIntent.id, reason, ...dispatchSelectionAttributes(workerSelection) },
        );
      }
      const explore = await this.applyExplore(runId, claimedIntent.id, claimedIntent.riskLevel, worker.name, result, worker, exploreTask).catch((error: unknown) => ({
        status: 'blocked' as const,
        reason: error instanceof Error ? error.message : String(error),
        approvalId: undefined,
        invocationId: undefined,
      }));
      if (explore.status === 'blocked') {
        this.graph.releaseIntent(claimedIntent.id, explore.reason);
        this.record(runId, 'dispatch.skipped', 'Explore paused by tool gate', explore.reason, 'warning');
        return this.finishDispatch(
          runId,
          {
            status: 'blocked',
            task: 'explore',
            worker: worker.name,
            reason: explore.reason,
            approvalId: explore.approvalId,
            invocationId: explore.invocationId,
            selection: dispatchSelection(workerSelection),
          },
          dispatchStartedMs,
          {
            worker: worker.name,
            task: 'explore',
            intentId: claimedIntent.id,
            reason: explore.reason,
            approvalId: explore.approvalId,
            invocationId: explore.invocationId,
            ...dispatchSelectionAttributes(workerSelection),
          },
        );
      }
      this.record(
        runId,
        'dispatch.completed',
        'Explore completed',
        `${worker.name} concluded an intent${explore.evidenceIds.length > 0 ? ` with ${explore.evidenceIds.length} evidence item(s)` : ''}`,
      );
      return this.finishDispatch(
        runId,
        { status: 'dispatched', task: 'explore', worker: worker.name, selection: dispatchSelection(workerSelection) },
        dispatchStartedMs,
        { worker: worker.name, task: 'explore', intentId: claimedIntent.id, evidenceCount: explore.evidenceIds.length, ...dispatchSelectionAttributes(workerSelection) },
      );
    }

    const result = await this.runWorker(runId, worker, this.withWorkerContext(runId, { type: 'reason', graph: snapshot }));
    if (!result.accepted) {
      this.record(runId, 'dispatch.failed', 'Reasoning failed', result.reason, 'error');
      return this.finishDispatch(
        runId,
      { status: 'failed', task: 'reason', worker: worker.name, reason: result.reason, selection: dispatchSelection(workerSelection) },
      dispatchStartedMs,
      { worker: worker.name, task: 'reason', reason: result.reason, ...dispatchSelectionAttributes(workerSelection) },
    );
    }
    this.applyReason(runId, worker.name, result);
    this.record(runId, 'dispatch.completed', 'Reasoning completed', `${worker.name} returned a reasoning result`);
    return this.finishDispatch(
      runId,
      { status: 'dispatched', task: 'reason', worker: worker.name, selection: dispatchSelection(workerSelection) },
      dispatchStartedMs,
      { worker: worker.name, task: 'reason', ...dispatchSelectionAttributes(workerSelection) },
    );
  }

  async previewEnvelope(runId: string, requestedTask: WorkerEnvelopePreviewTask = 'auto'): Promise<WorkerEnvelopePreview> {
    const snapshot = this.graph.getGraph(runId);
    const task = this.buildPreviewTask(runId, requestedTask, snapshot);
    const contextualTask = this.withWorkerContext(runId, task);
    const envelope = buildWorkerProtocolEnvelope(contextualTask);
    const workerCandidates = snapshot.run.workerPool.map((worker) => ({
      name: worker.name,
      type: worker.type,
      priority: worker.priority,
      maxRunning: worker.maxRunning,
      commandConfigured: worker.type === 'mock' || Boolean(worker.command),
    }));
    const selection = await this.previewSelection(runId, contextualTask.type, workerCandidates);
    const selectedWorker = selection.candidate
      ? workerCandidates.find((worker) => worker.name === selection.candidate?.worker) ?? workerCandidates[0]
      : workerCandidates[0];
    return {
      generatedAt: new Date().toISOString(),
      runId,
      requestedTask,
      task: contextualTask.type,
      selectedBy: requestedTask === 'auto' ? 'auto' : 'operator',
      selectionSource: selection.source,
      selectedWorker,
      workerCandidates,
      intentId: contextualTask.type === 'explore' ? contextualTask.intent.id : undefined,
      claimWouldOccur: contextualTask.type === 'explore',
      graphCounts: {
        facts: snapshot.facts.length,
        intents: snapshot.intents.length,
        evidence: snapshot.evidence.length,
        findings: snapshot.findings.length,
      },
      contextCounts: {
        domainSkills: envelope.domainSkills.length,
        credentialReferences: envelope.credentialReferences.length,
        pocTemplates: envelope.pocTemplates.length,
        toolboxBundles: envelope.toolboxBundles.length,
        connectors: envelope.connectors.length,
        toolSurface: envelope.toolSurface.length,
        strategyHints: envelope.strategyHints.length,
        strategyRecommendations: envelope.strategyRecommendations.length,
      },
      safety: {
        rawSecretsIncluded: false,
        rawEvidenceContentIncluded: false,
        writesState: false,
        executesWorker: false,
      },
      envelope,
    };
  }

  private async selectWorker(
    runId: string,
    workerPool: WorkerConfig[],
  ): Promise<{
    worker?: WorkerAdapter;
    workerName?: string;
    source: WorkerSelectionSource;
    candidate?: WorkerSelectionCandidate;
    reason?: string;
  }> {
    const ordered = await this.orderWorkerPool(runId, workerPool);
    for (const config of ordered.configs) {
      const worker = this.workerFactory(config);
      if (await worker.healthcheck()) {
        const candidate = ordered.report?.candidates.find((item) => item.worker === config.name);
        return { worker, workerName: config.name, source: ordered.source, candidate };
      }
    }
    return { source: ordered.source, reason: ordered.reason };
  }

  private async orderWorkerPool(
    runId: string,
    workerPool: WorkerConfig[],
  ): Promise<{ configs: WorkerConfig[]; source: WorkerSelectionSource; report?: WorkerSelectionPolicyReport; reason?: string }> {
    if (!this.workerSelection) {
      return { configs: workerPool, source: 'pool_order' };
    }
    try {
      const report = await this.workerSelection.preview(runId);
      const byName = new Map(workerPool.map((worker) => [worker.name, worker]));
      const orderedNames = unique([
        ...(report.selectedWorker ? [report.selectedWorker.worker] : []),
        ...report.candidates
          .filter((candidate) => candidate.decision !== 'blocked' && candidate.decision !== 'deprioritize')
          .map((candidate) => candidate.worker),
        ...report.candidates.filter((candidate) => candidate.decision === 'deprioritize').map((candidate) => candidate.worker),
        ...workerPool.map((worker) => worker.name),
      ]);
      const configs = orderedNames.flatMap((name) => {
        const config = byName.get(name);
        return config ? [config] : [];
      });
      return { configs: configs.length > 0 ? configs : workerPool, source: 'policy', report };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.record(runId, 'dispatch.started', 'Worker selection policy unavailable', reason, 'warning');
      return { configs: workerPool, source: 'pool_order', reason };
    }
  }

  private async previewSelection(
    runId: string,
    task: WorkerTask['type'],
    workerCandidates: WorkerEnvelopePreview['workerCandidates'],
  ): Promise<{ source: WorkerSelectionSource; candidate?: WorkerSelectionCandidate }> {
    if (!this.workerSelection) {
      return { source: 'pool_order' };
    }
    try {
      const report = await this.workerSelection.preview(runId);
      if (report.task !== task) {
        return { source: 'pool_order' };
      }
      return { source: 'policy', candidate: report.selectedWorker };
    } catch {
      return { source: 'pool_order' };
    }
  }

  private buildPreviewTask(
    runId: string,
    requestedTask: WorkerEnvelopePreviewTask,
    snapshot: ReturnType<GraphServer['getGraph']>,
  ): WorkerTask {
    const taskType = requestedTask === 'auto' ? inferNextWorkerTask(snapshot) : requestedTask;
    if (taskType === 'bootstrap') {
      return { type: 'bootstrap', graph: snapshot };
    }
    if (taskType === 'reason') {
      return { type: 'reason', graph: snapshot };
    }
    const intent =
      snapshot.intents.find((item) => item.status === 'open' || item.status === 'released') ??
      snapshot.intents.find((item) => item.status === 'claimed');
    if (!intent) {
      throw new Error(`No claimable or active intent is available for Worker envelope preview in run ${runId}`);
    }
    return { type: 'explore', graph: snapshot, intent };
  }

  private withWorkerContext<T extends WorkerTask>(runId: string, task: T): T {
    const domainSkills = this.skills?.workerContext(runId) ?? [];
    const credentialReferences = this.credentials?.workerContext(runId) ?? [];
    const pocTemplates = this.pocs?.workerContext(runId) ?? [];
    const toolboxBundles = this.toolbox?.workerContext(runId) ?? [];
    const connectors = this.connectors?.workerContext(runId) ?? [];
    return {
      ...task,
      ...(domainSkills.length > 0 ? { domainSkills } : {}),
      ...(credentialReferences.length > 0 ? { credentialReferences } : {}),
      ...(pocTemplates.length > 0 ? { pocTemplates } : {}),
      ...(toolboxBundles.length > 0 ? { toolboxBundles } : {}),
      ...(connectors.length > 0 ? { connectors } : {}),
    } as T;
  }

  private executeWorker(worker: WorkerAdapter, task: Parameters<WorkerAdapter['execute']>[0]): Promise<WorkerTaskResult> {
    return withTimeout(worker.execute(task), this.workerTimeoutMs, `${worker.name} ${task.type} timed out`);
  }

  private async runWorker(
    runId: string,
    worker: WorkerAdapter,
    task: Parameters<WorkerAdapter['execute']>[0],
  ): Promise<WorkerTaskResult> {
    const startedMs = Date.now();
    try {
      const result = await this.executeWorker(worker, task);
      this.recordWorker(runId, worker.name, task.type, result.accepted ? 'ok' : 'error', startedMs, {
        accepted: result.accepted,
        reason: result.accepted ? undefined : result.reason,
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.recordWorker(runId, worker.name, task.type, /timed out/i.test(reason) ? 'timeout' : 'error', startedMs, {
        accepted: false,
        reason,
      });
      throw error;
    }
  }

  private applyBootstrap(runId: string, workerName: string, result: WorkerTaskResult): void {
    if (!result.accepted) {
      return;
    }
    if (result.data.fact) {
      this.graph.addFact({
        runId,
        statement: result.data.fact.description,
        createdBy: `${workerName}:bootstrap`,
      });
    }
    if (result.data.complete) {
      this.graph.completeRun(runId);
    }
  }

  private applyReason(runId: string, workerName: string, result: WorkerTaskResult): void {
    if (!result.accepted) {
      return;
    }
    if (result.data.complete) {
      this.graph.completeRun(runId);
      return;
    }
    if (result.data.intent) {
      this.graph.createIntent({
        runId,
        fromFactIds: result.data.intent.from,
        hypothesis: result.data.intent.description,
        riskLevel: result.data.intent.riskLevel ?? 'R1',
        createdBy: `${workerName}:reason`,
      });
    }
  }

  private async applyExplore(
    runId: string,
    intentId: string,
    fallbackRiskLevel: WorkerToolRequest['riskLevel'],
    workerName: string,
    result: AcceptedWorkerTaskResult,
    worker: WorkerAdapter,
    task: Extract<Parameters<WorkerAdapter['execute']>[0], { type: 'explore' }>,
  ): Promise<
    | { status: 'concluded'; evidenceIds: string[] }
    | { status: 'blocked'; reason: string; approvalId?: string; invocationId?: string }
  > {
    const maxRounds = 4;
    let currentResult = result;
    const allEvidenceIds: string[] = [];

    for (let round = 0; round < maxRounds; round++) {
      const description = currentResult.data.description;
      if (!description) {
        throw new Error('Worker returned no explore conclusion');
      }

      const roundEvidenceIds: string[] = [];
      for (const request of currentResult.data.toolRequests ?? []) {
        const resolvedRequest = resolveProducedEvidenceReference(request, [...allEvidenceIds, ...roundEvidenceIds]);
        const toolResult = await this.invokeWorkerTool(runId, intentId, fallbackRiskLevel, workerName, resolvedRequest);
        if (toolResult.status === 'allowed') {
          if (toolResult.evidenceId) {
            roundEvidenceIds.push(toolResult.evidenceId);
          }
          continue;
        }
        return {
          status: 'blocked',
          reason: toolResult.reason,
          approvalId: toolResult.approvalId,
          invocationId: toolResult.invocationId,
        };
      }
      allEvidenceIds.push(...roundEvidenceIds);

      if (currentResult.data.continueExplore === true) {
        if (round >= maxRounds - 1) {
          return {
            status: 'blocked',
            reason: `Max explore rounds reached (${maxRounds}) while worker still requested continueExplore`,
          };
        }

        const activeIntent = this.graph.heartbeatIntent(intentId, task.intent.leaseId ?? '', this.intentLeaseMs);
        const latestGraph = this.graph.getGraph(runId);
        const latestIntent = latestGraph.intents.find((item) => item.id === intentId) ?? activeIntent;
        const continueTask = this.withWorkerContext(runId, {
          type: 'explore',
          graph: latestGraph,
          intent: latestIntent,
          producedEvidenceIds: [...allEvidenceIds],
        });
        const nextResult = await this.runWorker(runId, worker, continueTask).catch((error: unknown) => ({
          accepted: false as const,
          reason: error instanceof Error ? error.message : String(error),
        }));
        if (!nextResult.accepted) {
          return { status: 'blocked', reason: nextResult.reason };
        }
        if (!nextResult.data.description) {
          return { status: 'blocked', reason: 'Worker returned no explore conclusion on continue' };
        }
        currentResult = nextResult;
        continue;
      }

      this.graph.concludeIntent(intentId, description, `${workerName}:explore`, allEvidenceIds);
      return { status: 'concluded', evidenceIds: allEvidenceIds };
    }

    return { status: 'blocked', reason: `Max explore rounds reached (${maxRounds})` };
  }

  private async invokeWorkerTool(
    runId: string,
    intentId: string,
    fallbackRiskLevel: WorkerToolRequest['riskLevel'],
    workerName: string,
    request: WorkerToolRequest,
  ): Promise<
    | { status: 'allowed'; evidenceId?: string; findingId?: string; invocationId: string }
    | { status: 'blocked'; reason: string; approvalId?: string; invocationId?: string }
  > {
    if (!this.tools) {
      return { status: 'blocked', reason: 'Dispatcher has no Tool Gateway configured for worker tool requests' };
    }
    const result: ToolInvokeResult = await this.tools.invoke({
      runId,
      tool: request.tool,
      target: request.target,
      method: request.method ?? 'GET',
      riskLevel: request.riskLevel ?? fallbackRiskLevel ?? 'R1',
      args: request.args ?? {},
      approvalId: request.approvalId,
    });
    this.record(
      runId,
      result.status === 'allowed' ? 'tool.allowed' : 'tool.blocked',
      result.status === 'allowed' ? 'Worker tool request allowed' : 'Worker tool request blocked',
      `${workerName} requested ${request.tool} for ${intentId}`,
      result.status === 'allowed' ? 'info' : 'warning',
    );
    if (result.status === 'allowed') {
      return {
        status: 'allowed',
        evidenceId: result.evidenceId,
        findingId: result.findingId,
        invocationId: result.invocationId,
      };
    }
    if (result.status === 'approval_required') {
      return {
        status: 'blocked',
        reason: `Worker tool request requires approval: ${result.reason}`,
        approvalId: result.approvalId,
        invocationId: result.invocationId,
      };
    }
    return { status: 'blocked', reason: result.reason, invocationId: result.invocationId };
  }

  private record(
    runId: string,
    type: Parameters<RunEventService['record']>[0]['type'],
    title: string,
    detail?: string,
    level: Parameters<RunEventService['record']>[0]['level'] = 'info',
  ): void {
    this.events?.record({ runId, type, title, detail, level });
  }

  private recordWorker(
    runId: string,
    worker: string,
    task: 'bootstrap' | 'reason' | 'explore',
    status: 'ok' | 'error' | 'timeout',
    startedMs: number,
    attributes: Record<string, string | number | boolean | undefined>,
  ): void {
    const span = this.observability?.recordDuration({
      runId,
      kind: 'worker',
      name: `${worker}.${task}`,
      status,
      startedMs,
      attributes: { ...attributes, worker, task },
    });
    if (span) {
      this.observability?.recordCost({
        runId,
        source: 'worker',
        unit: 'millisecond',
        quantity: span.durationMs,
        worker,
        entityId: span.id,
      });
    }
  }

  private finishDispatch<T extends DispatchResult>(
    runId: string,
    result: T,
    startedMs: number,
    attributes: Record<string, string | number | boolean | undefined>,
  ): T {
    // Increment dispatch counter for checkpointing
    if (result.status === 'dispatched') {
      this.checkpoints?.incrementDispatchCount(runId);
    }

    this.observability?.recordDuration({
      runId,
      kind: 'dispatch',
      name: 'dispatcher.dispatchOnce',
      status: dispatchSpanStatus(result.status),
      startedMs,
      attributes: { ...attributes, result: result.status },
    });
    return result;
  }
}

function inferNextWorkerTask(snapshot: ReturnType<GraphServer['getGraph']>): WorkerTask['type'] {
  const nonSystemFacts = snapshot.facts.filter((fact) => !fact.createdBy.startsWith('system.'));
  const openIntent = snapshot.intents.find((intent) => intent.status === 'open' || intent.status === 'released');
  if (nonSystemFacts.length === 0 && snapshot.intents.length === 0) {
    return 'bootstrap';
  }
  if (openIntent) {
    return 'explore';
  }
  return 'reason';
}

function dispatchSpanStatus(status: DispatchResult['status']): 'ok' | 'error' | 'skipped' | 'blocked' {
  if (status === 'failed') {
    return 'error';
  }
  if (status === 'blocked') {
    return 'blocked';
  }
  if (status === 'skipped') {
    return 'skipped';
  }
  return 'ok';
}

function dispatchSelection(input: {
  source: WorkerSelectionSource;
  workerName?: string;
  candidate?: WorkerSelectionCandidate;
  reason?: string;
}): DispatchWorkerSelection {
  return {
    source: input.source,
    worker: input.candidate?.worker ?? input.workerName,
    score: input.candidate?.selectionScore,
    decision: input.candidate?.decision,
    reason: input.reason,
  };
}

function dispatchSelectionAttributes(input: {
  source: WorkerSelectionSource;
  workerName?: string;
  candidate?: WorkerSelectionCandidate;
  reason?: string;
}): Record<string, string | number | boolean | undefined> {
  return {
    workerSelectionSource: input.source,
    workerSelectionWorker: input.candidate?.worker ?? input.workerName,
    workerSelectionScore: input.candidate?.selectionScore,
    workerSelectionDecision: input.candidate?.decision,
    workerSelectionReason: input.reason,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function resolveProducedEvidenceReference(request: WorkerToolRequest, producedEvidenceIds: string[]): WorkerToolRequest {
  if (producedEvidenceIds.length === 0) {
    return request;
  }
  const args = request.args ?? {};
  if (request.tool === 'access.compare_evidence') {
    return { ...request, args: replaceProducedEvidencePlaceholders(args, producedEvidenceIds) };
  }
  if (request.tool !== 'finding.propose') {
    return request;
  }
  const existingEvidenceIds = Array.isArray(args.evidenceIds) ? args.evidenceIds : [];
  const hasProducedPlaceholder = existingEvidenceIds.some((item) => item === '$produced');
  const expandedEvidenceIds = existingEvidenceIds.flatMap((item) =>
    item === '$produced' ? producedEvidenceIds : typeof item === 'string' ? [resolveProducedEvidencePlaceholder(item, producedEvidenceIds) ?? item] : [],
  );
  const shouldUseProduced = args.useProducedEvidence === true || hasProducedPlaceholder;
  if (!shouldUseProduced) {
    return request;
  }
  const finalEvidenceIds =
    args.useProducedEvidence === true ? [...expandedEvidenceIds, ...producedEvidenceIds] : expandedEvidenceIds;
  return {
    ...request,
    args: {
      ...args,
      evidenceIds: [...new Set(finalEvidenceIds.length > 0 ? finalEvidenceIds : producedEvidenceIds)],
    },
  };
}

function replaceProducedEvidencePlaceholders(args: Record<string, unknown>, producedEvidenceIds: string[]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === 'string' ? (resolveProducedEvidencePlaceholder(value, producedEvidenceIds) ?? value) : value,
    ]),
  );
}

function resolveProducedEvidencePlaceholder(value: string, producedEvidenceIds: string[]): string | undefined {
  if (value === '$produced') {
    return producedEvidenceIds.at(-1);
  }
  const match = value.match(/^\$produced\[(\d+)\]$/);
  if (!match) {
    return undefined;
  }
  return producedEvidenceIds[Number(match[1])];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
