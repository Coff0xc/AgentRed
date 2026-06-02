import { newId, nowIso } from '../domain/ids.js';
import type { EvidenceReview, EvidenceReviewStatus } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { PlatformStore } from '../storage/store.js';

export interface ReviewEvidenceInput {
  evidenceId: string;
  status: EvidenceReviewStatus;
  note?: string;
  reviewer?: string;
}

export class EvidenceReviewService {
  constructor(
    private readonly store: PlatformStore,
    private readonly events?: RunEventService,
  ) {}

  list(runId: string): EvidenceReview[] {
    this.assertRun(runId);
    return Object.values(this.store.state.evidenceReviews)
      .filter((review) => review.runId === runId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  review(input: ReviewEvidenceInput): EvidenceReview {
    const evidence = this.store.state.evidence[input.evidenceId];
    if (!evidence) {
      throw new Error(`Evidence not found: ${input.evidenceId}`);
    }
    this.assertRun(evidence.runId);
    const status = validateStatus(input.status);
    const timestamp = nowIso();
    const existing = Object.values(this.store.state.evidenceReviews).find(
      (item) => item.evidenceId === evidence.id && item.runId === evidence.runId,
    );
    const review: EvidenceReview = existing ?? {
      id: newId('evidence_review'),
      runId: evidence.runId,
      evidenceId: evidence.id,
      status,
      reviewer: cleanText(input.reviewer || 'operator', 'reviewer', 80),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    review.status = status;
    review.note = normalizeNote(input.note);
    review.reviewer = cleanText(input.reviewer || review.reviewer || 'operator', 'reviewer', 80);
    review.updatedAt = timestamp;
    this.store.state.evidenceReviews[review.id] = review;
    this.events?.record({
      runId: evidence.runId,
      type: 'evidence.reviewed',
      title: 'Evidence reviewed',
      detail: `${evidence.id}: ${review.status}${review.note ? ` - ${review.note}` : ''}`,
      entityId: review.id,
    });
    this.store.commit();
    return review;
  }

  private assertRun(runId: string): void {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
  }
}

function validateStatus(status: EvidenceReviewStatus): EvidenceReviewStatus {
  if (status === 'useful' || status === 'not_relevant' || status === 'needs_more_context') {
    return status;
  }
  throw new Error('status must be useful, not_relevant, or needs_more_context');
}

function normalizeNote(note: string | undefined): string | undefined {
  const value = note ? cleanText(note, 'note', 800) : '';
  return value || undefined;
}

function cleanText(value: string, field: string, maxLength: number): string {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  if (normalized.length > maxLength) {
    return normalized.slice(0, maxLength);
  }
  return normalized;
}
