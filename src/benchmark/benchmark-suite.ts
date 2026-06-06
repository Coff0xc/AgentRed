import { nowIso, newId } from '../domain/ids.js';
import type { EvidenceKind, Severity } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';

export type BenchmarkCategory = 'owasp_top10' | 'ctf' | 'enterprise_auth' | 'api_security';
export type BenchmarkStatus = 'pending' | 'running' | 'completed' | 'failed';
export type BenchmarkEvidenceQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface BenchmarkScenario {
  id: string;
  category: BenchmarkCategory;
  title: string;
  description: string;
  target: string;
  goal: string;
  expectedFindings: Array<{
    title: string;
    severity: Severity;
    mustHaveEvidence: EvidenceKind[];
  }>;
  successCriteria: {
    minFindingsConfirmed: number;
    maxFalsePositives: number;
    maxTimeSeconds: number;
  };
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  dockerTargetService?: string;
}

export interface BenchmarkRun {
  id: string;
  scenarioId: string;
  runId: string;
  status: BenchmarkStatus;
  startedAt: string;
  completedAt?: string;
  durationSeconds: number;
  score: number;
  result?: BenchmarkResult;
}

export interface BenchmarkResult {
  scenarioId: string;
  runId: string;
  score: number;
  findingsFound: number;
  findingsMissed: number;
  falsePositives: number;
  evidenceQuality: BenchmarkEvidenceQuality;
  durationSeconds: number;
  expectedFindings: number;
  confirmedFindings: number;
  recall: number;
  precision: number;
  f1Score: number;
  details: {
    expectedNotFound: string[];
    unexpectedFindings: string[];
    evidenceIssues: string[];
    timeoutExceeded: boolean;
  };
}

export interface BenchmarkLeaderboard {
  generatedAt: string;
  mode: 'benchmark_leaderboard';
  counts: {
    totalRuns: number;
    completedRuns: number;
    scenariosCovered: number;
    uniqueWorkers: number;
  };
  entries: BenchmarkLeaderboardEntry[];
  byCategory: Record<BenchmarkCategory, BenchmarkLeaderboardEntry[]>;
  byScenario: Record<string, BenchmarkLeaderboardEntry[]>;
}

export interface BenchmarkLeaderboardEntry {
  rank: number;
  runId: string;
  scenarioId: string;
  scenarioTitle: string;
  category: BenchmarkCategory;
  worker: string;
  score: number;
  f1Score: number;
  durationSeconds: number;
  findingsConfirmed: number;
  evidenceQuality: BenchmarkEvidenceQuality;
  completedAt: string;
}

export class BenchmarkSuiteService {
  private scenarios: Map<string, BenchmarkScenario> = new Map();
  private benchmarkRuns: Map<string, BenchmarkRun> = new Map();

  constructor(private readonly store: PlatformStore) {
    this.loadScenarios();
  }

  private loadScenarios(): void {
    // Built-in scenarios loaded here, can be extended by YAML loader
    const builtInScenarios: BenchmarkScenario[] = [
      {
        id: 'owasp-sqli-01',
        category: 'owasp_top10',
        title: 'SQL Injection - Authentication Bypass',
        description: 'Classic SQL injection in login form allowing authentication bypass',
        target: 'http://dvwa.local/vulnerabilities/sqli/',
        goal: 'Identify SQL injection vulnerability in authentication endpoint and demonstrate bypass',
        expectedFindings: [
          {
            title: 'SQL Injection',
            severity: 'critical',
            mustHaveEvidence: ['http_exchange', 'command_output'],
          },
        ],
        successCriteria: {
          minFindingsConfirmed: 1,
          maxFalsePositives: 2,
          maxTimeSeconds: 600,
        },
        tags: ['sqli', 'auth-bypass', 'owasp-a03'],
        difficulty: 'easy',
        dockerTargetService: 'dvwa',
      },
      {
        id: 'owasp-xss-01',
        category: 'owasp_top10',
        title: 'Reflected XSS - User Input',
        description: 'Reflected XSS vulnerability in search or input field',
        target: 'http://dvwa.local/vulnerabilities/xss_r/',
        goal: 'Identify reflected XSS vulnerability and demonstrate successful payload execution',
        expectedFindings: [
          {
            title: 'Reflected Cross-Site Scripting',
            severity: 'high',
            mustHaveEvidence: ['http_exchange', 'screenshot'],
          },
        ],
        successCriteria: {
          minFindingsConfirmed: 1,
          maxFalsePositives: 1,
          maxTimeSeconds: 480,
        },
        tags: ['xss', 'reflected', 'owasp-a03'],
        difficulty: 'easy',
        dockerTargetService: 'dvwa',
      },
      {
        id: 'owasp-auth-01',
        category: 'owasp_top10',
        title: 'Broken Authentication - Weak Credentials',
        description: 'Weak credential policy allowing brute force or default credentials',
        target: 'http://dvwa.local/login.php',
        goal: 'Identify weak authentication controls and demonstrate unauthorized access',
        expectedFindings: [
          {
            title: 'Weak Authentication',
            severity: 'high',
            mustHaveEvidence: ['http_exchange', 'command_output'],
          },
        ],
        successCriteria: {
          minFindingsConfirmed: 1,
          maxFalsePositives: 2,
          maxTimeSeconds: 600,
        },
        tags: ['auth', 'brute-force', 'owasp-a07'],
        difficulty: 'medium',
        dockerTargetService: 'dvwa',
      },
      {
        id: 'api-broken-auth',
        category: 'api_security',
        title: 'API Broken Authentication',
        description: 'API endpoints with missing or weak authentication mechanisms',
        target: 'http://juice-shop.local/rest/user/login',
        goal: 'Identify API authentication weaknesses and demonstrate bypass',
        expectedFindings: [
          {
            title: 'API Broken Authentication',
            severity: 'critical',
            mustHaveEvidence: ['http_exchange'],
          },
        ],
        successCriteria: {
          minFindingsConfirmed: 1,
          maxFalsePositives: 3,
          maxTimeSeconds: 720,
        },
        tags: ['api', 'auth', 'owasp-api-02'],
        difficulty: 'medium',
        dockerTargetService: 'juice-shop',
      },
      {
        id: 'api-idor',
        category: 'api_security',
        title: 'Insecure Direct Object Reference',
        description: 'IDOR vulnerability allowing unauthorized access to resources',
        target: 'http://juice-shop.local/api/',
        goal: 'Identify IDOR vulnerability and demonstrate unauthorized data access',
        expectedFindings: [
          {
            title: 'Insecure Direct Object Reference',
            severity: 'high',
            mustHaveEvidence: ['http_exchange'],
          },
        ],
        successCriteria: {
          minFindingsConfirmed: 1,
          maxFalsePositives: 2,
          maxTimeSeconds: 540,
        },
        tags: ['idor', 'api', 'owasp-a01'],
        difficulty: 'medium',
        dockerTargetService: 'juice-shop',
      },
    ];

    for (const scenario of builtInScenarios) {
      this.scenarios.set(scenario.id, scenario);
    }
  }

  listScenarios(filter?: { category?: BenchmarkCategory; difficulty?: string }): BenchmarkScenario[] {
    let scenarios = Array.from(this.scenarios.values());

    if (filter?.category) {
      scenarios = scenarios.filter((s) => s.category === filter.category);
    }

    if (filter?.difficulty) {
      scenarios = scenarios.filter((s) => s.difficulty === filter.difficulty);
    }

    return scenarios;
  }

  getScenario(scenarioId: string): BenchmarkScenario | undefined {
    return this.scenarios.get(scenarioId);
  }

  registerScenario(scenario: BenchmarkScenario): void {
    this.scenarios.set(scenario.id, scenario);
  }

  async startBenchmarkRun(scenarioId: string, runId: string): Promise<BenchmarkRun> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Benchmark scenario not found: ${scenarioId}`);
    }

    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const benchmarkRun: BenchmarkRun = {
      id: newId('benchmark'),
      scenarioId,
      runId,
      status: 'running',
      startedAt: nowIso(),
      durationSeconds: 0,
      score: 0,
    };

    this.benchmarkRuns.set(benchmarkRun.id, benchmarkRun);
    return benchmarkRun;
  }

  completeBenchmarkRun(benchmarkRunId: string, result: BenchmarkResult): BenchmarkRun {
    const benchmarkRun = this.benchmarkRuns.get(benchmarkRunId);
    if (!benchmarkRun) {
      throw new Error(`Benchmark run not found: ${benchmarkRunId}`);
    }

    benchmarkRun.status = 'completed';
    benchmarkRun.completedAt = nowIso();
    benchmarkRun.durationSeconds = result.durationSeconds;
    benchmarkRun.score = result.score;
    benchmarkRun.result = result;

    return benchmarkRun;
  }

  failBenchmarkRun(benchmarkRunId: string, reason: string): BenchmarkRun {
    const benchmarkRun = this.benchmarkRuns.get(benchmarkRunId);
    if (!benchmarkRun) {
      throw new Error(`Benchmark run not found: ${benchmarkRunId}`);
    }

    benchmarkRun.status = 'failed';
    benchmarkRun.completedAt = nowIso();

    return benchmarkRun;
  }

  getBenchmarkRun(benchmarkRunId: string): BenchmarkRun | undefined {
    return this.benchmarkRuns.get(benchmarkRunId);
  }

  listBenchmarkRuns(filter?: { scenarioId?: string; status?: BenchmarkStatus }): BenchmarkRun[] {
    let runs = Array.from(this.benchmarkRuns.values());

    if (filter?.scenarioId) {
      runs = runs.filter((r) => r.scenarioId === filter.scenarioId);
    }

    if (filter?.status) {
      runs = runs.filter((r) => r.status === filter.status);
    }

    return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  getLeaderboard(): BenchmarkLeaderboard {
    const completedRuns = this.listBenchmarkRuns({ status: 'completed' });
    const entries: BenchmarkLeaderboardEntry[] = [];

    for (const benchmarkRun of completedRuns) {
      if (!benchmarkRun.result) continue;

      const scenario = this.scenarios.get(benchmarkRun.scenarioId);
      if (!scenario) continue;

      const run = this.store.state.runs[benchmarkRun.runId];
      if (!run) continue;

      const workerName = run.workerPool[0]?.name || 'unknown';

      entries.push({
        rank: 0, // Will be set later
        runId: benchmarkRun.runId,
        scenarioId: benchmarkRun.scenarioId,
        scenarioTitle: scenario.title,
        category: scenario.category,
        worker: workerName,
        score: benchmarkRun.result.score,
        f1Score: benchmarkRun.result.f1Score,
        durationSeconds: benchmarkRun.result.durationSeconds,
        findingsConfirmed: benchmarkRun.result.confirmedFindings,
        evidenceQuality: benchmarkRun.result.evidenceQuality,
        completedAt: benchmarkRun.completedAt || benchmarkRun.startedAt,
      });
    }

    // Sort by score descending, then by F1 score, then by duration ascending
    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.f1Score !== a.f1Score) return b.f1Score - a.f1Score;
      return a.durationSeconds - b.durationSeconds;
    });

    // Set ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Group by category
    const byCategory: Record<BenchmarkCategory, BenchmarkLeaderboardEntry[]> = {
      owasp_top10: [],
      ctf: [],
      enterprise_auth: [],
      api_security: [],
    };

    for (const entry of entries) {
      byCategory[entry.category].push(entry);
    }

    // Group by scenario
    const byScenario: Record<string, BenchmarkLeaderboardEntry[]> = {};
    for (const entry of entries) {
      if (!byScenario[entry.scenarioId]) {
        byScenario[entry.scenarioId] = [];
      }
      byScenario[entry.scenarioId].push(entry);
    }

    const uniqueWorkers = new Set(entries.map((e) => e.worker));
    const scenariosCovered = new Set(entries.map((e) => e.scenarioId));

    return {
      generatedAt: nowIso(),
      mode: 'benchmark_leaderboard',
      counts: {
        totalRuns: this.benchmarkRuns.size,
        completedRuns: completedRuns.length,
        scenariosCovered: scenariosCovered.size,
        uniqueWorkers: uniqueWorkers.size,
      },
      entries,
      byCategory,
      byScenario,
    };
  }
}
