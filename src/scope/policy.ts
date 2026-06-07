import { createHash } from 'node:crypto';
import type { ApprovalStatus, RiskLevel, ScopePolicy } from '../domain/types.js';
import { scopeCache, type ScopeCacheKey } from './scope-cache.js';

export interface ScopeDecision {
  action: 'allow' | 'deny' | 'approval_required';
  reason: string;
}

export function evaluateScope(
  runId: string,
  policy: ScopePolicy,
  target: string,
  method: string,
  riskLevel: RiskLevel,
  approvalStatus?: ApprovalStatus,
  r4AuthorizationToken?: string,
): ScopeDecision {
  const cacheKey: ScopeCacheKey = {
    runId,
    target,
    method,
    riskLevel,
    approvalStatus,
    r4TokenFingerprint: r4AuthorizationToken ? createR4TokenFingerprint(r4AuthorizationToken) : '',
  };

  const cached = scopeCache.get(cacheKey, policy);
  if (cached) return cached;

  const decision = evaluateScopeUncached(policy, target, method, riskLevel, approvalStatus, r4AuthorizationToken);
  scopeCache.set(cacheKey, policy, decision);
  return decision;
}

function evaluateScopeUncached(
  policy: ScopePolicy,
  target: string,
  method: string,
  riskLevel: RiskLevel,
  approvalStatus?: ApprovalStatus,
  r4AuthorizationToken?: string,
): ScopeDecision {
  const normalizedMethod = method.toUpperCase();
  const normalizedTarget = normalizeTarget(target);

  if (!policy.allowedMethods.map((item) => item.toUpperCase()).includes(normalizedMethod)) {
    return { action: 'deny', reason: `HTTP method ${normalizedMethod} is not allowed by scope policy` };
  }

  if (policy.deniedAssets.some((asset) => assetMatches(asset, normalizedTarget))) {
    return { action: 'deny', reason: `${normalizedTarget} is explicitly denied by scope policy` };
  }

  if (!policy.allowedAssets.some((asset) => assetMatches(asset, normalizedTarget))) {
    return { action: 'deny', reason: `${normalizedTarget} is outside the authorized scope` };
  }

  if (riskLevel === 'R4') {
    if (!policy.r4AuthorizationToken) {
      return { action: 'deny', reason: 'R4 actions are prohibited by default' };
    }
    if (r4AuthorizationToken !== policy.r4AuthorizationToken) {
      return { action: 'deny', reason: 'R4 action requires the matching scope authorization token' };
    }
    if (approvalStatus !== 'approved') {
      return { action: 'approval_required', reason: 'R4 action requires matching scope authorization token and explicit human approval' };
    }
    return { action: 'allow', reason: 'R4 allowed by matching scope authorization token and approved request' };
  }

  if (riskLevel === 'R3' && approvalStatus !== 'approved') {
    return { action: 'approval_required', reason: 'R3 action requires explicit human approval' };
  }

  return { action: 'allow', reason: 'Allowed by scope policy' };
}

function normalizeTarget(target: string): string {
  const trimmed = target.trim().toLowerCase();
  if (isCidr(trimmed)) {
    return trimmed;
  }
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed.replace(/\/.*$/, '');
  }
}

function assetMatches(asset: string, targetHost: string): boolean {
  const normalizedAsset = normalizeTarget(asset);
  if (isCidr(normalizedAsset)) {
    return ipv4InCidr(targetHost, normalizedAsset);
  }
  if (normalizedAsset.startsWith('*.')) {
    const suffix = normalizedAsset.slice(1);
    return targetHost.endsWith(suffix) && targetHost !== normalizedAsset.slice(2);
  }
  return normalizedAsset === targetHost;
}

function isCidr(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(value);
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    return false;
  }
  const [base, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);
  if (prefix < 0 || prefix > 32) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function ipv4ToInt(ip: string): number {
  return ip
    .split('.')
    .map(Number)
    .reduce((acc, octet) => ((acc << 8) + octet) >>> 0, 0);
}

function createR4TokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
