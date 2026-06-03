import { nowIso } from '../domain/ids.js';
import type {
  AccessReview,
  AndroidManifestImport,
  BrowserSnapshot,
  CaptureImport,
  CloudIamImport,
  DomainSkillCategory,
  Evidence,
  Finding,
  IdentityGraphImport,
  Run,
  SarifImport,
} from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import type { DomainSkillService, RunDomainSkillView } from './domain-skill-service.js';

export type DomainSkillReadinessPosture = 'ready' | 'usable' | 'needs_input' | 'planned' | 'blocked';
export type DomainSkillInputStatus = 'present' | 'missing' | 'optional' | 'blocked';

export interface DomainSkillInputSignal {
  id: string;
  title: string;
  status: DomainSkillInputStatus;
  required: boolean;
  count: number;
  detail: string;
  evidenceIds: string[];
  route?: string;
}

export interface DomainSkillReadinessCard {
  id: string;
  skillId: string;
  title: string;
  category: DomainSkillCategory;
  skillStatus: RunDomainSkillView['status'];
  enabled: boolean;
  posture: DomainSkillReadinessPosture;
  summary: string;
  inputs: DomainSkillInputSignal[];
  evidenceRequirements: string[];
  allowedArtifacts: string[];
  excludedBehaviors: string[];
  recommendedTools: string[];
  safetyGates: string[];
  workerHandoff: string[];
  nextActions: string[];
  referenceAlignment: string[];
}

export interface DomainSkillReadinessGate {
  id: string;
  title: string;
  status: DomainSkillInputStatus;
  detail: string;
}

export interface DomainSkillReadinessReport {
  runId: string;
  generatedAt: string;
  mode: 'domain_skill_readiness';
  posture: DomainSkillReadinessPosture;
  summary: string;
  counts: {
    skills: number;
    enabledSkills: number;
    ready: number;
    usable: number;
    needsInput: number;
    planned: number;
    blocked: number;
    domainArtifacts: number;
    domainEvidence: number;
    reviewedEvidence: number;
    candidateFindings: number;
    confirmedFindings: number;
  };
  domains: DomainSkillReadinessCard[];
  gates: DomainSkillReadinessGate[];
  operatorNextActions: string[];
  workerContextRules: string[];
  referenceAlignment: string[];
  safetyNotes: string[];
}

interface DomainSignals {
  run: Run;
  evidence: Evidence[];
  reviewedEvidenceIds: Set<string>;
  usefulEvidenceIds: Set<string>;
  findings: Finding[];
  browserSnapshots: BrowserSnapshot[];
  captureImports: CaptureImport[];
  accessReviews: AccessReview[];
  sarifImports: SarifImport[];
  androidImports: AndroidManifestImport[];
  cloudIamImports: CloudIamImport[];
  identityGraphImports: IdentityGraphImport[];
  reportBundles: Evidence[];
  credentialReferences: number;
}

export class DomainSkillReadinessService {
  constructor(
    private readonly store: PlatformStore,
    private readonly skills: DomainSkillService,
  ) {}

  get(runId: string): DomainSkillReadinessReport {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const signals = collectSignals(this.store, run);
    const domainSkills = this.skills.listForRun(runId);
    const domains = domainSkills.map((skill) => domainCard(skill, signals));
    const counts = {
      skills: domains.length,
      enabledSkills: domains.filter((item) => item.enabled).length,
      ready: countPosture(domains, 'ready'),
      usable: countPosture(domains, 'usable'),
      needsInput: countPosture(domains, 'needs_input'),
      planned: countPosture(domains, 'planned'),
      blocked: countPosture(domains, 'blocked'),
      domainArtifacts:
        signals.browserSnapshots.length +
        signals.captureImports.length +
        signals.accessReviews.length +
        signals.sarifImports.length +
        signals.androidImports.length +
        signals.cloudIamImports.length +
        signals.identityGraphImports.length +
        signals.reportBundles.length,
      domainEvidence: signals.evidence.length,
      reviewedEvidence: signals.reviewedEvidenceIds.size,
      candidateFindings: signals.findings.filter((finding) => finding.validationState === 'candidate').length,
      confirmedFindings: signals.findings.filter((finding) => finding.validationState === 'confirmed').length,
    };
    const posture = overallPosture(counts, domains);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'domain_skill_readiness',
      posture,
      summary:
        `${counts.ready + counts.usable}/${counts.skills} domain skill(s) have usable run inputs. ` +
        `${counts.enabledSkills} enabled, ${counts.domainArtifacts} domain artifact(s), ` +
        `${counts.reviewedEvidence}/${counts.domainEvidence} evidence item(s) reviewed.`,
      counts,
      domains,
      gates: runGates(run, signals, counts),
      operatorNextActions: operatorNextActions(domains, counts),
      workerContextRules: [
        'Only enabled Domain Skills enter the Agent Worker envelope.',
        'A Domain Skill is a rigid context module, not a sub-agent, phase tree, or permission grant.',
        'Workers may use skill hints to shape hypotheses, but Tool Gateway still owns execution.',
        'Finding proposals remain candidate until same-run evidence and human validation support them.',
      ],
      referenceAlignment: [
        'DragonJAR Android Skill: copy the artifact-specific skill granularity, not a generic mobile playbook.',
        'Cairn: keep Skill count low and preserve Dispatcher-owned state-space search.',
        'ai-engineering-from-scratch: expose workbench-style readiness, expected artifacts, and verification gates.',
        'HexStrike/AutoRedTeam: route tool breadth into governed templates, imports, and connector backlog before Worker use.',
        'AIDA/WonderSuite: make local evidence and review state visible to the operator.',
      ],
      safetyNotes: [
        'This endpoint is read-only and does not enable skills, import artifacts, run tools, approve actions, or create findings.',
        'Missing inputs are surfaced as operator work, not silently invented Worker context.',
        'Raw credentials, raw traffic, and unredacted local evidence must not be copied into skill hints.',
        'R3 validation stays approval-gated and R4 behavior remains forbidden by default.',
      ],
    };
  }
}

function collectSignals(store: PlatformStore, run: Run): DomainSignals {
  const runId = run.id;
  const evidence = byRun(Object.values(store.state.evidence), runId);
  const reviews = byRun(Object.values(store.state.evidenceReviews), runId);
  return {
    run,
    evidence: evidence.filter((item) => item.kind !== 'replay_bundle'),
    reviewedEvidenceIds: new Set(reviews.map((review) => review.evidenceId)),
    usefulEvidenceIds: new Set(reviews.filter((review) => review.status === 'useful').map((review) => review.evidenceId)),
    findings: byRun(Object.values(store.state.findings), runId),
    browserSnapshots: byRun(Object.values(store.state.browserSnapshots), runId),
    captureImports: byRun(Object.values(store.state.captureImports), runId),
    accessReviews: byRun(Object.values(store.state.accessReviews), runId),
    sarifImports: byRun(Object.values(store.state.sarifImports), runId),
    androidImports: byRun(Object.values(store.state.androidManifestImports), runId),
    cloudIamImports: byRun(Object.values(store.state.cloudIamImports), runId),
    identityGraphImports: byRun(Object.values(store.state.identityGraphImports), runId),
    reportBundles: evidence.filter((item) => item.kind === 'replay_bundle'),
    credentialReferences: byRun(Object.values(store.state.credentialReferences), runId).filter((item) => item.status === 'active').length,
  };
}

function domainCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  if (skill.id === 'web.bounty-workspace') return webBountyCard(skill, signals);
  if (skill.id === 'web.high-risk-triage') return highRiskWebCard(skill, signals);
  if (skill.id === 'web.browser-proxy-runner') return browserProxyRunnerCard(skill, signals);
  if (skill.id === 'api.authz-workflow' || skill.id === 'api.graphql-oauth-review') return apiHighRiskCard(skill, signals);
  if (skill.id === 'mobile.android-apk') return androidCard(skill, signals);
  if (skill.id === 'sast.semgrep-baseline') return sastCard(skill, signals);
  if (skill.id === 'cloud.iam-audit') return cloudIamCard(skill, signals);
  if (skill.id === 'cloud.k8s-container-posture') return cloudNativeCard(skill, signals);
  if (skill.id === 'identity.ad-paths') return identityCard(skill, signals);
  if (skill.id === 'supply-chain.sca-secrets') return supplyChainCard(skill, signals);
  if (skill.id === 'network.external-surface-baseline') return externalSurfaceCard(skill, signals);
  if (skill.id === 'ai.agent-infra-security') return aiAgentSecurityCard(skill, signals);
  if (skill.id === 'reporting.commercial-handoff') return reportingCard(skill, signals);
  if (skill.id === 'ctf.flag-submit') return ctfCard(skill, signals);
  return genericCard(skill, signals);
}

function webBountyCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const httpEvidence = signals.evidence.filter((item) => item.kind === 'http_exchange');
  const screenshotEvidence = signals.evidence.filter((item) => item.kind === 'screenshot');
  const reviewed = signals.evidence.filter((item) => signals.reviewedEvidenceIds.has(item.id));
  const inputs = [
    input('web.http_exchange', 'HTTP exchange evidence', httpEvidence.length, 'Proxy, HAR, browser.navigate, or http.request captures.', true, httpEvidence.map((item) => item.id), 'POST /runs/{id}/captures/http-exchange'),
    input('web.browser_snapshot', 'Browser snapshot evidence', signals.browserSnapshots.length + screenshotEvidence.length, 'Rendered state for user-visible proof.', false, screenshotEvidence.map((item) => item.id), 'POST /runs/{id}/captures/browser-snapshot'),
    input('web.har_import', 'HAR import bridge', signals.captureImports.length, 'Browser or proxy HAR import when custom headers are unavailable.', false, flatten(signals.captureImports.map((item) => item.evidenceIds)), 'POST /runs/{id}/captures/har'),
    input('web.evidence_review', 'Human evidence review', reviewed.length, 'Operator review before commercial finding confirmation.', true, reviewed.map((item) => item.id), 'POST /evidence/{id}/review'),
    input('web.access_review', 'Authenticated access review', signals.accessReviews.length, 'Role-difference evidence for IDOR and authorization cases.', false, accessReviewEvidence(signals.accessReviews), 'POST /runs/{id}/access-reviews/compare'),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${httpEvidence.length} HTTP exchange(s), ${signals.browserSnapshots.length} snapshot(s), ${reviewed.length} reviewed evidence item(s).`,
    inputs,
    evidenceRequirements: ['At least one in-scope HTTP exchange or browser snapshot.', 'Useful human evidence review before confirmed delivery.', 'Finding must cite same-run evidence IDs.'],
    allowedArtifacts: ['HTTP exchange evidence', 'browser snapshots', 'HAR imports', 'access-review diffs', 'report/export bundles'],
    safetyGates: ['ScopePolicy check before capture', 'R3 approval for OAST or state-changing validation', 'raw_local_only evidence remains local'],
    nextActions: [
      ...(!skill.enabled ? [`Enable ${skill.name} when this run is a web bounty or SRC assessment.`] : []),
      ...(httpEvidence.length === 0 ? ['Capture one low-risk in-scope HTTP exchange through browser, proxy, HAR, or http.request.'] : []),
      ...(reviewed.length === 0 && signals.evidence.length > 0 ? ['Review captured evidence and mark useful items before confirming findings.'] : []),
      ...(signals.credentialReferences === 0 ? ['Add placeholder credential references before authenticated role-difference testing.'] : []),
    ],
    referenceAlignment: ['WonderSuite browser/proxy workflow', 'AIDA/CyberStrike evidence cards', 'pentest-agents scope/report gate'],
  });
}

function highRiskWebCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const httpEvidence = signals.evidence.filter((item) => item.kind === 'http_exchange');
  const commandEvidence = signals.evidence.filter((item) => item.kind === 'command_output');
  const useful = signals.evidence.filter((item) => signals.usefulEvidenceIds.has(item.id));
  const inputs = [
    input('web_high.http', 'HTTP/browser/proxy evidence', httpEvidence.length, 'Baseline and focused endpoint evidence for high-impact web hypotheses.', true, httpEvidence.map((item) => item.id)),
    input('web_high.scanner', 'Scanner or adapter evidence', commandEvidence.length, 'Template, scanner, source, or advisory evidence for SSRF/RCE/injection/upload/path traversal triage.', false, commandEvidence.map((item) => item.id)),
    input('web_high.oast', 'OAST callback evidence', signals.evidence.filter((item) => item.kind === 'oast_callback').length, 'Callback proof for blind SSRF/webhook cases; impact still needs review.', false),
    input('web_high.review', 'Useful evidence review', useful.length, 'Human-reviewed evidence before critical/high confidence.', true, useful.map((item) => item.id)),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${httpEvidence.length} HTTP evidence item(s), ${commandEvidence.length} scanner/source evidence item(s), ${useful.length} useful review(s).`,
    inputs,
    evidenceRequirements: ['In-scope HTTP/browser/proxy evidence.', 'Scanner/source/advisory evidence for high-risk hypothesis.', 'Human useful review before confirmed critical/high findings.'],
    allowedArtifacts: ['HTTP exchange', 'browser snapshot', 'OAST callback', 'scanner output', 'SARIF evidence', 'access-review diff'],
    safetyGates: ['R3 approval for state-changing, OAST, or exploit validation', 'No data exfiltration', 'No destructive commands', 'R4 remains blocked'],
    nextActions: [
      ...(!skill.enabled ? [`Enable ${skill.name} for enterprise web runs that must prioritize high-impact classes.`] : []),
      ...(httpEvidence.length === 0 ? ['Capture focused HTTP/browser evidence before proposing high-impact web findings.'] : []),
      ...(useful.length === 0 && signals.evidence.length > 0 ? ['Review the strongest evidence item and mark useful before confirmation.'] : []),
    ],
    referenceAlignment: ['Z3r0 penetration engineer lane', 'PentestGPT high-impact benchmark discipline', 'Burp/ZAP evidence-first workflow'],
  });
}

function browserProxyRunnerCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const screenshotEvidence = signals.evidence.filter((item) => item.kind === 'screenshot');
  const httpEvidence = signals.evidence.filter((item) => item.kind === 'http_exchange');
  const inputs = [
    input('runner.browser_snapshot', 'Browser snapshots', signals.browserSnapshots.length + screenshotEvidence.length, 'Rendered proof for JavaScript/session-heavy workflows.', true, screenshotEvidence.map((item) => item.id)),
    input('runner.proxy_or_har', 'Proxy or HAR captures', signals.captureImports.length + httpEvidence.length, 'Real traffic evidence for replay and access review.', true, flatten(signals.captureImports.map((item) => item.evidenceIds)).concat(httpEvidence.map((item) => item.id))),
    input('runner.access_review', 'Access review diffs', signals.accessReviews.length, 'Role or tenant comparison evidence generated from captured traffic.', false, accessReviewEvidence(signals.accessReviews)),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${signals.browserSnapshots.length} browser snapshot(s), ${signals.captureImports.length} HAR import(s), ${httpEvidence.length} HTTP evidence item(s).`,
    inputs,
    evidenceRequirements: ['Rendered browser snapshot or screenshot.', 'Proxy/HAR/HTTP exchange evidence.', 'Cookies and tokens must stay out of Worker context.'],
    allowedArtifacts: ['browser snapshot', 'screenshot evidence', 'HTTP exchange', 'HAR import', 'access-review diff'],
    safetyGates: ['Out-of-scope navigation blocked', 'raw cookies/tokens redacted', 'TLS MITM requires future local CA lifecycle approval'],
    nextActions: [
      ...(!skill.enabled ? ['Enable Browser Proxy Runner Workflow when JS/session evidence matters.'] : []),
      ...(signals.browserSnapshots.length === 0 ? ['Capture a browser snapshot or screenshot for rendered proof.'] : []),
      ...(signals.captureImports.length === 0 && httpEvidence.length === 0 ? ['Capture traffic through proxy, HAR import, browser.navigate, or http.request.'] : []),
    ],
    referenceAlignment: ['Z3r0 Docker sandbox execution surface', 'Playwright trace workflow', 'Burp/ZAP proxy model'],
  });
}

function apiHighRiskCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const httpEvidence = signals.evidence.filter((item) => item.kind === 'http_exchange');
  const differentialReviews = signals.accessReviews.filter((item) => item.status === 'differential_observed');
  const inputs = [
    input('api.http', 'API HTTP evidence', httpEvidence.length, 'API/OpenAPI/GraphQL/OAuth evidence from in-scope endpoints.', true, httpEvidence.map((item) => item.id)),
    input('api.credentials', 'Credential placeholders', signals.credentialReferences, 'Role or tenant placeholders for authz comparison.', true),
    input('api.access_review', 'Access review diffs', signals.accessReviews.length, 'Baseline/comparison evidence for BOLA, BFLA, resolver authz, or tenant isolation.', false, accessReviewEvidence(signals.accessReviews)),
    input('api.differential', 'Differential observed', differentialReviews.length, 'Observed response differences that still need human impact review.', false, accessReviewEvidence(differentialReviews)),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${httpEvidence.length} API evidence item(s), ${signals.credentialReferences} credential placeholder(s), ${signals.accessReviews.length} access review(s).`,
    inputs,
    evidenceRequirements: ['API HTTP evidence.', 'At least two placeholder credentials for role/tenant comparison.', 'Access-review diff before high-severity authz claims.'],
    allowedArtifacts: ['HTTP exchange', 'OpenAPI metadata', 'GraphQL plan output', 'OAuth/OIDC metadata', 'access-review diff'],
    safetyGates: ['No raw tokens', 'no credential replay', 'mutating checks are R3', 'introspection/authenticated validation remains approval-gated'],
    nextActions: [
      ...(!skill.enabled ? [`Enable ${skill.name} for API/identity-backed targets.`] : []),
      ...(signals.credentialReferences < 2 ? ['Create two role or tenant credential placeholders before authz comparison.'] : []),
      ...(httpEvidence.length === 0 ? ['Capture OpenAPI, GraphQL, OAuth/OIDC, or endpoint HTTP evidence.'] : []),
      ...(signals.accessReviews.length === 0 && signals.credentialReferences >= 2 && httpEvidence.length >= 2 ? ['Run access.compare_evidence across role-specific evidence.'] : []),
    ],
    referenceAlignment: ['OWASP API Top 10 evidence discipline', 'Z3r0 manual review records', 'PentestAgent black-box workflow'],
  });
}

function androidCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const evidenceIds = signals.androidImports.map((item) => item.evidenceId);
  const riskCount = signals.androidImports.reduce((total, item) => total + item.riskCount, 0);
  const inputs = [
    input('android.manifest', 'AndroidManifest.xml import', signals.androidImports.length, 'Normalized package, SDK, permissions, exported components, and manifest risk signals.', true, evidenceIds, 'POST /runs/{id}/android-manifest-imports'),
    input('android.findings', 'Manifest-derived findings', signals.androidImports.reduce((total, item) => total + item.importedFindings, 0), 'Candidate findings created from manifest evidence.', false, evidenceIds),
    input('android.dynamic_gate', 'Dynamic probe approval gate', 0, 'Frida/device actions are future R3 workflows and not enabled by this readiness card.', false),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${signals.androidImports.length} manifest import(s), ${riskCount} manifest risk signal(s).`,
    inputs,
    evidenceRequirements: ['Manifest import evidence for package and component state.', 'Explicit approval before dynamic device or Frida validation.', 'Candidate findings stay tied to manifest evidence.'],
    allowedArtifacts: ['AndroidManifest.xml text', 'normalized package metadata', 'risky permission list', 'exported component list', 'future MobSF/JADX/SARIF imports'],
    safetyGates: ['No device persistence', 'no credential extraction', 'dynamic testing is R3', 'APK paths stay local unless explicitly redacted'],
    nextActions: [
      ...(!skill.enabled ? ['Enable Android APK Assessment only for APK/package/device-scoped runs.'] : []),
      ...(signals.androidImports.length === 0 ? ['Import AndroidManifest.xml before asking Workers for Android-specific hypotheses.'] : []),
      ...(signals.androidImports.length > 0 && signals.findings.length === 0 ? ['Review manifest risk signals and promote only evidence-backed candidates.'] : []),
    ],
    referenceAlignment: ['DragonJAR Android-Pentesting-Skill artifact granularity', 'Cairn minimal Skill rule'],
  });
}

function sastCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const evidenceIds = signals.sarifImports.map((item) => item.evidenceId);
  const results = signals.sarifImports.reduce((total, item) => total + item.results, 0);
  const inputs = [
    input('sast.sarif', 'SARIF import', signals.sarifImports.length, 'Normalized local SAST or CI results.', true, evidenceIds, 'POST /runs/{id}/sarif-imports'),
    input('sast.result_volume', 'SAST result volume', results, 'Static findings become hypotheses until route, impact, and evidence are linked.', false, evidenceIds),
    input('sast.safe_runtime', 'Safe static runtime', signals.sarifImports.length, 'External Semgrep/toolbox runtime remains governed; SARIF import works without raw command execution.', false, evidenceIds),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${signals.sarifImports.length} SARIF import(s), ${results} static result(s).`,
    inputs,
    evidenceRequirements: ['SARIF evidence from local source or CI.', 'Code-location evidence must be linked to affected route or component.', 'Secrets and proprietary source snippets must be redacted.'],
    allowedArtifacts: ['SARIF JSON', 'rule metadata', 'file path and region metadata', 'redacted code evidence', 'future SBOM/SCA imports'],
    safetyGates: ['No secret exfiltration', 'bounded source scan scope', 'Toolbox runtime must fail closed unless explicitly enabled'],
    nextActions: [
      ...(!skill.enabled ? ['Enable Source SAST Baseline for source-code or CI-backed runs.'] : []),
      ...(signals.sarifImports.length === 0 ? ['Import SARIF before treating SAST as a run-ready Skill.'] : []),
      ...(signals.sarifImports.length > 0 ? ['Triage SARIF results into evidence-backed hypotheses instead of auto-confirming static alerts.'] : []),
    ],
    referenceAlignment: ['ai-engineering-from-scratch tool registry and eval harness', 'CAI/Apex trace/eval posture', 'AutoRedTeam CI/SARIF surface'],
  });
}

function cloudIamCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const evidenceIds = signals.cloudIamImports.map((item) => item.evidenceId);
  const risks = signals.cloudIamImports.reduce((total, item) => total + item.riskCount, 0);
  const inputs = [
    input('cloud.iam_policy', 'Cloud IAM policy import', signals.cloudIamImports.length, 'Read-only policy JSON and normalized risk signals.', true, evidenceIds, 'POST /runs/{id}/cloud-iam-imports'),
    input('cloud.risk_signals', 'IAM risk signals', risks, 'Wildcard admin, PassRole, AssumeRole, policy mutation, or broad conditionless allows.', false, evidenceIds),
    input('cloud.credentials', 'Credential placeholder references', signals.credentialReferences, 'Credentials must stay placeholder-only and local.', false),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${signals.cloudIamImports.length} IAM import(s), ${risks} risk signal(s), ${signals.credentialReferences} credential reference(s).`,
    inputs,
    evidenceRequirements: ['IAM JSON import evidence.', 'Principal/resource/action risk signal evidence.', 'No raw cloud credentials in prompts, graph hints, reports, or cloud sync.'],
    allowedArtifacts: ['IAM policy JSON', 'read-only inventory summaries', 'normalized principal/action/resource signals', 'credential placeholders'],
    safetyGates: ['Read-only by default', 'no key harvesting', 'no destructive cloud action', 'credential material remains local'],
    nextActions: [
      ...(!skill.enabled ? ['Enable Cloud IAM Audit only for approved cloud posture reviews.'] : []),
      ...(signals.cloudIamImports.length === 0 ? ['Import IAM policy JSON before cloud-specific Worker reasoning.'] : []),
      ...(signals.credentialReferences === 0 ? ['Use placeholder references for any future authenticated read-only validation.'] : []),
    ],
    referenceAlignment: ['Enterprise private worker node requirement', 'ai-engineering-from-scratch verification gates'],
  });
}

function identityCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const evidenceIds = signals.identityGraphImports.map((item) => item.evidenceId);
  const risks = signals.identityGraphImports.reduce((total, item) => total + item.riskCount, 0);
  const differentialReviews = signals.accessReviews.filter((item) => item.status === 'differential_observed');
  const inputs = [
    input('identity.graph', 'Identity graph import', signals.identityGraphImports.length, 'BloodHound-style graph evidence for read-only path review.', true, evidenceIds, 'POST /runs/{id}/identity-graph-imports'),
    input('identity.risky_paths', 'Risky identity paths', risks, 'High-value nodes, risky edges, or privilege path signals.', false, evidenceIds),
    input('identity.access_reviews', 'Access-review comparisons', signals.accessReviews.length, 'Role-difference evidence from same-run baseline and comparison captures.', false, accessReviewEvidence(signals.accessReviews), 'POST /runs/{id}/access-reviews/compare'),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${signals.identityGraphImports.length} graph import(s), ${risks} path signal(s), ${differentialReviews.length} differential review(s).`,
    inputs,
    evidenceRequirements: ['Identity graph import evidence.', 'Risky path evidence before findings.', 'Active validation requires explicit approval and scoped credentials.'],
    allowedArtifacts: ['BloodHound-style graph JSON', 'node/edge risk summaries', 'role comparison evidence', 'control validation notes'],
    safetyGates: ['Review-only by default', 'no password spraying', 'no lateral movement execution', 'no persistence'],
    nextActions: [
      ...(!skill.enabled ? ['Enable AD Identity Path Review only for internal authorized environments.'] : []),
      ...(signals.identityGraphImports.length === 0 ? ['Import an identity graph before AD/path-specific Worker context is useful.'] : []),
      ...(signals.accessReviews.length === 0 ? ['Use access reviews for role-difference proof when web or identity evidence exists.'] : []),
    ],
    referenceAlignment: ['Enterprise identity module', 'AIDA evidence review loop'],
  });
}

function cloudNativeCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const commandEvidence = signals.evidence.filter((item) => item.kind === 'command_output');
  const inputs = [
    input('cloud_native.iam', 'Cloud IAM imports', signals.cloudIamImports.length, 'Read-only IAM policy evidence for cloud-native privilege context.', false, signals.cloudIamImports.map((item) => item.evidenceId)),
    input('cloud_native.posture', 'K8s/container posture evidence', commandEvidence.length, 'Read-only manifests, RBAC, workload, image, or scanner output evidence.', true, commandEvidence.map((item) => item.id)),
    input('cloud_native.findings', 'Candidate findings', signals.findings.length, 'Evidence-backed cloud-native findings in review.', false, flatten(signals.findings.map((item) => item.evidenceIds))),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${signals.cloudIamImports.length} IAM import(s), ${commandEvidence.length} command/scanner evidence item(s).`,
    inputs,
    evidenceRequirements: ['Read-only posture evidence for RBAC/workload/container risk.', 'Affected namespace, service account, workload, or principal context.', 'No secret extraction.'],
    allowedArtifacts: ['IAM policy JSON', 'K8s manifest', 'RBAC scanner output', 'container posture output', 'file hash'],
    safetyGates: ['No kubectl apply/delete/exec', 'no pod escape execution', 'no secret reads', 'cluster actions require explicit ROE'],
    nextActions: [
      ...(!skill.enabled ? ['Enable Kubernetes And Container Posture for approved cloud-native assessments.'] : []),
      ...(commandEvidence.length === 0 ? ['Import or capture read-only K8s/container posture evidence.'] : []),
    ],
    referenceAlignment: ['CIS Kubernetes Benchmark', 'Prowler posture workflow', 'Z3r0 sandbox binding model'],
  });
}

function supplyChainCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const sarifEvidence = signals.sarifImports.map((item) => item.evidenceId);
  const commandEvidence = signals.evidence.filter((item) => item.kind === 'command_output' || item.kind === 'file_hash');
  const inputs = [
    input('supply.sarif', 'SARIF/SCA imports', signals.sarifImports.length, 'Static, dependency, or secret-scanning evidence.', false, sarifEvidence),
    input('supply.command', 'Scanner/file-hash evidence', commandEvidence.length, 'SBOM, SCA, CI/CD, or secret exposure output.', true, commandEvidence.map((item) => item.id)),
    input('supply.reviewed', 'Useful reviewed evidence', signals.usefulEvidenceIds.size, 'Human review before lifecycle or customer-facing reporting.', true, [...signals.usefulEvidenceIds]),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${signals.sarifImports.length} SARIF import(s), ${commandEvidence.length} scanner/file evidence item(s), ${signals.usefulEvidenceIds.size} useful review(s).`,
    inputs,
    evidenceRequirements: ['SBOM/SCA/SARIF/secret-scan evidence.', 'Reachability and deployment context before high severity.', 'Secret values must never be reproduced.'],
    allowedArtifacts: ['SARIF', 'SBOM output', 'secret scan output with values redacted', 'file hash', 'CI/CD config evidence'],
    safetyGates: ['No secret replay', 'no raw secret values', 'no pipeline dispatch', 'owner review before disclosure'],
    nextActions: [
      ...(!skill.enabled ? ['Enable Supply Chain And Secrets Exposure for source, CI/CD, SBOM, or dependency runs.'] : []),
      ...(commandEvidence.length === 0 && signals.sarifImports.length === 0 ? ['Import SARIF/SBOM/SCA or secret-scanning evidence.'] : []),
    ],
    referenceAlignment: ['Dependency-Track component risk model', 'Semgrep/SARIF workflow', 'DefectDojo lifecycle'],
  });
}

function externalSurfaceCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const commandEvidence = signals.evidence.filter((item) => item.kind === 'command_output');
  const httpEvidence = signals.evidence.filter((item) => item.kind === 'http_exchange');
  const inputs = [
    input('surface.scope', 'Allowed asset scope', signals.run.scopePolicy.allowedAssets.length, 'Explicit approved asset set for external surface mapping.', true),
    input('surface.metadata', 'DNS/TLS/service evidence', commandEvidence.length + httpEvidence.length, 'Scoped DNS, TLS, HTTP, or service inventory evidence.', true, commandEvidence.concat(httpEvidence).map((item) => item.id)),
    input('surface.blockers', 'Denied assets configured', signals.run.scopePolicy.deniedAssets.length, 'Deny rules reduce accidental out-of-scope exploration.', false),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${signals.run.scopePolicy.allowedAssets.length} allowed asset rule(s), ${commandEvidence.length + httpEvidence.length} surface evidence item(s).`,
    inputs,
    evidenceRequirements: ['Explicit allowlist scope.', 'DNS/TLS/HTTP/service metadata evidence.', 'Prioritize exposed admin, identity, cloud, and database surfaces.'],
    allowedArtifacts: ['DNS records', 'TLS certificate metadata', 'HTTP fingerprint evidence', 'bounded scanner output'],
    safetyGates: ['No internet-wide scanning', 'no brute force', 'no exploit spraying', 'rate limits enforced'],
    nextActions: [
      ...(!skill.enabled ? ['Enable External Surface Baseline for internet-facing enterprise assessments.'] : []),
      ...(commandEvidence.length + httpEvidence.length === 0 ? ['Capture DNS/TLS/HTTP or governed inventory evidence.'] : []),
    ],
    referenceAlignment: ['ProjectDiscovery inventory workflow', 'Faraday asset model', 'Z3r0 controlled sandbox execution'],
  });
}

function aiAgentSecurityCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const commandEvidence = signals.evidence.filter((item) => item.kind === 'command_output');
  const httpEvidence = signals.evidence.filter((item) => item.kind === 'http_exchange');
  const screenshotEvidence = signals.evidence.filter((item) => item.kind === 'screenshot');
  const inputs = [
    input('ai.eval', 'AI eval or scanner evidence', commandEvidence.length, 'promptfoo, PyRIT, AI-Infra-Guard, MCP/skill scan, or tool trace evidence.', true, commandEvidence.map((item) => item.id)),
    input('ai.http', 'AI app HTTP/browser evidence', httpEvidence.length + screenshotEvidence.length, 'Application, agent, or tool-call boundary evidence.', false, httpEvidence.concat(screenshotEvidence).map((item) => item.id)),
    input('ai.reviewed', 'Useful reviewed evidence', signals.usefulEvidenceIds.size, 'Operator-reviewed impact outside the model under test.', true, [...signals.usefulEvidenceIds]),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${commandEvidence.length} eval/scanner evidence item(s), ${httpEvidence.length + screenshotEvidence.length} app evidence item(s).`,
    inputs,
    evidenceRequirements: ['External eval/scanner or tool trace evidence.', 'Impact tied to unauthorized tool use, data exposure, or policy bypass.', 'Scoring outside the model under test.'],
    allowedArtifacts: ['promptfoo/PyRIT result', 'AI-Infra-Guard scan output', 'MCP/skill manifest scan', 'redacted tool trace', 'HTTP/browser evidence'],
    safetyGates: ['No prompt theft', 'no unsafe tool execution', 'no unredacted transcript export', 'model cannot self-score'],
    nextActions: [
      ...(!skill.enabled ? ['Enable AI Agent Infrastructure Security for AI app, MCP, skill, or tool-calling systems.'] : []),
      ...(commandEvidence.length === 0 ? ['Import AI-agent security eval or MCP/skill scan evidence.'] : []),
    ],
    referenceAlignment: ['Tencent AI-Infra-Guard', 'promptfoo red-team eval', 'PyRIT scorer/orchestrator pattern'],
  });
}

function reportingCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const safeEvidence = signals.evidence.filter((item) => item.redactionState === 'redacted' || item.redactionState === 'safe_for_cloud');
  const confirmed = signals.findings.filter((item) => item.validationState === 'confirmed');
  const inputs = [
    input('report.safe_evidence', 'Redacted or cloud-safe evidence', safeEvidence.length, 'Evidence eligible for commercial report/export bundles.', true, safeEvidence.map((item) => item.id), 'POST /runs/{id}/exports'),
    input('report.confirmed_findings', 'Confirmed findings', confirmed.length, 'Findings validated by an operator before customer-facing output.', true, flatten(confirmed.map((item) => item.evidenceIds)), 'POST /findings/{id}/validation'),
    input('report.bundle', 'Report or replay bundle', signals.reportBundles.length, 'Generated handoff artifacts for HackerOne, Bugcrowd, SRC, or enterprise reporting.', false, signals.reportBundles.map((item) => item.id), 'POST /reports'),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${confirmed.length} confirmed finding(s), ${safeEvidence.length} report-safe evidence item(s), ${signals.reportBundles.length} bundle(s).`,
    inputs,
    evidenceRequirements: ['Confirmed findings must cite same-run evidence.', 'Report/export must omit raw_local_only evidence unless explicitly redacted.', 'Every report bundle should be hashable and replayable.'],
    allowedArtifacts: ['confirmed-only report bundles', 'candidate-and-confirmed internal reports', 'run export bundle', 'safe evidence index'],
    safetyGates: ['No external submission without operator review', 'no raw credentials', 'no raw local-only traffic in cloud handoff'],
    nextActions: [
      ...(!skill.enabled ? ['Enable Commercial Report Handoff when the run has deliverable findings.'] : []),
      ...(confirmed.length === 0 ? ['Confirm or reject candidate findings before delivery.'] : []),
      ...(safeEvidence.length === 0 && signals.evidence.length > 0 ? ['Redact or mark evidence safe before generating customer-facing bundles.'] : []),
      ...(confirmed.length > 0 && signals.reportBundles.length === 0 ? ['Generate a confirmed-only report or run export bundle.'] : []),
    ],
    referenceAlignment: ['pentest-agents submit gate', 'AIDA/CyberStrike reporting handoff', 'ai-engineering-from-scratch Ship It artifact rule'],
  });
}

function ctfCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const goalLooksLikeCtf = /\b(ctf|flag|scoreboard|competition)\b/i.test(`${signals.run.goal} ${signals.run.target}`);
  const inputs = [
    input('ctf.goal', 'Competition goal', goalLooksLikeCtf ? 1 : 0, 'Run goal explicitly mentions CTF, flag, scoreboard, or competition.', true),
    input('ctf.evidence', 'Flag evidence', 0, 'Future flag validation/submission evidence.', true),
  ];
  return card({
    skill,
    signals,
    posture: 'planned',
    summary: goalLooksLikeCtf ? 'Goal looks like a CTF run, but the flag submit adapter is still planned.' : 'No CTF/flag goal detected; adapter remains planned.',
    inputs,
    evidenceRequirements: ['Future flag evidence and scoreboard response evidence.', 'Operator approval before any external submission.'],
    allowedArtifacts: ['flag format note', 'scoreboard response evidence', 'submission audit record'],
    safetyGates: ['No external submission adapter yet', 'no generic CTF exploit playbook', 'operator approval required'],
    nextActions: ['Keep CTF flag submission as a narrow adapter; do not turn it into a generic exploit methodology Skill.'],
    referenceAlignment: ['Cairn flag submission Skill'],
  });
}

function genericCard(skill: RunDomainSkillView, signals: DomainSignals): DomainSkillReadinessCard {
  const evidence = signals.evidence.filter((item) => signals.reviewedEvidenceIds.has(item.id));
  const inputs = [
    input('generic.reviewed_evidence', 'Reviewed evidence', evidence.length, 'Evidence reviewed by the operator.', true, evidence.map((item) => item.id)),
  ];
  return card({
    skill,
    signals,
    posture: readiness(skill, inputs),
    summary: `${evidence.length} reviewed evidence item(s).`,
    inputs,
    evidenceRequirements: ['Reviewed same-run evidence before delivery.'],
    allowedArtifacts: ['domain-specific evidence only'],
    safetyGates: ['Skill does not grant permissions or tools.'],
    nextActions: [`Define concrete artifact requirements for ${skill.name}.`],
    referenceAlignment: ['Cairn minimal Skill discipline'],
  });
}

function card(input: {
  skill: RunDomainSkillView;
  signals: DomainSignals;
  posture: DomainSkillReadinessPosture;
  summary: string;
  inputs: DomainSkillInputSignal[];
  evidenceRequirements: string[];
  allowedArtifacts: string[];
  safetyGates: string[];
  nextActions: string[];
  referenceAlignment: string[];
}): DomainSkillReadinessCard {
  return {
    id: `domain_readiness.${input.skill.id}`,
    skillId: input.skill.id,
    title: input.skill.name,
    category: input.skill.category,
    skillStatus: input.skill.status,
    enabled: input.skill.enabled,
    posture: input.posture,
    summary: input.summary,
    inputs: input.inputs,
    evidenceRequirements: input.evidenceRequirements,
    allowedArtifacts: input.allowedArtifacts,
    excludedBehaviors: [...input.skill.excludedUseCases],
    recommendedTools: [...input.skill.recommendedTools],
    safetyGates: input.safetyGates,
    workerHandoff: input.skill.enabled
      ? [
          'Included in future Agent Worker envelopes as narrow domain context.',
          ...input.skill.workerHints.slice(0, 3),
        ]
      : ['Not included in Worker envelopes until the operator enables this Skill for the run.'],
    nextActions: unique(input.nextActions).slice(0, 5),
    referenceAlignment: input.referenceAlignment,
  };
}

function readiness(skill: RunDomainSkillView, inputs: DomainSkillInputSignal[]): DomainSkillReadinessPosture {
  if (skill.status === 'planned') return 'planned';
  const required = inputs.filter((item) => item.required);
  const presentRequired = required.filter((item) => item.status === 'present').length;
  if (required.some((item) => item.status === 'blocked')) return 'blocked';
  if (presentRequired === required.length && required.length > 0) return skill.enabled ? 'ready' : 'usable';
  if (presentRequired > 0) return 'usable';
  return 'needs_input';
}

function input(
  id: string,
  title: string,
  count: number,
  detail: string,
  required: boolean,
  evidenceIds: string[] = [],
  route?: string,
): DomainSkillInputSignal {
  return {
    id,
    title,
    status: count > 0 ? 'present' : required ? 'missing' : 'optional',
    required,
    count,
    detail,
    evidenceIds,
    route,
  };
}

function runGates(
  run: Run,
  signals: DomainSignals,
  counts: DomainSkillReadinessReport['counts'],
): DomainSkillReadinessGate[] {
  return [
    {
      id: 'gate.scope',
      title: 'Scope and goal anchor',
      status: run.scopePolicy.allowedAssets.length > 0 ? 'present' : 'missing',
      detail: `${run.scopePolicy.allowedAssets.length} allowed asset rule(s), ${run.scopePolicy.deniedAssets.length} denied rule(s).`,
    },
    {
      id: 'gate.enabled_context',
      title: 'Enabled Skill context',
      status: counts.enabledSkills > 0 ? 'present' : 'missing',
      detail: `${counts.enabledSkills}/${counts.skills} skill(s) enabled for Worker envelopes.`,
    },
    {
      id: 'gate.domain_artifacts',
      title: 'Domain artifacts',
      status: counts.domainArtifacts > 0 ? 'present' : 'missing',
      detail: `${counts.domainArtifacts} import/snapshot/review/report artifact(s) are attached to the run.`,
    },
    {
      id: 'gate.evidence_review',
      title: 'Evidence review',
      status: counts.domainEvidence === 0 ? 'missing' : counts.reviewedEvidence > 0 ? 'present' : 'missing',
      detail: `${counts.reviewedEvidence}/${counts.domainEvidence} non-report evidence item(s) reviewed.`,
    },
    {
      id: 'gate.report_safety',
      title: 'Report safety',
      status: signals.evidence.some((item) => item.redactionState === 'raw_local_only') && counts.confirmedFindings > 0 ? 'missing' : 'present',
      detail: `${signals.reportBundles.length} report bundle(s); raw local-only evidence is excluded from commercial handoff by default.`,
    },
  ];
}

function operatorNextActions(
  domains: DomainSkillReadinessCard[],
  counts: DomainSkillReadinessReport['counts'],
): string[] {
  const actions = [];
  const notEnabledWithInputs = domains.find((domain) => !domain.enabled && domain.posture === 'usable');
  const needsInput = domains.find((domain) => domain.posture === 'needs_input');
  if (notEnabledWithInputs) {
    actions.push(`Enable ${notEnabledWithInputs.title}; the run already has useful input artifacts for it.`);
  }
  if (needsInput) {
    actions.push(`${needsInput.title}: ${needsInput.nextActions[0] || 'Add the required domain artifact.'}`);
  }
  if (counts.enabledSkills === 0) {
    actions.push('Enable only the one or two Domain Skills that match this run; keep generic process guidance out.');
  }
  if (counts.domainArtifacts === 0) {
    actions.push('Import one rigid artifact such as SARIF, AndroidManifest.xml, IAM policy JSON, identity graph JSON, HAR, or browser snapshot.');
  }
  if (counts.domainEvidence > 0 && counts.reviewedEvidence === 0) {
    actions.push('Review evidence before allowing any Skill-backed finding to become commercial output.');
  }
  actions.push('Use this readiness view as the Skill workbench; active execution still goes through Dispatcher and Tool Gateway.');
  return unique(actions).slice(0, 7);
}

function overallPosture(
  counts: DomainSkillReadinessReport['counts'],
  domains: DomainSkillReadinessCard[],
): DomainSkillReadinessPosture {
  if (domains.some((item) => item.posture === 'blocked')) return 'blocked';
  if (counts.ready >= 2 || (counts.ready >= 1 && counts.usable >= 1)) return 'ready';
  if (counts.ready + counts.usable > 0) return 'usable';
  if (counts.planned === counts.skills) return 'planned';
  return 'needs_input';
}

function accessReviewEvidence(reviews: AccessReview[]): string[] {
  return flatten(
    reviews.map((item) =>
      [item.baselineEvidenceId, item.comparisonEvidenceId, item.diffEvidenceId].filter(Boolean) as string[],
    ),
  );
}

function countPosture(items: DomainSkillReadinessCard[], posture: DomainSkillReadinessPosture): number {
  return items.filter((item) => item.posture === posture).length;
}

function byRun<T extends { runId: string }>(items: T[], runId: string): T[] {
  return items.filter((item) => item.runId === runId);
}

function flatten<T>(items: T[][]): T[] {
  return items.reduce<T[]>((result, item) => result.concat(item), []);
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
