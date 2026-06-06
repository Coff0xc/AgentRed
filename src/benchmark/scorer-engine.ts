/**
 * Scorer engine - calculates scores and grades for benchmark results
 */

import type {
  BenchmarkResult,
  BenchmarkScore,
  ScoreBreakdown,
  ScoreComparison,
  BenchmarkGrade,
} from './types.js';

export class ScorerEngine {
  /**
   * Calculate detailed score for a benchmark result
   */
  async score(result: BenchmarkResult): Promise<BenchmarkScore> {
    const breakdown = this.calculateBreakdown(result);
    const overallScore = this.calculateOverallScore(breakdown);
    const grade = this.calculateGrade(overallScore);

    // TODO: Implement persistence to get historical comparison
    const comparison: ScoreComparison = {};

    const recommendations = this.generateRecommendations(result, breakdown);

    return {
      resultId: result.benchmarkId,
      overallScore,
      breakdown,
      grade,
      comparison,
      recommendations,
    };
  }

  /**
   * Quick score calculation without full breakdown (for summaries)
   */
  quickScore(result: BenchmarkResult): number {
    const breakdown = this.calculateBreakdown(result);
    return this.calculateOverallScore(breakdown);
  }

  // ===== Private Methods =====

  private calculateBreakdown(result: BenchmarkResult): ScoreBreakdown {
    // Coverage score (40% weight)
    const coverageScore = result.coverage.coveragePercent;

    // Accuracy score (30% weight)
    const accuracyScore = this.calculateAccuracyScore(result);

    // Evidence quality score (20% weight)
    const evidenceQualityScore = this.calculateEvidenceQualityScore(result);

    // Efficiency score (10% weight)
    const efficiencyScore = this.calculateEfficiencyScore(result);

    return {
      coverage: { score: coverageScore, weight: 0.4 },
      accuracy: { score: accuracyScore, weight: 0.3 },
      evidenceQuality: { score: evidenceQualityScore, weight: 0.2 },
      efficiency: { score: efficiencyScore, weight: 0.1 },
    };
  }

  private calculateAccuracyScore(result: BenchmarkResult): number {
    // Use F1 score as the accuracy metric (balanced precision and recall)
    return result.accuracy.f1Score * 100;
  }

  private calculateEvidenceQualityScore(result: BenchmarkResult): number {
    const { qualityDistribution, total } = result.evidence;

    if (total === 0) return 0;

    // Weighted scoring: excellent=100, good=75, basic=50, poor=25
    const weightedSum =
      qualityDistribution.excellent * 100 +
      qualityDistribution.good * 75 +
      qualityDistribution.basic * 50 +
      qualityDistribution.poor * 25;

    return weightedSum / total;
  }

  private calculateEfficiencyScore(result: BenchmarkResult): number {
    // Score based on how quickly the scenario was completed
    // Lower duration = higher score
    // Assume baseline is 300 seconds (5 minutes)
    const baselineDuration = 300;
    const actualDuration = result.duration.executionSeconds;

    if (actualDuration <= baselineDuration / 2) {
      return 100; // Very fast
    } else if (actualDuration <= baselineDuration) {
      return 80; // Good speed
    } else if (actualDuration <= baselineDuration * 1.5) {
      return 60; // Acceptable
    } else if (actualDuration <= baselineDuration * 2) {
      return 40; // Slow
    } else {
      return 20; // Very slow
    }
  }

  private calculateOverallScore(breakdown: ScoreBreakdown): number {
    return (
      breakdown.coverage.score * breakdown.coverage.weight +
      breakdown.accuracy.score * breakdown.accuracy.weight +
      breakdown.evidenceQuality.score * breakdown.evidenceQuality.weight +
      breakdown.efficiency.score * breakdown.efficiency.weight
    );
  }

  private calculateGrade(score: number): BenchmarkGrade {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private generateRecommendations(result: BenchmarkResult, breakdown: ScoreBreakdown): string[] {
    const recommendations: string[] = [];

    // Coverage recommendations
    if (breakdown.coverage.score < 80) {
      recommendations.push(
        `Improve coverage: Only ${result.coverage.expectedFindingsFound}/${result.coverage.expectedFindingsTotal} expected findings were discovered. Review Worker's exploration strategy.`
      );
    }

    // Accuracy recommendations
    if (breakdown.accuracy.score < 70) {
      if (result.accuracy.falsePositives > 0) {
        recommendations.push(
          `Reduce false positives: ${result.accuracy.falsePositives} findings were incorrectly identified. Improve validation logic.`
        );
      }
      if (result.accuracy.falseNegatives > 0) {
        recommendations.push(
          `Reduce false negatives: ${result.accuracy.falseNegatives} expected findings were missed. Expand search patterns.`
        );
      }
    }

    // Evidence quality recommendations
    if (breakdown.evidenceQuality.score < 70) {
      const poorEvidence = result.evidence.qualityDistribution.poor;
      if (poorEvidence > 0) {
        recommendations.push(
          `Improve evidence quality: ${poorEvidence} pieces of poor-quality evidence collected. Ensure HTTP exchanges, screenshots, and command outputs are captured.`
        );
      }
    }

    // Efficiency recommendations
    if (breakdown.efficiency.score < 60) {
      recommendations.push(
        `Improve execution speed: Scenario took ${result.duration.executionSeconds.toFixed(0)}s. Optimize tool selection and reduce redundant probes.`
      );
    }

    // General recommendation if passed
    if (result.passed && recommendations.length === 0) {
      recommendations.push('Excellent performance! All criteria met with high quality.');
    }

    return recommendations;
  }
}
