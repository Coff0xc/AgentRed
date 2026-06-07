import { nowIso } from '../domain/ids.js';
import type {
  Evidence,
  EvidenceKind,
  EvidenceReviewStatus,
  Finding,
  RedactionState,
  ToolInvocation,
  ValidationState,
} from '../domain/types.js';
import { evaluateScope } from '../scope/policy.js';
import { redactUrl } from '../security/redaction.js';
import type { EvidenceBlob, PlatformStore } from '../storage/store.js';

export type EvidenceQualityPosture = 'strong' | 'usable' | 'weak' | 'blocked';
export type EvidenceQualityStatus = 'pass' | 'warn' | 'fail';
export type EvidenceReplayQualityStatus =
  | 'ready'
  | 'supporting_artifact'
  | 'not_http_exchange'
  | 'unsupported_method'
  | 'invalid_request'
  | 'out_of_scope'
  | 'missing_blob';

export interface EvidenceReplayQuality {
  status: EvidenceReplayQualityStatus;
  replayable: boolean;
  supportsReproduction: boolean;
  reason: string;
  method?: string;
  target?: string;
  originalStatus?: number;
}

export interface EvidenceQualityCard {
  evidenceId: string;
  kind: EvidenceKind;
  score: number;
  posture: EvidenceQualityPosture;
  redactionState: RedactionState;
  reviewStatus: EvidenceReviewStatus | 'unreviewed';
  blobPresent: boolean;
  contentSizeBytes: number;
  sha256: string;
  toolCallId?: string;
  toolStatus?: ToolInvocation['status'];
  referencedByFindings: string[];
  replay: EvidenceReplayQuality;
  gaps: string[];
}

export interface FindingEvidenceGate {
  findingId: string;
  title: string;
  severity: Finding['severity'];
  validationState: ValidationState;
  score: number;
  posture: EvidenceQualityPosture;
  deliveryReady: boolean;
  evidenceIds: string[];
  missingEvidenceIds: string[];
  usefulEvidence: number;
  reviewedEvidence: number;
  reproductionEvidence: number;
  redactionReadyEvidence: number;
  evidenceKinds: EvidenceKind[];
  gaps: string[];
  nextActions: string[];
}

export interface EvidenceQualityDimension {
  id: string;
  title: string;
  score: number;
  status: EvidenceQualityStatus;
  detail: string;
  signals: string[];
  gaps: string[];
}

export interface EvidenceQualityIndex {
  runId: string;
  generatedAt: string;
  mode: 'evidence_quality_index';
  score: number;
  posture: EvidenceQualityPosture;
  summary: string;
  counts: {
    evidence: number;
    reviewedEvidence: number;
    usefulEvidence: number;
    rawLocalOnlyEvidence: number;
    redactionReadyEvidence: number;
    replayableEvidence: number;
    reproductionEvidence: number;
    orphanEvidence: number;
    missingBlobs: number;
    findings: number;
    findingsWithEvidence: number;
    findingsMissingEvidence: number;
    confirmedFindings: number;
    confirmedDeliveryReadyFindings: number;
    reportBundles: number;
  };
  dimensions: EvidenceQualityDimension[];
  evidenceCards: EvidenceQualityCard[];
  findingGates: FindingEvidenceGate[];
  nextActions: string[];
}

interface ParsedHttpExchange {
  source?: unknown;
  request?: {
    method?: unknown;
    target?: unknown;
  };
  response?: {
    status?: unknown;
  };
}

const IDEMPOTENT_REPLAY_METHODS = new Set(['GET', 'HEAD']);

export class EvidenceQualityService {
  constructor(private readonly store: PlatformStore) {}

  get(runId: string): EvidenceQualityIndex {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const evidence = Object.values(this.store.state.evidence)
      .filter((item) => item.runId === runId && item.kind !== 'replay_bundle')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const reportBundles = Object.values(this.store.state.evidence).filter(
      (item) => item.runId === runId && item.kind === 'replay_bundle',
    );
    const reviews = Object.values(this.store.state.evidenceReviews).filter((item) => item.runId === runId);
    const findings = Object.values(this.store.state.findings).filter((item) => item.runId === runId);
    const reviewsByEvidence = new Map(reviews.map((review) => [review.evidenceId, review]));
    const toolsById = new Map(
      Object.values(this.store.state.toolInvocations)
        .filter((item) => item.runId === runId)
        .map((item) => [item.id, item]),
    );
    const findingIdsByEvidence = findingReferences(findings);
    const evidenceCards = evidence.map((item) =>
      this.evidenceCard(item, reviewsByEvidence.get(item.id)?.status ?? 'unreviewed', toolsById, findingIdsByEvidence),
    );
    const cardsById = new Map(evidenceCards.map((item) => [item.evidenceId, item]));
    const findingGates = findings.map((finding) => findingGate(finding, cardsById));

    const counts = {
      evidence: evidenceCards.length,
      reviewedEvidence: evidenceCards.filter((item) => item.reviewStatus !== 'unreviewed').length,
      usefulEvidence: evidenceCards.filter((item) => item.reviewStatus === 'useful').length,
      rawLocalOnlyEvidence: evidenceCards.filter((item) => item.redactionState === 'raw_local_only').length,
      redactionReadyEvidence: evidenceCards.filter((item) => redactionReady(item.redactionState)).length,
      replayableEvidence: evidenceCards.filter((item) => item.replay.replayable).length,
      reproductionEvidence: evidenceCards.filter((item) => item.replay.supportsReproduction).length,
      orphanEvidence: evidenceCards.filter((item) => item.referencedByFindings.length === 0).length,
      missingBlobs: evidenceCards.filter((item) => !item.blobPresent).length,
      findings: findingGates.length,
      findingsWithEvidence: findingGates.filter((item) => item.evidenceIds.length > 0).length,
      findingsMissingEvidence: findingGates.filter((item) => item.missingEvidenceIds.length > 0).length,
      confirmedFindings: findingGates.filter((item) => item.validationState === 'confirmed').length,
      confirmedDeliveryReadyFindings: findingGates.filter((item) => item.deliveryReady).length,
      reportBundles: reportBundles.length,
    };
    const dimensions = dimensionsFor(counts, evidenceCards, findingGates);
    const score = weightedScore(dimensions);
    const posture = counts.missingBlobs > 0 || counts.findingsMissingEvidence > 0 ? 'blocked' : postureFromScore(score);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'evidence_quality_index',
      score,
      posture,
      summary:
        `${counts.evidence} evidence item(s), ${counts.usefulEvidence} useful review(s), ` +
        `${counts.reproductionEvidence} reproduction-supporting artifact(s), ` +
        `${counts.confirmedDeliveryReadyFindings}/${counts.confirmedFindings} confirmed finding(s) delivery-ready.`,
      counts,
      dimensions,
      evidenceCards,
      findingGates,
      nextActions: nextActions(counts, dimensions, evidenceCards, findingGates),
    };
  }

  private evidenceCard(
    evidence: Evidence,
    reviewStatus: EvidenceReviewStatus | 'unreviewed',
    toolsById: Map<string, ToolInvocation>,
    findingIdsByEvidence: Map<string, string[]>,
  ): EvidenceQualityCard {
    const blob = this.store.state.evidenceBlobs[evidence.localUri];
    const replay = this.replayQuality(evidence, blob);
    const tool = evidence.toolCallId ? toolsById.get(evidence.toolCallId) : undefined;
    const referencedByFindings = findingIdsByEvidence.get(evidence.id) ?? [];
    const score = evidenceScore(evidence, blob, reviewStatus, replay, tool, referencedByFindings.length);
    const gaps = evidenceGaps(evidence, blob, reviewStatus, replay, referencedByFindings.length);
    return {
      evidenceId: evidence.id,
      kind: evidence.kind,
      score,
      posture: postureFromScore(score),
      redactionState: evidence.redactionState,
      reviewStatus,
      blobPresent: Boolean(blob),
      contentSizeBytes: blob?.sizeBytes ?? 0,
      sha256: evidence.sha256,
      toolCallId: evidence.toolCallId,
      toolStatus: tool?.status,
      referencedByFindings,
      replay,
      gaps,
    };
  }

  private replayQuality(evidence: Evidence, blob: EvidenceBlob | undefined): EvidenceReplayQuality {
    if (!blob) {
      return {
        status: 'missing_blob',
        replayable: false,
        supportsReproduction: false,
        reason: 'Evidence metadata exists, but local blob content is missing.',
      };
    }
    if (evidence.kind !== 'http_exchange') {
      return {
        status: 'supporting_artifact',
        replayable: false,
        supportsReproduction: supportingArtifact(evidence.kind),
        reason: `${evidence.kind} supports human reproduction but is not automatically replayed.`,
      };
    }
    if (blob.encoding !== 'utf8') {
      return {
        status: 'invalid_request',
        replayable: false,
        supportsReproduction: false,
        reason: 'HTTP exchange evidence must be UTF-8 JSON for replay planning.',
      };
    }
    const exchange = parseHttpExchange(blob.content);
    if (!exchange) {
      return {
        status: 'invalid_request',
        replayable: false,
        supportsReproduction: false,
        reason: 'HTTP exchange evidence is not valid JSON.',
      };
    }
    const method = stringValue(exchange.request?.method)?.toUpperCase() || 'GET';
    const target = stringValue(exchange.request?.target);
    const originalStatus = numberValue(exchange.response?.status);
    if (!target || !isHttpUrl(target)) {
      return {
        status: 'invalid_request',
        replayable: false,
        supportsReproduction: false,
        reason: 'Evidence does not contain a replayable HTTP or HTTPS request target.',
        method,
        originalStatus,
      };
    }
    if (!IDEMPOTENT_REPLAY_METHODS.has(method)) {
      return {
        status: 'unsupported_method',
        replayable: false,
        supportsReproduction: true,
        reason: 'Only GET and HEAD can be automatically replayed without a fresh Tool Gateway action.',
        method,
        target: redactUrl(target),
        originalStatus,
      };
    }
    const run = this.store.state.runs[evidence.runId];
    const scopeDecision = evaluateScope(evidence.runId, run.scopePolicy, target, method, 'R1');
    if (scopeDecision.action !== 'allow') {
      return {
        status: 'out_of_scope',
        replayable: false,
        supportsReproduction: false,
        reason: scopeDecision.reason,
        method,
        target: redactUrl(target),
        originalStatus,
      };
    }
    return {
      status: 'ready',
      replayable: true,
      supportsReproduction: true,
      reason: 'Safe GET/HEAD replay is available for this in-scope HTTP exchange.',
      method,
      target: redactUrl(target),
      originalStatus,
    };
  }
}

function findingReferences(findings: Finding[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const finding of findings) {
    for (const evidenceId of finding.evidenceIds) {
      const existing = map.get(evidenceId) ?? [];
      existing.push(finding.id);
      map.set(evidenceId, existing);
    }
  }
  return map;
}

function evidenceScore(
  evidence: Evidence,
  blob: EvidenceBlob | undefined,
  reviewStatus: EvidenceReviewStatus | 'unreviewed',
  replay: EvidenceReplayQuality,
  tool: ToolInvocation | undefined,
  referencedByFindings: number,
): number {
  return clamp(
    (blob ? 15 : 0) +
      (evidence.sha256 ? 10 : 0) +
      redactionScore(evidence.redactionState) +
      reviewScore(reviewStatus) +
      (replay.replayable ? 20 : replay.supportsReproduction ? 12 : 0) +
      (referencedByFindings > 0 ? 10 : 0) +
      (tool?.status === 'allowed' ? 5 : 0),
  );
}

function evidenceGaps(
  evidence: Evidence,
  blob: EvidenceBlob | undefined,
  reviewStatus: EvidenceReviewStatus | 'unreviewed',
  replay: EvidenceReplayQuality,
  referencedByFindings: number,
): string[] {
  return [
    ...(!blob ? ['Restore or recapture the local evidence blob.'] : []),
    ...(reviewStatus === 'unreviewed' ? ['Review this evidence before using it in delivery.'] : []),
    ...(reviewStatus === 'needs_more_context' ? ['Add surrounding context or a paired evidence item.'] : []),
    ...(reviewStatus === 'not_relevant' ? ['Keep this out of reportable findings.'] : []),
    ...(evidence.redactionState === 'raw_local_only' ? ['Create a redacted derivative before cloud sync or customer export.'] : []),
    ...(!replay.supportsReproduction ? [replay.reason] : []),
    ...(referencedByFindings === 0 ? ['Link useful evidence to a candidate or confirmed finding, or leave it as supporting context.'] : []),
  ];
}

function findingGate(finding: Finding, cardsById: Map<string, EvidenceQualityCard>): FindingEvidenceGate {
  const cards = finding.evidenceIds.map((id) => cardsById.get(id)).filter((item): item is EvidenceQualityCard => Boolean(item));
  const missingEvidenceIds = finding.evidenceIds.filter((id) => !cardsById.has(id));
  const usefulEvidence = cards.filter((item) => item.reviewStatus === 'useful').length;
  const reviewedEvidence = cards.filter((item) => item.reviewStatus !== 'unreviewed').length;
  const reproductionEvidence = cards.filter((item) => item.replay.supportsReproduction).length;
  const redactionReadyEvidence = cards.filter((item) => redactionReady(item.redactionState)).length;
  const evidenceKinds = [...new Set(cards.map((item) => item.kind))].sort();
  const score = clamp(
    validationScore(finding.validationState) +
      (finding.evidenceIds.length > 0 ? 18 : 0) +
      (missingEvidenceIds.length === 0 ? 15 : 0) +
      (cards.length > 0 ? Math.round((reviewedEvidence / cards.length) * 12) : 0) +
      (cards.length > 0 ? Math.round((usefulEvidence / cards.length) * 18) : 0) +
      (cards.length > 0 ? Math.round((redactionReadyEvidence / cards.length) * 12) : 0) +
      (reproductionEvidence > 0 ? 10 : 0) +
      (evidenceKinds.length > 1 ? 5 : 0),
  );
  const gaps = [
    ...(finding.evidenceIds.length === 0 ? ['Finding has no evidence reference.'] : []),
    ...(missingEvidenceIds.length > 0 ? [`${missingEvidenceIds.length} referenced evidence item(s) are missing.`] : []),
    ...(usefulEvidence === 0 ? ['No referenced evidence is marked useful.'] : []),
    ...(redactionReadyEvidence < cards.length ? ['Some referenced evidence is still raw-local-only.'] : []),
    ...(reproductionEvidence === 0 ? ['No referenced evidence currently supports reproduction or replay.'] : []),
    ...(finding.validationState !== 'confirmed' ? ['Finding is not confirmed for customer-facing delivery.'] : []),
  ];
  const deliveryReady =
    finding.validationState === 'confirmed' &&
    finding.evidenceIds.length > 0 &&
    missingEvidenceIds.length === 0 &&
    usefulEvidence > 0 &&
    redactionReadyEvidence === cards.length &&
    reproductionEvidence > 0;
  return {
    findingId: finding.id,
    title: finding.title,
    severity: finding.severity,
    validationState: finding.validationState,
    score,
    posture: postureFromScore(score),
    deliveryReady,
    evidenceIds: finding.evidenceIds,
    missingEvidenceIds,
    usefulEvidence,
    reviewedEvidence,
    reproductionEvidence,
    redactionReadyEvidence,
    evidenceKinds,
    gaps,
    nextActions: findingActions(gaps, deliveryReady),
  };
}

function dimensionsFor(
  counts: EvidenceQualityIndex['counts'],
  evidenceCards: EvidenceQualityCard[],
  findingGates: FindingEvidenceGate[],
): EvidenceQualityDimension[] {
  const reviewedRatio = ratio(counts.reviewedEvidence, counts.evidence);
  const usefulRatio = ratio(counts.usefulEvidence, counts.evidence);
  const redactionRatio = ratio(counts.redactionReadyEvidence, counts.evidence);
  const reproductionRatio = ratio(counts.reproductionEvidence, counts.evidence);
  const linkedRatio = ratio(counts.evidence - counts.orphanEvidence, counts.evidence);
  const deliveryRatio = ratio(counts.confirmedDeliveryReadyFindings, Math.max(counts.confirmedFindings, 1));
  return [
    dimension({
      id: 'integrity',
      title: 'Evidence integrity',
      score: clamp((counts.evidence > 0 ? 55 : 0) + Math.min(counts.evidence, 5) * 7 - counts.missingBlobs * 25),
      detail:
        counts.evidence === 0
          ? 'No evidence has been collected for this run.'
          : `${counts.evidence} evidence item(s), ${counts.missingBlobs} missing local blob(s).`,
      signals: [`${counts.evidence} evidence item(s)`, `${counts.missingBlobs} missing blob(s)`],
      gaps: [
        ...(counts.evidence === 0 ? ['Collect in-scope baseline HTTP/browser/tool evidence.'] : []),
        ...(counts.missingBlobs > 0 ? ['Recapture or repair missing local evidence blobs.'] : []),
      ],
    }),
    dimension({
      id: 'review',
      title: 'Human review coverage',
      score: clamp(Math.round(reviewedRatio * 60) + Math.round(usefulRatio * 35) + (counts.evidence > 0 ? 5 : 0)),
      detail: `${counts.reviewedEvidence}/${counts.evidence} reviewed, ${counts.usefulEvidence} marked useful.`,
      signals: [`reviewed=${percent(reviewedRatio)}`, `useful=${percent(usefulRatio)}`],
      gaps: [
        ...(counts.evidence > counts.reviewedEvidence ? ['Review remaining evidence before delivery.'] : []),
        ...(counts.evidence > 0 && counts.usefulEvidence === 0 ? ['Mark useful evidence or collect stronger evidence.'] : []),
      ],
    }),
    dimension({
      id: 'reproduction',
      title: 'Replay and reproduction',
      score: clamp(Math.round(reproductionRatio * 70) + Math.min(counts.replayableEvidence, 3) * 10),
      detail: `${counts.reproductionEvidence} evidence item(s) support reproduction; ${counts.replayableEvidence} can be safely replayed.`,
      signals: [`reproduction=${percent(reproductionRatio)}`, `${counts.replayableEvidence} safe replay plan(s)`],
      gaps: [
        ...(counts.reproductionEvidence === 0 ? ['Add replayable HTTP, command, screenshot, OAST, or file-hash evidence.'] : []),
        ...replayGapSamples(evidenceCards),
      ],
    }),
    dimension({
      id: 'redaction',
      title: 'Redaction readiness',
      score: clamp(Math.round(redactionRatio * 85) + (counts.rawLocalOnlyEvidence === 0 && counts.evidence > 0 ? 15 : 0)),
      detail: `${counts.redactionReadyEvidence}/${counts.evidence} evidence item(s) are redacted or cloud-safe.`,
      signals: [`raw_local_only=${counts.rawLocalOnlyEvidence}`, `redaction-ready=${percent(redactionRatio)}`],
      gaps: [
        ...(counts.rawLocalOnlyEvidence > 0 ? ['Create redacted derivatives for raw-local-only evidence before cloud sync.'] : []),
      ],
    }),
    dimension({
      id: 'finding_linkage',
      title: 'Finding linkage',
      score: clamp(Math.round(linkedRatio * 45) + Math.min(counts.findingsWithEvidence, 5) * 10 - counts.findingsMissingEvidence * 25),
      detail: `${counts.findingsWithEvidence}/${counts.findings} finding(s) cite evidence; ${counts.orphanEvidence} evidence item(s) are not linked.`,
      signals: [`orphan evidence=${counts.orphanEvidence}`, `missing references=${counts.findingsMissingEvidence}`],
      gaps: [
        ...(counts.findings > counts.findingsWithEvidence ? ['Reject or repair evidence-free findings.'] : []),
        ...(counts.findingsMissingEvidence > 0 ? ['Fix findings that cite missing evidence ids.'] : []),
        ...(counts.orphanEvidence > 0 ? ['Link useful orphan evidence to findings or keep it as context.'] : []),
      ],
    }),
    dimension({
      id: 'commercial_delivery',
      title: 'Commercial handoff',
      score: clamp(Math.round(deliveryRatio * 70) + Math.min(counts.reportBundles, 2) * 15),
      detail: `${counts.confirmedDeliveryReadyFindings}/${counts.confirmedFindings} confirmed finding(s) pass evidence-quality delivery gates.`,
      signals: [`confirmed=${counts.confirmedFindings}`, `report bundles=${counts.reportBundles}`],
      gaps: [
        ...findingGates
          .filter((item) => item.validationState === 'confirmed' && !item.deliveryReady)
          .slice(0, 3)
          .map((item) => `${item.title}: ${item.gaps[0] || 'evidence gate incomplete'}`),
        ...(counts.confirmedFindings > 0 && counts.reportBundles === 0 ? ['Generate a confirmed-only report bundle after quality gates pass.'] : []),
      ],
    }),
  ];
}

function dimension(input: Omit<EvidenceQualityDimension, 'status'>): EvidenceQualityDimension {
  return {
    ...input,
    status: statusFromScore(input.score),
  };
}

function nextActions(
  counts: EvidenceQualityIndex['counts'],
  dimensions: EvidenceQualityDimension[],
  evidenceCards: EvidenceQualityCard[],
  findingGates: FindingEvidenceGate[],
): string[] {
  const actions: string[] = [];
  for (const dimension of dimensions) {
    if (dimension.status === 'pass') continue;
    actions.push(...dimension.gaps);
  }
  const weakEvidence = evidenceCards
    .filter((item) => item.posture === 'weak' || item.posture === 'blocked')
    .slice(0, 3)
    .map((item) => `Improve ${item.evidenceId}: ${item.gaps[0] || item.replay.reason}`);
  const weakFindings = findingGates
    .filter((item) => item.validationState !== 'rejected' && !item.deliveryReady)
    .slice(0, 3)
    .map((item) => `Gate ${item.findingId}: ${item.nextActions[0] || 'complete evidence review'}`);
  actions.push(...weakEvidence, ...weakFindings);
  if (counts.confirmedDeliveryReadyFindings > 0 && counts.reportBundles === 0) {
    actions.push('Generate a confirmed-only report bundle for customer delivery.');
  }
  return unique(actions).slice(0, 10);
}

function replayGapSamples(evidenceCards: EvidenceQualityCard[]): string[] {
  return evidenceCards
    .filter((item) => !item.replay.supportsReproduction)
    .slice(0, 2)
    .map((item) => `${item.evidenceId}: ${item.replay.reason}`);
}

function findingActions(gaps: string[], deliveryReady: boolean): string[] {
  if (deliveryReady) {
    return ['Ready for confirmed-only report delivery.'];
  }
  return gaps.map((gap) => {
    if (/useful/i.test(gap)) return 'Review referenced evidence and mark truly useful artifacts.';
    if (/raw-local-only/i.test(gap)) return 'Create redacted evidence before cloud sync or customer export.';
    if (/reproduction|replay/i.test(gap)) return 'Attach replayable HTTP evidence or another reproduction-supporting artifact.';
    if (/confirmed/i.test(gap)) return 'Confirm the finding after human validation.';
    return gap;
  });
}

function supportingArtifact(kind: EvidenceKind): boolean {
  return kind === 'screenshot' || kind === 'command_output' || kind === 'oast_callback' || kind === 'file_hash';
}

function parseHttpExchange(content: string): ParsedHttpExchange | undefined {
  try {
    const parsed = JSON.parse(content) as ParsedHttpExchange;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function redactionReady(state: RedactionState): boolean {
  return state === 'redacted' || state === 'safe_for_cloud';
}

function redactionScore(state: RedactionState): number {
  if (state === 'safe_for_cloud') return 20;
  if (state === 'redacted') return 16;
  return 6;
}

function reviewScore(status: EvidenceReviewStatus | 'unreviewed'): number {
  if (status === 'useful') return 25;
  if (status === 'needs_more_context') return 10;
  if (status === 'not_relevant') return 0;
  return 5;
}

function validationScore(state: ValidationState): number {
  if (state === 'confirmed') return 30;
  if (state === 'candidate') return 14;
  return 0;
}

function weightedScore(dimensions: EvidenceQualityDimension[]): number {
  if (dimensions.length === 0) return 0;
  const weights: Record<string, number> = {
    integrity: 1.2,
    review: 1.1,
    reproduction: 1,
    redaction: 1,
    finding_linkage: 1.2,
    commercial_delivery: 1.3,
  };
  let total = 0;
  let weightTotal = 0;
  for (const dimension of dimensions) {
    const weight = weights[dimension.id] ?? 1;
    total += dimension.score * weight;
    weightTotal += weight;
  }
  return Math.round(total / weightTotal);
}

function statusFromScore(score: number): EvidenceQualityStatus {
  if (score >= 75) return 'pass';
  if (score >= 45) return 'warn';
  return 'fail';
}

function postureFromScore(score: number): EvidenceQualityPosture {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'usable';
  if (score >= 35) return 'weak';
  return 'blocked';
}

function ratio(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
