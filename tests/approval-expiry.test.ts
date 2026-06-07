import assert from 'node:assert/strict';
import test from 'node:test';

import { ApprovalService } from '../src/approvals/approval-service.js';
import { emptyState } from '../src/storage/store.js';
import type { PlatformStore, PlatformState } from '../src/storage/store.js';
import type { ApprovalRequest } from '../src/domain/types.js';

class InMemoryStore implements PlatformStore {
  state: PlatformState;
  constructor() {
    this.state = emptyState();
  }
  commit(): void {}
}

test('ApprovalService sets default TTL when approval is approved', () => {
  const store = new InMemoryStore();
  const service = new ApprovalService(store);

  const approval = service.request({
    runId: 'run1',
    tool: 'scanner.run_template',
    target: 'https://example.com',
    riskLevel: 'R3',
    reason: 'Test approval',
  });

  assert.equal(approval.expiresAt, undefined);
  const approved = service.decide(approval.id, 'approved');
  assert.ok(approved.expiresAt);
  const expiryTime = new Date(approved.expiresAt).getTime();
  const now = Date.now();
  const defaultTtl = 15 * 60 * 1000;

  assert.ok(Math.abs(expiryTime - (now + defaultTtl)) < 1000);
});

test('ApprovalService sets per-request TTL when approval is approved', () => {
  const store = new InMemoryStore();
  const service = new ApprovalService(store);

  const customTtl = 30 * 60 * 1000; // 30 minutes
  const approval = service.request({
    runId: 'run1',
    tool: 'scanner.run_template',
    target: 'https://example.com',
    riskLevel: 'R3',
    reason: 'Test approval',
    ttlMs: customTtl,
  });

  assert.equal(approval.expiresAt, undefined);
  const approved = service.decide(approval.id, 'approved');
  assert.ok(approved.expiresAt);
  const expiryTime = new Date(approved.expiresAt).getTime();
  const now = Date.now();

  // Should expire in approximately 30 minutes
  assert.ok(Math.abs(expiryTime - (now + customTtl)) < 1000);
});

test('ApprovalService custom default TTL via constructor', () => {
  const store = new InMemoryStore();
  const customDefaultTtl = 2 * 60 * 60 * 1000; // 2 hours
  const service = new ApprovalService(store, undefined, { approvalTtlMs: customDefaultTtl });

  const approval = service.request({
    runId: 'run1',
    tool: 'scanner.run_template',
    target: 'https://example.com',
    riskLevel: 'R3',
    reason: 'Test approval',
  });

  assert.equal(approval.expiresAt, undefined);
  const approved = service.decide(approval.id, 'approved');
  assert.ok(approved.expiresAt);
  const expiryTime = new Date(approved.expiresAt).getTime();
  const now = Date.now();

  // Should use custom default (2 hours)
  assert.ok(Math.abs(expiryTime - (now + customDefaultTtl)) < 1000);
});

test('ApprovalService.isExpired returns false for non-expired approval', () => {
  const store = new InMemoryStore();
  const service = new ApprovalService(store);

  const approval = service.request({
    runId: 'run1',
    tool: 'scanner.run_template',
    target: 'https://example.com',
    riskLevel: 'R3',
    reason: 'Test approval',
  });

  assert.equal(service.isExpired(approval), false);
});

test('ApprovalService.isExpired returns true for expired approval', () => {
  const store = new InMemoryStore();
  const service = new ApprovalService(store);

  // Create approval with very short TTL
  const approval = service.request({
    runId: 'run1',
    tool: 'scanner.run_template',
    target: 'https://example.com',
    riskLevel: 'R3',
    reason: 'Test approval',
    ttlMs: -1000, // Already expired (1 second ago)
  });
  const approved = service.decide(approval.id, 'approved');

  assert.equal(service.isExpired(approved), true);
});

test('ApprovalService.isExpired returns false for legacy approval without expiresAt', () => {
  const store = new InMemoryStore();
  const service = new ApprovalService(store);

  // Manually create legacy approval without expiresAt
  const legacyApproval: ApprovalRequest = {
    id: 'approval1',
    runId: 'run1',
    tool: 'scanner.run_template',
    target: 'https://example.com',
    riskLevel: 'R3',
    reason: 'Legacy approval',
    status: 'approved',
    createdAt: new Date().toISOString(),
    decidedAt: new Date().toISOString(),
    // No expiresAt field
  };
  store.state.approvals[legacyApproval.id] = legacyApproval;

  assert.equal(service.isExpired(legacyApproval), false);
});

test('ApprovalService.getEffectiveStatus returns pending for expired approval', () => {
  const store = new InMemoryStore();
  const service = new ApprovalService(store);

  const approval = service.request({
    runId: 'run1',
    tool: 'scanner.run_template',
    target: 'https://example.com',
    riskLevel: 'R3',
    reason: 'Test approval',
    ttlMs: -1000, // Already expired
  });

  // Even if approved, expired approval is treated as pending
  service.decide(approval.id, 'approved');
  assert.equal(approval.status, 'approved');
  assert.equal(service.getEffectiveStatus(approval), 'pending');
});

test('ApprovalService.getEffectiveStatus returns actual status for non-expired approval', () => {
  const store = new InMemoryStore();
  const service = new ApprovalService(store);

  const approval = service.request({
    runId: 'run1',
    tool: 'scanner.run_template',
    target: 'https://example.com',
    riskLevel: 'R3',
    reason: 'Test approval',
  });

  service.decide(approval.id, 'approved');
  assert.equal(service.getEffectiveStatus(approval), 'approved');

  service.decide(approval.id, 'rejected');
  assert.equal(service.getEffectiveStatus(approval), 'rejected');
});

test('ApprovalService.getEffectiveStatus handles legacy approval correctly', () => {
  const store = new InMemoryStore();
  const service = new ApprovalService(store);

  // Legacy approval without expiresAt
  const legacyApproval: ApprovalRequest = {
    id: 'approval1',
    runId: 'run1',
    tool: 'scanner.run_template',
    target: 'https://example.com',
    riskLevel: 'R3',
    reason: 'Legacy approval',
    status: 'approved',
    createdAt: new Date().toISOString(),
    decidedAt: new Date().toISOString(),
  };
  store.state.approvals[legacyApproval.id] = legacyApproval;

  // Legacy approvals never expire
  assert.equal(service.getEffectiveStatus(legacyApproval), 'approved');
});
