/**
 * Core benchmark service for standardized AI Worker evaluation
 *
 * Provides:
 * - Scenario loading and execution
 * - Automated scoring and metrics
 * - Suite execution
 * - Leaderboard tracking
 */

import type {
  BenchmarkScenario,
  BenchmarkResult,
  BenchmarkScore,
  BenchmarkSuite,
  BenchmarkSuiteResult,
  BenchmarkLeaderboardEntry,
  FindingStats,
  EvidenceStats,
  CoverageMetrics,
  AccuracyMetrics,
  EvidenceQuality,
  BenchmarkDuration,
} from './types.js';
import type { Finding, Evidence, EvidenceKind, Run } from '../domain/types.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { Dispatcher } from '../dispatcher/dispatcher.js';
import { ScenarioLoader } from './scenario-loader.js';
import { ExecutorEngine } from './executor-engine.js';
import { ScorerEngine } from './scorer-engine.js';

export interface BenchmarkServiceOptions {
  graphServer: GraphServer;
  dispatcher: Dispatcher;
  scenarioLoader: ScenarioLoader;
  executorEngine: ExecutorEngine;
  scorerEngine: ScorerEngine;
}

export interface ExecuteScenarioOptions {
  workerType?: string;
  maxDispatchRounds?: number;
  timeoutSeconds?: number;
}

export class BenchmarkService {
  private graphServer: GraphServer;
  private dispatcher: Dispatcher;
  private scenarioLoader: ScenarioLoader;
  private executorEngine: ExecutorEngine;
  private scorerEngine: ScorerEngine;

  constructor(options: BenchmarkServiceOptions) {
    this.graphServer = options.graphServer;
    this.dispatcher = options.dispatcher;
    this.scenarioLoader = options.scenarioLoader;
    this.executorEngine = options.executorEngine;
    this.scorerEngine = options.scorerEngine;
  }

  /**
   * Load a scenario definition by ID
   */
  async loadScenario(scenarioId: string): Promise<BenchmarkScenario> {
    return this.scenarioLoader.load(scenarioId);
  }

  /**
   * Execute a single benchmark scenario
   */
  async executeScenario(
    scenario: BenchmarkScenario,
    options?: ExecuteScenarioOptions
  ): Promise<BenchmarkResult> {
    const startTime = Date.now();

    // 1. Setup target environment
    console.log(`[Benchmark] Setting up target for ${scenario.id}...`);
    await this.executorEngine.setupTarget(scenario.target);
    const setupDuration = (Date.now() - startTime) / 1000;

    // 2. Create run with scenario context
    console.log(`[Benchmark] Creating run for ${scenario.id}...`);
    const run = await this.graphServer.createRun({
      target: scenario.target.baseUrl,
      goal: scenario.goal,
      scopePolicy: {
        allowedAssets: scenario.hints?.scope || [scenario.target.baseUrl],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        destructiveAllowed: false,
        credentialRules: {
          allowVaultReferencesOnly: false,
        },
        rateLimits: {
          requestsPerMinute: 100,
        },
      },
      workerPool: [
        {
          name: 'benchmark-worker',
          type: (options?.workerType as any) || 'mock',
          priority: 1,
          maxRunning: 1,
        }
      ],
    });

    // Store benchmark metadata as facts
    await this.graphServer.addFact({
      runId: run.id,
      statement: `Benchmark: ${scenario.id} (${scenario.category}) v${scenario.version}`,
      createdBy: 'benchmark-service',
    });

    // 3. Execute with Dispatcher
    console.log(`[Benchmark] Executing scenario ${scenario.id}...`);
    const executionStart = Date.now();
    let rounds = 0;
    const maxRounds = options?.maxDispatchRounds || 20;
    const timeoutMs = (options?.timeoutSeconds || scenario.successCriteria.maxTimeSeconds) * 1000;

    try {
      while (rounds < maxRounds) {
        const elapsed = Date.now() - executionStart;
        if (elapsed > timeoutMs) {
          console.log(`[Benchmark] Timeout reached for ${scenario.id}`);
          break;
        }

        const result = await this.dispatcher.dispatchOnce(run.id);
        rounds++;
        console.log(`[Benchmark] Dispatch round ${rounds}: ${result.status}`);

        if (result.status === 'skipped' || result.status === 'blocked') {
          break;
        }
      }
    } catch (error) {
      console.error(`[Benchmark] Error during execution:`, error);
    }

    const executionDuration = (Date.now() - executionStart) / 1000;

    // 4. Teardown
    console.log(`[Benchmark] Tearing down target for ${scenario.id}...`);
    const teardownStart = Date.now();
    await this.executorEngine.teardownTarget(scenario.target);
    const teardownDuration = (Date.now() - teardownStart) / 1000;

    // 5. Collect results
    const graph = await this.graphServer.getGraph(run.id);
    const findings = graph.findings;
    const evidence = graph.evidence;

    // 6. Calculate metrics
    const result: BenchmarkResult = {
      benchmarkId: `bench_${Date.now()}`,
      scenarioId: scenario.id,
      runId: run.id,
      executedAt: new Date().toISOString(),
      duration: {
        setupSeconds: setupDuration,
        executionSeconds: executionDuration,
        teardownSeconds: teardownDuration,
        totalSeconds: (Date.now() - startTime) / 1000,
      },
      findings: this.calculateFindingStats(findings),
      evidence: this.calculateEvidenceStats(evidence),
      coverage: this.calculateCoverage(findings, scenario.expectedFindings),
      accuracy: this.calculateAccuracy(findings, scenario.expectedFindings),
      passed: this.evaluatePass(findings, scenario),
      metadata: {
        workerType: options?.workerType,
        dispatchRounds: rounds,
      },
    };

    if (!result.passed) {
      result.failureReason = this.determineFailureReason(result, scenario);
    }

    console.log(`[Benchmark] Scenario ${scenario.id} completed: ${result.passed ? 'PASSED' : 'FAILED'}`);

    return result;
  }

  /**
   * Score a benchmark result
   */
  async scoreResult(result: BenchmarkResult): Promise<BenchmarkScore> {
    return this.scorerEngine.score(result);
  }

  /**
   * Load a benchmark suite
   */
  async loadSuite(suiteId: string): Promise<BenchmarkSuite> {
    return this.scenarioLoader.loadSuite(suiteId);
  }

  /**
   * Execute a complete benchmark suite
   */
  async executeSuite(
    suiteId: string,
    options?: ExecuteScenarioOptions & { parallel?: boolean }
  ): Promise<BenchmarkSuiteResult> {
    const suite = await this.loadSuite(suiteId);
    const scenarios = await Promise.all(
      suite.scenarios.map(id => this.scenarioLoader.load(id))
    );

    console.log(`[Benchmark] Executing suite ${suiteId} with ${scenarios.length} scenarios...`);

    const results: BenchmarkResult[] = [];
    const suiteStartTime = Date.now();

    if (options?.parallel) {
      // Parallel execution
      const resultPromises = scenarios.map(scenario =>
        this.executeScenario(scenario, options)
      );
      results.push(...await Promise.all(resultPromises));
    } else {
      // Sequential execution
      for (const scenario of scenarios) {
        const result = await this.executeScenario(scenario, options);
        results.push(result);
      }
    }

    const suiteDuration = (Date.now() - suiteStartTime) / 1000;

    // Calculate suite summary
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const totalScore = results.reduce((sum, r) => {
      const score = this.scorerEngine.quickScore(r);
      return sum + score;
    }, 0);
    const averageScore = totalScore / results.length;

    const suiteResult: BenchmarkSuiteResult = {
      suiteId,
      executedAt: new Date().toISOString(),
      scenarios: scenarios.length,
      results,
      summary: {
        passed,
        failed,
        totalScore,
        averageScore,
        duration: {
          setupSeconds: results.reduce((sum, r) => sum + r.duration.setupSeconds, 0),
          executionSeconds: results.reduce((sum, r) => sum + r.duration.executionSeconds, 0),
          teardownSeconds: results.reduce((sum, r) => sum + r.duration.teardownSeconds, 0),
          totalSeconds: suiteDuration,
        },
      },
      passed: (passed / results.length) >= suite.passThreshold,
    };

    console.log(`[Benchmark] Suite ${suiteId} completed: ${suiteResult.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`[Benchmark] Summary: ${passed}/${results.length} passed, avg score: ${averageScore.toFixed(1)}`);

    return suiteResult;
  }

  /**
   * Get leaderboard for Worker comparison
   */
  async getLeaderboard(): Promise<BenchmarkLeaderboardEntry[]> {
    // TODO: Implement persistence layer for historical results
    // For now, return empty array
    return [];
  }

  // ===== Private Helper Methods =====

  private calculateFindingStats(findings: Finding[]): FindingStats {
    return {
      total: findings.length,
      confirmed: findings.filter(f => f.validationState === 'confirmed').length,
      rejected: findings.filter(f => f.validationState === 'rejected').length,
      candidate: findings.filter(f => f.validationState === 'candidate').length,
    };
  }

  private calculateEvidenceStats(evidence: Evidence[]): EvidenceStats {
    const byKind: Record<string, number> = {};
    const qualityDistribution: Record<EvidenceQuality, number> = {
      excellent: 0,
      good: 0,
      basic: 0,
      poor: 0,
    };

    for (const ev of evidence) {
      byKind[ev.kind] = (byKind[ev.kind] || 0) + 1;

      // Simple quality heuristic based on evidence kind
      const quality = this.assessEvidenceQualitySimple(ev);
      qualityDistribution[quality]++;
    }

    return {
      total: evidence.length,
      byKind: byKind as Record<EvidenceKind, number>,
      qualityDistribution,
    };
  }

  private assessEvidenceQualitySimple(ev: Evidence): EvidenceQuality {
    // Simple heuristic - can be enhanced with EvidenceQualityService
    if (ev.kind === 'screenshot' || ev.kind === 'command_output' || ev.kind === 'http_exchange') {
      return 'good';
    }
    return 'basic';
  }

  private calculateCoverage(
    findings: Finding[],
    expected: BenchmarkScenario['expectedFindings']
  ): CoverageMetrics {
    let found = 0;

    for (const exp of expected) {
      const match = findings.find(f =>
        this.matchesFinding(f, exp) &&
        f.validationState === 'confirmed'
      );
      if (match) found++;
    }

    return {
      expectedFindingsFound: found,
      expectedFindingsTotal: expected.length,
      coveragePercent: expected.length > 0 ? (found / expected.length) * 100 : 0,
    };
  }

  private calculateAccuracy(
    findings: Finding[],
    expected: BenchmarkScenario['expectedFindings']
  ): AccuracyMetrics {
    const confirmed = findings.filter(f => f.validationState === 'confirmed');

    const truePositives = confirmed.filter(f =>
      expected.some(e => this.matchesFinding(f, e))
    ).length;

    const falsePositives = confirmed.length - truePositives;
    const falseNegatives = expected.length - truePositives;

    const precision = truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;

    const recall = truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0;

    const f1Score = precision + recall > 0
      ? 2 * (precision * recall) / (precision + recall)
      : 0;

    return {
      truePositives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1Score,
    };
  }

  private matchesFinding(finding: Finding, expected: BenchmarkScenario['expectedFindings'][0]): boolean {
    // Check if finding title contains expected title pattern
    const titleMatch = finding.title.toLowerCase().includes(expected.title.toLowerCase());

    // Check severity match
    const severityMatch = finding.severity === expected.severity;

    return titleMatch && severityMatch;
  }

  private evaluatePass(
    findings: Finding[],
    scenario: BenchmarkScenario
  ): boolean {
    const confirmed = findings.filter(f => f.validationState === 'confirmed').length;
    const rejected = findings.filter(f => f.validationState === 'rejected').length;

    const meetsMinFindings = confirmed >= scenario.successCriteria.minFindingsConfirmed;
    const meetsMaxFalsePositives = rejected <= scenario.successCriteria.maxFalsePositives;

    return meetsMinFindings && meetsMaxFalsePositives;
  }

  private determineFailureReason(result: BenchmarkResult, scenario: BenchmarkScenario): string {
    const reasons: string[] = [];

    if (result.findings.confirmed < scenario.successCriteria.minFindingsConfirmed) {
      reasons.push(
        `Insufficient findings: expected ${scenario.successCriteria.minFindingsConfirmed}, got ${result.findings.confirmed}`
      );
    }

    if (result.findings.rejected > scenario.successCriteria.maxFalsePositives) {
      reasons.push(
        `Too many false positives: expected max ${scenario.successCriteria.maxFalsePositives}, got ${result.findings.rejected}`
      );
    }

    if (result.coverage.coveragePercent < 100) {
      reasons.push(
        `Incomplete coverage: ${result.coverage.coveragePercent.toFixed(1)}% (${result.coverage.expectedFindingsFound}/${result.coverage.expectedFindingsTotal} expected findings found)`
      );
    }

    return reasons.join('; ');
  }
}
