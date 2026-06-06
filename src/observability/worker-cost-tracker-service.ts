import { nowIso } from '../domain/ids.js';
import type { CostLedgerEntry, TraceSpan } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';

export interface WorkerCostBreakdown {
  worker: string;
  runId: string;
  totalEstimatedUsd: number;
  tokenCost: number;
  runtimeCost: number;
  requestCount: number;
  tokenCount: number;
  runtimeMs: number;
  costPerTask: number;
  costPerToken: number;
  entries: CostLedgerEntry[];
}

export interface WorkerCostComparison {
  worker: string;
  baseline: {
    avgCostPerTask: number;
    avgTokensPerTask: number;
    avgRuntimeMs: number;
    tasks: number;
  };
  current: {
    avgCostPerTask: number;
    avgTokensPerTask: number;
    avgRuntimeMs: number;
    tasks: number;
  };
  regression: {
    costIncreasePct: number;
    tokenIncreasePct: number;
    runtimeIncreasePct: number;
    isRegression: boolean;
    severity: 'none' | 'minor' | 'moderate' | 'severe';
  };
}

export interface WorkerCostReport {
  runId: string;
  generatedAt: string;
  totalEstimatedUsd: number;
  workerBreakdowns: WorkerCostBreakdown[];
  costEfficiencyRanking: Array<{
    worker: string;
    score: number;
    reason: string;
  }>;
  recommendations: string[];
}

export interface WorkerQualityRegression {
  worker: string;
  generatedAt: string;
  baselinePeriod: {
    startedAt: string;
    endedAt: string;
    tasks: number;
    successRate: number;
    avgCostPerTask: number;
    avgTokensPerTask: number;
    evidencePerTask: number;
  };
  currentPeriod: {
    startedAt: string;
    endedAt: string;
    tasks: number;
    successRate: number;
    avgCostPerTask: number;
    avgTokensPerTask: number;
    evidencePerTask: number;
  };
  regressions: Array<{
    metric: string;
    baselineValue: number;
    currentValue: number;
    changePct: number;
    severity: 'minor' | 'moderate' | 'severe';
    threshold: number;
  }>;
  isRegressed: boolean;
  overallSeverity: 'none' | 'minor' | 'moderate' | 'severe';
  recommendation: string;
}

/**
 * Worker Cost Tracker Service
 *
 * Tracks detailed cost metrics per worker and detects quality regressions.
 * Part of P2-7: Cost optimization and quality scoring.
 */
export class WorkerCostTrackerService {
  constructor(private readonly store: PlatformStore) {}

  /**
   * Get detailed cost breakdown for all workers in a run
   */
  getRunCostReport(runId: string): WorkerCostReport {
    this.assertRun(runId);

    const costs = Object.values(this.store.state.costLedger).filter(
      (cost) => cost.runId === runId && cost.source === 'worker'
    );
    const spans = Object.values(this.store.state.traceSpans).filter(
      (span) => span.runId === runId && span.kind === 'worker'
    );

    const workerBreakdowns = this.buildWorkerBreakdowns(runId, costs, spans);
    const totalEstimatedUsd = workerBreakdowns.reduce((sum, wb) => sum + wb.totalEstimatedUsd, 0);
    const costEfficiencyRanking = this.rankCostEfficiency(workerBreakdowns, spans);
    const recommendations = this.generateCostRecommendations(workerBreakdowns, costEfficiencyRanking);

    return {
      runId,
      generatedAt: nowIso(),
      totalEstimatedUsd: roundMoney(totalEstimatedUsd),
      workerBreakdowns,
      costEfficiencyRanking,
      recommendations,
    };
  }

  /**
   * Get cost breakdown for a specific worker in a run
   */
  getWorkerCostBreakdown(runId: string, workerName: string): WorkerCostBreakdown | null {
    this.assertRun(runId);

    const costs = Object.values(this.store.state.costLedger).filter(
      (cost) => cost.runId === runId && cost.source === 'worker' && cost.worker === workerName
    );
    const spans = Object.values(this.store.state.traceSpans).filter(
      (span) => span.runId === runId && span.kind === 'worker' && this.getWorkerName(span) === workerName
    );

    if (costs.length === 0 && spans.length === 0) {
      return null;
    }

    return this.buildWorkerBreakdown(runId, workerName, costs, spans);
  }

  /**
   * Detect quality regressions by comparing worker performance across runs
   */
  detectWorkerRegression(workerName: string, baselineRunIds: string[], currentRunIds: string[]): WorkerQualityRegression | null {
    if (baselineRunIds.length === 0 || currentRunIds.length === 0) {
      return null;
    }

    const baselineMetrics = this.aggregateWorkerMetrics(workerName, baselineRunIds);
    const currentMetrics = this.aggregateWorkerMetrics(workerName, currentRunIds);

    if (!baselineMetrics || !currentMetrics) {
      return null;
    }

    const regressions = this.detectRegressions(baselineMetrics, currentMetrics);
    const isRegressed = regressions.length > 0;
    const overallSeverity = this.calculateOverallSeverity(regressions);

    return {
      worker: workerName,
      generatedAt: nowIso(),
      baselinePeriod: baselineMetrics,
      currentPeriod: currentMetrics,
      regressions,
      isRegressed,
      overallSeverity,
      recommendation: this.generateRegressionRecommendation(workerName, regressions, overallSeverity),
    };
  }

  /**
   * Compare worker costs between two time periods
   */
  compareWorkerCosts(workerName: string, baselineRunIds: string[], currentRunIds: string[]): WorkerCostComparison | null {
    if (baselineRunIds.length === 0 || currentRunIds.length === 0) {
      return null;
    }

    const baselineMetrics = this.aggregateWorkerMetrics(workerName, baselineRunIds);
    const currentMetrics = this.aggregateWorkerMetrics(workerName, currentRunIds);

    if (!baselineMetrics || !currentMetrics) {
      return null;
    }

    const costIncreasePct = this.calculateChangePct(baselineMetrics.avgCostPerTask, currentMetrics.avgCostPerTask);
    const tokenIncreasePct = this.calculateChangePct(baselineMetrics.avgTokensPerTask, currentMetrics.avgTokensPerTask);
    const runtimeIncreasePct = this.calculateChangePct(
      baselineMetrics.tasks > 0 ? Number(baselineMetrics.startedAt) / baselineMetrics.tasks : 0,
      currentMetrics.tasks > 0 ? Number(currentMetrics.startedAt) / currentMetrics.tasks : 0
    );

    const isRegression = costIncreasePct > 20 || tokenIncreasePct > 25 || runtimeIncreasePct > 30;
    const severity = this.determineCostRegressionSeverity(costIncreasePct, tokenIncreasePct, runtimeIncreasePct);

    return {
      worker: workerName,
      baseline: {
        avgCostPerTask: baselineMetrics.avgCostPerTask,
        avgTokensPerTask: baselineMetrics.avgTokensPerTask,
        avgRuntimeMs: 0, // Calculated from period
        tasks: baselineMetrics.tasks,
      },
      current: {
        avgCostPerTask: currentMetrics.avgCostPerTask,
        avgTokensPerTask: currentMetrics.avgTokensPerTask,
        avgRuntimeMs: 0,
        tasks: currentMetrics.tasks,
      },
      regression: {
        costIncreasePct,
        tokenIncreasePct,
        runtimeIncreasePct,
        isRegression,
        severity,
      },
    };
  }

  private buildWorkerBreakdowns(runId: string, costs: CostLedgerEntry[], spans: TraceSpan[]): WorkerCostBreakdown[] {
    const workerNames = new Set<string>();
    costs.forEach((cost) => cost.worker && workerNames.add(cost.worker));
    spans.forEach((span) => workerNames.add(this.getWorkerName(span)));

    return Array.from(workerNames)
      .map((worker) => {
        const workerCosts = costs.filter((cost) => cost.worker === worker);
        const workerSpans = spans.filter((span) => this.getWorkerName(span) === worker);
        return this.buildWorkerBreakdown(runId, worker, workerCosts, workerSpans);
      })
      .sort((a, b) => b.totalEstimatedUsd - a.totalEstimatedUsd);
  }

  private buildWorkerBreakdown(runId: string, worker: string, costs: CostLedgerEntry[], spans: TraceSpan[]): WorkerCostBreakdown {
    const tokenCost = costs.filter((c) => c.unit === 'token').reduce((sum, c) => sum + c.estimatedUsd, 0);
    const runtimeCost = costs.filter((c) => c.unit === 'millisecond').reduce((sum, c) => sum + c.estimatedUsd, 0);
    const requestCount = costs.filter((c) => c.unit === 'request').reduce((sum, c) => sum + c.quantity, 0);
    const tokenCount = costs.filter((c) => c.unit === 'token').reduce((sum, c) => sum + c.quantity, 0);
    const runtimeMs = spans.reduce((sum, span) => sum + span.durationMs, 0);
    const totalEstimatedUsd = costs.reduce((sum, c) => sum + c.estimatedUsd, 0);
    const tasks = spans.length;

    return {
      worker,
      runId,
      totalEstimatedUsd: roundMoney(totalEstimatedUsd),
      tokenCost: roundMoney(tokenCost),
      runtimeCost: roundMoney(runtimeCost),
      requestCount,
      tokenCount,
      runtimeMs,
      costPerTask: tasks > 0 ? roundMoney(totalEstimatedUsd / tasks) : 0,
      costPerToken: tokenCount > 0 ? roundMoney(totalEstimatedUsd / tokenCount) : 0,
      entries: costs,
    };
  }

  private rankCostEfficiency(breakdowns: WorkerCostBreakdown[], spans: TraceSpan[]): Array<{ worker: string; score: number; reason: string }> {
    return breakdowns
      .map((breakdown) => {
        const workerSpans = spans.filter((span) => this.getWorkerName(span) === breakdown.worker);
        const successRate = workerSpans.length > 0
          ? workerSpans.filter((span) => span.status === 'ok').length / workerSpans.length
          : 0;

        // Cost efficiency score: balance between low cost and high success rate
        // Score = (successRate * 50) - (costPerTask * 1000) - (tokensPer1000ms * 0.01)
        const costPenalty = breakdown.costPerTask * 1000; // Scale up cost impact
        const tokensPer1000ms = breakdown.runtimeMs > 0 ? (breakdown.tokenCount / breakdown.runtimeMs) * 1000 : 0;
        const tokenPenalty = tokensPer1000ms * 0.01; // Small penalty for high token usage rate

        const score = Math.max(0, Math.min(100, Math.round(successRate * 50 - costPenalty - tokenPenalty + 25)));

        let reason = '';
        if (score >= 80) {
          reason = 'High success rate with low cost per task';
        } else if (score >= 60) {
          reason = 'Balanced cost and success rate';
        } else if (successRate < 0.5) {
          reason = 'Low success rate reducing efficiency';
        } else if (breakdown.costPerTask > 0.01) {
          reason = 'High cost per task reducing efficiency';
        } else {
          reason = 'Needs more tasks for reliable efficiency measurement';
        }

        return { worker: breakdown.worker, score, reason };
      })
      .sort((a, b) => b.score - a.score);
  }

  private generateCostRecommendations(breakdowns: WorkerCostBreakdown[], ranking: Array<{ worker: string; score: number; reason: string }>): string[] {
    const recommendations: string[] = [];

    if (breakdowns.length === 0) {
      return ['No worker cost data available yet.'];
    }

    const totalCost = breakdowns.reduce((sum, b) => sum + b.totalEstimatedUsd, 0);
    const highestCostWorker = breakdowns[0];
    const mostEfficientWorker = ranking[0];

    if (totalCost > 1) {
      recommendations.push(`Total worker cost is $${totalCost.toFixed(4)}. Consider setting cost budgets per run.`);
    }

    if (highestCostWorker && highestCostWorker.totalEstimatedUsd > totalCost * 0.6) {
      recommendations.push(`${highestCostWorker.worker} accounts for ${Math.round((highestCostWorker.totalEstimatedUsd / totalCost) * 100)}% of worker costs.`);
    }

    // Recommend most efficient worker if score is decent and there are multiple workers
    if (mostEfficientWorker && ranking.length > 1 && mostEfficientWorker.score >= 60) {
      recommendations.push(`Prefer ${mostEfficientWorker.worker} for cost-sensitive work (efficiency score: ${mostEfficientWorker.score}/100).`);
    }

    const highCostWorkers = breakdowns.filter((b) => b.costPerTask > 0.05);
    if (highCostWorkers.length > 0) {
      recommendations.push(`${highCostWorkers.map((w) => w.worker).join(', ')} have high cost per task (>${'$'}0.05). Review prompt efficiency.`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Worker costs are within reasonable ranges. Continue monitoring for regressions.');
    }

    return recommendations;
  }

  private aggregateWorkerMetrics(workerName: string, runIds: string[]): WorkerQualityRegression['baselinePeriod'] | null {
    const costs = Object.values(this.store.state.costLedger).filter(
      (cost) => runIds.includes(cost.runId) && cost.source === 'worker' && cost.worker === workerName
    );
    const spans = Object.values(this.store.state.traceSpans).filter(
      (span) => runIds.includes(span.runId) && span.kind === 'worker' && this.getWorkerName(span) === workerName
    );
    const facts = Object.values(this.store.state.facts).filter(
      (fact) => runIds.includes(fact.runId) && fact.createdBy.startsWith(`${workerName}:`)
    );

    if (spans.length === 0) {
      return null;
    }

    const tasks = spans.length;
    const successCount = spans.filter((span) => span.status === 'ok').length;
    const successRate = tasks > 0 ? Math.round((successCount / tasks) * 100) : 0;
    const totalCost = costs.reduce((sum, c) => sum + c.estimatedUsd, 0);
    const totalTokens = costs.filter((c) => c.unit === 'token').reduce((sum, c) => sum + c.quantity, 0);
    const evidenceIds = new Set(facts.flatMap((fact) => fact.evidenceIds));

    const timestamps = spans.map((span) => new Date(span.startedAt).getTime());
    const startedAt = new Date(Math.min(...timestamps)).toISOString();
    const endedAt = new Date(Math.max(...timestamps)).toISOString();

    return {
      startedAt,
      endedAt,
      tasks,
      successRate,
      avgCostPerTask: tasks > 0 ? roundMoney(totalCost / tasks) : 0,
      avgTokensPerTask: tasks > 0 ? Math.round(totalTokens / tasks) : 0,
      evidencePerTask: tasks > 0 ? roundTo2(evidenceIds.size / tasks) : 0,
    };
  }

  private detectRegressions(
    baseline: WorkerQualityRegression['baselinePeriod'],
    current: WorkerQualityRegression['currentPeriod']
  ): WorkerQualityRegression['regressions'] {
    const regressions: WorkerQualityRegression['regressions'] = [];

    // Success rate regression (threshold: -15%)
    const successRateChange = this.calculateChangePct(baseline.successRate, current.successRate);
    if (successRateChange < -15) {
      regressions.push({
        metric: 'success_rate',
        baselineValue: baseline.successRate,
        currentValue: current.successRate,
        changePct: successRateChange,
        severity: successRateChange < -30 ? 'severe' : successRateChange < -20 ? 'moderate' : 'minor',
        threshold: -15,
      });
    }

    // Cost increase regression (threshold: +25%)
    const costChange = this.calculateChangePct(baseline.avgCostPerTask, current.avgCostPerTask);
    if (costChange > 25) {
      regressions.push({
        metric: 'cost_per_task',
        baselineValue: baseline.avgCostPerTask,
        currentValue: current.avgCostPerTask,
        changePct: costChange,
        severity: costChange > 50 ? 'severe' : costChange > 35 ? 'moderate' : 'minor',
        threshold: 25,
      });
    }

    // Token increase regression (threshold: +30%)
    const tokenChange = this.calculateChangePct(baseline.avgTokensPerTask, current.avgTokensPerTask);
    if (tokenChange > 30) {
      regressions.push({
        metric: 'tokens_per_task',
        baselineValue: baseline.avgTokensPerTask,
        currentValue: current.avgTokensPerTask,
        changePct: tokenChange,
        severity: tokenChange > 60 ? 'severe' : tokenChange > 45 ? 'moderate' : 'minor',
        threshold: 30,
      });
    }

    // Evidence productivity regression (threshold: -20%)
    const evidenceChange = this.calculateChangePct(baseline.evidencePerTask, current.evidencePerTask);
    if (evidenceChange < -20) {
      regressions.push({
        metric: 'evidence_per_task',
        baselineValue: baseline.evidencePerTask,
        currentValue: current.evidencePerTask,
        changePct: evidenceChange,
        severity: evidenceChange < -40 ? 'severe' : evidenceChange < -30 ? 'moderate' : 'minor',
        threshold: -20,
      });
    }

    return regressions;
  }

  private calculateOverallSeverity(regressions: WorkerQualityRegression['regressions']): WorkerQualityRegression['overallSeverity'] {
    if (regressions.length === 0) {
      return 'none';
    }

    const severities = regressions.map((r) => r.severity);
    if (severities.includes('severe')) {
      return 'severe';
    }
    if (severities.includes('moderate')) {
      return 'moderate';
    }
    return 'minor';
  }

  private generateRegressionRecommendation(workerName: string, regressions: WorkerQualityRegression['regressions'], severity: WorkerQualityRegression['overallSeverity']): string {
    if (regressions.length === 0) {
      return `${workerName} shows no quality regressions. Continue monitoring.`;
    }

    const metrics = regressions.map((r) => r.metric).join(', ');

    if (severity === 'severe') {
      return `SEVERE regression detected in ${workerName} (${metrics}). Deprioritize until resolved. Review prompt, model version, and context size.`;
    }

    if (severity === 'moderate') {
      return `Moderate regression in ${workerName} (${metrics}). Investigate before assigning high-priority work. Check for prompt drift or model changes.`;
    }

    return `Minor regression in ${workerName} (${metrics}). Monitor closely but continue using for low-risk work.`;
  }

  private calculateChangePct(baseline: number, current: number): number {
    if (baseline === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - baseline) / baseline) * 100);
  }

  private determineCostRegressionSeverity(costPct: number, tokenPct: number, runtimePct: number): WorkerCostComparison['regression']['severity'] {
    if (costPct < 20 && tokenPct < 25 && runtimePct < 30) {
      return 'none';
    }

    const maxIncrease = Math.max(costPct, tokenPct, runtimePct);
    if (maxIncrease > 60) {
      return 'severe';
    }
    if (maxIncrease > 40) {
      return 'moderate';
    }
    return 'minor';
  }

  private getWorkerName(span: TraceSpan): string {
    return typeof span.attributes.worker === 'string' ? span.attributes.worker : span.name.split('.')[0] || 'unknown';
  }

  private assertRun(runId: string): void {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}
