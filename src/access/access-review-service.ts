import { createHash } from 'node:crypto';

import { newId, nowIso } from '../domain/ids.js';
import type { AccessReview, AccessReviewSide } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import type { PlatformStore } from '../storage/store.js';

export interface CreateAccessReviewInput {
  runId: string;
  title: string;
  target: string;
  method: string;
  baselineCredentialId?: string;
  comparisonCredentialId?: string;
}

export interface CompareAccessEvidenceInput extends CreateAccessReviewInput {
  baselineEvidenceId: string;
  comparisonEvidenceId: string;
  toolCallId?: string;
}

export class AccessReviewService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly events?: RunEventService,
  ) {}

  create(input: CreateAccessReviewInput): AccessReview {
    this.assertRun(input.runId);
    this.assertCredential(input.runId, input.baselineCredentialId);
    this.assertCredential(input.runId, input.comparisonCredentialId);
    const timestamp = nowIso();
    const review: AccessReview = {
      id: newId('access_review'),
      runId: input.runId,
      title: cleanText(input.title, 'title', 140),
      target: cleanText(input.target, 'target', 500),
      method: cleanText(input.method, 'method', 16).toUpperCase(),
      baselineCredentialId: input.baselineCredentialId,
      comparisonCredentialId: input.comparisonCredentialId,
      status: 'draft',
      summary: 'Waiting for baseline and comparison evidence.',
      signals: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.state.accessReviews[review.id] = review;
    this.events?.record({
      runId: input.runId,
      type: 'access.review.created',
      title: 'Access review created',
      detail: `${review.method} ${review.target}`,
      entityId: review.id,
    });
    this.store.commit();
    return review;
  }

  list(runId: string): AccessReview[] {
    this.assertRun(runId);
    return Object.values(this.store.state.accessReviews)
      .filter((review) => review.runId === runId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  attachEvidence(input: { reviewId: string; side: AccessReviewSide; evidenceId: string; toolCallId?: string }): AccessReview {
    const review = this.get(input.reviewId);
    this.assertEvidence(review.runId, input.evidenceId);
    if (input.side === 'baseline') {
      review.baselineEvidenceId = input.evidenceId;
    } else if (input.side === 'comparison') {
      review.comparisonEvidenceId = input.evidenceId;
    } else {
      throw new Error('side must be baseline or comparison');
    }
    review.status = review.baselineEvidenceId && review.comparisonEvidenceId ? 'evidence_ready' : 'needs_review';
    review.summary =
      review.status === 'evidence_ready'
        ? 'Baseline and comparison evidence are ready for differential review.'
        : 'Waiting for the other side of the role comparison.';
    review.updatedAt = nowIso();
    this.events?.record({
      runId: review.runId,
      type: 'access.review.evidence_attached',
      title: 'Access review evidence attached',
      detail: `${input.side}: ${input.evidenceId}`,
      entityId: review.id,
    });
    this.store.commit();
    if (review.baselineEvidenceId && review.comparisonEvidenceId) {
      return this.compareReview(review.id, input.toolCallId).review;
    }
    return review;
  }

  compareEvidence(input: CompareAccessEvidenceInput): { review: AccessReview; diffEvidenceId: string } {
    const review = this.create(input);
    review.baselineEvidenceId = input.baselineEvidenceId;
    review.comparisonEvidenceId = input.comparisonEvidenceId;
    this.assertEvidence(review.runId, input.baselineEvidenceId);
    this.assertEvidence(review.runId, input.comparisonEvidenceId);
    this.store.commit();
    return this.compareReview(review.id, input.toolCallId);
  }

  private compareReview(reviewId: string, toolCallId?: string): { review: AccessReview; diffEvidenceId: string } {
    const review = this.get(reviewId);
    if (!review.baselineEvidenceId || !review.comparisonEvidenceId) {
      throw new Error('Access review requires both baselineEvidenceId and comparisonEvidenceId');
    }
    const baseline = this.signalForEvidence(review.baselineEvidenceId);
    const comparison = this.signalForEvidence(review.comparisonEvidenceId);
    const signals = compareSignals(baseline, comparison);
    const status = signals.length > 0 ? 'differential_observed' : 'no_difference';
    const summary =
      status === 'differential_observed'
        ? `Observed ${signals.length} access difference signal(s). Human review should confirm authorization impact.`
        : 'No obvious access difference was observed in the redacted evidence previews.';
    const diff = this.evidence.addEvidence({
      runId: review.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'access.compare_evidence',
        reviewId: review.id,
        title: review.title,
        target: review.target,
        method: review.method,
        baselineCredentialId: review.baselineCredentialId,
        comparisonCredentialId: review.comparisonCredentialId,
        baseline,
        comparison,
        decision: {
          status,
          summary,
          signals,
          requiresHumanReview: true,
        },
        comparedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    review.diffEvidenceId = diff.id;
    review.status = status;
    review.summary = summary;
    review.signals = signals;
    review.updatedAt = nowIso();
    this.events?.record({
      runId: review.runId,
      type: 'access.review.compared',
      title: 'Access review compared',
      detail: `${status}: ${review.title}`,
      entityId: review.id,
      level: status === 'differential_observed' ? 'warning' : 'info',
    });
    this.store.commit();
    return { review, diffEvidenceId: diff.id };
  }

  private get(reviewId: string): AccessReview {
    const review = this.store.state.accessReviews[reviewId];
    if (!review) {
      throw new Error(`Access review not found: ${reviewId}`);
    }
    return review;
  }

  private signalForEvidence(evidenceId: string): EvidenceSignal {
    const evidence = this.assertEvidence(undefined, evidenceId);
    const blob = this.evidence.readEvidenceBlob(evidenceId);
    const content = blob.encoding === 'base64' ? Buffer.from(blob.content, 'base64').toString('utf8') : blob.content;
    const parsed = parseJson(content);
    const request = recordValue(parsed?.request);
    const response = recordValue(parsed?.response);
    const result = recordValue(parsed?.result);
    const bodyPreview = textValue(response.bodyPreview) ?? textValue(result.bodyPreview) ?? textValue(parsed?.stdout);
    const headers = recordValue(response.headers) ?? recordValue(parsed?.responseHeaders);
    return {
      evidenceId: evidence.id,
      kind: evidence.kind,
      sha256: evidence.sha256,
      target: textValue(request.target) ?? textValue(parsed?.target),
      method: textValue(request.method) ?? textValue(parsed?.method),
      status: numberValue(response.status) ?? numberValue(result.status),
      bodyPreviewSha256: bodyPreview ? sha256(bodyPreview) : undefined,
      bodyPreviewLength: bodyPreview?.length ?? 0,
      headerKeys: headers ? Object.keys(headers).sort().slice(0, 40) : [],
    };
  }

  private assertRun(runId: string): void {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
  }

  private assertCredential(runId: string, credentialId?: string): void {
    if (!credentialId) {
      return;
    }
    const credential = this.store.state.credentialReferences[credentialId];
    if (!credential || credential.runId !== runId || credential.status !== 'active') {
      throw new Error(`Active credential reference not found in run: ${credentialId}`);
    }
  }

  private assertEvidence(runId: string | undefined, evidenceId: string) {
    const evidence = this.store.state.evidence[evidenceId];
    if (!evidence || (runId && evidence.runId !== runId)) {
      throw new Error(`Evidence not found in run: ${evidenceId}`);
    }
    return evidence;
  }
}

interface EvidenceSignal {
  evidenceId: string;
  kind: string;
  sha256: string;
  target?: string;
  method?: string;
  status?: number;
  bodyPreviewSha256?: string;
  bodyPreviewLength: number;
  headerKeys: string[];
}

function compareSignals(baseline: EvidenceSignal, comparison: EvidenceSignal): string[] {
  const signals: string[] = [];
  if (baseline.status !== comparison.status) {
    signals.push(`HTTP status differs: baseline=${baseline.status ?? 'n/a'} comparison=${comparison.status ?? 'n/a'}`);
  }
  if (baseline.bodyPreviewSha256 && comparison.bodyPreviewSha256 && baseline.bodyPreviewSha256 !== comparison.bodyPreviewSha256) {
    signals.push('Redacted body preview differs between roles');
  }
  if (Math.abs(baseline.bodyPreviewLength - comparison.bodyPreviewLength) > 80) {
    signals.push(
      `Response preview length differs: baseline=${baseline.bodyPreviewLength} comparison=${comparison.bodyPreviewLength}`,
    );
  }
  const headerDelta = symmetricDifference(baseline.headerKeys, comparison.headerKeys);
  if (headerDelta.length > 0) {
    signals.push(`Response header set differs: ${headerDelta.slice(0, 8).join(', ')}`);
  }
  return signals;
}

function symmetricDifference(left: string[], right: string[]): string[] {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return [...left.filter((item) => !rightSet.has(item)), ...right.filter((item) => !leftSet.has(item))];
}

function parseJson(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function cleanText(value: string, field: string, maxLength: number): string {
  const text = value.trim();
  if (!text) {
    throw new Error(`${field} is required`);
  }
  return text.slice(0, maxLength);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
