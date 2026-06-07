import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyIndices, buildIndices, IndexedStoreQuery, IndexedStoreMutator } from '../src/storage/indexed-store.js';
import { emptyState } from '../src/storage/store.js';
import type { Evidence, Fact, Intent, Finding } from '../src/domain/types.js';

test('createEmptyIndices creates empty index maps', () => {
  const indices = createEmptyIndices();

  assert.ok(indices.evidence instanceof Map);
  assert.ok(indices.facts instanceof Map);
  assert.ok(indices.intents instanceof Map);
  assert.ok(indices.findings instanceof Map);

  assert.equal(indices.evidence.size, 0);
  assert.equal(indices.facts.size, 0);
});

test('buildIndices indexes existing state by runId', () => {
  const state = emptyState();

  // Add evidence for two runs
  state.evidence['ev1'] = {
    id: 'ev1',
    runId: 'run1',
    kind: 'http_exchange',
    localUri: 'local://evidence/ev1',
    sha256: 'abc123',
    redactionState: 'redacted',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  state.evidence['ev2'] = {
    id: 'ev2',
    runId: 'run1',
    kind: 'command_output',
    localUri: 'local://evidence/ev2',
    sha256: 'def456',
    redactionState: 'redacted',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  state.evidence['ev3'] = {
    id: 'ev3',
    runId: 'run2',
    kind: 'screenshot',
    localUri: 'local://evidence/ev3',
    sha256: 'ghi789',
    redactionState: 'safe_for_cloud',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  // Add facts
  state.facts['fact1'] = {
    id: 'fact1',
    runId: 'run1',
    statement: 'Test fact',
    evidenceIds: [],
    confidence: 'confirmed',
    createdBy: 'test',
    createdAt: '2026-06-07T00:00:00Z',
  } as Fact;

  const indices = buildIndices(state);

  // Verify evidence index
  assert.equal(indices.evidence.size, 2); // 2 runs
  assert.ok(indices.evidence.has('run1'));
  assert.ok(indices.evidence.has('run2'));
  assert.equal(indices.evidence.get('run1')?.size, 2); // 2 evidence items
  assert.equal(indices.evidence.get('run2')?.size, 1); // 1 evidence item

  // Verify facts index
  assert.equal(indices.facts.size, 1);
  assert.ok(indices.facts.has('run1'));
  assert.equal(indices.facts.get('run1')?.size, 1);
});

test('IndexedStoreQuery provides O(1) runId lookups', () => {
  const state = emptyState();

  // Add evidence for run1
  state.evidence['ev1'] = {
    id: 'ev1',
    runId: 'run1',
    kind: 'http_exchange',
    localUri: 'local://evidence/ev1',
    sha256: 'abc',
    redactionState: 'redacted',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  state.evidence['ev2'] = {
    id: 'ev2',
    runId: 'run1',
    kind: 'command_output',
    localUri: 'local://evidence/ev2',
    sha256: 'def',
    redactionState: 'redacted',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  // Add evidence for run2
  state.evidence['ev3'] = {
    id: 'ev3',
    runId: 'run2',
    kind: 'screenshot',
    localUri: 'local://evidence/ev3',
    sha256: 'ghi',
    redactionState: 'safe_for_cloud',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  const indices = buildIndices(state);
  const query = new IndexedStoreQuery(state, indices);

  // Query by runId - O(1)
  const run1Evidence = query.getEvidenceByRunId('run1');
  assert.equal(run1Evidence.length, 2);
  assert.ok(run1Evidence.some((e) => e.id === 'ev1'));
  assert.ok(run1Evidence.some((e) => e.id === 'ev2'));

  const run2Evidence = query.getEvidenceByRunId('run2');
  assert.equal(run2Evidence.length, 1);
  assert.equal(run2Evidence[0].id, 'ev3');

  // Non-existent run returns empty array
  const run3Evidence = query.getEvidenceByRunId('run3');
  assert.equal(run3Evidence.length, 0);
});

test('IndexedStoreQuery count methods avoid array materialization', () => {
  const state = emptyState();

  // Add many evidence items
  for (let i = 0; i < 100; i++) {
    state.evidence[`ev${i}`] = {
      id: `ev${i}`,
      runId: 'run1',
      kind: 'http_exchange',
      localUri: `local://evidence/ev${i}`,
      sha256: `hash${i}`,
      redactionState: 'redacted',
      createdAt: '2026-06-07T00:00:00Z',
    } as Evidence;
  }

  const indices = buildIndices(state);
  const query = new IndexedStoreQuery(state, indices);

  // Count without materializing array - O(1)
  const count = query.countEvidenceByRunId('run1');
  assert.equal(count, 100);

  // Non-existent run returns 0
  const count2 = query.countEvidenceByRunId('run2');
  assert.equal(count2, 0);
});

test('IndexedStoreMutator maintains indices on entity add', () => {
  const indices = createEmptyIndices();
  const mutator = new IndexedStoreMutator(indices);

  // Add evidence
  const evidence: Evidence = {
    id: 'ev1',
    runId: 'run1',
    kind: 'http_exchange',
    localUri: 'local://evidence/ev1',
    sha256: 'abc',
    redactionState: 'redacted',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  mutator.onEvidenceAdded('ev1', evidence);

  // Verify index updated
  assert.ok(indices.evidence.has('run1'));
  assert.equal(indices.evidence.get('run1')?.size, 1);
  assert.ok(indices.evidence.get('run1')?.has('ev1'));

  // Add another for same run
  const evidence2: Evidence = {
    id: 'ev2',
    runId: 'run1',
    kind: 'command_output',
    localUri: 'local://evidence/ev2',
    sha256: 'def',
    redactionState: 'redacted',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  mutator.onEvidenceAdded('ev2', evidence2);

  // Verify index updated
  assert.equal(indices.evidence.get('run1')?.size, 2);
  assert.ok(indices.evidence.get('run1')?.has('ev2'));
});

test('IndexedStoreMutator maintains indices on entity remove', () => {
  const indices = createEmptyIndices();
  const mutator = new IndexedStoreMutator(indices);

  // Add evidence
  const evidence: Evidence = {
    id: 'ev1',
    runId: 'run1',
    kind: 'http_exchange',
    localUri: 'local://evidence/ev1',
    sha256: 'abc',
    redactionState: 'redacted',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  mutator.onEvidenceAdded('ev1', evidence);
  assert.equal(indices.evidence.get('run1')?.size, 1);

  // Remove evidence
  mutator.onEvidenceRemoved('ev1', evidence);

  // Verify index updated - empty set should be removed
  assert.ok(!indices.evidence.has('run1'));
});

test('IndexedStoreQuery handles multiple entity types for same run', () => {
  const state = emptyState();

  // Add evidence
  state.evidence['ev1'] = {
    id: 'ev1',
    runId: 'run1',
    kind: 'http_exchange',
    localUri: 'local://evidence/ev1',
    sha256: 'abc',
    redactionState: 'redacted',
    createdAt: '2026-06-07T00:00:00Z',
  } as Evidence;

  // Add fact
  state.facts['fact1'] = {
    id: 'fact1',
    runId: 'run1',
    statement: 'Test fact',
    evidenceIds: ['ev1'],
    createdBy: 'test',
    createdAt: '2026-06-07T00:00:00Z',
  } as Fact;

  // Add intent
  state.intents['int1'] = {
    id: 'int1',
    runId: 'run1',
    fromFactIds: ['fact1'],
    hypothesis: 'Test hypothesis',
    riskLevel: 'R1',
    status: 'open',
    createdBy: 'test',
    createdAt: '2026-06-07T00:00:00Z',
    version: 0,
  } as Intent;

  // Add finding
  state.findings['find1'] = {
    id: 'find1',
    runId: 'run1',
    title: 'Test finding',
    severity: 'medium',
    confidence: 'likely',
    affectedAssets: ['https://example.com'],
    evidenceIds: ['ev1'],
    reproSteps: ['step1'],
    impact: 'test impact',
    remediation: 'test remediation',
    validationState: 'candidate',
    createdAt: '2026-06-07T00:00:00Z',
  } as Finding;

  const indices = buildIndices(state);
  const query = new IndexedStoreQuery(state, indices);

  // Query all entity types
  assert.equal(query.getEvidenceByRunId('run1').length, 1);
  assert.equal(query.getFactsByRunId('run1').length, 1);
  assert.equal(query.getIntentsByRunId('run1').length, 1);
  assert.equal(query.getFindingsByRunId('run1').length, 1);

  // Verify correct entities returned
  assert.equal(query.getEvidenceByRunId('run1')[0].id, 'ev1');
  assert.equal(query.getFactsByRunId('run1')[0].id, 'fact1');
  assert.equal(query.getIntentsByRunId('run1')[0].id, 'int1');
  assert.equal(query.getFindingsByRunId('run1')[0].id, 'find1');
});

test('IndexedStoreQuery performance - large dataset', () => {
  const state = emptyState();

  // Add 10,000 evidence items across 10 runs
  for (let runIdx = 0; runIdx < 10; runIdx++) {
    for (let i = 0; i < 1000; i++) {
      const id = `ev_run${runIdx}_${i}`;
      state.evidence[id] = {
        id,
        runId: `run${runIdx}`,
        kind: 'http_exchange',
        localUri: `local://evidence/${id}`,
        sha256: `hash${id}`,
        redactionState: 'redacted',
        createdAt: '2026-06-07T00:00:00Z',
      } as Evidence;
    }
  }

  const indices = buildIndices(state);
  const query = new IndexedStoreQuery(state, indices);

  // Query specific run - should be fast (O(1) + O(1000))
  const startTime = performance.now();
  const evidence = query.getEvidenceByRunId('run5');
  const endTime = performance.now();

  assert.equal(evidence.length, 1000);

  // Query should complete in < 10ms even with 10K total items
  const duration = endTime - startTime;
  assert.ok(duration < 10, `Query took ${duration}ms, expected < 10ms`);

  // Count should be instant
  const countStart = performance.now();
  const count = query.countEvidenceByRunId('run5');
  const countEnd = performance.now();

  assert.equal(count, 1000);
  assert.ok(countEnd - countStart < 1, 'Count should be < 1ms');
});
