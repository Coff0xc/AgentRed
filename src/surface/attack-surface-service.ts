import type {
  AccessReview,
  AndroidManifestImport,
  ApprovalRequest,
  AttackSurfaceAsset,
  AttackSurfaceAssetKind,
  AttackSurfaceEndpoint,
  AttackSurfaceEndpointSource,
  AttackSurfaceMap,
  CloudIamImport,
  Evidence,
  IdentityGraphImport,
  Intent,
  RiskLevel,
  SarifImport,
  SearchFrontierItem,
  SearchFrontierPriority,
  SearchFrontierSource,
  ToolInvocation,
} from '../domain/types.js';
import { nowIso } from '../domain/ids.js';
import type { GraphServer } from '../graph/graph-server.js';
import { redactUrl } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';
import type { ConnectorRegistryService } from '../connectors/connector-registry-service.js';
import type { StrategyRecommendation, StrategyService } from '../strategy/strategy-service.js';
import type { WorkerToolRequest } from '../workers/types.js';

export interface SurfaceFrontierToolRequest {
  frontier: SearchFrontierItem;
  toolRequest: WorkerToolRequest;
}

export interface SurfaceFrontierIntent {
  frontier: SearchFrontierItem;
  intent: Intent;
  toolRequest?: WorkerToolRequest;
}

interface MutableSurface {
  assets: Map<string, AttackSurfaceAsset>;
  endpoints: Map<string, AttackSurfaceEndpoint>;
  technologies: Set<string>;
  signals: Set<string>;
  blockers: Set<string>;
  frontier: SearchFrontierItem[];
}

export class AttackSurfaceService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly strategy?: StrategyService,
    private readonly connectors?: ConnectorRegistryService,
  ) {}

  getMap(runId: string): AttackSurfaceMap {
    const snapshot = this.graph.getGraph(runId);
    const surface = emptySurface();
    const runTarget = redactUrl(snapshot.run.target);
    const evidenceById = new Map(snapshot.evidence.map((item) => [item.id, item]));

    addAsset(surface, {
      kind: 'target',
      label: runTarget,
      riskLevel: 'R1',
      evidenceIds: [],
      signals: ['Authorized run target'],
    });
    addHostAsset(surface, snapshot.run.target, 'R1', [], ['Target host']);
    addEndpoint(surface, {
      method: 'GET',
      url: runTarget,
      source: 'run_target',
      evidenceIds: [],
      observedAt: snapshot.run.createdAt,
    });

    for (const evidence of snapshot.evidence) {
      if (evidence.kind === 'replay_bundle') {
        continue;
      }
      this.deriveFromEvidence(surface, evidence);
    }

    for (const snapshotRecord of byRun(Object.values(this.store.state.browserSnapshots), runId)) {
      addAsset(surface, {
        kind: 'url',
        label: snapshotRecord.target,
        riskLevel: 'R1',
        evidenceIds: snapshotRecord.evidenceIds,
        signals: [snapshotRecord.title ? `Rendered page: ${snapshotRecord.title}` : 'Rendered page snapshot'],
      });
      addEndpoint(surface, {
        method: 'GET',
        url: snapshotRecord.target,
        source: 'browser_snapshot',
        evidenceIds: snapshotRecord.evidenceIds,
        observedAt: snapshotRecord.createdAt,
      });
      if (snapshotRecord.screenshotEvidenceId) {
        surface.signals.add('Browser screenshot evidence is local-only until reviewed.');
      }
    }

    for (const item of byRun(Object.values(this.store.state.captureImports), runId)) {
      if (item.skipped > 0) {
        surface.blockers.add(`${item.skipped} HAR entry(s) skipped by scope or shape validation.`);
      }
      if (item.truncatedEntries > 0) {
        surface.signals.add(`${item.truncatedEntries} HAR entry(s) were over the import limit.`);
      }
    }

    this.deriveFromAndroid(surface, byRun(Object.values(this.store.state.androidManifestImports), runId));
    this.deriveFromCloudIam(surface, byRun(Object.values(this.store.state.cloudIamImports), runId));
    this.deriveFromIdentityGraph(surface, byRun(Object.values(this.store.state.identityGraphImports), runId));
    this.deriveFromSarif(surface, byRun(Object.values(this.store.state.sarifImports), runId));
    this.deriveFromAccessReviews(surface, byRun(Object.values(this.store.state.accessReviews), runId));
    this.deriveBlockers(
      surface,
      byRun(Object.values(this.store.state.approvals), runId),
      byRun(Object.values(this.store.state.toolInvocations), runId),
      byRun(Object.values(this.store.state.connectorRuns), runId),
    );
    this.deriveFrontier(surface, runId, snapshot.intents, evidenceById);

    const assets = [...surface.assets.values()].sort((left, right) => compareRisk(right.riskLevel, left.riskLevel) || left.label.localeCompare(right.label));
    const endpoints = [...surface.endpoints.values()].sort(
      (left, right) => right.observedAt.localeCompare(left.observedAt) || left.url.localeCompare(right.url),
    );
    const frontier = dedupeFrontier(surface.frontier).slice(0, 12);
    const technologies = [...surface.technologies].sort();
    const signals = [...surface.signals].sort();
    const blockers = [...surface.blockers].sort();

    return {
      runId,
      generatedAt: nowIso(),
      target: runTarget,
      summary: summarizeSurface(snapshot.run.target, assets, endpoints, technologies, blockers, frontier),
      assets,
      endpoints,
      technologies,
      signals,
      blockers,
      frontier,
      counts: {
        assets: assets.length,
        endpoints: endpoints.length,
        evidence: snapshot.evidence.filter((item) => item.kind !== 'replay_bundle').length,
        findings: snapshot.findings.filter((item) => item.validationState !== 'rejected').length,
        blockers: blockers.length,
        frontier: frontier.length,
      },
    };
  }

  getFrontierItem(runId: string, frontierId: string): SearchFrontierItem {
    const frontier = this.getMap(runId).frontier.find((item) => item.id === frontierId);
    if (!frontier) {
      throw new Error(`Search frontier item not found: ${frontierId}`);
    }
    return frontier;
  }

  toolRequestForFrontier(runId: string, frontierId: string): SurfaceFrontierToolRequest {
    const run = this.graph.getRun(runId);
    const frontier = this.getFrontierItem(runId, frontierId);
    const toolRequest = buildToolRequest(run.target, frontier);
    if (!toolRequest) {
      throw new Error(`Search frontier item is not directly executable: ${frontierId}`);
    }
    return { frontier, toolRequest };
  }

  queueFrontierIntent(runId: string, frontierId: string): SurfaceFrontierIntent {
    const snapshot = this.graph.getGraph(runId);
    const frontier = this.getFrontierItem(runId, frontierId);
    const toolRequest = buildToolRequest(snapshot.run.target, frontier);
    const intent = this.graph.createIntent({
      runId,
      fromFactIds: snapshot.facts.slice(-3).map((fact) => fact.id),
      hypothesis: `Search frontier: ${frontier.title}. ${frontier.rationale}`,
      riskLevel: frontier.riskLevel,
      createdBy: 'surface.frontier',
    });
    if (toolRequest) {
      this.graph.addHint(runId, `Queued surface frontier tool request for ${frontier.id}: ${JSON.stringify(toolRequest)}`);
    }
    return { frontier, intent, toolRequest };
  }

  private deriveFromEvidence(surface: MutableSurface, evidence: Evidence): void {
    const parsed = parseEvidenceJson(this.store, evidence);
    if (!parsed) {
      if (evidence.kind === 'screenshot') {
        surface.signals.add('Screenshot evidence is present and remains raw local only.');
      }
      return;
    }

    if (evidence.kind === 'http_exchange') {
      const request = objectValue(parsed.request);
      const response = objectValue(parsed.response);
      const target = textValue(request.target);
      const method = textValue(request.method);
      if (target) {
        addHttpEndpoint(surface, target, method, parsed.source === 'har' ? 'har' : 'http_exchange', evidence);
      }
      addHeaderTechnologies(surface, objectValue(response.headers));
      const status = numberValue(response.status);
      if (status && status >= 500) {
        surface.signals.add(`HTTP ${status} response observed on ${target ?? 'captured endpoint'}.`);
      }
      if (status === 401 || status === 403) {
        surface.signals.add(`Authentication or authorization boundary observed on ${target ?? 'captured endpoint'}.`);
      }
      return;
    }

    if (parsed.captureType === 'browser_page_snapshot') {
      const target = textValue(parsed.target);
      if (target) {
        addHttpEndpoint(surface, target, 'GET', 'browser_snapshot', evidence);
      }
      const title = textValue(parsed.title);
      if (title) {
        surface.signals.add(`Rendered page title observed: ${title}`);
      }
      return;
    }

    if (parsed.tool === 'scanner.run_template') {
      this.deriveFromScannerEvidence(surface, evidence, parsed);
      return;
    }

    if (parsed.tool === 'credential.use_placeholder') {
      const role = textValue(parsed.role);
      surface.signals.add(role ? `Credential placeholder available for role ${role}.` : 'Credential placeholder was used.');
      return;
    }

    if (parsed.tool === 'access.compare_evidence') {
      surface.signals.add('Access comparison evidence is available for human authorization review.');
    }
  }

  private deriveFromScannerEvidence(surface: MutableSurface, evidence: Evidence, parsed: Record<string, unknown>): void {
    const template = textValue(parsed.template);
    const target = textValue(parsed.target);
    if (target) {
      addHttpEndpoint(surface, target, textValue(parsed.method), 'scanner_template', evidence);
    }
    if (template) {
      surface.signals.add(`Scanner template observed: ${template}`);
    }

    const result = objectValue(parsed.result);
    if (template === 'web.technology_fingerprint') {
      for (const signal of stringArrayValue(result.signals)) {
        surface.technologies.add(signal);
      }
      addHeaderTechnologies(surface, objectValue(parsed.responseHeaders));
      return;
    }

    if (template === 'web.link_form_map') {
      for (const link of stringArrayValue(result.links)) {
        addHttpEndpoint(surface, link, 'GET', 'scanner_template', evidence);
      }
      const forms = arrayValue(result.forms);
      for (const form of forms) {
        const item = objectValue(form);
        const action = textValue(item.action);
        if (action) {
          addHttpEndpoint(surface, action, textValue(item.method) ?? 'GET', 'scanner_template', evidence);
          surface.signals.add(`Form endpoint observed: ${(textValue(item.method) ?? 'GET').toUpperCase()} ${action}`);
        }
      }
      if (numberValue(result.externalLinkCount)) {
        surface.signals.add(`${numberValue(result.externalLinkCount)} external link(s) were observed and kept out of the in-scope endpoint list.`);
      }
      return;
    }

    if (template === 'web.endpoint_discovery') {
      for (const resultItem of arrayValue(parsed.results)) {
        const item = objectValue(resultItem);
        const endpoint = textValue(item.target);
        if (endpoint) {
          addHttpEndpoint(surface, endpoint, 'GET', 'scanner_template', evidence);
        }
        const status = numberValue(item.status);
        if (endpoint && status && status < 400) {
          surface.signals.add(`Well-known endpoint responded ${status}: ${endpoint}`);
        }
      }
      return;
    }

    if (template === 'web.security_headers') {
      const missing = stringArrayValue(result.missingSecurityHeaders);
      if (missing.length > 0) {
        surface.signals.add(`Missing browser security headers: ${missing.slice(0, 8).join(', ')}`);
      }
      addHeaderTechnologies(surface, objectValue(parsed.responseHeaders));
      return;
    }

    if (template === 'web.cookie_flags') {
      const cookieCount = numberValue(result.cookieCount) ?? 0;
      if (cookieCount > 0) {
        surface.signals.add(`${cookieCount} cookie(s) observed with flag metadata.`);
      }
      return;
    }

    if (template === 'network.dns_records') {
      const host = textValue(parsed.host) ?? hostLabel(target);
      addAsset(surface, {
        kind: 'host',
        label: host ?? target ?? 'network target',
        riskLevel: 'R1',
        evidenceIds: [evidence.id],
        signals: ['DNS record snapshot'],
      });
      return;
    }

    if (template === 'network.tls_certificate') {
      const host = textValue(parsed.host) ?? hostLabel(target);
      addAsset(surface, {
        kind: 'host',
        label: host ?? target ?? 'TLS target',
        riskLevel: 'R1',
        evidenceIds: [evidence.id],
        signals: ['TLS certificate metadata'],
      });
    }
  }

  private deriveFromAndroid(surface: MutableSurface, imports: AndroidManifestImport[]): void {
    for (const item of imports) {
      addAsset(surface, {
        kind: 'mobile_package',
        label: item.packageName ?? item.source,
        riskLevel: item.riskCount > 0 ? 'R3' : 'R1',
        evidenceIds: [item.evidenceId],
        signals: [
          `${item.exportedComponents.length} exported component(s)`,
          `${item.riskyPermissions.length} risky permission(s)`,
        ],
      });
      if (item.riskCount > 0) {
        surface.signals.add(`Android manifest risk signals: ${item.riskCount}.`);
        this.addFrontier(surface, {
          id: `domain_android_${item.id}`,
          title: 'Review Android manifest risk candidates',
          rationale: `${item.riskCount} mobile risk signal(s) were imported as evidence and need human validation.`,
          priority: 'medium',
          riskLevel: 'R0',
          source: 'domain_signal',
          relatedEvidenceIds: [item.evidenceId],
        });
      }
    }
  }

  private deriveFromCloudIam(surface: MutableSurface, imports: CloudIamImport[]): void {
    for (const item of imports) {
      addAsset(surface, {
        kind: 'cloud_principal',
        label: item.principal ?? item.policyName ?? item.source,
        riskLevel: item.riskCount > 0 ? 'R3' : 'R1',
        evidenceIds: [item.evidenceId],
        signals: item.riskSignals.slice(0, 5).map((signal) => signal.title),
      });
      if (item.riskCount > 0) {
        surface.signals.add(`Cloud IAM policy risk signals: ${item.riskCount}.`);
        this.addFrontier(surface, {
          id: `domain_cloud_${item.id}`,
          title: 'Validate cloud IAM permission risk',
          rationale: 'Imported IAM policy evidence contains broad or sensitive permissions; confirm business impact before reporting.',
          priority: 'medium',
          riskLevel: 'R0',
          source: 'domain_signal',
          relatedEvidenceIds: [item.evidenceId],
        });
      }
    }
  }

  private deriveFromIdentityGraph(surface: MutableSurface, imports: IdentityGraphImport[]): void {
    for (const item of imports) {
      addAsset(surface, {
        kind: 'identity_node',
        label: `${item.provider}: ${item.source}`,
        riskLevel: item.riskCount > 0 ? 'R3' : 'R1',
        evidenceIds: [item.evidenceId],
        signals: [
          `${item.nodeCount} node(s)`,
          `${item.edgeCount} edge(s)`,
          `${item.highValueNodeCount} high-value node(s)`,
        ],
      });
      for (const signal of item.riskSignals.slice(0, 5)) {
        surface.signals.add(signal.title);
      }
      if (item.riskCount > 0) {
        this.addFrontier(surface, {
          id: `domain_identity_${item.id}`,
          title: 'Review identity path risk evidence',
          rationale: 'Imported identity graph evidence has privilege-path signals that need operator validation.',
          priority: 'medium',
          riskLevel: 'R0',
          source: 'domain_signal',
          relatedEvidenceIds: [item.evidenceId],
        });
      }
    }
  }

  private deriveFromSarif(surface: MutableSurface, imports: SarifImport[]): void {
    for (const item of imports) {
      addAsset(surface, {
        kind: 'source_artifact',
        label: item.source,
        riskLevel: item.importedFindings > 0 ? 'R2' : 'R0',
        evidenceIds: [item.evidenceId],
        signals: [`${item.results} SARIF result(s)`, `${item.importedFindings} candidate finding(s)`],
      });
      if (item.importedFindings > 0) {
        this.addFrontier(surface, {
          id: `domain_sast_${item.id}`,
          title: 'Triage imported SAST candidates',
          rationale: 'Static-analysis candidates are evidence-backed but still need exploitability and impact review.',
          priority: 'medium',
          riskLevel: 'R0',
          source: 'domain_signal',
          relatedEvidenceIds: [item.evidenceId],
        });
      }
    }
  }

  private deriveFromAccessReviews(surface: MutableSurface, reviews: AccessReview[]): void {
    for (const review of reviews) {
      const evidenceIds = [
        review.baselineEvidenceId,
        review.comparisonEvidenceId,
        review.diffEvidenceId,
      ].filter((id): id is string => Boolean(id));
      addAsset(surface, {
        kind: 'url',
        label: review.target,
        riskLevel: review.status === 'differential_observed' ? 'R3' : 'R1',
        evidenceIds,
        signals: review.signals,
      });
      if (review.status === 'differential_observed') {
        this.addFrontier(surface, {
          id: `access_review_${review.id}`,
          title: 'Review role-difference evidence',
          rationale: `${review.title} has differential response signals; decide whether impact is reportable.`,
          priority: 'high',
          riskLevel: 'R0',
          source: 'evidence_gap',
          relatedEvidenceIds: evidenceIds,
          suggestedTool: 'finding.propose',
        });
      }
    }
  }

  private deriveBlockers(
    surface: MutableSurface,
    approvals: ApprovalRequest[],
    toolInvocations: ToolInvocation[],
    connectorRuns: Array<{ connectorId: string; blocked: number; approvalRequired: number }>,
  ): void {
    for (const approval of approvals.filter((item) => item.status === 'pending')) {
      surface.blockers.add(`Pending approval for ${approval.tool} ${approval.riskLevel} on ${approval.target}.`);
    }
    for (const tool of toolInvocations.filter((item) => item.status === 'blocked')) {
      surface.blockers.add(`Blocked ${tool.tool}: ${tool.reason ?? 'policy gate blocked execution'}.`);
    }
    for (const run of connectorRuns) {
      if (run.blocked > 0) {
        surface.blockers.add(`${run.blocked} mapped connector item(s) blocked for ${run.connectorId}.`);
      }
      if (run.approvalRequired > 0) {
        surface.blockers.add(`${run.approvalRequired} mapped connector item(s) need approval for ${run.connectorId}.`);
      }
    }
  }

  private deriveFrontier(
    surface: MutableSurface,
    runId: string,
    intents: Intent[],
    evidenceById: Map<string, Evidence>,
  ): void {
    for (const intent of intents.filter((item) => item.status === 'open' || item.status === 'released' || item.status === 'claimed')) {
      const relatedEvidenceIds = intent.fromFactIds
        .flatMap((factId) => Object.values(this.store.state.facts).filter((fact) => fact.id === factId))
        .flatMap((fact) => fact.evidenceIds)
        .filter((id) => evidenceById.has(id));
      this.addFrontier(surface, {
        id: `intent_${intent.id}`,
        title: intent.status === 'claimed' ? 'Watch active Worker intent' : 'Dispatch queued exploration intent',
        rationale: intent.hypothesis,
        priority: intent.status === 'claimed' ? 'medium' : 'high',
        riskLevel: intent.riskLevel,
        source: 'intent',
        relatedEvidenceIds,
      });
    }

    const strategy = this.strategy?.getBrief(runId);
    for (const recommendation of strategy?.recommendations ?? []) {
      this.addStrategyFrontier(surface, recommendation);
    }

    if (surface.endpoints.size <= 1) {
      this.addFrontier(surface, {
        id: 'gap_endpoint_map',
        title: 'Map links and forms',
        rationale: 'Only the target entrypoint is visible; collect a bounded link/form map before deeper validation.',
        priority: 'high',
        riskLevel: 'R1',
        source: 'evidence_gap',
        relatedEvidenceIds: [],
        suggestedTool: 'scanner.run_template',
        suggestedTemplate: 'web.link_form_map',
      });
    }

    if (surface.technologies.size === 0) {
      this.addFrontier(surface, {
        id: 'gap_technology_fingerprint',
        title: 'Fingerprint visible technology',
        rationale: 'No technology signals are present yet; capture headers and bounded page hints for better Worker context.',
        priority: 'medium',
        riskLevel: 'R1',
        source: 'evidence_gap',
        relatedEvidenceIds: [],
        suggestedTool: 'scanner.run_template',
        suggestedTemplate: 'web.technology_fingerprint',
      });
    }

    const activeFindings = Object.values(this.store.state.findings).filter(
      (finding) => finding.runId === runId && finding.validationState !== 'rejected',
    );
    const activeEvidence = Object.values(this.store.state.evidence).filter(
      (evidence) => evidence.runId === runId && evidence.kind !== 'replay_bundle',
    );
    if (activeEvidence.length > 0 && activeFindings.length === 0) {
      this.addFrontier(surface, {
        id: 'gap_review_evidence',
        title: 'Review evidence for candidate findings',
        rationale: 'Evidence exists but no active finding has been proposed; triage useful evidence before reporting.',
        priority: 'medium',
        riskLevel: 'R0',
        source: 'evidence_gap',
        relatedEvidenceIds: activeEvidence.slice(-5).map((item) => item.id),
        suggestedTool: 'finding.propose',
      });
    }

    for (const connector of this.connectors?.listForRun(runId) ?? []) {
      if (connector.enabled && connector.capabilityMapping.coveragePercent < 100) {
        this.addFrontier(surface, {
          id: `connector_gap_${connector.id}`,
          title: `Map connector coverage gaps: ${connector.name}`,
          rationale: `${connector.capabilityMapping.unmappedToolNames.length} connector tool(s) are known but not mapped into governed Tool Gateway templates or packs.`,
          priority: 'low',
          riskLevel: 'R0',
          source: 'connector_gap',
          relatedEvidenceIds: [],
        });
      }
    }
  }

  private addStrategyFrontier(surface: MutableSurface, recommendation: StrategyRecommendation): void {
    const args = recommendation.toolRequest?.args;
    const template = args && typeof args.template === 'string' ? args.template : undefined;
    const evidenceIds =
      args && Array.isArray(args.evidenceIds)
        ? args.evidenceIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : [];
    this.addFrontier(surface, {
      id: `strategy_${recommendation.id}`,
      title: recommendation.title,
      rationale: recommendation.rationale,
      priority: recommendation.riskLevel === 'R0' ? 'medium' : 'high',
      riskLevel: recommendation.riskLevel,
      source: 'strategy',
      relatedEvidenceIds: evidenceIds,
      suggestedTool: recommendation.toolRequest?.tool,
      suggestedTemplate: template,
    });
  }

  private addFrontier(surface: MutableSurface, item: SearchFrontierItem): void {
    surface.frontier.push(item);
  }
}

function buildToolRequest(target: string, frontier: SearchFrontierItem): WorkerToolRequest | undefined {
  if (!frontier.suggestedTool) {
    return undefined;
  }
  if (frontier.suggestedTool === 'scanner.run_template' && frontier.suggestedTemplate) {
    return {
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel: frontier.riskLevel,
      args: { template: frontier.suggestedTemplate, timeoutMs: 10_000 },
      purpose: `${frontier.title}: ${frontier.rationale}`,
    };
  }
  if (frontier.suggestedTool === 'http.request') {
    return {
      tool: 'http.request',
      target,
      method: 'GET',
      riskLevel: frontier.riskLevel,
      args: { timeoutMs: 10_000 },
      purpose: `${frontier.title}: ${frontier.rationale}`,
    };
  }
  if (frontier.suggestedTool === 'finding.propose' && frontier.relatedEvidenceIds.length > 0) {
    return {
      tool: 'finding.propose',
      target,
      method: 'POST',
      riskLevel: 'R0',
      args: {
        title: frontier.title,
        severity: 'info',
        confidence: 'needs_dynamic_confirmation',
        affectedAssets: [target],
        evidenceIds: frontier.relatedEvidenceIds,
        reproSteps: ['Review and replay the referenced evidence.'],
        impact: 'Impact requires operator review before confirmation.',
        remediation: 'Document remediation after validation.',
      },
      purpose: 'Create an operator-reviewed candidate finding from frontier evidence.',
    };
  }
  return undefined;
}

function emptySurface(): MutableSurface {
  return {
    assets: new Map(),
    endpoints: new Map(),
    technologies: new Set(),
    signals: new Set(),
    blockers: new Set(),
    frontier: [],
  };
}

function addAsset(surface: MutableSurface, input: Omit<AttackSurfaceAsset, 'id'>): void {
  const id = stableId(input.kind, input.label);
  const existing = surface.assets.get(id);
  if (!existing) {
    surface.assets.set(id, { id, ...input, evidenceIds: unique(input.evidenceIds), signals: unique(input.signals).slice(0, 10) });
    return;
  }
  existing.riskLevel = maxRisk(existing.riskLevel, input.riskLevel);
  existing.evidenceIds = unique([...existing.evidenceIds, ...input.evidenceIds]);
  existing.signals = unique([...existing.signals, ...input.signals]).slice(0, 10);
}

function addHostAsset(surface: MutableSurface, target: string, riskLevel: RiskLevel, evidenceIds: string[], signals: string[]): void {
  const host = hostLabel(target);
  if (!host) {
    return;
  }
  addAsset(surface, { kind: 'host', label: host, riskLevel, evidenceIds, signals });
}

function addHttpEndpoint(
  surface: MutableSurface,
  target: string,
  method: string | undefined,
  source: AttackSurfaceEndpointSource,
  evidence: Evidence,
): void {
  addAsset(surface, {
    kind: 'url',
    label: redactUrl(target),
    riskLevel: 'R1',
    evidenceIds: [evidence.id],
    signals: [`Observed via ${source}`],
  });
  addHostAsset(surface, target, 'R1', [evidence.id], [`Observed via ${source}`]);
  addEndpoint(surface, {
    method,
    url: redactUrl(target),
    source,
    evidenceIds: [evidence.id],
    observedAt: evidence.createdAt,
  });
}

function addEndpoint(surface: MutableSurface, input: Omit<AttackSurfaceEndpoint, 'id'>): void {
  const method = input.method?.toUpperCase();
  const id = stableId(method ?? 'ANY', input.url);
  const existing = surface.endpoints.get(id);
  if (!existing) {
    surface.endpoints.set(id, { id, ...input, method, evidenceIds: unique(input.evidenceIds) });
    return;
  }
  existing.evidenceIds = unique([...existing.evidenceIds, ...input.evidenceIds]);
  if (input.observedAt > existing.observedAt) {
    existing.observedAt = input.observedAt;
  }
}

function addHeaderTechnologies(surface: MutableSurface, headers: Record<string, unknown>): void {
  for (const key of ['server', 'x-powered-by', 'x-aspnet-version', 'x-generator', 'via']) {
    const value = textValue(headers[key]);
    if (value) {
      surface.technologies.add(`${key}: ${value}`.slice(0, 120));
    }
  }
  const contentType = textValue(headers['content-type']);
  if (contentType) {
    surface.technologies.add(`content-type: ${contentType.split(';')[0]}`.slice(0, 120));
  }
}

function parseEvidenceJson(store: PlatformStore, evidence: Evidence): Record<string, unknown> | undefined {
  const blob = store.state.evidenceBlobs[evidence.localUri];
  if (!blob || blob.encoding !== 'utf8' || blob.sizeBytes > 250_000) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(blob.content) as unknown;
    return objectValue(parsed);
  } catch {
    return undefined;
  }
}

function objectValue(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function arrayValue(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function stringArrayValue(input: unknown): string[] {
  return Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function textValue(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim().length > 0 ? input.trim() : undefined;
}

function numberValue(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isFinite(input) ? input : undefined;
}

function byRun<T extends { runId: string }>(items: T[], runId: string): T[] {
  return items.filter((item) => item.runId === runId);
}

function hostLabel(target: string | undefined): string | undefined {
  if (!target) {
    return undefined;
  }
  try {
    return new URL(target).host;
  } catch {
    return target.includes('.') ? target : undefined;
  }
}

function stableId(kind: AttackSurfaceAssetKind | string, label: string): string {
  return `${kind}_${label.toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'item'}`;
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter((item) => item.length > 0))];
}

function maxRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  return compareRisk(left, right) >= 0 ? left : right;
}

function compareRisk(left: RiskLevel, right: RiskLevel): number {
  return riskScore(left) - riskScore(right);
}

function riskScore(value: RiskLevel): number {
  return { R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 }[value];
}

function dedupeFrontier(items: SearchFrontierItem[]): SearchFrontierItem[] {
  const seen = new Set<string>();
  return items
    .sort((left, right) => priorityScore(right.priority) - priorityScore(left.priority) || compareRisk(right.riskLevel, left.riskLevel))
    .filter((item) => {
      const key = `${item.source}:${item.title}:${item.suggestedTool ?? ''}:${item.suggestedTemplate ?? ''}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function priorityScore(value: SearchFrontierPriority): number {
  return { low: 0, medium: 1, high: 2 }[value];
}

function summarizeSurface(
  target: string,
  assets: AttackSurfaceAsset[],
  endpoints: AttackSurfaceEndpoint[],
  technologies: string[],
  blockers: string[],
  frontier: SearchFrontierItem[],
): string {
  const parts = [
    `${redactUrl(target)} has ${assets.length} asset(s) and ${endpoints.length} observed endpoint(s).`,
    `${technologies.length} technology signal(s), ${blockers.length} blocker(s), ${frontier.length} next exploration frontier item(s).`,
  ];
  const highRisk = assets.filter((item) => compareRisk(item.riskLevel, 'R2') >= 0).length;
  if (highRisk > 0) {
    parts.push(`${highRisk} asset(s) carry R2+ domain or validation signals.`);
  }
  return parts.join(' ');
}
