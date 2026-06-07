import { newId, nowIso } from '../domain/ids.js';
import type { ApprovalRequest, ApprovalStatus, RiskLevel } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import { getIndexedStoreMutator } from '../storage/indexed-store.js';
import type { PlatformStore } from '../storage/store.js';

export class ApprovalService {
  private readonly defaultTtlMs: number;
  private readonly requestTtls = new Map<string, number>();

  constructor(
    private readonly store: PlatformStore,
    private readonly events?: RunEventService,
    options: { approvalTtlMs?: number } = {},
  ) {
    this.defaultTtlMs = options.approvalTtlMs ?? 15 * 60 * 1000;
  }

  request(input: { runId: string; tool: string; target: string; riskLevel: RiskLevel; reason: string; ttlMs?: number }): ApprovalRequest {
    const approval: ApprovalRequest = {
      id: newId('approval'),
      runId: input.runId,
      tool: input.tool,
      target: input.target,
      riskLevel: input.riskLevel,
      reason: input.reason,
      status: 'pending',
      createdAt: nowIso(),
    };
    this.store.state.approvals[approval.id] = approval;
    getIndexedStoreMutator(this.store)?.onApprovalAdded(approval.id, approval);
    if (input.ttlMs !== undefined) {
      this.requestTtls.set(approval.id, input.ttlMs);
    }
    this.events?.record({
      runId: input.runId,
      type: 'approval.requested',
      title: 'Approval requested',
      detail: `${input.tool} ${input.riskLevel}: ${input.reason}`,
      entityId: approval.id,
    });
    this.store.commit();
    return approval;
  }

  decide(id: string, status: Exclude<ApprovalStatus, 'pending'>): ApprovalRequest {
    const approval = this.get(id);
    approval.status = status;
    approval.decidedAt = nowIso();
    if (status === 'approved') {
      const ttl = this.requestTtls.get(id) ?? this.defaultTtlMs;
      approval.expiresAt = new Date(Date.now() + ttl).toISOString();
    } else {
      delete approval.expiresAt;
    }
    this.requestTtls.delete(id);
    this.events?.record({
      runId: approval.runId,
      type: 'approval.decided',
      title: 'Approval decided',
      detail: `${approval.tool} was ${status}`,
      entityId: approval.id,
    });
    this.store.commit();
    return approval;
  }

  get(id: string): ApprovalRequest {
    const approval = this.store.state.approvals[id];
    if (!approval) {
      throw new Error(`Approval not found: ${id}`);
    }
    return approval;
  }

  /**
   * Check if an approval is expired.
   * Legacy approvals without expiresAt are considered non-expired.
   */
  isExpired(approval: ApprovalRequest): boolean {
    if (approval.status !== 'approved') {
      return false;
    }
    if (!approval.expiresAt) {
      return false; // Legacy approval without expiration
    }
    return Date.now() >= new Date(approval.expiresAt).getTime();
  }

  /**
   * Get the effective status of an approval, considering expiration.
   * Expired approved approvals are treated as pending.
   */
  getEffectiveStatus(approval: ApprovalRequest): ApprovalStatus {
    if (this.isExpired(approval)) {
      return 'pending'; // Expired approvals revert to pending
    }
    return approval.status;
  }
}
