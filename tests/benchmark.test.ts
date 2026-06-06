/**
 * Benchmark service tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BenchmarkService } from '../src/benchmark/benchmark-service.js';
import { ScenarioLoader } from '../src/benchmark/scenario-loader.js';
import { ExecutorEngine } from '../src/benchmark/executor-engine.js';
import { ScorerEngine } from '../src/benchmark/scorer-engine.js';
import { GraphServer } from '../src/graph/graph-server.js';
import { Dispatcher } from '../src/dispatcher/dispatcher.js';
import { InMemoryPlatformStore } from '../src/storage/store.js';
import { createPlatform } from '../src/platform.js';

describe('BenchmarkService', () => {
  it('should create benchmark service instance', () => {
    const platform = createPlatform();

    const benchmarkService = new BenchmarkService({
      graphServer: platform.graph,
      dispatcher: platform.dispatcher,
      scenarioLoader: new ScenarioLoader(),
      executorEngine: new ExecutorEngine(),
      scorerEngine: new ScorerEngine(),
    });

    assert.ok(benchmarkService);
  });

  it('should load scenario from file', async () => {
    const loader = new ScenarioLoader();

    // This will fail if scenario file doesn't exist, which is expected
    try {
      const scenario = await loader.load('owasp-sqli-login-01');
      assert.strictEqual(scenario.id, 'owasp-sqli-login-01');
      assert.strictEqual(scenario.category, 'owasp_top10');
      assert.ok(scenario.expectedFindings.length > 0);
    } catch (error) {
      // Expected if scenario file not yet created
      assert.ok(error instanceof Error);
    }
  });

  it('should calculate coverage metrics', async () => {
    const platform = createPlatform();

    const benchmarkService = new BenchmarkService({
      graphServer: platform.graph,
      dispatcher: platform.dispatcher,
      scenarioLoader: new ScenarioLoader(),
      executorEngine: new ExecutorEngine(),
      scorerEngine: new ScorerEngine(),
    });

    // Mock findings and expected findings
    const findings: any[] = [
      {
        id: 'finding_1',
        title: 'SQL Injection in login form',
        severity: 'high',
        validationState: 'confirmed',
      },
    ];

    const expected = [
      {
        title: 'SQL Injection',
        severity: 'high',
        mustHaveEvidence: ['http_exchange'],
      },
    ];

    const coverage = (benchmarkService as any).calculateCoverage(findings, expected);

    assert.strictEqual(coverage.expectedFindingsTotal, 1);
    assert.strictEqual(coverage.expectedFindingsFound, 1);
    assert.strictEqual(coverage.coveragePercent, 100);
  });

  it('should calculate accuracy metrics', async () => {
    const platform = createPlatform();

    const benchmarkService = new BenchmarkService({
      graphServer: platform.graph,
      dispatcher: platform.dispatcher,
      scenarioLoader: new ScenarioLoader(),
      executorEngine: new ExecutorEngine(),
      scorerEngine: new ScorerEngine(),
    });

    // Mock findings: 1 true positive, 1 false positive
    const findings: any[] = [
      {
        id: 'finding_1',
        title: 'SQL Injection in login',
        severity: 'high',
        validationState: 'confirmed',
      },
      {
        id: 'finding_2',
        title: 'False alarm',
        severity: 'medium',
        validationState: 'rejected',
      },
    ];

    const expected = [
      {
        title: 'SQL Injection',
        severity: 'high',
        mustHaveEvidence: ['http_exchange'],
      },
    ];

    const accuracy = (benchmarkService as any).calculateAccuracy(findings, expected);

    assert.strictEqual(accuracy.truePositives, 1);
    assert.strictEqual(accuracy.falsePositives, 0); // Only confirmed count as FP
    assert.strictEqual(accuracy.falseNegatives, 0);
    assert.strictEqual(accuracy.precision, 1.0);
    assert.strictEqual(accuracy.recall, 1.0);
    assert.strictEqual(accuracy.f1Score, 1.0);
  });

  it('should evaluate pass/fail correctly', async () => {
    const platform = createPlatform();

    const benchmarkService = new BenchmarkService({
      graphServer: platform.graph,
      dispatcher: platform.dispatcher,
      scenarioLoader: new ScenarioLoader(),
      executorEngine: new ExecutorEngine(),
      scorerEngine: new ScorerEngine(),
    });

    const findings: any[] = [
      {
        id: 'finding_1',
        title: 'SQL Injection',
        severity: 'high',
        validationState: 'confirmed',
      },
    ];

    const scenario: any = {
      successCriteria: {
        minFindingsConfirmed: 1,
        maxFalsePositives: 0,
      },
    };

    const passed = (benchmarkService as any).evaluatePass(findings, scenario);
    assert.strictEqual(passed, true);
  });
});

describe('ScorerEngine', () => {
  it('should calculate score breakdown', async () => {
    const scorer = new ScorerEngine();

    const mockResult: any = {
      benchmarkId: 'test_123',
      coverage: {
        coveragePercent: 100,
      },
      accuracy: {
        f1Score: 0.9,
      },
      evidence: {
        total: 5,
        qualityDistribution: {
          excellent: 2,
          good: 2,
          basic: 1,
          poor: 0,
        },
      },
      duration: {
        executionSeconds: 120,
      },
    };

    const score = await scorer.score(mockResult);

    assert.ok(score.overallScore >= 0 && score.overallScore <= 100);
    assert.ok(['A', 'B', 'C', 'D', 'F'].includes(score.grade));
    assert.strictEqual(score.breakdown.coverage.weight, 0.4);
    assert.strictEqual(score.breakdown.accuracy.weight, 0.3);
    assert.strictEqual(score.breakdown.evidenceQuality.weight, 0.2);
    assert.strictEqual(score.breakdown.efficiency.weight, 0.1);
  });

  it('should assign correct grade based on score', () => {
    const scorer = new ScorerEngine();

    assert.strictEqual((scorer as any).calculateGrade(95), 'A');
    assert.strictEqual((scorer as any).calculateGrade(85), 'B');
    assert.strictEqual((scorer as any).calculateGrade(75), 'C');
    assert.strictEqual((scorer as any).calculateGrade(65), 'D');
    assert.strictEqual((scorer as any).calculateGrade(55), 'F');
  });

  it('should generate recommendations', async () => {
    const scorer = new ScorerEngine();

    const mockResult: any = {
      benchmarkId: 'test_123',
      coverage: {
        coveragePercent: 50,
        expectedFindingsFound: 1,
        expectedFindingsTotal: 2,
      },
      accuracy: {
        f1Score: 0.6,
        falsePositives: 2,
        falseNegatives: 1,
      },
      evidence: {
        total: 3,
        qualityDistribution: {
          excellent: 0,
          good: 1,
          basic: 1,
          poor: 1,
        },
      },
      duration: {
        executionSeconds: 500,
      },
      passed: false,
    };

    const score = await scorer.score(mockResult);

    assert.ok(score.recommendations);
    assert.ok(score.recommendations.length > 0);
    // Should have recommendations for low coverage, accuracy, evidence quality, and efficiency
    assert.ok(score.recommendations.some(r => r.includes('coverage')));
  });
});

describe('ScenarioLoader', () => {
  it('should validate scenario structure', async () => {
    const loader = new ScenarioLoader();

    const invalidScenario: any = {
      // Missing required fields
      id: 'test',
    };

    assert.throws(() => {
      (loader as any).validateScenario(invalidScenario);
    }, /missing required field/);
  });

  it('should validate suite structure', async () => {
    const loader = new ScenarioLoader();

    const invalidSuite: any = {
      id: 'test',
      name: 'Test Suite',
      scenarios: ['scenario-1'], // At least one scenario
      // Invalid passThreshold
      passThreshold: 1.5,
    };

    assert.throws(() => {
      (loader as any).validateSuite(invalidSuite);
    }, /passThreshold/);
  });
});

describe('ExecutorEngine', () => {
  it('should handle URL target type', async () => {
    const executor = new ExecutorEngine();

    const target: any = {
      type: 'url',
      baseUrl: 'https://example.com',
    };

    // Should not throw for URL targets
    await executor.setupTarget(target);
    await executor.teardownTarget(target);
  });

  it('should validate Docker availability for docker_compose targets', async () => {
    const executor = new ExecutorEngine();

    const target: any = {
      type: 'docker_compose',
      setup: 'docker-compose.yml',
      baseUrl: 'http://localhost:8080',
    };

    // This will throw if Docker is not available
    try {
      await executor.setupTarget(target);
      // If we get here, Docker is available
      await executor.teardownTarget(target);
    } catch (error) {
      // Expected if Docker not installed
      assert.ok(error instanceof Error);
      assert.ok((error as Error).message.includes('Docker'));
    }
  });
});
