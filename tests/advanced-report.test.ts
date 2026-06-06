import assert from 'node:assert/strict';
import test from 'node:test';
import { Cvss40Calculator } from '../src/reports/cvss40-calculator.js';
import { AdvancedReportFormatter } from '../src/reports/advanced-report-formatter.js';
import type { Cvss40Vector, Finding, GraphSnapshot } from '../src/domain/types.js';

test('Cvss40Calculator generates valid CVSS 4.0 vector string', () => {
  const vector: Cvss40Vector = {
    AV: 'N',
    AC: 'L',
    AT: 'N',
    PR: 'N',
    UI: 'N',
    VC: 'H',
    VI: 'H',
    VA: 'H',
    SC: 'N',
    SI: 'N',
    SA: 'N',
  };

  const vectorString = Cvss40Calculator.vectorToString(vector);
  assert.equal(vectorString, 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N');
});

test('Cvss40Calculator parses valid CVSS 4.0 vector string', () => {
  const vectorString = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N';
  const vector = Cvss40Calculator.parseVector(vectorString);

  assert.notEqual(vector, null);
  assert.equal(vector?.AV, 'N');
  assert.equal(vector?.AC, 'L');
  assert.equal(vector?.VC, 'H');
});

test('Cvss40Calculator calculates CVSS 4.0 score for critical vulnerability', () => {
  const vector: Cvss40Vector = {
    AV: 'N',
    AC: 'L',
    AT: 'N',
    PR: 'N',
    UI: 'N',
    VC: 'H',
    VI: 'H',
    VA: 'H',
    SC: 'N',
    SI: 'N',
    SA: 'N',
  };

  const score = Cvss40Calculator.calculate(vector);

  assert.ok(score.baseScore > 8.0);
  assert.equal(score.baseSeverity, 'CRITICAL');
  assert.equal(score.vectorString, 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N');
});

test('Cvss40Calculator calculates CVSS 4.0 score for low vulnerability', () => {
  const vector: Cvss40Vector = {
    AV: 'L',
    AC: 'H',
    AT: 'P',
    PR: 'H',
    UI: 'A',
    VC: 'L',
    VI: 'N',
    VA: 'N',
    SC: 'N',
    SI: 'N',
    SA: 'N',
  };

  const score = Cvss40Calculator.calculate(vector);

  assert.ok(score.baseScore < 4.0);
  assert.equal(score.baseSeverity, 'LOW');
});

test('Cvss40Calculator validates correct CVSS 4.0 vector', () => {
  const vector: Cvss40Vector = {
    AV: 'N',
    AC: 'L',
    AT: 'N',
    PR: 'N',
    UI: 'N',
    VC: 'H',
    VI: 'H',
    VA: 'H',
    SC: 'N',
    SI: 'N',
    SA: 'N',
  };

  assert.equal(Cvss40Calculator.validate(vector), true);
});

test('Cvss40Calculator rejects invalid CVSS 4.0 vector', () => {
  const vector = {
    AV: 'X', // Invalid value
    AC: 'L',
    AT: 'N',
    PR: 'N',
    UI: 'N',
    VC: 'H',
    VI: 'H',
    VA: 'H',
    SC: 'N',
    SI: 'N',
    SA: 'N',
  } as unknown as Cvss40Vector;

  assert.equal(Cvss40Calculator.validate(vector), false);
});

test('AdvancedReportFormatter generates executive summary with risk assessment', () => {
  const mockSnapshot: GraphSnapshot = {
    run: {
      id: 'run_test',
      target: 'https://example.com',
      goal: 'Identify authentication vulnerabilities',
      status: 'completed',
      phase: 'completed',
      scopePolicy: {
        allowedAssets: ['https://example.com/*'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: {
          allowVaultReferencesOnly: true,
        },
        rateLimits: {
          requestsPerMinute: 60,
        },
      },
      workerPool: [],
      createdAt: '2026-06-06T00:00:00.000Z',
    },
    facts: [],
    intents: [],
    hints: [],
    evidence: [
      {
        id: 'evidence_1',
        runId: 'run_test',
        kind: 'http_exchange',
        sha256: 'abc123',
        redactionState: 'redacted',
        createdAt: '2026-06-06T00:00:00.000Z',
      },
    ],
    findings: [],
  } as any;

  const cvss40Score = Cvss40Calculator.calculate({
    AV: 'N',
    AC: 'L',
    AT: 'N',
    PR: 'N',
    UI: 'N',
    VC: 'H',
    VI: 'H',
    VA: 'H',
    SC: 'N',
    SI: 'N',
    SA: 'N',
  });

  const mockFindings: Finding[] = [
    {
      id: 'finding_1',
      runId: 'run_test',
      title: 'SQL Injection in Login Form',
      severity: 'critical',
      confidence: 'confirmed',
      affectedAssets: ['https://example.com/login'],
      evidenceIds: ['evidence_1'],
      reproSteps: ['Navigate to /login', 'Enter SQL payload in username field', 'Observe database error'],
      impact: 'Unauthorized access to database',
      remediation: 'Use parameterized queries',
      validationState: 'confirmed',
      createdAt: '2026-06-06T00:00:00.000Z',
      cvss40: cvss40Score,
      attackMappings: [
        {
          techniqueId: 'T1190',
          techniqueName: 'Exploit Public-Facing Application',
          tactic: 'Initial Access',
        },
      ],
      cweIds: ['CWE-89'],
    },
    {
      id: 'finding_2',
      runId: 'run_test',
      title: 'Cross-Site Scripting (XSS)',
      severity: 'high',
      confidence: 'confirmed',
      affectedAssets: ['https://example.com/search'],
      evidenceIds: ['evidence_1'],
      reproSteps: ['Navigate to /search', 'Enter XSS payload', 'Observe script execution'],
      impact: 'Session hijacking possible',
      remediation: 'Implement output encoding',
      validationState: 'confirmed',
      createdAt: '2026-06-06T00:00:00.000Z',
      cweIds: ['CWE-79'],
    },
  ];

  const summary = AdvancedReportFormatter.generateExecutiveSummary(mockSnapshot, mockFindings);

  assert.ok(summary.includes('Executive Summary'));
  assert.ok(summary.includes('Risk Profile'));
  assert.ok(summary.includes('CRITICAL'));
  assert.ok(summary.includes('Critical: 1'));
  assert.ok(summary.includes('High: 1'));
});

test('AdvancedReportFormatter generates severity chart', () => {
  const mockFindings: Finding[] = [
    {
      id: 'finding_1',
      runId: 'run_test',
      title: 'Test Finding',
      severity: 'critical',
      confidence: 'confirmed',
      affectedAssets: ['https://example.com'],
      evidenceIds: ['evidence_1'],
      reproSteps: ['Step 1'],
      impact: 'Test impact',
      remediation: 'Test remediation',
      validationState: 'confirmed',
      createdAt: '2026-06-06T00:00:00.000Z',
    },
  ];

  const chart = AdvancedReportFormatter.generateSeverityChart(mockFindings);

  assert.ok(chart.includes('Severity Distribution'));
  assert.ok(chart.includes('critical'));
});

test('AdvancedReportFormatter generates risk summary table', () => {
  const mockFindings: Finding[] = [
    {
      id: 'finding_1',
      runId: 'run_test',
      title: 'SQL Injection',
      severity: 'critical',
      confidence: 'confirmed',
      affectedAssets: ['https://example.com'],
      evidenceIds: ['evidence_1'],
      reproSteps: ['Step 1'],
      impact: 'Test impact',
      remediation: 'Test remediation',
      validationState: 'confirmed',
      createdAt: '2026-06-06T00:00:00.000Z',
    },
  ];

  const table = AdvancedReportFormatter.generateRiskSummary(mockFindings);

  assert.ok(table.includes('Risk Summary'));
  assert.ok(table.includes('| Finding | Severity | CVSS 4.0 | Validation | Affected Assets |'));
  assert.ok(table.includes('SQL Injection'));
  assert.ok(table.includes('critical'));
});

test('AdvancedReportFormatter formats enhanced finding with CVSS and ATT&CK', () => {
  const cvss40Score = Cvss40Calculator.calculate({
    AV: 'N',
    AC: 'L',
    AT: 'N',
    PR: 'N',
    UI: 'N',
    VC: 'H',
    VI: 'H',
    VA: 'H',
    SC: 'N',
    SI: 'N',
    SA: 'N',
  });

  const finding: Finding = {
    id: 'finding_1',
    runId: 'run_test',
    title: 'SQL Injection in Login Form',
    severity: 'critical',
    confidence: 'confirmed',
    affectedAssets: ['https://example.com/login'],
    evidenceIds: ['evidence_1'],
    reproSteps: ['Navigate to /login', 'Enter SQL payload', 'Observe error'],
    impact: 'Unauthorized access',
    remediation: 'Use parameterized queries',
    validationState: 'confirmed',
    createdAt: '2026-06-06T00:00:00.000Z',
    cvss40: cvss40Score,
    attackMappings: [
      {
        techniqueId: 'T1190',
        techniqueName: 'Exploit Public-Facing Application',
        tactic: 'Initial Access',
      },
    ],
    cweIds: ['CWE-89'],
  };

  const formatted = AdvancedReportFormatter.formatEnhancedFinding(finding, 1);

  assert.ok(formatted.includes('Finding 1: SQL Injection in Login Form'));
  assert.ok(formatted.includes('**Severity**: CRITICAL'));
  assert.ok(formatted.includes('CVSS 4.0'));
  assert.ok(formatted.includes('CVSS:4.0/AV:N'));
  assert.ok(formatted.includes('MITRE ATT&CK Mapping'));
  assert.ok(formatted.includes('T1190'));
  assert.ok(formatted.includes('Initial Access'));
  assert.ok(formatted.includes('CWE-89'));
});

test('AdvancedReportFormatter generates ATT&CK matrix coverage', () => {
  const mockFindings: Finding[] = [
    {
      id: 'finding_1',
      runId: 'run_test',
      title: 'Test Finding',
      severity: 'high',
      confidence: 'confirmed',
      affectedAssets: ['https://example.com'],
      evidenceIds: ['evidence_1'],
      reproSteps: ['Step 1'],
      impact: 'Test impact',
      remediation: 'Test remediation',
      validationState: 'confirmed',
      createdAt: '2026-06-06T00:00:00.000Z',
      attackMappings: [
        {
          techniqueId: 'T1190',
          techniqueName: 'Exploit Public-Facing Application',
          tactic: 'Initial Access',
        },
      ],
    },
  ];

  const matrix = AdvancedReportFormatter.generateAttackMatrix(mockFindings);

  assert.ok(matrix.includes('ATT&CK Coverage'));
  assert.ok(matrix.includes('Initial Access'));
  assert.ok(matrix.includes('T1190'));
});

test('AdvancedReportFormatter sorts findings by severity and CVSS score', () => {
  const mockFindings: Finding[] = [
    {
      id: 'finding_1',
      runId: 'run_test',
      title: 'Low Finding',
      severity: 'low',
      confidence: 'confirmed',
      affectedAssets: ['https://example.com'],
      evidenceIds: ['evidence_1'],
      reproSteps: ['Step 1'],
      impact: 'Test impact',
      remediation: 'Test remediation',
      validationState: 'confirmed',
      createdAt: '2026-06-06T00:00:00.000Z',
    },
    {
      id: 'finding_2',
      runId: 'run_test',
      title: 'Critical Finding',
      severity: 'critical',
      confidence: 'confirmed',
      affectedAssets: ['https://example.com'],
      evidenceIds: ['evidence_1'],
      reproSteps: ['Step 1'],
      impact: 'Test impact',
      remediation: 'Test remediation',
      validationState: 'confirmed',
      createdAt: '2026-06-06T00:00:00.000Z',
    },
  ];

  const sorted = AdvancedReportFormatter.sortFindingsBySeverity(mockFindings);

  assert.equal(sorted[0].severity, 'critical');
  assert.equal(sorted[1].severity, 'low');
});

test('AdvancedReportFormatter handles empty findings gracefully', () => {
  const mockSnapshot: GraphSnapshot = {
    run: {
      id: 'run_test',
      target: 'https://example.com',
      goal: 'Test goal',
      status: 'completed',
      phase: 'completed',
      scopePolicy: {
        allowedAssets: ['https://example.com/*'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: true },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [],
      createdAt: '2026-06-06T00:00:00.000Z',
    },
    facts: [],
    intents: [],
    hints: [],
    evidence: [],
    findings: [],
  } as any;

  const summary = AdvancedReportFormatter.generateExecutiveSummary(mockSnapshot, []);
  assert.ok(summary.includes('0 confirmed security finding'));
  assert.ok(summary.includes('INFORMATIONAL'));

  const chart = AdvancedReportFormatter.generateSeverityChart([]);
  assert.ok(chart.includes('No findings to display'));

  const matrix = AdvancedReportFormatter.generateAttackMatrix([]);
  assert.equal(matrix, '');
});

test('AdvancedReportFormatter handles findings without CVSS or ATT&CK mappings', () => {
  const basicFinding: Finding = {
    id: 'finding_3',
    runId: 'run_test',
    title: 'Information Disclosure',
    severity: 'low',
    confidence: 'likely',
    affectedAssets: ['https://example.com/info'],
    evidenceIds: ['evidence_1'],
    reproSteps: ['Access /info endpoint'],
    impact: 'Minor information leak',
    remediation: 'Remove debug information',
    validationState: 'candidate',
    createdAt: '2026-06-06T00:00:00.000Z',
  };

  const formatted = AdvancedReportFormatter.formatEnhancedFinding(basicFinding, 1);

  assert.ok(formatted.includes('Information Disclosure'));
  assert.ok(formatted.includes('**Severity**: LOW'));
  assert.ok(!formatted.includes('CVSS 4.0'));
  assert.ok(!formatted.includes('MITRE ATT&CK'));
});
