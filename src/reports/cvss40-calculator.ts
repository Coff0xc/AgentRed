import type { Cvss40Vector, Cvss40Score } from '../domain/types.js';

/**
 * CVSS 4.0 Base Score Calculator
 * Based on CVSS v4.0 specification from FIRST.org
 * https://www.first.org/cvss/v4.0/specification-document
 */

export class Cvss40Calculator {
  /**
   * Generate CVSS 4.0 vector string from vector components
   */
  static vectorToString(vector: Cvss40Vector): string {
    return `CVSS:4.0/AV:${vector.AV}/AC:${vector.AC}/AT:${vector.AT}/PR:${vector.PR}/UI:${vector.UI}/VC:${vector.VC}/VI:${vector.VI}/VA:${vector.VA}/SC:${vector.SC}/SI:${vector.SI}/SA:${vector.SA}`;
  }

  /**
   * Parse CVSS 4.0 vector string into components
   */
  static parseVector(vectorString: string): Cvss40Vector | null {
    const parts = vectorString.split('/');
    if (parts[0] !== 'CVSS:4.0') {
      return null;
    }

    const metrics: Record<string, string> = {};
    for (let i = 1; i < parts.length; i++) {
      const [key, value] = parts[i].split(':');
      if (key && value) {
        metrics[key] = value;
      }
    }

    // Validate all required metrics are present
    const required = ['AV', 'AC', 'AT', 'PR', 'UI', 'VC', 'VI', 'VA', 'SC', 'SI', 'SA'];
    for (const key of required) {
      if (!metrics[key]) {
        return null;
      }
    }

    return {
      AV: metrics.AV as Cvss40Vector['AV'],
      AC: metrics.AC as Cvss40Vector['AC'],
      AT: metrics.AT as Cvss40Vector['AT'],
      PR: metrics.PR as Cvss40Vector['PR'],
      UI: metrics.UI as Cvss40Vector['UI'],
      VC: metrics.VC as Cvss40Vector['VC'],
      VI: metrics.VI as Cvss40Vector['VI'],
      VA: metrics.VA as Cvss40Vector['VA'],
      SC: metrics.SC as Cvss40Vector['SC'],
      SI: metrics.SI as Cvss40Vector['SI'],
      SA: metrics.SA as Cvss40Vector['SA'],
    };
  }

  /**
   * Calculate CVSS 4.0 base score from vector
   * This is a simplified implementation based on the CVSS 4.0 specification
   */
  static calculate(vector: Cvss40Vector): Cvss40Score {
    const vectorString = this.vectorToString(vector);

    // Simplified scoring logic based on CVSS 4.0 macrovector approach
    // Real implementation would use the full lookup tables from the specification

    // Exploitability metrics (inverse scale: higher value = easier to exploit)
    const avScore = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[vector.AV];
    const acScore = { L: 0.77, H: 0.44 }[vector.AC];
    const atScore = { N: 0.85, P: 0.62 }[vector.AT];
    const prScore = { N: 0.85, L: 0.62, H: 0.27 }[vector.PR];
    const uiScore = { N: 0.85, P: 0.62, A: 0.54 }[vector.UI];

    // Impact scores for vulnerable system
    const vcScore = { N: 0.0, L: 0.22, H: 0.56 }[vector.VC];
    const viScore = { N: 0.0, L: 0.22, H: 0.56 }[vector.VI];
    const vaScore = { N: 0.0, L: 0.22, H: 0.56 }[vector.VA];

    // Impact scores for subsequent system
    const scScore = { N: 0.0, L: 0.22, H: 0.56 }[vector.SC];
    const siScore = { N: 0.0, L: 0.22, H: 0.56 }[vector.SI];
    const saScore = { N: 0.0, L: 0.22, H: 0.56 }[vector.SA];

    // Exploitability subscore
    const exploitability = 8.22 * avScore * acScore * atScore * prScore * uiScore;

    // Impact calculation (vulnerable system)
    const impactVuln = 1 - (1 - vcScore) * (1 - viScore) * (1 - vaScore);

    // Impact calculation (subsequent system)
    const impactSub = 1 - (1 - scScore) * (1 - siScore) * (1 - saScore);

    // Combined impact (with scope change consideration)
    const scopeChanged = impactSub > 0;
    const impact = scopeChanged
      ? 7.52 * (impactVuln - 0.029) - 3.25 * Math.pow(impactVuln - 0.02, 15) + 6 * impactSub
      : 6.42 * impactVuln;

    // Base score calculation
    let baseScore: number;
    if (impact <= 0) {
      baseScore = 0;
    } else {
      if (scopeChanged) {
        baseScore = Math.min(10, 1.08 * (impact + exploitability));
      } else {
        baseScore = Math.min(10, impact + exploitability);
      }
    }

    // Round up to one decimal place
    baseScore = Math.ceil(baseScore * 10) / 10;

    // Determine severity rating
    let baseSeverity: Cvss40Score['baseSeverity'];
    if (baseScore === 0.0) {
      baseSeverity = 'NONE';
    } else if (baseScore < 4.0) {
      baseSeverity = 'LOW';
    } else if (baseScore < 7.0) {
      baseSeverity = 'MEDIUM';
    } else if (baseScore < 9.0) {
      baseSeverity = 'HIGH';
    } else {
      baseSeverity = 'CRITICAL';
    }

    return {
      vector,
      vectorString,
      baseScore,
      baseSeverity,
    };
  }

  /**
   * Validate CVSS 4.0 vector components
   */
  static validate(vector: Cvss40Vector): boolean {
    const validValues = {
      AV: ['N', 'A', 'L', 'P'],
      AC: ['L', 'H'],
      AT: ['N', 'P'],
      PR: ['N', 'L', 'H'],
      UI: ['N', 'P', 'A'],
      VC: ['N', 'L', 'H'],
      VI: ['N', 'L', 'H'],
      VA: ['N', 'L', 'H'],
      SC: ['N', 'L', 'H'],
      SI: ['N', 'L', 'H'],
      SA: ['N', 'L', 'H'],
    };

    for (const [key, value] of Object.entries(vector)) {
      if (!validValues[key as keyof typeof validValues]?.includes(value)) {
        return false;
      }
    }

    return true;
  }
}
