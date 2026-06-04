import { AutopilotService } from './autopilot/autopilot-service.js';
import { AgentFrameworkService } from './agents/agent-framework-service.js';
import { AgentHarnessService } from './agents/agent-harness-service.js';
import { AgentWorkbenchService } from './agents/agent-workbench-service.js';
import { AccessReviewService } from './access/access-review-service.js';
import { ApprovalService } from './approvals/approval-service.js';
import {
  BrowserSessionService,
  createPlaywrightRuntimeFromEnv,
  type BrowserAutomationRuntime,
} from './captures/browser-session-service.js';
import { ProxySessionService } from './captures/proxy-session-service.js';
import { CloudIamImportService } from './cloud/cloud-iam-import-service.js';
import { ConnectorRunService } from './connectors/connector-run-service.js';
import { ConnectorRegistryService } from './connectors/connector-registry-service.js';
import { EcosystemCoverageService } from './connectors/ecosystem-coverage-service.js';
import { ToolIntegrationBacklogService } from './connectors/tool-integration-backlog-service.js';
import { CredentialReferenceService } from './credentials/credential-reference-service.js';
import { DesktopRunnerReadinessService } from './desktop/desktop-runner-readiness-service.js';
import { LocalRunnerWorkbenchService } from './desktop/local-runner-workbench-service.js';
import { Dispatcher } from './dispatcher/dispatcher.js';
import { RunEventService } from './events/run-event-service.js';
import { EvidenceEngine } from './evidence/evidence-engine.js';
import { EvidenceReviewService } from './evidence/evidence-review-service.js';
import { LocalExecutionNodeService } from './execution/local-execution-node-service.js';
import { FindingService } from './findings/finding-service.js';
import { RunFlowService } from './flow/run-flow-service.js';
import { GraphServer } from './graph/graph-server.js';
import { IdentityGraphImportService } from './identity/identity-graph-import-service.js';
import { AndroidManifestImportService } from './mobile/android-manifest-import-service.js';
import { AssessmentMissionControlService } from './mission/assessment-mission-control-service.js';
import { OastService } from './oast/oast-service.js';
import { DeliveryReadinessService } from './observability/delivery-readiness-service.js';
import { EnterprisePentestScorerService } from './observability/enterprise-pentest-scorer-service.js';
import { EvidenceQualityService } from './observability/evidence-quality-service.js';
import { ObservabilityService } from './observability/observability-service.js';
import { ReferenceBenchmarkService } from './observability/reference-benchmark-service.js';
import { RunCapabilityRadarService } from './observability/run-capability-radar-service.js';
import { WorkerLeaderboardService } from './observability/worker-leaderboard-service.js';
import { WorkerEvaluationPlanService } from './observability/worker-evaluation-plan-service.js';
import { VulnerabilityLifecycleService } from './observability/vulnerability-lifecycle-service.js';
import { PocTemplateService } from './poc/poc-template-service.js';
import { RunScorecardService } from './observability/run-scorecard-service.js';
import { RunExportService } from './reports/run-export-service.js';
import { ReportService } from './reports/report-service.js';
import { EvidenceReplayService } from './replay/evidence-replay-service.js';
import { RunSupervisorService } from './runtime/run-supervisor-service.js';
import { RuntimeOperationsWorkbenchService } from './runtime/runtime-operations-workbench-service.js';
import { SarifImportService } from './sast/sarif-import-service.js';
import { ScannerResultImportService } from './scanners/scanner-result-import-service.js';
import { WorkerSelectionPolicyService } from './scheduling/worker-selection-policy-service.js';
import { DomainSkillReadinessService } from './skills/domain-skill-readiness-service.js';
import { DomainSkillService } from './skills/domain-skill-service.js';
import { InMemoryPlatformStore, SqlitePlatformStore, type PlatformStore } from './storage/store.js';
import { SearchPlanService } from './strategy/search-plan-service.js';
import { StrategyService } from './strategy/strategy-service.js';
import { AttackSurfaceService } from './surface/attack-surface-service.js';
import { ToolGateway } from './tools/tool-gateway.js';
import { RuntimeActivationPlanService } from './tools/runtime-activation-plan-service.js';
import { ToolEcosystemWorkbenchService } from './tools/tool-ecosystem-workbench-service.js';
import { ToolboxDoctorService } from './tools/toolbox-doctor-service.js';
import { ToolPackService } from './tools/tool-pack-service.js';
import { ToolboxRunner } from './tools/toolbox-runner.js';
import { WorkerRuntimeService } from './workers/worker-runtime-service.js';

export interface Platform {
  store: PlatformStore;
  events: RunEventService;
  executionNode: LocalExecutionNodeService;
  desktopReadiness: DesktopRunnerReadinessService;
  localRunnerWorkbench: LocalRunnerWorkbenchService;
  graph: GraphServer;
  approvals: ApprovalService;
  browserSessions: BrowserSessionService;
  proxySessions: ProxySessionService;
  oast: OastService;
  credentials: CredentialReferenceService;
  accessReviews: AccessReviewService;
  androidManifests: AndroidManifestImportService;
  cloudIam: CloudIamImportService;
  identityGraphs: IdentityGraphImportService;
  tools: ToolGateway;
  toolPacks: ToolPackService;
  toolEcosystemWorkbench: ToolEcosystemWorkbenchService;
  toolbox: ToolboxRunner;
  toolboxDoctor: ToolboxDoctorService;
  runtimeActivation: RuntimeActivationPlanService;
  connectors: ConnectorRegistryService;
  ecosystemCoverage: EcosystemCoverageService;
  toolIntegrationBacklog: ToolIntegrationBacklogService;
  connectorRuns: ConnectorRunService;
  skills: DomainSkillService;
  skillReadiness: DomainSkillReadinessService;
  pocs: PocTemplateService;
  evidence: EvidenceEngine;
  evidenceReviews: EvidenceReviewService;
  findings: FindingService;
  flow: RunFlowService;
  observability: ObservabilityService;
  capabilityRadar: RunCapabilityRadarService;
  workerLeaderboard: WorkerLeaderboardService;
  workerEvaluationPlan: WorkerEvaluationPlanService;
  scorecards: RunScorecardService;
  evidenceQuality: EvidenceQualityService;
  deliveryReadiness: DeliveryReadinessService;
  enterprisePentestScorer: EnterprisePentestScorerService;
  vulnerabilityLifecycle: VulnerabilityLifecycleService;
  referenceBenchmark: ReferenceBenchmarkService;
  missionControl: AssessmentMissionControlService;
  supervisor: RunSupervisorService;
  runtimeOperationsWorkbench: RuntimeOperationsWorkbenchService;
  dispatcher: Dispatcher;
  autopilot: AutopilotService;
  reports: ReportService;
  runExports: RunExportService;
  replay: EvidenceReplayService;
  sarif: SarifImportService;
  scannerResults: ScannerResultImportService;
  workerRuntimes: WorkerRuntimeService;
  workerSelection: WorkerSelectionPolicyService;
  strategy: StrategyService;
  searchPlan: SearchPlanService;
  surface: AttackSurfaceService;
  agentFramework: AgentFrameworkService;
  agentHarness: AgentHarnessService;
  agentWorkbench: AgentWorkbenchService;
}

export interface CreatePlatformOptions {
  databasePath?: string;
  browserRuntime?: BrowserAutomationRuntime;
}

export function createPlatform(options: CreatePlatformOptions = {}): Platform {
  const store = options.databasePath ? new SqlitePlatformStore(options.databasePath) : new InMemoryPlatformStore();
  const events = new RunEventService(store);
  const graph = new GraphServer(store, events);
  const approvals = new ApprovalService(store, events);
  const observability = new ObservabilityService(store);
  const capabilityRadar = new RunCapabilityRadarService(store);
  const workerLeaderboard = new WorkerLeaderboardService(store);
  const workerEvaluationPlan = new WorkerEvaluationPlanService(store);
  const scorecards = new RunScorecardService(store);
  const evidenceQuality = new EvidenceQualityService(store);
  const deliveryReadiness = new DeliveryReadinessService(store);
  const vulnerabilityLifecycle = new VulnerabilityLifecycleService(store, evidenceQuality);
  const evidence = new EvidenceEngine(store, events);
  const replay = new EvidenceReplayService(store, evidence);
  const evidenceReviews = new EvidenceReviewService(store, events);
  const browserSessions = new BrowserSessionService(
    store,
    evidence,
    events,
    options.browserRuntime ?? createPlaywrightRuntimeFromEnv(),
  );
  const proxySessions = new ProxySessionService(store, events);
  const oast = new OastService(store, evidence, events);
  const credentials = new CredentialReferenceService(store, events);
  const findings = new FindingService(store, events);
  const sarif = new SarifImportService(store, evidence, findings, events);
  const scannerResults = new ScannerResultImportService(store, evidence, findings, events);
  const androidManifests = new AndroidManifestImportService(store, evidence, findings, events);
  const cloudIam = new CloudIamImportService(store, evidence, findings, events);
  const identityGraphs = new IdentityGraphImportService(store, evidence, findings, events);
  const accessReviews = new AccessReviewService(store, evidence, events);
  const toolbox = new ToolboxRunner(store, graph, events);
  const toolboxDoctor = new ToolboxDoctorService(toolbox);
  const runtimeActivation = new RuntimeActivationPlanService(store, toolbox, toolboxDoctor);
  const connectors = new ConnectorRegistryService(store, graph, events);
  const ecosystemCoverage = new EcosystemCoverageService(connectors, toolbox);
  const toolIntegrationBacklog = new ToolIntegrationBacklogService(ecosystemCoverage);
  const skills = new DomainSkillService(store, graph, events);
  const skillReadiness = new DomainSkillReadinessService(store, skills);
  const pocs = new PocTemplateService(store, graph, events);
  const tools = new ToolGateway(
    store,
    approvals,
    evidence,
    events,
    observability,
    toolbox,
    findings,
    browserSessions,
    credentials,
    accessReviews,
    oast,
    scannerResults,
  );
  const toolPacks = new ToolPackService(store, tools, events);
  const connectorRuns = new ConnectorRunService(store, connectors, tools, events);
  const workerSelection = new WorkerSelectionPolicyService(store);
  const dispatcher = new Dispatcher(graph, {
    events,
    observability,
    tools,
    skills,
    credentials,
    pocs,
    toolbox,
    connectors,
    workerSelection,
  });
  const strategy = new StrategyService(store, graph, skills, pocs);
  const enterprisePentestScorer = new EnterprisePentestScorerService(store, strategy);
  const surface = new AttackSurfaceService(store, graph, strategy, connectors);
  const searchPlan = new SearchPlanService(store, graph, strategy, surface, dispatcher, events);
  const agentFramework = new AgentFrameworkService(tools, toolPacks, toolbox, toolboxDoctor, connectors, skills, pocs);
  const agentHarness = new AgentHarnessService(store, tools, toolPacks, toolbox);
  const flow = new RunFlowService(store, graph, events);
  const agentWorkbench = new AgentWorkbenchService(store, graph, events, flow, strategy, surface);
  const workerRuntimes = new WorkerRuntimeService(store);
  const executionNode = new LocalExecutionNodeService(store, toolbox, toolboxDoctor, workerRuntimes);
  const toolEcosystemWorkbench = new ToolEcosystemWorkbenchService(
    store,
    tools,
    toolPacks,
    toolboxDoctor,
    ecosystemCoverage,
    toolIntegrationBacklog,
    runtimeActivation,
    executionNode,
  );
  const desktopReadiness = new DesktopRunnerReadinessService(store, executionNode);
  const localRunnerWorkbench = new LocalRunnerWorkbenchService(store, browserSessions, proxySessions, oast);
  const referenceBenchmark = new ReferenceBenchmarkService(
    store,
    agentFramework,
    executionNode,
    ecosystemCoverage,
    toolIntegrationBacklog,
    deliveryReadiness,
  );
  const missionControl = new AssessmentMissionControlService(
    store,
    events,
    flow,
    agentWorkbench,
    searchPlan,
    capabilityRadar,
    evidenceQuality,
    deliveryReadiness,
    toolEcosystemWorkbench,
    executionNode,
    localRunnerWorkbench,
    agentHarness,
    referenceBenchmark,
  );
  const runtimeOperationsWorkbench = new RuntimeOperationsWorkbenchService(
    store,
    events,
    executionNode,
    localRunnerWorkbench,
  );
  const supervisor = new RunSupervisorService(store, graph);
  return {
    store,
    events,
    executionNode,
    desktopReadiness,
    localRunnerWorkbench,
    graph,
    approvals,
    browserSessions,
    proxySessions,
    oast,
    credentials,
    accessReviews,
    androidManifests,
    cloudIam,
    identityGraphs,
    tools,
    toolPacks,
    toolEcosystemWorkbench,
    toolbox,
    toolboxDoctor,
    runtimeActivation,
    connectors,
    ecosystemCoverage,
    toolIntegrationBacklog,
    connectorRuns,
    skills,
    skillReadiness,
    pocs,
    evidence,
    evidenceReviews,
    findings,
    flow,
    observability,
    capabilityRadar,
    workerLeaderboard,
    workerEvaluationPlan,
    scorecards,
    evidenceQuality,
    deliveryReadiness,
    enterprisePentestScorer,
    vulnerabilityLifecycle,
    referenceBenchmark,
    missionControl,
    supervisor,
    runtimeOperationsWorkbench,
    dispatcher,
    autopilot: new AutopilotService(store, graph, strategy, dispatcher, events),
    reports: new ReportService(graph, findings, evidence, evidenceQuality, events, observability),
    runExports: new RunExportService(store, graph, findings, evidence, evidenceQuality, events),
    replay,
    sarif,
    scannerResults,
    workerRuntimes,
    workerSelection,
    strategy,
    searchPlan,
    surface,
    agentFramework,
    agentHarness,
    agentWorkbench,
  };
}
