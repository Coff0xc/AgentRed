import { nowIso } from '../domain/ids.js';
import type { Evidence, Finding, ToolInvocation } from '../domain/types.js';
import type { EcosystemCoverageReport, EcosystemCoverageService } from '../connectors/ecosystem-coverage-service.js';
import type { ToolIntegrationBacklogReport, ToolIntegrationBacklogService } from '../connectors/tool-integration-backlog-service.js';
import type { LocalExecutionNodeReport, LocalExecutionNodeService } from '../execution/local-execution-node-service.js';
import type { PlatformStore } from '../storage/store.js';
import type { RuntimeActivationPlanReport, RuntimeActivationPlanService } from './runtime-activation-plan-service.js';
import type { ToolboxDoctorReport, ToolboxDoctorService } from './toolbox-doctor-service.js';
import type { ToolGateway } from './tool-gateway.js';
import type { ToolPack, ToolPackPlan, ToolPackService } from './tool-pack-service.js';

export type ToolEcosystemPosture = 'ready' | 'usable' | 'thin' | 'blocked';
export type ToolEcosystemLaneStatus = 'ready' | 'usable' | 'needs_mapping' | 'blocked';
export type RecommendedToolPackStatus = 'ready' | 'partial' | 'blocked' | 'approval_required';

export interface ToolEcosystemLane {
  id: string;
  title: string;
  status: ToolEcosystemLaneStatus;
  summary: string;
  signals: string[];
  gaps: string[];
  nextActions: string[];
}

export interface RecommendedToolPack {
  id: string;
  name: string;
  category: ToolPack['category'];
  status: RecommendedToolPackStatus;
  entrypoint: string;
  why: string;
  executable: number;
  blocked: number;
  approvalRequired: number;
  total: number;
  safetyGates: string[];
  commercialUseCases: string[];
}

export interface ToolEcosystemGate {
  id: string;
  title: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface ToolEcosystemWorkbenchReport {
  runId: string;
  generatedAt: string;
  mode: 'commercial_tool_ecosystem_workbench';
  posture: ToolEcosystemPosture;
  summary: string;
  counts: {
    highLevelTools: number;
    scannerTemplates: number;
    builtInTemplates: number;
    externalTemplates: number;
    runnableTemplates: number;
    toolPacks: number;
    packRuns: number;
    connectors: number;
    enabledConnectors: number;
    connectorTools: number;
    mappedConnectorTools: number;
    unmappedConnectorTools: number;
    toolboxBundles: number;
    enabledToolboxBundles: number;
    runtimeProfiles: number;
    availableRuntimeProfiles: number;
    backlogItems: number;
    criticalBacklog: number;
    highPriorityBacklog: number;
    toolInvocations: number;
    evidenceProducingInvocations: number;
    blockedInvocations: number;
    approvalRequiredInvocations: number;
    evidence: number;
    evidenceBackedFindings: number;
  };
  lanes: ToolEcosystemLane[];
  recommendedPacks: RecommendedToolPack[];
  ecosystemGates: ToolEcosystemGate[];
  operatorNextActions: string[];
  referenceAlignment: string[];
  safetyNotes: string[];
  audit: {
    readOnly: true;
    invokesTools: false;
    invokesConnectors: false;
    enablesBundles: false;
    changesAllowlist: false;
    createsApprovals: false;
    writesEvidence: false;
    exposesRawCommandsToWorkers: false;
  };
}

export class ToolEcosystemWorkbenchService {
  constructor(
    private readonly store: PlatformStore,
    private readonly tools: ToolGateway,
    private readonly toolPacks: ToolPackService,
    private readonly toolboxDoctor: ToolboxDoctorService,
    private readonly ecosystemCoverage: EcosystemCoverageService,
    private readonly toolIntegrationBacklog: ToolIntegrationBacklogService,
    private readonly runtimeActivation: RuntimeActivationPlanService,
    private readonly executionNode: LocalExecutionNodeService,
  ) {}

  async get(runId: string): Promise<ToolEcosystemWorkbenchReport> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const [doctor, coverage, backlog, runtimeActivation, executionNode, packPlans] = await Promise.all([
      this.toolboxDoctor.report(),
      this.ecosystemCoverage.get(runId),
      this.toolIntegrationBacklog.get(runId),
      this.runtimeActivation.get(runId),
      this.executionNode.get(runId),
      this.planToolPacks(runId),
    ]);

    const catalog = this.tools.catalog();
    const policies = this.tools.scannerTemplatePolicies();
    const packs = this.toolPacks.list();
    const packRuns = this.toolPacks.listRuns(runId);
    const invocations = Object.values(this.store.state.toolInvocations).filter((item) => item.runId === runId);
    const evidence = Object.values(this.store.state.evidence).filter((item) => item.runId === runId);
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId);
    const evidenceProducingInvocationIds = new Set(evidence.map((item) => item.toolCallId).filter((id): id is string => Boolean(id)));
    const counts = {
      highLevelTools: catalog.length,
      scannerTemplates: policies.length,
      builtInTemplates: policies.filter((policy) => policy.executionMode === 'builtin').length,
      externalTemplates: policies.filter((policy) => policy.executionMode === 'external').length,
      runnableTemplates: doctor.counts.runnableTemplates,
      toolPacks: packs.length,
      packRuns: packRuns.length,
      connectors: coverage.counts.connectors,
      enabledConnectors: coverage.counts.enabledConnectors,
      connectorTools: coverage.counts.connectorTools,
      mappedConnectorTools: coverage.counts.mappedConnectorTools,
      unmappedConnectorTools: coverage.counts.unmappedConnectorTools,
      toolboxBundles: coverage.counts.toolboxBundles,
      enabledToolboxBundles: coverage.counts.enabledToolboxBundles,
      runtimeProfiles: runtimeActivation.counts.profiles,
      availableRuntimeProfiles: runtimeActivation.counts.availableProfiles,
      backlogItems: backlog.counts.items,
      criticalBacklog: backlog.counts.critical,
      highPriorityBacklog: backlog.counts.high,
      toolInvocations: invocations.length,
      evidenceProducingInvocations: invocations.filter((item) => evidenceProducingInvocationIds.has(item.id)).length,
      blockedInvocations: invocations.filter((item) => item.status === 'blocked').length,
      approvalRequiredInvocations: invocations.filter((item) => item.status === 'approval_required').length,
      evidence: evidence.length,
      evidenceBackedFindings: findings.filter((item) => item.evidenceIds.length > 0).length,
    };
    const posture = ecosystemPosture(counts, coverage);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'commercial_tool_ecosystem_workbench',
      posture,
      summary:
        `${counts.runnableTemplates}/${counts.scannerTemplates} scanner template(s) are runnable through Tool Gateway; ` +
        `${counts.mappedConnectorTools}/${counts.connectorTools} connector tool name(s) are mapped; ` +
        `${counts.evidenceProducingInvocations}/${counts.toolInvocations} tool invocation(s) have evidence output.`,
      counts,
      lanes: lanes({
        counts,
        doctor,
        coverage,
        backlog,
        runtimeActivation,
        executionNode,
        invocations,
        evidence,
        findings,
      }),
      recommendedPacks: recommendedPacks(packs, packPlans),
      ecosystemGates: gates(counts, doctor, coverage, runtimeActivation, executionNode),
      operatorNextActions: operatorNextActions(counts, coverage, backlog, runtimeActivation, executionNode, packPlans),
      referenceAlignment: [
        'HexStrike/AutoRedTeam breadth is represented as governed templates, Tool Packs, and connector metadata; raw tool sprawl is not exposed to Workers.',
        'Cairn-style minimal orchestration is preserved: Dispatcher writes state, Workers return structured results, and tool execution stays in Tool Gateway.',
        'AIDA/WonderSuite-style operator UX is represented as visible readiness, pack recommendations, runtime gates, and evidence loops.',
        'CAI/Apex and ai-engineering-from-scratch lessons are absorbed as traceable tool registry, eval harness, observation budget, and fixture-style readiness rather than extra agent roles.',
        'DragonJAR-style knowledge is kept at rigid domain-Skill granularity; generic pentest playbooks do not become platform Skills.',
      ],
      safetyNotes: [
        'Tool Ecosystem Workbench is read-only and never invokes tools, connectors, containers, browsers, OAST callbacks, or Workers.',
        'Recommended Tool Packs are based on Tool Gateway preview only; execution still requires operator action and normal gates.',
        'Connector enablement and bundle enablement are context, not permission. Execution still requires scope, risk, approval, rate-limit, audit, redaction, runtime profile, and evidence gates.',
        'Unmapped ecosystem tools must become governed scanner templates, Tool Packs, first-party services, runtime profiles, or rigid Domain Skills before Worker use.',
        'Findings remain commercial-grade only when they reference evidence from the same run.',
      ],
      audit: {
        readOnly: true,
        invokesTools: false,
        invokesConnectors: false,
        enablesBundles: false,
        changesAllowlist: false,
        createsApprovals: false,
        writesEvidence: false,
        exposesRawCommandsToWorkers: false,
      },
    };
  }

  private async planToolPacks(runId: string): Promise<ToolPackPlan[]> {
    const plans: ToolPackPlan[] = [];
    for (const pack of this.toolPacks.list()) {
      plans.push(await this.toolPacks.plan(runId, pack.id));
    }
    return plans;
  }
}

function ecosystemPosture(
  counts: ToolEcosystemWorkbenchReport['counts'],
  coverage: EcosystemCoverageReport,
): ToolEcosystemPosture {
  if (counts.highLevelTools === 0 || counts.scannerTemplates === 0 || counts.runnableTemplates === 0) {
    return 'blocked';
  }
  if (
    counts.enabledToolboxBundles > 0 &&
    counts.enabledConnectors > 0 &&
    counts.mappedConnectorTools > 0 &&
    coverage.counts.averageConnectorCoverage >= 60 &&
    counts.blockedInvocations === 0
  ) {
    return 'ready';
  }
  if (counts.runnableTemplates > 0 && counts.toolPacks > 0 && counts.connectorTools > 0) {
    return 'usable';
  }
  return 'thin';
}

function lanes(input: {
  counts: ToolEcosystemWorkbenchReport['counts'];
  doctor: ToolboxDoctorReport;
  coverage: EcosystemCoverageReport;
  backlog: ToolIntegrationBacklogReport;
  runtimeActivation: RuntimeActivationPlanReport;
  executionNode: LocalExecutionNodeReport;
  invocations: ToolInvocation[];
  evidence: Evidence[];
  findings: Finding[];
}): ToolEcosystemLane[] {
  const { counts, doctor, coverage, backlog, runtimeActivation, executionNode, invocations, evidence, findings } = input;
  return [
    lane({
      id: 'lane.governed_high_level_tools',
      title: 'Governed high-level tools',
      status: counts.highLevelTools > 0 ? 'ready' : 'blocked',
      summary: `${counts.highLevelTools} high-level Tool Gateway route(s), ${counts.builtInTemplates} built-in scanner template(s).`,
      signals: [`toolCatalog=${counts.highLevelTools}`, `builtInTemplates=${counts.builtInTemplates}`, `externalTemplates=${counts.externalTemplates}`],
      gaps: counts.highLevelTools > 0 ? [] : ['Tool Gateway catalog is empty.'],
      nextActions: ['Keep Worker requests limited to high-level Tool Gateway tools.'],
    }),
    lane({
      id: 'lane.scanner_template_library',
      title: 'Scanner template library',
      status: counts.runnableTemplates > 0 ? (doctor.counts.blockedTemplates > 0 ? 'usable' : 'ready') : 'blocked',
      summary: `${counts.runnableTemplates}/${counts.scannerTemplates} template(s) runnable; ${doctor.counts.blockedTemplates} blocked by policy/profile/planned adapters.`,
      signals: [
        `runnable=${counts.runnableTemplates}`,
        `policyBlocked=${doctor.counts.policyBlocked}`,
        `profileBlocked=${doctor.counts.profileBlocked}`,
      ],
      gaps: doctor.adapters.flatMap((adapter) => adapter.blockedReasons).slice(0, 4),
      nextActions: doctor.recommendedActions.slice(0, 4),
    }),
    lane({
      id: 'lane.commercial_tool_packs',
      title: 'Commercial Tool Packs',
      status: counts.toolPacks > 0 ? 'usable' : 'blocked',
      summary: `${counts.toolPacks} pack(s), ${counts.packRuns} run record(s). Packs turn multiple gated requests into auditable bundles.`,
      signals: [`packs=${counts.toolPacks}`, `packRuns=${counts.packRuns}`],
      gaps: counts.packRuns === 0 ? ['No Tool Pack has been executed for this run yet.'] : [],
      nextActions: ['Preview a relevant pack before execution; do not skip per-request Tool Gateway gates.'],
    }),
    lane({
      id: 'lane.connector_ecosystem',
      title: 'Connector ecosystem mapping',
      status:
        counts.connectorTools === 0
          ? 'blocked'
          : counts.unmappedConnectorTools > 0
            ? 'needs_mapping'
            : counts.enabledConnectors > 0
              ? 'ready'
              : 'usable',
      summary: `${counts.mappedConnectorTools}/${counts.connectorTools} connector tool name(s) are mapped into governed platform artifacts.`,
      signals: [
        `connectors=${counts.connectors}`,
        `enabled=${counts.enabledConnectors}`,
        `coverage=${coverage.counts.averageConnectorCoverage}%`,
      ],
      gaps: coverage.gaps.slice(0, 5).map((gap) => `${gap.toolName} -> ${gap.proposedTarget}`),
      nextActions: coverage.recommendedActions.slice(0, 4),
    }),
    lane({
      id: 'lane.runtime_activation',
      title: 'Runtime activation',
      status:
        runtimeActivation.counts.blockedSteps > 0
          ? 'blocked'
          : runtimeActivation.counts.operatorActions > 0
            ? 'usable'
            : 'ready',
      summary: `${counts.availableRuntimeProfiles}/${counts.runtimeProfiles} profile(s) available; ${runtimeActivation.counts.operatorActions} operator action(s).`,
      signals: [
        `readyAdapters=${runtimeActivation.counts.readyAdapters}`,
        `runnableTemplates=${runtimeActivation.counts.runnableTemplates}`,
        `externalExecution=${String(executionNode.policy.externalExecutionEnabled)}`,
      ],
      gaps: runtimeActivation.steps.filter((step) => step.status !== 'ready').map((step) => step.title).slice(0, 5),
      nextActions: runtimeActivation.recommendedOrder.slice(0, 5),
    }),
    lane({
      id: 'lane.evidence_execution_loop',
      title: 'Evidence-producing execution loop',
      status:
        invocations.length === 0
          ? 'usable'
          : counts.evidenceProducingInvocations > 0 && findings.every((finding) => finding.evidenceIds.length > 0)
            ? 'ready'
            : 'needs_mapping',
      summary: `${counts.evidenceProducingInvocations}/${counts.toolInvocations} invocation(s) produced evidence; ${counts.evidenceBackedFindings}/${findings.length} finding(s) reference evidence.`,
      signals: [
        `evidence=${evidence.length}`,
        `blockedInvocations=${counts.blockedInvocations}`,
        `approvalRequired=${counts.approvalRequiredInvocations}`,
      ],
      gaps: executionLoopGaps(counts, invocations, findings),
      nextActions: ['Review produced evidence before promoting Findings.', 'Use pack and connector runs as audit trails for report handoff.'],
    }),
    lane({
      id: 'lane.integration_backlog',
      title: 'Governed integration backlog',
      status: backlog.counts.critical > 0 ? 'needs_mapping' : backlog.counts.items > 0 ? 'usable' : 'ready',
      summary: `${backlog.counts.items} backlog item(s), ${backlog.counts.critical} critical and ${backlog.counts.high} high-priority.`,
      signals: [
        `scannerCandidates=${backlog.counts.scannerTemplateCandidates}`,
        `domainSkillCandidates=${backlog.counts.domainSkillCandidates}`,
        `runtimeCandidates=${backlog.counts.runtimeProfileCandidates}`,
      ],
      gaps: backlog.items.slice(0, 5).map((item) => item.title),
      nextActions: backlog.nextActions.slice(0, 4),
    }),
  ];
}

function lane(input: ToolEcosystemLane): ToolEcosystemLane {
  return {
    ...input,
    signals: [...new Set(input.signals)].filter(Boolean),
    gaps: [...new Set(input.gaps)].filter(Boolean),
    nextActions: [...new Set(input.nextActions)].filter(Boolean),
  };
}

function recommendedPacks(packs: ToolPack[], plans: ToolPackPlan[]): RecommendedToolPack[] {
  const planByPack = new Map(plans.map((plan) => [plan.pack.id, plan]));
  return packs
    .map((pack) => {
      const plan = planByPack.get(pack.id);
      const summary = plan?.summary ?? { total: pack.requests.length, executable: 0, blocked: pack.requests.length, approvalRequired: 0 };
      return {
        id: pack.id,
        name: pack.name,
        category: pack.category,
        status: packStatus(summary.executable, summary.blocked, summary.approvalRequired, summary.total),
        entrypoint: `POST /runs/{id}/tool-packs/${pack.id}/invoke`,
        why: pack.description,
        executable: summary.executable,
        blocked: summary.blocked,
        approvalRequired: summary.approvalRequired,
        total: summary.total,
        safetyGates: pack.safetyNotes,
        commercialUseCases: pack.commercialUseCases,
      };
    })
    .sort((left, right) => packStatusWeight(left.status) - packStatusWeight(right.status) || right.executable - left.executable || left.name.localeCompare(right.name));
}

function packStatus(executable: number, blocked: number, approvalRequired: number, total: number): RecommendedToolPackStatus {
  if (approvalRequired > 0 && executable === 0) return 'approval_required';
  if (executable === total && total > 0) return 'ready';
  if (executable > 0) return 'partial';
  return blocked > 0 ? 'blocked' : 'approval_required';
}

function packStatusWeight(status: RecommendedToolPackStatus): number {
  return { ready: 0, partial: 1, approval_required: 2, blocked: 3 }[status];
}

function gates(
  counts: ToolEcosystemWorkbenchReport['counts'],
  doctor: ToolboxDoctorReport,
  coverage: EcosystemCoverageReport,
  runtimeActivation: RuntimeActivationPlanReport,
  executionNode: LocalExecutionNodeReport,
): ToolEcosystemGate[] {
  return [
    gate('tool_gateway_only', 'Tool Gateway only', 'pass', 'All executable capability is represented as high-level Tool Gateway routes or scanner templates.'),
    gate(
      'scope_risk_approval',
      'Scope, risk, approval gates',
      'pass',
      'Tool preview and invocation preserve scope policy, risk tiers, approval binding, rate limits, audit, redaction, and evidence rules.',
    ),
    gate(
      'runtime_readiness',
      'Runtime readiness',
      counts.runnableTemplates > 0 ? 'pass' : 'fail',
      `${counts.runnableTemplates}/${counts.scannerTemplates} scanner template(s) are runnable; ${runtimeActivation.counts.blockedSteps} activation step(s) blocked.`,
    ),
    gate(
      'connector_mapping',
      'Connector mapping',
      counts.connectorTools === 0 ? 'warn' : counts.unmappedConnectorTools > 0 ? 'warn' : 'pass',
      `${counts.mappedConnectorTools}/${counts.connectorTools} connector tool name(s) mapped; average coverage ${coverage.counts.averageConnectorCoverage}%.`,
    ),
    gate(
      'external_fail_closed',
      'External execution fail-closed',
      executionNode.policy.externalExecutionEnabled ? 'warn' : 'pass',
      executionNode.policy.externalExecutionEnabled
        ? `${executionNode.policy.allowedExternalTemplateCount} external template(s) are allowlisted on this local runner.`
        : 'External toolbox execution is disabled by default.',
    ),
    gate(
      'evidence_output',
      'Evidence output',
      counts.toolInvocations === 0 || counts.evidenceProducingInvocations > 0 ? 'pass' : 'warn',
      `${counts.evidenceProducingInvocations}/${counts.toolInvocations} invocation(s) have evidence references.`,
    ),
    gate(
      'adapter_blockers',
      'Adapter blockers',
      doctor.counts.policyBlocked + doctor.counts.profileBlocked === 0 ? 'pass' : 'warn',
      `${doctor.counts.policyBlocked} policy-blocked and ${doctor.counts.profileBlocked} profile-blocked adapter(s).`,
    ),
  ];
}

function gate(id: string, title: string, status: ToolEcosystemGate['status'], detail: string): ToolEcosystemGate {
  return { id, title, status, detail };
}

function operatorNextActions(
  counts: ToolEcosystemWorkbenchReport['counts'],
  coverage: EcosystemCoverageReport,
  backlog: ToolIntegrationBacklogReport,
  runtimeActivation: RuntimeActivationPlanReport,
  executionNode: LocalExecutionNodeReport,
  packPlans: ToolPackPlan[],
): string[] {
  const actions: string[] = [];
  if (counts.enabledConnectors === 0 && counts.connectors > 0) {
    actions.push('Enable relevant connector metadata for this run so Workers see governed ecosystem context.');
  }
  if (counts.enabledToolboxBundles === 0 && counts.toolboxBundles > 0) {
    actions.push('Enable relevant Toolbox Bundles as run context before promising broad tool coverage.');
  }
  const readyPack = packPlans.find((plan) => plan.summary.executable > 0);
  if (readyPack) {
    actions.push(`Preview or run ${readyPack.pack.name} when the operator wants a bounded evidence collection pass.`);
  }
  if (runtimeActivation.counts.operatorActions > 0) {
    actions.push(runtimeActivation.recommendedOrder[0] ?? 'Resolve runtime activation operator actions before external execution.');
  }
  if (coverage.gaps.length > 0) {
    actions.push(`Map ${coverage.gaps[0].toolName} into ${coverage.gaps[0].proposedTarget} before exposing that ecosystem capability.`);
  }
  if (backlog.items.length > 0) {
    actions.push(backlog.nextActions[0]);
  }
  if (counts.toolInvocations > 0 && counts.evidenceProducingInvocations === 0) {
    actions.push('Inspect blocked tool invocations and approval-required actions before creating Findings.');
  }
  if (executionNode.counts.healthyWorkers === 0) {
    actions.push('Fix Worker runtime health before increasing autonomous concurrency.');
  }
  actions.push('Keep using Tool Gateway previews for operator-visible decisions before invoking packs, templates, or connector-backed mappings.');
  return [...new Set(actions.filter(Boolean))].slice(0, 8);
}

function executionLoopGaps(
  counts: ToolEcosystemWorkbenchReport['counts'],
  invocations: ToolInvocation[],
  findings: Finding[],
): string[] {
  const gaps: string[] = [];
  if (invocations.length === 0) {
    gaps.push('No Tool Gateway invocation has been attempted for this run.');
  }
  if (counts.blockedInvocations > 0) {
    gaps.push(`${counts.blockedInvocations} invocation(s) are blocked; review reasons before retrying.`);
  }
  if (counts.approvalRequiredInvocations > 0) {
    gaps.push(`${counts.approvalRequiredInvocations} invocation(s) require approval.`);
  }
  const findingsWithoutEvidence = findings.filter((finding) => finding.evidenceIds.length === 0);
  if (findingsWithoutEvidence.length > 0) {
    gaps.push(`${findingsWithoutEvidence.length} finding(s) lack evidence references.`);
  }
  return gaps;
}
