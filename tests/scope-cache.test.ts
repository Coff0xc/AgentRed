import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScope } from '../src/scope/policy.js';
import { ScopeCache, scopeCache } from '../src/scope/scope-cache.js';
import type { ScopePolicy } from '../src/domain/types.js';

describe('ScopeCache', () => {
  let cache: ScopeCache;
  let basePolicy: ScopePolicy;

  beforeEach(() => {
    cache = new ScopeCache(5000, 5 * 60 * 1000);
    basePolicy = {
      allowedAssets: ['example.com', '*.example.com', '10.0.0.0/8'],
      deniedAssets: ['blocked.example.com'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: true },
      rateLimits: { requestsPerMinute: 60 },
    };
  });

  describe('cache hit/miss behavior', () => {
    it('should return null on cache miss', () => {
      const decision = cache.get(
        { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' },
        basePolicy,
      );
      assert.equal(decision, null);
      assert.equal(cache.stats().misses, 1);
      assert.equal(cache.stats().hits, 0);
    });

    it('should return cached decision on cache hit with identical inputs', () => {
      const key = { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1' as const, approvalStatus: undefined, r4TokenFingerprint: '' };
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      cache.set(key, basePolicy, decision);
      const cached = cache.get(key, basePolicy);
      assert.deepEqual(cached, decision);
      assert.equal(cache.stats().hits, 1);
      assert.equal(cache.stats().misses, 0);
    });

    it('should normalize target and method for cache key consistency', () => {
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      cache.set(
        { runId: 'run_001', target: 'HTTPS://EXAMPLE.COM/API', method: 'get', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' },
        basePolicy,
        decision,
      );
      const cached = cache.get(
        { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' },
        basePolicy,
      );
      assert.deepEqual(cached, decision);
      assert.equal(cache.stats().hits, 1);
    });

    it('should cache miss when any input parameter differs', () => {
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      const baseKey = { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1' as const, approvalStatus: undefined, r4TokenFingerprint: '' };
      cache.set(baseKey, basePolicy, decision);
      assert.equal(cache.get({ ...baseKey, target: 'https://other.com' }, basePolicy), null);
      assert.equal(cache.get({ ...baseKey, method: 'POST' }, basePolicy), null);
      assert.equal(cache.get({ ...baseKey, riskLevel: 'R2' }, basePolicy), null);
      assert.equal(cache.get({ ...baseKey, approvalStatus: 'approved' }, basePolicy), null);
      assert.equal(cache.get({ ...baseKey, r4TokenFingerprint: 'abc123' }, basePolicy), null);
      assert.equal(cache.stats().misses, 5);
      assert.equal(cache.stats().hits, 0);
    });
  });

  describe('TTL expiry', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new ScopeCache(5000, 100);
      const key = { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1' as const, approvalStatus: undefined, r4TokenFingerprint: '' };
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      shortTtlCache.set(key, basePolicy, decision);
      assert.deepEqual(shortTtlCache.get(key, basePolicy), decision);
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(shortTtlCache.get(key, basePolicy), null);
      assert.equal(shortTtlCache.stats().hits, 1);
      assert.equal(shortTtlCache.stats().misses, 1);
    });

    it('should not expire entries before TTL', async () => {
      const longTtlCache = new ScopeCache(5000, 10_000);
      const key = { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1' as const, approvalStatus: undefined, r4TokenFingerprint: '' };
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      longTtlCache.set(key, basePolicy, decision);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepEqual(longTtlCache.get(key, basePolicy), decision);
      assert.equal(longTtlCache.stats().hits, 1);
    });
  });

  describe('policy digest invalidation', () => {
    it('should invalidate cache when ScopePolicy changes', () => {
      const key = { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1' as const, approvalStatus: undefined, r4TokenFingerprint: '' };
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      cache.set(key, basePolicy, decision);
      assert.deepEqual(cache.get(key, basePolicy), decision);
      const modifiedPolicy: ScopePolicy = { ...basePolicy, allowedAssets: ['newdomain.com'] };
      assert.equal(cache.get(key, modifiedPolicy), null);
      assert.equal(cache.stats().hits, 1);
      assert.equal(cache.stats().misses, 1);
    });

    it('should not invalidate when policy is unchanged', () => {
      const key = { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1' as const, approvalStatus: undefined, r4TokenFingerprint: '' };
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      cache.set(key, basePolicy, decision);
      const identicalPolicy: ScopePolicy = {
        allowedAssets: ['example.com', '*.example.com', '10.0.0.0/8'],
        deniedAssets: ['blocked.example.com'],
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: true },
        rateLimits: { requestsPerMinute: 60 },
      };
      assert.deepEqual(cache.get(key, identicalPolicy), decision);
      assert.equal(cache.stats().hits, 1);
    });

    it('should invalidate when allowedMethods change', () => {
      const key = { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1' as const, approvalStatus: undefined, r4TokenFingerprint: '' };
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      cache.set(key, basePolicy, decision);
      const modifiedPolicy: ScopePolicy = { ...basePolicy, allowedMethods: ['GET', 'POST'] };
      assert.equal(cache.get(key, modifiedPolicy), null);
    });

    it('should invalidate when R4 authorization token is added', () => {
      const key = { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R1' as const, approvalStatus: undefined, r4TokenFingerprint: '' };
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      cache.set(key, basePolicy, decision);
      const policyWithR4: ScopePolicy = { ...basePolicy, r4AuthorizationToken: 'secret-token-123' };
      assert.equal(cache.get(key, policyWithR4), null);
    });

    it('should invalidate when R4 authorization token changes', () => {
      const key = { runId: 'run_001', target: 'https://example.com/api', method: 'GET', riskLevel: 'R4' as const, approvalStatus: 'approved' as const, r4TokenFingerprint: 'old-token' };
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      const policyWithOldR4: ScopePolicy = { ...basePolicy, r4AuthorizationToken: 'old-token' };
      cache.set(key, policyWithOldR4, decision);

      const policyWithNewR4: ScopePolicy = { ...basePolicy, r4AuthorizationToken: 'new-token' };
      assert.equal(cache.get(key, policyWithNewR4), null);
    });
  });

  describe('LRU eviction', () => {
    it('should evict LRU entry when capacity is reached', () => {
      const smallCache = new ScopeCache(3, 5 * 60 * 1000);
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      for (let i = 1; i <= 3; i++) {
        smallCache.set({ runId: 'run_001', target: `https://example${i}.com`, method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      }
      assert.equal(smallCache.stats().size, 3);
      assert.equal(smallCache.stats().evictions, 0);
      smallCache.set({ runId: 'run_001', target: 'https://example4.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      assert.equal(smallCache.stats().size, 3);
      assert.equal(smallCache.stats().evictions, 1);
      assert.equal(smallCache.get({ runId: 'run_001', target: 'https://example1.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy), null);
      assert.deepEqual(smallCache.get({ runId: 'run_001', target: 'https://example2.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy), decision);
    });

    it('should update LRU order on cache access', () => {
      const smallCache = new ScopeCache(3, 5 * 60 * 1000);
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      for (let i = 1; i <= 3; i++) {
        smallCache.set({ runId: 'run_001', target: `https://example${i}.com`, method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      }
      smallCache.get({ runId: 'run_001', target: 'https://example1.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy);
      smallCache.set({ runId: 'run_001', target: 'https://example4.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      assert.deepEqual(smallCache.get({ runId: 'run_001', target: 'https://example1.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy), decision);
      assert.equal(smallCache.get({ runId: 'run_001', target: 'https://example2.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy), null);
    });
  });

  describe('run isolation', () => {
    it('should isolate cache entries by run ID', () => {
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      cache.set({ runId: 'run_001', target: 'https://example.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      assert.equal(cache.get({ runId: 'run_002', target: 'https://example.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy), null);
    });

    it('should invalidate only specific run entries', () => {
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      cache.set({ runId: 'run_001', target: 'https://example.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      cache.set({ runId: 'run_002', target: 'https://example.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      assert.equal(cache.stats().size, 2);
      cache.invalidateRun('run_001');
      assert.equal(cache.stats().size, 1);
      assert.equal(cache.get({ runId: 'run_001', target: 'https://example.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy), null);
      assert.deepEqual(cache.get({ runId: 'run_002', target: 'https://example.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy), decision);
    });
  });

  describe('cache statistics', () => {
    it('should track hit and miss rates', () => {
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      const key = { runId: 'run_001', target: 'https://example.com', method: 'GET', riskLevel: 'R1' as const, approvalStatus: undefined, r4TokenFingerprint: '' };
      cache.set(key, basePolicy, decision);
      cache.get(key, basePolicy);
      cache.get(key, basePolicy);
      cache.get(key, basePolicy);
      cache.get({ ...key, target: 'https://other1.com' }, basePolicy);
      cache.get({ ...key, target: 'https://other2.com' }, basePolicy);
      const stats = cache.stats();
      assert.equal(stats.hits, 3);
      assert.equal(stats.misses, 2);
      assert.equal(stats.hitRate, 0.6);
    });

    it('should track cache size and capacity', () => {
      const smallCache = new ScopeCache(10, 5 * 60 * 1000);
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      for (let i = 0; i < 5; i++) {
        smallCache.set({ runId: 'run_001', target: `https://example${i}.com`, method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      }
      const stats = smallCache.stats();
      assert.equal(stats.size, 5);
      assert.equal(stats.capacity, 10);
    });

    it('should track entry ages', () => {
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      cache.set({ runId: 'run_001', target: 'https://example.com', method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      const stats = cache.stats();
      assert.ok(stats.oldestEntryAge !== null && stats.oldestEntryAge >= 0);
      assert.ok(stats.newestEntryAge !== null && stats.newestEntryAge >= 0);
      assert.ok(stats.oldestEntryAge >= stats.newestEntryAge);
    });
  });

  describe('clear operation', () => {
    it('should clear all entries and reset stats', () => {
      const decision = { action: 'allow' as const, reason: 'Allowed by scope policy' };
      for (let i = 0; i < 10; i++) {
        cache.set({ runId: 'run_001', target: `https://example${i}.com`, method: 'GET', riskLevel: 'R1', approvalStatus: undefined, r4TokenFingerprint: '' }, basePolicy, decision);
      }
      assert.equal(cache.stats().size, 10);
      cache.clear();
      const stats = cache.stats();
      assert.equal(stats.size, 0);
      assert.equal(stats.hits, 0);
      assert.equal(stats.misses, 0);
      assert.equal(stats.evictions, 0);
    });
  });

  describe('evaluateScope integration', () => {
    beforeEach(() => {
      scopeCache.clear();
    });

    it('should cache scope evaluation results', () => {
      const result1 = evaluateScope('run_001', basePolicy, 'https://example.com/api', 'GET', 'R1');
      const result2 = evaluateScope('run_001', basePolicy, 'https://example.com/api', 'GET', 'R1');
      assert.deepEqual(result1, result2);
      assert.equal(scopeCache.stats().hits, 1);
    });

    it('should handle approval status in cache key', () => {
      const result1 = evaluateScope('run_001', basePolicy, 'https://example.com/api', 'GET', 'R3');
      const result2 = evaluateScope('run_001', basePolicy, 'https://example.com/api', 'GET', 'R3', 'approved');
      assert.equal(result1.action, 'approval_required');
      assert.equal(result2.action, 'allow');
      assert.equal(scopeCache.stats().misses, 2);
    });

    it('should handle R4 authorization token in cache key', () => {
      const policyWithR4: ScopePolicy = { ...basePolicy, r4AuthorizationToken: 'secret-token' };
      const result1 = evaluateScope('run_001', policyWithR4, 'https://example.com/api', 'GET', 'R4');
      const result2 = evaluateScope('run_001', policyWithR4, 'https://example.com/api', 'GET', 'R4', 'approved', 'secret-token');
      assert.equal(result1.action, 'deny');
      assert.equal(result2.action, 'allow');
    });
  });

  describe('performance benchmark', () => {
    it('should provide significant performance improvement for repeated evaluations', () => {
      const iterations = 1000;
      evaluateScope('run_001', basePolicy, 'https://example.com/api', 'GET', 'R1');
      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        evaluateScope('run_001', basePolicy, 'https://example.com/api', 'GET', 'R1');
      }
      const cachedDuration = Date.now() - start;
      const stats = scopeCache.stats();
      assert.ok(stats.hits > 0);
      assert.ok(stats.hitRate > 0.95);
      assert.ok(cachedDuration < 100);
      console.log(`Performance: ${iterations} cached evaluations in ${cachedDuration}ms`);
      console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
      console.log(`Average per call: ${(cachedDuration / iterations).toFixed(3)}ms`);
    });
  });

  describe('edge cases', () => {
    it('should handle invalid capacity', () => {
      assert.throws(() => new ScopeCache(0, 5000), /Cache capacity must be positive/);
      assert.throws(() => new ScopeCache(-1, 5000), /Cache capacity must be positive/);
    });

    it('should handle invalid TTL', () => {
      assert.throws(() => new ScopeCache(5000, 0), /Cache TTL must be positive/);
      assert.throws(() => new ScopeCache(5000, -1), /Cache TTL must be positive/);
    });

    it('should handle empty cache stats', () => {
      const emptyCache = new ScopeCache();
      const stats = emptyCache.stats();
      assert.equal(stats.size, 0);
      assert.equal(stats.hits, 0);
      assert.equal(stats.misses, 0);
      assert.equal(stats.hitRate, 0);
      assert.equal(stats.oldestEntryAge, null);
      assert.equal(stats.newestEntryAge, null);
    });
  });
});
