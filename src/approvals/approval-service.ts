import { newId, nowIso } from '../domain/ids.js';
import type { ApprovalRequest, ApprovalStatus, RiskLevel } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { PlatformStore } from '../storage/store.js';

export class ApprovalService {
  constructor(
    private readonly store: PlatformStore,
    private readonly events?: RunEventService,
  ) {}

  request(input: { runId: string; tool: string; target: string; riskLevel: RiskLevel; reason: string }): ApprovalRequest {
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
}
