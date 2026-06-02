import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startApiServer } from '../src/api/server.js';
import { Dispatcher } from '../src/dispatcher/dispatcher.js';
import { createPlatform } from '../src/platform.js';
import { evaluateScope } from '../src/scope/policy.js';
import type { ScopePolicy } from '../src/domain/types.js';
import { CliWorkerAdapter } from '../src/workers/cli-worker.js';
import type { WorkerAdapter, WorkerTask, WorkerTaskResult } from '../src/workers/types.js';

const policy: ScopePolicy = {
  allowedAssets: ['example.com', '*.example.com', '10.10.0.0/24'],
  deniedAssets: ['admin.example.com'],
  allowedMethods: ['GET', 'POST'],
  destructiveAllowed: false,
  credentialRules: { allowVaultReferencesOnly: true },
  rateLimits: { requestsPerMinute: 120 },
};

test('ScopePolicy allows in-scope traffic and blocks denied, out-of-scope, R3, and R4 actions', () => {
  assert.equal(evaluateScope(policy, 'https://api.example.com/v1/users', 'GET', 'R1').action, 'allow');
  assert.equal(evaluateScope(policy, 'https://admin.example.com', 'GET', 'R1').action, 'deny');
  assert.equal(evaluateScope(policy, 'https://evil.test', 'GET', 'R1').action, 'deny');
  assert.equal(evaluateScope(policy, 'https://api.example.com/v1/users', 'DELETE', 'R1').action, 'deny');
  assert.equal(evaluateScope(policy, 'https://api.example.com/v1/users', 'POST', 'R3').action, 'approval_required');
  assert.equal(evaluateScope(policy, 'https://api.example.com/v1/users', 'POST', 'R3', 'approved').action, 'allow');
  assert.equal(evaluateScope(policy, 'https://api.example.com/v1/users', 'POST', 'R4', 'approved').action, 'deny');
  assert.equal(evaluateScope(policy, '10.10.0.42', 'GET', 'R1').action, 'allow');
});

test('ToolGateway records allowed invocations, blocks scope violations, and opens approval requests for R3', async () => {
  const target = await startTargetServer();
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: target.url,
    goal: 'Validate authorized bug bounty surface',
    scopePolicy: {
      ...policy,
      allowedAssets: ['127.0.0.1'],
      deniedAssets: [],
    },
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    const allowed = await platform.tools.invoke({
      runId: run.id,
      tool: 'http.request',
      target: `${target.url}/profile?token=secret-token`,
      method: 'GET',
      riskLevel: 'R1',
      args: { headers: { authorization: 'Bearer super-secret', 'x-api-key': 'super-secret' }, note: 'baseline request' },
    });
    assert.equal(allowed.status, 'allowed');
    assert.ok(allowed.invocationId);
    assert.ok(allowed.evidenceId);
    const evidence = platform.graph.getGraph(run.id).evidence.find((item) => item.id === allowed.evidenceId);
    assert.equal(evidence?.kind, 'http_exchange');
    assert.ok(evidence);
    const evidenceContent = platform.evidence.readEvidenceContent(evidence.id).toString('utf8');
    assert.ok(evidenceContent.includes('[redacted]'));
    assert.ok(!evidenceContent.includes('super-secret'));
    assert.ok(!evidenceContent.includes('secret-token'));
    const auditRecord = platform.store.state.toolInvocations[allowed.invocationId];
    assert.ok(!auditRecord.target.includes('secret-token'));
    assert.ok(!JSON.stringify(auditRecord.args).includes('super-secret'));

    const unsupported = await platform.tools.invoke({
      runId: run.id,
      tool: 'nmap.raw',
      target: `${target.url}/profile`,
      method: 'GET',
      riskLevel: 'R1',
      args: {},
    });
    assert.equal(unsupported.status, 'blocked');
    assert.match(unsupported.reason, /unsupported/i);

    const blocked = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target: 'https://out-of-scope.test',
      method: 'GET',
      riskLevel: 'R2',
      args: {},
    });
    assert.equal(blocked.status, 'blocked');
    assert.match(blocked.reason, /scope/i);

    const approval = await platform.tools.invoke({
      runId: run.id,
      tool: 'oast.start_session',
      target: `${target.url}/webhook`,
      method: 'POST',
      riskLevel: 'R3',
      args: {},
    });
    assert.equal(approval.status, 'approval_required');
    assert.ok(approval.approvalId);
  } finally {
    await target.close();
  }
});

test('ToolGateway enforces run rate limits before execution', async () => {
  const target = await startTargetServer();
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: target.url,
    goal: 'Throttle noisy tool execution',
    scopePolicy: {
      ...policy,
      allowedAssets: ['127.0.0.1'],
      deniedAssets: [],
      rateLimits: { requestsPerMinute: 1 },
    },
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    const first = await platform.tools.invoke({
      runId: run.id,
      tool: 'http.request',
      target: `${target.url}/first`,
      method: 'GET',
      riskLevel: 'R1',
      args: {},
    });
    assert.equal(first.status, 'allowed');

    const second = await platform.tools.invoke({
      runId: run.id,
      tool: 'http.request',
      target: `${target.url}/second`,
      method: 'GET',
      riskLevel: 'R1',
      args: {},
    });
    assert.equal(second.status, 'blocked');
    assert.match(second.reason, /rate limit/i);
  } finally {
    await target.close();
  }
});

test('ToolGateway exposes a tool catalog and scanner.run_template records template evidence', async () => {
  const target = await startTargetServer();
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: target.url,
    goal: 'Run governed scanner templates',
    scopePolicy: {
      ...policy,
      allowedAssets: ['127.0.0.1'],
      deniedAssets: [],
    },
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    const catalog = platform.tools.catalog();
    const scanner = catalog.find((tool) => tool.name === 'scanner.run_template');
    assert.ok(scanner);
    assert.ok(scanner.templates.some((template) => template.id === 'web.security_headers'));
    assert.ok(scanner.templates.some((template) => template.id === 'web.endpoint_discovery'));
    assert.ok(scanner.templates.some((template) => template.id === 'web.technology_fingerprint'));
    assert.ok(scanner.templates.some((template) => template.id === 'web.cookie_flags'));
    assert.ok(scanner.templates.some((template) => template.id === 'web.link_form_map'));
    assert.ok(
      scanner.templates.some(
        (template) =>
          template.id === 'web.nuclei.safe_templates' &&
          template.engine === 'nuclei' &&
          template.profileId === 'container.web-recon' &&
          template.adapterStatus === 'planned',
      ),
    );

    const result = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target: `${target.url}/profile`,
      method: 'GET',
      riskLevel: 'R2',
      args: { template: 'web.security_headers' },
    });
    assert.equal(result.status, 'allowed');
    assert.ok(result.evidenceId);
    const evidenceContent = platform.evidence.readEvidenceContent(result.evidenceId).toString('utf8');
    assert.match(evidenceContent, /web.security_headers/);
    assert.match(evidenceContent, /missingSecurityHeaders/);
    assert.match(evidenceContent, /content-security-policy/);

    const discovery = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target: `${target.url}/profile`,
      method: 'GET',
      riskLevel: 'R2',
      args: { template: 'web.endpoint_discovery' },
    });
    assert.equal(discovery.status, 'allowed');
    assert.ok(discovery.evidenceId);
    const discoveryContent = platform.evidence.readEvidenceContent(discovery.evidenceId).toString('utf8');
    assert.match(discoveryContent, /web.endpoint_discovery/);
    assert.match(discoveryContent, /robots.txt/);
    assert.match(discoveryContent, /security.txt/);
    assert.match(discoveryContent, /sitemap.xml/);

    const fingerprint = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target: `${target.url}/webapp`,
      method: 'GET',
      riskLevel: 'R1',
      args: { template: 'web.technology_fingerprint' },
    });
    assert.equal(fingerprint.status, 'allowed');
    assert.ok(fingerprint.evidenceId);
    const fingerprintContent = platform.evidence.readEvidenceContent(fingerprint.evidenceId).toString('utf8');
    assert.match(fingerprintContent, /web.technology_fingerprint/);
    assert.match(fingerprintContent, /x-powered-by/);
    assert.match(fingerprintContent, /next\.js/);

    const cookieFlags = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target: `${target.url}/webapp`,
      method: 'GET',
      riskLevel: 'R1',
      args: { template: 'web.cookie_flags' },
    });
    assert.equal(cookieFlags.status, 'allowed');
    assert.ok(cookieFlags.evidenceId);
    const cookieContent = platform.evidence.readEvidenceContent(cookieFlags.evidenceId).toString('utf8');
    assert.match(cookieContent, /web.cookie_flags/);
    assert.match(cookieContent, /missingFlags/);
    assert.ok(!cookieContent.includes('session-secret'));

    const linkMap = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target: `${target.url}/webapp`,
      method: 'GET',
      riskLevel: 'R1',
      args: { template: 'web.link_form_map' },
    });
    assert.equal(linkMap.status, 'allowed');
    assert.ok(linkMap.evidenceId);
    const linkMapContent = platform.evidence.readEvidenceContent(linkMap.evidenceId).toString('utf8');
    assert.match(linkMapContent, /web.link_form_map/);
    assert.match(linkMapContent, /\/profile/);
    assert.match(linkMapContent, /\/login/);

    const plannedExternal = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target: `${target.url}/profile`,
      method: 'GET',
      riskLevel: 'R2',
      args: { template: 'web.nuclei.safe_templates' },
    });
    assert.equal(plannedExternal.status, 'blocked');
    assert.match(plannedExternal.reason, /external toolbox execution is disabled|toolbox profile is unavailable/i);

    const unsupported = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target: `${target.url}/profile`,
      method: 'GET',
      riskLevel: 'R2',
      args: { template: 'unknown.template' },
    });
    assert.equal(unsupported.status, 'blocked');
    assert.match(unsupported.reason, /template/i);
  } finally {
    await target.close();
  }
});

test('ToolGateway executes sandboxed shell commands and records redacted output evidence', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Execute low-risk local tooling',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const result = await platform.tools.invoke({
    runId: run.id,
    tool: 'shell.run_sandboxed',
    target: 'https://app.example.com',
    method: 'POST',
    riskLevel: 'R2',
    args: {
      command: process.execPath,
      args: ['-e', 'console.log("token=shell-secret"); console.error("stderr ok")'],
      timeoutMs: 5_000,
    },
  });

  assert.equal(result.status, 'allowed');
  assert.ok(result.evidenceId);
  const evidence = platform.graph.getGraph(run.id).evidence.find((item) => item.id === result.evidenceId);
  assert.equal(evidence?.kind, 'command_output');
  assert.ok(evidence);
  const evidenceContent = platform.evidence.readEvidenceContent(evidence.id).toString('utf8');
  assert.ok(evidenceContent.includes('[redacted]'));
  assert.ok(evidenceContent.includes('stderr ok'));
  assert.ok(!evidenceContent.includes('shell-secret'));
});

test('ToolGateway blocks sandboxed shell commands outside the allowlist', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Block unsafe local tooling',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const result = await platform.tools.invoke({
    runId: run.id,
    tool: 'shell.run_sandboxed',
    target: 'https://app.example.com',
    method: 'POST',
    riskLevel: 'R2',
    args: { command: 'definitely-not-allowed', args: [] },
  });

  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /not allowed/i);
});

test('ToolGateway records timed-out sandboxed shell commands as evidence', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Timeout local tooling',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const result = await platform.tools.invoke({
    runId: run.id,
    tool: 'shell.run_sandboxed',
    target: 'https://app.example.com',
    method: 'POST',
    riskLevel: 'R2',
    args: {
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 5000)'],
      timeoutMs: 50,
    },
  });

  assert.equal(result.status, 'allowed');
  assert.ok(result.evidenceId);
  const evidence = platform.graph.getGraph(run.id).evidence.find((item) => item.id === result.evidenceId);
  assert.ok(evidence);
  const evidenceContent = platform.evidence.readEvidenceContent(evidence.id).toString('utf8');
  assert.ok(evidenceContent.includes('"timedOut":true'));
});

test('EvidenceEngine hashes evidence and FindingService rejects findings without evidence', () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Generate evidence-backed findings',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const evidence = platform.evidence.addEvidence({
    runId: run.id,
    kind: 'command_output',
    content: 'GET /profile returned user_id=123 for low privilege account',
    redactionState: 'redacted',
  });

  assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  assert.throws(
    () =>
      platform.findings.proposeFinding({
        runId: run.id,
        title: 'Evidence-free finding must fail',
        severity: 'high',
        confidence: 'likely',
        affectedAssets: ['https://app.example.com'],
        evidenceIds: [],
        reproSteps: ['Attempt to submit without evidence'],
        impact: 'Would be unverifiable',
        remediation: 'Attach evidence',
      }),
    /evidence/i,
  );

  const finding = platform.findings.proposeFinding({
    runId: run.id,
    title: 'Role context leak in profile endpoint',
    severity: 'medium',
    confidence: 'likely',
    affectedAssets: ['https://app.example.com/profile'],
    evidenceIds: [evidence.id],
    reproSteps: ['Replay the captured profile request'],
    impact: 'Low privilege user can observe cross-role metadata',
    remediation: 'Filter profile response by caller role',
  });
  assert.equal(finding.validationState, 'candidate');
  platform.evidenceReviews.review({ evidenceId: evidence.id, status: 'useful', reviewer: 'test' });
  const confirmed = platform.findings.updateValidationState(finding.id, 'confirmed');
  assert.equal(confirmed.validationState, 'confirmed');
});

test('ReportService records a replay bundle evidence artifact', () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Generate a report bundle',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const evidence = platform.evidence.addEvidence({
    runId: run.id,
    kind: 'command_output',
    content: 'redacted profile output',
    redactionState: 'redacted',
  });

  const reportFinding = platform.findings.proposeFinding({
    runId: run.id,
    title: 'Report bundle evidence trail',
    severity: 'low',
    confidence: 'confirmed',
    affectedAssets: ['https://app.example.com/profile'],
    evidenceIds: [evidence.id],
    reproSteps: ['Use the captured evidence to reconstruct the issue'],
    impact: 'Report generation should preserve the evidence trail',
    remediation: 'Store the report as a replay bundle evidence artifact',
  });
  platform.evidenceReviews.review({ evidenceId: evidence.id, status: 'useful', reviewer: 'test' });
  platform.findings.updateValidationState(reportFinding.id, 'confirmed');
  const rejected = platform.findings.proposeFinding({
    runId: run.id,
    title: 'Rejected report candidate',
    severity: 'low',
    confidence: 'likely',
    affectedAssets: ['https://app.example.com/rejected'],
    evidenceIds: [evidence.id],
    reproSteps: ['Do not include rejected candidates'],
    impact: 'Rejected candidates should stay out of report bundles',
    remediation: 'Reject the candidate before report generation',
  });
  platform.findings.updateValidationState(rejected.id, 'rejected');

  const report = platform.reports.generate({ runId: run.id, format: 'src' });

  assert.ok(report.evidenceId);
  const reportEvidence = platform.graph.getGraph(run.id).evidence.find((item) => item.id === report.evidenceId);
  assert.equal(reportEvidence?.kind, 'replay_bundle');
  const reportContent = platform.evidence.readEvidenceContent(report.evidenceId).toString('utf8');
  assert.match(reportContent, /Authorized AI Pentest Report/);
  assert.match(reportContent, /Report bundle evidence trail/);
  assert.doesNotMatch(reportContent, /Rejected report candidate/);
  assert.match(reportContent, new RegExp(evidence.id));
});

test('ReportService rejects raw-local-only evidence in report bundles', () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Reject unsafe report evidence',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const evidence = platform.evidence.addEvidence({
    runId: run.id,
    kind: 'command_output',
    content: 'local-only evidence',
    redactionState: 'raw_local_only',
  });

  const unsafeFinding = platform.findings.proposeFinding({
    runId: run.id,
    title: 'Unsafe report evidence',
    severity: 'low',
    confidence: 'confirmed',
    affectedAssets: ['https://app.example.com/profile'],
    evidenceIds: [evidence.id],
    reproSteps: ['Try to include raw evidence in a report'],
    impact: 'Raw local evidence should not go into report bundles',
    remediation: 'Redact the evidence first',
  });
  platform.evidenceReviews.review({ evidenceId: evidence.id, status: 'useful', reviewer: 'test' });
  platform.findings.updateValidationState(unsafeFinding.id, 'confirmed');

  assert.throws(() => platform.reports.generate({ runId: run.id, format: 'src' }), /redacted/i);
});

test('Dispatcher advances a run through bootstrap, reason, explore, and complete using a mock Agent Worker', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Validate a reproducible authorized finding',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  await platform.dispatcher.dispatchOnce(run.id);
  assert.match(platform.graph.getGraph(run.id).facts.at(-1)?.statement ?? '', /Bootstrap mapped/);

  await platform.dispatcher.dispatchOnce(run.id);
  assert.equal(platform.graph.getGraph(run.id).intents.filter((intent) => intent.status === 'open').length, 1);

  await platform.dispatcher.dispatchOnce(run.id);
  assert.match(platform.graph.getGraph(run.id).facts.at(-1)?.statement ?? '', /Validated intent/);

  await platform.dispatcher.dispatchOnce(run.id);
  assert.equal(platform.graph.getGraph(run.id).run.status, 'completed');
});

test('Run events and progress summarize the Agent Worker loop for desktop views', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Expose progress and reasoning timeline',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  assert.equal(platform.events.progress(run.id).phase, 'bootstrapping');
  assert.ok(platform.events.list(run.id).some((event) => event.type === 'run.created'));

  await platform.dispatcher.dispatchOnce(run.id);
  await platform.dispatcher.dispatchOnce(run.id);
  assert.equal(platform.events.progress(run.id).phase, 'queued');

  await platform.dispatcher.dispatchOnce(run.id);
  await platform.dispatcher.dispatchOnce(run.id);

  const events = platform.events.list(run.id);
  const eventTypes = events.map((event) => event.type);
  assert.ok(eventTypes.includes('dispatch.started'));
  assert.ok(eventTypes.includes('fact.added'));
  assert.ok(eventTypes.includes('intent.created'));
  assert.ok(eventTypes.includes('intent.claimed'));
  assert.ok(eventTypes.includes('intent.concluded'));
  assert.ok(eventTypes.includes('run.completed'));

  const progress = platform.events.progress(run.id);
  assert.equal(progress.status, 'completed');
  assert.equal(progress.phase, 'completed');
  assert.equal(progress.counts.intents.concluded, 1);
  assert.ok(progress.counts.facts >= 4);
  assert.ok(progress.lastEvent);
});

test('Observability records dispatcher, worker, tool, report, and evaluation telemetry', async () => {
  const target = await startTargetServer();
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: target.url,
    goal: 'Measure run quality and local execution cost',
    scopePolicy: {
      ...policy,
      allowedAssets: ['127.0.0.1'],
      deniedAssets: [],
    },
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    await platform.dispatcher.dispatchOnce(run.id);
    const tool = await platform.tools.invoke({
      runId: run.id,
      tool: 'http.request',
      target: `${target.url}/profile`,
      method: 'GET',
      riskLevel: 'R1',
      args: {},
    });
    assert.equal(tool.status, 'allowed');
    assert.ok(tool.evidenceId);
    const finding = platform.findings.proposeFinding({
      runId: run.id,
      title: 'Observable evidence-backed finding',
      severity: 'medium',
      confidence: 'likely',
      affectedAssets: [`${target.url}/profile`],
      evidenceIds: [tool.evidenceId],
      reproSteps: ['Replay the observed HTTP request'],
      impact: 'The run can be evaluated from durable telemetry.',
      remediation: 'Keep trace and evidence references attached to findings.',
    });
    platform.evidenceReviews.review({ evidenceId: tool.evidenceId, status: 'useful', reviewer: 'test' });
    platform.findings.updateValidationState(finding.id, 'confirmed');
    platform.reports.generate({ runId: run.id, format: 'enterprise' });

    const summary = platform.observability.summary(run.id);
    assert.ok(summary.spans.some((span) => span.kind === 'dispatch'));
    assert.ok(summary.spans.some((span) => span.kind === 'worker'));
    assert.ok(summary.spans.some((span) => span.kind === 'tool'));
    assert.ok(summary.spans.some((span) => span.kind === 'report'));
    assert.ok(summary.cost.entries.length >= 3);
    assert.ok(summary.cost.localRuntimeMs >= 0);

    const evaluation = platform.observability.evaluateRun(run.id);
    assert.equal(evaluation.grade, 'A');
    assert.equal(evaluation.score, 100);
    assert.ok(evaluation.checks.some((check) => check.id === 'traceability' && check.status === 'pass'));
    assert.equal(platform.observability.summary(run.id).latestEvaluation?.id, evaluation.id);
  } finally {
    await target.close();
  }
});

test('Run flow brief explains the assessment reasoning path for operator views', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Show a readable assessment path',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });
  const originFact = platform.graph.getGraph(run.id).facts[0];
  assert.ok(originFact);
  const intent = platform.graph.createIntent({
    runId: run.id,
    fromFactIds: [originFact.id],
    hypothesis: 'Check profile endpoint for evidence-backed exposure',
    riskLevel: 'R1',
    createdBy: 'operator.test',
  });
  const evidence = platform.evidence.addEvidence({
    runId: run.id,
    kind: 'http_exchange',
    content: 'GET /profile returned redacted metadata',
    redactionState: 'redacted',
  });
  platform.graph.concludeIntent(intent.id, 'Profile endpoint exposes redacted metadata for review', 'operator.test', [
    evidence.id,
  ]);
  platform.findings.proposeFinding({
    runId: run.id,
    title: 'Profile metadata exposure',
    severity: 'medium',
    confidence: 'likely',
    affectedAssets: ['https://app.example.com/profile'],
    evidenceIds: [evidence.id],
    reproSteps: ['Replay the captured HTTP exchange'],
    impact: 'Metadata exposure can be reviewed from evidence',
    remediation: 'Limit profile metadata by role',
  });

  const flow = platform.flow.getBrief(run.id);
  assert.equal(flow.runId, run.id);
  assert.equal(flow.phase, 'reasoning');
  assert.match(flow.summary, /Show a readable assessment path/);
  assert.ok(flow.steps.some((step) => step.kind === 'intent' && step.entityId === intent.id));
  assert.ok(flow.steps.some((step) => step.kind === 'evidence' && step.entityId === evidence.id));
  assert.ok(flow.steps.some((step) => step.kind === 'finding' && step.title === 'Profile metadata exposure'));
  assert.ok(flow.nextActions.some((action) => /report/i.test(action)));

  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  try {
    const flowResponse = await fetch(`${api.url}/runs/${run.id}/flow`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(flowResponse.status, 200);
    const payload = (await flowResponse.json()) as { steps: Array<{ kind: string }>; nextActions: string[] };
    assert.ok(payload.steps.some((step) => step.kind === 'intent'));
    assert.ok(payload.nextActions.length > 0);
  } finally {
    await api.close();
  }
});

test('Dispatcher releases a claimed intent when explore worker fails', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Release failed intent leases',
    scopePolicy: policy,
    workerPool: [{ name: 'failing-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });
  const intent = platform.graph.createIntent({
    runId: run.id,
    fromFactIds: [],
    hypothesis: 'This worker will fail',
    riskLevel: 'R1',
    createdBy: 'test',
  });
  const dispatcher = new Dispatcher(platform.graph, {
    workerFactory: () => new StaticWorker('failing-worker', async () => {
      throw new Error('worker crashed');
    }),
  });

  const result = await dispatcher.dispatchOnce(run.id);

  assert.equal(result.status, 'failed');
  const released = platform.graph.getGraph(run.id).intents.find((item) => item.id === intent.id);
  assert.equal(released?.status, 'released');
  assert.match(released?.releaseReason ?? '', /worker crashed/);
});

test('Dispatcher reclaims expired intent leases and dispatches them again', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Recover stale workers',
    scopePolicy: policy,
    workerPool: [{ name: 'recovery-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });
  const intent = platform.graph.createIntent({
    runId: run.id,
    fromFactIds: [],
    hypothesis: 'Lease should expire',
    riskLevel: 'R1',
    createdBy: 'test',
  });
  platform.graph.claimIntent(intent.id, 'stale-worker', 60_000);
  platform.store.state.intents[intent.id].leaseExpiresAt = '2000-01-01T00:00:00.000Z';
  const dispatcher = new Dispatcher(platform.graph, {
    workerFactory: () =>
      new StaticWorker('recovery-worker', async () => ({
        accepted: true,
        data: { description: 'Recovered and concluded stale intent' },
      })),
  });

  const result = await dispatcher.dispatchOnce(run.id);

  assert.equal(result.status, 'dispatched');
  const concluded = platform.graph.getGraph(run.id).intents.find((item) => item.id === intent.id);
  assert.equal(concluded?.status, 'concluded');
  assert.equal(concluded?.claimedBy, 'recovery-worker');
});

test('GraphServer heartbeats extend active intent leases and reject stale leases', () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Heartbeat worker sessions',
    scopePolicy: policy,
    workerPool: [{ name: 'heartbeat-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });
  const intent = platform.graph.createIntent({
    runId: run.id,
    fromFactIds: [],
    hypothesis: 'Heartbeat this lease',
    riskLevel: 'R1',
    createdBy: 'test',
  });
  const claimed = platform.graph.claimIntent(intent.id, 'heartbeat-worker', 10_000);
  const originalExpiry = Date.parse(claimed.leaseExpiresAt ?? '');

  const heartbeat = platform.graph.heartbeatIntent(intent.id, claimed.leaseId ?? '', 60_000);

  assert.ok(Date.parse(heartbeat.leaseExpiresAt ?? '') >= originalExpiry);
  assert.throws(() => platform.graph.heartbeatIntent(intent.id, 'stale-lease', 60_000), /lease/i);
});

test('CliWorkerAdapter accepts valid structured JSON output', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Parse valid CLI worker output',
    scopePolicy: policy,
    workerPool: [],
  });
  const worker = new CliWorkerAdapter({
    name: 'cli-valid',
    type: 'codex',
    maxRunning: 1,
    priority: 0,
    command: process.execPath,
    args: ['-e', 'console.log(JSON.stringify({accepted:true,data:{fact:{description:"valid cli fact"}}}))'],
  });

  const result = await worker.execute({ type: 'bootstrap', graph: platform.graph.getGraph(run.id) });

  assert.equal(result.accepted, true);
  assert.equal(result.accepted ? result.data.fact?.description : '', 'valid cli fact');
});

test('CliWorkerAdapter rejects malformed worker result schemas', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Reject invalid CLI worker output',
    scopePolicy: policy,
    workerPool: [],
  });
  const worker = new CliWorkerAdapter({
    name: 'cli-invalid',
    type: 'codex',
    maxRunning: 1,
    priority: 0,
    command: process.execPath,
    args: ['-e', 'console.log(JSON.stringify({accepted:true,data:{intent:{from:[]}}}))'],
  });

  const result = await worker.execute({ type: 'reason', graph: platform.graph.getGraph(run.id) });

  assert.equal(result.accepted, false);
  assert.match(result.reason, /invalid/i);
});

test('CliWorkerAdapter times out and kills long-running worker processes', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Timeout CLI worker output',
    scopePolicy: policy,
    workerPool: [],
  });
  const worker = new CliWorkerAdapter({
    name: 'cli-timeout',
    type: 'codex',
    maxRunning: 1,
    priority: 0,
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 5000)'],
    timeoutMs: 50,
  });

  const result = await worker.execute({ type: 'bootstrap', graph: platform.graph.getGraph(run.id) });

  assert.equal(result.accepted, false);
  assert.match(result.reason, /timed out/i);
});

test('REST API creates runs, records hints, returns graphs, and generates reports', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  const authHeaders = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const healthResponse = await fetch(`${api.url}/health`);
    assert.equal(healthResponse.status, 200);
    const health = (await healthResponse.json()) as { status: string };
    assert.equal(health.status, 'ok');

    const indexResponse = await fetch(`${api.url}/`);
    assert.equal(indexResponse.status, 200);
    const index = (await indexResponse.json()) as { status: string; auth: string };
    assert.equal(index.status, 'ok');
    assert.match(index.auth, /required/i);

    const unauthorizedResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(unauthorizedResponse.status, 401);

    const malformedResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: '{',
    });
    assert.equal(malformedResponse.status, 400);

    const invalidResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ target: '', goal: '', scopePolicy: {}, workerPool: [] }),
    });
    assert.equal(invalidResponse.status, 400);

    const secretEnvResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        target: 'https://app.example.com',
        goal: 'Reject worker secrets in run state',
        scopePolicy: policy,
        workerPool: [
          {
            name: 'codex-worker',
            type: 'codex',
            maxRunning: 1,
            priority: 0,
            command: 'codex',
            env: { OPENAI_API_KEY: 'should-not-be-stored' },
          },
        ],
      }),
    });
    assert.equal(secretEnvResponse.status, 400);
    const secretEnvError = (await secretEnvResponse.json()) as { error: string };
    assert.match(secretEnvError.error, /server process environment/i);

    const createResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        target: 'https://app.example.com',
        goal: 'Produce an evidence-backed report',
        scopePolicy: policy,
        workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
      }),
    });
    assert.equal(createResponse.status, 201);
    const run = (await createResponse.json()) as { id: string };

    const hintResponse = await fetch(`${api.url}/runs/${run.id}/hints`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: 'Focus authenticated profile traffic first' }),
    });
    assert.equal(hintResponse.status, 201);

    const graphResponse = await fetch(`${api.url}/runs/${run.id}/graph`, { headers: authHeaders });
    assert.equal(graphResponse.status, 200);
    const graph = (await graphResponse.json()) as { hints: Array<{ text: string }> };
    assert.equal(graph.hints[0]?.text, 'Focus authenticated profile traffic first');

    const eventsResponse = await fetch(`${api.url}/runs/${run.id}/events`, { headers: authHeaders });
    assert.equal(eventsResponse.status, 200);
    const events = (await eventsResponse.json()) as Array<{ type: string }>;
    assert.ok(events.some((event) => event.type === 'hint.added'));

    const progressResponse = await fetch(`${api.url}/runs/${run.id}/progress`, { headers: authHeaders });
    assert.equal(progressResponse.status, 200);
    const progress = (await progressResponse.json()) as { status: string; counts: { facts: number; hints: number } };
    assert.equal(progress.status, 'active');
    assert.equal(progress.counts.hints, 1);
    assert.ok(progress.counts.facts >= 2);

    const reportResponse = await fetch(`${api.url}/reports`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ runId: run.id, format: 'hackerone' }),
    });
    assert.equal(reportResponse.status, 201);
    const report = (await reportResponse.json()) as { markdown: string; evidenceId: string };
    assert.match(report.markdown, /Authorized AI Pentest Report/);
    assert.ok(report.evidenceId);
    const reportEvidenceResponse = await fetch(`${api.url}/evidence/${report.evidenceId}/content`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(reportEvidenceResponse.status, 200);
    const reportEvidence = (await reportEvidenceResponse.json()) as { content: string };
    assert.match(reportEvidence.content, /Authorized AI Pentest Report/);
  } finally {
    await api.close();
  }
});

test('REST API reports Agent Worker runtime health for a run', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  const authHeaders = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const createResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        target: 'https://app.example.com',
        goal: 'Inspect worker runtime health',
        scopePolicy: policy,
        workerPool: [
          { name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 },
          { name: 'codex-worker', type: 'codex', maxRunning: 1, priority: 1 },
        ],
      }),
    });
    assert.equal(createResponse.status, 201);
    const run = (await createResponse.json()) as { id: string };

    const workersResponse = await fetch(`${api.url}/runs/${run.id}/workers`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(workersResponse.status, 200);
    const workers = (await workersResponse.json()) as Array<{
      name: string;
      type: string;
      status: string;
      healthy: boolean;
      commandConfigured: boolean;
      reason?: string;
    }>;
    assert.equal(workers.length, 2);
    assert.deepEqual(
      workers.map((worker) => worker.name),
      ['mock-worker', 'codex-worker'],
    );
    assert.equal(workers[0]?.status, 'healthy');
    assert.equal(workers[0]?.healthy, true);
    assert.equal(workers[1]?.status, 'unhealthy');
    assert.equal(workers[1]?.healthy, false);
    assert.equal(workers[1]?.commandConfigured, false);
    assert.match(workers[1]?.reason ?? '', /command/i);
  } finally {
    await api.close();
  }
});

test('REST API exposes run observability summary and quality evaluations', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  const authHeaders = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const createResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        target: 'https://app.example.com',
        goal: 'Expose observability through the API',
        scopePolicy: policy,
        workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
      }),
    });
    assert.equal(createResponse.status, 201);
    const run = (await createResponse.json()) as { id: string };

    const dispatchResponse = await fetch(`${api.url}/runs/${run.id}/dispatch`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(dispatchResponse.status, 200);

    const summaryResponse = await fetch(`${api.url}/runs/${run.id}/observability`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(summaryResponse.status, 200);
    const summary = (await summaryResponse.json()) as {
      counts: { spans: number };
      spans: Array<{ kind: string; status: string }>;
      cost: { entries: Array<{ source: string }>; localRuntimeMs: number };
    };
    assert.ok(summary.counts.spans >= 2);
    assert.ok(summary.spans.some((span) => span.kind === 'dispatch'));
    assert.ok(summary.spans.some((span) => span.kind === 'worker'));
    assert.ok(summary.cost.entries.some((entry) => entry.source === 'worker'));

    const evaluationResponse = await fetch(`${api.url}/runs/${run.id}/evaluations`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(evaluationResponse.status, 201);
    const evaluation = (await evaluationResponse.json()) as { score: number; checks: Array<{ id: string }> };
    assert.ok(evaluation.score > 0);
    assert.ok(evaluation.checks.some((check) => check.id === 'traceability'));

    const reviewResponse = await fetch(`${api.url}/runs/${run.id}/review`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(reviewResponse.status, 200);
    const review = (await reviewResponse.json()) as { observability: { latestEvaluation: { score: number } } };
    assert.equal(review.observability.latestEvaluation.score, evaluation.score);
  } finally {
    await api.close();
  }
});

test('REST API lists runs and serves the local operator console shell', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Render the operator console',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  try {
    const appResponse = await fetch(`${api.url}/app`);
    assert.equal(appResponse.status, 200);
    assert.match(appResponse.headers.get('content-type') ?? '', /text\/html/);
    const appHtml = await appResponse.text();
    assert.match(appHtml, /Operator Console/);
    assert.match(appHtml, /language-select/);
    assert.match(appHtml, /Mission Launch Pad/);
    assert.match(appHtml, /id="launch-pad"/);
    assert.match(appHtml, /AI Configuration/);
    assert.match(appHtml, /ai-base-url/);
    assert.match(appHtml, /ai-api-key/);
    assert.match(appHtml, /ai-model/);
    assert.match(appHtml, /automation-mode/);
    assert.match(appHtml, /automation-depth/);
    assert.match(appHtml, /Start Automated AI Pentest/);
    assert.match(appHtml, /Current runtime: Codex CLI worker/);
    assert.match(appHtml, /run-history-panel/);
    assert.match(appHtml, /toggle-run-history/);
    assert.match(appHtml, /run-search/);
    assert.match(appHtml, /worker-json-details/);
    assert.match(appHtml, /Review Queue/);
    assert.match(appHtml, /Evidence Inbox/);
    assert.match(appHtml, /HTTP Capture/);
    assert.match(appHtml, /Scanner Template/);
    assert.match(appHtml, /Proxy Session/);
    assert.match(appHtml, /Agent Workers/);
    assert.match(appHtml, /Assessment Flow/);
    assert.match(appHtml, /Tool Catalog/);
    assert.match(appHtml, /Toolbox Profiles/);
    assert.match(appHtml, /Telemetry & Eval/);
    assert.match(appHtml, /\/app\/app\.js/);

    const scriptResponse = await fetch(`${api.url}/app/app.js`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get('content-type') ?? '', /javascript/);
    const scriptText = await scriptResponse.text();
    assert.match(scriptText, /refreshProgress/);
    assert.match(scriptText, /translations/);
    assert.match(scriptText, /zh-CN/);
    assert.match(scriptText, /applyLanguage/);
    assert.match(scriptText, /countTranslations/);
    assert.match(scriptText, /platformAiConfig/);
    assert.match(scriptText, /applyAiConfigToWorkerPool/);
    assert.match(scriptText, /startAutomatedPentest/);
    assert.match(scriptText, /automationTicksForMode/);
    assert.match(scriptText, /startAutomationForMode/);
    assert.match(scriptText, /renderRunHistorySummary/);
    assert.match(scriptText, /setRunHistoryCollapsed/);
    assert.match(scriptText, /refreshReview/);
    assert.match(scriptText, /submitFinding/);
    assert.match(scriptText, /decideFinding/);
    assert.match(scriptText, /\/validation/);
    assert.match(scriptText, /submitHttpCapture/);
    assert.match(scriptText, /submitScannerTemplate/);
    assert.match(scriptText, /startProxySession/);
    assert.match(scriptText, /renderProxySessions/);
    assert.match(scriptText, /renderWorkers/);
    assert.match(scriptText, /renderFlow/);
    assert.match(scriptText, /\/flow/);
    assert.match(scriptText, /renderToolCatalog/);
    assert.match(scriptText, /\/tool-catalog/);
    assert.match(scriptText, /renderToolboxProfiles/);
    assert.match(scriptText, /\/toolbox-profiles/);
    assert.match(scriptText, /renderObservability/);
    assert.match(scriptText, /\/observability/);
    assert.match(scriptText, /\/evaluations/);

    const styleResponse = await fetch(`${api.url}/app/styles.css`);
    assert.equal(styleResponse.status, 200);
    assert.match(styleResponse.headers.get('content-type') ?? '', /text\/css/);
    const styleText = await styleResponse.text();
    assert.match(styleText, /Enterprise console layout/);
    assert.match(styleText, /Tang official rank palette/);
    assert.match(styleText, /--tang-purple/);
    assert.match(styleText, /--tang-crimson/);
    assert.match(styleText, /--tang-green/);
    assert.match(styleText, /--tang-cyan/);
    assert.match(styleText, /#ai-configuration \.form-row\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(styleText, /@media \(max-width: 360px\)[\s\S]*#ai-configuration \.form-row\s*{\s*grid-template-columns: 1fr;/);
    assert.match(styleText, /@media \(max-width: 640px\)[\s\S]*overflow-x: hidden;/);

    const catalogResponse = await fetch(`${api.url}/tool-catalog`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(catalogResponse.status, 200);
    const catalog = (await catalogResponse.json()) as Array<{ name: string; templates: Array<{ id: string }> }>;
    assert.ok(catalog.some((tool) => tool.name === 'scanner.run_template'));
    assert.ok(catalog.some((tool) => tool.templates.some((template) => template.id === 'web.security_headers')));
    assert.ok(catalog.some((tool) => tool.templates.some((template) => template.id === 'web.endpoint_discovery')));
    assert.ok(catalog.some((tool) => tool.templates.some((template) => template.id === 'web.technology_fingerprint')));
    assert.ok(catalog.some((tool) => tool.templates.some((template) => template.id === 'web.nuclei.safe_templates')));

    const toolboxResponse = await fetch(`${api.url}/toolbox-profiles`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(toolboxResponse.status, 200);
    const profiles = (await toolboxResponse.json()) as Array<{ id: string; status: string; commands: string[] }>;
    assert.ok(profiles.some((profile) => profile.id === 'builtin.web' && profile.status === 'available'));
    assert.ok(profiles.some((profile) => profile.id === 'container.web-recon' && profile.commands.includes('nuclei')));

    const runsResponse = await fetch(`${api.url}/runs`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(runsResponse.status, 200);
    const runs = (await runsResponse.json()) as Array<{ id: string; progress: { phase: string } }>;
    assert.equal(runs[0]?.id, run.id);
    assert.equal(runs[0]?.progress.phase, 'bootstrapping');
  } finally {
    await api.close();
  }
});

test('REST API exposes runtime-probed toolbox profile readiness', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  try {
    const response = await fetch(`${api.url}/toolbox-profiles`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(response.status, 200);
    const profiles = (await response.json()) as Array<{
      id: string;
      status: string;
      available?: boolean;
      runtimeStatus?: string;
      runner?: string;
      reason?: string;
    }>;
    const builtin = profiles.find((profile) => profile.id === 'builtin.web');
    assert.ok(builtin);
    assert.equal(builtin.available, true);
    assert.equal(builtin.runtimeStatus, 'available');
    assert.equal(builtin.runner, 'builtin');

    const webRecon = profiles.find((profile) => profile.id === 'container.web-recon');
    assert.ok(webRecon);
    assert.equal(webRecon.available, false);
    assert.equal(webRecon.runtimeStatus, 'planned');
    assert.equal(webRecon.runner, 'none');
    assert.match(webRecon.reason ?? '', /PLATFORM_ENABLE_CONTAINER_TOOLBOX/);
  } finally {
    await api.close();
  }
});

test('REST API returns a run review bundle for approvals, audit, evidence, findings, and reports', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Review an evidence-backed run',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });
  const evidence = platform.evidence.addEvidence({
    runId: run.id,
    kind: 'command_output',
    content: 'redacted reviewer evidence',
    redactionState: 'redacted',
  });
  platform.findings.proposeFinding({
    runId: run.id,
    title: 'Reviewable finding',
    severity: 'medium',
    confidence: 'likely',
    affectedAssets: ['https://app.example.com/profile'],
    evidenceIds: [evidence.id],
    reproSteps: ['Open the reviewer evidence'],
    impact: 'The review bundle should expose this finding',
    remediation: 'Keep findings tied to evidence',
  });
  const report = platform.reports.generate({ runId: run.id, format: 'src' });
  const approval = await platform.tools.invoke({
    runId: run.id,
    tool: 'oast.start_session',
    target: 'https://app.example.com/webhook',
    method: 'POST',
    riskLevel: 'R3',
    args: {},
  });
  assert.equal(approval.status, 'approval_required');

  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  const authHeaders = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const reviewResponse = await fetch(`${api.url}/runs/${run.id}/review`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(reviewResponse.status, 200);
    const review = (await reviewResponse.json()) as {
      approvals: Array<{ id: string; status: string }>;
      toolInvocations: Array<{ status: string }>;
      evidence: Array<{ id: string }>;
      findings: Array<{ title: string }>;
      reports: Array<{ id: string }>;
      progress: { phase: string };
    };
    assert.equal(review.progress.phase, 'awaiting_approval');
    assert.equal(review.approvals[0]?.status, 'pending');
    assert.equal(review.toolInvocations[0]?.status, 'approval_required');
    assert.ok(review.evidence.some((item) => item.id === evidence.id));
    assert.equal(review.findings[0]?.title, 'Reviewable finding');
    assert.ok(review.reports.some((item) => item.id === report.evidenceId));

    const decisionResponse = await fetch(`${api.url}/approvals/${review.approvals[0]?.id}/decision`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(decisionResponse.status, 200);

    const updatedReviewResponse = await fetch(`${api.url}/runs/${run.id}/review`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(updatedReviewResponse.status, 200);
    const updatedReview = (await updatedReviewResponse.json()) as { approvals: Array<{ status: string }> };
    assert.equal(updatedReview.approvals[0]?.status, 'approved');
  } finally {
    await api.close();
  }
});

test('REST API imports evidence and proposes evidence-backed findings', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  const authHeaders = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const createResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        target: 'https://app.example.com',
        goal: 'Turn imported evidence into a finding',
        scopePolicy: policy,
        workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
      }),
    });
    assert.equal(createResponse.status, 201);
    const run = (await createResponse.json()) as { id: string };

    const evidenceResponse = await fetch(`${api.url}/runs/${run.id}/evidence`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        kind: 'http_exchange',
        redactionState: 'redacted',
        content: {
          request: { method: 'GET', target: 'https://app.example.com/profile' },
          response: { status: 200, bodyPreview: 'redacted user profile metadata' },
        },
      }),
    });
    assert.equal(evidenceResponse.status, 201);
    const evidence = (await evidenceResponse.json()) as { id: string; sha256: string; kind: string };
    assert.equal(evidence.kind, 'http_exchange');
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/);

    const emptyFindingResponse = await fetch(`${api.url}/runs/${run.id}/findings`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Evidence-free finding',
        severity: 'medium',
        confidence: 'likely',
        affectedAssets: ['https://app.example.com/profile'],
        evidenceIds: [],
        reproSteps: ['Missing evidence should fail'],
        impact: 'Unreviewable',
        remediation: 'Attach evidence',
      }),
    });
    assert.equal(emptyFindingResponse.status, 400);

    const findingResponse = await fetch(`${api.url}/runs/${run.id}/findings`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Imported profile metadata exposure',
        severity: 'medium',
        confidence: 'likely',
        affectedAssets: ['https://app.example.com/profile'],
        evidenceIds: [evidence.id],
        reproSteps: ['Replay the imported HTTP exchange'],
        impact: 'Profile metadata can be reviewed from captured evidence',
        remediation: 'Filter profile metadata by caller role',
      }),
    });
    assert.equal(findingResponse.status, 201);
    const finding = (await findingResponse.json()) as { id: string; validationState: string };
    assert.equal(finding.validationState, 'candidate');

    const evidenceReviewResponse = await fetch(`${api.url}/evidence/${evidence.id}/review`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ status: 'useful', reviewer: 'test' }),
    });
    assert.equal(evidenceReviewResponse.status, 200);

    const validationResponse = await fetch(`${api.url}/findings/${finding.id}/validation`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ validationState: 'confirmed' }),
    });
    assert.equal(validationResponse.status, 200);
    const validatedFinding = (await validationResponse.json()) as { validationState: string };
    assert.equal(validatedFinding.validationState, 'confirmed');

    const reviewResponse = await fetch(`${api.url}/runs/${run.id}/review`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(reviewResponse.status, 200);
    const review = (await reviewResponse.json()) as {
      evidence: Array<{ id: string }>;
      findings: Array<{ title: string; evidenceIds: string[]; validationState: string }>;
    };
    assert.ok(review.evidence.some((item) => item.id === evidence.id));
    assert.equal(review.findings[0]?.title, 'Imported profile metadata exposure');
    assert.deepEqual(review.findings[0]?.evidenceIds, [evidence.id]);
    assert.equal(review.findings[0]?.validationState, 'confirmed');
  } finally {
    await api.close();
  }
});

test('REST API captures in-scope HTTP exchanges as redacted evidence and blocks out-of-scope captures', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  const authHeaders = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const createResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        target: 'https://app.example.com',
        goal: 'Capture browser and proxy traffic as evidence',
        scopePolicy: policy,
        workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
      }),
    });
    assert.equal(createResponse.status, 201);
    const run = (await createResponse.json()) as { id: string };

    const captureResponse = await fetch(`${api.url}/runs/${run.id}/captures/http-exchange`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        source: 'proxy',
        request: {
          method: 'GET',
          target: 'https://app.example.com/profile?token=browser-secret',
          headers: {
            authorization: 'Bearer browser-secret',
            cookie: 'session=browser-secret',
            'x-observed': 'safe-marker',
          },
          bodyPreview: 'access_token=browser-secret',
        },
        response: {
          status: 200,
          statusText: 'OK',
          headers: { 'set-cookie': 'session=browser-secret', 'content-type': 'application/json' },
          bodyPreview: '{"ok":true,"secret":"browser-secret"}',
        },
      }),
    });
    assert.equal(captureResponse.status, 201);
    const capture = (await captureResponse.json()) as { id: string; kind: string; redactionState: string; sha256: string };
    assert.equal(capture.kind, 'http_exchange');
    assert.equal(capture.redactionState, 'redacted');
    assert.match(capture.sha256, /^[a-f0-9]{64}$/);

    const contentResponse = await fetch(`${api.url}/evidence/${capture.id}/content`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(contentResponse.status, 200);
    const content = (await contentResponse.json()) as { content: string };
    assert.ok(content.content.includes('safe-marker'));
    assert.ok(content.content.includes('[redacted]'));
    assert.ok(!content.content.includes('browser-secret'));

    const blockedResponse = await fetch(`${api.url}/runs/${run.id}/captures/http-exchange`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        source: 'browser',
        request: { method: 'GET', target: 'https://evil.test/profile' },
        response: { status: 200 },
      }),
    });
    assert.equal(blockedResponse.status, 403);

    const reviewResponse = await fetch(`${api.url}/runs/${run.id}/review`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(reviewResponse.status, 200);
    const review = (await reviewResponse.json()) as { evidence: Array<{ id: string }> };
    assert.deepEqual(
      review.evidence.map((item) => item.id),
      [capture.id],
    );
  } finally {
    await api.close();
  }
});

test('REST API manages proxy capture sessions for desktop runner handoff', async () => {
  const platform = createPlatform();
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  const authHeaders = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const createResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        target: 'https://app.example.com',
        goal: 'Start a local proxy capture session',
        scopePolicy: policy,
        workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
      }),
    });
    assert.equal(createResponse.status, 201);
    const run = (await createResponse.json()) as { id: string };

    const startResponse = await fetch(`${api.url}/runs/${run.id}/proxy-sessions`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(startResponse.status, 201);
    const session = (await startResponse.json()) as {
      id: string;
      runId: string;
      status: string;
      proxyUrl: string;
      requiredHeaders: Record<string, string>;
      limitations: string[];
    };
    assert.equal(session.runId, run.id);
    assert.equal(session.status, 'active');
    assert.equal(session.proxyUrl, api.url);
    assert.equal(session.requiredHeaders['X-Capture-Run-Id'], run.id);
    assert.equal(session.requiredHeaders['X-Platform-Token'], '<local token>');
    assert.ok(session.limitations.some((item) => /CONNECT/i.test(item)));

    const listResponse = await fetch(`${api.url}/runs/${run.id}/proxy-sessions`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(listResponse.status, 200);
    const sessions = (await listResponse.json()) as Array<{ id: string; status: string }>;
    assert.equal(sessions[0]?.id, session.id);
    assert.equal(sessions[0]?.status, 'active');

    const reviewResponse = await fetch(`${api.url}/runs/${run.id}/review`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(reviewResponse.status, 200);
    const review = (await reviewResponse.json()) as { proxySessions: Array<{ id: string }> };
    assert.equal(review.proxySessions[0]?.id, session.id);

    const closeResponse = await fetch(`${api.url}/proxy-sessions/${session.id}/close`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(closeResponse.status, 200);
    const closed = (await closeResponse.json()) as { status: string; closedAt: string };
    assert.equal(closed.status, 'closed');
    assert.ok(Date.parse(closed.closedAt));
  } finally {
    await api.close();
  }
});

test('REST API accepts absolute-form HTTP proxy requests and captures redacted evidence', async () => {
  const target = await startTargetServer();
  const platform = createPlatform();
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  const authHeaders = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const createResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        target: target.url,
        goal: 'Capture traffic through the local HTTP proxy adapter',
        scopePolicy: {
          ...policy,
          allowedAssets: ['127.0.0.1'],
          deniedAssets: [],
        },
        workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
      }),
    });
    assert.equal(createResponse.status, 201);
    const run = (await createResponse.json()) as { id: string };

    const sessionResponse = await fetch(`${api.url}/runs/${run.id}/proxy-sessions`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(sessionResponse.status, 201);
    const session = (await sessionResponse.json()) as { id: string };

    const proxied = await requestViaHttpProxy(api.url, {
      target: `${target.url}/profile?token=proxy-secret`,
      headers: {
        'x-capture-run-id': run.id,
        'x-platform-token': 'test-token',
        authorization: 'Bearer target-secret',
      },
    });
    assert.equal(proxied.statusCode, 200);
    assert.ok(proxied.body.includes('Bearer target-secret'));

    const evidenceItems = platform.graph.getGraph(run.id).evidence;
    assert.equal(evidenceItems.length, 1);
    assert.equal(evidenceItems[0]?.kind, 'http_exchange');
    const evidenceContent = platform.evidence.readEvidenceContent(evidenceItems[0]?.id ?? '').toString('utf8');
    assert.ok(evidenceContent.includes('[redacted]'));
    assert.ok(!evidenceContent.includes('proxy-secret'));
    assert.ok(!evidenceContent.includes('target-secret'));
    assert.ok(!evidenceContent.includes('test-token'));

    const blocked = await requestViaHttpProxy(api.url, {
      target: 'http://evil.test/profile',
      headers: {
        'x-capture-run-id': run.id,
        'x-platform-token': 'test-token',
      },
    });
    assert.equal(blocked.statusCode, 403);
    assert.equal(platform.graph.getGraph(run.id).evidence.length, 1);

    const unauthenticated = await requestViaHttpProxy(api.url, {
      target: `${target.url}/missing-token`,
      headers: { 'x-capture-run-id': run.id },
    });
    assert.equal(unauthenticated.statusCode, 407);
    assert.equal(platform.graph.getGraph(run.id).evidence.length, 1);

    const closeResponse = await fetch(`${api.url}/proxy-sessions/${session.id}/close`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(closeResponse.status, 200);
    const closed = await requestViaHttpProxy(api.url, {
      target: `${target.url}/closed-session`,
      headers: {
        'x-capture-run-id': run.id,
        'x-platform-token': 'test-token',
      },
    });
    assert.equal(closed.statusCode, 409);
    assert.equal(platform.graph.getGraph(run.id).evidence.length, 1);
  } finally {
    await api.close();
    await target.close();
  }
});

test('REST API exposes tool invocation, approval review, audit, and local evidence content', async () => {
  const target = await startTargetServer();
  const platform = createPlatform();
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  const authHeaders = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  try {
    const createResponse = await fetch(`${api.url}/runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        target: target.url,
        goal: 'Exercise tool gateway from the API',
        scopePolicy: {
          ...policy,
          allowedAssets: ['127.0.0.1'],
          deniedAssets: [],
        },
        workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
      }),
    });
    assert.equal(createResponse.status, 201);
    const run = (await createResponse.json()) as { id: string };

    const invokeResponse = await fetch(`${api.url}/runs/${run.id}/tools`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tool: 'http.request',
        target: `${target.url}/profile?token=api-secret`,
        method: 'GET',
        riskLevel: 'R1',
        args: { headers: { authorization: 'Bearer api-secret' } },
      }),
    });
    assert.equal(invokeResponse.status, 200);
    const invocation = (await invokeResponse.json()) as { status: string; evidenceId: string };
    assert.equal(invocation.status, 'allowed');
    assert.ok(invocation.evidenceId);

    const evidenceResponse = await fetch(`${api.url}/evidence/${invocation.evidenceId}/content`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(evidenceResponse.status, 200);
    const evidenceContent = (await evidenceResponse.json()) as { content: string };
    assert.ok(evidenceContent.content.includes('[redacted]'));
    assert.ok(!evidenceContent.content.includes('api-secret'));

    const auditResponse = await fetch(`${api.url}/runs/${run.id}/tool-invocations`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(auditResponse.status, 200);
    const audit = (await auditResponse.json()) as Array<{ tool: string }>;
    assert.equal(audit[0]?.tool, 'http.request');
    assert.ok(!JSON.stringify(audit).includes('api-secret'));

    const approvalResponse = await fetch(`${api.url}/runs/${run.id}/tools`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        tool: 'oast.start_session',
        target: `${target.url}/webhook?token=api-secret`,
        method: 'POST',
        riskLevel: 'R3',
        args: {},
      }),
    });
    assert.equal(approvalResponse.status, 200);
    const approvalRequired = (await approvalResponse.json()) as { status: string; approvalId: string };
    assert.equal(approvalRequired.status, 'approval_required');
    assert.ok(approvalRequired.approvalId);

    const approvalsResponse = await fetch(`${api.url}/runs/${run.id}/approvals`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(approvalsResponse.status, 200);
    const approvals = (await approvalsResponse.json()) as Array<{ status: string }>;
    assert.equal(approvals[0]?.status, 'pending');
    assert.ok(!JSON.stringify(approvals).includes('api-secret'));
  } finally {
    await api.close();
    await target.close();
  }
});

test('REST API heartbeats claimed intent leases', async () => {
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Heartbeat through the API',
    scopePolicy: policy,
    workerPool: [{ name: 'api-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });
  const intent = platform.graph.createIntent({
    runId: run.id,
    fromFactIds: [],
    hypothesis: 'API heartbeat intent',
    riskLevel: 'R1',
    createdBy: 'test',
  });
  const claimed = platform.graph.claimIntent(intent.id, 'api-worker', 10_000);
  const api = await startApiServer(platform, { port: 0, authToken: 'test-token' });
  try {
    const heartbeatResponse = await fetch(`${api.url}/intents/${intent.id}/heartbeat`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ leaseId: claimed.leaseId }),
    });
    assert.equal(heartbeatResponse.status, 200);
    const heartbeat = (await heartbeatResponse.json()) as { status: string; leaseExpiresAt: string };
    assert.equal(heartbeat.status, 'claimed');
    assert.ok(Date.parse(heartbeat.leaseExpiresAt) >= Date.parse(claimed.leaseExpiresAt ?? ''));
  } finally {
    await api.close();
  }
});

class StaticWorker implements WorkerAdapter {
  constructor(
    public readonly name: string,
    private readonly handler: (task: WorkerTask) => Promise<WorkerTaskResult>,
  ) {}

  async healthcheck(): Promise<boolean> {
    return true;
  }

  execute(task: WorkerTask): Promise<WorkerTaskResult> {
    return this.handler(task);
  }
}

async function startTargetServer(): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer((request, response) => {
    if (request.url?.startsWith('/webapp')) {
      response.writeHead(200, {
        'content-type': 'text/html',
        'x-powered-by': 'Next.js',
        'set-cookie': 'session=session-secret; Path=/; HttpOnly',
      });
      response.end(
        '<!doctype html><html><head><script id="__NEXT_DATA__">{}</script></head><body><a href="/profile">Profile</a><a href="https://external.example/">External</a><form method="post" action="/login"></form></body></html>',
      );
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, path: request.url, authorization: request.headers.authorization ?? null }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to start target server');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function requestViaHttpProxy(
  proxyUrl: string,
  input: { target: string; method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ statusCode: number; body: string }> {
  const proxy = new URL(proxyUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: proxy.hostname,
        port: Number(proxy.port),
        method: input.method ?? 'GET',
        path: input.target,
        headers: input.headers,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          resolve({ statusCode: response.statusCode ?? 0, body });
        });
      },
    );
    request.on('error', reject);
    if (input.body) {
      request.write(input.body);
    }
    request.end();
  });
}

test('SQLite-backed platform reloads the local graph state', () => {
  const dir = join(tmpdir(), `ai-pentest-platform-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const databasePath = join(dir, 'platform.db');
  try {
    const first = createPlatform({ databasePath });
    const run = first.graph.createRun({
      target: 'https://app.example.com',
      goal: 'Persist local execution state',
      scopePolicy: policy,
      workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
    });
    first.graph.addHint(run.id, 'Persist this hint');
    const evidence = first.evidence.addEvidence({
      runId: run.id,
      kind: 'command_output',
      content: 'persisted evidence content',
      redactionState: 'redacted',
    });

    const second = createPlatform({ databasePath });
    const graph = second.graph.getGraph(run.id);
    assert.equal(graph.run.goal, 'Persist local execution state');
    assert.equal(graph.hints[0]?.text, 'Persist this hint');
    assert.equal(second.evidence.readEvidenceContent(evidence.id).toString('utf8'), 'persisted evidence content');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
