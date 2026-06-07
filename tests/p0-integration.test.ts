/**
 * P0 Integration Test - Verify all newly integrated services are accessible via API
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlatform, type Platform } from '../src/platform.js';
import { startApiServer, type ApiHandle } from '../src/api/server.js';

test('Platform includes all P0 services', async () => {
  const platform = createPlatform();

  // Verify CheckpointService is registered
  assert.ok(platform.checkpoint, 'CheckpointService should be registered');
  assert.strictEqual(typeof platform.checkpoint.createCheckpoint, 'function');
  assert.strictEqual(typeof platform.checkpoint.listCheckpoints, 'function');
  assert.strictEqual(typeof platform.checkpoint.restoreCheckpoint, 'function');

  // Verify McpBundleManager is registered
  assert.ok(platform.mcpBundles, 'McpBundleManager should be registered');
  assert.strictEqual(typeof platform.mcpBundles.listBundles, 'function');
  assert.strictEqual(typeof platform.mcpBundles.getBundle, 'function');

  // Verify McpPoisonDetector is registered
  assert.ok(platform.mcpSecurity, 'McpPoisonDetector should be registered');
  assert.strictEqual(typeof platform.mcpSecurity.checkServerExecutable, 'function');
  assert.strictEqual(typeof platform.mcpSecurity.checkToolSchema, 'function');
  assert.strictEqual(typeof platform.mcpSecurity.checkOutputContent, 'function');

  // Verify DockerRuntime is registered
  assert.ok(platform.sandbox, 'DockerRuntime should be registered');
  assert.strictEqual(platform.sandbox.kind, 'docker');
  assert.strictEqual(typeof platform.sandbox.isAvailable, 'function');

  // Verify Neo4jKnowledgeGraphAdapter is registered (can be null if not configured)
  assert.ok(platform.knowledgeGraph === null || typeof platform.knowledgeGraph === 'object', 'KnowledgeGraph should be null or object');
});

test('API exposes checkpoint endpoints', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, {
    port: 0,
    host: '127.0.0.1',
    authToken: 'test-token-p0',
  });

  try {
    const baseUrl = api.url;

    // Create a test run first
    const createRunRes = await fetch(`${baseUrl}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-p0',
      },
      body: JSON.stringify({
        target: 'https://example.com',
        goal: 'Test checkpoint functionality',
        scopePolicy: {
          allowedAssets: ['https://example.com'],
          deniedAssets: [],
          allowedMethods: ['GET', 'POST'],
          destructiveAllowed: false,
          credentialRules: {
            allowVaultReferencesOnly: false,
          },
          rateLimits: {
            requestsPerMinute: 60,
          },
        },
        workerPool: [
          { name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }
        ],
      }),
    });

    assert.strictEqual(createRunRes.status, 201, 'Run creation should succeed');
    const run = await createRunRes.json();
    const runId = run.id;

    // Test POST /runs/{id}/checkpoint
    const createCheckpointRes = await fetch(`${baseUrl}/runs/${runId}/checkpoint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-p0',
      },
      body: JSON.stringify({ trigger: 'manual' }),
    });

    assert.strictEqual(createCheckpointRes.status, 201, 'Checkpoint creation should succeed');
    const checkpoint = await createCheckpointRes.json();
    assert.ok(checkpoint.checkpointId, 'Checkpoint should have checkpointId');
    assert.ok(checkpoint.timestamp, 'Checkpoint should have timestamp');

    // Test GET /runs/{id}/checkpoints
    const listCheckpointsRes = await fetch(`${baseUrl}/runs/${runId}/checkpoints`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token-p0',
      },
    });

    assert.strictEqual(listCheckpointsRes.status, 200, 'List checkpoints should succeed');
    const checkpoints = await listCheckpointsRes.json();
    assert.ok(Array.isArray(checkpoints), 'Checkpoints should be an array');
    assert.ok(checkpoints.length > 0, 'Should have at least one checkpoint');
  } finally {
    await api.close();
  }
});

test('API exposes MCP bundle endpoints', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, {
    port: 0,
    host: '127.0.0.1',
    authToken: 'test-token-mcp',
  });

  try {
    const baseUrl = api.url;

    // Test GET /mcp/bundles
    const listBundlesRes = await fetch(`${baseUrl}/mcp/bundles`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token-mcp',
      },
    });

    assert.strictEqual(listBundlesRes.status, 200, 'List MCP bundles should succeed');
    const bundles = await listBundlesRes.json();
    assert.ok(Array.isArray(bundles), 'MCP bundles should be an array');
    assert.ok(bundles.length > 0, 'Should have built-in MCP bundles');

    // Verify bundle structure
    const firstBundle = bundles[0];
    assert.ok(firstBundle.id, 'Bundle should have id');
    assert.ok(firstBundle.name, 'Bundle should have name');
    assert.ok(firstBundle.maturity, 'Bundle should have maturity level');
  } finally {
    await api.close();
  }
});

test('API exposes MCP security scan endpoint', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, {
    port: 0,
    host: '127.0.0.1',
    authToken: 'test-token-mcp-scan',
  });

  try {
    const baseUrl = api.url;

    // Test POST /mcp/scan with a safe path
    const scanRes = await fetch(`${baseUrl}/mcp/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-mcp-scan',
      },
      body: JSON.stringify({
        serverPath: '/usr/bin/node',
      }),
    });

    assert.strictEqual(scanRes.status, 200, 'MCP scan should succeed');
    const scanResult = await scanRes.json();
    assert.ok(typeof scanResult.safe === 'boolean', 'Scan result should have safe boolean');
  } finally {
    await api.close();
  }
});

test('API exposes benchmark execution endpoint', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, {
    port: 0,
    host: '127.0.0.1',
    authToken: 'test-token-benchmark',
  });

  try {
    const baseUrl = api.url;

    // Create a test run first
    const createRunRes = await fetch(`${baseUrl}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-benchmark',
      },
      body: JSON.stringify({
        target: 'https://example.com',
        goal: 'Test benchmark execution',
        scopePolicy: {
          allowedAssets: ['https://example.com'],
          deniedAssets: [],
          allowedMethods: ['GET', 'POST'],
          destructiveAllowed: false,
          credentialRules: {
            allowVaultReferencesOnly: false,
          },
          rateLimits: {
            requestsPerMinute: 60,
          },
        },
        workerPool: [
          { name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }
        ],
      }),
    });

    assert.strictEqual(createRunRes.status, 201, 'Run creation should succeed');
    const run = await createRunRes.json();
    const runId = run.id;

    // Test POST /benchmark/execute
    const benchmarkRes = await fetch(`${baseUrl}/benchmark/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-benchmark',
      },
      body: JSON.stringify({
        scenarioId: 'owasp-sqli-01',
        runId: runId,
      }),
    });

    assert.strictEqual(benchmarkRes.status, 200, 'Benchmark execution should succeed');
    const benchmarkResult = await benchmarkRes.json();
    assert.ok(benchmarkResult.id, 'Benchmark result should have id');
    assert.ok(benchmarkResult.status, 'Benchmark result should have status');
  } finally {
    await api.close();
  }
});

test('Sandbox runtime is available through platform', async () => {
  const platform = createPlatform();

  assert.ok(platform.sandbox, 'Sandbox runtime should be available');
  assert.strictEqual(platform.sandbox.kind, 'docker', 'Sandbox should be Docker runtime');

  const isAvailable = await platform.sandbox.isAvailable();
  assert.strictEqual(typeof isAvailable, 'boolean', 'isAvailable should return boolean');

  const version = await platform.sandbox.version();
  assert.ok(version === undefined || typeof version === 'string', 'version should be undefined or string');
});

test('Knowledge graph adapter supports optional Neo4j config', async () => {
  // Test without Neo4j config
  const platformWithoutNeo4j = createPlatform();
  assert.strictEqual(platformWithoutNeo4j.knowledgeGraph, null, 'Knowledge graph should be null without config');

  // Test with Neo4j config (won't actually connect)
  const platformWithNeo4j = createPlatform({
    neo4jConfig: {
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'test',
      enabled: false, // disabled for test
    },
  });

  assert.ok(platformWithNeo4j.knowledgeGraph, 'Knowledge graph should be initialized with config');
  assert.strictEqual(platformWithNeo4j.knowledgeGraph?.isAvailable(), false, 'Should not be available when disabled');
});
