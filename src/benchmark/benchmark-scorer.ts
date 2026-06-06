import type { Finding, Evidence, Run } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import type { BenchmarkScenario, BenchmarkResult, BenchmarkEvidenceQuality } from './benchmark-suite.js';

export class BenchmarkScorerService {
  constructor(private readonly store: PlatformStore) {}

  async scoreRun(runId: string, scenario: BenchmarkScenario, startTime: string): Promise<BenchmarkResult> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const findings = Object.values(this.store.state.findings).filter((f) => f.runId === runId);
    const confirmedFindings = findings.filter((f) => f.validationState === 'confirmed');
    const evidence = Object.values(this.store.state.evidence).filter((e) => e.runId === runId);

    // Calculate duration
    const endTime = new Date();
    const start = new Date(startTime);
    const durationSeconds = Math.floor((endTime.getTime() - start.getTime()) / 1000);

    // Match findings to expected findings
    const { matched, unmatched, falsePositives } = this.matchFindings(confirmedFindings, scenario.expectedFindings);

    const findingsFound = matched.length;
    const findingsMissed = unmatched.length;
    const expectedFindings = scenario.expectedFindings.length;

    // Calculate metrics
    const recall = expectedFindings > 0 ? findingsFound / expectedFindings : 0;
    const precision = confirmedFindings.length > 0 ? findingsFound / confirmedFindings.length : 0;
    const f1Score = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;

    // Evaluate evidence quality
    const evidenceQuality = this.evaluateEvidenceQuality(matched, evidence, scenario);

    // Calculate overall score (0-100)
    const score = this.calculateOverallScore({
      recall,
      precision,
      f1Score,
      evidenceQuality,
      durationSeconds,
      maxTimeSeconds: scenario.successCriteria.maxTimeSeconds,
      falsePositives: falsePositives.length,
      maxFalsePositives: scenario.successCriteria.maxFalsePositives,
    });

    // Build detailed results
    const expectedNotFound = unmatched.map((exp) => exp.title);
    const unexpectedFindings = falsePositives.map((f) => f.title);
    const evidenceIssues = this.identifyEvidenceIssues(matched, evidence, scenario);
    const timeoutExceeded = durationSeconds > scenario.successCriteria.maxTimeSeconds;

    return {
      scenarioId: scenario.id,
      runId,
      score,
      findingsFound,
      findingsMissed,
      falsePositives: falsePositives.length,
      evidenceQuality,
      durationSeconds,
      expectedFindings,
      confirmedFindings: confirmedFindings.length,
      recall,
      precision,
      f1Score,
      details: {
        expectedNotFound,
        unexpectedFindings,
        evidenceIssues,
        timeoutExceeded,
      },
    };
  }

  private matchFindings(
    actualFindings: Finding[],
    expectedFindings: BenchmarkScenario['expectedFindings'],
  ): {
    matched: Array<{ finding: Finding; expected: (typeof expectedFindings)[number] }>;
    unmatched: (typeof expectedFindings)[number][];
    falsePositives: Finding[];
  } {
    const matched: Array<{ finding: Finding; expected: (typeof expectedFindings)[number] }> = [];
    const unmatched: (typeof expectedFindings)[number][] = [];
    const matchedFindingIds = new Set<string>();

    // Try to match each expected finding with actual findings
    for (const expected of expectedFindings) {
      const match = actualFindings.find(
        (finding) =>
          !matchedFindingIds.has(finding.id) &&
          this.findingMatchesExpected(finding, expected),
      );

      if (match) {
        matched.push({ finding: match, expected });
        matchedFindingIds.add(match.id);
      } else {
        unmatched.push(expected);
      }
    }

    // Remaining findings are false positives
    const falsePositives = actualFindings.filter((f) => !matchedFindingIds.has(f.id));

    return { matched, unmatched, falsePositives };
  }

  private findingMatchesExpected(
    finding: Finding,
    expected: BenchmarkScenario['expectedFindings'][number],
  ): boolean {
    // Match by severity
    if (finding.severity !== expected.severity) {
      // Allow one severity level difference
      const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
      const actualIndex = severityOrder.indexOf(finding.severity);
      const expectedIndex = severityOrder.indexOf(expected.severity);
      if (Math.abs(actualIndex - expectedIndex) > 1) {
        return false;
      }
    }

    // Match by title keywords
    const titleKeywords = expected.title.toLowerCase().split(/\s+/);
    const findingTitleLower = finding.title.toLowerCase();
    const matchedKeywords = titleKeywords.filter((keyword) => findingTitleLower.includes(keyword));

    // At least 50% of keywords should match
    return matchedKeywords.length >= titleKeywords.length * 0.5;
  }

  private evaluateEvidenceQuality(
    matched: Array<{ finding: Finding; expected: BenchmarkScenario['expectedFindings'][number] }>,
    evidence: Evidence[],
    scenario: BenchmarkScenario,
  ): BenchmarkEvidenceQuality {
    if (matched.length === 0) {
      return 'poor';
    }

    let totalScore = 0;
    let maxScore = 0;

    for (const { finding, expected } of matched) {
      const findingEvidence = evidence.filter((e) => finding.evidenceIds.includes(e.id));

      // Check if all required evidence types are present
      const hasAllRequiredEvidence = expected.mustHaveEvidence.every((requiredKind) =>
        findingEvidence.some((e) => e.kind === requiredKind),
      );

      if (hasAllRequiredEvidence) {
        totalScore += 10;
      } else {
        const presentCount = expected.mustHaveEvidence.filter((requiredKind) =>
          findingEvidence.some((e) => e.kind === requiredKind),
        ).length;
        totalScore += (presentCount / expected.mustHaveEvidence.length) * 10;
      }

      // Check evidence completeness (hash, redaction state, content)
      for (const ev of findingEvidence) {
        if (ev.sha256) {
          totalScore += 2;
        }
        if (ev.redactionState !== 'raw_local_only') {
          totalScore += 1;
        }
      }

      maxScore += 10 + findingEvidence.length * 3;
    }

    if (maxScore === 0) {
      return 'poor';
    }

    const qualityRatio = totalScore / maxScore;

    if (qualityRatio >= 0.85) return 'excellent';
    if (qualityRatio >= 0.65) return 'good';
    if (qualityRatio >= 0.45) return 'fair';
    return 'poor';
  }

  private identifyEvidenceIssues(
    matched: Array<{ finding: Finding; expected: BenchmarkScenario['expectedFindings'][number] }>,
    evidence: Evidence[],
    scenario: BenchmarkScenario,
  ): string[] {
    const issues: string[] = [];

    for (const { finding, expected } of matched) {
      const findingEvidence = evidence.filter((e) => finding.evidenceIds.includes(e.id));

      if (findingEvidence.length === 0) {
        issues.push(`Finding "${finding.title}" has no linked evidence`);
        continue;
      }

      // Check for missing required evidence types
      for (const requiredKind of expected.mustHaveEvidence) {
        if (!findingEvidence.some((e) => e.kind === requiredKind)) {
          issues.push(`Finding "${finding.title}" missing required evidence type: ${requiredKind}`);
        }
      }

      // Check evidence completeness
      for (const ev of findingEvidence) {
        if (!ev.sha256) {
          issues.push(`Evidence ${ev.id} for finding "${finding.title}" has no content hash`);
        }
      }
    }

    return issues;
  }

  private calculateOverallScore(params: {
    recall: number;
    precision: number;
    f1Score: number;
    evidenceQuality: BenchmarkEvidenceQuality;
    durationSeconds: number;
    maxTimeSeconds: number;
    falsePositives: number;
    maxFalsePositives: number;
  }): number {
    // Base score from F1 (0-40 points)
    const f1Component = params.f1Score * 40;

    // Recall bonus (0-20 points)
    const recallComponent = params.recall * 20;

    // Precision bonus (0-15 points)
    const precisionComponent = params.precision * 15;

    // Evidence quality (0-15 points)
    const evidenceQualityMap: Record<BenchmarkEvidenceQuality, number> = {
      excellent: 15,
      good: 12,
      fair: 8,
      poor: 3,
    };
    const evidenceComponent = evidenceQualityMap[params.evidenceQuality];

    // Time efficiency (0-10 points)
    const timeRatio = params.maxTimeSeconds > 0 ? params.durationSeconds / params.maxTimeSeconds : 1;
    const timeComponent = timeRatio <= 0.5 ? 10 : timeRatio <= 0.75 ? 7 : timeRatio <= 1.0 ? 5 : 0;

    // False positive penalty (subtract up to 15 points)
    const fpPenalty = Math.min(params.falsePositives * 5, 15);

    const totalScore = f1Component + recallComponent + precisionComponent + evidenceComponent + timeComponent - fpPenalty;

    return Math.max(0, Math.min(100, Math.round(totalScore)));
  }
}
