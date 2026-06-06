import assert from 'node:assert/strict';
import test from 'node:test';
import { VulnPlatformAdapter } from '../src/integrations/vuln-platform-adapter.js';
import { DefectDojoClient } from '../src/integrations/defectdojo-client.js';
import { FaradayClient } from '../src/integrations/faraday-client.js';
import { JiraClient } from '../src/integrations/jira-client.js';
import { InMemoryPlatformStore } from '../src/storage/store.js';
import type { Finding, Run } from '../src/domain/types.js';
import { newId, nowIso } from '../src/domain/ids.js';

test('VulnPlatformAdapter throws error if integration is not enabled', async () => {
  const store = new InMemoryPlatformStore();
  const adapter = new VulnPlatformAdapter(store);

  const run = createTestRun();
  store.state.runs[run.id] = run;

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    apiKey: 'test-key',
    engagementId: '1',
    enabled: false,
  };

  await assert.rejects(
    async () => adapter.exportFindings(run.id, config),
    /Vulnerability platform integration is not enabled/,
  );
});

test('VulnPlatformAdapter throws error if run does not exist', async () => {
  const store = new InMemoryPlatformStore();
  const adapter = new VulnPlatformAdapter(store);

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    apiKey: 'test-key',
    engagementId: '1',
    enabled: true,
  };

  await assert.rejects(async () => adapter.exportFindings('nonexistent-run', config), /Run not found/);
});

test('VulnPlatformAdapter returns empty result if no confirmed findings', async () => {
  const store = new InMemoryPlatformStore();
  const adapter = new VulnPlatformAdapter(store);

  const run = createTestRun();
  store.state.runs[run.id] = run;

  const candidateFinding = createTestFinding(run.id, 'candidate');
  store.state.findings[candidateFinding.id] = candidateFinding;

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    apiKey: 'test-key',
    engagementId: '1',
    enabled: true,
  };

  const result = await adapter.exportFindings(run.id, config);

  assert.equal(result.exportedFindings, 0);
  assert.equal(result.platformIssueIds.length, 0);
  assert.equal(result.errors.length, 0);
});

test('VulnPlatformAdapter only exports confirmed findings', async () => {
  const store = new InMemoryPlatformStore();
  const mockJiraClient = new JiraClient();
  mockJiraClient.createIssue = async () => 'SEC-123';

  const adapter = new VulnPlatformAdapter(store, undefined, undefined, undefined, mockJiraClient);

  const run = createTestRun();
  store.state.runs[run.id] = run;

  const candidateFinding = createTestFinding(run.id, 'candidate');
  const confirmedFinding = createTestFinding(run.id, 'confirmed');
  const rejectedFinding = createTestFinding(run.id, 'rejected');

  store.state.findings[candidateFinding.id] = candidateFinding;
  store.state.findings[confirmedFinding.id] = confirmedFinding;
  store.state.findings[rejectedFinding.id] = rejectedFinding;

  const config = {
    type: 'jira' as const,
    baseUrl: 'https://jira.example.com',
    username: 'test@example.com',
    apiKey: 'test-key',
    projectKey: 'SEC',
    enabled: true,
  };

  const result = await adapter.exportFindings(run.id, config);

  // Only confirmed finding should be exported
  assert.equal(result.exportedFindings, 1);
  assert.equal(result.platformIssueIds.length, 1);
  assert.equal(result.platformIssueIds[0], 'SEC-123');
});

test('VulnPlatformAdapter handles export errors gracefully', async () => {
  const store = new InMemoryPlatformStore();
  const mockDefectDojoClient = new DefectDojoClient();

  let callCount = 0;
  mockDefectDojoClient.createFinding = async () => {
    callCount++;
    if (callCount === 1) {
      return '123';
    }
    throw new Error('API error');
  };

  const adapter = new VulnPlatformAdapter(store, undefined, mockDefectDojoClient, undefined, undefined);

  const run = createTestRun();
  store.state.runs[run.id] = run;

  const finding1 = createTestFinding(run.id, 'confirmed');
  const finding2 = createTestFinding(run.id, 'confirmed');

  store.state.findings[finding1.id] = finding1;
  store.state.findings[finding2.id] = finding2;

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    apiKey: 'test-key',
    engagementId: '1',
    enabled: true,
  };

  const result = await adapter.exportFindings(run.id, config);

  // One success, one failure
  assert.equal(result.exportedFindings, 1);
  assert.equal(result.platformIssueIds.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /API error/);
});

test('VulnPlatformAdapter testConnection throws error if integration is not enabled', async () => {
  const store = new InMemoryPlatformStore();
  const adapter = new VulnPlatformAdapter(store);

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    apiKey: 'test-key',
    engagementId: '1',
    enabled: false,
  };

  await assert.rejects(
    async () => adapter.testConnection(config),
    /Vulnerability platform integration is not enabled/,
  );
});

test('VulnPlatformAdapter testConnection throws error for unsupported platform type', async () => {
  const store = new InMemoryPlatformStore();
  const adapter = new VulnPlatformAdapter(store);

  const config = {
    type: 'unsupported' as any,
    baseUrl: 'https://example.com',
    enabled: true,
  };

  await assert.rejects(async () => adapter.testConnection(config), /Unsupported platform type/);
});

test('VulnPlatformAdapter testConnection throws error if client is not configured', async () => {
  const store = new InMemoryPlatformStore();
  const adapter = new VulnPlatformAdapter(store);

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    apiKey: 'test-key',
    engagementId: '1',
    enabled: true,
  };

  await assert.rejects(async () => adapter.testConnection(config), /DefectDojo client not configured/);
});

test('VulnPlatformAdapter getExportStatus returns correct counts', () => {
  const store = new InMemoryPlatformStore();
  const adapter = new VulnPlatformAdapter(store);

  const run = createTestRun();
  store.state.runs[run.id] = run;

  const finding1 = createTestFinding(run.id, 'confirmed');
  const finding2 = createTestFinding(run.id, 'confirmed');
  const finding3 = createTestFinding(run.id, 'candidate');

  store.state.findings[finding1.id] = finding1;
  store.state.findings[finding2.id] = finding2;
  store.state.findings[finding3.id] = finding3;

  const status = adapter.getExportStatus(run.id, 'defectdojo');

  assert.equal(status.totalConfirmed, 2);
  assert.equal(status.pending, 2);
});

test('DefectDojoClient testConnection throws error if API key is missing', async () => {
  const client = new DefectDojoClient();

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    engagementId: '1',
    enabled: true,
  };

  await assert.rejects(async () => client.testConnection(config), /DefectDojo API key is required/);
});

test('DefectDojoClient testConnection throws error if engagement ID is missing', async () => {
  const client = new DefectDojoClient();

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    apiKey: 'test-key',
    enabled: true,
  };

  await assert.rejects(async () => client.testConnection(config), /DefectDojo engagement ID is required/);
});

test('DefectDojoClient createFinding throws error if API key is missing', async () => {
  const client = new DefectDojoClient();

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    engagementId: '1',
    enabled: true,
  };

  const finding = {
    title: 'Test Finding',
    severity: 'high' as const,
    description: 'Test description',
    affectedAssets: ['https://example.com'],
    reproSteps: ['Step 1'],
    impact: 'High impact',
    remediation: 'Fix it',
    evidenceIds: ['ev-1'],
  };

  await assert.rejects(async () => client.createFinding(config, finding, 'run-1'), /DefectDojo API key is required/);
});

test('DefectDojoClient createFinding throws error if engagement ID is missing', async () => {
  const client = new DefectDojoClient();

  const config = {
    type: 'defectdojo' as const,
    baseUrl: 'https://defectdojo.example.com',
    apiKey: 'test-key',
    enabled: true,
  };

  const finding = {
    title: 'Test Finding',
    severity: 'high' as const,
    description: 'Test description',
    affectedAssets: ['https://example.com'],
    reproSteps: ['Step 1'],
    impact: 'High impact',
    remediation: 'Fix it',
    evidenceIds: ['ev-1'],
  };

  await assert.rejects(
    async () => client.createFinding(config, finding, 'run-1'),
    /DefectDojo engagement ID is required/,
  );
});

test('FaradayClient testConnection throws error if username is missing', async () => {
  const client = new FaradayClient();

  const config = {
    type: 'faraday' as const,
    baseUrl: 'https://faraday.example.com',
    password: 'test-pass',
    workspaceId: 'test-ws',
    enabled: true,
  };

  await assert.rejects(async () => client.testConnection(config), /Faraday username and password are required/);
});

test('FaradayClient testConnection throws error if password is missing', async () => {
  const client = new FaradayClient();

  const config = {
    type: 'faraday' as const,
    baseUrl: 'https://faraday.example.com',
    username: 'test-user',
    workspaceId: 'test-ws',
    enabled: true,
  };

  await assert.rejects(async () => client.testConnection(config), /Faraday username and password are required/);
});

test('FaradayClient testConnection throws error if workspace ID is missing', async () => {
  const client = new FaradayClient();

  const config = {
    type: 'faraday' as const,
    baseUrl: 'https://faraday.example.com',
    username: 'test-user',
    password: 'test-pass',
    enabled: true,
  };

  await assert.rejects(async () => client.testConnection(config), /Faraday workspace ID is required/);
});

test('FaradayClient createVulnerability throws error if credentials are missing', async () => {
  const client = new FaradayClient();

  const config = {
    type: 'faraday' as const,
    baseUrl: 'https://faraday.example.com',
    workspaceId: 'test-ws',
    enabled: true,
  };

  const finding = {
    title: 'Test Finding',
    severity: 'high' as const,
    description: 'Test description',
    affectedAssets: ['https://example.com'],
    reproSteps: ['Step 1'],
    impact: 'High impact',
    remediation: 'Fix it',
    evidenceIds: ['ev-1'],
  };

  await assert.rejects(
    async () => client.createVulnerability(config, finding, 'run-1'),
    /Faraday username and password are required/,
  );
});

test('FaradayClient createVulnerability throws error if workspace ID is missing', async () => {
  const client = new FaradayClient();

  const config = {
    type: 'faraday' as const,
    baseUrl: 'https://faraday.example.com',
    username: 'test-user',
    password: 'test-pass',
    enabled: true,
  };

  const finding = {
    title: 'Test Finding',
    severity: 'high' as const,
    description: 'Test description',
    affectedAssets: ['https://example.com'],
    reproSteps: ['Step 1'],
    impact: 'High impact',
    remediation: 'Fix it',
    evidenceIds: ['ev-1'],
  };

  await assert.rejects(
    async () => client.createVulnerability(config, finding, 'run-1'),
    /Faraday workspace ID is required/,
  );
});

test('JiraClient testConnection throws error if username is missing', async () => {
  const client = new JiraClient();

  const config = {
    type: 'jira' as const,
    baseUrl: 'https://jira.example.com',
    apiKey: 'test-key',
    projectKey: 'SEC',
    enabled: true,
  };

  await assert.rejects(async () => client.testConnection(config), /Jira username and API key are required/);
});

test('JiraClient testConnection throws error if API key is missing', async () => {
  const client = new JiraClient();

  const config = {
    type: 'jira' as const,
    baseUrl: 'https://jira.example.com',
    username: 'test@example.com',
    projectKey: 'SEC',
    enabled: true,
  };

  await assert.rejects(async () => client.testConnection(config), /Jira username and API key are required/);
});

test('JiraClient testConnection throws error if project key is missing', async () => {
  const client = new JiraClient();

  const config = {
    type: 'jira' as const,
    baseUrl: 'https://jira.example.com',
    username: 'test@example.com',
    apiKey: 'test-key',
    enabled: true,
  };

  await assert.rejects(async () => client.testConnection(config), /Jira project key is required/);
});

test('JiraClient createIssue throws error if credentials are missing', async () => {
  const client = new JiraClient();

  const config = {
    type: 'jira' as const,
    baseUrl: 'https://jira.example.com',
    projectKey: 'SEC',
    enabled: true,
  };

  const finding = {
    title: 'Test Finding',
    severity: 'high' as const,
    description: 'Test description',
    affectedAssets: ['https://example.com'],
    reproSteps: ['Step 1'],
    impact: 'High impact',
    remediation: 'Fix it',
    evidenceIds: ['ev-1'],
  };

  await assert.rejects(async () => client.createIssue(config, finding, 'run-1'), /Jira username and API key are required/);
});

test('JiraClient createIssue throws error if project key is missing', async () => {
  const client = new JiraClient();

  const config = {
    type: 'jira' as const,
    baseUrl: 'https://jira.example.com',
    username: 'test@example.com',
    apiKey: 'test-key',
    enabled: true,
  };

  const finding = {
    title: 'Test Finding',
    severity: 'high' as const,
    description: 'Test description',
    affectedAssets: ['https://example.com'],
    reproSteps: ['Step 1'],
    impact: 'High impact',
    remediation: 'Fix it',
    evidenceIds: ['ev-1'],
  };

  await assert.rejects(async () => client.createIssue(config, finding, 'run-1'), /Jira project key is required/);
});

test('JiraClient addComment throws error if credentials are missing', async () => {
  const client = new JiraClient();

  const config = {
    type: 'jira' as const,
    baseUrl: 'https://jira.example.com',
    projectKey: 'SEC',
    enabled: true,
  };

  await assert.rejects(async () => client.addComment(config, 'SEC-123', 'Test comment'), /Jira username and API key are required/);
});

// Helper functions
function createTestRun(): Run {
  return {
    id: newId('run'),
    target: 'https://example.com',
    goal: 'Test goal',
    status: 'active',
    scopePolicy: {
      allowedAssets: ['https://example.com'],
      deniedAssets: [],
      allowedMethods: ['GET', 'POST'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: false },
      rateLimits: { requestsPerMinute: 60 },
    },
    workerPool: [],
    createdAt: nowIso(),
  };
}

function createTestFinding(runId: string, validationState: 'candidate' | 'confirmed' | 'rejected'): Finding {
  return {
    id: newId('finding'),
    runId,
    title: 'Test Finding',
    severity: 'high',
    confidence: 'confirmed',
    affectedAssets: ['https://example.com'],
    evidenceIds: [newId('evidence')],
    reproSteps: ['Step 1', 'Step 2'],
    impact: 'High impact',
    remediation: 'Fix the issue',
    validationState,
    createdAt: nowIso(),
  };
}
