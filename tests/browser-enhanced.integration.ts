import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import test from 'node:test';

import { createPlatform } from '../src/platform.js';
import type { ScopePolicy } from '../src/domain/types.js';
import type {
  BrowserAutomationNavigation,
  BrowserAutomationRuntime,
} from '../src/captures/browser-session-service.js';

const policy: ScopePolicy = {
  allowedAssets: ['example.com', '*.example.com', '127.0.0.1'],
  deniedAssets: ['admin.example.com'],
  allowedMethods: ['GET', 'POST'],
  destructiveAllowed: false,
  credentialRules: { allowVaultReferencesOnly: true },
  rateLimits: { requestsPerMinute: 120 },
};

class EnhancedFakeBrowserRuntime implements BrowserAutomationRuntime {
  readonly mode = 'playwright_controller' as const;
  public readonly closedSessions: string[] = [];
  public readonly navigations: Array<{
    target: string;
    captureHar?: boolean;
    captureTrace?: boolean;
    captureVideo?: boolean;
  }> = [];

  async navigate(input: Parameters<BrowserAutomationRuntime['navigate']>[0]): Promise<BrowserAutomationNavigation> {
    this.navigations.push({
      target: input.target,
      captureHar: input.captureHar,
      captureTrace: input.captureTrace,
      captureVideo: input.captureVideo,
    });

    const result: BrowserAutomationNavigation = {
      finalUrl: input.target,
      title: 'Test Page',
      status: 200,
      statusText: 'OK',
      responseHeaders: { 'content-type': 'text/html' },
      bodyPreview: '<html><body>Test</body></html>',
      screenshot: Buffer.from('fake-screenshot'),
      screenshotContentType: 'image/png',
      textPreview: 'Test page content',
      consoleMessages: [{ type: 'log', text: 'Test log' }],
      networkEvents: [{ url: input.target, method: 'GET', status: 200, resourceType: 'document' }],
    };

    // Add HAR if requested
    if (input.captureHar) {
      const harData = {
        log: {
          version: '1.2',
          creator: { name: 'playwright', version: '1.0' },
          entries: [
            {
              request: {
                method: 'GET',
                url: input.target,
                headers: [
                  { name: 'User-Agent', value: 'test-agent' },
                  { name: 'Authorization', value: 'Bearer secret-token-12345' },
                  { name: 'Cookie', value: 'session=secret-session-cookie' },
                ],
                cookies: [{ name: 'session', value: 'secret-session-cookie' }],
                queryString: [{ name: 'api_key', value: 'secret-api-key-67890' }],
              },
              response: {
                status: 200,
                statusText: 'OK',
                headers: [
                  { name: 'Content-Type', value: 'text/html' },
                  { name: 'Set-Cookie', value: 'new-session=new-secret-value' },
                ],
                cookies: [{ name: 'new-session', value: 'new-secret-value' }],
                content: { text: '<html>Response with token=secret-response-token</html>' },
              },
            },
          ],
        },
      };
      result.harArchive = Buffer.from(JSON.stringify(harData), 'utf-8');
    }

    // Add trace if requested
    if (input.captureTrace) {
      result.traceArchive = Buffer.from('fake-trace-zip-data');
    }

    // Add video if requested
    if (input.captureVideo) {
      result.videoRecording = Buffer.from('fake-video-webm-data');
    }

    return result;
  }

  async closeSession(sessionId: string): Promise<void> {
    this.closedSessions.push(sessionId);
  }
}

test('Browser session captures HAR with redaction', async () => {
  const runtime = new EnhancedFakeBrowserRuntime();
  const platform = createPlatform({ browserRuntime: runtime });
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Test HAR capture',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const result = await platform.browserSessions.navigate({
    runId: run.id,
    target: 'https://app.example.com/test',
    captureHar: true,
  });

  assert.equal(runtime.navigations.length, 1);
  assert.equal(runtime.navigations[0].captureHar, true);
  assert.ok(result.snapshot);
  assert.ok(result.snapshot.harEvidenceId);

  // Verify HAR evidence was created
  const graph = platform.graph.getGraph(run.id);
  const harEvidence = graph.evidence.find((e) => e.id === result.snapshot!.harEvidenceId);
  assert.ok(harEvidence);
  assert.equal(harEvidence.kind, 'replay_bundle');
  assert.equal(harEvidence.redactionState, 'redacted');

  // Verify HAR content is redacted
  const harContent = platform.evidence.readEvidenceContent(harEvidence.id);
  const harJson = JSON.parse(harContent.toString('utf-8'));
  assert.ok(harJson.log.entries.length > 0);

  const entry = harJson.log.entries[0];
  // Check that sensitive headers are redacted
  const authHeader = entry.request.headers.find((h: { name: string }) => h.name === 'Authorization');
  assert.equal(authHeader.value, '[REDACTED]');

  const cookieHeader = entry.request.headers.find((h: { name: string }) => h.name === 'Cookie');
  assert.equal(cookieHeader.value, '[REDACTED]');

  // Check that cookies are redacted
  assert.equal(entry.request.cookies[0].value, '[REDACTED]');

  const setCookieHeader = entry.response.headers.find((h: { name: string }) => h.name === 'Set-Cookie');
  assert.equal(setCookieHeader.value, '[REDACTED]');

  // Check that response cookies are redacted
  assert.equal(entry.response.cookies[0].value, '[REDACTED]');
});

test('Browser session captures trace as raw_local_only', async () => {
  const runtime = new EnhancedFakeBrowserRuntime();
  const platform = createPlatform({ browserRuntime: runtime });
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Test trace capture',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const result = await platform.browserSessions.navigate({
    runId: run.id,
    target: 'https://app.example.com/test',
    captureTrace: true,
  });

  assert.equal(runtime.navigations.length, 1);
  assert.equal(runtime.navigations[0].captureTrace, true);
  assert.ok(result.snapshot);
  assert.ok(result.snapshot.traceEvidenceId);

  // Verify trace evidence was created with raw_local_only
  const graph = platform.graph.getGraph(run.id);
  const traceEvidence = graph.evidence.find((e) => e.id === result.snapshot!.traceEvidenceId);
  assert.ok(traceEvidence);
  assert.equal(traceEvidence.kind, 'replay_bundle');
  assert.equal(traceEvidence.redactionState, 'raw_local_only');
});

test('Browser session captures video as raw_local_only', async () => {
  const runtime = new EnhancedFakeBrowserRuntime();
  const platform = createPlatform({ browserRuntime: runtime });
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Test video capture',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const result = await platform.browserSessions.navigate({
    runId: run.id,
    target: 'https://app.example.com/test',
    captureVideo: true,
  });

  assert.equal(runtime.navigations.length, 1);
  assert.equal(runtime.navigations[0].captureVideo, true);
  assert.ok(result.snapshot);
  assert.ok(result.snapshot.videoEvidenceId);

  // Verify video evidence was created with raw_local_only
  const graph = platform.graph.getGraph(run.id);
  const videoEvidence = graph.evidence.find((e) => e.id === result.snapshot!.videoEvidenceId);
  assert.ok(videoEvidence);
  assert.equal(videoEvidence.kind, 'replay_bundle');
  assert.equal(videoEvidence.redactionState, 'raw_local_only');
});

test('Browser session captures all artifacts when requested', async () => {
  const runtime = new EnhancedFakeBrowserRuntime();
  const platform = createPlatform({ browserRuntime: runtime });
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Test all captures',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const result = await platform.browserSessions.navigate({
    runId: run.id,
    target: 'https://app.example.com/test',
    captureHar: true,
    captureTrace: true,
    captureVideo: true,
  });

  assert.ok(result.snapshot);
  assert.ok(result.snapshot.screenshotEvidenceId);
  assert.ok(result.snapshot.harEvidenceId);
  assert.ok(result.snapshot.traceEvidenceId);
  assert.ok(result.snapshot.videoEvidenceId);
  assert.ok(result.snapshot.textEvidenceId);

  // Verify all evidence IDs are in the snapshot
  assert.ok(result.snapshot.evidenceIds.includes(result.snapshot.screenshotEvidenceId));
  assert.ok(result.snapshot.evidenceIds.includes(result.snapshot.harEvidenceId));
  assert.ok(result.snapshot.evidenceIds.includes(result.snapshot.traceEvidenceId));
  assert.ok(result.snapshot.evidenceIds.includes(result.snapshot.videoEvidenceId));
  assert.ok(result.snapshot.evidenceIds.includes(result.snapshot.textEvidenceId));
});

test('Browser session works without optional captures', async () => {
  const runtime = new EnhancedFakeBrowserRuntime();
  const platform = createPlatform({ browserRuntime: runtime });
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Test basic capture',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  const result = await platform.browserSessions.navigate({
    runId: run.id,
    target: 'https://app.example.com/test',
  });

  assert.equal(runtime.navigations.length, 1);
  assert.equal(runtime.navigations[0].captureHar, undefined);
  assert.equal(runtime.navigations[0].captureTrace, undefined);
  assert.equal(runtime.navigations[0].captureVideo, undefined);
  assert.ok(result.snapshot);
  assert.ok(result.snapshot.screenshotEvidenceId);
  assert.ok(result.snapshot.textEvidenceId);
  assert.equal(result.snapshot.harEvidenceId, undefined);
  assert.equal(result.snapshot.traceEvidenceId, undefined);
  assert.equal(result.snapshot.videoEvidenceId, undefined);
});

test('HAR redaction handles malformed JSON gracefully', async () => {
  const runtime = new EnhancedFakeBrowserRuntime();
  const platform = createPlatform({ browserRuntime: runtime });
  const run = platform.graph.createRun({
    target: 'https://app.example.com',
    goal: 'Test malformed HAR',
    scopePolicy: policy,
    workerPool: [{ name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }],
  });

  // Override navigate to return malformed HAR
  const originalNavigate = runtime.navigate.bind(runtime);
  runtime.navigate = async (input) => {
    const result = await originalNavigate(input);
    if (input.captureHar) {
      result.harArchive = Buffer.from('not valid json', 'utf-8');
    }
    return result;
  };

  const result = await platform.browserSessions.navigate({
    runId: run.id,
    target: 'https://app.example.com/test',
    captureHar: true,
  });

  assert.ok(result.snapshot);
  assert.ok(result.snapshot.harEvidenceId);

  // Verify fallback HAR was created
  const graph = platform.graph.getGraph(run.id);
  const harEvidence = graph.evidence.find((e) => e.id === result.snapshot!.harEvidenceId);
  assert.ok(harEvidence);
  const harContent = platform.evidence.readEvidenceContent(harEvidence.id);
  const harJson = JSON.parse(harContent.toString('utf-8'));
  assert.equal(harJson.log.version, '1.2');
  assert.ok(harJson.log.comment?.includes('parsing failed'));
});
