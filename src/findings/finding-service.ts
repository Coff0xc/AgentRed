import { newId, nowIso } from '../domain/ids.js';
import type { Finding, ProposeFindingInput, ValidationState } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { PlatformStore } from '../storage/store.js';

export interface FindingValidationInput {
  validationState: ValidationState;
  note?: string;
  reviewer?: string;
}

export class FindingService {
  constructor(
    private readonly store: PlatformStore,
    private readonly events?: RunEventService,
  ) {}

  proposeFinding(input: ProposeFindingInput): Finding {
    if (!this.store.state.runs[input.runId]) {
      throw new Error(`Run not found: ${input.runId}`);
    }
    if (input.evidenceIds.length === 0) {
      throw new Error('A finding must reference at least one evidence item');
    }
    for (const evidenceId of input.evidenceIds) {
      const evidence = this.store.state.evidence[evidenceId];
      if (!evidence || evidence.runId !== input.runId) {
        throw new Error(`Finding references missing evidence: ${evidenceId}`);
      }
    }
    const finding: Finding = {
      id: newId('finding'),
      runId: input.runId,
      title: input.title,
      severity: input.severity,
      confidence: input.confidence,
      affectedAssets: input.affectedAssets,
      evidenceIds: input.evidenceIds,
      reproSteps: input.reproSteps,
      impact: input.impact,
      remediation: input.remediation,
      validationState: 'candidate',
      createdAt: nowIso(),
    };
    this.store.state.findings[finding.id] = finding;
    this.events?.record({
      runId: input.runId,
      type: 'finding.proposed',
      title: 'Finding proposed',
      detail: `${input.severity}: ${input.title}`,
      entityId: finding.id,
    });
    this.store.commit();
    return finding;
  }

  list(runId?: string): Finding[] {
    return Object.values(this.store.state.findings).filter((finding) => !runId || finding.runId === runId);
  }

  updateValidationState(findingId: string, input: ValidationState | FindingValidationInput): Finding {
    const validationState = typeof input === 'string' ? input : input.validationState;
    if (!isValidationState(validationState)) {
      throw new Error(`Invalid finding validation state: ${validationState}`);
    }
    const finding = this.store.state.findings[findingId];
    if (!finding) {
      throw new Error(`Finding not found: ${findingId}`);
    }
    if (validationState === 'confirmed') {
      const missingUsefulReviews = finding.evidenceIds.filter((evidenceId) => !this.hasUsefulEvidenceReview(finding.runId, evidenceId));
      if (missingUsefulReviews.length > 0) {
        throw new Error(`Finding confirmation requires useful evidence review for: ${missingUsefulReviews.join(', ')}`);
      }
    }
    finding.validationState = validationState;
    finding.validationNote = typeof input === 'string' ? undefined : optionalCleanText(input.note, 800);
    finding.validatedBy = typeof input === 'string' ? 'operator' : optionalCleanText(input.reviewer, 80) || 'operator';
    finding.validatedAt = nowIso();
    this.events?.record({
      runId: finding.runId,
      type: 'finding.validated',
      title: 'Finding validation updated',
      detail: `${validationState}: ${finding.title}${finding.validationNote ? ` - ${finding.validationNote}` : ''}`,
      level: validationState === 'rejected' ? 'warning' : 'info',
      entityId: finding.id,
    });
    this.store.commit();
    return finding;
  }

  private hasUsefulEvidenceReview(runId: string, evidenceId: string): boolean {
    return Object.values(this.store.state.evidenceReviews).some(
      (review) => review.runId === runId && review.evidenceId === evidenceId && review.status === 'useful',
    );
  }
}

function isValidationState(value: string): value is ValidationState {
  return value === 'candidate' || value === 'confirmed' || value === 'rejected';
}

function optionalCleanText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return undefined;
  }
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}
