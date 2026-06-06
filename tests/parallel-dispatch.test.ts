import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPlatformStore } from '../src/storage/store.js';
import { GraphServer } from '../src/graph/graph-server.js';
import { Dispatcher } from '../src/dispatcher/dispatcher.js';
import { ParallelDispatchService } from '../src/scheduling/parallel-dispatch-service.js';
import type { WorkerConfig, WorkerRole, ScopePolicy } from '../src/domain/types.js';

const testPolicy: ScopePolicy = {
  allowedAssets: ['example.com'],
  deniedAssets: [],
  allowedMethods: ['GET', 'POST'],
  destructiveAllowed: false,
  credentialRules: { allowVaultReferencesOnly: true },
  rateLimits: { requestsPerMinute: 120 },
};

describe('ParallelDispatchService', () => {
  let store: InMemoryPlatformStore;
  let graph: GraphServer;
  let dispatcher: Dispatcher;
  let parallelDispatch: ParallelDispatchService;

  beforeEach(() => {
    store = new InMemoryPlatformStore();
    graph = new GraphServer(store);
    dispatcher = new Dispatcher(graph);
    parallelDispatch = new ParallelDispatchService(graph, dispatcher);
  });

  describe('Role-based worker assignment', () => {
    it('should match scout intent to scout worker', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test parallel dispatch',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('scout-1', 'scout'),
          createWorker('exploit-1', 'exploit'),
          createWorker('credential-1', 'credential'),
        ],
      });

      // Create a scout intent
      const intent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Map the attack surface',
        riskLevel: 'R1',
        role: 'scout',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 1);
      assert.strictEqual(preview.assignments[0].intent.id, intent.id);
      assert.strictEqual(preview.assignments[0].worker?.name, 'scout-1');
      assert.strictEqual(preview.assignments[0].worker?.role, 'scout');
      assert.strictEqual(preview.assignments[0].reason, 'Exact role match');
    });

    it('should match exploit intent to exploit worker', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test parallel dispatch',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('scout-1', 'scout'),
          createWorker('exploit-1', 'exploit'),
          createWorker('credential-1', 'credential'),
        ],
      });

      const intent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Verify SQL injection in /api/users',
        riskLevel: 'R3',
        role: 'exploit',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 1);
      assert.strictEqual(preview.assignments[0].intent.id, intent.id);
      assert.strictEqual(preview.assignments[0].worker?.name, 'exploit-1');
      assert.strictEqual(preview.assignments[0].worker?.role, 'exploit');
      assert.strictEqual(preview.assignments[0].reason, 'Exact role match');
    });

    it('should match credential intent to credential worker', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test parallel dispatch',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('scout-1', 'scout'),
          createWorker('exploit-1', 'exploit'),
          createWorker('credential-1', 'credential'),
        ],
      });

      const intent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Compare anonymous vs authenticated access to /admin',
        riskLevel: 'R2',
        role: 'credential',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 1);
      assert.strictEqual(preview.assignments[0].intent.id, intent.id);
      assert.strictEqual(preview.assignments[0].worker?.name, 'credential-1');
      assert.strictEqual(preview.assignments[0].worker?.role, 'credential');
      assert.strictEqual(preview.assignments[0].reason, 'Exact role match');
    });

    it('should assign multiple intents to different role-matched workers in parallel', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test parallel dispatch',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('scout-1', 'scout'),
          createWorker('exploit-1', 'exploit'),
          createWorker('credential-1', 'credential'),
        ],
      });

      const scoutIntent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Map API endpoints',
        riskLevel: 'R1',
        role: 'scout',
        createdBy: 'test',
      });

      const exploitIntent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Test XSS in search parameter',
        riskLevel: 'R2',
        role: 'exploit',
        createdBy: 'test',
      });

      const credentialIntent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Compare user vs admin privileges',
        riskLevel: 'R2',
        role: 'credential',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 3);

      const scoutAssignment = preview.assignments.find((a) => a.intent.id === scoutIntent.id);
      assert.strictEqual(scoutAssignment?.worker?.name, 'scout-1');
      assert.strictEqual(scoutAssignment?.reason, 'Exact role match');

      const exploitAssignment = preview.assignments.find((a) => a.intent.id === exploitIntent.id);
      assert.strictEqual(exploitAssignment?.worker?.name, 'exploit-1');
      assert.strictEqual(exploitAssignment?.reason, 'Exact role match');

      const credentialAssignment = preview.assignments.find((a) => a.intent.id === credentialIntent.id);
      assert.strictEqual(credentialAssignment?.worker?.name, 'credential-1');
      assert.strictEqual(credentialAssignment?.reason, 'Exact role match');
    });
  });

  describe('Generalist fallback', () => {
    it('should assign specialized intent to generalist when no role-matched worker available', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test generalist fallback',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('generalist-1', 'generalist'),
          createWorker('exploit-1', 'exploit'),
        ],
      });

      const scoutIntent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Map the attack surface',
        riskLevel: 'R1',
        role: 'scout',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 1);
      assert.strictEqual(preview.assignments[0].intent.id, scoutIntent.id);
      assert.strictEqual(preview.assignments[0].worker?.name, 'generalist-1');
      assert.strictEqual(preview.assignments[0].worker?.role, 'generalist');
      assert.strictEqual(preview.assignments[0].reason, 'Generalist fallback');
    });

    it('should prefer role match over generalist', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test role preference',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('generalist-1', 'generalist'),
          createWorker('scout-1', 'scout'),
        ],
      });

      const scoutIntent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Map the attack surface',
        riskLevel: 'R1',
        role: 'scout',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 1);
      assert.strictEqual(preview.assignments[0].worker?.name, 'scout-1');
      assert.strictEqual(preview.assignments[0].reason, 'Exact role match');
    });

    it('should not use generalist when allowGeneralistFallback is false', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test no generalist fallback',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('generalist-1', 'generalist'),
          createWorker('exploit-1', 'exploit'),
        ],
      });

      const scoutIntent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Map the attack surface',
        riskLevel: 'R1',
        role: 'scout',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id, {
        allowGeneralistFallback: false,
      });

      assert.strictEqual(preview.assignments.length, 0);
      assert.strictEqual(preview.unassigned.length, 1);
      assert.strictEqual(preview.unassigned[0].id, scoutIntent.id);
      assert.ok(preview.unassigned[0].reason.includes('No available scout worker'));
    });
  });

  describe('Worker availability', () => {
    it('should not assign same worker to multiple intents', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test worker uniqueness',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('scout-1', 'scout'),
        ],
      });

      graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Map API endpoints',
        riskLevel: 'R1',
        role: 'scout',
        createdBy: 'test',
      });

      graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Map web forms',
        riskLevel: 'R1',
        role: 'scout',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 1);
      assert.strictEqual(preview.unassigned.length, 1);
      assert.ok(preview.unassigned[0].reason.includes('No available scout worker'));
    });

    it('should handle multiple workers with same role', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test multiple same-role workers',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('scout-1', 'scout'),
          createWorker('scout-2', 'scout'),
        ],
      });

      graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Map API endpoints',
        riskLevel: 'R1',
        role: 'scout',
        createdBy: 'test',
      });

      graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Map web forms',
        riskLevel: 'R1',
        role: 'scout',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 2);
      assert.strictEqual(preview.unassigned.length, 0);

      const assignedWorkers = preview.assignments.map((a) => a.worker?.name);
      assert.ok(assignedWorkers.includes('scout-1'));
      assert.ok(assignedWorkers.includes('scout-2'));
    });
  });

  describe('Max parallel limit', () => {
    it('should respect maxParallel limit', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test max parallel',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('scout-1', 'scout'),
          createWorker('exploit-1', 'exploit'),
          createWorker('credential-1', 'credential'),
          createWorker('generalist-1', 'generalist'),
        ],
      });

      for (let i = 0; i < 5; i++) {
        graph.createIntent({
          runId: run.id,
          fromFactIds: [],
          hypothesis: `Intent ${i}`,
          riskLevel: 'R1',
          role: i % 2 === 0 ? 'scout' : 'exploit',
          createdBy: 'test',
        });
      }

      const preview = await parallelDispatch.previewParallelDispatch(run.id, {
        maxParallel: 2,
      });

      assert.ok(preview.assignments.length <= 2);
    });
  });

  describe('Intent without role', () => {
    it('should assign unroled intent to any available worker', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test unroled intent',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('worker-1'),
        ],
      });

      const intent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Generic exploration',
        riskLevel: 'R1',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 1);
      assert.strictEqual(preview.assignments[0].intent.id, intent.id);
      assert.strictEqual(preview.assignments[0].worker?.name, 'worker-1');
    });

    it('should assign unroled intent to generalist when available', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test unroled intent with generalist',
        scopePolicy: testPolicy,
        workerPool: [
          createWorker('generalist-1', 'generalist'),
          createWorker('scout-1', 'scout'),
        ],
      });

      const intent = graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Generic exploration',
        riskLevel: 'R1',
        createdBy: 'test',
      });

      const preview = await parallelDispatch.previewParallelDispatch(run.id);

      assert.strictEqual(preview.assignments.length, 1);
      assert.strictEqual(preview.assignments[0].worker?.name, 'generalist-1');
    });
  });

  describe('Run status validation', () => {
    it('should return empty result for non-active run', async () => {
      const run = graph.createRun({
        target: 'https://app.example.com',
        goal: 'Test non-active run',
        scopePolicy: testPolicy,
        workerPool: [createWorker('worker-1')],
      });

      graph.createIntent({
        runId: run.id,
        fromFactIds: [],
        hypothesis: 'Test intent',
        riskLevel: 'R1',
        createdBy: 'test',
      });

      graph.completeRun(run.id);

      const result = await parallelDispatch.dispatchParallel(run.id);

      assert.strictEqual(result.dispatches.length, 0);
      assert.strictEqual(result.summary.total, 0);
    });
  });
});

function createWorker(name: string, role?: WorkerRole): WorkerConfig {
  return {
    name,
    type: 'mock',
    role,
    maxRunning: 1,
    priority: 0,
  };
}
