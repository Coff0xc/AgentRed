import { nowIso } from '../domain/ids.js';
import type { PlatformStore } from '../storage/store.js';

/**
 * PyRIT Scenario Library Service
 *
 * Integrates Microsoft PyRIT GenAI red-team scenario datasets into AgentRed's
 * evaluation harness. PyRIT scenarios become fixture-driven Worker evaluation
 * tasks, testing Agent Worker behavior against known GenAI security patterns.
 *
 * Reference: https://github.com/microsoft/PyRIT
 *
 * Architecture alignment:
 * - PyRIT targets → AgentRed Worker envelope inputs
 * - PyRIT orchestrators → AgentRed Dispatcher + Tool Gateway
 * - PyRIT scorers → AgentRed evidence quality + finding validation
 * - PyRIT datasets → AgentRed scenario fixtures
 *
 * Safety gates:
 * - Scenarios do not auto-execute; they define evaluation fixtures
 * - Workers remain untrusted suggestion producers
 * - Tool Gateway remains the only execution path
 * - Scoring is read-only; it does not grant permissions or bypass approvals
 */

export type PyritScenarioCategory =
  | 'prompt_injection'
  | 'jailbreak'
  | 'harmful_content'
  | 'bias_fairness'
  | 'privacy_leak'
  | 'code_execution'
  | 'data_exfiltration'
  | 'model_extraction'
  | 'adversarial_robustness'
  | 'security_misconfiguration';

export type PyritScenarioRiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';

export type PyritScenarioStatus = 'imported' | 'adapted' | 'tested' | 'retired';

export type PyritScorerType =
  | 'refusal_detection'
  | 'harmful_content_detection'
  | 'pii_leak_detection'
  | 'jailbreak_success'
  | 'bias_detection'
  | 'safety_guardrail_bypass';

export interface PyritScenario {
  id: string;
  name: string;
  category: PyritScenarioCategory;
  description: string;
  objective: string;
  riskLevel: PyritScenarioRiskLevel;
  status: PyritScenarioStatus;

  /** PyRIT dataset source reference */
  source: {
    dataset: string;
    version?: string;
    url?: string;
    license: string;
  };

  /** Target system type this scenario is designed for */
  targetType: 'llm' | 'ai_agent' | 'ai_api' | 'ai_application' | 'mcp_server';

  /** Scenario fixture for Worker envelope */
  fixture: {
    /** Run configuration hints */
    targetHints: string[];
    /** Expected Worker task type */
    taskType: 'bootstrap' | 'reason' | 'explore' | 'mixed';
    /** Initial prompt or conversation seed */
    initialPrompt?: string;
    /** Multi-turn conversation template */
    conversationTemplate?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    /** Expected tool requests */
    expectedTools?: string[];
    /** Prohibited tool requests */
    prohibitedTools?: string[];
  };

  /** Success criteria for evaluation */
  successCriteria: {
    /** What the Worker should detect or prevent */
    shouldDetect?: string[];
    /** What the Worker should refuse */
    shouldRefuse?: string[];
    /** What evidence should be produced */
    shouldProduceEvidence?: string[];
    /** What findings should be generated */
    shouldGenerateFindings?: string[];
  };

  /** Scorer configuration */
  scorers: Array<{
    type: PyritScorerType;
    threshold?: number;
    parameters?: Record<string, unknown>;
  }>;

  /** Safety notes and usage constraints */
  safetyNotes: string[];

  /** References to related scenarios */
  relatedScenarios: string[];

  /** Metadata */
  createdAt: string;
  updatedAt: string;
  importedFrom?: string;
}

export interface PyritScenarioImport {
  id: string;
  source: string;
  importedAt: string;
  scenarioCount: number;
  scenarioIds: string[];
  status: 'completed' | 'partial' | 'failed';
  errors: string[];
}

export interface PyritScenarioRunResult {
  id: string;
  runId: string;
  scenarioId: string;
  executedAt: string;
  workerName: string;

  /** Worker task execution results */
  taskResults: {
    accepted: boolean;
    schemaValid: boolean;
    toolRequests: number;
    evidenceProduced: number;
    findingsGenerated: number;
    refusals: number;
  };

  /** Scorer results */
  scorerResults: Array<{
    scorerType: PyritScorerType;
    score: number;
    passed: boolean;
    details: string;
  }>;

  /** Overall assessment */
  overallScore: number;
  passed: boolean;

  /** Detailed findings */
  findings: string[];
  gaps: string[];

  /** Evidence links */
  evidenceIds: string[];
  traceSpanIds: string[];
}

export interface PyritScenarioLibrarySummary {
  generatedAt: string;
  counts: {
    totalScenarios: number;
    byCategory: Record<PyritScenarioCategory, number>;
    byRiskLevel: Record<PyritScenarioRiskLevel, number>;
    byStatus: Record<PyritScenarioStatus, number>;
    byTargetType: Record<string, number>;
    imports: number;
    runResults: number;
  };
  scenarios: PyritScenario[];
  recentImports: PyritScenarioImport[];
  recentResults: PyritScenarioRunResult[];
  recommendations: string[];
}

export interface PyritScenarioEvaluationReport {
  runId: string;
  generatedAt: string;
  mode: 'pyrit_scenario_evaluation';
  summary: string;

  counts: {
    scenariosRun: number;
    passed: number;
    failed: number;
    avgScore: number;
  };

  results: PyritScenarioRunResult[];

  /** Worker comparison across scenarios */
  workerComparison: Array<{
    workerName: string;
    scenariosRun: number;
    passRate: number;
    avgScore: number;
    strengths: string[];
    gaps: string[];
  }>;

  /** Category-level insights */
  categoryInsights: Array<{
    category: PyritScenarioCategory;
    scenariosRun: number;
    passRate: number;
    commonGaps: string[];
  }>;

  nextActions: string[];
  safetyNotes: string[];
}

export class PyritScenarioLibraryService {
  constructor(private readonly store: PlatformStore) {}

  /**
   * Get library summary
   */
  getSummary(): PyritScenarioLibrarySummary {
    const scenarios = Object.values(this.store.state.pyritScenarios || {});
    const imports = Object.values(this.store.state.pyritScenarioImports || {});
    const results = Object.values(this.store.state.pyritScenarioResults || {});

    const counts = {
      totalScenarios: scenarios.length,
      byCategory: countByCategory(scenarios),
      byRiskLevel: countByRiskLevel(scenarios),
      byStatus: countByStatus(scenarios),
      byTargetType: countByTargetType(scenarios),
      imports: imports.length,
      runResults: results.length,
    };

    return {
      generatedAt: nowIso(),
      counts,
      scenarios: scenarios.slice(0, 50),
      recentImports: imports.slice(-10),
      recentResults: results.slice(-20),
      recommendations: generateRecommendations(scenarios, results),
    };
  }

  /**
   * Import PyRIT scenarios from a dataset
   */
  importScenarios(input: {
    source: string;
    scenarios: Array<{
      name: string;
      category: PyritScenarioCategory;
      description: string;
      objective: string;
      riskLevel: PyritScenarioRiskLevel;
      targetType: PyritScenario['targetType'];
      fixture: PyritScenario['fixture'];
      successCriteria: PyritScenario['successCriteria'];
      scorers: PyritScenario['scorers'];
      safetyNotes?: string[];
      sourceDataset: string;
      sourceVersion?: string;
      sourceUrl?: string;
      license: string;
    }>;
  }): PyritScenarioImport {
    const importId = `pyrit-import-${Date.now()}`;
    const scenarioIds: string[] = [];
    const errors: string[] = [];

    for (const scenario of input.scenarios) {
      try {
        const scenarioId = `pyrit-scenario-${Date.now()}-${scenarioIds.length}`;
        const pyritScenario: PyritScenario = {
          id: scenarioId,
          name: scenario.name,
          category: scenario.category,
          description: scenario.description,
          objective: scenario.objective,
          riskLevel: scenario.riskLevel,
          status: 'imported',
          source: {
            dataset: scenario.sourceDataset,
            version: scenario.sourceVersion,
            url: scenario.sourceUrl,
            license: scenario.license,
          },
          targetType: scenario.targetType,
          fixture: scenario.fixture,
          successCriteria: scenario.successCriteria,
          scorers: scenario.scorers,
          safetyNotes: scenario.safetyNotes || [],
          relatedScenarios: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
          importedFrom: importId,
        };

        if (!this.store.state.pyritScenarios) {
          this.store.state.pyritScenarios = {};
        }
        this.store.state.pyritScenarios[scenarioId] = pyritScenario;
        scenarioIds.push(scenarioId);
      } catch (err) {
        errors.push(`Failed to import scenario ${scenario.name}: ${err}`);
      }
    }

    const importRecord: PyritScenarioImport = {
      id: importId,
      source: input.source,
      importedAt: nowIso(),
      scenarioCount: scenarioIds.length,
      scenarioIds,
      status: errors.length === 0 ? 'completed' : errors.length < input.scenarios.length ? 'partial' : 'failed',
      errors,
    };

    if (!this.store.state.pyritScenarioImports) {
      this.store.state.pyritScenarioImports = {};
    }
    this.store.state.pyritScenarioImports[importId] = importRecord;

    return importRecord;
  }

  /**
   * Get evaluation report for a run
   */
  getEvaluationReport(runId: string): PyritScenarioEvaluationReport {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const results = Object.values(this.store.state.pyritScenarioResults || {}).filter(
      (result) => result.runId === runId
    );

    const passed = results.filter((r) => r.passed).length;
    const totalScore = results.reduce((sum, r) => sum + r.overallScore, 0);

    const workerMap = new Map<string, PyritScenarioRunResult[]>();
    for (const result of results) {
      const existing = workerMap.get(result.workerName) || [];
      existing.push(result);
      workerMap.set(result.workerName, existing);
    }

    const workerComparison = Array.from(workerMap.entries()).map(([workerName, workerResults]) => {
      const workerPassed = workerResults.filter((r) => r.passed).length;
      const workerTotalScore = workerResults.reduce((sum, r) => sum + r.overallScore, 0);
      return {
        workerName,
        scenariosRun: workerResults.length,
        passRate: workerResults.length > 0 ? Math.round((workerPassed / workerResults.length) * 100) : 0,
        avgScore: workerResults.length > 0 ? Math.round(workerTotalScore / workerResults.length) : 0,
        strengths: extractStrengths(workerResults),
        gaps: extractGaps(workerResults),
      };
    });

    const categoryMap = new Map<PyritScenarioCategory, PyritScenarioRunResult[]>();
    for (const result of results) {
      const scenario = this.store.state.pyritScenarios?.[result.scenarioId];
      if (scenario) {
        const existing = categoryMap.get(scenario.category) || [];
        existing.push(result);
        categoryMap.set(scenario.category, existing);
      }
    }

    const categoryInsights = Array.from(categoryMap.entries()).map(([category, categoryResults]) => {
      const categoryPassed = categoryResults.filter((r) => r.passed).length;
      return {
        category,
        scenariosRun: categoryResults.length,
        passRate: categoryResults.length > 0 ? Math.round((categoryPassed / categoryResults.length) * 100) : 0,
        commonGaps: extractCommonGaps(categoryResults),
      };
    });

    return {
      runId,
      generatedAt: nowIso(),
      mode: 'pyrit_scenario_evaluation',
      summary:
        `${passed}/${results.length} PyRIT scenario(s) passed; ` +
        `average score ${results.length > 0 ? Math.round(totalScore / results.length) : 0}/100; ` +
        `${workerComparison.length} Worker(s) evaluated.`,
      counts: {
        scenariosRun: results.length,
        passed,
        failed: results.length - passed,
        avgScore: results.length > 0 ? Math.round(totalScore / results.length) : 0,
      },
      results: results.slice(0, 50),
      workerComparison,
      categoryInsights,
      nextActions: generateNextActions(results, workerComparison, categoryInsights),
      safetyNotes: [
        'PyRIT scenario evaluation is read-only and does not execute real attacks.',
        'Workers remain untrusted; all tool requests go through Tool Gateway with scope and approval gates.',
        'Passing a scenario means the Worker correctly identified risks and requested appropriate evidence collection.',
        'Failing a scenario does not automatically block the Worker; it guides improvement priorities.',
        'Scenario fixtures must not contain real credentials, PII, or production targets.',
      ],
    };
  }

  /**
   * Record a scenario run result
   */
  recordResult(result: Omit<PyritScenarioRunResult, 'id' | 'executedAt'>): PyritScenarioRunResult {
    const resultId = `pyrit-result-${Date.now()}`;
    const fullResult: PyritScenarioRunResult = {
      ...result,
      id: resultId,
      executedAt: nowIso(),
    };

    if (!this.store.state.pyritScenarioResults) {
      this.store.state.pyritScenarioResults = {};
    }
    this.store.state.pyritScenarioResults[resultId] = fullResult;

    return fullResult;
  }

  /**
   * Get scenario by ID
   */
  getScenario(scenarioId: string): PyritScenario | undefined {
    return this.store.state.pyritScenarios?.[scenarioId];
  }

  /**
   * List scenarios by category
   */
  listByCategory(category: PyritScenarioCategory): PyritScenario[] {
    const scenarios = Object.values(this.store.state.pyritScenarios || {});
    return scenarios.filter((s) => s.category === category);
  }

  /**
   * List scenarios by risk level
   */
  listByRiskLevel(riskLevel: PyritScenarioRiskLevel): PyritScenario[] {
    const scenarios = Object.values(this.store.state.pyritScenarios || {});
    return scenarios.filter((s) => s.riskLevel === riskLevel);
  }

  /**
   * Update scenario status
   */
  updateStatus(scenarioId: string, status: PyritScenarioStatus): void {
    const scenario = this.store.state.pyritScenarios?.[scenarioId];
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }
    scenario.status = status;
    scenario.updatedAt = nowIso();
  }
}

// Helper functions

function countByCategory(scenarios: PyritScenario[]): Record<PyritScenarioCategory, number> {
  const counts: Partial<Record<PyritScenarioCategory, number>> = {};
  for (const scenario of scenarios) {
    counts[scenario.category] = (counts[scenario.category] || 0) + 1;
  }
  return counts as Record<PyritScenarioCategory, number>;
}

function countByRiskLevel(scenarios: PyritScenario[]): Record<PyritScenarioRiskLevel, number> {
  const counts: Partial<Record<PyritScenarioRiskLevel, number>> = {};
  for (const scenario of scenarios) {
    counts[scenario.riskLevel] = (counts[scenario.riskLevel] || 0) + 1;
  }
  return counts as Record<PyritScenarioRiskLevel, number>;
}

function countByStatus(scenarios: PyritScenario[]): Record<PyritScenarioStatus, number> {
  const counts: Partial<Record<PyritScenarioStatus, number>> = {};
  for (const scenario of scenarios) {
    counts[scenario.status] = (counts[scenario.status] || 0) + 1;
  }
  return counts as Record<PyritScenarioStatus, number>;
}

function countByTargetType(scenarios: PyritScenario[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const scenario of scenarios) {
    counts[scenario.targetType] = (counts[scenario.targetType] || 0) + 1;
  }
  return counts;
}

function generateRecommendations(scenarios: PyritScenario[], results: PyritScenarioRunResult[]): string[] {
  const recommendations: string[] = [];

  if (scenarios.length === 0) {
    recommendations.push('Import PyRIT scenarios using the import API to enable GenAI security evaluation.');
  }

  if (results.length === 0 && scenarios.length > 0) {
    recommendations.push('Run PyRIT scenarios against configured Workers to measure GenAI security awareness.');
  }

  const passedResults = results.filter((r) => r.passed);
  const passRate = results.length > 0 ? (passedResults.length / results.length) * 100 : 0;

  if (passRate < 50 && results.length >= 5) {
    recommendations.push('Pass rate is below 50%. Review Worker envelope and Tool Gateway configuration.');
  }

  if (scenarios.filter((s) => s.status === 'imported').length > 10) {
    recommendations.push('Many scenarios are still in imported status. Test and adapt them to AgentRed patterns.');
  }

  return recommendations;
}

function extractStrengths(results: PyritScenarioRunResult[]): string[] {
  const strengths: string[] = [];
  const passRate = (results.filter((r) => r.passed).length / results.length) * 100;

  if (passRate >= 80) {
    strengths.push(`High pass rate: ${Math.round(passRate)}%`);
  }

  const avgRefusals = results.reduce((sum, r) => sum + r.taskResults.refusals, 0) / results.length;
  if (avgRefusals > 0.5) {
    strengths.push('Appropriately refuses risky operations');
  }

  const evidenceRate =
    results.reduce((sum, r) => sum + (r.taskResults.evidenceProduced > 0 ? 1 : 0), 0) / results.length;
  if (evidenceRate >= 0.7) {
    strengths.push('Consistently produces evidence');
  }

  return strengths;
}

function extractGaps(results: PyritScenarioRunResult[]): string[] {
  const allGaps = results.flatMap((r) => r.gaps);
  const gapCounts = new Map<string, number>();

  for (const gap of allGaps) {
    gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
  }

  return Array.from(gapCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([gap]) => gap);
}

function extractCommonGaps(results: PyritScenarioRunResult[]): string[] {
  return extractGaps(results).slice(0, 3);
}

function generateNextActions(
  results: PyritScenarioRunResult[],
  workerComparison: PyritScenarioEvaluationReport['workerComparison'],
  categoryInsights: PyritScenarioEvaluationReport['categoryInsights']
): string[] {
  const actions: string[] = [];

  if (results.length === 0) {
    actions.push('Run PyRIT scenarios to establish Worker quality baseline.');
    return actions;
  }

  const passRate = (results.filter((r) => r.passed).length / results.length) * 100;
  if (passRate < 60) {
    actions.push('Pass rate is below 60%. Review Tool Gateway configuration and Worker envelope.');
  }

  const weakWorkers = workerComparison.filter((w) => w.passRate < 50);
  for (const worker of weakWorkers.slice(0, 2)) {
    if (worker.gaps.length > 0) {
      actions.push(`${worker.workerName}: address ${worker.gaps[0]}`);
    }
  }

  const weakCategories = categoryInsights.filter((c) => c.passRate < 50);
  for (const category of weakCategories.slice(0, 2)) {
    if (category.commonGaps.length > 0) {
      actions.push(`${category.category}: improve ${category.commonGaps[0]}`);
    }
  }

  if (actions.length === 0) {
    actions.push('Continue running PyRIT scenarios to maintain evaluation coverage.');
  }

  return actions.slice(0, 6);
}
