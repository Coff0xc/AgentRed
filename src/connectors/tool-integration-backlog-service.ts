import { nowIso } from '../domain/ids.js';
import { capabilityMatrix, listScannerTemplates, type CapabilityArea } from '../tools/toolbox-registry.js';
import type { EcosystemCoverageGap, EcosystemCoverageService, EcosystemGapTarget } from './ecosystem-coverage-service.js';

export type ToolIntegrationBacklogPriority = 'critical' | 'high' | 'medium' | 'low';
export type ToolIntegrationBacklogStatus = 'ready_to_map' | 'needs_runtime' | 'needs_design' | 'operator_review';
export type ToolIntegrationBacklogSource = 'connector_gap' | 'runtime_gap' | 'capability_gap';

export interface ToolIntegrationBacklogItem {
  id: string;
  source: ToolIntegrationBacklogSource;
  title: string;
  priority: ToolIntegrationBacklogPriority;
  status: ToolIntegrationBacklogStatus;
  target: EcosystemGapTarget | 'runtime_profile';
  toolNames: string[];
  connectorIds: string[];
  capabilityAreas: CapabilityArea[];
  proposedArtifact: {
    type: 'scanner_template' | 'tool_pack' | 'domain_skill' | 'first_party_service' | 'runtime_profile' | 'manual_review';
    id: string;
    name: string;
    ownerSurface: string;
  };
  suggestedRiskLevel: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
  evidenceKinds: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  rationale: string;
}

export interface ToolIntegrationBacklogReport {
  runId: string;
  generatedAt: string;
  mode: 'governed_tool_integration_backlog';
  summary: string;
  counts: {
    items: number;
    critical: number;
    high: number;
    scannerTemplateCandidates: number;
    toolPackCandidates: number;
    domainSkillCandidates: number;
    firstPartyServiceCandidates: number;
    runtimeProfileCandidates: number;
    manualReviewCandidates: number;
  };
  items: ToolIntegrationBacklogItem[];
  nextActions: string[];
  safetyNotes: string[];
}

export class ToolIntegrationBacklogService {
  constructor(private readonly ecosystemCoverage: EcosystemCoverageService) {}

  async get(runId: string): Promise<ToolIntegrationBacklogReport> {
    const coverage = await this.ecosystemCoverage.get(runId);
    const items = uniqueItems([
      ...coverage.gaps.map((gap) => connectorGapItem(gap)),
      ...runtimeGapItems(),
      ...capabilityGapItems(coverage.areas),
    ]).sort(itemSort);
    const counts = {
      items: items.length,
      critical: items.filter((item) => item.priority === 'critical').length,
      high: items.filter((item) => item.priority === 'high').length,
      scannerTemplateCandidates: items.filter((item) => item.proposedArtifact.type === 'scanner_template').length,
      toolPackCandidates: items.filter((item) => item.proposedArtifact.type === 'tool_pack').length,
      domainSkillCandidates: items.filter((item) => item.proposedArtifact.type === 'domain_skill').length,
      firstPartyServiceCandidates: items.filter((item) => item.proposedArtifact.type === 'first_party_service').length,
      runtimeProfileCandidates: items.filter((item) => item.proposedArtifact.type === 'runtime_profile').length,
      manualReviewCandidates: items.filter((item) => item.proposedArtifact.type === 'manual_review').length,
    };
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'governed_tool_integration_backlog',
      summary:
        `${counts.items} governed integration backlog item(s): ${counts.scannerTemplateCandidates} scanner template, ` +
        `${counts.toolPackCandidates} tool pack, ${counts.domainSkillCandidates} domain skill, ` +
        `${counts.runtimeProfileCandidates} runtime profile, ${counts.manualReviewCandidates} manual review.`,
      counts,
      items,
      nextActions: nextActions(items),
      safetyNotes: [
        'Backlog items are product planning records only; they do not register tools, execute commands, start connectors, or grant Worker permissions.',
        'Every proposed artifact must still become a first-party Tool Gateway route, scanner template, Tool Pack, runtime profile, or rigid Domain Skill before Worker use.',
        'External execution remains fail-closed behind scope policy, risk approval, toolbox profile readiness, template allowlists, audit, redaction, and evidence requirements.',
      ],
    };
  }
}

function connectorGapItem(gap: EcosystemCoverageGap): ToolIntegrationBacklogItem {
  const target = gap.proposedTarget;
  const tool = gap.toolName;
  const artifact = artifactFor(tool, target);
  return {
    id: `gap.${target}.${normalize(tool)}`,
    source: 'connector_gap',
    title: `Map ${tool} into governed ${artifact.type}`,
    priority: priorityForTool(tool, target, gap.occurrences),
    status: target === 'manual_review' ? 'operator_review' : 'ready_to_map',
    target,
    toolNames: [tool],
    connectorIds: gap.connectorIds,
    capabilityAreas: capabilityAreasForTool(tool),
    proposedArtifact: artifact,
    suggestedRiskLevel: riskForTarget(tool, target),
    evidenceKinds: evidenceForTarget(target),
    blockedBy: target === 'manual_review' ? ['No safe first-party mapping selected yet.'] : [],
    acceptanceCriteria: acceptanceFor(target),
    rationale: gap.rationale,
  };
}

function runtimeGapItems(): ToolIntegrationBacklogItem[] {
  const externalTemplates = listScannerTemplates().filter((template) => template.executionMode === 'external' && template.adapterStatus !== 'available');
  const grouped = new Map<string, typeof externalTemplates>();
  for (const template of externalTemplates) {
    grouped.set(template.profileId, [...(grouped.get(template.profileId) ?? []), template]);
  }
  return [...grouped.entries()].map(([profileId, templates]) => {
    const engines = [...new Set(templates.map((template) => template.engine))].sort();
    const areas = [...new Set(templates.map((template) => template.domain).filter((domain) => isCapabilityArea(domain)))] as CapabilityArea[];
    return {
      id: `runtime.${normalize(profileId)}`,
      source: 'runtime_gap',
      title: `Make ${profileId} runnable for ${engines.join(', ')}`,
      priority: engines.some((engine) => ['nuclei', 'httpx', 'ffuf', 'nmap'].includes(engine)) ? 'high' : 'medium',
      status: 'needs_runtime',
      target: 'runtime_profile',
      toolNames: engines,
      connectorIds: [],
      capabilityAreas: areas,
      proposedArtifact: {
        type: 'runtime_profile',
        id: profileId,
        name: `${profileId} runtime profile`,
        ownerSurface: 'Local Execution Node / Toolbox Runner',
      },
      suggestedRiskLevel: templates.some((template) => template.defaultRiskLevel === 'R3') ? 'R3' : 'R2',
      evidenceKinds: [...new Set(templates.map((template) => template.evidenceKind))].sort(),
      blockedBy: [
        'Runtime profile is not available.',
        'External toolbox execution and template allowlist must remain explicit.',
      ],
      acceptanceCriteria: [
        'Profile probe reports available only when the configured runtime is present.',
        'Template execution uses no-shell spawn, timeout kill, ephemeral tool-run directories, redacted evidence, and Tool Gateway audit.',
        'R3 templates require approval and R4 remains denied.',
      ],
      rationale: `${templates.length} external scanner template(s) depend on ${profileId}: ${templates.map((template) => template.id).join(', ')}.`,
    };
  });
}

function capabilityGapItems(areas: Array<{ area: string; status: string; gaps: string[]; unmappedTools: number }>): ToolIntegrationBacklogItem[] {
  return areas
    .filter((area) => area.status === 'planned' || area.unmappedTools > 0 || area.gaps.length > 0)
    .slice(0, 6)
    .map((area) => {
      const capabilityArea = isCapabilityArea(area.area) ? area.area : 'platform';
      return {
        id: `capability.${normalize(area.area)}`,
        source: 'capability_gap',
        title: `Close ${area.area} capability gap`,
        priority: area.status === 'planned' ? 'medium' : 'low',
        status: 'needs_design',
        target: 'manual_review',
        toolNames: [],
        connectorIds: [],
        capabilityAreas: [capabilityArea],
        proposedArtifact: {
          type: 'manual_review',
          id: `capability.${normalize(area.area)}`,
          name: `${area.area} capability design`,
          ownerSurface: 'Capability Matrix / Product Backlog',
        },
        suggestedRiskLevel: 'R1',
        evidenceKinds: [],
        blockedBy: area.gaps.slice(0, 3),
        acceptanceCriteria: [
          'Define whether the gap belongs to a scanner template, Tool Pack, first-party service, or rigid Domain Skill.',
          'Document risk level, evidence kind, approval behavior, runtime profile, and operator review path.',
        ],
        rationale: `${area.area} is ${area.status}; ${area.unmappedTools} unmapped tool(s), ${area.gaps.length} known gap note(s).`,
      };
    });
}

function artifactFor(tool: string, target: EcosystemGapTarget): ToolIntegrationBacklogItem['proposedArtifact'] {
  const normalized = normalize(tool);
  if (target === 'scanner_template') {
    return {
      type: 'scanner_template',
      id: `scanner.custom.${normalized}.safe`,
      name: `${tool} governed scanner template`,
      ownerSurface: 'Tool Gateway / Toolbox Runner',
    };
  }
  if (target === 'tool_pack') {
    return {
      type: 'tool_pack',
      id: `pack.custom.${normalized}.baseline`,
      name: `${tool} governed tool pack`,
      ownerSurface: 'Tool Pack Service',
    };
  }
  if (target === 'domain_skill') {
    return {
      type: 'domain_skill',
      id: `skill.custom.${normalized}`,
      name: `${tool} rigid domain skill`,
      ownerSurface: 'Domain Skill Registry',
    };
  }
  if (target === 'first_party_service') {
    return {
      type: 'first_party_service',
      id: `service.custom.${normalized}`,
      name: `${tool} first-party service`,
      ownerSurface: 'Platform API',
    };
  }
  return {
    type: 'manual_review',
    id: `review.${normalized}`,
    name: `${tool} mapping review`,
    ownerSurface: 'Operator Review',
  };
}

function priorityForTool(tool: string, target: EcosystemGapTarget, occurrences: number): ToolIntegrationBacklogPriority {
  const normalized = normalize(tool);
  if (occurrences > 1) return 'critical';
  if (target === 'scanner_template' && ['nuclei', 'httpx', 'ffuf', 'nmap', 'sqlmap', 'semgrep', 'gitleaks', 'trivy'].includes(normalized)) return 'high';
  if (target === 'domain_skill' && ['apktool', 'jadx', 'frida', 'mobfs', 'prowler', 'cloudsplaining', 'pmapper', 'bloodhound'].includes(normalized)) return 'high';
  if (target === 'first_party_service') return 'medium';
  return target === 'manual_review' ? 'low' : 'medium';
}

function riskForTarget(tool: string, target: EcosystemGapTarget): ToolIntegrationBacklogItem['suggestedRiskLevel'] {
  const normalized = normalize(tool);
  if (target === 'domain_skill') return normalized === 'frida' ? 'R3' : 'R1';
  if (target === 'scanner_template') return ['sqlmap', 'nmap', 'ffuf', 'naabu'].includes(normalized) ? 'R2' : 'R1';
  if (target === 'tool_pack') return 'R2';
  return 'R0';
}

function evidenceForTarget(target: EcosystemGapTarget): string[] {
  if (target === 'scanner_template') return ['command_output'];
  if (target === 'tool_pack') return ['command_output', 'http_exchange'];
  if (target === 'domain_skill') return ['command_output', 'file_hash'];
  if (target === 'first_party_service') return ['replay_bundle'];
  return [];
}

function acceptanceFor(target: EcosystemGapTarget): string[] {
  if (target === 'scanner_template') {
    return [
      'Template has explicit risk level, timeout, input policy, profile id, evidence policy, and approval behavior.',
      'Template is reachable only through scanner.run_template and Tool Gateway gates.',
    ];
  }
  if (target === 'tool_pack') {
    return [
      'Pack is composed only of existing high-level Tool Gateway requests.',
      'Plan path is read-only and invoke path records per-item statuses, evidence ids, approvals, and blockers.',
    ];
  }
  if (target === 'domain_skill') {
    return [
      'Skill is rigid-domain only and excludes generic pentest process guidance.',
      'Skill adds bounded Worker context and artifact requirements, not tool permissions.',
    ];
  }
  if (target === 'first_party_service') {
    return [
      'Service has API schema, redaction behavior, audit events, and no raw secret storage.',
      'Worker access remains indirect through Dispatcher context or Tool Gateway.',
    ];
  }
  return ['Operator chooses a safe platform artifact type before any execution path is added.'];
}

function capabilityAreasForTool(tool: string): CapabilityArea[] {
  const normalized = normalize(tool);
  return capabilityMatrix()
    .filter((area) => area.engines.map(normalize).includes(normalized) || area.gaps.some((gap) => normalize(gap).includes(normalized)))
    .map((area) => area.area);
}

function nextActions(items: ToolIntegrationBacklogItem[]): string[] {
  if (items.length === 0) {
    return ['No integration backlog items are currently visible; connector/toolbox coverage is mapped.'];
  }
  const first = items[0];
  const actions = [`Start with ${first.title}; proposed artifact ${first.proposedArtifact.id}.`];
  if (items.some((item) => item.source === 'runtime_gap')) {
    actions.push('Resolve runtime profile availability before promising external scanner execution.');
  }
  if (items.some((item) => item.proposedArtifact.type === 'domain_skill')) {
    actions.push('Keep mobile/cloud/identity/source work as rigid Domain Skills, not generic pentest playbooks.');
  }
  actions.push('Do not expose raw MCP, CLI, HTTP API, or container tools to Workers; map them into governed platform artifacts first.');
  return actions;
}

function uniqueItems(items: ToolIntegrationBacklogItem[]): ToolIntegrationBacklogItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function itemSort(left: ToolIntegrationBacklogItem, right: ToolIntegrationBacklogItem): number {
  return priorityWeight(right.priority) - priorityWeight(left.priority) || left.title.localeCompare(right.title);
}

function priorityWeight(priority: ToolIntegrationBacklogPriority): number {
  if (priority === 'critical') return 4;
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function isCapabilityArea(value: string): value is CapabilityArea {
  return capabilityMatrix().some((area) => area.area === value);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
