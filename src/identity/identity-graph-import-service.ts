import { createHash } from 'node:crypto';

import { newId, nowIso } from '../domain/ids.js';
import type { IdentityGraphImport, IdentityGraphProvider, IdentityGraphRiskSignal, Severity } from '../domain/types.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { FindingService } from '../findings/finding-service.js';
import { redactText } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

export interface IdentityGraphImportInput {
  runId: string;
  source?: string;
  provider: IdentityGraphProvider;
  content: unknown;
  createFindings: boolean;
}

interface IdentityNode {
  id: string;
  name: string;
  type: string;
  highValue: boolean;
  properties: Record<string, unknown>;
}

interface IdentityEdge {
  source: string;
  target: string;
  type: string;
}

export class IdentityGraphImportService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly findings: FindingService,
    private readonly events?: RunEventService,
  ) {}

  list(runId: string): IdentityGraphImport[] {
    this.assertRun(runId);
    return Object.values(this.store.state.identityGraphImports)
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  import(input: IdentityGraphImportInput): {
    importRecord: IdentityGraphImport;
    evidenceId: string;
    findingIds: string[];
  } {
    const run = this.assertRun(input.runId);
    const source = safeText(input.source || 'identity-graph.json', 200);
    const raw = serialize(input.content);
    const parsed = parseJson(raw);
    const nodes = normalizeNodes(parsed);
    const edges = normalizeEdges(parsed);
    const risks = identityRisks(nodes, edges);
    const inputSha256 = createHash('sha256').update(raw).digest('hex');
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'identity.graph.import',
        source,
        provider: input.provider,
        inputSha256,
        summary: {
          nodes: nodes.length,
          edges: edges.length,
          highValueNodes: nodes.filter((node) => node.highValue).length,
          riskyEdges: risks.filter((risk) => risk.edgeType).length,
          risks: risks.length,
        },
        nodes: nodes.slice(0, 200).map((node) => ({
          id: node.id,
          name: node.name,
          type: node.type,
          highValue: node.highValue,
        })),
        nodeTruncated: nodes.length > 200,
        edges: edges.slice(0, 200),
        edgeTruncated: edges.length > 200,
        risks: risks.slice(0, 100),
        riskTruncated: risks.length > 100,
        importedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    const findingIds = input.createFindings
      ? risks.slice(0, 25).map((risk) =>
          this.findings.proposeFinding({
            runId: input.runId,
            title: risk.title,
            severity: risk.severity,
            confidence: 'needs_dynamic_confirmation',
            affectedAssets: [risk.target || risk.principal || source || run.target],
            evidenceIds: [evidence.id],
            reproSteps: [`Review identity graph risk ${risk.key} in imported evidence ${evidence.id}.`],
            impact: risk.reason,
            remediation: remediationFor(risk),
          }).id,
        )
      : [];
    const importRecord: IdentityGraphImport = {
      id: newId('identity_graph'),
      runId: input.runId,
      source,
      provider: input.provider,
      status: 'imported',
      evidenceId: evidence.id,
      inputSha256,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      highValueNodeCount: nodes.filter((node) => node.highValue).length,
      riskyEdgeCount: risks.filter((risk) => risk.edgeType).length,
      riskCount: risks.length,
      riskSignals: risks.slice(0, 50),
      importedFindings: findingIds.length,
      findingIds,
      createdAt: nowIso(),
    };
    this.store.state.identityGraphImports[importRecord.id] = importRecord;
    this.events?.record({
      runId: input.runId,
      type: 'identity.graph.imported',
      title: 'Identity graph imported',
      detail: `${importRecord.riskCount} risk signal(s), ${importRecord.importedFindings} candidate finding(s)`,
      entityId: importRecord.id,
      level: importRecord.riskCount > 0 ? 'warning' : 'info',
    });
    this.store.commit();
    return { importRecord, evidenceId: evidence.id, findingIds };
  }

  private assertRun(runId: string) {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }
}

function normalizeNodes(input: Record<string, unknown>): IdentityNode[] {
  const candidates = [
    ...arrayOfRecords(input.nodes),
    ...arrayOfRecords(recordValue(input.data)?.nodes),
    ...arrayOfRecords(input.users),
    ...arrayOfRecords(input.computers),
    ...arrayOfRecords(input.groups),
  ];
  const seen = new Set<string>();
  return candidates
    .map((item, index) => {
      const props = recordValue(item.properties) ?? item;
      const id = safeText(stringValue(item.id ?? item.objectid ?? item.objectId ?? props.objectid) ?? `node-${index}`, 200);
      const name = safeText(stringValue(item.name ?? props.name ?? props.samaccountname ?? props.displayname) ?? id, 240);
      const type = safeText(stringValue(item.type ?? item.kind ?? item.label ?? props.type) ?? inferNodeType(item), 80);
      const highValue = Boolean(item.highvalue ?? item.highValue ?? props.highvalue ?? props.highValue);
      return { id, name, type, highValue, properties: props };
    })
    .filter((node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    });
}

function normalizeEdges(input: Record<string, unknown>): IdentityEdge[] {
  const candidates = [
    ...arrayOfRecords(input.edges),
    ...arrayOfRecords(input.relationships),
    ...arrayOfRecords(input.links),
    ...arrayOfRecords(recordValue(input.data)?.edges),
  ];
  return candidates.map((item, index) => ({
    source: safeText(stringValue(item.source ?? item.start ?? item.from ?? item.src ?? item.sourceId) ?? `edge-${index}-source`, 200),
    target: safeText(stringValue(item.target ?? item.end ?? item.to ?? item.dst ?? item.targetId) ?? `edge-${index}-target`, 200),
    type: safeText(stringValue(item.type ?? item.kind ?? item.relationship ?? item.label) ?? 'Unknown', 120),
  }));
}

function identityRisks(nodes: IdentityNode[], edges: IdentityEdge[]): IdentityGraphRiskSignal[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const highValueIds = new Set(nodes.filter((node) => node.highValue).map((node) => node.id));
  const risks: IdentityGraphRiskSignal[] = [];
  for (const edge of edges) {
    const target = nodeById.get(edge.target);
    const source = nodeById.get(edge.source);
    const type = edge.type.toLowerCase();
    if (/dcsync|getchangesall|getchanges/i.test(type)) {
      risks.push(risk('identity.dcsync', 'Identity graph contains DCSync-capable path', 'critical', source, target, edge, 'DCSync-style privileges can replicate domain credential material in Active Directory.'));
      continue;
    }
    if (highValueIds.has(edge.target) && /genericall|genericwrite|own|writedacl|writeowner|addmember|forcechangepassword|allowedtodelegate|canrdp|execute/i.test(type)) {
      risks.push(risk('identity.high_value_edge', 'Privilege edge reaches high-value identity', 'high', source, target, edge, 'A direct privilege edge reaches a high-value user, group, computer, or domain object.'));
    }
    if (/addmember|genericall|writedacl|writeowner/i.test(edge.type) && target && /admin|domain admins|enterprise admins/i.test(target.name)) {
      risks.push(risk('identity.admin_group_control', 'Identity graph shows control over an admin group', 'high', source, target, edge, 'Control edges over privileged groups can enable privilege escalation if validated in the environment.'));
    }
  }
  for (const node of nodes) {
    const props = node.properties;
    if (truthy(props.hasspn ?? props.hasSPN ?? props.HasSPN) && truthy(props.enabled ?? true)) {
      risks.push(nodeRisk('identity.kerberoastable', 'Kerberoastable identity observed in graph', 'medium', node, 'A user or service principal with SPN may be roastable depending on encryption and password policy.'));
    }
    if (truthy(props.dontreqpreauth ?? props.dontReqPreAuth ?? props.DontReqPreAuth)) {
      risks.push(nodeRisk('identity.asrep_roastable', 'AS-REP roastable identity observed in graph', 'medium', node, 'Pre-authentication disabled can allow offline password attack workflows.'));
    }
    if (truthy(props.unconstraineddelegation ?? props.unconstrainedDelegation ?? props.UnconstrainedDelegation)) {
      risks.push(nodeRisk('identity.unconstrained_delegation', 'Unconstrained delegation identity observed in graph', 'high', node, 'Unconstrained delegation can expose delegated credentials when privileged users authenticate to the host.'));
    }
    if (truthy(props.admincount ?? props.adminCount ?? props.AdminCount) && !node.highValue) {
      risks.push(nodeRisk('identity.admincount', 'AdminCount identity requires privilege review', 'medium', node, 'AdminCount can indicate protected or historically privileged identity status.'));
    }
  }
  return dedupe(risks);
}

function risk(
  key: string,
  title: string,
  severity: Severity,
  source: IdentityNode | undefined,
  target: IdentityNode | undefined,
  edge: IdentityEdge,
  reason: string,
): IdentityGraphRiskSignal {
  return {
    key,
    title,
    severity,
    principal: source?.name ?? edge.source,
    target: target?.name ?? edge.target,
    edgeType: edge.type,
    reason,
  };
}

function nodeRisk(key: string, title: string, severity: Severity, node: IdentityNode, reason: string): IdentityGraphRiskSignal {
  return { key, title, severity, principal: node.name, target: node.type, reason };
}

function remediationFor(risk: IdentityGraphRiskSignal): string {
  if (risk.key.includes('dcsync')) {
    return 'Restrict replication privileges to required domain controllers and review delegated directory permissions.';
  }
  if (risk.key.includes('high_value') || risk.key.includes('admin_group')) {
    return 'Review and remove unnecessary control edges to privileged groups or high-value identities; validate ownership, ACLs, and group nesting.';
  }
  if (risk.key.includes('kerberoastable')) {
    return 'Use strong managed service accounts where possible, rotate weak service passwords, and enforce modern Kerberos encryption.';
  }
  if (risk.key.includes('asrep')) {
    return 'Require Kerberos pre-authentication for the account unless there is a documented exception.';
  }
  if (risk.key.includes('delegation')) {
    return 'Replace unconstrained delegation with constrained/resource-based delegation and restrict privileged logons to delegated hosts.';
  }
  return 'Review the identity graph finding, remove unnecessary privilege edges, and validate residual access with approved read-only checks.';
}

function dedupe(risks: IdentityGraphRiskSignal[]): IdentityGraphRiskSignal[] {
  const seen = new Set<string>();
  return risks.filter((item) => {
    const key = `${item.key}:${item.principal}:${item.target}:${item.edgeType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferNodeType(item: Record<string, unknown>): string {
  if (item.objectType) return String(item.objectType);
  if (item.samaccountname || item.displayname) return 'User';
  return 'Identity';
}

function serialize(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function parseJson(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Identity graph root must be an object');
  }
  return parsed as Record<string, unknown>;
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === 'True';
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function safeText(value: string | undefined, maxLength: number): string {
  return redactText(value ?? '').slice(0, maxLength);
}
