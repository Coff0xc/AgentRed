import type { Severity } from '../domain/types.js';
import type { VulnPlatformConfig, VulnPlatformFinding } from './vuln-platform-adapter.js';

interface JiraIssuePayload {
  fields: {
    project: {
      key: string;
    };
    summary: string;
    description: string;
    issuetype: {
      name: string;
    };
    priority?: {
      name: string;
    };
    labels?: string[];
    customfield_security_level?: string;
  };
}

interface JiraIssueResponse {
  id: string;
  key: string;
  self: string;
}

interface JiraProjectResponse {
  key: string;
  name: string;
  projectTypeKey: string;
}

/**
 * Jira API client for vulnerability management platform integration.
 * Implements fail-closed semantics: all validation errors are thrown.
 *
 * API Documentation: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */
export class JiraClient {
  private readonly defaultIssueType = 'Bug';

  /**
   * Test connectivity to Jira instance.
   * Validates credentials and project access.
   */
  async testConnection(config: VulnPlatformConfig): Promise<boolean> {
    if (!config.username || !config.apiKey) {
      throw new Error('Jira username and API key are required');
    }

    if (!config.projectKey) {
      throw new Error('Jira project key is required');
    }

    const url = `${config.baseUrl}/rest/api/3/project/${config.projectKey}`;
    const auth = Buffer.from(`${config.username}:${config.apiKey}`).toString('base64');

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Jira connection test failed: ${response.status} ${response.statusText}`);
      }

      const project = (await response.json()) as JiraProjectResponse;
      if (!project.key) {
        throw new Error('Invalid Jira project response');
      }

      return true;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Jira connection failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create an issue in Jira.
   * Requires project key and creates a Bug issue type.
   */
  async createIssue(config: VulnPlatformConfig, finding: VulnPlatformFinding, runId: string): Promise<string> {
    if (!config.username || !config.apiKey) {
      throw new Error('Jira username and API key are required');
    }

    if (!config.projectKey) {
      throw new Error('Jira project key is required');
    }

    const payload: JiraIssuePayload = {
      fields: {
        project: {
          key: config.projectKey,
        },
        summary: finding.title,
        description: this.buildDescription(finding),
        issuetype: {
          name: this.defaultIssueType,
        },
        priority: {
          name: this.mapPriority(finding.severity),
        },
        labels: ['agentred', `run-${runId}`, `severity-${finding.severity}`],
      },
    };

    const url = `${config.baseUrl}/rest/api/3/issue`;
    const auth = Buffer.from(`${config.username}:${config.apiKey}`).toString('base64');

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
        throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = (await response.json()) as JiraIssueResponse;
      return result.key;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create Jira issue: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Add a comment to an existing Jira issue.
   * Used for attaching additional evidence or updates.
   */
  async addComment(config: VulnPlatformConfig, issueKey: string, comment: string): Promise<void> {
    if (!config.username || !config.apiKey) {
      throw new Error('Jira username and API key are required');
    }

    const payload = {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: comment,
              },
            ],
          },
        ],
      },
    };

    const url = `${config.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
    const auth = Buffer.from(`${config.username}:${config.apiKey}`).toString('base64');

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
        throw new Error(`Jira comment API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to add Jira comment: ${error.message}`);
      }
      throw error;
    }
  }

  private mapPriority(severity: Severity): string {
    // Jira priority values: Highest, High, Medium, Low, Lowest
    const mapping: Record<Severity, string> = {
      critical: 'Highest',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      info: 'Lowest',
    };
    return mapping[severity];
  }

  private buildDescription(finding: VulnPlatformFinding): string {
    // Jira uses Atlassian Document Format (ADF) for descriptions
    const parts: string[] = [
      finding.description,
      '',
      'h2. Affected Assets',
      finding.affectedAssets.map((asset) => `* ${asset}`).join('\n'),
      '',
      'h2. Impact',
      finding.impact,
      '',
      'h2. Reproduction Steps',
      finding.reproSteps.map((step, index) => `# ${step}`).join('\n'),
      '',
      'h2. Remediation',
      finding.remediation,
      '',
      'h2. Evidence IDs',
      finding.evidenceIds.map((id) => `* ${id}`).join('\n'),
    ];

    return parts.join('\n');
  }
}
