import type { WorkerType } from '../domain/types.js';
import type { ConnectorRegistryService } from '../connectors/connector-registry-service.js';
import type { PocTemplateService } from '../poc/poc-template-service.js';
import type { DomainSkillService } from '../skills/domain-skill-service.js';
import type { ToolGateway } from '../tools/tool-gateway.js';
import type { ToolboxDoctorService } from '../tools/toolbox-doctor-service.js';
import type { ToolPackService } from '../tools/tool-pack-service.js';
import type { ToolboxRunner } from '../tools/toolbox-runner.js';

export type FrameworkStatus = 'ready' | 'partial' | 'planned';

export interface AgentFrameworkWorkerAdapter {
  type: WorkerType;
  status: FrameworkStatus;
  runtime: string;
  contract: string[];
  stateAuthority: string;
  notes: string[];
}

export interface AgentFrameworkExtensionPoint {
  id: string;
  name: string;
  status: FrameworkStatus;
  purpose: string;
  implementedBy: string[];
  operatorControls: string[];
  workerExposure: string;
  executionAuthority: string;
}

export interface AgentFrameworkReport {
  generatedAt: string;
  summary: string;
  kernel: {
    schedulingUnit: string;
    orchestration: string;
    protocolVersion: string;
    stateModel: string[];
  };
  counts: {
    workerAdapters: number;
    highLevelTools: number;
    scannerTemplates: number;
    toolPacks: number;
    toolboxBundles: number;
    connectors: number;
    domainSkills: number;
    pocTemplates: number;
    capabilities: number;
    readyToolboxAdapters: number;
    runnableScannerTemplates: number;
  };
  workerAdapters: AgentFrameworkWorkerAdapter[];
  extensionPoints: AgentFrameworkExtensionPoint[];
  invariants: string[];
  operatorViews: string[];
  recommendedNextSteps: string[];
}

export class AgentFrameworkService {
  constructor(
    private readonly tools: ToolGateway,
    private readonly toolPacks: ToolPackService,
    private readonly toolbox: ToolboxRunner,
    private readonly toolboxDoctor: ToolboxDoctorService,
    private readonly connectors: ConnectorRegistryService,
    private readonly skills: DomainSkillService,
    private readonly pocs: PocTemplateService,
  ) {}

  async report(): Promise<AgentFrameworkReport> {
    const [bundles, doctor] = await Promise.all([this.toolbox.bundles(), this.toolboxDoctor.report()]);
    const toolCatalog = this.tools.catalog();
    const scannerTemplates = this.tools.scannerTemplatePolicies();
    const toolPacks = this.toolPacks.list();
    const connectors = this.connectors.list();
    const domainSkills = this.skills.list();
    const pocTemplates = this.pocs.list();
    const capabilities = this.tools.capabilities();
    const counts = {
      workerAdapters: WORKER_ADAPTERS.length,
      highLevelTools: toolCatalog.length,
      scannerTemplates: scannerTemplates.length,
      toolPacks: toolPacks.length,
      toolboxBundles: bundles.length,
      connectors: connectors.length,
      domainSkills: domainSkills.length,
      pocTemplates: pocTemplates.length,
      capabilities: capabilities.length,
      readyToolboxAdapters: doctor.counts.ready,
      runnableScannerTemplates: doctor.counts.runnableTemplates,
    };

    return {
      generatedAt: new Date().toISOString(),
      summary:
        `Agent Worker is the scheduling unit. ${counts.workerAdapters} adapter type(s), ` +
        `${counts.highLevelTools} governed high-level tool(s), ${counts.scannerTemplates} scanner template policy record(s), ` +
        `${counts.domainSkills} narrow domain skill(s), and ${counts.pocTemplates} PoC template(s) are exposed through first-party contracts.`,
      kernel: {
        schedulingUnit: 'Agent Worker',
        orchestration: 'Dispatcher-controlled state-space search; no worker-to-worker protocol.',
        protocolVersion: 'agent-worker.v1',
        stateModel: ['Run', 'Fact', 'Intent', 'Evidence', 'Finding'],
      },
      counts,
      workerAdapters: WORKER_ADAPTERS,
      extensionPoints: extensionPoints(counts),
      invariants: [
        'Dispatcher is the only component that turns Worker output into graph state.',
        'Workers can request governed high-level tools, but Tool Gateway is the only active execution path.',
        'Toolbox bundles, connectors, skills, and PoC templates are context and constraints, not permission grants.',
        'Findings must reference same-run evidence and stay candidate until human validation.',
        'Scope, risk, approval, rate-limit, audit, evidence, and redaction gates fail closed.',
        'The framework avoids generic pentest RAG and broad role trees; specialization is reserved for rigid domain modules.',
      ],
      operatorViews: [
        'Agent Workers',
        'Worker Envelope Preview',
        'Assessment Flow',
        'Autonomy Plan',
        'Attack Surface',
        'Toolbox Doctor',
        'Capability Matrix',
        'Domain Skill Readiness',
        'Delivery Readiness',
      ],
      recommendedNextSteps: [
        'Keep adding new runtimes as Worker adapters that implement the same healthcheck and structured-result contract.',
        'Map external ecosystems into scanner templates, Tool Packs, or Connector metadata instead of exposing raw commands.',
        'Use narrow Domain Skills only where the artifact or reporting contract is rigid.',
        'Promote useful evidence into findings through operator review, not Worker self-confirmation.',
      ],
    };
  }
}

const WORKER_ADAPTERS: AgentFrameworkWorkerAdapter[] = [
  {
    type: 'mock',
    status: 'ready',
    runtime: 'in-process deterministic worker',
    contract: ['healthcheck', 'execute task', 'return structured WorkerTaskResult'],
    stateAuthority: 'Dispatcher validates and writes graph state.',
    notes: ['Used for local smoke, demos, and deterministic framework checks.'],
  },
  {
    type: 'codex',
    status: 'ready',
    runtime: 'Codex CLI through the generic CLI adapter',
    contract: ['healthcheck command', 'agent-worker.v1 envelope', 'JSON result parsing', 'timeout handling'],
    stateAuthority: 'Dispatcher validates Codex output before graph mutation.',
    notes: ['Runtime health is checked per run by GET /runs/{id}/workers.'],
  },
  {
    type: 'claude',
    status: 'ready',
    runtime: 'Claude Code CLI through the generic CLI adapter',
    contract: ['healthcheck command', 'agent-worker.v1 envelope', 'JSON result parsing', 'timeout handling'],
    stateAuthority: 'Dispatcher validates Claude output before graph mutation.',
    notes: ['The platform does not depend on unofficial Claude distributions.'],
  },
  {
    type: 'gemini',
    status: 'partial',
    runtime: 'Gemini CLI through the generic CLI adapter',
    contract: ['healthcheck command', 'agent-worker.v1 envelope', 'JSON result parsing', 'timeout handling'],
    stateAuthority: 'Dispatcher validates Gemini output before graph mutation.',
    notes: ['Supported by the adapter contract; product presets can be added when local CLI conventions settle.'],
  },
  {
    type: 'kimi',
    status: 'partial',
    runtime: 'Kimi CLI through the generic CLI adapter',
    contract: ['healthcheck command', 'agent-worker.v1 envelope', 'JSON result parsing', 'timeout handling'],
    stateAuthority: 'Dispatcher validates Kimi output before graph mutation.',
    notes: ['Supported by the adapter contract; product presets can be added when local CLI conventions settle.'],
  },
];

function extensionPoints(counts: AgentFrameworkReport['counts']): AgentFrameworkExtensionPoint[] {
  return [
    {
      id: 'worker.adapter',
      name: 'Agent Worker Adapter',
      status: 'ready',
      purpose: 'Wrap model CLIs as replaceable workers with the same scheduling and result contract.',
      implementedBy: ['mock', 'codex', 'claude', 'gemini', 'kimi'],
      operatorControls: ['Worker Pool presets', 'custom workerPool JSON', 'GET /runs/{id}/workers'],
      workerExposure: 'Workers receive only the agent-worker.v1 envelope for their task.',
      executionAuthority: 'No direct graph writes; Dispatcher owns claims, conclusions, and validation.',
    },
    {
      id: 'tool.gateway',
      name: 'Governed Tool Gateway',
      status: 'ready',
      purpose: 'Expose a small high-level tool surface while hiding concrete engines behind policy gates.',
      implementedBy: [`${counts.highLevelTools} high-level tools`, `${counts.scannerTemplates} scanner template policies`],
      operatorControls: ['Tool Plan Preview', 'Scanner Template panel', 'Tool Packs panel', 'approval queue'],
      workerExposure: 'Workers may request high-level tools such as scanner.run_template or finding.propose.',
      executionAuthority: 'Tool Gateway owns scope, risk, approval, rate-limit, audit, redaction, and evidence writes.',
    },
    {
      id: 'domain.skill',
      name: 'Narrow Domain Skill',
      status: 'ready',
      purpose: 'Add rigid domain context for Android, SAST, cloud IAM, identity graph, bounty workspace, and reporting cases.',
      implementedBy: [`${counts.domainSkills} domain skills`],
      operatorControls: ['Domain Skills panel', 'Domain Skill Readiness panel', 'run-local enablement'],
      workerExposure: 'Enabled skills are summarized in the Worker envelope as constraints and hints.',
      executionAuthority: 'Skills do not grant tools, approvals, scope, or finding authority.',
    },
    {
      id: 'poc.template',
      name: 'PoC Template Library',
      status: 'ready',
      purpose: 'Represent vulnerability-specific evidence requirements without a generic pentest RAG layer.',
      implementedBy: [`${counts.pocTemplates} PoC templates`],
      operatorControls: ['PoC Library panel', 'run-local enablement'],
      workerExposure: 'Enabled templates add evidence requirements and safety notes to the Worker envelope.',
      executionAuthority: 'Templates do not inject payloads or approve risky actions.',
    },
    {
      id: 'toolbox.bundle',
      name: 'Toolbox Bundle',
      status: 'partial',
      purpose: 'Package built-in, container, SAST, and mobile tool ecosystems as manifests and readiness views.',
      implementedBy: [`${counts.toolboxBundles} bundles`, `${counts.readyToolboxAdapters} ready toolbox adapters`],
      operatorControls: ['Toolbox Bundles panel', 'Toolbox Doctor', 'Toolbox Policy'],
      workerExposure: 'Workers see governed bundle metadata and mapped templates, not raw commands.',
      executionAuthority: 'Bundles are metadata; Tool Gateway and Toolbox Runner decide actual execution.',
    },
    {
      id: 'connector.registry',
      name: 'Connector Registry',
      status: 'partial',
      purpose: 'Import external MCP, CLI, HTTP API, and container ecosystems as governed metadata.',
      implementedBy: [`${counts.connectors} connectors`],
      operatorControls: ['Connector Registry panel', 'Connector Plan/Run'],
      workerExposure: 'Workers see connector capability mappings and unmapped gaps.',
      executionAuthority: 'Connector invocation is converted to Tool Gateway requests; raw connector execution remains blocked.',
    },
  ];
}
