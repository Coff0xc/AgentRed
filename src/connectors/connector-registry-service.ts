import { createHash } from 'node:crypto';

import { newId, nowIso } from '../domain/ids.js';
import type {
  ConnectorKind,
  ConnectorStatus,
  EvidenceKind,
  RegisteredConnector,
  RiskLevel,
  RunConnectorBinding,
} from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { PlatformStore } from '../storage/store.js';
import { listScannerTemplates, toolCatalog } from '../tools/toolbox-registry.js';
import { listToolPacks } from '../tools/tool-pack-service.js';

export type ConnectorSource = 'built_in' | 'local_manifest';

export interface ConnectorManifest {
  id: string;
  name: string;
  version: string;
  source: ConnectorSource;
  kind: ConnectorKind;
  status: ConnectorStatus;
  toolNames: string[];
  riskLevels: RiskLevel[];
  inputKinds: string[];
  evidenceKinds: EvidenceKind[];
  requiredEnv: string[];
  safetyNotes: string[];
  installationNotes: string[];
  commercialUseCases: string[];
  manifestSha256?: string;
  registeredBy?: string;
  registeredAt?: string;
}

export interface ConnectorCapabilityMapping {
  highLevelTools: string[];
  templateIds: string[];
  toolPackIds: string[];
  mappedToolNames: string[];
  unmappedToolNames: string[];
  coveragePercent: number;
  notes: string[];
}

export interface ConnectorView extends ConnectorManifest {
  capabilityMapping: ConnectorCapabilityMapping;
}

export interface RunConnectorView extends ConnectorView {
  enabled: boolean;
  binding?: RunConnectorBinding;
}

export interface WorkerConnectorContext {
  id: string;
  name: string;
  version: string;
  kind: ConnectorKind;
  status: ConnectorStatus;
  toolNames: string[];
  riskLevels: RiskLevel[];
  inputKinds: string[];
  evidenceKinds: EvidenceKind[];
  requiredEnv: string[];
  highLevelTools: string[];
  templateIds: string[];
  toolPackIds: string[];
  unmappedToolNames: string[];
  coveragePercent: number;
  safetyNotes: string[];
}

export interface RegisterConnectorInput {
  id: string;
  name: string;
  version: string;
  kind: ConnectorKind;
  status?: ConnectorStatus;
  toolNames: string[];
  riskLevels: RiskLevel[];
  inputKinds: string[];
  evidenceKinds: EvidenceKind[];
  requiredEnv: string[];
  safetyNotes: string[];
  installationNotes: string[];
  commercialUseCases: string[];
  registeredBy?: string;
}

const BUILT_IN_CONNECTORS: ConnectorManifest[] = [
  {
    id: 'connector.mcp.hexstrike-compatible',
    name: 'HexStrike-style MCP Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'mcp',
    status: 'planned',
    toolNames: ['nuclei', 'httpx', 'ffuf', 'sqlmap', 'nmap', 'tlsx', 'subfinder', 'katana'],
    riskLevels: ['R1', 'R2', 'R3'],
    inputKinds: ['target_url', 'domain', 'cidr', 'http_request_context'],
    evidenceKinds: ['command_output', 'http_exchange', 'screenshot'],
    requiredEnv: ['PLATFORM_CONNECTOR_HEXSTRIKE_MCP'],
    safetyNotes: [
      'Connector registration is capability metadata only; no MCP tool call bridge is enabled by this manifest.',
      'Workers must still request high-level Tool Gateway tools such as scanner.run_template or http.request.',
      'Exploit validation, OAST, and state-changing checks remain R3 and require approval.',
    ],
    installationNotes: ['Run a compatible MCP server locally, then map its tools into governed scanner templates before execution.'],
    commercialUseCases: ['Operator-visible migration path from broad offensive tool servers into governed platform capabilities.'],
  },
  {
    id: 'connector.mcp.autoredteam-orchestrator',
    name: 'AutoRedTeam-style MCP Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'mcp',
    status: 'planned',
    toolNames: ['recon', 'scanner', 'browser', 'reporting'],
    riskLevels: ['R1', 'R2', 'R3'],
    inputKinds: ['authorized_scope', 'target_url', 'program_goal'],
    evidenceKinds: ['command_output', 'http_exchange', 'replay_bundle'],
    requiredEnv: ['PLATFORM_CONNECTOR_AUTOREDTEAM_MCP'],
    safetyNotes: [
      'Connector context must not become a second dispatcher or multi-agent role tree.',
      'Only Dispatcher-owned graph writes and Tool Gateway-owned execution are allowed.',
    ],
    installationNotes: ['Register concrete connector capabilities as templates or tool packs before allowing any execution path.'],
    commercialUseCases: ['Import external red-team automation ecosystems as governed context while preserving platform audit gates.'],
  },
  {
    id: 'connector.cli.nuclei-pack',
    name: 'Nuclei CLI Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'cli',
    status: 'partial',
    toolNames: ['nuclei'],
    riskLevels: ['R2'],
    inputKinds: ['target_url', 'template_id', 'scope_policy'],
    evidenceKinds: ['command_output'],
    requiredEnv: ['PLATFORM_ALLOW_EXTERNAL_TOOLBOX', 'PLATFORM_ALLOWED_SCANNER_TEMPLATES'],
    safetyNotes: [
      'CLI presence alone does not make templates executable.',
      'Execution requires scanner template allowlisting, profile readiness, scope checks, rate limits, and evidence redaction.',
    ],
    installationNotes: ['Install nuclei locally or through the container toolbox profile and allowlist specific scanner templates.'],
    commercialUseCases: ['Safe template-based vulnerability verification for Bug Bounty and enterprise validation runs.'],
  },
  {
    id: 'connector.http.bugbounty-platforms',
    name: 'Bug Bounty Platform HTTP Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'http_api',
    status: 'planned',
    toolNames: ['program_scope_import', 'report_export'],
    riskLevels: ['R0'],
    inputKinds: ['program_scope_json', 'finding_report'],
    evidenceKinds: ['replay_bundle'],
    requiredEnv: ['PLATFORM_CONNECTOR_BOUNTY_TOKEN_REF'],
    safetyNotes: [
      'HTTP API connectors should use vault references only; raw tokens must not appear in manifests or Worker envelopes.',
      'Report submission remains an operator-reviewed delivery action, not automatic exfiltration.',
    ],
    installationNotes: ['Map platform tokens through credential references and keep raw API secrets outside local manifests.'],
    commercialUseCases: ['Program scope sync and reviewed report delivery for HackerOne, Bugcrowd, SRC, or private programs.'],
  },
  {
    id: 'connector.container.web-recon-toolbox',
    name: 'Container Web Recon Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'container',
    status: 'partial',
    toolNames: ['httpx', 'ffuf', 'nuclei', 'katana'],
    riskLevels: ['R1', 'R2'],
    inputKinds: ['target_url', 'domain', 'wordlist_ref'],
    evidenceKinds: ['command_output', 'http_exchange'],
    requiredEnv: ['PLATFORM_ENABLE_CONTAINER_TOOLBOX', 'PLATFORM_WEB_RECON_IMAGE'],
    safetyNotes: [
      'Container connector metadata does not start containers or grant network access.',
      'Tool Gateway builds scoped execution plans and runs processes in ephemeral local tool-run directories.',
    ],
    installationNotes: ['Provide a vetted container image and enable the corresponding toolbox profile probes.'],
    commercialUseCases: ['Repeatable enterprise web reconnaissance with auditable local execution.'],
  },
  {
    id: 'connector.container.network-recon-toolbox',
    name: 'Container Network Recon Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'container',
    status: 'partial',
    toolNames: ['nmap', 'tlsx', 'dnsx', 'subfinder', 'naabu'],
    riskLevels: ['R0', 'R1', 'R2'],
    inputKinds: ['domain', 'host', 'cidr', 'scope_policy'],
    evidenceKinds: ['command_output'],
    requiredEnv: ['PLATFORM_ENABLE_CONTAINER_TOOLBOX', 'PLATFORM_NETWORK_RECON_IMAGE'],
    safetyNotes: [
      'Network tooling is represented as metadata until mapped into scanner templates and runtime profiles.',
      'Port scanning and high-volume discovery must remain rate-limited and scope-bound.',
      'No raw packet capture or lateral-movement tooling is exposed to Workers.',
    ],
    installationNotes: ['Provide a vetted network-recon container image and enable container toolbox probes.'],
    commercialUseCases: ['Enterprise external attack-surface metadata collection with auditable local execution.'],
  },
  {
    id: 'connector.cli.sast-supply-chain-toolbox',
    name: 'SAST and Supply Chain CLI Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'cli',
    status: 'partial',
    toolNames: ['semgrep', 'gitleaks', 'trivy', 'osv-scanner', 'syft', 'grype'],
    riskLevels: ['R0', 'R1'],
    inputKinds: ['source_artifact', 'repository_path', 'sarif', 'sbom'],
    evidenceKinds: ['command_output', 'file_hash'],
    requiredEnv: ['PLATFORM_ENABLE_LOCAL_SAST'],
    safetyNotes: [
      'Source and dependency scanners operate on local artifacts only unless a connector-specific fetch path is explicitly designed.',
      'Secrets findings must be redacted and handled as local-only evidence until reviewed.',
      'Workers receive SARIF/SBOM summaries, not raw repository secrets or full source dumps.',
    ],
    installationNotes: ['Install selected SAST/SCA tools locally and map them into governed scanner templates or SARIF import paths.'],
    commercialUseCases: ['Commercial source review, supply-chain triage, and CI/SARIF handoff without generic RAG.'],
  },
  {
    id: 'connector.container.android-mobile-toolbox',
    name: 'Android Mobile Analysis Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'container',
    status: 'partial',
    toolNames: ['apktool', 'jadx', 'frida', 'mobfs'],
    riskLevels: ['R0', 'R1', 'R3'],
    inputKinds: ['apk_file', 'manifest_xml', 'mobile_package', 'device_session'],
    evidenceKinds: ['command_output', 'file_hash'],
    requiredEnv: ['PLATFORM_ENABLE_ANDROID_TOOLBOX'],
    safetyNotes: [
      'Android tooling belongs to a rigid domain Skill, not a generic pentest playbook.',
      'Dynamic Frida/device workflows are R3 and require explicit operator approval.',
      'APK contents and screenshots remain local evidence unless redacted for report export.',
    ],
    installationNotes: ['Provide Android tooling through local installs or a vetted container profile before enabling dynamic workflows.'],
    commercialUseCases: ['Android APK assessment, mobile bounty triage, and manifest/dynamic evidence review.'],
  },
  {
    id: 'connector.http.cloud-identity-audit',
    name: 'Cloud and Identity Audit Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'http_api',
    status: 'planned',
    toolNames: ['prowler', 'cloudsplaining', 'steampipe', 'pmapper', 'bloodhound'],
    riskLevels: ['R0', 'R1', 'R2'],
    inputKinds: ['iam_policy_json', 'cloud_inventory', 'identity_graph', 'vault_reference'],
    evidenceKinds: ['command_output', 'file_hash', 'replay_bundle'],
    requiredEnv: ['PLATFORM_CLOUD_AUDIT_TOKEN_REF'],
    safetyNotes: [
      'Cloud and identity connectors must use vault references only; raw credentials are never stored in manifests.',
      'Read-only audit imports should become first-party Cloud IAM or Identity Graph services before Worker use.',
      'Any live cloud/API access must preserve tenant audit and least-privilege run leases.',
    ],
    installationNotes: ['Map cloud/identity exports into Cloud IAM or Identity Graph imports before designing live API connectors.'],
    commercialUseCases: ['Enterprise cloud posture review, IAM risk triage, AD path review, and compliance evidence handoff.'],
  },
  {
    id: 'connector.framework.cai-apex-eval',
    name: 'CAI/Apex-style Evaluation Connector',
    version: '0.1.0',
    source: 'built_in',
    kind: 'http_api',
    status: 'planned',
    toolNames: ['trace', 'eval', 'cost', 'model_bakeoff', 'task_score'],
    riskLevels: ['R0'],
    inputKinds: ['trace_span', 'worker_result', 'cost_ledger', 'evaluation_fixture'],
    evidenceKinds: ['command_output'],
    requiredEnv: [],
    safetyNotes: [
      'Evaluation connectors cannot dispatch Workers or change scheduling policy by themselves.',
      'Model comparisons must be derived from platform traces, cost ledger, evidence links, and operator-reviewed outcomes.',
      'Worker self-reported scores are not trusted as authoritative quality signals.',
    ],
    installationNotes: ['Integrate external eval dashboards only after trace/cost/evidence schemas are stable.'],
    commercialUseCases: ['Model bakeoff, cost governance, Worker scoring, and enterprise AI assurance.'],
  },
];

export class ConnectorRegistryService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly events?: RunEventService,
  ) {}

  list(): ConnectorView[] {
    return this.connectorManifests().map(withCapabilityMapping);
  }

  get(connectorId: string): ConnectorView | undefined {
    return this.findConnector(connectorId);
  }

  registerConnector(input: RegisterConnectorInput): RegisteredConnector {
    if (BUILT_IN_CONNECTORS.some((connector) => connector.id === input.id)) {
      throw new Error(`Cannot replace built-in connector: ${input.id}`);
    }
    if (!input.id.startsWith('connector.custom.')) {
      throw new Error('Custom connector ids must start with connector.custom.');
    }
    const connector: RegisteredConnector = {
      id: input.id,
      name: input.name,
      version: input.version,
      source: 'local_manifest',
      kind: input.kind,
      status: input.status ?? 'planned',
      toolNames: unique(input.toolNames),
      riskLevels: unique(input.riskLevels),
      inputKinds: unique(input.inputKinds),
      evidenceKinds: unique(input.evidenceKinds),
      requiredEnv: unique(input.requiredEnv),
      safetyNotes: [...input.safetyNotes],
      installationNotes: [...input.installationNotes],
      commercialUseCases: [...input.commercialUseCases],
      manifestSha256: hashManifest(input),
      registeredBy: input.registeredBy ?? 'operator',
      registeredAt: nowIso(),
    };
    this.store.state.registeredConnectors[connector.id] = connector;
    this.store.commit();
    return connector;
  }

  listForRun(runId: string): RunConnectorView[] {
    this.graph.getRun(runId);
    const bindings = this.bindingsForRun(runId);
    return this.list().map((connector) => {
      const binding = bindings.find((item) => item.connectorId === connector.id);
      return { ...connector, enabled: Boolean(binding), binding };
    });
  }

  enable(runId: string, connectorId: string, enabledBy: RunConnectorBinding['enabledBy'] = 'operator'): {
    connector: ConnectorView;
    binding: RunConnectorBinding;
  } {
    this.graph.getRun(runId);
    const connector = this.findConnector(connectorId);
    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }
    const existing = this.bindingsForRun(runId).find((item) => item.connectorId === connectorId);
    if (existing) {
      return { connector, binding: existing };
    }
    const binding: RunConnectorBinding = {
      id: newId('run_connector'),
      runId,
      connectorId,
      enabledAt: nowIso(),
      enabledBy,
    };
    this.store.state.runConnectorBindings[binding.id] = binding;
    this.graph.addHint(runId, this.enabledHint(connector));
    this.events?.record({
      runId,
      type: 'connector.enabled',
      title: 'Connector enabled',
      detail: `${connector.name} (${connector.id})`,
      entityId: binding.id,
    });
    this.store.commit();
    return { connector, binding };
  }

  workerContext(runId: string): WorkerConnectorContext[] {
    return this.listForRun(runId)
      .filter((connector) => connector.enabled)
      .map((connector) => ({
        id: connector.id,
        name: connector.name,
        version: connector.version,
        kind: connector.kind,
        status: connector.status,
        toolNames: [...connector.toolNames],
        riskLevels: [...connector.riskLevels],
        inputKinds: [...connector.inputKinds],
        evidenceKinds: [...connector.evidenceKinds],
        requiredEnv: [...connector.requiredEnv],
        highLevelTools: [...connector.capabilityMapping.highLevelTools],
        templateIds: [...connector.capabilityMapping.templateIds],
        toolPackIds: [...connector.capabilityMapping.toolPackIds],
        unmappedToolNames: [...connector.capabilityMapping.unmappedToolNames],
        coveragePercent: connector.capabilityMapping.coveragePercent,
        safetyNotes: [...connector.safetyNotes],
      }));
  }

  workerHints(runId: string): string[] {
    return this.workerContext(runId).map(
      (connector) =>
        `[${connector.id}] Connector context enabled for ${connector.kind}. It is metadata only; do not call external MCP, CLI, HTTP API, or container tools directly. Request governed Tool Gateway tools instead.`,
    );
  }

  private connectorManifests(): ConnectorManifest[] {
    const registered = Object.values(this.store.state.registeredConnectors)
      .sort((left, right) => left.registeredAt.localeCompare(right.registeredAt))
      .map(registeredConnectorToManifest);
    return [...BUILT_IN_CONNECTORS, ...registered];
  }

  private findConnector(connectorId: string): ConnectorView | undefined {
    return this.list().find((connector) => connector.id === connectorId);
  }

  private bindingsForRun(runId: string): RunConnectorBinding[] {
    return Object.values(this.store.state.runConnectorBindings)
      .filter((binding) => binding.runId === runId)
      .sort((left, right) => left.enabledAt.localeCompare(right.enabledAt));
  }

  private enabledHint(connector: ConnectorView): string {
    return [
      `Connector enabled: ${connector.name} (${connector.id}).`,
      `Kind: ${connector.kind}.`,
      `Tools represented as metadata: ${connector.toolNames.join(', ')}.`,
      `Mapped templates: ${connector.capabilityMapping.templateIds.join(', ') || 'none'}.`,
      `Mapped tool packs: ${connector.capabilityMapping.toolPackIds.join(', ') || 'none'}.`,
      `Unmapped tools: ${connector.capabilityMapping.unmappedToolNames.join(', ') || 'none'}.`,
      `Risk levels: ${connector.riskLevels.join(', ')}.`,
      'Connector enablement is context only; execution still requires high-level Tool Gateway requests, scope policy, approval, audit, redaction, and evidence gates.',
    ].join(' ');
  }
}

function registeredConnectorToManifest(connector: RegisteredConnector): ConnectorManifest {
  return {
    id: connector.id,
    name: connector.name,
    version: connector.version,
    source: connector.source,
    kind: connector.kind,
    status: connector.status,
    toolNames: [...connector.toolNames],
    riskLevels: [...connector.riskLevels],
    inputKinds: [...connector.inputKinds],
    evidenceKinds: [...connector.evidenceKinds],
    requiredEnv: [...connector.requiredEnv],
    safetyNotes: [
      ...connector.safetyNotes,
      `Local manifest SHA-256: ${connector.manifestSha256}`,
      `Registered by ${connector.registeredBy} at ${connector.registeredAt}`,
    ],
    installationNotes: [...connector.installationNotes],
    commercialUseCases: [...connector.commercialUseCases],
    manifestSha256: connector.manifestSha256,
    registeredBy: connector.registeredBy,
    registeredAt: connector.registeredAt,
  };
}

function withCapabilityMapping(connector: ConnectorManifest): ConnectorView {
  return {
    ...connector,
    capabilityMapping: buildCapabilityMapping(connector),
  };
}

function buildCapabilityMapping(connector: ConnectorManifest): ConnectorCapabilityMapping {
  const normalizedTools = connector.toolNames.map(normalizeToolName);
  const templates = listScannerTemplates();
  const highLevelToolNames = toolCatalog().map((tool) => tool.name);
  const templateIds = templates
    .filter((template) => normalizedTools.some((tool) => templateMatchesTool(template.engine, template.id, tool)))
    .map((template) => template.id);
  const highLevelTools = highLevelToolNames.filter((tool) =>
    normalizedTools.some((connectorTool) => highLevelToolMatchesConnector(tool, connectorTool)),
  );
  if (templateIds.length > 0 && !highLevelTools.includes('scanner.run_template')) {
    highLevelTools.push('scanner.run_template');
  }
  const toolPackIds = listToolPacks()
    .filter((pack) => pack.requests.some((request) => templateIds.includes(String(request.args.template ?? ''))))
    .map((pack) => pack.id);
  const mappedToolNames = connector.toolNames.filter((tool) =>
    isToolMapped(tool, templateIds, highLevelTools, toolPackIds),
  );
  const unmappedToolNames = connector.toolNames.filter((tool) => !mappedToolNames.includes(tool));
  const total = connector.toolNames.length;
  const coveragePercent = total === 0 ? 0 : Math.round((mappedToolNames.length / total) * 100);
  return {
    highLevelTools: [...new Set(highLevelTools)].sort(),
    templateIds: [...new Set(templateIds)].sort(),
    toolPackIds: [...new Set(toolPackIds)].sort(),
    mappedToolNames: [...new Set(mappedToolNames)].sort(),
    unmappedToolNames: [...new Set(unmappedToolNames)].sort(),
    coveragePercent,
    notes: mappingNotes(connector, coveragePercent, unmappedToolNames),
  };
}

function templateMatchesTool(engine: string, templateId: string, toolName: string): boolean {
  if (normalizeToolName(engine) === toolName) {
    return true;
  }
  const aliases: Record<string, string[]> = {
    recon: ['web.technology_fingerprint', 'web.link_form_map', 'network.dns_records', 'network.tls_certificate'],
    scanner: ['web.security_headers', 'web.endpoint_discovery', 'web.nuclei.safe_templates'],
    browser: ['web.link_form_map'],
    katana: ['web.link_form_map'],
    subfinder: ['network.dns_records'],
    dnsx: ['network.dns_records'],
    reporting: [],
    reportexport: [],
    programscopeimport: [],
  };
  return aliases[toolName]?.includes(templateId) ?? false;
}

function highLevelToolMatchesConnector(highLevelTool: string, connectorTool: string): boolean {
  const aliases: Record<string, string[]> = {
    'http.request': ['http', 'httpx', 'browser', 'recon'],
    'browser.navigate': ['browser'],
    'scanner.run_template': [
      'scanner',
      'recon',
      'nuclei',
      'httpx',
      'ffuf',
      'sqlmap',
      'nmap',
      'tlsx',
      'semgrep',
      'apktool',
      'frida',
      'katana',
      'subfinder',
      'dnsx',
      'naabu',
      'gitleaks',
      'trivy',
      'osvscanner',
      'syft',
      'grype',
      'jadx',
      'mobfs',
      'prowler',
      'cloudsplaining',
      'steampipe',
      'pmapper',
      'bloodhound',
    ],
    'finding.propose': ['reporting'],
  };
  return aliases[highLevelTool]?.includes(connectorTool) ?? false;
}

function isToolMapped(toolName: string, templateIds: string[], highLevelTools: string[], toolPackIds: string[]): boolean {
  const tool = normalizeToolName(toolName);
  if (listScannerTemplates().some((template) => templateIds.includes(template.id) && normalizeToolName(template.engine) === tool)) {
    return true;
  }
  if (tool === 'recon' || tool === 'scanner') {
    return templateIds.length > 0 || toolPackIds.length > 0;
  }
  if (tool === 'browser') {
    return highLevelTools.includes('browser.navigate') || templateIds.includes('web.link_form_map');
  }
  if (tool === 'katana') {
    return templateIds.includes('web.link_form_map');
  }
  if (tool === 'subfinder' || tool === 'dnsx') {
    return templateIds.includes('network.dns_records');
  }
  if (tool === 'reporting') {
    return highLevelTools.includes('finding.propose');
  }
  return false;
}

function mappingNotes(
  connector: ConnectorManifest,
  coveragePercent: number,
  unmappedToolNames: string[],
): string[] {
  const notes = [
    'Mapped capabilities are suggestions for governed Tool Gateway requests, not connector execution grants.',
    'Unmapped tools should become scanner templates, tool packs, or first-party services before Workers can rely on them.',
  ];
  if (coveragePercent === 0) {
    notes.push('No tool names currently map to governed platform capabilities.');
  } else if (coveragePercent < 100) {
    notes.push(`Partial connector coverage: ${coveragePercent}% mapped, ${unmappedToolNames.length} tool(s) still unmapped.`);
  } else {
    notes.push('All declared tool names have a governed platform mapping.');
  }
  if (connector.kind === 'mcp') {
    notes.push('MCP metadata remains read-only until each tool is mapped into a first-party Tool Gateway route or scanner template.');
  }
  return notes;
}

function normalizeToolName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hashManifest(input: RegisterConnectorInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: input.id,
        name: input.name,
        version: input.version,
        kind: input.kind,
        status: input.status ?? 'planned',
        toolNames: unique(input.toolNames).sort(),
        riskLevels: unique(input.riskLevels).sort(),
        inputKinds: unique(input.inputKinds).sort(),
        evidenceKinds: unique(input.evidenceKinds).sort(),
        requiredEnv: unique(input.requiredEnv).sort(),
        safetyNotes: input.safetyNotes,
        installationNotes: input.installationNotes,
        commercialUseCases: input.commercialUseCases,
      }),
    )
    .digest('hex');
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
