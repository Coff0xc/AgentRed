import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CheckpointService } from '../src/checkpoint/checkpoint-service.js';
import { GraphSerializer } from '../src/checkpoint/graph-serializer.js';
import { GraphServer } from '../src/graph/graph-server.js';
import { InMemoryPlatformStore } from '../src/storage/store.js';
import type { CreateRunInput } from '../src/domain/types.js';

describe('CheckpointService', () => {
  it('should create a checkpoint for an active run', async () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const checkpoints = new CheckpointService(graph, store);

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test checkpoint creation',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);
    graph.addFact({
      runId: run.id,
      statement: 'Test fact',
      createdBy: 'test',
    });

    const checkpoint = await checkpoints.createCheckpoint(run.id, 'manual');

    assert.ok(checkpoint.id);
    assert.strictEqual(checkpoint.runId, run.id);
    assert.strictEqual(checkpoint.trigger, 'manual');
    assert.ok(checkpoint.graphSnapshot);
    assert.strictEqual(checkpoint.metadata.factCount, 3); // 2 system facts + 1 test fact
  });

  it('should list checkpoints for a run', async () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const checkpoints = new CheckpointService(graph, store);

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test checkpoint listing',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);

    const checkpoint1 = await checkpoints.createCheckpoint(run.id, 'manual');
    // Add small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));
    const checkpoint2 = await checkpoints.createCheckpoint(run.id, 'auto_interval');

    const list = await checkpoints.listCheckpoints(run.id);

    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].id, checkpoint2.id); // Most recent first
    assert.strictEqual(list[0].trigger, 'auto_interval');
    assert.strictEqual(list[1].id, checkpoint1.id);
    assert.strictEqual(list[1].trigger, 'manual');
  });

  it('should restore checkpoint with resume strategy', async () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const checkpoints = new CheckpointService(graph, store);

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test checkpoint restore',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);
    const fact = graph.addFact({
      runId: run.id,
      statement: 'Checkpoint fact',
      createdBy: 'test',
    });

    const checkpoint = await checkpoints.createCheckpoint(run.id, 'manual');

    // Add more facts after checkpoint
    graph.addFact({
      runId: run.id,
      statement: 'Post-checkpoint fact',
      createdBy: 'test',
    });

    // Restore checkpoint
    const result = await checkpoints.restoreCheckpoint(checkpoint.checkpointId, 'resume');

    assert.strictEqual(result.strategy, 'resume');
    assert.strictEqual(result.runId, run.id);

    // Verify graph state was restored
    const restoredGraph = graph.getGraph(run.id);
    assert.strictEqual(restoredGraph.facts.length, 3); // Should be back to checkpoint state
    assert.ok(restoredGraph.facts.find((f) => f.id === fact.id));
    assert.ok(!restoredGraph.facts.find((f) => f.statement === 'Post-checkpoint fact'));
  });

  it('should restore checkpoint with branch strategy', async () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const checkpoints = new CheckpointService(graph, store);

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test checkpoint branch',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);
    graph.addFact({
      runId: run.id,
      statement: 'Branch test fact',
      createdBy: 'test',
    });

    const checkpoint = await checkpoints.createCheckpoint(run.id, 'manual');

    // Branch creates a new run
    const result = await checkpoints.restoreCheckpoint(checkpoint.checkpointId, 'branch');

    assert.strictEqual(result.strategy, 'branch');
    assert.notStrictEqual(result.runId, run.id); // New run ID

    // Verify new run exists
    const newRun = graph.getRun(result.runId);
    assert.strictEqual(newRun.target, run.target);
    assert.strictEqual(newRun.goal, run.goal);
    assert.strictEqual(newRun.status, 'active');

    // Verify original run is unchanged
    const originalRun = graph.getRun(run.id);
    assert.strictEqual(originalRun.status, 'active');
  });

  it('should auto-checkpoint at configured intervals', async () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const checkpoints = new CheckpointService(graph, store, {
      autoCheckpointInterval: 5,
    });

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test auto-checkpoint',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);

    // Simulate dispatch cycles
    for (let i = 0; i < 12; i++) {
      checkpoints.incrementDispatchCount(run.id);
    }

    assert.strictEqual(checkpoints.shouldAutoCheckpoint(run.id), false); // 12 % 5 != 0
    checkpoints.incrementDispatchCount(run.id); // 13
    assert.strictEqual(checkpoints.shouldAutoCheckpoint(run.id), false);
    checkpoints.incrementDispatchCount(run.id); // 14
    assert.strictEqual(checkpoints.shouldAutoCheckpoint(run.id), false);
    checkpoints.incrementDispatchCount(run.id); // 15
    assert.strictEqual(checkpoints.shouldAutoCheckpoint(run.id), true); // 15 % 5 == 0
  });

  it('should clean up old checkpoints', async () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const checkpoints = new CheckpointService(graph, store, {
      maxCheckpointsPerRun: 3,
    });

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test checkpoint cleanup',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);

    // Create 5 checkpoints
    await checkpoints.createCheckpoint(run.id, 'manual');
    await checkpoints.createCheckpoint(run.id, 'manual');
    await checkpoints.createCheckpoint(run.id, 'manual');
    await checkpoints.createCheckpoint(run.id, 'manual');
    await checkpoints.createCheckpoint(run.id, 'manual');

    const list = await checkpoints.listCheckpoints(run.id);

    // Should only keep 3 most recent
    assert.strictEqual(list.length, 3);
  });

  it('should throw error when creating checkpoint for completed run', async () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const checkpoints = new CheckpointService(graph, store);

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test completed run checkpoint',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);
    graph.completeRun(run.id);

    await assert.rejects(
      async () => await checkpoints.createCheckpoint(run.id, 'manual'),
      /Cannot checkpoint completed or stopped run/
    );
  });

  it('should delete a specific checkpoint', async () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const checkpoints = new CheckpointService(graph, store);

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test checkpoint deletion',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);
    const checkpoint = await checkpoints.createCheckpoint(run.id, 'manual');

    await checkpoints.deleteCheckpoint(checkpoint.checkpointId);

    await assert.rejects(
      async () => await checkpoints.getCheckpoint(checkpoint.checkpointId),
      /Checkpoint not found/
    );
  });
});

describe('GraphSerializer', () => {
  it('should serialize and deserialize graph snapshot', () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const serializer = new GraphSerializer();

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test serialization',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);
    graph.addFact({
      runId: run.id,
      statement: 'Serialization test',
      createdBy: 'test',
    });

    const snapshot = graph.getGraph(run.id);
    const serialized = serializer.serialize(snapshot, true);

    assert.ok(serialized.compressed);
    assert.ok(serialized.sizeBytes < serialized.uncompressedSizeBytes);

    const deserialized = serializer.deserialize(serialized);

    assert.strictEqual(deserialized.run.id, run.id);
    assert.strictEqual(deserialized.facts.length, snapshot.facts.length);
  });

  it('should compute delta between snapshots', () => {
    const store = new InMemoryPlatformStore();
    const graph = new GraphServer(store);
    const serializer = new GraphSerializer();

    const runInput: CreateRunInput = {
      target: 'https://example.com',
      goal: 'Test delta computation',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
    };

    const run = graph.createRun(runInput);
    const baseline = graph.getGraph(run.id);

    const fact = graph.addFact({
      runId: run.id,
      statement: 'New fact',
      createdBy: 'test',
    });

    const current = graph.getGraph(run.id);
    const delta = serializer.computeDelta(baseline, current);

    assert.strictEqual(delta.addedFactIds.length, 1);
    assert.strictEqual(delta.addedFactIds[0], fact.id);
  });

  it('should validate graph snapshot structure', () => {
    const serializer = new GraphSerializer();

    const invalidSnapshot = {
      run: null,
      facts: [],
      intents: [],
      hints: [],
      evidence: [],
      findings: [],
    };

    assert.throws(
      () => serializer.deserialize({
        version: '1.0.0',
        compressed: false,
        data: JSON.stringify(invalidSnapshot),
        sizeBytes: 100,
        uncompressedSizeBytes: 100,
      }),
      /Invalid graph snapshot: missing run/
    );
  });
});
