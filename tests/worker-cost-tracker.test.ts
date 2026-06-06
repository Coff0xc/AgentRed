import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkerCostTrackerService } from '../src/observability/worker-cost-tracker-service.js';
import { InMemoryPlatformStore } from '../src/storage/store.js';
import { newId, nowIso } from '../src/domain/ids.js';
import type { CostLedgerEntry, TraceSpan, Fact } from '../src/domain/types.js';

test('WorkerCostTrackerService tracks detailed cost breakdown per worker', () => {
  const store = new InMemoryPlatformStore();
  const service = new WorkerCostTrackerService(store);

  const run = {
    id: newId('run'),
    target: 'https://api.example.com',
    goal: 'Test cost tracking',
    scopePolicy: {
      allowedAssets: ['example.com'],
      deniedAssets: [],
      allowedMethods: ['GET', 'POST'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: true },
      rateLimits: { requestsPerMinute: 120 },
    },
    workerPool: [
      { name: 'claude-worker', type: 'claude' as const, maxRunning: 1, priority: 0 },
      { name: 'gemini-worker', type: 'gemini' as const, maxRunning: 1, priority: 1 },
    ],
    status: 'active' as const,
    createdAt: nowIso(),
  };
  store.state.runs[run.id] = run;

  // Add worker spans
  const claudeSpan: TraceSpan = {
    id: newId('span'),
    runId: run.id,
    kind: 'worker',
    name: 'claude-worker.reason',
    status: 'ok',
    startedAt: nowIso(),
    endedAt: nowIso(),
    durationMs: 5000,
    attributes: { worker: 'claude-worker', task: 'reason' },
  };
  store.state.traceSpans[claudeSpan.id] = claudeSpan;

  const geminiSpan: TraceSpan = {
    id: newId('span'),
    runId: run.id,
    kind: 'worker',
    name: 'gemini-worker.reason',
    status: 'ok',
    startedAt: nowIso(),
    endedAt: nowIso(),
    durationMs: 3000,
    attributes: { worker: 'gemini-worker', task: 'reason' },
  };
  store.state.traceSpans[geminiSpan.id] = geminiSpan;

  // Add cost entries
  const claudeTokenCost: CostLedgerEntry = {
    id: newId('cost'),
    runId: run.id,
    source: 'worker',
    unit: 'token',
    quantity: 2000,
    estimatedUsd: 0.02,
    model: 'claude-sonnet-4',
    worker: 'claude-worker',
    entityId: claudeSpan.id,
    createdAt: nowIso(),
  };
  store.state.costLedger[claudeTokenCost.id] = claudeTokenCost;

  const claudeRuntimeCost: CostLedgerEntry = {
    id: newId('cost'),
    runId: run.id,
    source: 'worker',
    unit: 'millisecond',
    quantity: 5000,
    estimatedUsd: 0.0001,
    worker: 'claude-worker',
    entityId: claudeSpan.id,
    createdAt: nowIso(),
  };
  store.state.costLedger[claudeRuntimeCost.id] = claudeRuntimeCost;

  const geminiTokenCost: CostLedgerEntry = {
    id: newId('cost'),
    runId: run.id,
    source: 'worker',
    unit: 'token',
    quantity: 1500,
    estimatedUsd: 0.015,
    model: 'gemini-pro',
    worker: 'gemini-worker',
    entityId: geminiSpan.id,
    createdAt: nowIso(),
  };
  store.state.costLedger[geminiTokenCost.id] = geminiTokenCost;

  // Get cost report
  const report = service.getRunCostReport(run.id);

  assert.equal(report.runId, run.id);
  assert.equal(report.workerBreakdowns.length, 2);
  assert.ok(report.totalEstimatedUsd > 0);
  assert.ok(report.recommendations.length > 0);
  assert.ok(report.costEfficiencyRanking.length > 0);

  // Find claude breakdown
  const claudeBreakdown = report.workerBreakdowns.find((b) => b.worker === 'claude-worker');
  assert.ok(claudeBreakdown);
  assert.equal(claudeBreakdown.tokenCount, 2000);
  assert.equal(claudeBreakdown.runtimeMs, 5000);
  assert.ok(claudeBreakdown.totalEstimatedUsd > 0.02);
  assert.ok(claudeBreakdown.costPerTask > 0);

  // Find gemini breakdown
  const geminiBreakdown = report.workerBreakdowns.find((b) => b.worker === 'gemini-worker');
  assert.ok(geminiBreakdown);
  assert.equal(geminiBreakdown.tokenCount, 1500);
  assert.equal(geminiBreakdown.runtimeMs, 3000);
});

test('WorkerCostTrackerService gets individual worker cost breakdown', () => {
  const store = new InMemoryPlatformStore();
  const service = new WorkerCostTrackerService(store);

  const run = {
    id: newId('run'),
    target: 'https://api.example.com',
    goal: 'Test individual cost',
    scopePolicy: {
      allowedAssets: ['example.com'],
      deniedAssets: [],
      allowedMethods: ['GET'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: true },
      rateLimits: { requestsPerMinute: 120 },
    },
    workerPool: [{ name: 'test-worker', type: 'mock' as const, maxRunning: 1, priority: 0 }],
    status: 'active' as const,
    createdAt: nowIso(),
  };
  store.state.runs[run.id] = run;

  const span: TraceSpan = {
    id: newId('span'),
    runId: run.id,
    kind: 'worker',
    name: 'test-worker.bootstrap',
    status: 'ok',
    startedAt: nowIso(),
    endedAt: nowIso(),
    durationMs: 1000,
    attributes: { worker: 'test-worker', task: 'bootstrap' },
  };
  store.state.traceSpans[span.id] = span;

  const cost: CostLedgerEntry = {
    id: newId('cost'),
    runId: run.id,
    source: 'worker',
    unit: 'token',
    quantity: 500,
    estimatedUsd: 0.005,
    worker: 'test-worker',
    entityId: span.id,
    createdAt: nowIso(),
  };
  store.state.costLedger[cost.id] = cost;

  const breakdown = service.getWorkerCostBreakdown(run.id, 'test-worker');
  assert.ok(breakdown);
  assert.equal(breakdown.worker, 'test-worker');
  assert.equal(breakdown.tokenCount, 500);
  assert.equal(breakdown.totalEstimatedUsd, 0.005);
  assert.equal(breakdown.costPerTask, 0.005);

  // Non-existent worker returns null
  const nullBreakdown = service.getWorkerCostBreakdown(run.id, 'non-existent');
  assert.equal(nullBreakdown, null);
});

test('WorkerCostTrackerService detects quality regressions', () => {
  const store = new InMemoryPlatformStore();
  const service = new WorkerCostTrackerService(store);

  // Create baseline runs
  const baselineRunIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const run = {
      id: newId('run'),
      target: 'https://api.example.com',
      goal: 'Baseline run',
      scopePolicy: {
        allowedAssets: ['example.com'],
        deniedAssets: [],
        allowedMethods: ['GET'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: true },
        rateLimits: { requestsPerMinute: 120 },
      },
      workerPool: [{ name: 'test-worker', type: 'mock' as const, maxRunning: 1, priority: 0 }],
      status: 'active' as const,
      createdAt: nowIso(),
    };
    store.state.runs[run.id] = run;
    baselineRunIds.push(run.id);

    // Good baseline: high success rate, low cost
    const span: TraceSpan = {
      id: newId('span'),
      runId: run.id,
      kind: 'worker',
      name: 'test-worker.reason',
      status: 'ok',
      startedAt: new Date(Date.now() - 86400000 * (3 - i)).toISOString(),
      endedAt: new Date(Date.now() - 86400000 * (3 - i) + 2000).toISOString(),
      durationMs: 2000,
      attributes: { worker: 'test-worker', task: 'reason' },
    };
    store.state.traceSpans[span.id] = span;

    const cost: CostLedgerEntry = {
      id: newId('cost'),
      runId: run.id,
      source: 'worker',
      unit: 'token',
      quantity: 1000,
      estimatedUsd: 0.01,
      worker: 'test-worker',
      entityId: span.id,
      createdAt: span.startedAt,
    };
    store.state.costLedger[cost.id] = cost;

    const fact: Fact = {
      id: newId('fact'),
      runId: run.id,
      statement: 'Baseline fact',
      evidenceIds: [newId('evidence')],
      confidence: 'confirmed',
      createdBy: 'test-worker:reason',
      createdAt: span.startedAt,
    };
    store.state.facts[fact.id] = fact;
  }

  // Create current runs with regressions
  const currentRunIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const run = {
      id: newId('run'),
      target: 'https://api.example.com',
      goal: 'Current run',
      scopePolicy: {
        allowedAssets: ['example.com'],
        deniedAssets: [],
        allowedMethods: ['GET'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: true },
        rateLimits: { requestsPerMinute: 120 },
      },
      workerPool: [{ name: 'test-worker', type: 'mock' as const, maxRunning: 1, priority: 0 }],
      status: 'active' as const,
      createdAt: nowIso(),
    };
    store.state.runs[run.id] = run;
    currentRunIds.push(run.id);

    // Regressed: lower success rate, higher cost
    const span: TraceSpan = {
      id: newId('span'),
      runId: run.id,
      kind: 'worker',
      name: 'test-worker.reason',
      status: i === 0 ? 'error' : 'ok', // Reduced success rate
      startedAt: nowIso(),
      endedAt: nowIso(),
      durationMs: 2000,
      attributes: { worker: 'test-worker', task: 'reason' },
    };
    store.state.traceSpans[span.id] = span;

    const cost: CostLedgerEntry = {
      id: newId('cost'),
      runId: run.id,
      source: 'worker',
      unit: 'token',
      quantity: 2000, // Doubled token usage
      estimatedUsd: 0.02, // Doubled cost
      worker: 'test-worker',
      entityId: span.id,
      createdAt: nowIso(),
    };
    store.state.costLedger[cost.id] = cost;

    // Fewer evidence produced
    if (i > 0) {
      const fact: Fact = {
        id: newId('fact'),
        runId: run.id,
        statement: 'Current fact',
        evidenceIds: [],
        confidence: 'confirmed',
        createdBy: 'test-worker:reason',
        createdAt: nowIso(),
      };
      store.state.facts[fact.id] = fact;
    }
  }

  const regression = service.detectWorkerRegression('test-worker', baselineRunIds, currentRunIds);
  assert.ok(regression);
  assert.equal(regression.worker, 'test-worker');
  assert.ok(regression.isRegressed);
  assert.ok(regression.regressions.length > 0);
  assert.ok(['moderate', 'severe'].includes(regression.overallSeverity));

  // Check specific regressions
  const successRateRegression = regression.regressions.find((r) => r.metric === 'success_rate');
  assert.ok(successRateRegression);
  assert.ok(successRateRegression.changePct < -15);

  const costRegression = regression.regressions.find((r) => r.metric === 'cost_per_task');
  assert.ok(costRegression);
  assert.ok(costRegression.changePct > 25);

  const tokenRegression = regression.regressions.find((r) => r.metric === 'tokens_per_task');
  assert.ok(tokenRegression);
  assert.ok(tokenRegression.changePct > 30);
});

test('WorkerCostTrackerService compares worker costs between periods', () => {
  const store = new InMemoryPlatformStore();
  const service = new WorkerCostTrackerService(store);

  const baselineRunIds: string[] = [];
  const currentRunIds: string[] = [];

  // Baseline period
  for (let i = 0; i < 2; i++) {
    const run = {
      id: newId('run'),
      target: 'https://api.example.com',
      goal: 'Baseline',
      scopePolicy: {
        allowedAssets: ['example.com'],
        deniedAssets: [],
        allowedMethods: ['GET'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: true },
        rateLimits: { requestsPerMinute: 120 },
      },
      workerPool: [{ name: 'compare-worker', type: 'mock' as const, maxRunning: 1, priority: 0 }],
      status: 'active' as const,
      createdAt: nowIso(),
    };
    store.state.runs[run.id] = run;
    baselineRunIds.push(run.id);

    const span: TraceSpan = {
      id: newId('span'),
      runId: run.id,
      kind: 'worker',
      name: 'compare-worker.reason',
      status: 'ok',
      startedAt: nowIso(),
      endedAt: nowIso(),
      durationMs: 1000,
      attributes: { worker: 'compare-worker' },
    };
    store.state.traceSpans[span.id] = span;

    const cost: CostLedgerEntry = {
      id: newId('cost'),
      runId: run.id,
      source: 'worker',
      unit: 'token',
      quantity: 1000,
      estimatedUsd: 0.01,
      worker: 'compare-worker',
      entityId: span.id,
      createdAt: nowIso(),
    };
    store.state.costLedger[cost.id] = cost;
  }

  // Current period with increased costs
  for (let i = 0; i < 2; i++) {
    const run = {
      id: newId('run'),
      target: 'https://api.example.com',
      goal: 'Current',
      scopePolicy: {
        allowedAssets: ['example.com'],
        deniedAssets: [],
        allowedMethods: ['GET'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: true },
        rateLimits: { requestsPerMinute: 120 },
      },
      workerPool: [{ name: 'compare-worker', type: 'mock' as const, maxRunning: 1, priority: 0 }],
      status: 'active' as const,
      createdAt: nowIso(),
    };
    store.state.runs[run.id] = run;
    currentRunIds.push(run.id);

    const span: TraceSpan = {
      id: newId('span'),
      runId: run.id,
      kind: 'worker',
      name: 'compare-worker.reason',
      status: 'ok',
      startedAt: nowIso(),
      endedAt: nowIso(),
      durationMs: 1000,
      attributes: { worker: 'compare-worker' },
    };
    store.state.traceSpans[span.id] = span;

    const cost: CostLedgerEntry = {
      id: newId('cost'),
      runId: run.id,
      source: 'worker',
      unit: 'token',
      quantity: 1400, // 40% increase
      estimatedUsd: 0.014,
      worker: 'compare-worker',
      entityId: span.id,
      createdAt: nowIso(),
    };
    store.state.costLedger[cost.id] = cost;
  }

  const comparison = service.compareWorkerCosts('compare-worker', baselineRunIds, currentRunIds);
  assert.ok(comparison);
  assert.equal(comparison.worker, 'compare-worker');
  assert.equal(comparison.baseline.tasks, 2);
  assert.equal(comparison.current.tasks, 2);
  assert.ok(comparison.regression.costIncreasePct >= 35); // Should detect ~40% increase
  assert.ok(comparison.regression.tokenIncreasePct >= 35);
  assert.ok(comparison.regression.isRegression);
  assert.ok(['minor', 'moderate', 'severe'].includes(comparison.regression.severity));
});

test('WorkerCostTrackerService handles empty data gracefully', () => {
  const store = new InMemoryPlatformStore();
  const service = new WorkerCostTrackerService(store);

  const run = {
    id: newId('run'),
    target: 'https://api.example.com',
    goal: 'Empty run',
    scopePolicy: {
      allowedAssets: ['example.com'],
      deniedAssets: [],
      allowedMethods: ['GET'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: true },
      rateLimits: { requestsPerMinute: 120 },
    },
    workerPool: [],
    status: 'active' as const,
    createdAt: nowIso(),
  };
  store.state.runs[run.id] = run;

  const report = service.getRunCostReport(run.id);
  assert.equal(report.workerBreakdowns.length, 0);
  assert.equal(report.totalEstimatedUsd, 0);
  assert.ok(report.recommendations.length > 0);

  const regression = service.detectWorkerRegression('non-existent', [], [run.id]);
  assert.equal(regression, null);

  const comparison = service.compareWorkerCosts('non-existent', [], []);
  assert.equal(comparison, null);
});

test('WorkerCostTrackerService ranks workers by cost efficiency', () => {
  const store = new InMemoryPlatformStore();
  const service = new WorkerCostTrackerService(store);

  const run = {
    id: newId('run'),
    target: 'https://api.example.com',
    goal: 'Efficiency test',
    scopePolicy: {
      allowedAssets: ['example.com'],
      deniedAssets: [],
      allowedMethods: ['GET'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: true },
      rateLimits: { requestsPerMinute: 120 },
    },
    workerPool: [
      { name: 'efficient-worker', type: 'mock' as const, maxRunning: 1, priority: 0 },
      { name: 'expensive-worker', type: 'mock' as const, maxRunning: 1, priority: 1 },
    ],
    status: 'active' as const,
    createdAt: nowIso(),
  };
  store.state.runs[run.id] = run;

  // Efficient worker: low cost, high success
  const efficientSpan: TraceSpan = {
    id: newId('span'),
    runId: run.id,
    kind: 'worker',
    name: 'efficient-worker.reason',
    status: 'ok',
    startedAt: nowIso(),
    endedAt: nowIso(),
    durationMs: 1000,
    attributes: { worker: 'efficient-worker' },
  };
  store.state.traceSpans[efficientSpan.id] = efficientSpan;

  const efficientCost: CostLedgerEntry = {
    id: newId('cost'),
    runId: run.id,
    source: 'worker',
    unit: 'token',
    quantity: 500,
    estimatedUsd: 0.005,
    worker: 'efficient-worker',
    entityId: efficientSpan.id,
    createdAt: nowIso(),
  };
  store.state.costLedger[efficientCost.id] = efficientCost;

  // Expensive worker: high cost, lower success
  const expensiveSpan: TraceSpan = {
    id: newId('span'),
    runId: run.id,
    kind: 'worker',
    name: 'expensive-worker.reason',
    status: 'ok',
    startedAt: nowIso(),
    endedAt: nowIso(),
    durationMs: 5000,
    attributes: { worker: 'expensive-worker' },
  };
  store.state.traceSpans[expensiveSpan.id] = expensiveSpan;

  const expensiveCost: CostLedgerEntry = {
    id: newId('cost'),
    runId: run.id,
    source: 'worker',
    unit: 'token',
    quantity: 3000,
    estimatedUsd: 0.05,
    worker: 'expensive-worker',
    entityId: expensiveSpan.id,
    createdAt: nowIso(),
  };
  store.state.costLedger[expensiveCost.id] = expensiveCost;

  const report = service.getRunCostReport(run.id);

  assert.equal(report.costEfficiencyRanking.length, 2);
  assert.equal(report.costEfficiencyRanking[0].worker, 'efficient-worker');
  assert.ok(report.costEfficiencyRanking[0].score > report.costEfficiencyRanking[1].score);
  assert.ok(report.recommendations.some((r) => r.includes('efficient-worker')));
});
