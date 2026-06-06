import type { Severity } from '../domain/types.js';
import type { VulnPlatformConfig, VulnPlatformFinding } from './vuln-platform-adapter.js';

interface FaradayVulnerabilityPayload {
  name: string;
  description: string;
  severity: string;
  type: string;
  confirmed: boolean;
  data?: string;
  refs?: string[];
  resolution?: string;
  impact?: {
    accountability: boolean;
    availability: boolean;
    confidentiality: boolean;
    integrity: boolean;
  };
  policyviolations?: string[];
  external_id?: string;
  cwe?: string[];
  cvss2?: {
    vector_string?: string;
    base_score?: number;
  };
  cvss3?: {
    vector_string?: string;
    base_score?: number;
  };
  tags?: string[];
}

interface FaradayVulnerabilityResponse {
  _id: number;
  name: string;
  severity: string;
  type: string;
  confirmed: boolean;
}

interface FaradayWorkspaceResponse {
  name: string;
  active: boolean;
  readonly: boolean;
}

/**
 * Faraday API client for vulnerability management platform integration.
 * Implements fail-closed semantics: all validation errors are thrown.
 *
 * API Documentation: https://docs.faradaysec.com/api/
 */
export class FaradayClient {
  /**
   * Test connectivity to Faraday instance.
   * Validates credentials and workspace access.
   */
  async testConnection(config: VulnPlatformConfig): Promise<boolean> {
    if (!config.username || !config.password) {
      throw new Error('Faraday username and password are required');
    }

    if (!config.workspaceId) {
      throw new Error('Faraday workspace ID is required');
    }

    const url = `${config.baseUrl}/v3/ws/${config.workspaceId}`;
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Faraday connection test failed: ${response.status} ${response.statusText}`);
      }

      const workspace = (await response.json()) as FaradayWorkspaceResponse;
      if (workspace.readonly) {
        throw new Error('Faraday workspace is read-only');
      }

      if (!workspace.active) {
        throw new Error('Faraday workspace is not active');
      }

      return true;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Faraday connection failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create a vulnerability in Faraday.
   * Requires workspace ID and creates a vulnerability record.
   */
  async createVulnerability(config: VulnPlatformConfig, finding: VulnPlatformFinding, runId: string): Promise<string> {
    if (!config.username || !config.password) {
      throw new Error('Faraday username and password are required');
    }

    if (!config.workspaceId) {
      throw new Error('Faraday workspace ID is required');
    }

    const payload: FaradayVulnerabilityPayload = {
      name: finding.title,
      description: this.buildDescription(finding),
      severity: this.mapSeverity(finding.severity),
      type: 'Vulnerability',
      confirmed: true, // Confirmed findings are confirmed in Faraday
      data: finding.reproSteps.join('\n\n'),
      resolution: finding.remediation,
      impact: this.buildImpact(finding.impact),
      tags: ['agentred', `run:${runId}`],
      external_id: `agentred-${runId}`,
    };

    if (finding.cwe) {
      payload.cwe = [String(finding.cwe)];
    }

    const url = `${config.baseUrl}/v3/ws/${config.workspaceId}/vulns`;
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Faraday API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = (await response.json()) as FaradayVulnerabilityResponse;
      return String(result._id);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create Faraday vulnerability: ${error.message}`);
      }
      throw error;
    }
  }

  private mapSeverity(severity: Severity): string {
    // Faraday severity values: critical, high, medium, low, informational, unclassified
    const mapping: Record<Severity, string> = {
      critical: 'critical',
      high: 'high',
      medium: 'medium',
      low: 'low',
      info: 'informational',
    };
    return mapping[severity];
  }

  private buildDescription(finding: VulnPlatformFinding): string {
    const parts: string[] = [
      finding.description,
      '',
      '## Affected Assets',
      finding.affectedAssets.join(', '),
      '',
      '## Evidence IDs',
      finding.evidenceIds.join(', '),
    ];

    return parts.join('\n');
  }

  private buildImpact(impactText: string): {
    accountability: boolean;
    availability: boolean;
    confidentiality: boolean;
    integrity: boolean;
  } {
    // Parse impact text for CIA keywords
    const lower = impactText.toLowerCase();
    return {
      accountability: lower.includes('accountability') || lower.includes('non-repudiation'),
      availability: lower.includes('availability') || lower.includes('denial') || lower.includes('dos'),
      confidentiality: lower.includes('confidentiality') || lower.includes('disclosure') || lower.includes('leak'),
      integrity: lower.includes('integrity') || lower.includes('modification') || lower.includes('tampering'),
    };
  }
}
