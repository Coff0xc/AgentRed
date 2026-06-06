/**
 * Knowledge Graph Service Tests
 *
 * Tests for Neo4j knowledge graph integration.
 * These tests run with Neo4j mocked to avoid requiring a real database.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { KnowledgeGraphService } from '../src/knowledge-graph/knowledge-graph-service.js';
import { InMemoryPlatformStore } from '../src/storage/store.js';
import type { Fact, Evidence, Finding, Run } from '../src/domain/types.js';
import { newId, nowIso } from '../src/domain/ids.js';

describe('KnowledgeGraphService', () => {
  it('should initialize with Neo4j unavailable and not throw', async () => {
    const store = new InMemoryPlatformStore();
    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    const initialized = await service.initialize();
    assert.strictEqual(initialized, false, 'Should return false when disabled');
    assert.strictEqual(service.isAvailable(), false, 'Should not be available');
  });

  it('should gracefully handle sync operations when Neo4j is unavailable', async () => {
    const store = new InMemoryPlatformStore();
    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    const fact: Fact = {
      id: newId('fact'),
      runId: 'run-1',
      statement: 'Test fact',
      evidenceIds: [],
      confidence: 'confirmed',
      createdBy: 'test',
      createdAt: nowIso(),
    };

    // Should not throw
    await service.syncFact(fact);
    assert.ok(true, 'Should not throw when syncing with Neo4j unavailable');
  });

  it('should return empty results for queries when Neo4j is unavailable', async () => {
    const store = new InMemoryPlatformStore();
    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    const graph = await service.getRunKnowledgeGraph('run-1');
    assert.strictEqual(graph.nodes.length, 0, 'Should return empty nodes');
    assert.strictEqual(graph.edges.length, 0, 'Should return empty edges');
    assert.strictEqual(graph.paths.length, 0, 'Should return empty paths');
  });

  it('should return analysis with recommendations when Neo4j is unavailable', async () => {
    const store = new InMemoryPlatformStore();
    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    const analysis = await service.analyzeAttackPaths('run-1');
    assert.strictEqual(analysis.runId, 'run-1', 'Should return correct runId');
    assert.strictEqual(analysis.totalPaths, 0, 'Should return zero paths');
    assert.ok(
      analysis.recommendations.some(r => r.includes('not available')),
      'Should include unavailability note in recommendations'
    );
  });

  it('should provide reasoning for findings without Neo4j', async () => {
    const store = new InMemoryPlatformStore();

    // Create test data
    const runId = newId('run');
    const evidenceId = newId('evidence');
    const findingId = newId('finding');

    store.state.runs[runId] = {
      id: runId,
      target: 'https://example.com',
      goal: 'Test security',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
      status: 'active',
      createdAt: nowIso(),
    };

    store.state.evidence[evidenceId] = {
      id: evidenceId,
      runId,
      kind: 'http_exchange',
      redactionState: 'redacted',
      localUri: 'local://evidence/abc123',
      sha256: 'abc123',
      createdAt: nowIso(),
    };

    store.state.findings[findingId] = {
      id: findingId,
      runId,
      title: 'Test Finding',
      impact: 'Test description',
      severity: 'high',
      confidence: 'confirmed',
      affectedAssets: [],
      reproSteps: [],
      remediation: '',
      validationState: 'confirmed',
      evidenceIds: [evidenceId],
      createdAt: nowIso(),
    };

    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    const reasoning = await service.getReasoningForFinding(findingId);
    assert.strictEqual(reasoning.finding?.id, findingId, 'Should return the finding');
    assert.strictEqual(reasoning.supportingEvidence.length, 1, 'Should return supporting evidence');
    assert.strictEqual(reasoning.derivationPath, null, 'Should have no path without Neo4j');
    assert.ok(
      reasoning.reasoning.some(r => r.includes('not available')),
      'Should explain Neo4j is not available'
    );
  });

  it('should handle missing finding gracefully', async () => {
    const store = new InMemoryPlatformStore();
    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    const reasoning = await service.getReasoningForFinding('nonexistent');
    assert.strictEqual(reasoning.finding, null, 'Should return null finding');
    assert.ok(
      reasoning.reasoning.some(r => r.includes('not found')),
      'Should explain finding was not found'
    );
  });

  it('should handle sync operations with relationships', async () => {
    const store = new InMemoryPlatformStore();

    const runId = newId('run');
    const intentId = newId('intent');
    const factId = newId('fact');
    const evidenceId = newId('evidence');

    store.state.runs[runId] = {
      id: runId,
      target: 'https://example.com',
      goal: 'Test',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
      status: 'active',
      createdAt: nowIso(),
    };

    store.state.intents[intentId] = {
      id: intentId,
      runId,
      fromFactIds: [],
      hypothesis: 'Test intent',
      status: 'concluded',
      riskLevel: 'R1',
      createdBy: 'test',
      createdAt: nowIso(),
    };

    store.state.evidence[evidenceId] = {
      id: evidenceId,
      runId,
      kind: 'command_output',
      redactionState: 'redacted',
      localUri: 'local://evidence/xyz789',
      sha256: 'xyz789',
      createdAt: nowIso(),
    };

    store.state.facts[factId] = {
      id: factId,
      runId,
      fromIntentId: intentId,
      statement: 'Found vulnerability',
      evidenceIds: [evidenceId],
      confidence: 'confirmed',
      createdBy: 'worker',
      createdAt: nowIso(),
    };

    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    // Should not throw even with complex relationships
    await service.syncFact(store.state.facts[factId]);
    assert.ok(true, 'Should handle sync with relationships');
  });

  it('should handle run sync without throwing', async () => {
    const store = new InMemoryPlatformStore();

    const runId = newId('run');
    store.state.runs[runId] = {
      id: runId,
      target: 'https://example.com',
      goal: 'Complete test',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
      status: 'active',
      createdAt: nowIso(),
    };

    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    await service.syncRun(runId);
    assert.ok(true, 'Should sync entire run without errors');
  });

  it('should throw for nonexistent run sync', async () => {
    const store = new InMemoryPlatformStore();
    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    await assert.rejects(
      async () => {
        await service.syncRun('nonexistent');
      },
      /Run not found/,
      'Should throw for nonexistent run'
    );
  });

  it('should handle close operation safely', async () => {
    const store = new InMemoryPlatformStore();
    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();
    await service.close();

    assert.strictEqual(service.isAvailable(), false, 'Should not be available after close');
  });

  it('should return empty paths for path queries when unavailable', async () => {
    const store = new InMemoryPlatformStore();
    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    const paths = await service.findPathsBetween('run-1', 'node-1', 'node-2');
    assert.strictEqual(paths.length, 0, 'Should return empty paths');
  });

  it('should return empty paths for inference when unavailable', async () => {
    const store = new InMemoryPlatformStore();
    const service = new KnowledgeGraphService(store, {
      uri: 'neo4j://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false,
    });

    await service.initialize();

    const paths = await service.inferAttackPaths('run-1');
    assert.strictEqual(paths.length, 0, 'Should return empty inferred paths');
  });
});
