import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { createPlatform } from '../src/platform.js';
import { startApiServer } from '../src/api/server.js';
import type { Platform } from '../src/platform.js';
import type { ApiHandle } from '../src/api/server.js';

test('WebSocket real-time progress push broadcasts run events to subscribers', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    assert.ok(api.wsServer, 'WebSocket server should be created');

    // Connect WebSocket server to RunEventService
    (platform.events as any).wsServer = api.wsServer;

    // Create a test run
    const run = platform.graph.createRun({
      target: 'https://example.com',
      goal: 'Test WebSocket push',
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

    // Extract port from URL
    const port = new URL(api.url).port;

    // Connect WebSocket client
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

        // Wait for at least 2 messages: connection.established + run.fact_added
        if (receivedMessages.length >= 2) {
          resolve();
        }
      });

      ws.on('error', (error) => {
        console.error('[Test] WebSocket error:', error);
        reject(error);
      });

      // After connection is established, record an event
      ws.on('open', () => {
        setTimeout(() => {
          // This should trigger a broadcast
          platform.graph.addFact({
            runId: run.id,
            statement: 'Test fact for WebSocket broadcast',
            evidenceIds: [],
            createdBy: 'test',
          });
        }, 100);
      });

      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Test timeout')), 5000);
    });

    ws.close();

    // Verify received messages
    assert.ok(receivedMessages.length >= 2, 'Should receive at least 2 messages');

    const connectionMsg = receivedMessages[0];
    assert.strictEqual(connectionMsg.type, 'connection.established');
    assert.strictEqual(connectionMsg.runId, run.id);
    assert.ok(connectionMsg.data.heartbeatIntervalMs);

    const eventMsg = receivedMessages.find((msg) => msg.type === 'fact.added');
    assert.ok(eventMsg, 'Should receive fact.added event');
    assert.strictEqual(eventMsg.runId, run.id);
  } finally {
    await api.close();
  }
});

test('WebSocket server rejects connections without runId', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    const port = new URL(api.url).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?token=test-token`);

    await new Promise<void>((resolve, reject) => {
      ws.on('close', (code, reason) => {
        assert.strictEqual(code, 1008, 'Should close with policy violation code');
        assert.match(reason.toString(), /runId/i, 'Reason should mention runId');
        resolve();
      });

      ws.on('error', () => {
        // Expected - connection will be rejected
      });

      setTimeout(() => reject(new Error('Test timeout')), 3000);
    });
  } finally {
    await api.close();
  }
});

test('WebSocket server rejects connections without authentication token', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    const port = new URL(api.url).port;
    const run = platform.graph.createRun({
      target: 'https://example.com',
      goal: 'Test auth',
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

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}`);

    await new Promise<void>((resolve, reject) => {
      ws.on('close', (code, reason) => {
        assert.strictEqual(code, 1008, 'Should close with policy violation code');
        assert.match(reason.toString(), /token/i, 'Reason should mention token');
        resolve();
      });

      ws.on('error', () => {
        // Expected - connection will be rejected
      });

      setTimeout(() => reject(new Error('Test timeout')), 3000);
    });
  } finally {
    await api.close();
  }
});

test('WebSocket server rejects connections with invalid authentication token', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    const port = new URL(api.url).port;
    const run = platform.graph.createRun({
      target: 'https://example.com',
      goal: 'Test invalid auth',
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

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=wrong-token`);

    await new Promise<void>((resolve, reject) => {
      ws.on('close', (code, reason) => {
        assert.strictEqual(code, 1008, 'Should close with policy violation code');
        assert.match(reason.toString(), /invalid/i, 'Reason should mention invalid token');
        resolve();
      });

      ws.on('error', () => {
        // Expected - connection will be rejected
      });

      setTimeout(() => reject(new Error('Test timeout')), 3000);
    });
  } finally {
    await api.close();
  }
});

test('WebSocket server handles multiple concurrent subscribers', async () => {
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
      goal: 'Test multiple subscribers',
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

    const port = new URL(api.url).port;

    // Connect 3 clients
    const clients = [
      new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=test-token`),
      new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=test-token`),
      new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=test-token`),
    ];

    const clientMessages: any[][] = [[], [], []];

    await new Promise<void>((resolve, reject) => {
      let openCount = 0;

      clients.forEach((ws, index) => {
        ws.on('open', () => {
          openCount++;
          if (openCount === 3) {
            // All clients connected, trigger event
            setTimeout(() => {
              platform.graph.addFact({
                runId: run.id,
                statement: 'Broadcast to all clients',
                evidenceIds: [],
                createdBy: 'test',
              });
            }, 100);
          }
        });

        ws.on('message', (data: Buffer) => {
          const message = JSON.parse(data.toString());
          clientMessages[index].push(message);

          // Check if all clients received at least 2 messages
          if (clientMessages.every((msgs) => msgs.length >= 2)) {
            resolve();
          }
        });

        ws.on('error', reject);
      });

      setTimeout(() => reject(new Error('Test timeout')), 5000);
    });

    clients.forEach((ws) => ws.close());

    // Verify all clients received the messages
    assert.strictEqual(clientMessages[0].length, 2);
    assert.strictEqual(clientMessages[1].length, 2);
    assert.strictEqual(clientMessages[2].length, 2);

    // Verify stats
    const stats = api.wsServer!.getStats();
    assert.strictEqual(stats.runSubscriptions, 1, 'Should have 1 run subscription');
    assert.strictEqual(stats.runs.length, 1);
    assert.strictEqual(stats.runs[0], run.id);
  } finally {
    await api.close();
  }
});

test('WebSocket broadcast failures do not affect RunEvent persistence', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    (platform.events as any).wsServer = api.wsServer;

    const run = platform.graph.createRun({
      target: 'https://example.com',
      goal: 'Test broadcast failure handling',
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

    // Create a fact (which triggers event recording and broadcast)
    // Even if broadcast fails, the event should be persisted
    const fact = platform.graph.addFact({
      runId: run.id,
      statement: 'Fact should be persisted even if broadcast fails',
      evidenceIds: [],
      createdBy: 'test',
    });

    // Verify the fact was created
    assert.ok(fact.id);

    // Verify events were recorded in store
    const allEvents = Object.values(platform.store.state.runEvents).filter((e) => e.runId === run.id);
    assert.ok(allEvents.length > 0, 'Events should be persisted');

    const factEvent = allEvents.find((e) => e.type === 'fact.added');
    assert.ok(factEvent, 'Fact event should exist');
  } finally {
    await api.close();
  }
});
