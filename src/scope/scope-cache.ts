import { createHash } from 'node:crypto';
import type { ApprovalStatus, RiskLevel, ScopePolicy } from '../domain/types.js';
import type { ScopeDecision } from './policy.js';

export interface ScopeCacheEntry {
  decision: ScopeDecision;
  cachedAt: number;
  policyDigest: string;
}

export interface ScopeCacheKey {
  runId: string;
  target: string;
  method: string;
  riskLevel: RiskLevel;
  approvalStatus: ApprovalStatus | undefined;
  r4TokenFingerprint: string;
}

export interface ScopeCacheStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  oldestEntryAge: number | null;
  newestEntryAge: number | null;
}

export class ScopeCache {
  private readonly cache = new Map<string, ScopeCacheEntry>();
  private readonly accessOrder: string[] = [];
  private readonly policyDigests = new Map<string, string>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(
    private readonly capacity: number = 5000,
    private readonly ttlMs: number = 5 * 60 * 1000,
  ) {
    if (capacity <= 0) throw new Error('Cache capacity must be positive');
    if (ttlMs <= 0) throw new Error('Cache TTL must be positive');
  }

  get(key: ScopeCacheKey, policy: ScopePolicy): ScopeDecision | null {
    const cacheKey = this.buildCacheKey(key);
    const policyDigest = this.computePolicyDigest(policy);
    const cachedPolicyDigest = this.policyDigests.get(key.runId);

    if (cachedPolicyDigest && cachedPolicyDigest !== policyDigest) {
      this.invalidateRun(key.runId);
      this.policyDigests.set(key.runId, policyDigest);
      this.misses++;
      return null;
    }

    if (!cachedPolicyDigest) this.policyDigests.set(key.runId, policyDigest);
    const entry = this.cache.get(cacheKey);
    if (!entry) { this.misses++; return null; }

    const age = Date.now() - entry.cachedAt;
    if (age > this.ttlMs || entry.policyDigest !== policyDigest) {
      this.cache.delete(cacheKey);
      this.removeFromAccessOrder(cacheKey);
      this.misses++;
      return null;
    }

    this.updateAccessOrder(cacheKey);
    this.hits++;
    return entry.decision;
  }

  set(key: ScopeCacheKey, policy: ScopePolicy, decision: ScopeDecision): void {
    const cacheKey = this.buildCacheKey(key);
    const policyDigest = this.computePolicyDigest(policy);
    this.policyDigests.set(key.runId, policyDigest);

    if (this.cache.size >= this.capacity && !this.cache.has(cacheKey)) {
      this.evictLru();
    }

    this.cache.set(cacheKey, { decision, cachedAt: Date.now(), policyDigest });
    this.updateAccessOrder(cacheKey);
  }

  invalidateRun(runId: string): void {
    const prefix = `${runId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
      }
    }
    this.policyDigests.delete(runId);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder.length = 0;
    this.policyDigests.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  stats(): ScopeCacheStats {
    const now = Date.now();
    let oldestAge: number | null = null;
    let newestAge: number | null = null;
    for (const entry of this.cache.values()) {
      const age = now - entry.cachedAt;
      if (oldestAge === null || age > oldestAge) oldestAge = age;
      if (newestAge === null || age < newestAge) newestAge = age;
    }
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? this.hits / total : 0,
      oldestEntryAge: oldestAge,
      newestEntryAge: newestAge,
    };
  }

  private buildCacheKey(key: ScopeCacheKey): string {
    const normalizedTarget = key.target.trim().toLowerCase();
    const normalizedMethod = key.method.toUpperCase();
    const approvalPart = key.approvalStatus ?? 'none';
    const r4Part = key.r4TokenFingerprint || 'no-r4token';
    return `${key.runId}:${normalizedTarget}:${normalizedMethod}:${key.riskLevel}:${approvalPart}:${r4Part}`;
  }

  private computePolicyDigest(policy: ScopePolicy): string {
    const digest = createHash('sha256');
    digest.update(JSON.stringify({
      allowedAssets: [...policy.allowedAssets].sort(),
      deniedAssets: [...policy.deniedAssets].sort(),
      allowedMethods: [...policy.allowedMethods].sort(),
      r4AuthorizationTokenDigest: policy.r4AuthorizationToken
        ? createHash('sha256').update(policy.r4AuthorizationToken).digest('hex')
        : null,
    }));
    return digest.digest('hex');
  }

  private evictLru(): void {
    if (this.accessOrder.length === 0) return;
    const lruKey = this.accessOrder.shift()!;
    this.cache.delete(lruKey);
    this.evictions++;
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) this.accessOrder.splice(index, 1);
  }
}

export const scopeCache = new ScopeCache();
