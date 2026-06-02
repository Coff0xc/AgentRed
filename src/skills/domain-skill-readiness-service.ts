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
  if (skill.id === 'mobile.android-apk') return androidCard(skill, signals);
  if (skill.id === 'sast.semgrep-baseline') return sastCard(skill, signals);
  if (skill.id === 'cloud.iam-audit') return cloudIamCard(skill, signals);
  if (skill.id === 'identity.ad-paths') return identityCard(skill, signals);
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
