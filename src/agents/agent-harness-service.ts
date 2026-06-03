import { nowIso } from '../domain/ids.js';
import type { RiskLevel, Run } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import type { ToolGateway } from '../tools/tool-gateway.js';
import type { ToolPackService } from '../tools/tool-pack-service.js';
import type { ToolboxRunner } from '../tools/toolbox-runner.js';

export type AgentHarnessStatus = 'ready' | 'usable' | 'partial' | 'gap';
export type AgentHarnessFixtureStatus = 'ready' | 'waiting_for_data' | 'needs_setup' | 'blocked';
export type AgentHarnessWorkerTask = 'bootstrap' | 'reason' | 'explore';

export interface AgentHarnessCell {
  id: string;
  title: string;
  status: AgentHarnessStatus;
  score: number;
  referencePrinciple: string;
  ours: string;
  evidence: string[];
  gaps: string[];
  nextAction: string;
}

export interface AgentHarnessFixtureTask {
  id: string;
  title: string;
  status: AgentHarnessFixtureStatus;
  phaseReference: string;
  objective: string;
  riskLevel: RiskLevel;
  runFit: string;
  workerTasks: AgentHarnessWorkerTask[];
  requiredSurfaces: string[];
  acceptanceCriteria: string[];
  safetyGates: string[];
  expectedArtifacts: string[];
  blockers: string[];
}

export interface AgentHarnessEvalPlan {
  runId: string;
  generatedAt: string;
  mode: 'agent_harness_eval_plan';
  posture: AgentHarnessStatus;
  summary: string;
  counts: {
    fixtures: number;
    ready: number;
    waitingForData: number;
    needsSetup: number;
    blocked: number;
    acceptanceCriteria: number;
    safetyGates: number;
    expectedArtifacts: number;
  };
  observationBudget: {
    maxAutomaticRisk: RiskLevel;
    manualApprovalRisk: RiskLevel;
    forbiddenRisk: RiskLevel;
    requestsPerMinute: number;
    destructiveAllowed: boolean;
    allowedAssets: number;
    deniedAssets: number;
  };
  referenceSource: {
    project: string;
    copiedIdeas: string[];
    deliberatelyNotCopied: string[];
  };
  fixtures: AgentHarnessFixtureTask[];
  acceptanceGates: string[];
  readOnlyGuarantees: string[];
  nextActions: string[];
}

export interface AgentHarnessReport {
  runId: string;
  generatedAt: string;
  mode: 'agent_harness_readiness';
  posture: AgentHarnessStatus;
  score: number;
  summary: string;
  counts: {
    cells: number;
    ready: number;
    usable: number;
    partial: number;
    gaps: number;
    workers: number;
    workerSpans: number;
    highLevelTools: number;
    scannerTemplates: number;
    toolPacks: number;
    toolboxBundles: number;
    evidence: number;
    evaluations: number;
  };
  cells: AgentHarnessCell[];
  runControls: string[];
  safetyNotes: string[];
  nextActions: string[];
  evalPlan: AgentHarnessEvalPlan;
}

export class AgentHarnessService {
  constructor(
    private readonly store: PlatformStore,
    private readonly tools: ToolGateway,
    private readonly toolPacks: ToolPackService,
    private readonly toolbox: ToolboxRunner,
  ) {}

  async get(runId: string): Promise<AgentHarnessReport> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const toolCatalog = this.tools.catalog();
    const scannerTemplates = this.tools.scannerTemplatePolicies();
    const packs = this.toolPacks.list();
    const bundles = await this.toolbox.bundles();
    const signals = runHarnessSignals(this.store, runId);
    const inventory = {
      highLevelTools: toolCatalog.length,
      scannerTemplates: scannerTemplates.length,
      toolPacks: packs.length,
      toolboxBundles: bundles.length,
      runnableToolboxBundles: bundles.filter((bundle) => bundle.runnableTemplateCount > 0).length,
    };
    const cells = [
      agentLoopCell(run.workerPool.length, signals),
      toolRegistryCell(toolCatalog.length, scannerTemplates.length, packs.length),
      sandboxRunnerCell(inventory.toolboxBundles, inventory.runnableToolboxBundles, signals),
      observationBudgetCell(run.scopePolicy.rateLimits.requestsPerMinute, signals),
      evalHarnessCell(signals),
      workbenchHandoffCell(signals),
      evidenceDeliveryCell(signals),
    ];
    const score = Math.round(cells.reduce((total, cell) => total + cell.score, 0) / Math.max(cells.length, 1));
    const counts = {
      cells: cells.length,
      ready: cells.filter((cell) => cell.status === 'ready').length,
      usable: cells.filter((cell) => cell.status === 'usable').length,
      partial: cells.filter((cell) => cell.status === 'partial').length,
      gaps: cells.filter((cell) => cell.status === 'gap').length,
      workers: run.workerPool.length,
      workerSpans: signals.workerSpans,
      highLevelTools: inventory.highLevelTools,
      scannerTemplates: inventory.scannerTemplates,
      toolPacks: inventory.toolPacks,
      toolboxBundles: inventory.toolboxBundles,
      evidence: signals.evidence,
      evaluations: signals.evaluations,
    };
    const evalPlan = harnessEvalPlan(run, signals, inventory);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'agent_harness_readiness',
      posture: statusFromScore(score),
      score,
      summary:
        `Agent Harness score ${score}/100 across ${cells.length} engineering cell(s). ` +
        `${counts.ready + counts.usable} cell(s) are commercially usable or ready; ${counts.partial + counts.gaps} need buildout.`,
      counts,
      cells,
      runControls: [
        'Dispatcher owns bootstrap/reason/explore and graph writes.',
        'Tool Gateway owns execution, scope, risk, approval, rate, audit, redaction, and evidence writes.',
        'Worker Evaluation Plan and Harness reports are read-only; they do not dispatch workers or grant permissions.',
        'Agent Workbench actions point back to existing APIs instead of creating a second process engine.',
      ],
      safetyNotes: [
        'This read model applies ai-engineering-from-scratch-style agent harness lessons without importing generic pentest Skills.',
        'Harness cells are product readiness checks, not runtime authority boundaries.',
        'All active testing still requires ScopePolicy, Tool Gateway, evidence, and human validation gates.',
      ],
      nextActions: nextActions(cells),
      evalPlan,
    };
  }

  async getPlan(runId: string): Promise<AgentHarnessEvalPlan> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const toolCatalog = this.tools.catalog();
    const scannerTemplates = this.tools.scannerTemplatePolicies();
    const packs = this.toolPacks.list();
    const bundles = await this.toolbox.bundles();
    return harnessEvalPlan(run, runHarnessSignals(this.store, runId), {
      highLevelTools: toolCatalog.length,
      scannerTemplates: scannerTemplates.length,
      toolPacks: packs.length,
      toolboxBundles: bundles.length,
      runnableToolboxBundles: bundles.filter((bundle) => bundle.runnableTemplateCount > 0).length,
    });
  }
}

interface HarnessPlatformInventory {
  highLevelTools: number;
  scannerTemplates: number;
  toolPacks: number;
  toolboxBundles: number;
  runnableToolboxBundles: number;
}

interface RunHarnessSignals {
  facts: number;
  intents: number;
  openIntents: number;
  releasedIntents: number;
  evidence: number;
  findings: number;
  confirmedFindings: number;
  toolInvocations: number;
  blockedToolInvocations: number;
  approvals: number;
  pendingApprovals: number;
  traceSpans: number;
  workerSpans: number;
  toolSpans: number;
  costEntries: number;
  evaluations: number;
  events: number;
  runExports: number;
  reports: number;
  evidenceReviews: number;
  usefulEvidenceReviews: number;
}

function harnessEvalPlan(run: Run, signals: RunHarnessSignals, inventory: HarnessPlatformInventory): AgentHarnessEvalPlan {
  const hasRunnableWorker = run.workerPool.some((worker) => worker.type === 'mock' || Boolean(worker.command));
  const hasScope = run.scopePolicy.allowedAssets.length > 0 && run.scopePolicy.rateLimits.requestsPerMinute > 0;
  const fixtures: AgentHarnessFixtureTask[] = [
    fixture({
      id: 'agent_loop_low_risk_trace',
      title: 'Low-risk agent loop trace',
      status: !hasRunnableWorker || !hasScope ? 'needs_setup' : signals.workerSpans > 0 ? 'ready' : 'waiting_for_data',
      phaseReference: 'Phase 14 / Agent loop and loop contract',
      objective: 'Exercise bootstrap, reason, and explore through the Dispatcher on the current authorized scope.',
      riskLevel: 'R1',
      runFit: `${run.workerPool.length} Worker slot(s), ${signals.workerSpans} Worker span(s), ${signals.intents} intent(s).`,
      workerTasks: ['bootstrap', 'reason', 'explore'],
      requiredSurfaces: ['Dispatcher', 'Agent Worker protocol', 'Run timeline', 'Trace spans'],
      acceptanceCriteria: [
        'Worker output is parsed as the agent-worker.v1 envelope or rejected with a visible error.',
        'Only the Dispatcher creates facts, intents, leases, and conclusions.',
        'The run timeline shows every bootstrap/reason/explore transition.',
      ],
      safetyGates: ['Use only R0/R1 work for the fixture.', 'No Worker-to-Worker messages or role ownership is introduced.'],
      expectedArtifacts: ['worker trace spans', 'run events', 'fact/intent graph updates'],
      blockers: [
        ...(!hasRunnableWorker ? ['No runnable Worker contract is configured.'] : []),
        ...(!hasScope ? ['ScopePolicy needs at least one allowed asset and a positive rate limit.'] : []),
      ],
    }),
    fixture({
      id: 'tool_registry_schema_validation',
      title: 'Tool registry schema validation',
      status: inventory.highLevelTools > 0 && inventory.scannerTemplates >= 10 ? 'ready' : 'needs_setup',
      phaseReference: 'Phase 13 / Tool registry with schema validation',
      objective: 'Confirm Workers receive governed tool capabilities instead of raw command lists.',
      riskLevel: 'R0',
      runFit: `${inventory.highLevelTools} high-level tool(s), ${inventory.scannerTemplates} scanner template(s), ${inventory.toolPacks} Tool Pack(s).`,
      workerTasks: ['bootstrap', 'reason'],
      requiredSurfaces: ['Tool Catalog', 'Scanner Template Policies', 'Tool Packs', 'Worker Envelope Preview'],
      acceptanceCriteria: [
        'Every exposed action has a high-level tool, scanner template, or Tool Pack policy id.',
        'Risk level, evidence kind, approval behavior, and safety notes are visible before execution.',
        'Raw commands, payloads, secrets, endpoints, and arbitrary tool lists stay out of Worker context.',
      ],
      safetyGates: ['Tool Gateway remains the only execution path.', 'External ecosystems must be mapped before use.'],
      expectedArtifacts: ['tool catalog snapshot', 'scanner policy snapshot', 'worker envelope preview'],
      blockers: [
        ...(inventory.highLevelTools === 0 ? ['No high-level tools are registered.'] : []),
        ...(inventory.scannerTemplates < 10 ? ['Scanner template catalogue is too thin for commercial evaluation.'] : []),
      ],
    }),
    fixture({
      id: 'sandbox_fail_closed_boundary',
      title: 'Sandbox fail-closed boundary',
      status: inventory.toolboxBundles > 0 ? 'ready' : 'needs_setup',
      phaseReference: 'Phase 19 / Sandbox runner with denylist and path jail',
      objective: 'Verify external toolbox breadth is visible without granting ungoverned execution authority.',
      riskLevel: 'R2',
      runFit: `${inventory.toolboxBundles} Toolbox Bundle(s), ${inventory.runnableToolboxBundles} runnable bundle(s), ${signals.blockedToolInvocations} blocked tool call(s).`,
      workerTasks: ['reason', 'explore'],
      requiredSurfaces: ['Toolbox Runner', 'Toolbox Doctor', 'Runtime Activation Plan', 'Tool Gateway audit'],
      acceptanceCriteria: [
        'Profile-blocked and policy-blocked templates are visible as setup work, not silent execution failures.',
        'External execution requires both global enablement and template allowlist membership.',
        'Blocked invocations produce audit records and do not create fake evidence.',
      ],
      safetyGates: ['R2 work must match ScopePolicy.', 'R3 remains approval-gated.', 'R4 defaults to deny and requires matching break-glass token plus approval.'],
      expectedArtifacts: ['runtime activation plan', 'blocked/allowed tool audit', 'toolbox readiness record'],
      blockers: [],
    }),
    fixture({
      id: 'observation_budget_scope_fixture',
      title: 'Observation budget and scope fixture',
      status: hasScope ? 'ready' : 'blocked',
      phaseReference: 'Phase 25 / Verification gates and observation budget',
      objective: 'Treat scope, rate, approval, and destructive-action policy as first-class agent loop constraints.',
      riskLevel: 'R1',
      runFit: `${run.scopePolicy.allowedAssets.length} allowed asset(s), ${run.scopePolicy.deniedAssets.length} denied asset(s), ${run.scopePolicy.rateLimits.requestsPerMinute}/min.`,
      workerTasks: ['reason', 'explore'],
      requiredSurfaces: ['ScopePolicy', 'Tool Plan Preview', 'Approval Service', 'Run progress'],
      acceptanceCriteria: [
        'Out-of-scope targets are blocked before network execution.',
        'Requests above the risk budget are approval-gated or rejected before tool execution.',
        'Rate limits and pending approvals are visible in the operator console.',
      ],
      safetyGates: [
        'Never use the fixture against third-party targets outside the authorized policy.',
        'Do not use destructive methods as an evaluation shortcut.',
      ],
      expectedArtifacts: ['tool preview decision', 'approval or block record', 'operator-visible budget state'],
      blockers: [
        ...(!hasScope ? ['ScopePolicy is incomplete.'] : []),
        ...(run.scopePolicy.destructiveAllowed
          ? ['Destructive actions are allowed for this run; require extra operator review before commercial bakeoff.']
          : []),
      ],
    }),
    fixture({
      id: 'eval_harness_fixture_tasks',
      title: 'Fixture task evaluation loop',
      status: run.workerPool.length < 2 ? 'needs_setup' : signals.evaluations > 0 ? 'ready' : 'waiting_for_data',
      phaseReference: 'Phase 27 / Eval harness with fixture tasks',
      objective: 'Compare Worker quality using same-run task cells, trace spans, cost, and evidence survival.',
      riskLevel: 'R0',
      runFit: `${signals.evaluations} evaluation(s), ${signals.traceSpans} trace span(s), ${signals.costEntries} cost entry(ies).`,
      workerTasks: ['bootstrap', 'reason', 'explore'],
      requiredSurfaces: ['Worker Evaluation Plan', 'Worker Leaderboard', 'Run Scorecard', 'Observability'],
      acceptanceCriteria: [
        'Workers are compared on the same scope and task shape.',
        'Rankings use trace status, runtime, cost, evidence-linked facts, and finding influence.',
        'A Worker cannot self-report quality or mark its own evidence useful.',
      ],
      safetyGates: ['Bakeoffs stay read-only or low-risk unless a human approves escalation.', 'Evaluation data never expands runtime permissions.'],
      expectedArtifacts: ['worker eval cards', 'leaderboard record', 'scorecard dimensions'],
      blockers: [
        ...(run.workerPool.length < 2 ? ['Only one Worker slot is configured; pairwise comparison needs at least two.'] : []),
        ...(signals.evaluations === 0 ? ['No run evaluation has been recorded yet.'] : []),
      ],
    }),
    fixture({
      id: 'workbench_handoff_resume_fixture',
      title: 'Workbench handoff and resume fixture',
      status: signals.events > 0 ? 'ready' : 'waiting_for_data',
      phaseReference: 'Agent Workbench pack / task board and handoff scripts',
      objective: 'Confirm the operator can see current progress, reasoning state, blockers, and resumable next actions.',
      riskLevel: 'R0',
      runFit: `${signals.events} event(s), ${signals.openIntents} open intent(s), ${signals.releasedIntents} released intent(s).`,
      workerTasks: ['bootstrap', 'reason'],
      requiredSurfaces: ['Agent Workbench', 'Run Flow', 'Search Plan', 'Timeline'],
      acceptanceCriteria: [
        'Open, active, blocked, and review-needed work is visible without reading raw Worker logs.',
        'A restarted Runner can reconstruct the run from graph, events, intents, and evidence indexes.',
        'Operator hints and decisions are carried forward as first-class context.',
      ],
      safetyGates: ['Handoff state is descriptive; it does not auto-approve pending work.', 'Resume does not bypass leases or stale-intent handling.'],
      expectedArtifacts: ['workbench lanes', 'run-flow state', 'search plan frontier'],
      blockers: [...(signals.events === 0 ? ['No run events have been recorded yet.'] : [])],
    }),
    fixture({
      id: 'evidence_delivery_commercial_gate',
      title: 'Evidence delivery commercial gate',
      status: signals.evidence === 0 ? 'waiting_for_data' : signals.usefulEvidenceReviews > 0 || signals.confirmedFindings > 0 ? 'ready' : 'waiting_for_data',
      phaseReference: 'Ship It / reusable artifact delivery',
      objective: 'Prove that agent work can become reviewed, replayable, report-ready security output.',
      riskLevel: 'R0',
      runFit: `${signals.evidence} evidence item(s), ${signals.usefulEvidenceReviews} useful review(s), ${signals.confirmedFindings} confirmed finding(s), ${signals.runExports} export(s).`,
      workerTasks: ['explore'],
      requiredSurfaces: ['Evidence Engine', 'Evidence Review', 'Finding Service', 'Run Export'],
      acceptanceCriteria: [
        'Every finding references same-run evidence.',
        'Evidence has a SHA-256, redaction state, and replay/review path where applicable.',
        'Reports and exports omit raw local-only evidence unless explicitly configured.',
      ],
      safetyGates: ['Cloud sync receives only redacted or safe_for_cloud material.', 'Credentials and raw traffic remain local by default.'],
      expectedArtifacts: ['reviewed evidence', 'candidate or confirmed finding', 'report/export bundle'],
      blockers: [
        ...(signals.evidence === 0 ? ['No evidence has been captured yet.'] : []),
        ...(signals.evidence > 0 && signals.usefulEvidenceReviews === 0 ? ['Evidence exists but has not survived review.'] : []),
      ],
    }),
  ];
  const counts = {
    fixtures: fixtures.length,
    ready: fixtures.filter((item) => item.status === 'ready').length,
    waitingForData: fixtures.filter((item) => item.status === 'waiting_for_data').length,
    needsSetup: fixtures.filter((item) => item.status === 'needs_setup').length,
    blocked: fixtures.filter((item) => item.status === 'blocked').length,
    acceptanceCriteria: fixtures.reduce((total, item) => total + item.acceptanceCriteria.length, 0),
    safetyGates: fixtures.reduce((total, item) => total + item.safetyGates.length, 0),
    expectedArtifacts: fixtures.reduce((total, item) => total + item.expectedArtifacts.length, 0),
  };
  return {
    runId: run.id,
    generatedAt: nowIso(),
    mode: 'agent_harness_eval_plan',
    posture: evalPlanPosture(counts),
    summary:
      `${counts.ready}/${counts.fixtures} harness fixture(s) are ready; ` +
      `${counts.waitingForData} waiting for run data, ${counts.needsSetup} need setup, ${counts.blocked} blocked.`,
    counts,
    observationBudget: {
      maxAutomaticRisk: 'R2',
      manualApprovalRisk: 'R3',
      forbiddenRisk: 'R4',
      requestsPerMinute: run.scopePolicy.rateLimits.requestsPerMinute,
      destructiveAllowed: run.scopePolicy.destructiveAllowed,
      allowedAssets: run.scopePolicy.allowedAssets.length,
      deniedAssets: run.scopePolicy.deniedAssets.length,
    },
    referenceSource: {
      project: 'rohitg00/ai-engineering-from-scratch',
      copiedIdeas: [
        'Every lesson ships an artifact; every fixture declares expected artifacts.',
        'Agent loop, tool registry, sandbox, eval, observability, and workbench are separate harness cells.',
        'Fixture tasks make Worker quality repeatable instead of anecdotal.',
      ],
      deliberatelyNotCopied: [
        'Generic AI curriculum content is not injected into pentest Workers.',
        'Multi-agent/swarm roles are not used as the runtime architecture.',
        'Bulk skills and prompts are not dumped into Worker context.',
      ],
    },
    fixtures,
    acceptanceGates: [
      'Scope violation must remain zero.',
      'Finding creation requires same-run evidence.',
      'R3 actions require human approval and R4 actions are denied by default unless break-glass token and approval gates both pass.',
      'Worker output is advisory until parsed and accepted by Dispatcher-owned services.',
      'Evidence redaction and SHA-256 integrity must be present before commercial delivery.',
    ],
    readOnlyGuarantees: [
      'GET /runs/{id}/agent-harness/plan does not dispatch Workers.',
      'The plan does not invoke tools, create approvals, mutate scope, or read raw evidence content.',
      'The plan cannot grant Worker permissions or activate toolbox profiles.',
    ],
    nextActions: evalPlanNextActions(fixtures),
  };
}

function runHarnessSignals(store: PlatformStore, runId: string): RunHarnessSignals {
  const facts = Object.values(store.state.facts).filter((item) => item.runId === runId);
  const intents = Object.values(store.state.intents).filter((item) => item.runId === runId);
  const evidence = Object.values(store.state.evidence).filter((item) => item.runId === runId && item.kind !== 'replay_bundle');
  const findings = Object.values(store.state.findings).filter((item) => item.runId === runId);
  const toolInvocations = Object.values(store.state.toolInvocations).filter((item) => item.runId === runId);
  const traceSpans = Object.values(store.state.traceSpans).filter((item) => item.runId === runId);
  const reviews = Object.values(store.state.evidenceReviews).filter((item) => item.runId === runId);
  return {
    facts: facts.length,
    intents: intents.length,
    openIntents: intents.filter((item) => item.status === 'open').length,
    releasedIntents: intents.filter((item) => item.status === 'released').length,
    evidence: evidence.length,
    findings: findings.length,
    confirmedFindings: findings.filter((item) => item.validationState === 'confirmed').length,
    toolInvocations: toolInvocations.length,
    blockedToolInvocations: toolInvocations.filter((item) => item.status === 'blocked').length,
    approvals: Object.values(store.state.approvals).filter((item) => item.runId === runId).length,
    pendingApprovals: Object.values(store.state.approvals).filter((item) => item.runId === runId && item.status === 'pending').length,
    traceSpans: traceSpans.length,
    workerSpans: traceSpans.filter((item) => item.kind === 'worker').length,
    toolSpans: traceSpans.filter((item) => item.kind === 'tool').length,
    costEntries: Object.values(store.state.costLedger).filter((item) => item.runId === runId).length,
    evaluations: Object.values(store.state.evaluations).filter((item) => item.runId === runId).length,
    events: Object.values(store.state.runEvents).filter((item) => item.runId === runId).length,
    runExports: Object.values(store.state.runExports).filter((item) => item.runId === runId).length,
    reports: Object.values(store.state.evidence).filter((item) => item.runId === runId && item.kind === 'replay_bundle').length,
    evidenceReviews: reviews.length,
    usefulEvidenceReviews: reviews.filter((item) => item.status === 'useful').length,
  };
}

function agentLoopCell(workers: number, signals: RunHarnessSignals): AgentHarnessCell {
  const score = clamp(35 + Math.min(workers, 2) * 15 + Math.min(signals.intents, 3) * 8 + Math.min(signals.facts, 3) * 5);
  return cell({
    id: 'agent_loop_contract',
    title: 'Agent loop contract',
    score,
    referencePrinciple: 'Build the agent loop as a small inspectable primitive before adding autonomy.',
    ours: `${workers} Worker(s), ${signals.intents} intent(s), ${signals.facts} fact(s), ${signals.workerSpans} Worker span(s).`,
    evidence: ['agent-worker.v1 protocol envelope', 'Dispatcher bootstrap/reason/explore loop', 'intent lease and conclusion records'],
    gaps: [
      ...(workers === 0 ? ['No Worker configured for this run.'] : []),
      ...(signals.intents === 0 ? ['No intent has exercised the loop yet.'] : []),
      ...(signals.workerSpans === 0 ? ['No Worker trace span yet for harness scoring.'] : []),
    ],
    nextAction: 'Exercise bootstrap/reason/explore through the Dispatcher before expanding autonomy.',
  });
}

function toolRegistryCell(highLevelTools: number, scannerTemplates: number, packs: number): AgentHarnessCell {
  const score = clamp(20 + Math.min(highLevelTools, 9) * 5 + Math.min(scannerTemplates, 24) * 1.5 + Math.min(packs, 4) * 8);
  return cell({
    id: 'tool_registry_schema',
    title: 'Tool registry and schema gates',
    score,
    referencePrinciple: 'Tools should be registered, schema-shaped, and observable instead of passed as ad hoc functions.',
    ours: `${highLevelTools} high-level tool(s), ${scannerTemplates} scanner policy record(s), ${packs} Tool Pack(s).`,
    evidence: ['GET /tool-catalog', 'GET /scanner-template-policies', 'Tool Plan Preview', 'Tool Packs'],
    gaps: [
      ...(scannerTemplates < 24 ? ['Scanner template catalogue still needs more governed mappings for external ecosystems.'] : []),
      ...(packs < 4 ? ['Tool Packs are still thin for commercial workflows.'] : []),
    ],
    nextAction: 'Convert top external ecosystem gaps into scanner templates or Tool Packs with explicit policy records.',
  });
}

function sandboxRunnerCell(bundles: number, runnableBundles: number, signals: RunHarnessSignals): AgentHarnessCell {
  const score = clamp(35 + Math.min(bundles, 6) * 5 + Math.min(runnableBundles, 2) * 12 + Math.min(signals.toolSpans, 4) * 4);
  return cell({
    id: 'sandbox_runner',
    title: 'Sandbox runner and execution boundary',
    score,
    referencePrinciple: 'Run tools through a constrained runner with deny rules, timeouts, and observable output.',
    ours: `${bundles} Toolbox Bundle(s), ${runnableBundles} runnable bundle(s), ${signals.toolInvocations} tool invocation(s).`,
    evidence: ['Tool Gateway', 'Toolbox Runner', 'shell.run_sandboxed allowlist', 'external toolbox fail-closed policy'],
    gaps: [
      ...(runnableBundles < bundles ? ['Some toolbox bundles are metadata-only until runtime profiles are activated.'] : []),
      ...(signals.toolInvocations === 0 ? ['No run-local tool invocation data yet.'] : []),
    ],
    nextAction: 'Activate external runtime profiles only through policy, profile readiness, and template allowlists.',
  });
}

function observationBudgetCell(rateLimit: number, signals: RunHarnessSignals): AgentHarnessCell {
  const score = clamp(55 + (rateLimit > 0 ? 15 : 0) + (signals.pendingApprovals === 0 ? 10 : 0) - Math.min(signals.blockedToolInvocations, 8) * 3);
  return cell({
    id: 'observation_budget',
    title: 'Observation budget and guardrails',
    score,
    referencePrinciple: 'Agents need step limits, observation budgets, and explicit gates before actions.',
    ours: `rate=${rateLimit}/min, ${signals.pendingApprovals} pending approval(s), ${signals.blockedToolInvocations} blocked tool call(s).`,
    evidence: ['ScopePolicy rate limits', 'R0-R4 risk tiers', 'approval records', 'Tool Gateway audit'],
    gaps: [
      ...(signals.pendingApprovals > 0 ? ['Pending approvals are pausing higher-risk work.'] : []),
      ...(signals.blockedToolInvocations > 3 ? ['Blocked tool pressure should become backlog or scope review input.'] : []),
    ],
    nextAction: 'Keep budget and approval state visible before increasing autonomous ticks.',
  });
}

function evalHarnessCell(signals: RunHarnessSignals): AgentHarnessCell {
  const score = clamp(25 + Math.min(signals.traceSpans, 8) * 5 + Math.min(signals.costEntries, 8) * 3 + Math.min(signals.evaluations, 2) * 15);
  return cell({
    id: 'eval_harness',
    title: 'Eval harness and comparable traces',
    score,
    referencePrinciple: 'A real agent framework has fixture tasks, traces, cost, and comparable evaluation loops.',
    ours: `${signals.traceSpans} trace span(s), ${signals.costEntries} cost entry(ies), ${signals.evaluations} evaluation(s).`,
    evidence: ['ObservabilityService', 'Worker Evaluation Plan', 'Worker Leaderboard', 'Run Scorecard'],
    gaps: [
      ...(signals.traceSpans === 0 ? ['No trace spans captured for this run.'] : []),
      ...(signals.evaluations === 0 ? ['No run evaluation recorded yet.'] : []),
    ],
    nextAction: 'Use same-scope low-risk Worker bakeoffs and evidence-quality scoring before trusting rankings.',
  });
}

function workbenchHandoffCell(signals: RunHarnessSignals): AgentHarnessCell {
  const score = clamp(45 + Math.min(signals.events, 8) * 4 + Math.min(signals.openIntents + signals.releasedIntents, 4) * 4);
  return cell({
    id: 'workbench_handoff',
    title: 'Workbench handoff and resume surface',
    score,
    referencePrinciple: 'Agents need explicit workbench state, task boards, and handoff context.',
    ours: `${signals.events} run event(s), ${signals.openIntents} open intent(s), ${signals.releasedIntents} released intent(s).`,
    evidence: ['Agent Workbench', 'Run timeline', 'Search Plan', 'Worker Envelope Preview'],
    gaps: [
      ...(signals.events === 0 ? ['No run events available for handoff yet.'] : []),
      ...(signals.openIntents + signals.releasedIntents === 0 ? ['No queued or resumable intent visible.'] : []),
    ],
    nextAction: 'Keep every operator and Worker action reflected in timeline, workbench lanes, and envelope preview.',
  });
}

function evidenceDeliveryCell(signals: RunHarnessSignals): AgentHarnessCell {
  const score = clamp(20 + Math.min(signals.evidence, 6) * 7 + Math.min(signals.usefulEvidenceReviews, 4) * 8 + signals.confirmedFindings * 12 + signals.runExports * 10);
  return cell({
    id: 'evidence_delivery_gate',
    title: 'Evidence delivery gate',
    score,
    referencePrinciple: 'A production harness must turn agent work into reviewed artifacts, not just traces.',
    ours: `${signals.evidence} evidence item(s), ${signals.usefulEvidenceReviews} useful review(s), ${signals.confirmedFindings} confirmed finding(s), ${signals.runExports} export(s).`,
    evidence: ['Evidence Engine', 'Evidence Quality Index', 'Finding validation', 'Run Export bundles'],
    gaps: [
      ...(signals.evidence === 0 ? ['No evidence captured yet.'] : []),
      ...(signals.evidence > 0 && signals.usefulEvidenceReviews === 0 ? ['Evidence has not been reviewed as useful yet.'] : []),
      ...(signals.findings > 0 && signals.confirmedFindings === 0 ? ['Findings exist but none are confirmed.'] : []),
    ],
    nextAction: 'Treat evidence review and finding validation as the handoff boundary for commercial delivery.',
  });
}

function cell(input: Omit<AgentHarnessCell, 'status'>): AgentHarnessCell {
  return { ...input, score: clamp(input.score), status: statusFromScore(input.score) };
}

function statusFromScore(score: number): AgentHarnessStatus {
  if (score >= 82) return 'ready';
  if (score >= 62) return 'usable';
  if (score >= 35) return 'partial';
  return 'gap';
}

function nextActions(cells: AgentHarnessCell[]): string[] {
  const weakest = [...cells].sort((left, right) => left.score - right.score).slice(0, 4);
  return [
    ...weakest.map((cell) => `${cell.title}: ${cell.gaps[0] || cell.nextAction}`),
    'Keep the harness as a read-only framework layer; active work must still route through Dispatcher and Tool Gateway.',
  ];
}

function evalPlanPosture(counts: AgentHarnessEvalPlan['counts']): AgentHarnessStatus {
  if (counts.blocked > 0) return 'gap';
  if (counts.ready >= 6 && counts.needsSetup === 0) return 'ready';
  if (counts.ready >= 4) return 'usable';
  if (counts.ready >= 2) return 'partial';
  return 'gap';
}

function evalPlanNextActions(fixtures: AgentHarnessFixtureTask[]): string[] {
  const setup = fixtures
    .filter((fixture) => fixture.status === 'blocked' || fixture.status === 'needs_setup')
    .flatMap((fixture) => fixture.blockers.map((blocker) => `${fixture.title}: ${blocker}`));
  const waiting = fixtures
    .filter((fixture) => fixture.status === 'waiting_for_data')
    .map((fixture) => `${fixture.title}: collect ${fixture.expectedArtifacts[0] || 'run evidence'} through existing APIs.`);
  return unique([
    ...setup,
    ...waiting,
    'Keep fixture execution low-risk and route active steps through Dispatcher, Tool Gateway, and approval gates.',
  ]).slice(0, 10);
}

function fixture(input: AgentHarnessFixtureTask): AgentHarnessFixtureTask {
  return input;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
