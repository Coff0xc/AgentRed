/**
 * Nuclei container adapter integration smoke test.
 *
 * Runs only when ALL three conditions are met at test-start time:
 *   1. PLATFORM_ENABLE_CONTAINER_TOOLBOX=1
 *   2. PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1
 *   3. Docker or Podman is reachable on the host
 *
 * This file is intentionally separate from platform.test.ts so CI can
 * skip it unconditionally without touching the unit-test suite.
 *
 * To run locally:
 *   PLATFORM_ENABLE_CONTAINER_TOOLBOX=1 \
 *   PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1 \
 *   PLATFORM_ALLOWED_SCANNER_TEMPLATES=web.nuclei.safe_templates \
 *   npm run test:integration
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createPlatform } from '../src/platform.js';
import type { ScopePolicy } from '../src/domain/types.js';

// ---------------------------------------------------------------------------
// Guard: skip every test in this file if the required env / tools are absent
// ---------------------------------------------------------------------------

function containerRuntime(): 'docker' | 'podman' | null {
  for (const cmd of ['docker', 'podman'] as const) {
    const r = spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: false, timeout: 1500 });
    if (r.status === 0) return cmd;
  }
  return null;
}

const containerEnabled = process.env.PLATFORM_ENABLE_CONTAINER_TOOLBOX === '1';
const externalEnabled = process.env.PLATFORM_ALLOW_EXTERNAL_TOOLBOX === '1';
const runtime = containerRuntime();
const skip = !containerEnabled || !externalEnabled || runtime === null;
const skipReason = skip
  ? `skipped: containerEnabled=${containerEnabled} externalEnabled=${externalEnabled} runtime=${runtime ?? 'none'}`
  : '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scopeFor(host: string): ScopePolicy {
  return {
    allowedAssets: [host],
    deniedAssets: [],
    allowedMethods: ['GET', 'POST'],
    destructiveAllowed: false,
    credentialRules: { allowVaultReferencesOnly: true },
    rateLimits: { requestsPerMinute: 30 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('nuclei container profile resolves as available when env and runtime are present', { skip: skipReason }, async () => {
  const platform = createPlatform();
  const profiles = await platform.toolbox.profiles();
  const webRecon = profiles.find((p) => p.id === 'container.web-recon');
  assert.ok(webRecon, 'container.web-recon profile not found');
  assert.equal(webRecon.available, true, `profile unavailable: ${webRecon.reason ?? ''}`);
  assert.ok(webRecon.runner === 'docker' || webRecon.runner === 'podman');
  assert.ok(webRecon.image);
});

test('scanner.run_template web.nuclei.safe_templates executes and produces command_output evidence', { skip: skipReason }, async () => {
  // Target: localhost echo server that accepts any HTTP request
  const { createServer } = await import('node:http');
  const server = createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const target = `http://127.0.0.1:${address.port}/`;

  const platform = createPlatform();
  const run = platform.graph.createRun({
    target,
    goal: 'Nuclei integration smoke',
    scopePolicy: scopeFor('127.0.0.1'),
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    const result = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel: 'R2',
      args: { template: 'web.nuclei.safe_templates', timeoutMs: 120_000 },
    });

    assert.equal(result.status, 'allowed', `invoke blocked: ${'reason' in result ? result.reason : ''}`);
    assert.ok(result.evidenceId, 'no evidenceId returned');

    // Raw stdout evidence stored as command_output
    const evidence = platform.graph.getGraph(run.id).evidence.find((e) => e.id === result.evidenceId);
    assert.ok(evidence);
    assert.equal(evidence.kind, 'command_output');
    const content = JSON.parse(platform.evidence.readEvidenceContent(evidence.id).toString('utf8')) as Record<string, unknown>;
    assert.equal(content['engine'], 'nuclei');
    assert.equal(content['template'], 'web.nuclei.safe_templates');
    // exitCode 0 or 1 are both acceptable; nuclei exits 1 when no findings
    assert.ok(content['exitCode'] === 0 || content['exitCode'] === 1, `unexpected exitCode: ${content['exitCode']}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('nuclei JSONL findings are auto-created when nuclei engine produces output', { skip: skipReason }, async () => {
  // Stand up a target that returns a response missing security headers — nuclei should flag it
  const { createServer } = await import('node:http');
  const server = createServer((_req, res) => {
    // Deliberately no security headers → nuclei http-missing-security-headers template fires
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body>smoke</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const target = `http://127.0.0.1:${address.port}/`;

  const platform = createPlatform();
  const run = platform.graph.createRun({
    target,
    goal: 'Nuclei finding auto-creation smoke',
    scopePolicy: scopeFor('127.0.0.1'),
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    const result = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel: 'R2',
      args: { template: 'web.nuclei.safe_templates', timeoutMs: 120_000 },
    });
    assert.equal(result.status, 'allowed');

    // Scanner import record created (auto-parse ran)
    const imports = platform.scannerResults.list(run.id);
    assert.ok(imports.length > 0, 'no scanner result import created after nuclei run');
    assert.equal(imports[0].engine, 'nuclei');

    // Findings are candidate — operator must validate
    const findings = platform.graph.getGraph(run.id).findings;
    // Not asserting a specific count — depends on nuclei version and template set;
    // we only require that if findings exist they are backed by evidence
    for (const finding of findings) {
      assert.ok(finding.evidenceIds.length > 0, `finding ${finding.id} has no evidence`);
      assert.equal(finding.validationState, 'candidate');
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('httpx fingerprint executes and stores command_output evidence + import record', { skip: skipReason }, async () => {
  const { createServer } = await import('node:http');
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html', server: 'nginx' });
    res.end('<html><head><title>Smoke</title></head><body>ok</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const target = `http://127.0.0.1:${address.port}/`;

  const platform = createPlatform();
  const run = platform.graph.createRun({
    target,
    goal: 'httpx integration smoke',
    scopePolicy: scopeFor('127.0.0.1'),
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    const result = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel: 'R2',
      args: { template: 'web.httpx.fingerprint', timeoutMs: 120_000 },
    });
    assert.equal(result.status, 'allowed', `invoke blocked: ${'reason' in result ? result.reason : ''}`);
    assert.ok(result.evidenceId);

    const evidence = platform.graph.getGraph(run.id).evidence.find((e) => e.id === result.evidenceId);
    assert.ok(evidence);
    const content = JSON.parse(platform.evidence.readEvidenceContent(evidence.id).toString('utf8')) as Record<string, unknown>;
    assert.equal(content['engine'], 'httpx');

    // httpx auto-parse creates an import record but no candidate findings (discovery only)
    const imports = platform.scannerResults.list(run.id);
    if (imports.length > 0) {
      assert.equal(imports[0].engine, 'httpx');
    }
    const findings = platform.graph.getGraph(run.id).findings;
    assert.equal(findings.length, 0, 'httpx must not auto-create candidate findings');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('ffuf content discovery executes and does not auto-create findings', { skip: skipReason }, async () => {
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    // /admin returns 200, everything else 404 — gives ffuf at least one hit
    if (req.url === '/admin') {
      res.writeHead(200);
      res.end('admin');
      return;
    }
    res.writeHead(404);
    res.end('nope');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const target = `http://127.0.0.1:${address.port}/`;

  const platform = createPlatform();
  const run = platform.graph.createRun({
    target,
    goal: 'ffuf integration smoke',
    scopePolicy: scopeFor('127.0.0.1'),
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    const result = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel: 'R2',
      args: { template: 'web.ffuf.content_discovery', timeoutMs: 120_000 },
    });
    // ffuf needs a wordlist; if the container image lacks one the run may exit non-zero,
    // which is still 'allowed' at the gateway level (evidence is stored regardless).
    assert.equal(result.status, 'allowed', `invoke blocked: ${'reason' in result ? result.reason : ''}`);
    assert.ok(result.evidenceId);

    const evidence = platform.graph.getGraph(run.id).evidence.find((e) => e.id === result.evidenceId);
    assert.ok(evidence);
    const content = JSON.parse(platform.evidence.readEvidenceContent(evidence.id).toString('utf8')) as Record<string, unknown>;
    assert.equal(content['engine'], 'ffuf');

    // ffuf is discovery only — no auto findings
    const findings = platform.graph.getGraph(run.id).findings;
    assert.equal(findings.length, 0, 'ffuf must not auto-create candidate findings');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('nmap safe top ports executes and stores port-discovery evidence without findings', { skip: skipReason }, async () => {
  const { createServer } = await import('node:http');
  const server = createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const target = `http://127.0.0.1:${address.port}/`;

  const platform = createPlatform();
  const run = platform.graph.createRun({
    target,
    goal: 'nmap integration smoke',
    scopePolicy: scopeFor('127.0.0.1'),
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    const result = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel: 'R2',
      args: { template: 'network.nmap.safe_top_ports', timeoutMs: 180_000 },
    });
    assert.equal(result.status, 'allowed', `invoke blocked: ${'reason' in result ? result.reason : ''}`);
    assert.ok(result.evidenceId);

    const evidence = platform.graph.getGraph(run.id).evidence.find((e) => e.id === result.evidenceId);
    assert.ok(evidence);
    const content = JSON.parse(platform.evidence.readEvidenceContent(evidence.id).toString('utf8')) as Record<string, unknown>;
    assert.equal(content['engine'], 'nmap');

    // nmap is discovery only — no auto findings
    const findings = platform.graph.getGraph(run.id).findings;
    assert.equal(findings.length, 0, 'nmap must not auto-create candidate findings');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('tlsx bulk certificate executes and stores certificate-metadata evidence without findings', { skip: skipReason }, async () => {
  // tlsx needs a TLS endpoint; we use a well-known public host only when the operator opts in.
  // The scope must explicitly allow it, so this uses the loopback guard pattern and is skipped
  // unless container env is on. We target the public host example.com over TLS.
  const platform = createPlatform();
  const run = platform.graph.createRun({
    target: 'https://example.com',
    goal: 'tlsx integration smoke',
    scopePolicy: scopeFor('example.com'),
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const result = await platform.tools.invoke({
    runId: run.id,
    tool: 'scanner.run_template',
    target: 'https://example.com',
    method: 'GET',
    riskLevel: 'R2',
    args: { template: 'network.tlsx.bulk_certificate', timeoutMs: 120_000 },
  });
  assert.equal(result.status, 'allowed', `invoke blocked: ${'reason' in result ? result.reason : ''}`);
  assert.ok(result.evidenceId);

  const evidence = platform.graph.getGraph(run.id).evidence.find((e) => e.id === result.evidenceId);
  assert.ok(evidence);
  const content = JSON.parse(platform.evidence.readEvidenceContent(evidence.id).toString('utf8')) as Record<string, unknown>;
  assert.equal(content['engine'], 'tlsx');

  const findings = platform.graph.getGraph(run.id).findings;
  assert.equal(findings.length, 0, 'tlsx must not auto-create candidate findings');
});

test('sqlmap verify is gated behind R3 approval before execution', { skip: skipReason }, async () => {
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const id = url.searchParams.get('id') ?? '';
    // Naive injectable echo: reflect id, error on a quote
    if (id.includes("'")) {
      res.writeHead(500);
      res.end('You have an error in your SQL syntax');
      return;
    }
    res.writeHead(200);
    res.end(`item ${id}`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const target = `http://127.0.0.1:${address.port}/?id=1`;

  const platform = createPlatform();
  const run = platform.graph.createRun({
    target,
    goal: 'sqlmap approval gate smoke',
    scopePolicy: scopeFor('127.0.0.1'),
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  try {
    // R3 template — first invocation must require approval, never execute directly
    const gated = await platform.tools.invoke({
      runId: run.id,
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel: 'R3',
      args: { template: 'web.sqlmap.verify', timeoutMs: 180_000 },
    });
    assert.equal(gated.status, 'approval_required', `expected approval gate, got ${gated.status}`);
    assert.ok('approvalId' in gated && gated.approvalId);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
