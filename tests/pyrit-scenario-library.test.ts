import { describe, it } from 'node:test';
import assert from 'node:assert';
import { InMemoryPlatformStore } from '../src/storage/store.js';
import { PyritScenarioLibraryService } from '../src/observability/pyrit-scenario-library-service.js';
import { ALL_PYRIT_SCENARIOS, PYRIT_DATASET_METADATA } from '../src/observability/pyrit-scenario-datasets.js';

describe('PyritScenarioLibraryService', () => {
  it('should import PyRIT scenarios', () => {
    const store = new InMemoryPlatformStore();
    const service = new PyritScenarioLibraryService(store);

    const scenarios = ALL_PYRIT_SCENARIOS.slice(0, 3).map((template) => ({
      name: template.name,
      category: template.category,
      description: template.description,
      objective: template.objective,
      riskLevel: template.riskLevel,
      targetType: template.targetType,
      fixture: template.fixture,
      successCriteria: template.successCriteria,
      scorers: template.scorers,
      safetyNotes: template.safetyNotes,
      sourceDataset: PYRIT_DATASET_METADATA.source,
      sourceVersion: PYRIT_DATASET_METADATA.version,
      sourceUrl: PYRIT_DATASET_METADATA.url,
      license: PYRIT_DATASET_METADATA.license,
    }));

    const importResult = service.importScenarios({
      source: 'test-import',
      scenarios,
    });

    assert.strictEqual(importResult.status, 'completed');
    assert.strictEqual(importResult.scenarioCount, 3);
    assert.strictEqual(importResult.scenarioIds.length, 3);
    assert.strictEqual(importResult.errors.length, 0);
  });

  it('should get library summary', () => {
    const store = new InMemoryPlatformStore();
    const service = new PyritScenarioLibraryService(store);

    // Import some scenarios first
    const scenarios = ALL_PYRIT_SCENARIOS.slice(0, 5).map((template) => ({
      name: template.name,
      category: template.category,
      description: template.description,
      objective: template.objective,
      riskLevel: template.riskLevel,
      targetType: template.targetType,
      fixture: template.fixture,
      successCriteria: template.successCriteria,
      scorers: template.scorers,
      safetyNotes: template.safetyNotes,
      sourceDataset: PYRIT_DATASET_METADATA.source,
      license: PYRIT_DATASET_METADATA.license,
    }));

    service.importScenarios({ source: 'test', scenarios });

    const summary = service.getSummary();

    assert.strictEqual(summary.counts.totalScenarios, 5);
    assert.ok(summary.counts.imports > 0);
    assert.ok(Array.isArray(summary.scenarios));
    assert.ok(Array.isArray(summary.recommendations));
  });

  it('should list scenarios by category', () => {
    const store = new InMemoryPlatformStore();
    const service = new PyritScenarioLibraryService(store);

    const scenarios = ALL_PYRIT_SCENARIOS.map((template) => ({
      name: template.name,
      category: template.category,
      description: template.description,
      objective: template.objective,
      riskLevel: template.riskLevel,
      targetType: template.targetType,
      fixture: template.fixture,
      successCriteria: template.successCriteria,
      scorers: template.scorers,
      safetyNotes: template.safetyNotes,
      sourceDataset: PYRIT_DATASET_METADATA.source,
      license: PYRIT_DATASET_METADATA.license,
    }));

    service.importScenarios({ source: 'test', scenarios });

    const promptInjection = service.listByCategory('prompt_injection');
    assert.ok(promptInjection.length > 0);
    assert.ok(promptInjection.every((s) => s.category === 'prompt_injection'));
  });

  it('should list scenarios by risk level', () => {
    const store = new InMemoryPlatformStore();
    const service = new PyritScenarioLibraryService(store);

    const scenarios = ALL_PYRIT_SCENARIOS.map((template) => ({
      name: template.name,
      category: template.category,
      description: template.description,
      objective: template.objective,
      riskLevel: template.riskLevel,
      targetType: template.targetType,
      fixture: template.fixture,
      successCriteria: template.successCriteria,
      scorers: template.scorers,
      safetyNotes: template.safetyNotes,
      sourceDataset: PYRIT_DATASET_METADATA.source,
      license: PYRIT_DATASET_METADATA.license,
    }));

    service.importScenarios({ source: 'test', scenarios });

    const r2Scenarios = service.listByRiskLevel('R2');
    assert.ok(r2Scenarios.length > 0);
    assert.ok(r2Scenarios.every((s) => s.riskLevel === 'R2'));
  });

  it('should update scenario status', () => {
    const store = new InMemoryPlatformStore();
    const service = new PyritScenarioLibraryService(store);

    const scenarios = ALL_PYRIT_SCENARIOS.slice(0, 1).map((template) => ({
      name: template.name,
      category: template.category,
      description: template.description,
      objective: template.objective,
      riskLevel: template.riskLevel,
      targetType: template.targetType,
      fixture: template.fixture,
      successCriteria: template.successCriteria,
      scorers: template.scorers,
      safetyNotes: template.safetyNotes,
      sourceDataset: PYRIT_DATASET_METADATA.source,
      license: PYRIT_DATASET_METADATA.license,
    }));

    const importResult = service.importScenarios({ source: 'test', scenarios });
    const scenarioId = importResult.scenarioIds[0];

    service.updateStatus(scenarioId, 'tested');

    const scenario = service.getScenario(scenarioId);
    assert.strictEqual(scenario?.status, 'tested');
  });

  it('should record scenario run result', () => {
    const store = new InMemoryPlatformStore();
    const service = new PyritScenarioLibraryService(store);

    const scenarios = ALL_PYRIT_SCENARIOS.slice(0, 1).map((template) => ({
      name: template.name,
      category: template.category,
      description: template.description,
      objective: template.objective,
      riskLevel: template.riskLevel,
      targetType: template.targetType,
      fixture: template.fixture,
      successCriteria: template.successCriteria,
      scorers: template.scorers,
      safetyNotes: template.safetyNotes,
      sourceDataset: PYRIT_DATASET_METADATA.source,
      license: PYRIT_DATASET_METADATA.license,
    }));

    const importResult = service.importScenarios({ source: 'test', scenarios });
    const scenarioId = importResult.scenarioIds[0];

    const result = service.recordResult({
      runId: 'test-run-1',
      scenarioId,
      workerName: 'test-worker',
      taskResults: {
        accepted: true,
        schemaValid: true,
        toolRequests: 2,
        evidenceProduced: 1,
        findingsGenerated: 1,
        refusals: 0,
      },
      scorerResults: [
        {
          scorerType: 'refusal_detection',
          score: 0.85,
          passed: true,
          details: 'Worker correctly refused risky operation',
        },
      ],
      overallScore: 85,
      passed: true,
      findings: ['Worker correctly identified prompt injection'],
      gaps: [],
      evidenceIds: ['evidence-1'],
      traceSpanIds: ['span-1'],
    });

    assert.ok(result.id);
    assert.strictEqual(result.runId, 'test-run-1');
    assert.strictEqual(result.scenarioId, scenarioId);
    assert.strictEqual(result.passed, true);
  });

  it('should validate PyRIT dataset metadata', () => {
    assert.ok(PYRIT_DATASET_METADATA.source);
    assert.ok(PYRIT_DATASET_METADATA.version);
    assert.ok(PYRIT_DATASET_METADATA.license);
    assert.ok(PYRIT_DATASET_METADATA.scenarioCount > 0);
    assert.ok(Array.isArray(PYRIT_DATASET_METADATA.categories));
    assert.ok(PYRIT_DATASET_METADATA.categories.length > 0);
  });

  it('should have valid scenario templates', () => {
    assert.ok(ALL_PYRIT_SCENARIOS.length > 0);

    for (const scenario of ALL_PYRIT_SCENARIOS) {
      assert.ok(scenario.name);
      assert.ok(scenario.category);
      assert.ok(scenario.description);
      assert.ok(scenario.objective);
      assert.ok(scenario.riskLevel);
      assert.ok(scenario.targetType);
      assert.ok(scenario.fixture);
      assert.ok(scenario.successCriteria);
      assert.ok(Array.isArray(scenario.scorers));
      assert.ok(Array.isArray(scenario.safetyNotes));
    }
  });
});
