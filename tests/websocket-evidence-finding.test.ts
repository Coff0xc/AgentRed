import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { createPlatform } from '../src/platform.js';
import { startApiServer } from '../src/api/server.js';
import type { Platform } from '../src/platform.js';
import type { ApiHandle } from '../src/api/server.js';

test('WebSocket broadcasts evidence.added event when evidence is created', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    assert.ok(api.wsServer, 'WebSocket server should be created');
    (platform.events as any).wsServer = api.wsServer;

    const run = platform.graph.createRun({
      target: 'https://example.com',
      goal: 'Test evidence WebSocket push',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [{ name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }],
    });

    const port = new URL(api.url).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=test-token`);

    const receivedMessages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        console.log('[Test] WebSocket connected');
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        console.log('[Test] Received message:', message.type);
        receivedMessages.push(message);

        // Wait for evidence.added event
        if (message.type === 'evidence.added') {
          resolve();
        }
      });

      ws.on('error', (error) => {
        console.error('[Test] WebSocket error:', error);
        reject(error);
      });

      ws.on('open', () => {
        setTimeout(() => {
          // Add evidence - should trigger broadcast
          platform.evidence.addEvidence({
            runId: run.id,
            kind: 'command_output',
            content: JSON.stringify({ test: 'evidence data' }),
            redactionState: 'redacted',
          });
        }, 100);
      });

      setTimeout(() => reject(new Error('Test timeout - evidence.added event not received')), 5000);
    });

    ws.close();

    // Verify we received the evidence.added event
    const evidenceEvent = receivedMessages.find((msg) => msg.type === 'evidence.added');
    assert.ok(evidenceEvent, 'Should receive evidence.added event');
    assert.strictEqual(evidenceEvent.runId, run.id);
    assert.ok(evidenceEvent.data.id, 'Event should contain evidence ID');
    assert.ok(evidenceEvent.data.entityId, 'Event should contain entityId');
    assert.match(evidenceEvent.data.detail, /command_output/, 'Event detail should mention evidence kind');
  } finally {
    await api.close();
  }
});

test('WebSocket broadcasts finding.proposed event when finding is created', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    assert.ok(api.wsServer, 'WebSocket server should be created');
    (platform.events as any).wsServer = api.wsServer;

    const run = platform.graph.createRun({
      target: 'https://example.com',
      goal: 'Test finding WebSocket push',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [{ name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }],
    });

    // Create evidence first (findings require evidence)
    const evidence = platform.evidence.addEvidence({
      runId: run.id,
      kind: 'http_exchange',
      content: JSON.stringify({ request: {}, response: {} }),
      redactionState: 'redacted',
    });

    const port = new URL(api.url).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=test-token`);

    const receivedMessages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        console.log('[Test] WebSocket connected');
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        console.log('[Test] Received message:', message.type);
        receivedMessages.push(message);

        // Wait for finding.proposed event
        if (message.type === 'finding.proposed') {
          resolve();
        }
      });

      ws.on('error', (error) => {
        console.error('[Test] WebSocket error:', error);
        reject(error);
      });

      ws.on('open', () => {
        setTimeout(() => {
          // Create finding - should trigger broadcast
          platform.findings.proposeFinding({
            runId: run.id,
            title: 'Test SQL Injection Vulnerability',
            severity: 'high',
            confidence: 'likely',
            affectedAssets: ['https://example.com/api/users'],
            evidenceIds: [evidence.id],
            reproSteps: ['Step 1: Send malicious payload', 'Step 2: Observe SQL error'],
            impact: 'Attacker can extract sensitive data from the database',
            remediation: 'Use parameterized queries',
          });
        }, 100);
      });

      setTimeout(() => reject(new Error('Test timeout - finding.proposed event not received')), 5000);
    });

    ws.close();

    // Verify we received the finding.proposed event
    const findingEvent = receivedMessages.find((msg) => msg.type === 'finding.proposed');
    assert.ok(findingEvent, 'Should receive finding.proposed event');
    assert.strictEqual(findingEvent.runId, run.id);
    assert.ok(findingEvent.data.id, 'Event should contain finding ID');
    assert.ok(findingEvent.data.entityId, 'Event should contain entityId');
    assert.match(findingEvent.data.detail, /high/, 'Event detail should mention severity');
    assert.match(findingEvent.data.detail, /SQL Injection/, 'Event detail should mention finding title');
  } finally {
    await api.close();
  }
});

test('WebSocket broadcasts finding.validated event when finding validation changes', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    assert.ok(api.wsServer, 'WebSocket server should be created');
    (platform.events as any).wsServer = api.wsServer;

    const run = platform.graph.createRun({
      target: 'https://example.com',
      goal: 'Test finding validation WebSocket push',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [{ name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }],
    });

    // Create evidence and finding
    const evidence = platform.evidence.addEvidence({
      runId: run.id,
      kind: 'http_exchange',
      content: JSON.stringify({ test: 'evidence' }),
      redactionState: 'redacted',
    });

    // Mark evidence as useful (required for confirmation)
    platform.evidenceReviews.review({
      evidenceId: evidence.id,
      status: 'useful',
      note: 'Valid evidence',
      reviewer: 'test-operator',
    });

    const finding = platform.findings.proposeFinding({
      runId: run.id,
      title: 'Test Finding',
      severity: 'medium',
      confidence: 'likely',
      affectedAssets: ['https://example.com'],
      evidenceIds: [evidence.id],
      reproSteps: ['Test step'],
      impact: 'Test impact',
      remediation: 'Test remediation',
    });

    const port = new URL(api.url).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=test-token`);

    const receivedMessages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        console.log('[Test] WebSocket connected');
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        console.log('[Test] Received message:', message.type);
        receivedMessages.push(message);

        // Wait for finding.validated event
        if (message.type === 'finding.validated') {
          resolve();
        }
      });

      ws.on('error', (error) => {
        console.error('[Test] WebSocket error:', error);
        reject(error);
      });

      ws.on('open', () => {
        setTimeout(() => {
          // Update finding validation - should trigger broadcast
          platform.findings.updateValidationState(finding.id, {
            validationState: 'confirmed',
            note: 'Verified by operator',
            reviewer: 'test-operator',
          });
        }, 100);
      });

      setTimeout(() => reject(new Error('Test timeout - finding.validated event not received')), 5000);
    });

    ws.close();

    // Verify we received the finding.validated event
    const validationEvent = receivedMessages.find((msg) => msg.type === 'finding.validated');
    assert.ok(validationEvent, 'Should receive finding.validated event');
    assert.strictEqual(validationEvent.runId, run.id);
    assert.ok(validationEvent.data.id, 'Event should contain event ID');
    assert.ok(validationEvent.data.entityId, 'Event should contain entityId (finding ID)');
    assert.match(validationEvent.data.detail, /confirmed/, 'Event detail should mention confirmed state');
  } finally {
    await api.close();
  }
});

test('WebSocket broadcasts multiple evidence and finding events to same client', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    assert.ok(api.wsServer, 'WebSocket server should be created');
    (platform.events as any).wsServer = api.wsServer;

    const run = platform.graph.createRun({
      target: 'https://example.com',
      goal: 'Test multiple events',
      scopePolicy: {
        allowedAssets: ['https://example.com'],
        deniedAssets: [],
        allowedMethods: ['GET', 'POST'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [{ name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }],
    });

    const port = new URL(api.url).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=test-token`);

    const receivedMessages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      let evidenceCount = 0;
      let findingCount = 0;

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        if (message.type === 'evidence.added') {
          evidenceCount++;
        }
        if (message.type === 'finding.proposed') {
          findingCount++;
        }

        // Wait for 3 evidence and 2 findings
        if (evidenceCount >= 3 && findingCount >= 2) {
          resolve();
        }
      });

      ws.on('error', reject);

      ws.on('open', () => {
        setTimeout(() => {
          // Create multiple evidence items
          const ev1 = platform.evidence.addEvidence({
            runId: run.id,
            kind: 'http_exchange',
            content: JSON.stringify({ test: 'evidence 1' }),
            redactionState: 'redacted',
          });

          const ev2 = platform.evidence.addEvidence({
            runId: run.id,
            kind: 'command_output',
            content: JSON.stringify({ test: 'evidence 2' }),
            redactionState: 'redacted',
          });

          const ev3 = platform.evidence.addEvidence({
            runId: run.id,
            kind: 'screenshot',
            content: Buffer.from('fake-image-data'),
            redactionState: 'raw_local_only',
          });

          // Create multiple findings
          platform.findings.proposeFinding({
            runId: run.id,
            title: 'Finding 1',
            severity: 'high',
            confidence: 'confirmed',
            affectedAssets: ['https://example.com/api/1'],
            evidenceIds: [ev1.id],
            reproSteps: ['Step 1'],
            impact: 'Impact 1',
            remediation: 'Remediation 1',
          });

          platform.findings.proposeFinding({
            runId: run.id,
            title: 'Finding 2',
            severity: 'medium',
            confidence: 'likely',
            affectedAssets: ['https://example.com/api/2'],
            evidenceIds: [ev2.id, ev3.id],
            reproSteps: ['Step 1', 'Step 2'],
            impact: 'Impact 2',
            remediation: 'Remediation 2',
          });
        }, 100);
      });

      setTimeout(() => reject(new Error('Test timeout')), 5000);
    });

    ws.close();

    // Verify we received all expected events
    const evidenceEvents = receivedMessages.filter((msg) => msg.type === 'evidence.added');
    const findingEvents = receivedMessages.filter((msg) => msg.type === 'finding.proposed');

    assert.strictEqual(evidenceEvents.length, 3, 'Should receive 3 evidence.added events');
    assert.strictEqual(findingEvents.length, 2, 'Should receive 2 finding.proposed events');

    // Verify all events have the correct runId
    evidenceEvents.forEach((event) => {
      assert.strictEqual(event.runId, run.id);
    });
    findingEvents.forEach((event) => {
      assert.strictEqual(event.runId, run.id);
    });
  } finally {
    await api.close();
  }
});

test('WebSocket clients subscribed to different runs receive only their events', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    assert.ok(api.wsServer, 'WebSocket server should be created');
    (platform.events as any).wsServer = api.wsServer;

    // Create two runs
    const run1 = platform.graph.createRun({
      target: 'https://example1.com',
      goal: 'Test run 1',
      scopePolicy: {
        allowedAssets: ['https://example1.com'],
        deniedAssets: [],
        allowedMethods: ['GET'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [{ name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }],
    });

    const run2 = platform.graph.createRun({
      target: 'https://example2.com',
      goal: 'Test run 2',
      scopePolicy: {
        allowedAssets: ['https://example2.com'],
        deniedAssets: [],
        allowedMethods: ['GET'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [{ name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }],
    });

    const port = new URL(api.url).port;

    // Connect two clients to different runs
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run1.id}&token=test-token`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run2.id}&token=test-token`);

    const messages1: any[] = [];
    const messages2: any[] = [];

    await new Promise<void>((resolve, reject) => {
      let openCount = 0;

      ws1.on('open', () => {
        openCount++;
        if (openCount === 2) {
          triggerEvents();
        }
      });

      ws2.on('open', () => {
        openCount++;
        if (openCount === 2) {
          triggerEvents();
        }
      });

      ws1.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        messages1.push(message);
      });

      ws2.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        messages2.push(message);
      });

      ws1.on('error', reject);
      ws2.on('error', reject);

      function triggerEvents() {
        setTimeout(() => {
          // Add evidence to run1
          platform.evidence.addEvidence({
            runId: run1.id,
            kind: 'command_output',
            content: JSON.stringify({ run: 'run1' }),
            redactionState: 'redacted',
          });

          // Add evidence to run2
          platform.evidence.addEvidence({
            runId: run2.id,
            kind: 'command_output',
            content: JSON.stringify({ run: 'run2' }),
            redactionState: 'redacted',
          });

          // Wait for messages to arrive
          setTimeout(() => resolve(), 500);
        }, 100);
      }

      setTimeout(() => reject(new Error('Test timeout')), 5000);
    });

    ws1.close();
    ws2.close();

    // Verify each client only received events for their run
    const run1Events = messages1.filter((msg) => msg.type === 'evidence.added');
    const run2Events = messages2.filter((msg) => msg.type === 'evidence.added');

    assert.strictEqual(run1Events.length, 1, 'Client 1 should receive 1 evidence event');
    assert.strictEqual(run2Events.length, 1, 'Client 2 should receive 1 evidence event');

    assert.strictEqual(run1Events[0].runId, run1.id, 'Client 1 should receive run1 events');
    assert.strictEqual(run2Events[0].runId, run2.id, 'Client 2 should receive run2 events');
  } finally {
    await api.close();
  }
});
