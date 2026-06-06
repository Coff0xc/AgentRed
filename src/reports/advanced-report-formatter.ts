import type { Finding, Severity, GraphSnapshot } from '../domain/types.js';

/**
 * Advanced Report Formatter with Executive Summary, CVSS 4.0, and ATT&CK mappings
 */
export class AdvancedReportFormatter {
  /**
   * Generate executive summary section
   */
  static generateExecutiveSummary(snapshot: GraphSnapshot, findings: Finding[]): string {
    const confirmedFindings = findings.filter((f) => f.validationState === 'confirmed');
    const criticalCount = confirmedFindings.filter((f) => f.severity === 'critical').length;
    const highCount = confirmedFindings.filter((f) => f.severity === 'high').length;
    const mediumCount = confirmedFindings.filter((f) => f.severity === 'medium').length;
    const lowCount = confirmedFindings.filter((f) => f.severity === 'low').length;
    const infoCount = confirmedFindings.filter((f) => f.severity === 'info').length;

    const totalFindings = confirmedFindings.length;
    const highOrCritical = criticalCount + highCount;

    // Risk level assessment
    let riskLevel: string;
    let riskDescription: string;

    if (criticalCount > 0) {
      riskLevel = 'CRITICAL';
      riskDescription = 'immediate remediation required';
    } else if (highCount > 2) {
      riskLevel = 'HIGH';
      riskDescription = 'urgent attention needed';
    } else if (highCount > 0 || mediumCount > 2) {
      riskLevel = 'MEDIUM';
      riskDescription = 'should be addressed in near term';
    } else if (mediumCount > 0 || lowCount > 0) {
      riskLevel = 'LOW';
      riskDescription = 'minimal security concerns identified';
    } else {
      riskLevel = 'INFORMATIONAL';
      riskDescription = 'no significant security issues identified';
    }

    // Unique ATT&CK tactics
    const attackTactics = new Set<string>();
    for (const finding of confirmedFindings) {
      if (finding.attackMappings) {
        for (const mapping of finding.attackMappings) {
          attackTactics.add(mapping.tactic);
        }
      }
    }

    // Top CVEs/CWEs
    const cweIds = new Set<string>();
    for (const finding of confirmedFindings) {
      if (finding.cweIds) {
        for (const cweId of finding.cweIds) {
          cweIds.add(cweId);
        }
      }
    }

    const lines: string[] = [
      '## Executive Summary',
      '',
      `This security assessment of **${snapshot.run.target}** identified **${totalFindings} confirmed security finding${totalFindings !== 1 ? 's' : ''}**.`,
      '',
      '### Risk Profile',
      '',
      `**Overall Risk Level**: ${riskLevel} (${riskDescription})`,
      '',
      '**Finding Distribution**:',
      `- Critical: ${criticalCount}`,
      `- High: ${highCount}`,
      `- Medium: ${mediumCount}`,
      `- Low: ${lowCount}`,
      `- Informational: ${infoCount}`,
      '',
    ];

    if (highOrCritical > 0) {
      lines.push(
        `⚠️  **${highOrCritical} high or critical severity finding${highOrCritical !== 1 ? 's' : ''} require${highOrCritical === 1 ? 's' : ''} immediate attention.**`,
        '',
      );
    }

    if (attackTactics.size > 0) {
      lines.push(
        '### Attack Surface',
        '',
        `The identified vulnerabilities span **${attackTactics.size} MITRE ATT&CK tactic${attackTactics.size !== 1 ? 's' : ''}**: ${Array.from(attackTactics).sort().join(', ')}.`,
        '',
      );
    }

    if (cweIds.size > 0) {
      lines.push(`**Vulnerability Classes**: ${Array.from(cweIds).sort().slice(0, 5).join(', ')}${cweIds.size > 5 ? ', ...' : ''}`, '');
    }

    lines.push(
      '### Testing Scope',
      '',
      `**Goal**: ${snapshot.run.goal}`,
      `**Authorized Assets**: ${snapshot.run.scopePolicy.allowedAssets.join(', ')}`,
      `**Evidence Collected**: ${snapshot.evidence.length} item${snapshot.evidence.length !== 1 ? 's' : ''}`,
      '',
    );

    return lines.join('\n');
  }

  /**
   * Format a single finding with enhanced metadata
   */
  static formatEnhancedFinding(finding: Finding, index: number): string {
    const lines: string[] = [
      `### Finding ${index}: ${finding.title}`,
      '',
      `**Severity**: ${finding.severity.toUpperCase()}`,
      `**Confidence**: ${finding.confidence}`,
      `**Validation**: ${finding.validationState}`,
    ];

    // CVSS 4.0 score
    if (finding.cvss40) {
      lines.push(
        `**CVSS 4.0**: ${finding.cvss40.baseScore} (${finding.cvss40.baseSeverity})`,
        `**CVSS Vector**: \`${finding.cvss40.vectorString}\``,
      );
    }

    lines.push(`**Affected Assets**: ${finding.affectedAssets.join(', ')}`, '');

    // CWE mappings
    if (finding.cweIds && finding.cweIds.length > 0) {
      lines.push(`**CWE**: ${finding.cweIds.join(', ')}`, '');
    }

    // ATT&CK mappings
    if (finding.attackMappings && finding.attackMappings.length > 0) {
      lines.push('**MITRE ATT&CK Mapping**:', '');
      for (const mapping of finding.attackMappings) {
        lines.push(`- **${mapping.techniqueId}**: ${mapping.techniqueName} (${mapping.tactic})`);
      }
      lines.push('');
    }

    // Impact
    lines.push('#### Impact', '', finding.impact, '');

    // Reproduction steps
    lines.push('#### Reproduction Steps', '');
    finding.reproSteps.forEach((step, idx) => {
      lines.push(`${idx + 1}. ${step}`);
    });
    lines.push('');

    // Remediation
    lines.push('#### Remediation', '', finding.remediation, '');

    // Evidence references
    lines.push(`**Evidence**: ${finding.evidenceIds.join(', ')}`, '');

    return lines.join('\n');
  }

  /**
   * Generate severity distribution chart (ASCII)
   */
  static generateSeverityChart(findings: Finding[]): string {
    const counts = {
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length,
      info: findings.filter((f) => f.severity === 'info').length,
    };

    const total = findings.length;
    if (total === 0) {
      return 'No findings to display.';
    }

    const maxCount = Math.max(...Object.values(counts));
    const scale = maxCount > 0 ? 40 / maxCount : 1;

    const lines: string[] = ['```', 'Severity Distribution', ''];

    for (const [severity, count] of Object.entries(counts)) {
      const barLength = Math.round(count * scale);
      const bar = '█'.repeat(barLength);
      const percentage = ((count / total) * 100).toFixed(1);
      lines.push(`${severity.padEnd(10)} ${bar} ${count} (${percentage}%)`);
    }

    lines.push('```', '');
    return lines.join('\n');
  }

  /**
   * Generate ATT&CK matrix coverage
   */
  static generateAttackMatrix(findings: Finding[]): string {
    const tacticTechniques = new Map<string, Set<string>>();

    for (const finding of findings) {
      if (finding.attackMappings) {
        for (const mapping of finding.attackMappings) {
          if (!tacticTechniques.has(mapping.tactic)) {
            tacticTechniques.set(mapping.tactic, new Set());
          }
          tacticTechniques.get(mapping.tactic)!.add(`${mapping.techniqueId}: ${mapping.techniqueName}`);
        }
      }
    }

    if (tacticTechniques.size === 0) {
      return '';
    }

    const lines: string[] = ['## ATT&CK Coverage', '', 'The following MITRE ATT&CK techniques were observed:', ''];

    const sortedTactics = Array.from(tacticTechniques.keys()).sort();
    for (const tactic of sortedTactics) {
      const techniques = Array.from(tacticTechniques.get(tactic)!).sort();
      lines.push(`### ${tactic}`, '');
      for (const technique of techniques) {
        lines.push(`- ${technique}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate risk summary table
   */
  static generateRiskSummary(findings: Finding[]): string {
    const lines: string[] = [
      '## Risk Summary',
      '',
      '| Finding | Severity | CVSS 4.0 | Validation | Affected Assets |',
      '|---------|----------|----------|------------|-----------------|',
    ];

    for (const finding of findings) {
      const cvssScore = finding.cvss40 ? finding.cvss40.baseScore.toFixed(1) : 'N/A';
      const assets = finding.affectedAssets.slice(0, 2).join(', ') + (finding.affectedAssets.length > 2 ? '...' : '');
      lines.push(
        `| ${finding.title.slice(0, 40)}${finding.title.length > 40 ? '...' : ''} | ${finding.severity} | ${cvssScore} | ${finding.validationState} | ${assets} |`,
      );
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Sort findings by severity and CVSS score
   */
  static sortFindingsBySeverity(findings: Finding[]): Finding[] {
    const severityOrder: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    return findings.slice().sort((a, b) => {
      // Primary sort: severity
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }

      // Secondary sort: CVSS score (higher first)
      const aScore = a.cvss40?.baseScore ?? 0;
      const bScore = b.cvss40?.baseScore ?? 0;
      if (aScore !== bScore) {
        return bScore - aScore;
      }

      // Tertiary sort: title
      return a.title.localeCompare(b.title);
    });
  }
}
