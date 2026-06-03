import type { GraphServer } from '../graph/graph-server.js';
import type { CredentialReference, Evidence, Intent, RiskLevel } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import { listScannerTemplates } from '../tools/toolbox-registry.js';
import type { WorkerToolRequest } from '../workers/types.js';
import type { DomainSkillService } from '../skills/domain-skill-service.js';
import type { PocTemplateService, WorkerPocTemplateContext } from '../poc/poc-template-service.js';

export interface StrategyRecommendation {
  id: string;
  title: string;
  rationale: string;
  riskLevel: RiskLevel;
  toolRequest?: WorkerToolRequest;
}

export interface RunStrategyBrief {
  runId: string;
  mode: 'dispatcher_controlled_agent_worker';
  summary: string;
  recommendations: StrategyRecommendation[];
  workerHints: string[];
}

export class StrategyService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly skills?: DomainSkillService,
    private readonly pocs?: PocTemplateService,
  ) {}

  getBrief(runId: string): RunStrategyBrief {
    const snapshot = this.graph.getGraph(runId);
    const toolInvocations = Object.values(this.store.state.toolInvocations).filter((item) => item.runId === runId);
    const pendingApprovals = Object.values(this.store.state.approvals).filter(
      (item) => item.runId === runId && item.status === 'pending',
    );
    const activeEvidence = snapshot.evidence.filter((item) => item.kind !== 'replay_bundle');
    const activeFindings = snapshot.findings.filter((item) => item.validationState !== 'rejected');
    const activeCredentials = Object.values(this.store.state.credentialReferences).filter(
      (item) => item.runId === runId && item.status === 'active',
    );
    const activeOastSessions = Object.values(this.store.state.oastSessions).filter(
      (item) => item.runId === runId && item.status === 'active',
    );
    const enabledPocContexts = this.pocs?.workerContext(runId) ?? [];
    const enabledSkillHints = this.skills?.workerHints(runId) ?? [];
    const enabledPocHints = enabledPocContexts.flatMap((template) =>
      template.workerHints.map((hint) => `[${template.id}] ${hint}`),
    );
    const recommendations: StrategyRecommendation[] = [];

    if (pendingApprovals.length > 0) {
      recommendations.push({
        id: 'review.pending_approvals',
        title: 'Review pending approvals',
        rationale: 'Higher-risk work is paused until the operator decides the pending approval requests.',
        riskLevel: 'R0',
      });
    }

    if (activeEvidence.length === 0) {
      recommendations.push(baselineHttp(snapshot.run.target));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.technology_fingerprint', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.link_form_map', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.csp_analysis', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.cors_policy', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.security_txt_policy', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.redirect_policy', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.cache_policy', 'R1'));
    } else if (activeFindings.length === 0) {
      if (activeCredentials.length >= 2 && activeEvidence.length >= 2) {
        const recentEvidence = activeEvidence.slice(-2);
        recommendations.push({
          id: 'access.compare_recent_evidence',
          title: 'Compare recent evidence across roles',
          rationale:
            'Multiple credential references and evidence items exist; compare role-visible responses before proposing authorization findings.',
          riskLevel: 'R0',
          toolRequest: {
            tool: 'access.compare_evidence',
            target: snapshot.run.target,
            method: 'POST',
            riskLevel: 'R0',
            args: {
              title: 'Recent role access comparison',
              baselineCredentialId: activeCredentials[0].id,
              comparisonCredentialId: activeCredentials[1].id,
              baselineEvidenceId: recentEvidence[0].id,
              comparisonEvidenceId: recentEvidence[1].id,
            },
            purpose: 'Create a redacted differential evidence artifact for human authorization review.',
          },
        });
      }
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.security_headers', 'R2'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.cookie_flags', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.cookie_scope_analysis', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.js_asset_inventory', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.websocket_discovery_plan', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.sourcemap_exposure_plan', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.openapi_discovery', 'R2'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.oauth_oidc_metadata', 'R1'));
      recommendations.push(scannerTemplate(snapshot.run.target, 'web.graphql_introspection_plan', 'R2'));
      recommendations.push({
        id: 'finding.review_evidence',
        title: 'Review evidence and propose candidate finding',
        rationale: 'Evidence exists but no candidate finding is in review yet.',
        riskLevel: 'R0',
        toolRequest: {
          tool: 'finding.propose',
          target: snapshot.run.target,
          method: 'POST',
          riskLevel: 'R0',
          args: {
            title: 'Evidence-backed candidate finding',
            severity: 'info',
            confidence: 'needs_dynamic_confirmation',
            affectedAssets: [snapshot.run.target],
            evidenceIds: activeEvidence.slice(-3).map((item) => item.id),
            reproSteps: ['Review and replay the referenced evidence.'],
            impact: 'Impact requires operator review before confirmation.',
            remediation: 'Document the validated remediation after review.',
          },
          purpose: 'Create a low-confidence candidate only when the operator agrees impact is real.',
        },
      });
    } else if (activeFindings.some((finding) => finding.validationState === 'candidate')) {
      recommendations.push({
        id: 'review.validate_findings',
        title: 'Validate candidate findings',
        rationale: 'Candidate findings should be confirmed or rejected before report generation.',
        riskLevel: 'R0',
      });
    } else {
      recommendations.push({
        id: 'report.generate',
        title: 'Generate report bundle',
        rationale: 'Confirmed or reviewed findings are ready for a reproducible report bundle.',
        riskLevel: 'R0',
      });
    }

    const pocRecommendations = pocTemplateRecommendations({
      target: snapshot.run.target,
      templates: enabledPocContexts,
      activeEvidence,
      activeCredentials,
      hasActiveOastSession: activeOastSessions.length > 0,
    });
    const finalRecommendations = mergeTemplateRecommendations(recommendations, pocRecommendations);
    const blockedCount = toolInvocations.filter((item) => item.status === 'blocked').length;
    return {
      runId,
      mode: 'dispatcher_controlled_agent_worker',
      summary: `${activeEvidence.length} evidence item(s), ${activeFindings.length} active finding(s), ${pendingApprovals.length} pending approval(s), ${blockedCount} blocked tool call(s).`,
      recommendations: finalRecommendations.slice(0, 16),
      workerHints: [
        'Prefer low-risk evidence capture before proposing findings.',
        'Use toolRequests; never execute tools directly from the Worker.',
        'Use "$produced" when proposing a finding from evidence produced earlier in the same explore result.',
        'Stop and request approval for R3 work instead of attempting bypasses.',
        ...enabledSkillHints,
        ...enabledPocHints,
      ],
    };
  }

  queueRecommendationIntent(runId: string, recommendationId: string): { intent: Intent; recommendation: StrategyRecommendation } {
    const snapshot = this.graph.getGraph(runId);
    const strategy = this.getBrief(runId);
    const recommendation = strategy.recommendations.find((item) => item.id === recommendationId);
    if (!recommendation) {
      throw new Error(`Strategy recommendation not found: ${recommendationId}`);
    }
    const fromFactIds = snapshot.facts.slice(-3).map((fact) => fact.id);
    const intent = this.graph.createIntent({
      runId,
      fromFactIds,
      hypothesis: `Autonomy recommendation: ${recommendation.title}. ${recommendation.rationale}`,
      riskLevel: recommendation.riskLevel,
      createdBy: 'strategy.autonomy',
    });
    if (recommendation.toolRequest) {
      this.graph.addHint(
        runId,
        `Queued strategy tool request for ${recommendation.id}: ${JSON.stringify(recommendation.toolRequest)}`,
      );
    }
    return { intent, recommendation };
  }
}

export function strategyHintsForWorker(): string[] {
  return [
    'Start with in-scope, low-risk evidence capture.',
    'Prefer http.request, web.technology_fingerprint, web.link_form_map, web.csp_analysis, web.cors_policy, web.security_txt_policy, web.redirect_policy, web.cache_policy, and web.security_headers before higher-risk checks.',
    'Use modern Web templates such as web.cookie_scope_analysis, web.websocket_discovery_plan, and web.sourcemap_exposure_plan for safe planning; do not connect WebSockets or download source maps directly.',
    'Use API/auth metadata templates such as web.openapi_discovery, web.oauth_oidc_metadata, and web.graphql_introspection_plan for bounded discovery; do not run GraphQL introspection or token flows directly.',
    'Use finding.propose only after evidence exists.',
    'Use access.compare_evidence when two role-specific evidence items need authorization review.',
    'Use "$produced" to reference evidence created earlier in the same explore result.',
  ];
}

function baselineHttp(target: string): StrategyRecommendation {
  return {
    id: 'web.baseline_http',
    title: 'Capture baseline HTTP response',
    rationale: 'A redacted baseline exchange gives the run durable evidence before deeper analysis.',
    riskLevel: 'R1',
    toolRequest: {
      tool: 'http.request',
      target,
      method: 'GET',
      riskLevel: 'R1',
      args: { timeoutMs: 10_000 },
      purpose: 'Capture a redacted baseline HTTP exchange.',
    },
  };
}

function scannerTemplate(target: string, templateId: string, riskLevel: RiskLevel): StrategyRecommendation {
  const template = listScannerTemplates().find((item) => item.id === templateId);
  return {
    id: `scanner.${templateId}`,
    title: template?.name ?? templateId,
    rationale: template?.description ?? 'Run a governed scanner template through the Tool Gateway.',
    riskLevel,
    toolRequest: {
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel,
      args: { template: templateId, timeoutMs: 10_000 },
      purpose: template?.description,
    },
  };
}

function pocTemplateRecommendations(input: {
  target: string;
  templates: WorkerPocTemplateContext[];
  activeEvidence: Evidence[];
  activeCredentials: CredentialReference[];
  hasActiveOastSession: boolean;
}): StrategyRecommendation[] {
  const recommendations: StrategyRecommendation[] = [];
  for (const template of input.templates) {
    if (template.id === 'auth.role-diff.idor' || template.id === 'auth.multi-tenant-bypass') {
      recommendations.push(...roleDiffRecommendations(input.target, template, input.activeEvidence, input.activeCredentials));
    }
    if (template.id === 'api.graphql-field-authz') {
      recommendations.push(scannerRecommendationForTemplate(input.target, template, 'web.graphql_introspection_plan'));
      recommendations.push(...roleDiffRecommendations(input.target, template, input.activeEvidence, input.activeCredentials));
    }
    if (template.id === 'oauth.oidc-flow-review') {
      recommendations.push(scannerRecommendationForTemplate(input.target, template, 'web.oauth_oidc_metadata'));
      recommendations.push(browserRecommendationForTemplate(input.target, template, 'Capture redacted browser-flow evidence for OAuth/OIDC review.'));
    }
    if ((template.id === 'oast.ssrffallback' || template.id === 'web.ssrf-impact-triage') && !input.hasActiveOastSession) {
      recommendations.push(oastInboxRecommendation(input.target, template));
    }
    if (template.id === 'web.rce-deserialization-triage') {
      recommendations.push(scannerRecommendationForTemplate(input.target, template, 'web.nuclei.safe_templates'));
      recommendations.push(
        operatorRecommendation(
          template,
          'Map RCE/deserialization sink evidence',
          'Link route, version/advisory, source/SAST signal, stack trace, or bounded safe-marker evidence before proposing critical impact.',
          'R1',
        ),
      );
    }
    if (template.id === 'web.injection-impact-triage') {
      recommendations.push(scannerRecommendationForTemplate(input.target, template, 'web.sqlmap.verify'));
      recommendations.push(
        operatorRecommendation(
          template,
          'Separate injection signal from impact',
          'Collect non-destructive error, timing, source, or scanner evidence before requesting approval-gated validation.',
          'R1',
        ),
      );
    }
    if (template.id === 'web.file-upload-path-traversal') {
      recommendations.push(scannerRecommendationForTemplate(input.target, template, 'web.link_form_map'));
      recommendations.push(browserRecommendationForTemplate(input.target, template, 'Capture rendered upload/download surfaces before any state-changing validation.'));
    }
    if (template.id === 'secrets.exposure-review') {
      recommendations.push(
        operatorRecommendation(
          template,
          'Import secret-scanning evidence',
          'Attach SARIF, command_output, or file-hash evidence that reports secret type and location without copying raw secret values.',
          'R0',
        ),
      );
    }
    if (template.id === 'cloud.storage-public-exposure') {
      recommendations.push(scannerRecommendationForTemplate(input.target, template, 'web.nuclei.safe_templates'));
      recommendations.push(
        operatorRecommendation(
          template,
          'Attach cloud storage policy evidence',
          'Import read-only storage policy, IAM policy, or redacted HTTP listing evidence before proposing data exposure impact.',
          'R0',
        ),
      );
    }
    if (template.id === 'container.k8s-rbac-risk') {
      recommendations.push(
        operatorRecommendation(
          template,
          'Import Kubernetes posture evidence',
          'Attach read-only manifest, RBAC, workload, or scanner output evidence; do not request cluster mutation or secret reads.',
          'R0',
        ),
      );
    }
    if (template.id === 'supply-chain.sbom-vulnerable-component') {
      recommendations.push(
        operatorRecommendation(
          template,
          'Import SBOM or SCA evidence',
          'Attach SBOM/SCA evidence and rank by KEV/EPSS, reachability, exposure, and mitigation status before creating lifecycle work.',
          'R0',
        ),
      );
    }
    if (template.id === 'network.exposed-service-risk') {
      recommendations.push(scannerRecommendationForTemplate(input.target, template, 'network.dns_records'));
      recommendations.push(scannerRecommendationForTemplate(input.target, template, 'network.tls_certificate'));
      recommendations.push(scannerRecommendationForTemplate(input.target, template, 'network.nmap.safe_top_ports'));
    }
    if (template.id === 'ai.prompt-tool-injection') {
      recommendations.push(
        operatorRecommendation(
          template,
          'Import AI-agent security eval evidence',
          'Attach promptfoo, PyRIT, AI-Infra-Guard, MCP/skill scan, or tool-call trace evidence and score impact outside the model under test.',
          'R0',
        ),
      );
    }
    for (const tool of template.recommendedTools) {
      const scannerPrefix = 'scanner.run_template:';
      if (!tool.startsWith(scannerPrefix)) {
        continue;
      }
      const templateId = tool.slice(scannerPrefix.length);
      const scanner = listScannerTemplates().find((item) => item.id === templateId);
      recommendations.push({
        id: `poc.${template.id}.scanner.${templateId}`,
        title: `${template.name}: ${scanner?.name ?? templateId}`,
        rationale:
          `The enabled PoC template expects ${template.requiredEvidence.join(', ')} evidence. ` +
          'Run this governed scanner template through the Tool Gateway; profile readiness and scope policy still apply.',
        riskLevel: scanner?.defaultRiskLevel ?? 'R2',
        toolRequest: {
          tool: 'scanner.run_template',
          target: input.target,
          method: 'GET',
          riskLevel: scanner?.defaultRiskLevel ?? 'R2',
          args: { template: templateId, timeoutMs: 10_000 },
          purpose: scanner?.description ?? `Collect evidence for ${template.name}.`,
        },
      });
    }
  }
  return recommendations;
}

function scannerRecommendationForTemplate(
  target: string,
  template: WorkerPocTemplateContext,
  scannerTemplateId: string,
): StrategyRecommendation {
  const scanner = listScannerTemplates().find((item) => item.id === scannerTemplateId);
  const riskLevel = scanner?.defaultRiskLevel ?? 'R2';
  return {
    id: `poc.${template.id}.scanner.${scannerTemplateId}`,
    title: `${template.name}: ${scanner?.name ?? scannerTemplateId}`,
    rationale:
      `The enabled high-risk template expects ${template.requiredEvidence.join(', ')} evidence. ` +
      'Request this governed scanner template through the Tool Gateway; profile readiness, scope, rate, and approval gates still apply.',
    riskLevel,
    toolRequest: {
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel,
      args: { template: scannerTemplateId, timeoutMs: 10_000 },
      purpose: scanner?.description ?? `Collect evidence for ${template.name}.`,
    },
  };
}

function browserRecommendationForTemplate(
  target: string,
  template: WorkerPocTemplateContext,
  purpose: string,
): StrategyRecommendation {
  return {
    id: `poc.${template.id}.browser.navigate`,
    title: `${template.name}: capture browser evidence`,
    rationale: 'Rendered browser evidence helps validate user-visible impact while keeping cookies and tokens outside Worker context.',
    riskLevel: 'R1',
    toolRequest: {
      tool: 'browser.navigate',
      target,
      method: 'GET',
      riskLevel: 'R1',
      args: { timeoutMs: 10_000 },
      purpose,
    },
  };
}

function oastInboxRecommendation(target: string, template: WorkerPocTemplateContext): StrategyRecommendation {
  return {
    id: `poc.${template.id}.oast.start_session`,
    title: `${template.name}: start local OAST inbox`,
    rationale:
      'The enabled template requires callback evidence. Start a local inbox first; live payload placement remains approval-gated validation work.',
    riskLevel: 'R0',
    toolRequest: {
      tool: 'oast.start_session',
      target,
      method: 'POST',
      riskLevel: 'R0',
      args: {},
      purpose: 'Create a local OAST callback inbox for evidence capture.',
    },
  };
}

function operatorRecommendation(
  template: WorkerPocTemplateContext,
  title: string,
  rationale: string,
  riskLevel: RiskLevel,
): StrategyRecommendation {
  return {
    id: `poc.${template.id}.operator.${slugify(title)}`,
    title: `${template.name}: ${title}`,
    rationale,
    riskLevel,
  };
}

function roleDiffRecommendations(
  target: string,
  template: WorkerPocTemplateContext,
  activeEvidence: Evidence[],
  activeCredentials: CredentialReference[],
): StrategyRecommendation[] {
  if (activeCredentials.length < 2) {
    return [
      {
        id: `poc.${template.id}.credentials`,
        title: `${template.name}: add role credential references`,
        rationale:
          'The enabled PoC template needs at least two role contexts before an authorization difference can be reviewed safely.',
        riskLevel: 'R0',
      },
    ];
  }
  if (activeEvidence.length < 2) {
    return [
      {
        id: `poc.${template.id}.role_evidence`,
        title: `${template.name}: capture comparable role evidence`,
        rationale:
          'The enabled PoC template needs two same-run evidence items captured from different roles before access.compare_evidence is useful.',
        riskLevel: 'R1',
      },
    ];
  }
  const recentEvidence = activeEvidence.slice(-2);
  return [
    {
      id: `poc.${template.id}.access.compare_evidence`,
      title: `${template.name}: compare role evidence`,
      rationale:
        'The enabled PoC template has enough credential and evidence context to create a redacted authorization diff artifact.',
      riskLevel: 'R0',
      toolRequest: {
        tool: 'access.compare_evidence',
        target,
        method: 'POST',
        riskLevel: 'R0',
        args: {
          title: 'PoC template role differential comparison',
          baselineCredentialId: activeCredentials[0].id,
          comparisonCredentialId: activeCredentials[1].id,
          baselineEvidenceId: recentEvidence[0].id,
          comparisonEvidenceId: recentEvidence[1].id,
        },
        purpose: 'Create a redacted diff artifact for authorization review.',
      },
    },
  ];
}

function mergeTemplateRecommendations(
  base: StrategyRecommendation[],
  templateRecommendations: StrategyRecommendation[],
): StrategyRecommendation[] {
  const result: StrategyRecommendation[] = [];
  const pending = base.filter((item) => item.id === 'review.pending_approvals');
  for (const recommendation of [...pending, ...templateRecommendations, ...base.filter((item) => item.id !== 'review.pending_approvals')]) {
    if (!result.some((existing) => isDuplicateRecommendation(existing, recommendation))) {
      result.push(recommendation);
    }
  }
  return result;
}

function isDuplicateRecommendation(left: StrategyRecommendation, right: StrategyRecommendation): boolean {
  if (left.id === right.id) {
    return true;
  }
  const leftTemplate =
    left.toolRequest?.args && typeof left.toolRequest.args.template === 'string' ? left.toolRequest.args.template : undefined;
  const rightTemplate =
    right.toolRequest?.args && typeof right.toolRequest.args.template === 'string' ? right.toolRequest.args.template : undefined;
  if (left.toolRequest?.tool === 'scanner.run_template' && right.toolRequest?.tool === 'scanner.run_template') {
    return Boolean(leftTemplate && rightTemplate && leftTemplate === rightTemplate);
  }
  return left.toolRequest?.tool === right.toolRequest?.tool && left.toolRequest?.tool === 'oast.start_session';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}
