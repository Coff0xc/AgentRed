import type { Finding, Severity } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { DefectDojoClient } from './defectdojo-client.js';
import type { FaradayClient } from './faraday-client.js';
import type { JiraClient } from './jira-client.js';

export type VulnPlatformType = 'defectdojo' | 'faraday' | 'jira';

export interface VulnPlatformConfig {
  type: VulnPlatformType;
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  projectKey?: string;
  engagementId?: string;
  workspaceId?: string;
  enabled: boolean;
}

export interface VulnPlatformExportResult {
  platformType: VulnPlatformType;
  exportedFindings: number;
  platformIssueIds: string[];
  errors: string[];
  exportedAt: string;
}

export interface VulnPlatformFinding {
  title: string;
  severity: Severity;
  description: string;
  affectedAssets: string[];
  reproSteps: string[];
  impact: string;
  remediation: string;
  evidenceIds: string[];
  cwe?: number;
  cvssScore?: number;
}

/**
 * Unified adapter for vulnerability management platform integrations.
 * Supports DefectDojo, Faraday, and Jira with fail-closed semantics.
 */
export class VulnPlatformAdapter {
  constructor(
    private readonly store: PlatformStore,
    private readonly events?: RunEventService,
    private readonly defectDojoClient?: DefectDojoClient,
    private readonly faradayClient?: FaradayClient,
    private readonly jiraClient?: JiraClient,
  ) {}

  /**
   * Export confirmed findings to configured vulnerability platform.
   * Only exports findings in 'confirmed' validation state.
   * Fails closed: any error in export is reported but does not prevent other findings from being exported.
   */
  async exportFindings(runId: string, config: VulnPlatformConfig): Promise<VulnPlatformExportResult> {
    if (!config.enabled) {
      throw new Error('Vulnerability platform integration is not enabled');
    }

    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    // Only export confirmed findings
    const confirmedFindings = Object.values(this.store.state.findings).filter(
      (finding) => finding.runId === runId && finding.validationState === 'confirmed',
    );

    if (confirmedFindings.length === 0) {
      return {
        platformType: config.type,
        exportedFindings: 0,
        platformIssueIds: [],
        errors: [],
        exportedAt: new Date().toISOString(),
      };
    }

    const result: VulnPlatformExportResult = {
      platformType: config.type,
      exportedFindings: 0,
      platformIssueIds: [],
      errors: [],
      exportedAt: new Date().toISOString(),
    };

    for (const finding of confirmedFindings) {
      try {
        const platformFinding = this.transformFinding(finding);
        const issueId = await this.exportSingleFinding(config, platformFinding, runId);
        result.platformIssueIds.push(issueId);
        result.exportedFindings++;

        this.events?.record({
          runId,
          type: 'finding.validated',
          title: 'Finding exported to vulnerability platform',
          detail: `${config.type}: ${finding.title} → ${issueId}`,
          entityId: finding.id,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to export ${finding.id}: ${errorMsg}`);

        this.events?.record({
          runId,
          type: 'finding.validated',
          title: 'Finding export failed',
          detail: `${config.type}: ${finding.title} - ${errorMsg}`,
          level: 'error',
          entityId: finding.id,
        });
      }
    }

    return result;
  }

  /**
   * Test connectivity to vulnerability platform.
   * Returns true if connection is successful, throws error otherwise.
   */
  async testConnection(config: VulnPlatformConfig): Promise<boolean> {
    if (!config.enabled) {
      throw new Error('Vulnerability platform integration is not enabled');
    }

    switch (config.type) {
      case 'defectdojo':
        if (!this.defectDojoClient) {
          throw new Error('DefectDojo client not configured');
        }
        return await this.defectDojoClient.testConnection(config);

      case 'faraday':
        if (!this.faradayClient) {
          throw new Error('Faraday client not configured');
        }
        return await this.faradayClient.testConnection(config);

      case 'jira':
        if (!this.jiraClient) {
          throw new Error('Jira client not configured');
        }
        return await this.jiraClient.testConnection(config);

      default:
        throw new Error(`Unsupported platform type: ${config.type}`);
    }
  }

  /**
   * Get platform-specific export status for a run.
   */
  getExportStatus(runId: string, platformType: VulnPlatformType): {
    totalConfirmed: number;
    exported: number;
    pending: number;
  } {
    const confirmedFindings = Object.values(this.store.state.findings).filter(
      (finding) => finding.runId === runId && finding.validationState === 'confirmed',
    );

    // In a full implementation, we would track export status per finding
    // For now, return basic counts
    return {
      totalConfirmed: confirmedFindings.length,
      exported: 0,
      pending: confirmedFindings.length,
    };
  }

  private transformFinding(finding: Finding): VulnPlatformFinding {
    return {
      title: finding.title,
      severity: finding.severity,
      description: this.buildDescription(finding),
      affectedAssets: finding.affectedAssets,
      reproSteps: finding.reproSteps,
      impact: finding.impact,
      remediation: finding.remediation,
      evidenceIds: finding.evidenceIds,
    };
  }

  private buildDescription(finding: Finding): string {
    const parts: string[] = [
      `**Severity**: ${finding.severity}`,
      `**Confidence**: ${finding.confidence}`,
      `**Affected Assets**: ${finding.affectedAssets.join(', ')}`,
      '',
      '**Impact**',
      finding.impact,
      '',
      '**Evidence**',
      `Referenced evidence IDs: ${finding.evidenceIds.join(', ')}`,
    ];

    if (finding.validationNote) {
      parts.push('', '**Validation Note**', finding.validationNote);
    }

    return parts.join('\n');
  }

  private async exportSingleFinding(
    config: VulnPlatformConfig,
    finding: VulnPlatformFinding,
    runId: string,
  ): Promise<string> {
    switch (config.type) {
      case 'defectdojo':
        if (!this.defectDojoClient) {
          throw new Error('DefectDojo client not configured');
        }
        return await this.defectDojoClient.createFinding(config, finding, runId);

      case 'faraday':
        if (!this.faradayClient) {
          throw new Error('Faraday client not configured');
        }
        return await this.faradayClient.createVulnerability(config, finding, runId);

      case 'jira':
        if (!this.jiraClient) {
          throw new Error('Jira client not configured');
        }
        return await this.jiraClient.createIssue(config, finding, runId);

      default:
        throw new Error(`Unsupported platform type: ${config.type}`);
    }
  }
}
