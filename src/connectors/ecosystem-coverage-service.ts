import { nowIso } from '../domain/ids.js';
import type { ConnectorKind, ConnectorStatus } from '../domain/types.js';
import { capabilityMatrix, listScannerTemplates } from '../tools/toolbox-registry.js';
import { listToolPacks } from '../tools/tool-pack-service.js';
import type { ToolboxRunner } from '../tools/toolbox-runner.js';
import type { ConnectorRegistryService, ConnectorView, RunConnectorView } from './connector-registry-service.js';

export type EcosystemGapTarget = 'scanner_template' | 'tool_pack' | 'domain_skill' | 'first_party_service' | 'manual_review';

export interface EcosystemCoverageConnectorCard {
  id: string;
  name: string;
  kind: ConnectorKind;
  status: ConnectorStatus;
  enabled: boolean;
  toolCount: number;
  mappedToolCount: number;
  unmappedToolCount: number;
  coveragePercent: number;
  highLevelTools: string[];
  templateIds: string[];
  toolPackIds: string[];
  unmappedToolNames: string[];
}

export interface EcosystemCoverageBundleCard {
  id: string;
  name: string;
  enabled: boolean;
  runtimeStatus: string;
  runnableTemplateCount: number;
  templateCount: number;
  blockedReasons: string[];
}

export interface EcosystemCoverageArea {
  area: string;
  name: string;
  status: string;
  highLevelTools: number;
  scannerTemplates: number;
  connectorTools: number;
  unmappedTools: number;
  gaps: string[];
}

export interface EcosystemCoverageGap {
  toolName: string;
  connectorIds: string[];
  occurrences: number;
  proposedTarget: EcosystemGapTarget;
  rationale: string;
}

export interface EcosystemCoverageReport {
  runId: string;
  generatedAt: string;
  mode: 'governed_tool_ecosystem_mapping';
  summary: string;
  counts: {
    connectors: number;
    enabledConnectors: number;
    connectorTools: number;
    mappedConnectorTools: number;
    unmappedConnectorTools: number;
    averageConnectorCoverage: number;
    toolboxBundles: number;
    enabledToolboxBundles: number;
    scannerTemplates: number;
    toolPacks: number;
    capabilityAreas: number;
    availableCapabilityAreas: number;
  };
  areas: EcosystemCoverageArea[];
  connectors: EcosystemCoverageConnectorCard[];
  bundles: EcosystemCoverageBundleCard[];
  gaps: EcosystemCoverageGap[];
  recommendedActions: string[];
  safetyNotes: string[];
}

export class EcosystemCoverageService {
  constructor(
    private readonly connectors: ConnectorRegistryService,
    private readonly toolbox: ToolboxRunner,
  ) {}

  async get(runId: string): Promise<EcosystemCoverageReport> {
    const [connectors, bundles] = await Promise.all([
      Promise.resolve(this.connectors.listForRun(runId)),
      this.toolbox.listForRun(runId),
    ]);
    const connectorCards = connectors.map(connectorCard);
    const bundleCards = bundles.map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      enabled: bundle.enabled,
      runtimeStatus: bundle.runtimeStatus,
      runnableTemplateCount: bundle.runnableTemplateCount,
      templateCount: bundle.templateCount,
      blockedReasons: bundle.blockedReasons,
    }));
    const capabilityAreas = capabilityMatrix();
    const gaps = ecosystemGaps(connectors);
    const mappedConnectorTools = connectorCards.reduce((total, card) => total + card.mappedToolCount, 0);
    const connectorTools = connectorCards.reduce((total, card) => total + card.toolCount, 0);
    const counts = {
      connectors: connectorCards.length,
      enabledConnectors: connectorCards.filter((card) => card.enabled).length,
      connectorTools,
      mappedConnectorTools,
      unmappedConnectorTools: connectorCards.reduce((total, card) => total + card.unmappedToolCount, 0),
      averageConnectorCoverage: connectorCards.length > 0
        ? Math.round(connectorCards.reduce((total, card) => total + card.coveragePercent, 0) / connectorCards.length)
        : 0,
      toolboxBundles: bundleCards.length,
      enabledToolboxBundles: bundleCards.filter((bundle) => bundle.enabled).length,
      scannerTemplates: listScannerTemplates().length,
      toolPacks: listToolPacks().length,
      capabilityAreas: capabilityAreas.length,
      availableCapabilityAreas: capabilityAreas.filter((area) => area.status === 'available' || area.status === 'partial').length,
    };
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'governed_tool_ecosystem_mapping',
      summary:
        `${counts.mappedConnectorTools}/${counts.connectorTools} connector tool name(s) map to governed capabilities. ` +
        `${counts.enabledConnectors}/${counts.connectors} connector(s) and ${counts.enabledToolboxBundles}/${counts.toolboxBundles} bundle(s) are enabled for this run.`,
      counts,
      areas: capabilityAreas.map((area) => areaCoverage(area, connectors, gaps)),
      connectors: connectorCards,
      bundles: bundleCards,
      gaps,
      recommendedActions: recommendedActions(counts, gaps, bundleCards),
      safetyNotes: [
        'Ecosystem Coverage is a read-only mapping view.',
        'Connector tool names are metadata, not executable tool grants.',
        'Unmapped tools must become governed scanner templates, Tool Packs, first-party services, or rigid Domain Skills before Workers can rely on them.',
        'Mapped tools still execute only through the Tool Gateway with scope, approval, audit, redaction, rate-limit, and evidence gates.',
      ],
    };
  }
}

function connectorCard(connector: RunConnectorView): EcosystemCoverageConnectorCard {
  const mapping = connector.capabilityMapping;
  return {
    id: connector.id,
    name: connector.name,
    kind: connector.kind,
    status: connector.status,
    enabled: connector.enabled,
    toolCount: connector.toolNames.length,
    mappedToolCount: mapping.mappedToolNames.length,
    unmappedToolCount: mapping.unmappedToolNames.length,
    coveragePercent: mapping.coveragePercent,
    highLevelTools: [...mapping.highLevelTools],
    templateIds: [...mapping.templateIds],
    toolPackIds: [...mapping.toolPackIds],
    unmappedToolNames: [...mapping.unmappedToolNames],
  };
}

function areaCoverage(
  area: ReturnType<typeof capabilityMatrix>[number],
  connectors: RunConnectorView[],
  gaps: EcosystemCoverageGap[],
): EcosystemCoverageArea {
  const areaTokens = areaTokensFor(area.area);
  const connectorTools = connectors.flatMap((connector) =>
    connector.toolNames.filter((tool) => areaTokens.some((token) => normalize(tool).includes(token))),
  );
  const unmapped = gaps.filter((gap) => areaTokens.some((token) => normalize(gap.toolName).includes(token)));
  return {
    area: area.area,
    name: area.name,
    status: area.status,
    highLevelTools: area.highLevelTools.length,
    scannerTemplates: area.scannerTemplates.length,
    connectorTools: connectorTools.length,
    unmappedTools: unmapped.length,
    gaps: [...area.gaps, ...unmapped.slice(0, 3).map((gap) => `Unmapped connector tool: ${gap.toolName}`)],
  };
}

function ecosystemGaps(connectors: ConnectorView[]): EcosystemCoverageGap[] {
  const grouped = new Map<string, Set<string>>();
  for (const connector of connectors) {
    for (const tool of connector.capabilityMapping.unmappedToolNames) {
      const normalized = normalize(tool);
      grouped.set(normalized, (grouped.get(normalized) ?? new Set()).add(connector.id));
    }
  }
  return [...grouped.entries()]
    .map(([toolName, connectorIds]) => {
      const proposed = proposedTarget(toolName);
      return {
        toolName,
        connectorIds: [...connectorIds].sort(),
        occurrences: connectorIds.size,
        proposedTarget: proposed,
        rationale: proposedRationale(toolName, proposed),
      };
    })
    .sort((left, right) => right.occurrences - left.occurrences || left.toolName.localeCompare(right.toolName));
}

function proposedTarget(toolName: string): EcosystemGapTarget {
  if (
    [
      'sqlmap',
      'nmap',
      'naabu',
      'httpx',
      'ffuf',
      'nuclei',
      'tlsx',
      'subfinder',
      'katana',
      'dnsx',
      'semgrep',
      'gitleaks',
      'trivy',
      'osvscanner',
      'syft',
      'grype',
    ].includes(toolName)
  ) {
    return 'scanner_template';
  }
  if (['recon', 'scanner', 'webrecon'].includes(toolName)) {
    return 'tool_pack';
  }
  if (['apktool', 'jadx', 'frida', 'mobfs', 'prowler', 'cloudsplaining', 'pmapper', 'bloodhound'].includes(toolName)) {
    return 'domain_skill';
  }
  if (
    [
      'programscopeimport',
      'reportexport',
      'reporting',
      'browser',
      'steampipe',
      'trace',
      'eval',
      'cost',
      'modelbakeoff',
      'taskscore',
    ].includes(toolName)
  ) {
    return 'first_party_service';
  }
  return 'manual_review';
}

function proposedRationale(toolName: string, target: EcosystemGapTarget): string {
  if (target === 'scanner_template') {
    return `${toolName} should be represented as one or more governed scanner templates with risk, timeout, profile, approval, and evidence policy.`;
  }
  if (target === 'tool_pack') {
    return `${toolName} is broad workflow language; map it into a Tool Pack composed of first-party high-level requests.`;
  }
  if (target === 'domain_skill') {
    return `${toolName} belongs in a rigid domain module with artifact requirements and lab constraints, not a generic pentest Skill.`;
  }
  if (target === 'first_party_service') {
    return `${toolName} should become a first-party service/API surface before it is exposed to Workers.`;
  }
  return `${toolName} needs operator review before it becomes platform capability.`;
}

function recommendedActions(
  counts: EcosystemCoverageReport['counts'],
  gaps: EcosystemCoverageGap[],
  bundles: EcosystemCoverageBundleCard[],
): string[] {
  const actions: string[] = [];
  if (counts.enabledConnectors === 0) {
    actions.push('Enable relevant connector metadata for this run so Workers can see governed external ecosystem context.');
  }
  if (counts.enabledToolboxBundles === 0) {
    actions.push('Enable relevant Toolbox Bundles as context before promising broader tool coverage.');
  }
  if (gaps.length > 0) {
    actions.push(`Prioritize mapping ${gaps[0].toolName} as ${gaps[0].proposedTarget}.`);
  }
  const unavailableBundles = bundles.filter((bundle) => bundle.enabled && bundle.runnableTemplateCount < bundle.templateCount);
  if (unavailableBundles.length > 0) {
    actions.push('Resolve runtime/profile/policy blockers for enabled bundles before running connector-backed templates.');
  }
  if (counts.averageConnectorCoverage < 60) {
    actions.push('Raise connector coverage by adding governed scanner templates or Tool Packs, not by exposing raw MCP/CLI tools.');
  }
  return actions.length > 0 ? actions : ['Connector and toolbox coverage is healthy; continue through Tool Gateway-backed execution paths.'];
}

function areaTokensFor(area: string): string[] {
  const tokens: Record<string, string[]> = {
    web: ['web', 'http', 'ffuf', 'nuclei', 'sqlmap', 'katana'],
    network: ['net', 'nmap', 'naabu', 'dns', 'dnsx', 'tlsx', 'subfinder'],
    auth: ['auth', 'credential', 'idor', 'access'],
    oast: ['oast', 'callback', 'canary'],
    sast: ['sast', 'semgrep', 'code', 'source', 'gitleaks', 'trivy', 'osv', 'syft', 'grype'],
    mobile: ['apk', 'android', 'frida', 'jadx', 'mob', 'mobfs'],
    cloud: ['cloud', 'iam', 'aws', 'azure', 'gcp', 'prowler', 'cloudsplaining', 'steampipe', 'pmapper'],
    identity: ['identity', 'ad', 'bloodhound', 'kerberos', 'pmapper'],
    platform: ['report', 'scope', 'browser', 'proxy', 'worker', 'trace', 'eval', 'cost', 'model', 'taskscore'],
  };
  return tokens[area] ?? [normalize(area)];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
