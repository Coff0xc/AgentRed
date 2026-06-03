export type RiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
export type RunStatus = 'active' | 'completed' | 'stopped';
export type IntentStatus = 'open' | 'claimed' | 'concluded' | 'released';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ProxySessionStatus = 'active' | 'closed';
export type BrowserSessionStatus = 'active' | 'closed';
export type OastSessionStatus = 'active' | 'closed';
export type CredentialReferenceStatus = 'active' | 'revoked';
export type CredentialReferenceKind = 'vault_reference' | 'header_placeholder' | 'cookie_placeholder' | 'account_note';
export type AccessReviewStatus = 'draft' | 'evidence_ready' | 'differential_observed' | 'no_difference' | 'needs_review';
export type AccessReviewSide = 'baseline' | 'comparison';
export type SarifImportStatus = 'imported';
export type ScannerResultImportStatus = 'imported';
export type ScannerResultEngine = 'nuclei' | 'semgrep' | 'generic';
export type CaptureImportStatus = 'imported';
export type AndroidManifestImportStatus = 'imported';
export type ProgramScopeImportStatus = 'imported';
export type RunExportStatus = 'generated';
export type CloudIamImportStatus = 'imported';
export type CloudProvider = 'aws' | 'generic';
export type IdentityGraphImportStatus = 'imported';
export type IdentityGraphProvider = 'bloodhound' | 'generic';
export type CaptureImportKind = 'har';
export type BrowserSnapshotSource = 'browser' | 'desktop' | 'manual';
export type ProgramScopeImportFormat = 'hackerone' | 'bugcrowd' | 'src' | 'enterprise' | 'generic_json';
export type EvidenceReviewStatus = 'useful' | 'not_relevant' | 'needs_more_context';
export type EvidenceKind =
  | 'http_exchange'
  | 'screenshot'
  | 'command_output'
  | 'oast_callback'
  | 'file_hash'
  | 'replay_bundle';
export type RedactionState = 'raw_local_only' | 'redacted' | 'safe_for_cloud';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'confirmed' | 'likely' | 'needs_dynamic_confirmation';
export type ValidationState = 'candidate' | 'confirmed' | 'rejected';
export type WorkerType = 'mock' | 'claude' | 'codex' | 'gemini' | 'kimi';
export type DomainSkillCategory =
  | 'web'
  | 'api'
  | 'mobile'
  | 'cloud'
  | 'container'
  | 'identity'
  | 'sast'
  | 'supply_chain'
  | 'network'
  | 'ai_security'
  | 'ctf'
  | 'reporting';
export type DomainSkillStatus = 'ready' | 'external_required' | 'planned';
export type PocTemplateCategory =
  | 'web'
  | 'api'
  | 'auth'
  | 'oauth'
  | 'oast'
  | 'mobile'
  | 'cloud'
  | 'container'
  | 'sast'
  | 'supply_chain'
  | 'secrets'
  | 'network'
  | 'ai_security';
export type PocTemplateStatus = 'ready' | 'external_required' | 'planned';
export type RegisteredToolboxBundleStatus = 'available' | 'partial' | 'planned' | 'unavailable';
export type ConnectorKind = 'mcp' | 'cli' | 'http_api' | 'container';
export type ConnectorStatus = 'available' | 'partial' | 'planned' | 'disabled';
export type ConnectorRunStatus = 'completed' | 'partial' | 'blocked' | 'approval_required';
export type ToolPackRunStatus = 'completed' | 'partial' | 'blocked' | 'approval_required';
export type AttackSurfaceAssetKind =
  | 'target'
  | 'host'
  | 'url'
  | 'cloud_principal'
  | 'identity_node'
  | 'mobile_package'
  | 'source_artifact';
export type AttackSurfaceEndpointSource =
  | 'run_target'
  | 'http_exchange'
  | 'browser_snapshot'
  | 'har'
  | 'scanner_template';
export type SearchFrontierPriority = 'high' | 'medium' | 'low';
export type SearchFrontierSource = 'intent' | 'strategy' | 'evidence_gap' | 'connector_gap' | 'domain_signal';
export type RunEventLevel = 'info' | 'warning' | 'error';
export type TraceSpanKind = 'dispatch' | 'worker' | 'tool' | 'report' | 'evaluation';
export type TraceSpanStatus = 'ok' | 'error' | 'blocked' | 'approval_required' | 'skipped' | 'timeout';
export type CostLedgerSource = 'worker' | 'tool' | 'report' | 'evaluation';
export type CostLedgerUnit = 'request' | 'millisecond' | 'token' | 'usd';
export type EvaluationCheckStatus = 'pass' | 'warn' | 'fail';
export type RunEventType =
  | 'run.created'
  | 'run.completed'
  | 'hint.added'
  | 'fact.added'
  | 'intent.created'
  | 'intent.claimed'
  | 'intent.heartbeat'
  | 'intent.released'
  | 'intent.concluded'
  | 'dispatch.started'
  | 'dispatch.completed'
  | 'dispatch.skipped'
  | 'dispatch.failed'
  | 'autopilot.tick'
  | 'search.advance'
  | 'skill.enabled'
  | 'poc.template.enabled'
  | 'toolbox.bundle.enabled'
  | 'connector.enabled'
  | 'connector.run.started'
  | 'connector.run.completed'
  | 'toolpack.started'
  | 'toolpack.completed'
  | 'tool.allowed'
  | 'tool.blocked'
  | 'approval.requested'
  | 'approval.decided'
  | 'evidence.added'
  | 'finding.proposed'
  | 'finding.validated'
  | 'report.generated'
  | 'run.export.generated'
  | 'browser.session.started'
  | 'browser.session.navigated'
  | 'browser.snapshot.captured'
  | 'browser.session.closed'
  | 'proxy.session.started'
  | 'proxy.session.closed'
  | 'oast.session.started'
  | 'oast.callback.received'
  | 'oast.session.closed'
  | 'credential.reference.created'
  | 'credential.reference.revoked'
  | 'credential.placeholder.used'
  | 'access.review.created'
  | 'access.review.evidence_attached'
  | 'access.review.compared'
  | 'android.manifest.imported'
  | 'cloud.iam.imported'
  | 'identity.graph.imported'
  | 'capture.imported'
  | 'sarif.imported'
  | 'scanner.result.imported'
  | 'evidence.reviewed';
export type RunPhase = 'bootstrapping' | 'reasoning' | 'queued' | 'exploring' | 'awaiting_approval' | 'completed' | 'stopped';

export interface ScopePolicy {
  allowedAssets: string[];
  deniedAssets: string[];
  allowedMethods: string[];
  destructiveAllowed: boolean;
  credentialRules: {
    allowVaultReferencesOnly: boolean;
  };
  rateLimits: {
    requestsPerMinute: number;
  };
}

export interface WorkerConfig {
  name: string;
  type: WorkerType;
  maxRunning: number;
  priority: number;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface DomainSkill {
  id: string;
  name: string;
  category: DomainSkillCategory;
  status: DomainSkillStatus;
  description: string;
  rigidUseCases: string[];
  excludedUseCases: string[];
  recommendedTools: string[];
  requiredToolboxProfiles: string[];
  workerHints: string[];
  riskNotes: string[];
  references: string[];
}

export interface RunSkillBinding {
  id: string;
  runId: string;
  skillId: string;
  enabledAt: string;
  enabledBy: 'operator' | 'system';
}

export interface PocTemplate {
  id: string;
  name: string;
  category: PocTemplateCategory;
  status: PocTemplateStatus;
  description: string;
  vulnerabilityClasses: string[];
  requiredEvidence: EvidenceKind[];
  recommendedTools: string[];
  workerHints: string[];
  safetyNotes: string[];
  references: string[];
  tags: string[];
}

export interface RunPocTemplateBinding {
  id: string;
  runId: string;
  templateId: string;
  enabledAt: string;
  enabledBy: 'operator' | 'system';
}

export interface RunToolboxBundleBinding {
  id: string;
  runId: string;
  bundleId: string;
  enabledAt: string;
  enabledBy: 'operator' | 'system';
}

export interface RunConnectorBinding {
  id: string;
  runId: string;
  connectorId: string;
  enabledAt: string;
  enabledBy: 'operator' | 'system';
}

export interface SarifImport {
  id: string;
  runId: string;
  source: string;
  status: SarifImportStatus;
  evidenceId: string;
  inputSha256: string;
  runs: number;
  rules: number;
  results: number;
  importedFindings: number;
  findingIds: string[];
  createdAt: string;
}

export interface ScannerResultImport {
  id: string;
  runId: string;
  source: string;
  engine: ScannerResultEngine;
  status: ScannerResultImportStatus;
  evidenceId: string;
  inputSha256: string;
  results: number;
  highOrCritical: number;
  affectedAssets: string[];
  importedFindings: number;
  findingIds: string[];
  createdAt: string;
}

export interface CaptureImportSkippedEntry {
  index: number;
  target?: string;
  reason: string;
}

export interface CaptureImport {
  id: string;
  runId: string;
  kind: CaptureImportKind;
  source: string;
  status: CaptureImportStatus;
  inputSha256: string;
  totalEntries: number;
  processedEntries: number;
  imported: number;
  skipped: number;
  truncatedEntries: number;
  evidenceIds: string[];
  skippedEntries: CaptureImportSkippedEntry[];
  createdAt: string;
}

export interface ProgramScopeImport {
  id: string;
  source: string;
  format: ProgramScopeImportFormat;
  status: ProgramScopeImportStatus;
  inputSha256: string;
  allowedAssetCount: number;
  deniedAssetCount: number;
  allowedMethods: string[];
  requestsPerMinute: number;
  destructiveAllowed: boolean;
  allowVaultReferencesOnly: boolean;
  defaultTarget?: string;
  scopePolicy: ScopePolicy;
  notes: string[];
  createdAt: string;
}

export interface BrowserSnapshot {
  id: string;
  runId: string;
  source: BrowserSnapshotSource;
  target: string;
  title?: string;
  screenshotEvidenceId?: string;
  textEvidenceId?: string;
  evidenceIds: string[];
  screenshotBytes?: number;
  screenshotContentType?: string;
  textPreviewTruncated: boolean;
  createdAt: string;
}

export interface AndroidManifestComponent {
  type: 'activity' | 'activity-alias' | 'service' | 'receiver' | 'provider';
  name: string;
  exported?: boolean;
  permission?: string;
  grantUriPermissions?: boolean;
}

export interface AndroidManifestImport {
  id: string;
  runId: string;
  source: string;
  status: AndroidManifestImportStatus;
  evidenceId: string;
  inputSha256: string;
  packageName?: string;
  minSdk?: string;
  targetSdk?: string;
  permissions: string[];
  riskyPermissions: string[];
  exportedComponents: AndroidManifestComponent[];
  riskCount: number;
  importedFindings: number;
  findingIds: string[];
  createdAt: string;
}

export interface CloudIamRiskSignal {
  key: string;
  title: string;
  severity: Severity;
  statementIndex: number;
  effect: string;
  actions: string[];
  resources: string[];
  reason: string;
}

export interface CloudIamImport {
  id: string;
  runId: string;
  source: string;
  provider: CloudProvider;
  status: CloudIamImportStatus;
  evidenceId: string;
  inputSha256: string;
  policyName?: string;
  principal?: string;
  statementCount: number;
  allowStatementCount: number;
  wildcardActionCount: number;
  wildcardResourceCount: number;
  riskCount: number;
  riskSignals: CloudIamRiskSignal[];
  importedFindings: number;
  findingIds: string[];
  createdAt: string;
}

export interface IdentityGraphRiskSignal {
  key: string;
  title: string;
  severity: Severity;
  principal?: string;
  target?: string;
  edgeType?: string;
  reason: string;
}

export interface IdentityGraphImport {
  id: string;
  runId: string;
  source: string;
  provider: IdentityGraphProvider;
  status: IdentityGraphImportStatus;
  evidenceId: string;
  inputSha256: string;
  nodeCount: number;
  edgeCount: number;
  highValueNodeCount: number;
  riskyEdgeCount: number;
  riskCount: number;
  riskSignals: IdentityGraphRiskSignal[];
  importedFindings: number;
  findingIds: string[];
  createdAt: string;
}

export interface RegisteredToolboxBundle {
  id: string;
  name: string;
  version: string;
  source: 'local_manifest';
  status: RegisteredToolboxBundleStatus;
  profileIds: string[];
  engines: string[];
  templateIds: string[];
  riskLevels: RiskLevel[];
  safetyNotes: string[];
  installationNotes: string[];
  commercialUseCases: string[];
  manifestSha256: string;
  registeredBy: string;
  registeredAt: string;
}

export interface RegisteredConnector {
  id: string;
  name: string;
  version: string;
  source: 'local_manifest';
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
  manifestSha256: string;
  registeredBy: string;
  registeredAt: string;
}

export interface ConnectorRunItem {
  templateId: string;
  title: string;
  engine: string;
  target: string;
  riskLevel: RiskLevel;
  status: 'allowed' | 'blocked' | 'approval_required';
  invocationId?: string;
  evidenceId?: string;
  approvalId?: string;
  reason?: string;
}

export interface ConnectorRun {
  id: string;
  runId: string;
  connectorId: string;
  target: string;
  status: ConnectorRunStatus;
  total: number;
  allowed: number;
  blocked: number;
  approvalRequired: number;
  evidenceIds: string[];
  invocationIds: string[];
  approvalIds: string[];
  items: ConnectorRunItem[];
  startedAt: string;
  endedAt: string;
}

export interface ToolPackRunItem {
  requestId: string;
  title: string;
  tool: string;
  target: string;
  method: string;
  riskLevel: RiskLevel;
  status: 'allowed' | 'blocked' | 'approval_required';
  invocationId?: string;
  evidenceId?: string;
  approvalId?: string;
  reason?: string;
}

export interface ToolPackRun {
  id: string;
  runId: string;
  packId: string;
  target: string;
  status: ToolPackRunStatus;
  total: number;
  allowed: number;
  blocked: number;
  approvalRequired: number;
  evidenceIds: string[];
  invocationIds: string[];
  approvalIds: string[];
  items: ToolPackRunItem[];
  startedAt: string;
  endedAt: string;
}

export interface RunExport {
  id: string;
  runId: string;
  status: RunExportStatus;
  evidenceId: string;
  sha256: string;
  findingScope: 'confirmed_only' | 'candidate_and_confirmed';
  includeEvidenceContent: boolean;
  includedEvidenceContent: number;
  omittedRawLocalOnly: number;
  counts: {
    facts: number;
    intents: number;
    evidence: number;
    findings: number;
    approvals: number;
    toolInvocations: number;
    reports: number;
  };
  createdAt: string;
}

export interface AttackSurfaceAsset {
  id: string;
  kind: AttackSurfaceAssetKind;
  label: string;
  riskLevel: RiskLevel;
  evidenceIds: string[];
  signals: string[];
}

export interface AttackSurfaceEndpoint {
  id: string;
  method?: string;
  url: string;
  source: AttackSurfaceEndpointSource;
  evidenceIds: string[];
  observedAt: string;
}

export interface SearchFrontierItem {
  id: string;
  title: string;
  rationale: string;
  priority: SearchFrontierPriority;
  riskLevel: RiskLevel;
  source: SearchFrontierSource;
  relatedEvidenceIds: string[];
  suggestedTool?: string;
  suggestedTemplate?: string;
}

export interface AttackSurfaceMap {
  runId: string;
  generatedAt: string;
  target: string;
  summary: string;
  assets: AttackSurfaceAsset[];
  endpoints: AttackSurfaceEndpoint[];
  technologies: string[];
  signals: string[];
  blockers: string[];
  frontier: SearchFrontierItem[];
  counts: {
    assets: number;
    endpoints: number;
    evidence: number;
    findings: number;
    blockers: number;
    frontier: number;
  };
}

export interface WorkerRuntimeStatus {
  name: string;
  type: WorkerType;
  maxRunning: number;
  priority: number;
  commandConfigured: boolean;
  healthy: boolean;
  status: 'healthy' | 'unhealthy';
  reason?: string;
  checkedAt: string;
}

export interface Run {
  id: string;
  target: string;
  goal: string;
  scopePolicy: ScopePolicy;
  workerPool: WorkerConfig[];
  status: RunStatus;
  createdAt: string;
  completedAt?: string;
}

export interface RunEvent {
  id: string;
  runId: string;
  type: RunEventType;
  title: string;
  detail?: string;
  level: RunEventLevel;
  entityId?: string;
  createdAt: string;
}

export interface TraceSpan {
  id: string;
  runId: string;
  kind: TraceSpanKind;
  name: string;
  status: TraceSpanStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  entityId?: string;
  parentId?: string;
  attributes: Record<string, string | number | boolean>;
}

export interface CostLedgerEntry {
  id: string;
  runId: string;
  source: CostLedgerSource;
  unit: CostLedgerUnit;
  quantity: number;
  estimatedUsd: number;
  model?: string;
  worker?: string;
  tool?: string;
  entityId?: string;
  createdAt: string;
}

export interface RunEvaluationCheck {
  id: string;
  title: string;
  status: EvaluationCheckStatus;
  detail: string;
  observed: number;
}

export interface RunEvaluation {
  id: string;
  runId: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  checks: RunEvaluationCheck[];
  createdAt: string;
}

export interface RunObservabilitySummary {
  runId: string;
  spans: TraceSpan[];
  latestEvaluation?: RunEvaluation;
  counts: {
    spans: number;
    errors: number;
    blocked: number;
    approvalRequired: number;
  };
  duration: {
    totalMs: number;
    byKind: Record<TraceSpanKind, number>;
  };
  cost: {
    entries: CostLedgerEntry[];
    totalEstimatedUsd: number;
    localRuntimeMs: number;
  };
}

export interface RunProgress {
  runId: string;
  status: RunStatus;
  phase: RunPhase;
  counts: {
    facts: number;
    hints: number;
    intents: {
      total: number;
      open: number;
      claimed: number;
      released: number;
      concluded: number;
    };
    evidence: number;
    findings: number;
    approvals: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
    };
    tools: {
      total: number;
      allowed: number;
      blocked: number;
      approvalRequired: number;
    };
    reports: number;
  };
  lastEvent?: RunEvent;
}

export interface Fact {
  id: string;
  runId: string;
  fromIntentId?: string;
  statement: string;
  evidenceIds: string[];
  confidence: Confidence;
  createdBy: string;
  createdAt: string;
}

export interface Intent {
  id: string;
  runId: string;
  fromFactIds: string[];
  hypothesis: string;
  riskLevel: RiskLevel;
  status: IntentStatus;
  createdBy: string;
  createdAt: string;
  claimedBy?: string;
  leaseId?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  releasedAt?: string;
  releaseReason?: string;
  concludedAt?: string;
}

export interface Hint {
  id: string;
  runId: string;
  text: string;
  createdAt: string;
}

export interface Evidence {
  id: string;
  runId: string;
  kind: EvidenceKind;
  localUri: string;
  cloudUri?: string;
  sha256: string;
  redactionState: RedactionState;
  toolCallId?: string;
  createdAt: string;
}

export interface EvidenceReview {
  id: string;
  runId: string;
  evidenceId: string;
  status: EvidenceReviewStatus;
  note?: string;
  reviewer: string;
  createdAt: string;
  updatedAt: string;
}

export interface Finding {
  id: string;
  runId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  affectedAssets: string[];
  evidenceIds: string[];
  reproSteps: string[];
  impact: string;
  remediation: string;
  validationState: ValidationState;
  validationNote?: string;
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
}

export interface ToolInvocation {
  id: string;
  runId: string;
  tool: string;
  args: Record<string, unknown>;
  target: string;
  method: string;
  riskLevel: RiskLevel;
  approvalId?: string;
  status: 'allowed' | 'blocked' | 'approval_required';
  stdoutRef?: string;
  stderrRef?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  reason?: string;
  startedAt: string;
  endedAt: string;
}

export interface ApprovalRequest {
  id: string;
  runId: string;
  tool: string;
  target: string;
  riskLevel: RiskLevel;
  reason: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
}

export interface ProxySession {
  id: string;
  runId: string;
  status: ProxySessionStatus;
  proxyUrl: string;
  requiredHeaders: Record<string, string>;
  limitations: string[];
  createdAt: string;
  closedAt?: string;
}

export interface BrowserSession {
  id: string;
  runId: string;
  status: BrowserSessionStatus;
  mode: 'local_fetch_controller' | 'external_browser';
  currentUrl?: string;
  userAgent: string;
  limitations: string[];
  createdAt: string;
  lastNavigatedAt?: string;
  closedAt?: string;
}

export interface OastSession {
  id: string;
  runId: string;
  status: OastSessionStatus;
  token: string;
  callbackUrl: string;
  interactionCount: number;
  limitations: string[];
  createdAt: string;
  closedAt?: string;
}

export interface OastCallback {
  id: string;
  runId: string;
  sessionId: string;
  evidenceId: string;
  protocol: 'http' | 'dns' | 'manual';
  method: string;
  path: string;
  source: string;
  remoteAddress?: string;
  createdAt: string;
}

export interface CredentialReference {
  id: string;
  runId: string;
  label: string;
  role: string;
  kind: CredentialReferenceKind;
  placeholder: string;
  allowedUse: string[];
  status: CredentialReferenceStatus;
  createdAt: string;
  revokedAt?: string;
}

export interface AccessReview {
  id: string;
  runId: string;
  title: string;
  target: string;
  method: string;
  baselineCredentialId?: string;
  comparisonCredentialId?: string;
  baselineEvidenceId?: string;
  comparisonEvidenceId?: string;
  diffEvidenceId?: string;
  status: AccessReviewStatus;
  summary: string;
  signals: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GraphSnapshot {
  run: Run;
  facts: Fact[];
  intents: Intent[];
  hints: Hint[];
  evidence: Evidence[];
  findings: Finding[];
}

export interface CreateRunInput {
  target: string;
  goal: string;
  scopePolicy: ScopePolicy;
  workerPool: WorkerConfig[];
}

export interface ProposeFindingInput {
  runId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  affectedAssets: string[];
  evidenceIds: string[];
  reproSteps: string[];
  impact: string;
  remediation: string;
}
