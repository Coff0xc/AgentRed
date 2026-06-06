import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatform } from '../src/platform.js';
import { Cvss40Calculator } from '../src/reports/cvss40-calculator.js';
import type { ScopePolicy } from '../src/domain/types.js';

test('ReportService generates executive report with CVSS 4.0 and ATT&CK mappings', async () => {
  const policy: ScopePolicy = {
    allowedAssets: ['example.com'],
    deniedAssets: [],
    allowedMethods: ['GET', 'POST'],
    destructiveAllowed: false,
    credentialRules: { allowVaultReferencesOnly: true },
    rateLimits: { requestsPerMinute: 120 },
  };

  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://example.com',
    goal: 'Comprehensive security assessment',
    scopePolicy: policy,
    workerPool: [],
  });

  // Add evidence
  const evidence1 = platform.evidence.addEvidence({
    runId: run.id,
    kind: 'http_exchange',
    content: 'POST /login HTTP/1.1\nHost: example.com\n\nusername=admin\' OR 1=1--&password=test',
    redactionState: 'redacted',
  });

  const evidence2 = platform.evidence.addEvidence({
    runId: run.id,
    kind: 'screenshot',
    content: 'base64encodedscreenshot',
    redactionState: 'redacted',
  });

  // Create CVSS 4.0 score for SQL Injection
  const sqlInjectionCvss = Cvss40Calculator.calculate({
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

  // Create finding with CVSS 4.0 and ATT&CK mapping
  const finding1 = platform.findings.proposeFinding({
    runId: run.id,
    title: 'SQL Injection in Authentication',
    severity: 'critical',
    confidence: 'confirmed',
    affectedAssets: ['https://example.com/login'],
    evidenceIds: [evidence1.id],
    reproSteps: [
      'Navigate to https://example.com/login',
      "Enter username: admin' OR 1=1--",
      'Enter any password',
      'Click Login',
      'Observe successful authentication bypass',
    ],
    impact: 'An attacker can bypass authentication and gain unauthorized access to the application without valid credentials. This could lead to data breach, privilege escalation, and complete system compromise.',
    remediation: 'Implement parameterized queries or prepared statements for all database operations. Use an ORM framework with built-in SQL injection protection. Validate and sanitize all user inputs. Implement proper authentication mechanisms.',
    cvss40: sqlInjectionCvss,
    attackMappings: [
      {
        techniqueId: 'T1190',
        techniqueName: 'Exploit Public-Facing Application',
        tactic: 'Initial Access',
      },
      {
        techniqueId: 'T1078',
        techniqueName: 'Valid Accounts',
        tactic: 'Defense Evasion',
      },
    ],
    cweIds: ['CWE-89', 'CWE-943'],
  });

  // Create XSS finding
  const xssCvss = Cvss40Calculator.calculate({
    AV: 'N',
    AC: 'L',
    AT: 'N',
    PR: 'N',
    UI: 'P',
    VC: 'L',
    VI: 'L',
    VA: 'N',
    SC: 'L',
    SI: 'L',
    SA: 'N',
  });

  const finding2 = platform.findings.proposeFinding({
    runId: run.id,
    title: 'Reflected Cross-Site Scripting (XSS)',
    severity: 'high',
    confidence: 'confirmed',
    affectedAssets: ['https://example.com/search'],
    evidenceIds: [evidence2.id],
    reproSteps: [
      'Navigate to https://example.com/search',
      'Enter payload: <script>alert(document.cookie)</script>',
      'Submit search form',
      'Observe JavaScript execution in browser',
    ],
    impact: 'Attackers can execute arbitrary JavaScript in victim browsers, leading to session hijacking, credential theft, and malicious actions performed on behalf of authenticated users.',
    remediation: 'Implement proper output encoding for all user-supplied data. Use Content Security Policy (CSP) headers. Validate and sanitize input on both client and server side.',
    cvss40: xssCvss,
    attackMappings: [
      {
        techniqueId: 'T1059.007',
        techniqueName: 'Command and Scripting Interpreter: JavaScript',
        tactic: 'Execution',
      },
    ],
    cweIds: ['CWE-79'],
  });

  // Mark evidence as useful for validation
  platform.evidenceReviews.review({
    evidenceId: evidence1.id,
    status: 'useful',
    note: 'Clear demonstration of SQL injection vulnerability',
  });

  platform.evidenceReviews.review({
    evidenceId: evidence2.id,
    status: 'useful',
    note: 'Screenshot shows XSS payload execution',
  });

  // Validate findings
  platform.findings.updateValidationState(finding1.id, 'confirmed');
  platform.findings.updateValidationState(finding2.id, 'confirmed');

  // Generate executive report (use candidate_and_confirmed to bypass delivery-ready check)
  const report = platform.reports.generate({
    runId: run.id,
    format: 'executive',
    findingScope: 'candidate_and_confirmed',
  });

  // Verify report content
  assert.ok(report.markdown.includes('Security Assessment Report'));
  assert.ok(report.markdown.includes('Executive Summary'));
  assert.ok(report.markdown.includes('Risk Profile'));
  assert.ok(report.markdown.includes('CRITICAL'));
  assert.ok(report.markdown.includes('Critical: 1'));
  assert.ok(report.markdown.includes('High: 1'));

  // Verify CVSS 4.0 content
  assert.ok(report.markdown.includes('CVSS 4.0'));
  assert.ok(report.markdown.includes('CVSS:4.0/AV:N'));
  assert.ok(report.markdown.includes(sqlInjectionCvss.baseScore.toString()));

  // Verify ATT&CK mappings
  assert.ok(report.markdown.includes('ATT&CK Coverage'));
  assert.ok(report.markdown.includes('T1190'));
  assert.ok(report.markdown.includes('Initial Access'));
  assert.ok(report.markdown.includes('T1059.007'));

  // Verify CWE mappings
  assert.ok(report.markdown.includes('CWE-89'));
  assert.ok(report.markdown.includes('CWE-79'));

  // Verify severity chart
  assert.ok(report.markdown.includes('Severity Distribution'));

  // Verify risk summary table
  assert.ok(report.markdown.includes('Risk Summary'));
  assert.ok(report.markdown.includes('| Finding | Severity | CVSS 4.0 | Validation | Affected Assets |'));

  // Verify detailed findings
  assert.ok(report.markdown.includes('SQL Injection in Authentication'));
  assert.ok(report.markdown.includes('Reflected Cross-Site Scripting'));
  assert.ok(report.markdown.includes('Reproduction Steps'));
  assert.ok(report.markdown.includes('Impact'));
  assert.ok(report.markdown.includes('Remediation'));

  // Verify methodology section
  assert.ok(report.markdown.includes('Methodology'));
  assert.ok(report.markdown.includes('Comprehensive security assessment'));

  // Verify evidence references
  assert.ok(report.markdown.includes(evidence1.id));
  assert.ok(report.markdown.includes(evidence2.id));

  // Verify report evidence artifact was created
  assert.ok(report.evidenceId);
  assert.ok(report.sha256);

  const reportEvidence = platform.store.state.evidence[report.evidenceId];
  assert.ok(reportEvidence);
  assert.equal(reportEvidence.kind, 'replay_bundle');
  assert.equal(reportEvidence.redactionState, 'redacted');
});

test('ReportService falls back to legacy format for non-executive reports', async () => {
  const policy: ScopePolicy = {
    allowedAssets: ['example.com'],
    deniedAssets: [],
    allowedMethods: ['GET', 'POST'],
    destructiveAllowed: false,
    credentialRules: { allowVaultReferencesOnly: true },
    rateLimits: { requestsPerMinute: 120 },
  };

  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://example.com',
    goal: 'Test legacy format',
    scopePolicy: policy,
    workerPool: [],
  });

  const evidence = platform.evidence.addEvidence({
    runId: run.id,
    kind: 'http_exchange',
    content: 'test',
    redactionState: 'redacted',
  });

  const finding = platform.findings.proposeFinding({
    runId: run.id,
    title: 'Test Finding',
    severity: 'medium',
    confidence: 'confirmed',
    affectedAssets: ['https://example.com'],
    evidenceIds: [evidence.id],
    reproSteps: ['Step 1'],
    impact: 'Test impact',
    remediation: 'Test remediation',
  });

  platform.evidenceReviews.review({
    evidenceId: evidence.id,
    status: 'useful',
    note: 'Test',
  });

  platform.findings.updateValidationState(finding.id, 'confirmed');

  // Generate legacy format report (use candidate_and_confirmed to bypass delivery-ready check)
  const report = platform.reports.generate({
    runId: run.id,
    format: 'hackerone',
    findingScope: 'candidate_and_confirmed',
  });

  // Verify legacy format
  assert.ok(report.markdown.includes('# AgentRed Report'));
  assert.ok(report.markdown.includes('**Format**: hackerone'));
  assert.ok(report.markdown.includes('## Findings'));
  assert.ok(!report.markdown.includes('Executive Summary'));
  assert.ok(!report.markdown.includes('ATT&CK Coverage'));
});
