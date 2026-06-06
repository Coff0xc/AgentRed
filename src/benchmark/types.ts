/**
 * Benchmark types for standardized evaluation of AI Workers
 *
 * Inspired by promptfoo's eval framework and PentestGPT's XBOW benchmark suite.
 */

import type { Severity, EvidenceKind, Finding, Evidence } from '../domain/types.js';

/**
 * Benchmark scenario category
 */
export type BenchmarkCategory = 'owasp_top10' | 'ctf' | 'enterprise_auth' | 'api_security' | 'cloud_security';

/**
 * Difficulty level for scenarios
 */
export type BenchmarkDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/**
 * Target environment type
 */
export type TargetType = 'docker_compose' | 'url' | 'api_endpoint' | 'local_service';

/**
 * Evidence quality assessment
 */
export type EvidenceQuality = 'excellent' | 'good' | 'basic' | 'poor';

/**
 * Benchmark grade
 */
export type BenchmarkGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Target environment configuration
 */
export interface BenchmarkTarget {
  type: TargetType;
  setup: string; // Path to setup script or docker-compose file
  baseUrl: string;
  teardown?: string;
  healthcheck?: {
    url: string;
    expectedStatus: number;
    maxRetries: number;
    retryDelayMs: number;
  };
}

/**
 * Expected finding definition for scenario validation
 */
export interface ExpectedFinding {
  title: string; // Pattern to match against finding title
  severity: Severity;
  mustHaveEvidence: EvidenceKind[];
  optionalEvidence?: EvidenceKind[];
}

/**
 * Success criteria for scenario evaluation
 */
export interface SuccessCriteria {
  minFindingsConfirmed: number;
  maxFalsePositives: number;
  maxTimeSeconds: number;
  requiredEvidenceQuality: EvidenceQuality;
}

/**
 * Complete benchmark scenario definition
 */
export interface BenchmarkScenario {
  id: string; // e.g., 'owasp-sqli-login-01'
  version: string; // Semver
  category: BenchmarkCategory;

  metadata: {
    title: string;
    description: string;
    difficulty: BenchmarkDifficulty;
    tags: string[];
    author?: string;
    createdAt?: string;
    references?: string[]; // CVE, OWASP links, etc.
  };

  target: BenchmarkTarget;
  goal: string; // Clear objective for the AI Worker

  expectedFindings: ExpectedFinding[];
  successCriteria: SuccessCriteria;

  hints?: {
    scope?: string[];
    initialIntent?: string;
    relevantTools?: string[];
  };
}

/**
 * Duration breakdown for benchmark execution
 */
export interface BenchmarkDuration {
  setupSeconds: number;
  executionSeconds: number;
  teardownSeconds: number;
  totalSeconds: number;
}

/**
 * Finding statistics
 */
export interface FindingStats {
  total: number;
  confirmed: number;
  rejected: number;
  candidate: number;
}

/**
 * Evidence statistics
 */
export interface EvidenceStats {
  total: number;
  byKind: Record<EvidenceKind, number>;
  qualityDistribution: Record<EvidenceQuality, number>;
}

/**
 * Coverage metrics - how many expected findings were discovered
 */
export interface CoverageMetrics {
  expectedFindingsFound: number;
  expectedFindingsTotal: number;
  coveragePercent: number;
}

/**
 * Accuracy metrics - precision, recall, F1
 */
export interface AccuracyMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

/**
 * Complete benchmark execution result
 */
export interface BenchmarkResult {
  benchmarkId: string;
  scenarioId: string;
  runId: string;
  executedAt: string;

  duration: BenchmarkDuration;
  findings: FindingStats;
  evidence: EvidenceStats;
  coverage: CoverageMetrics;
  accuracy: AccuracyMetrics;

  passed: boolean;
  failureReason?: string;

  metadata?: {
    workerType?: string;
    dispatchRounds?: number;
    gitCommit?: string;
  };
}

/**
 * Score breakdown by dimension
 */
export interface ScoreBreakdown {
  coverage: { score: number; weight: number };
  accuracy: { score: number; weight: number };
  evidenceQuality: { score: number; weight: number };
  efficiency: { score: number; weight: number };
}

/**
 * Comparison with historical results
 */
export interface ScoreComparison {
  previousScore?: number;
  averageScore?: number;
  bestScore?: number;
  percentile?: number;
}

/**
 * Complete benchmark score
 */
export interface BenchmarkScore {
  resultId: string;
  overallScore: number; // 0-100
  breakdown: ScoreBreakdown;
  grade: BenchmarkGrade;
  comparison?: ScoreComparison;
  recommendations?: string[];
}

/**
 * Suite definition - collection of related scenarios
 */
export interface BenchmarkSuite {
  id: string;
  name: string;
  description: string;
  version: string;
  scenarios: string[]; // Scenario IDs
  passThreshold: number; // 0-1, percentage of scenarios that must pass
  metadata?: {
    category?: BenchmarkCategory;
    estimatedDurationMinutes?: number;
    tags?: string[];
  };
}

/**
 * Suite execution result
 */
export interface BenchmarkSuiteResult {
  suiteId: string;
  executedAt: string;
  scenarios: number;
  results: BenchmarkResult[];
  summary: {
    passed: number;
    failed: number;
    totalScore: number;
    averageScore: number;
    duration: BenchmarkDuration;
  };
  passed: boolean;
}

/**
 * Leaderboard entry for Worker comparison
 */
export interface BenchmarkLeaderboardEntry {
  workerType: string;
  scenariosRun: number;
  averageScore: number;
  averageDuration: number;
  successRate: number;
  rank: number;
  metadata?: {
    model?: string;
    provider?: string;
    lastRun?: string;
  };
}
