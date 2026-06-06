import type { Severity } from '../domain/types.js';
import type { VulnPlatformConfig, VulnPlatformFinding } from './vuln-platform-adapter.js';

interface DefectDojoFindingPayload {
  title: string;
  description: string;
  severity: string;
  active: boolean;
  verified: boolean;
  test: number;
  found_by?: number[];
  tags?: string[];
  cwe?: number;
  cvss?: string;
  mitigation?: string;
  impact?: string;
  steps_to_reproduce?: string;
  references?: string;
}

interface DefectDojoFindingResponse {
  id: number;
  title: string;
  severity: string;
  active: boolean;
  verified: boolean;
}

interface DefectDojoTestPayload {
  engagement: number;
  test_type: number;
  environment: string;
  target_start: string;
  target_end: string;
  title?: string;
}

interface DefectDojoTestResponse {
  id: number;
  title: string;
  engagement: number;
  test_type: number;
}

/**
 * DefectDojo API client for vulnerability management platform integration.
 * Implements fail-closed semantics: all validation errors are thrown.
 *
 * API Documentation: https://documentation.defectdojo.com/integrations/api-v2-docs/
 */
export class DefectDojoClient {
  private readonly defaultTestType = 1; // Generic test type ID

  /**
   * Test connectivity to DefectDojo instance.
   * Validates API key and engagement access.
   */
  async testConnection(config: VulnPlatformConfig): Promise<boolean> {
    if (!config.apiKey) {
      throw new Error('DefectDojo API key is required');
    }

    if (!config.engagementId) {
      throw new Error('DefectDojo engagement ID is required');
    }

    const url = `${config.baseUrl}/api/v2/engagements/${config.engagementId}/`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`DefectDojo connection test failed: ${response.status} ${response.statusText}`);
      }

      return true;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`DefectDojo connection failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create a finding in DefectDojo.
   * Requires engagement ID and creates or reuses a test.
   */
  async createFinding(config: VulnPlatformConfig, finding: VulnPlatformFinding, runId: string): Promise<string> {
    if (!config.apiKey) {
      throw new Error('DefectDojo API key is required');
    }

    if (!config.engagementId) {
      throw new Error('DefectDojo engagement ID is required');
    }

    // Get or create test for this run
    const testId = await this.getOrCreateTest(config, runId);

    const payload: DefectDojoFindingPayload = {
      title: finding.title,
      description: this.buildDescription(finding),
      severity: this.mapSeverity(finding.severity),
      active: true,
      verified: true, // Confirmed findings are verified
      test: testId,
      tags: ['agentred', `run:${runId}`],
      mitigation: finding.remediation,
      impact: finding.impact,
      steps_to_reproduce: finding.reproSteps.join('\n'),
    };

    if (finding.cwe) {
      payload.cwe = finding.cwe;
    }

    const url = `${config.baseUrl}/api/v2/findings/`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DefectDojo API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = (await response.json()) as DefectDojoFindingResponse;
      return String(result.id);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create DefectDojo finding: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get or create a test for the run.
   * Tests group findings in DefectDojo.
   */
  private async getOrCreateTest(config: VulnPlatformConfig, runId: string): Promise<number> {
    if (!config.apiKey || !config.engagementId) {
      throw new Error('DefectDojo API key and engagement ID are required');
    }

    // Try to find existing test for this run
    const searchUrl = `${config.baseUrl}/api/v2/tests/?engagement=${config.engagementId}&title=AgentRed%20Run%20${runId}`;

    try {
      const searchResponse = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (searchResponse.ok) {
        const searchResult = (await searchResponse.json()) as { results: DefectDojoTestResponse[] };
        if (searchResult.results && searchResult.results.length > 0) {
          return searchResult.results[0].id;
        }
      }

      // Create new test
      const now = new Date().toISOString().split('T')[0];
      const payload: DefectDojoTestPayload = {
        engagement: Number(config.engagementId),
        test_type: this.defaultTestType,
        environment: 'Production',
        target_start: now,
        target_end: now,
        title: `AgentRed Run ${runId}`,
      };

      const createUrl = `${config.baseUrl}/api/v2/tests/`;
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create test: ${createResponse.status} ${createResponse.statusText} - ${errorText}`);
      }

      const result = (await createResponse.json()) as DefectDojoTestResponse;
      return result.id;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get or create DefectDojo test: ${error.message}`);
      }
      throw error;
    }
  }

  private mapSeverity(severity: Severity): string {
    // DefectDojo severity values: Info, Low, Medium, High, Critical
    const mapping: Record<Severity, string> = {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      info: 'Info',
    };
    return mapping[severity];
  }

  private buildDescription(finding: VulnPlatformFinding): string {
    const parts: string[] = [
      finding.description,
      '',
      '**Affected Assets**',
      finding.affectedAssets.join(', '),
      '',
      '**Evidence IDs**',
      finding.evidenceIds.join(', '),
    ];

    return parts.join('\n');
  }
}
