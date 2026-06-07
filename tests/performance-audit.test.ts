/**
 * Performance Audit Test Suite
 *
 * Targets:
 * - Benchmark performance: <5min per scenario
 * - Docker sandbox overhead: <500ms
 * - WebSocket performance: <100ms latency
 * - API response time: P95 <500ms
 * - Memory and CPU usage monitoring
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';

import { createPlatform } from '../src/platform.js';
import { startApiServer } from '../src/api/server.js';
import { DockerRuntime } from '../src/sandbox/docker-runtime.js';
import type { Platform } from '../src/platform.js';
import type { ApiHandle } from '../src/api/server.js';
import type { SandboxConfig } from '../src/sandbox/sandbox-runtime.js';

// Performance metrics collector
class PerformanceMetrics {
  private metrics: Array<{ name: string; durationMs: number; timestamp: number }> = [];
  private memorySnapshots: Array<{ name: string; heapUsed: number; external: number; timestamp: number }> = [];

  recordMetric(name: string, durationMs: number): void {
    this.metrics.push({
      name,
      durationMs,
      timestamp: Date.now(),
    });
  }

  recordMemory(name: string): void {
    const mem = process.memoryUsage();
    this.memorySnapshots.push({
      name,
      heapUsed: mem.heapUsed,
      external: mem.external,
      timestamp: Date.now(),
    });
  }

  getPercentile(metricName: string, percentile: number): number {
    const values = this.metrics
      .filter((m) => m.name === metricName)
      .map((m) => m.durationMs)
      .sort((a, b) => a - b);

    if (values.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[index];
  }

  getAverage(metricName: string): number {
    const values = this.metrics.filter((m) => m.name === metricName).map((m) => m.durationMs);
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  getMin(metricName: string): number {
    const values = this.metrics.filter((m) => m.name === metricName).map((m) => m.durationMs);
    return values.length > 0 ? Math.min(...values) : 0;
  }

  getMax(metricName: string): number {
    const values = this.metrics.filter((m) => m.name === metricName).map((m) => m.durationMs);
    return values.length > 0 ? Math.max(...values) : 0;
  }

  getMemoryUsage(name: string): { heapUsed: number; external: number } | null {
    const snapshot = this.memorySnapshots.find((s) => s.name === name);
    return snapshot ? { heapUsed: snapshot.heapUsed, external: snapshot.external } : null;
  }

  generateReport(): string {
    const metricNames = [...new Set(this.metrics.map((m) => m.name))];

    let report = '\n=== AgentRed Performance Audit Report ===\n\n';

    for (const name of metricNames) {
      const avg = this.getAverage(name);
      const min = this.getMin(name);
      const max = this.getMax(name);
      const p50 = this.getPercentile(name, 50);
      const p95 = this.getPercentile(name, 95);
      const p99 = this.getPercentile(name, 99);

      report += `${name}:\n`;
      report += `  Min: ${min.toFixed(2)}ms\n`;
      report += `  Avg: ${avg.toFixed(2)}ms\n`;
      report += `  Max: ${max.toFixed(2)}ms\n`;
      report += `  P50: ${p50.toFixed(2)}ms\n`;
      report += `  P95: ${p95.toFixed(2)}ms\n`;
      report += `  P99: ${p99.toFixed(2)}ms\n`;
      report += `  Samples: ${this.metrics.filter((m) => m.name === name).length}\n\n`;
    }

    if (this.memorySnapshots.length > 0) {
      report += 'Memory Usage:\n';
      for (const snapshot of this.memorySnapshots) {
        const heapMB = (snapshot.heapUsed / 1024 / 1024).toFixed(2);
        const externalMB = (snapshot.external / 1024 / 1024).toFixed(2);
        report += `  ${snapshot.name}: Heap=${heapMB}MB, External=${externalMB}MB\n`;
      }
      report += '\n';
    }

    return report;
  }
}

const metrics = new PerformanceMetrics();

// Helper function to measure execution time
async function measureTime<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    metrics.recordMetric(name, duration);
  }
}

// =============================================================================
// Test 1: Docker Sandbox Overhead (<500ms target)
// =============================================================================

test('Performance: Docker sandbox creation overhead should be <500ms', async () => {
  const runtime = new DockerRuntime();
  const available = await runtime.isAvailable();

  if (!available) {
    console.log('⚠️  Skipping Docker sandbox performance test - Docker not available');
    return;
  }

  const config: SandboxConfig = {
    image: 'alpine:3.19',
    cpuLimit: '0.5',
    memoryLimit: '128m',
    networkMode: 'none',
    volumeMounts: [],
    timeoutSeconds: 30,
    env: {},
    removeOnExit: false,
  };

  // Warm-up run
  const warmupSandbox = await runtime.createSandbox(config);
  await runtime.destroySandbox(warmupSandbox);

  // Performance test: 5 iterations
  const sandboxes: any[] = [];
  for (let i = 0; i < 5; i++) {
    const sandbox = await measureTime('docker_sandbox_create', async () => {
      return await runtime.createSandbox(config);
    });
    sandboxes.push(sandbox);
  }

  // Cleanup
  for (const sandbox of sandboxes) {
    await runtime.destroySandbox(sandbox);
  }

  const avgTime = metrics.getAverage('docker_sandbox_create');
  const p95Time = metrics.getPercentile('docker_sandbox_create', 95);

  console.log(`📊 Docker sandbox creation: Avg=${avgTime.toFixed(2)}ms, P95=${p95Time.toFixed(2)}ms`);

  assert.ok(p95Time < 500, `Docker sandbox P95 creation time ${p95Time.toFixed(2)}ms exceeds 500ms target`);
});

test('Performance: Docker command execution overhead should be <100ms', async () => {
  const runtime = new DockerRuntime();
  const available = await runtime.isAvailable();

  if (!available) {
    console.log('⚠️  Skipping Docker command execution test - Docker not available');
    return;
  }

  const config: SandboxConfig = {
    image: 'alpine:3.19',
    cpuLimit: '0.5',
    memoryLimit: '128m',
    networkMode: 'none',
    volumeMounts: [],
    timeoutSeconds: 30,
    env: {},
    removeOnExit: false,
  };

  const sandbox = await runtime.createSandbox(config);

  try {
    // Warm-up
    await runtime.executeCommand(sandbox, ['echo', 'warmup']);

    // Performance test: 10 iterations
    for (let i = 0; i < 10; i++) {
      await measureTime('docker_command_exec', async () => {
        return await runtime.executeCommand(sandbox, ['echo', 'test']);
      });
    }

    const avgTime = metrics.getAverage('docker_command_exec');
    const p95Time = metrics.getPercentile('docker_command_exec', 95);

    console.log(`📊 Docker command execution: Avg=${avgTime.toFixed(2)}ms, P95=${p95Time.toFixed(2)}ms`);

    assert.ok(p95Time < 100, `Docker command P95 execution time ${p95Time.toFixed(2)}ms exceeds 100ms target`);
  } finally {
    await runtime.destroySandbox(sandbox);
  }
});

// =============================================================================
// Test 2: WebSocket Performance (<100ms latency target)
// =============================================================================

test('Performance: WebSocket connection latency should be <100ms', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: true,
  });

  try {
    const run = platform.graph.createRun({
      target: 'https://example.com',
      goal: 'WebSocket latency test',
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

    // Test connection latency 5 times
    for (let i = 0; i < 5; i++) {
      await measureTime('websocket_connect', async () => {
        return new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=test-token`);

          ws.on('open', () => {
            ws.close();
            resolve();
          });

          ws.on('error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 2000);
        });
      });
    }

    const avgTime = metrics.getAverage('websocket_connect');
    const p95Time = metrics.getPercentile('websocket_connect', 95);

    console.log(`📊 WebSocket connection: Avg=${avgTime.toFixed(2)}ms, P95=${p95Time.toFixed(2)}ms`);

    assert.ok(p95Time < 100, `WebSocket P95 connection time ${p95Time.toFixed(2)}ms exceeds 100ms target`);
  } finally {
    await api.close();
  }
});

test('Performance: WebSocket message round-trip latency should be <100ms', async () => {
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
      goal: 'WebSocket message latency test',
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
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/progress?runId=${run.id}&token=test-token`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 2000);
    });

    // Test message latency 10 times
    for (let i = 0; i < 10; i++) {
      await measureTime('websocket_message_latency', async () => {
        return new Promise<void>((resolve, reject) => {
          const messageHandler = () => {
            ws.off('message', messageHandler);
            resolve();
          };

          ws.on('message', messageHandler);

          // Trigger an event
          platform.graph.addFact({
            runId: run.id,
            statement: `Test fact ${i}`,
            evidenceIds: [],
            createdBy: 'test',
          });

          setTimeout(() => {
            ws.off('message', messageHandler);
            reject(new Error('Message timeout'));
          }, 1000);
        });
      });
    }

    ws.close();

    const avgTime = metrics.getAverage('websocket_message_latency');
    const p95Time = metrics.getPercentile('websocket_message_latency', 95);

    console.log(`📊 WebSocket message latency: Avg=${avgTime.toFixed(2)}ms, P95=${p95Time.toFixed(2)}ms`);

    assert.ok(p95Time < 100, `WebSocket P95 message latency ${p95Time.toFixed(2)}ms exceeds 100ms target`);
  } finally {
    await api.close();
  }
});

// =============================================================================
// Test 3: API Response Time (P95 <500ms target)
// =============================================================================

test('Performance: API response time P95 should be <500ms', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });
  const api: ApiHandle = await startApiServer(platform, {
    port: 0,
    authToken: 'test-token',
    enableWebSocket: false,
  });

  try {
    const baseUrl = api.url;

    // Test various API endpoints
    const endpoints = [
      { method: 'GET', path: '/health', name: 'health_check' },
      { method: 'POST', path: '/runs', name: 'create_run', body: {
        target: 'https://example.com',
        goal: 'Performance test',
        scopePolicy: {
          allowedAssets: ['https://example.com'],
          deniedAssets: [],
          allowedMethods: ['GET'],
          destructiveAllowed: false,
          credentialRules: { allowVaultReferencesOnly: false },
          rateLimits: { requestsPerMinute: 60 },
        },
        workerPool: [{ name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }],
      }},
    ];

    let runId: string | null = null;

    for (const endpoint of endpoints) {
      // Test each endpoint 10 times
      for (let i = 0; i < 10; i++) {
        await measureTime(`api_${endpoint.name}`, async () => {
          const response = await fetch(`${baseUrl}${endpoint.path}`, {
            method: endpoint.method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer test-token`,
            },
            body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
          });

          if (endpoint.name === 'create_run' && i === 0 && response.ok) {
            const data = await response.json();
            if (data && data.run && data.run.id) {
              runId = data.run.id;
            }
          }

          return response;
        });
      }

      const avgTime = metrics.getAverage(`api_${endpoint.name}`);
      const p95Time = metrics.getPercentile(`api_${endpoint.name}`, 95);

      console.log(`📊 API ${endpoint.name}: Avg=${avgTime.toFixed(2)}ms, P95=${p95Time.toFixed(2)}ms`);

      assert.ok(p95Time < 500, `API ${endpoint.name} P95 time ${p95Time.toFixed(2)}ms exceeds 500ms target`);
    }

    // Test run creation and graph retrieval
    for (let i = 0; i < 10; i++) {
      await measureTime('api_create_run_full', async () => {
        const response = await fetch(`${baseUrl}/runs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer test-token`,
          },
          body: JSON.stringify({
            target: `https://example${i}.com`,
            goal: `Performance test ${i}`,
            scopePolicy: {
              allowedAssets: [`https://example${i}.com`],
              deniedAssets: [],
              allowedMethods: ['GET'],
              destructiveAllowed: false,
              credentialRules: { allowVaultReferencesOnly: false },
              rateLimits: { requestsPerMinute: 60 },
            },
            workerPool: [{ name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }],
          }),
        });

        const data = await response.json();
        return data.run?.id;
      });
    }

    const avgTime = metrics.getAverage('api_create_run_full');
    const p95Time = metrics.getPercentile('api_create_run_full', 95);

    console.log(`📊 API create_run_full: Avg=${avgTime.toFixed(2)}ms, P95=${p95Time.toFixed(2)}ms`);

    assert.ok(p95Time < 500, `API create_run_full P95 time ${p95Time.toFixed(2)}ms exceeds 500ms target`);
  } finally {
    await api.close();
  }
});

// =============================================================================
// Test 4: Memory and CPU Monitoring
// =============================================================================

test('Performance: Memory usage should remain stable under load', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });

  metrics.recordMemory('initial');

  // Create multiple runs
  const runs = [];
  for (let i = 0; i < 20; i++) {
    const run = platform.graph.createRun({
      target: `https://example${i}.com`,
      goal: `Memory test run ${i}`,
      scopePolicy: {
        allowedAssets: [`https://example${i}.com`],
        deniedAssets: [],
        allowedMethods: ['GET'],
        destructiveAllowed: false,
        credentialRules: { allowVaultReferencesOnly: false },
        rateLimits: { requestsPerMinute: 60 },
      },
      workerPool: [{ name: 'mock', type: 'mock', maxRunning: 1, priority: 1 }],
    });
    runs.push(run);

    // Add facts and evidence
    for (let j = 0; j < 10; j++) {
      platform.graph.addFact({
        runId: run.id,
        statement: `Test fact ${j} for run ${i}`,
        evidenceIds: [],
        createdBy: 'test',
      });
    }
  }

  metrics.recordMemory('after_load');

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    await new Promise(resolve => setTimeout(resolve, 100));
    metrics.recordMemory('after_gc');
  }

  const initial = metrics.getMemoryUsage('initial');
  const afterLoad = metrics.getMemoryUsage('after_load');

  assert.ok(initial && afterLoad);

  const heapGrowthMB = (afterLoad.heapUsed - initial.heapUsed) / 1024 / 1024;

  console.log(`📊 Memory growth: ${heapGrowthMB.toFixed(2)}MB for 20 runs with 200 facts`);

  // Memory should not grow excessively (threshold: 100MB for this test)
  assert.ok(heapGrowthMB < 100, `Memory growth ${heapGrowthMB.toFixed(2)}MB exceeds 100MB threshold`);
});

test('Performance: Dispatcher execution should complete in reasonable time', async () => {
  const platform: Platform = createPlatform({ databasePath: undefined });

  const run = platform.graph.createRun({
    target: 'https://example.com',
    goal: 'Dispatcher performance test',
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

  // Test dispatcher execution
  await measureTime('dispatcher_execute', async () => {
    await platform.dispatcher.dispatchOnce(run.id);
  });

  const dispatchTime = metrics.getAverage('dispatcher_execute');
  console.log(`📊 Dispatcher execution: ${dispatchTime.toFixed(2)}ms`);

  // Dispatch should complete quickly (<2000ms)
  assert.ok(dispatchTime < 2000, `Dispatcher execution ${dispatchTime.toFixed(2)}ms exceeds 2000ms target`);
});

// =============================================================================
// Test 5: Generate Performance Report
// =============================================================================

test('Performance: Generate and display performance audit report', async () => {
  const report = metrics.generateReport();
  console.log(report);

  // Write report to file using fs module
  const fs = await import('fs');
  const path = await import('path');
  const reportPath = path.join(process.cwd(), 'performance-audit-report.txt');
  fs.writeFileSync(reportPath, report);

  console.log(`\n✅ Performance audit report written to: ${reportPath}\n`);

  assert.ok(report.length > 0, 'Performance report should be generated');
});
