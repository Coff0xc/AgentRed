import { nowIso } from '../domain/ids.js';
import type { PlatformStore } from '../storage/store.js';
import type { AgentFrameworkService } from '../agents/agent-framework-service.js';
import type { EcosystemCoverageService } from '../connectors/ecosystem-coverage-service.js';
import type { ToolIntegrationBacklogService } from '../connectors/tool-integration-backlog-service.js';
import type { LocalExecutionNodeService } from '../execution/local-execution-node-service.js';
import type { DeliveryReadinessService } from './delivery-readiness-service.js';

export type ReferenceBenchmarkStatus = 'matched' | 'usable' | 'partial' | 'gap';

export interface ReferenceBenchmarkDimension {
  id: string;
  title: string;
  status: ReferenceBenchmarkStatus;
  score: number;
  referenceProjects: string[];
  ours: string;
  adopted: string[];
  gaps: string[];
  nextActions: string[];
}

export interface ReferenceProjectBenchmark {
  id: string;
  name: string;
  referenceRole: string;
  copiedPrinciples: string[];
  deliberatelyAvoided: string[];
  currentFit: ReferenceBenchmarkStatus;
  remainingGap: string;
}

export interface ReferenceBenchmarkReport {
  runId: string;
  generatedAt: string;
  mode: 'reference_project_benchmark';
  summary: string;
  counts: {
    referenceProjects: number;
    dimensions: number;
    matched: number;
    usable: number;
    partial: number;
    gaps: number;
    commercialBlockers: number;
  };
  dimensions: ReferenceBenchmarkDimension[];
  projects: ReferenceProjectBenchmark[];
  nextActions: string[];
  commercialNotes: string[];
}

export class ReferenceBenchmarkService {
  constructor(
    private readonly store: PlatformStore,
    private readonly agentFramework: AgentFrameworkService,
    private readonly executionNode: LocalExecutionNodeService,
    private readonly ecosystemCoverage: EcosystemCoverageService,
    private readonly toolIntegrationBacklog: ToolIntegrationBacklogService,
    private readonly deliveryReadiness: DeliveryReadinessService,
  ) {}

  async get(runId: string): Promise<ReferenceBenchmarkReport> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const [framework, executionNode, ecosystem, backlog] = await Promise.all([
      this.agentFramework.report(),
      this.executionNode.get(runId),
      this.ecosystemCoverage.get(runId),
      this.toolIntegrationBacklog.get(runId),
    ]);
    const delivery = this.deliveryReadiness.get(runId);
    const runSignals = runSignalCounts(this.store, runId);
    const dimensions = [
      stateSearchDimension(runSignals),
      workerFrameworkDimension(framework.counts.workerAdapters, run.workerPool.length, runSignals.workerTasks),
      governedToolingDimension(framework.counts.highLevelTools, framework.counts.scannerTemplates, executionNode.counts.runnableScannerTemplates),
      ecosystemBreadthDimension(ecosystem.counts.connectorTools, ecosystem.counts.mappedConnectorTools, backlog.counts.items),
      browserProxyDastDimension(runSignals, executionNode.counts.activeBrowserSessions, executionNode.counts.activeProxySessions),
      scannerEcosystemDimension(framework.counts.scannerTemplates, framework.counts.readyToolboxAdapters, executionNode.counts.runnableScannerTemplates, runSignals.domainImports),
      vulnerabilityLifecycleDimension(runSignals, delivery.status),
      agentRuntimeEvalDimension(run.workerPool.length, runSignals.workerTasks, runSignals.traceSpans, runSignals.evaluations),
      productionDataModelDimension(runSignals),
      localDesktopDimension(executionNode.status, executionNode.counts.activeBrowserSessions, executionNode.counts.activeProxySessions, executionNode.counts.activeOastSessions),
      evidenceDeliveryDimension(runSignals, delivery.status),
      domainSkillDimension(framework.counts.domainSkills, framework.counts.pocTemplates, runSignals.domainImports),
      observabilityDimension(runSignals.traceSpans, runSignals.evaluations, framework.counts.readyToolboxAdapters),
      commercialGuardrailDimension(runSignals.pendingApprovals, runSignals.blockedToolCalls, delivery.status),
    ];
    const projects = projectBenchmarks(dimensions);
    const counts = {
      referenceProjects: projects.length,
      dimensions: dimensions.length,
      matched: countStatus(dimensions, 'matched'),
      usable: countStatus(dimensions, 'usable'),
      partial: countStatus(dimensions, 'partial'),
      gaps: countStatus(dimensions, 'gap'),
      commercialBlockers: dimensions.filter((item) => item.status === 'gap' || item.gaps.some((gap) => /must|blocked|missing|no /i.test(gap))).length,
    };
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'reference_project_benchmark',
      summary:
        `${counts.matched + counts.usable}/${counts.dimensions} benchmark dimension(s) are commercially usable or better; ` +
        `${counts.partial} partial and ${counts.gaps} gap dimension(s) remain against the reference projects.`,
      counts,
      dimensions,
      projects,
      nextActions: nextActions(dimensions, backlog.counts.items),
      commercialNotes: [
        'Benchmark is a product readiness model, not a license or security endorsement of any reference project.',
        'External ecosystems are compared as capability inspiration; raw tools still need governed platform mappings before Worker use.',
        'The platform intentionally copies abstractions, UX patterns, and evaluation ideas, not generic pentest playbooks or unsafe tool exposure.',
      ],
    };
  }
}

function stateSearchDimension(signals: RunSignals): ReferenceBenchmarkDimension {
  const score = clamp(45 + Math.min(signals.facts, 5) * 5 + Math.min(signals.intents, 5) * 6 + (signals.evidence > 0 ? 15 : 0));
  return dimension({
    id: 'state_space_search',
    title: 'State-space search core',
    score,
    referenceProjects: ['Cairn'],
    ours: `${signals.facts} fact(s), ${signals.intents} intent(s), ${signals.evidence} evidence item(s), ${signals.findings} finding(s).`,
    adopted: ['Run -> Fact -> Intent -> Evidence -> Finding graph', 'Dispatcher-owned graph mutation', 'Worker output validation before state writes'],
    gaps: [
      ...(signals.intents === 0 ? ['No queued intent yet for this run.'] : []),
      ...(signals.evidence === 0 ? ['No evidence-backed search branch yet.'] : []),
    ],
    nextActions: ['Keep every new automation path attached to Intent, Evidence, and Finding records.'],
  });
}

function workerFrameworkDimension(adapters: number, configuredWorkers: number, workerTasks: number): ReferenceBenchmarkDimension {
  const score = clamp(35 + adapters * 8 + Math.min(configuredWorkers, 3) * 10 + Math.min(workerTasks, 3) * 8);
  return dimension({
    id: 'agent_worker_framework',
    title: 'Agent Worker framework',
    score,
    referenceProjects: ['Cairn', 'claude-code-best/claude-code', 'CAI', 'Apex', 'ai-engineering-from-scratch'],
    ours: `${adapters} adapter type(s), ${configuredWorkers} run Worker(s), ${workerTasks} executed Worker task(s).`,
    adopted: ['Agent Worker as minimum scheduling unit', 'Generic CLI adapter contract', 'No Worker-to-Worker protocol'],
    gaps: [
      ...(configuredWorkers === 0 ? ['No Worker configured for this run.'] : []),
      ...(workerTasks === 0 ? ['Worker quality has not been exercised in this run.'] : []),
    ],
    nextActions: ['Add more CLI runtimes through the same healthcheck, execute, timeout, and JSON-result contract.'],
  });
}

function governedToolingDimension(highLevelTools: number, templates: number, runnableTemplates: number): ReferenceBenchmarkDimension {
  const score = clamp(30 + Math.min(highLevelTools, 8) * 5 + Math.min(templates, 12) * 3 + Math.min(runnableTemplates, 6) * 5);
  return dimension({
    id: 'governed_tooling',
    title: 'Governed high-level tooling',
    score,
    referenceProjects: ['AutoRedTeam-Orchestrator', 'hexstrike-ai', 'CyberStrike'],
    ours: `${highLevelTools} high-level tool(s), ${templates} scanner template policy record(s), ${runnableTemplates} runnable template(s).`,
    adopted: ['Small high-level Tool Gateway surface', 'Scanner template policies', 'Fail-closed external execution'],
    gaps: [
      ...(runnableTemplates === 0 ? ['No runnable external scanner template on this local node.'] : []),
      ...(templates < 6 ? ['Scanner template catalogue is still narrower than tool-heavy orchestrators.'] : []),
    ],
    nextActions: ['Map high-value tools into scanner templates or Tool Packs instead of exposing raw tool lists to Workers.'],
  });
}

function ecosystemBreadthDimension(connectorTools: number, mappedTools: number, backlogItems: number): ReferenceBenchmarkDimension {
  const coverage = connectorTools > 0 ? Math.round((mappedTools / connectorTools) * 100) : 60;
  const score = clamp(coverage - Math.min(backlogItems, 10) * 3 + (connectorTools > 0 ? 20 : 0));
  return dimension({
    id: 'ecosystem_breadth',
    title: 'External ecosystem breadth',
    score,
    referenceProjects: ['hexstrike-ai', 'AutoRedTeam-Orchestrator', 'WonderSuite'],
    ours: `${mappedTools}/${connectorTools} connector tool(s) mapped; ${backlogItems} governed integration backlog item(s).`,
    adopted: ['Connector registry as metadata', 'Tool Integration Backlog for safe mapping', 'Capability matrix instead of raw RAG/tool dumps'],
    gaps: [
      ...(backlogItems > 0 ? `${backlogItems} integration item(s) still need mapping, runtime, or design work.` : []),
      ...(connectorTools === 0 ? ['No external ecosystem connector enabled for this run.'] : []),
    ],
    nextActions: ['Prioritize backlog items that become governed scanner templates, Tool Packs, or rigid Domain Skills.'],
  });
}

function browserProxyDastDimension(signals: RunSignals, browserSessions: number, proxySessions: number): ReferenceBenchmarkDimension {
  const score = clamp(
    20 +
      Math.min(browserSessions, 1) * 15 +
      Math.min(proxySessions, 1) * 15 +
      Math.min(signals.httpExchangeEvidence, 4) * 8 +
      Math.min(signals.browserSnapshots, 2) * 8 +
      Math.min(signals.captureImports, 2) * 6,
  );
  return dimension({
    id: 'browser_proxy_dast',
    title: 'Browser, proxy, and DAST workflow',
    score,
    referenceProjects: ['OWASP ZAP', 'Burp Suite', 'Playwright'],
    ours:
      `${browserSessions} browser session(s), ${proxySessions} proxy session(s), ` +
      `${signals.httpExchangeEvidence} HTTP exchange evidence item(s), ${signals.browserSnapshots} browser snapshot(s).`,
    adopted: ['Scope-gated HTTP capture', 'HAR import boundary', 'Proxy session records', 'Browser snapshot evidence'],
    gaps: [
      ...(browserSessions === 0 ? ['No active browser session in this run.'] : []),
      ...(proxySessions === 0 ? ['No active proxy capture session in this run.'] : []),
      'No true browser DOM/JavaScript automation, authenticated context manager, active spider, or TLS MITM local CA lifecycle yet.',
    ],
    nextActions: ['Promote browser/proxy capture into a Playwright-backed local runner with ZAP/Burp-style session and proxy controls.'],
  });
}

function scannerEcosystemDimension(
  scannerTemplates: number,
  readyAdapters: number,
  runnableTemplates: number,
  domainImports: number,
): ReferenceBenchmarkDimension {
  const score = clamp(25 + Math.min(scannerTemplates, 20) * 2 + Math.min(readyAdapters, 6) * 6 + Math.min(runnableTemplates, 8) * 5 + Math.min(domainImports, 4) * 5);
  return dimension({
    id: 'scanner_template_ecosystem',
    title: 'Scanner template ecosystem',
    score,
    referenceProjects: ['ProjectDiscovery Nuclei', 'Semgrep', 'Prowler', 'MobSF'],
    ours: `${scannerTemplates} scanner template(s), ${readyAdapters} ready adapter(s), ${runnableTemplates} runnable template(s), ${domainImports} domain import(s).`,
    adopted: ['Template registry', 'Runtime profile readiness', 'SARIF/mobile/cloud/identity artifact imports', 'Fail-closed external execution'],
    gaps: [
      ...(runnableTemplates === 0 ? ['No external scanner template is runnable on this local node.'] : []),
      'No mature result normalizers for Nuclei JSONL, Semgrep SARIF variants, Prowler outputs, or MobSF reports yet.',
    ],
    nextActions: ['Add one mature adapter at a time with a typed parser, evidence mapper, and focused fixture tests before broadening the template catalog.'],
  });
}

function vulnerabilityLifecycleDimension(signals: RunSignals, deliveryStatus: string): ReferenceBenchmarkDimension {
  const score = clamp(
    25 +
      Math.min(signals.findings, 5) * 6 +
      Math.min(signals.confirmedFindings, 4) * 10 +
      Math.min(signals.usefulEvidence, 5) * 5 +
      Math.min(signals.reportBundles, 2) * 10 +
      (deliveryStatus === 'ready' ? 10 : 0),
  );
  return dimension({
    id: 'vulnerability_lifecycle',
    title: 'Vulnerability lifecycle',
    score,
    referenceProjects: ['OWASP DefectDojo', 'Faraday', 'Dradis'],
    ours:
      `${signals.findings} finding(s), ${signals.confirmedFindings} confirmed, ` +
      `${signals.usefulEvidence} useful evidence review(s), ${signals.reportBundles} report/export bundle(s).`,
    adopted: ['Evidence-backed finding gate', 'Human validation state', 'Confirmed-only report default', 'Export bundle records'],
    gaps: [
      ...(signals.findings === 0 ? ['No finding lifecycle has started in this run.'] : []),
      'No mature deduplication, retest workflow, SLA tracking, customer engagement model, or editable report template library yet.',
    ],
    nextActions: ['Model Product/Engagement/Test/Finding-style lifecycle records before adding team reporting and retest workflows.'],
  });
}

function agentRuntimeEvalDimension(workers: number, workerTasks: number, traceSpans: number, evaluations: number): ReferenceBenchmarkDimension {
  const score = clamp(25 + Math.min(workers, 3) * 8 + Math.min(workerTasks, 5) * 8 + Math.min(traceSpans, 10) * 3 + Math.min(evaluations, 3) * 8);
  return dimension({
    id: 'agent_runtime_eval',
    title: 'Agent runtime and evaluation',
    score,
    referenceProjects: ['LangGraph', 'OpenAI Agents SDK', 'Microsoft PyRIT'],
    ours: `${workers} configured Worker(s), ${workerTasks} Worker task(s), ${traceSpans} trace span(s), ${evaluations} evaluation(s).`,
    adopted: ['Structured Worker envelope', 'Tool request validation', 'Trace and cost ledger', 'Run quality evaluation surface'],
    gaps: [
      ...(workerTasks === 0 ? ['No real Worker execution has been exercised in this run.'] : []),
      ...(evaluations === 0 ? ['No stored run evaluation yet.'] : []),
      'No durable resumable runtime, streaming trace UI, scorer library, prompt dataset, or automated regression benchmark suite yet.',
    ],
    nextActions: ['Build a small PyRIT-style scenario set and scorer loop around the existing Worker envelope before adding more autonomous behavior.'],
  });
}

function productionDataModelDimension(signals: RunSignals): ReferenceBenchmarkDimension {
  const score = clamp(30 + Math.min(signals.reportBundles, 2) * 5 + Math.min(signals.captureImports, 2) * 4 + Math.min(signals.domainImports, 4) * 4);
  return dimension({
    id: 'production_data_model',
    title: 'Production data model and collaboration',
    score,
    referenceProjects: ['OWASP DefectDojo', 'OWASP Dependency-Track', 'Faraday'],
    ours: `${signals.reportBundles} report/export bundle(s), ${signals.captureImports} capture import(s), ${signals.domainImports} domain import(s), SQLite JSON snapshot store.`,
    adopted: ['Local-first state snapshot', 'Hashable export bundles', 'Raw-local-only evidence boundary'],
    gaps: [
      'Storage is still a single SQLite JSON snapshot, not relational tables with migrations, indexes, retention, and concurrent write boundaries.',
      'No tenant, RBAC, SSO, project membership, cloud sync, or SBOM/component risk model yet.',
    ],
    nextActions: ['Split the snapshot store into explicit relational tables and migrations before introducing multi-user collaboration or cloud sync.'],
  });
}

function localDesktopDimension(
  nodeStatus: string,
  browserSessions: number,
  proxySessions: number,
  oastSessions: number,
): ReferenceBenchmarkDimension {
  const activeSessions = browserSessions + proxySessions + oastSessions;
  const score = clamp((nodeStatus === 'ready' ? 70 : nodeStatus === 'partial' ? 45 : 20) + Math.min(activeSessions, 3) * 10);
  return dimension({
    id: 'local_desktop_runner',
    title: 'Local desktop runner',
    score,
    referenceProjects: ['AIDA', 'CyberStrike', 'WonderSuite'],
    ours: `${nodeStatus} local node; ${browserSessions} browser, ${proxySessions} proxy, ${oastSessions} OAST active session(s).`,
    adopted: ['Local-first active testing surface', 'Browser/proxy/OAST evidence capture concepts', 'Operator-visible node gates'],
    gaps: [
      ...(activeSessions === 0 ? ['No active local browser, proxy, or OAST session in this run.'] : []),
      'Tauri shell, Rust daemon packaging, TLS MITM local CA management, and vault UI remain productization gaps.',
    ],
    nextActions: ['Turn Local Execution Node readiness into a desktop shell checklist and operator setup flow.'],
  });
}

function evidenceDeliveryDimension(signals: RunSignals, deliveryStatus: string): ReferenceBenchmarkDimension {
  const score = clamp(20 + Math.min(signals.evidence, 6) * 8 + Math.min(signals.usefulEvidence, 4) * 8 + signals.confirmedFindings * 12 + (signals.reportBundles > 0 ? 15 : 0));
  return dimension({
    id: 'evidence_delivery',
    title: 'Evidence-backed delivery',
    score,
    referenceProjects: ['AIDA', 'CyberStrike', 'pentest-agents'],
    ours: `${signals.evidence} evidence item(s), ${signals.usefulEvidence} useful review(s), ${signals.confirmedFindings} confirmed finding(s), delivery=${deliveryStatus}.`,
    adopted: ['Evidence cards', 'Finding evidence gate', 'Confirmed-only report handoff', 'Operator review loop'],
    gaps: [
      ...(signals.evidence === 0 ? ['No captured evidence yet.'] : []),
      ...(signals.findings > 0 && signals.confirmedFindings === 0 ? ['Findings exist but none are confirmed.'] : []),
      ...(signals.confirmedFindings > 0 && signals.reportBundles === 0 ? ['Confirmed findings have not been exported as a report bundle.'] : []),
    ],
    nextActions: ['Keep findings non-commercial until evidence is triaged and validation state is confirmed.'],
  });
}

function domainSkillDimension(domainSkills: number, pocTemplates: number, domainImports: number): ReferenceBenchmarkDimension {
  const score = clamp(25 + Math.min(domainSkills, 7) * 8 + Math.min(pocTemplates, 6) * 6 + Math.min(domainImports, 3) * 12);
  return dimension({
    id: 'rigid_domain_depth',
    title: 'Rigid domain modules',
    score,
    referenceProjects: ['Android-Pentesting-Skill', 'Cairn'],
    ours: `${domainSkills} domain skill(s), ${pocTemplates} PoC template(s), ${domainImports} domain import(s).`,
    adopted: ['Rigid Skill granularity for Android, SAST, cloud, identity, CTF, reporting', 'PoC/template knowledge instead of generic pentest RAG'],
    gaps: [
      ...(domainImports === 0 ? ['No domain artifact import used in this run yet.'] : []),
      ...(domainSkills < 6 ? ['Domain Skill coverage can still grow for AD, cloud, mobile, source, and reporting packs.'] : []),
    ],
    nextActions: ['Only add Skills where the artifact contract is rigid; keep generic methodology out of Worker context.'],
  });
}

function observabilityDimension(traceSpans: number, evaluations: number, readyToolboxAdapters: number): ReferenceBenchmarkDimension {
  const score = clamp(30 + Math.min(traceSpans, 10) * 4 + Math.min(evaluations, 2) * 12 + Math.min(readyToolboxAdapters, 6) * 4);
  return dimension({
    id: 'trace_cost_eval',
    title: 'Trace, cost, and evaluation',
    score,
    referenceProjects: ['CAI', 'Apex', 'ai-engineering-from-scratch'],
    ours: `${traceSpans} trace span(s), ${evaluations} evaluation(s), ${readyToolboxAdapters} ready toolbox adapter(s).`,
    adopted: ['Worker/tool trace spans', 'Cost ledger surface', 'Run scorecard and leaderboard', 'Evaluation gate'],
    gaps: [
      ...(traceSpans === 0 ? ['No trace spans in this run yet.'] : []),
      ...(evaluations === 0 ? ['No run evaluation has been recorded yet.'] : []),
    ],
    nextActions: ['Use trace, cost, timeout, and evidence contribution to drive Worker selection and commercial metrics.'],
  });
}

function commercialGuardrailDimension(pendingApprovals: number, blockedToolCalls: number, deliveryStatus: string): ReferenceBenchmarkDimension {
  const score = clamp(85 - pendingApprovals * 12 - Math.max(0, blockedToolCalls - 3) * 4 + (deliveryStatus === 'ready' ? 10 : 0));
  return dimension({
    id: 'commercial_guardrails',
    title: 'Commercial guardrails',
    score,
    referenceProjects: ['pentest-agents', 'AIDA', 'CyberStrike'],
    ours: `${pendingApprovals} pending approval(s), ${blockedToolCalls} blocked tool call(s), delivery=${deliveryStatus}.`,
    adopted: ['Scope policy', 'Risk tiers R0-R4', 'Approval gate', 'Audit trail', 'Redaction state', 'Report/export controls'],
    gaps: [
      ...(pendingApprovals > 0 ? ['Pending approvals must be decided before higher-risk work continues.'] : []),
      ...(deliveryStatus !== 'ready' ? ['Delivery readiness is not fully ready for customer-facing handoff.'] : []),
    ],
    nextActions: ['Keep R3 human-approved and R4 denied by default unless break-glass token plus approval gates pass; use blocked calls as backlog evidence.'],
  });
}

function dimension(input: Omit<ReferenceBenchmarkDimension, 'status'>): ReferenceBenchmarkDimension {
  return { ...input, status: statusFromScore(input.score), score: clamp(input.score) };
}

function statusFromScore(score: number): ReferenceBenchmarkStatus {
  if (score >= 82) return 'matched';
  if (score >= 62) return 'usable';
  if (score >= 35) return 'partial';
  return 'gap';
}

function projectBenchmarks(dimensions: ReferenceBenchmarkDimension[]): ReferenceProjectBenchmark[] {
  const byId = new Map(dimensions.map((item) => [item.id, item]));
  return [
    project({
      id: 'cairn',
      name: 'oritera/Cairn',
      referenceRole: 'State-space search and minimal worker abstraction.',
      copiedPrinciples: ['Graph-first reasoning', 'Dispatcher-owned state', 'Minimal skill surface'],
      deliberatelyAvoided: ['Hard-coded pentest phase tree', 'Worker role chatter'],
      currentFit: minStatus(byId.get('state_space_search'), byId.get('agent_worker_framework')),
      remainingGap: joinGaps(byId.get('state_space_search'), byId.get('agent_worker_framework')),
    }),
    project({
      id: 'hexstrike_autoredteam',
      name: 'hexstrike-ai / AutoRedTeam-Orchestrator',
      referenceRole: 'Broad tool ecosystem inspiration.',
      copiedPrinciples: ['Tool breadth as platform backlog', 'External engines behind governed templates'],
      deliberatelyAvoided: ['Dumping 100+ raw tools into model context', 'Letting Workers choose arbitrary commands'],
      currentFit: minStatus(byId.get('governed_tooling'), byId.get('ecosystem_breadth')),
      remainingGap: joinGaps(byId.get('governed_tooling'), byId.get('ecosystem_breadth')),
    }),
    project({
      id: 'zap_burp_playwright',
      name: 'OWASP ZAP / Burp Suite / Playwright',
      referenceRole: 'Mature browser, proxy, and DAST execution workflow.',
      copiedPrinciples: ['Proxy and browser sessions as first-class operator objects', 'Captured traffic becomes reviewable evidence'],
      deliberatelyAvoided: ['Implicit active scanning without run scope and approval gates'],
      currentFit: minStatus(byId.get('browser_proxy_dast'), byId.get('local_desktop_runner')),
      remainingGap: joinGaps(byId.get('browser_proxy_dast'), byId.get('local_desktop_runner')),
    }),
    project({
      id: 'nuclei_semgrep_prowler_mobsf',
      name: 'ProjectDiscovery Nuclei / Semgrep / Prowler / MobSF',
      referenceRole: 'Rule, scanner, cloud, and mobile adapter maturity.',
      copiedPrinciples: ['Template and profile metadata before execution', 'Domain artifacts normalized into evidence'],
      deliberatelyAvoided: ['Raw scanner output becoming findings without parser, evidence, and review gates'],
      currentFit: minStatus(byId.get('scanner_template_ecosystem'), byId.get('rigid_domain_depth')),
      remainingGap: joinGaps(byId.get('scanner_template_ecosystem'), byId.get('rigid_domain_depth')),
    }),
    project({
      id: 'aida_cyberstrike_wondersuite',
      name: 'AIDA / CyberStrike / WonderSuite',
      referenceRole: 'Local UX, evidence cards, browser/proxy workflow, and reporting.',
      copiedPrinciples: ['Local-first execution', 'Evidence review', 'Report handoff', 'Operator-visible progress'],
      deliberatelyAvoided: ['Selling bypass automation as the default business value'],
      currentFit: minStatus(byId.get('local_desktop_runner'), byId.get('evidence_delivery')),
      remainingGap: joinGaps(byId.get('local_desktop_runner'), byId.get('evidence_delivery')),
    }),
    project({
      id: 'cai_apex',
      name: 'CAI / Apex',
      referenceRole: 'Model abstraction, trace, cost, and evaluation ideas.',
      copiedPrinciples: ['Replaceable Worker adapters', 'Leaderboard and scorecards', 'Trace/cost observation'],
      deliberatelyAvoided: ['Multi-agent role trees as a product premise'],
      currentFit: minStatus(byId.get('agent_worker_framework'), byId.get('trace_cost_eval')),
      remainingGap: joinGaps(byId.get('agent_worker_framework'), byId.get('trace_cost_eval')),
    }),
    project({
      id: 'langgraph_openai_agents_pyrit',
      name: 'LangGraph / OpenAI Agents SDK / Microsoft PyRIT',
      referenceRole: 'Durable agent runtime, tool guardrails, tracing, and scenario evaluation.',
      copiedPrinciples: ['Structured tool calls', 'Human gates before sensitive actions', 'Trace and evaluation as product surfaces'],
      deliberatelyAvoided: ['Letting an Agent runtime become a bypass around platform policy'],
      currentFit: minStatus(byId.get('agent_runtime_eval'), byId.get('trace_cost_eval'), byId.get('commercial_guardrails')),
      remainingGap: joinGaps(byId.get('agent_runtime_eval'), byId.get('trace_cost_eval'), byId.get('commercial_guardrails')),
    }),
    project({
      id: 'defectdojo_faraday_dradis',
      name: 'OWASP DefectDojo / Faraday / Dradis',
      referenceRole: 'Vulnerability management, collaboration, retest, and customer reporting lifecycle.',
      copiedPrinciples: ['Findings need evidence and validation state', 'Reports are delivery artifacts, not raw logs'],
      deliberatelyAvoided: ['Treating every scanner observation as a customer-facing vulnerability'],
      currentFit: minStatus(byId.get('vulnerability_lifecycle'), byId.get('production_data_model')),
      remainingGap: joinGaps(byId.get('vulnerability_lifecycle'), byId.get('production_data_model')),
    }),
    project({
      id: 'ai_engineering_from_scratch',
      name: 'rohitg00/ai-engineering-from-scratch',
      referenceRole: 'Agent engineering curriculum and reusable workbench/harness artifacts.',
      copiedPrinciples: [
        'Agent loop as an inspectable engineering primitive',
        'Tool registry and schema validation as product infrastructure',
        'Verification gates, sandbox runner, eval harness, and observability as first-class surfaces',
      ],
      deliberatelyAvoided: ['Turning broad curriculum Skills into generic pentest methodology or Worker role trees'],
      currentFit: minStatus(byId.get('agent_worker_framework'), byId.get('trace_cost_eval'), byId.get('commercial_guardrails')),
      remainingGap: joinGaps(byId.get('agent_worker_framework'), byId.get('trace_cost_eval'), byId.get('commercial_guardrails')),
    }),
    project({
      id: 'dragonjar_android_skill',
      name: 'DragonJAR/Android-Pentesting-Skill',
      referenceRole: 'Narrow, artifact-driven Skill granularity.',
      copiedPrinciples: ['Rigid domain Skills', 'Tool/profile requirements', 'Explicit excluded use cases'],
      deliberatelyAvoided: ['Generic exploit-method or pentest-process Skills'],
      currentFit: byId.get('rigid_domain_depth')?.status ?? 'gap',
      remainingGap: joinGaps(byId.get('rigid_domain_depth')),
    }),
    project({
      id: 'pentest_agents',
      name: 'pentest-agents',
      referenceRole: 'Scope, submission, and report gates.',
      copiedPrinciples: ['Program scope import', 'Finding validation', 'Confirmed-only delivery'],
      deliberatelyAvoided: ['Skipping operator review before external submission'],
      currentFit: minStatus(byId.get('commercial_guardrails'), byId.get('evidence_delivery')),
      remainingGap: joinGaps(byId.get('commercial_guardrails'), byId.get('evidence_delivery')),
    }),
  ];
}

function project(input: ReferenceProjectBenchmark): ReferenceProjectBenchmark {
  return input;
}

function nextActions(dimensions: ReferenceBenchmarkDimension[], backlogItems: number): string[] {
  const weakest = [...dimensions].sort((left, right) => left.score - right.score).slice(0, 3);
  const actions = weakest.map((item) => `${item.title}: ${item.nextActions[0]}`);
  if (backlogItems > 0) {
    actions.unshift(`Convert the top Tool Integration Backlog item into a governed platform artifact before adding raw tools.`);
  }
  actions.push('Use this benchmark as the product roadmap gate: copied ideas must become first-party APIs, UI panels, policies, or evidence/report contracts.');
  return [...new Set(actions)].slice(0, 6);
}

function joinGaps(...items: Array<ReferenceBenchmarkDimension | undefined>): string {
  const gaps = items.flatMap((item) => item?.gaps ?? []).filter(Boolean);
  return gaps.length > 0 ? gaps.slice(0, 2).join(' | ') : 'No major gap visible in the current benchmark model.';
}

function minStatus(...items: Array<ReferenceBenchmarkDimension | undefined>): ReferenceBenchmarkStatus {
  const ordered: ReferenceBenchmarkStatus[] = ['gap', 'partial', 'usable', 'matched'];
  return items
    .map((item) => item?.status ?? 'gap')
    .sort((left, right) => ordered.indexOf(left) - ordered.indexOf(right))[0];
}

function countStatus(items: ReferenceBenchmarkDimension[], status: ReferenceBenchmarkStatus): number {
  return items.filter((item) => item.status === status).length;
}

interface RunSignals {
  facts: number;
  intents: number;
  evidence: number;
  httpExchangeEvidence: number;
  browserSnapshots: number;
  captureImports: number;
  usefulEvidence: number;
  findings: number;
  confirmedFindings: number;
  reportBundles: number;
  workerTasks: number;
  traceSpans: number;
  evaluations: number;
  pendingApprovals: number;
  blockedToolCalls: number;
  domainImports: number;
}

function runSignalCounts(store: PlatformStore, runId: string): RunSignals {
  const evidence = Object.values(store.state.evidence).filter((item) => item.runId === runId);
  const nonReportEvidence = evidence.filter((item) => item.kind !== 'replay_bundle');
  const usefulReviews = new Set(
    Object.values(store.state.evidenceReviews)
      .filter((item) => item.runId === runId && item.status === 'useful')
      .map((item) => item.evidenceId),
  );
  const findings = Object.values(store.state.findings).filter((item) => item.runId === runId);
  const traceSpans = Object.values(store.state.traceSpans).filter((item) => item.runId === runId);
  return {
    facts: Object.values(store.state.facts).filter((item) => item.runId === runId).length,
    intents: Object.values(store.state.intents).filter((item) => item.runId === runId).length,
    evidence: nonReportEvidence.length,
    httpExchangeEvidence: nonReportEvidence.filter((item) => item.kind === 'http_exchange').length,
    browserSnapshots: Object.values(store.state.browserSnapshots).filter((item) => item.runId === runId).length,
    captureImports: Object.values(store.state.captureImports).filter((item) => item.runId === runId).length,
    usefulEvidence: nonReportEvidence.filter((item) => usefulReviews.has(item.id)).length,
    findings: findings.length,
    confirmedFindings: findings.filter((item) => item.validationState === 'confirmed').length,
    reportBundles: evidence.filter((item) => item.kind === 'replay_bundle').length,
    workerTasks: traceSpans.filter((item) => item.kind === 'worker').length,
    traceSpans: traceSpans.length,
    evaluations: Object.values(store.state.evaluations).filter((item) => item.runId === runId).length,
    pendingApprovals: Object.values(store.state.approvals).filter((item) => item.runId === runId && item.status === 'pending').length,
    blockedToolCalls: Object.values(store.state.toolInvocations).filter((item) => item.runId === runId && item.status === 'blocked').length,
    domainImports: [
      ...Object.values(store.state.sarifImports).filter((item) => item.runId === runId),
      ...Object.values(store.state.androidManifestImports).filter((item) => item.runId === runId),
      ...Object.values(store.state.cloudIamImports).filter((item) => item.runId === runId),
      ...Object.values(store.state.identityGraphImports).filter((item) => item.runId === runId),
    ].length,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
