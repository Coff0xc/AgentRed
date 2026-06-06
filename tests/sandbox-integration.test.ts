import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sandboxToolboxRunner } from '../src/sandbox/sandbox-toolbox-runner.js';
import type { ScopePolicy } from '../src/domain/types.js';

describe('Sandbox Toolbox Integration', () => {
  const testScopePolicy: ScopePolicy = {
    allowedAssets: ['example.com', '*.example.com', '192.168.1.0/24'],
    deniedAssets: ['evil.example.com'],
    allowedMethods: ['GET', 'POST', 'HEAD'],
    destructiveAllowed: false,
    credentialRules: {
      allowVaultReferencesOnly: true,
    },
    rateLimits: {
      requestsPerMinute: 60,
    },
    r4AuthorizationToken: undefined,
  };

  it('should check if sandbox is enabled', async () => {
    const enabled = await sandboxToolboxRunner.isEnabled();
    assert.strictEqual(typeof enabled, 'boolean');
  });

  it('should check runtime availability', async () => {
    const result = await sandboxToolboxRunner.canRun();
    assert.ok(result);
    assert.strictEqual(typeof result.available, 'boolean');
    if (!result.available) {
      assert.ok(result.reason);
    }
  });

  it('should run simple command in sandbox', async () => {
    const canRun = await sandboxToolboxRunner.canRun();
    if (!canRun.available) {
      console.log(`Skipping sandbox run test: ${canRun.reason}`);
      return;
    }

    const result = await sandboxToolboxRunner.run(
      {
        templateId: 'test.echo',
        target: 'https://example.com',
        timeoutMs: 10000,
        scopePolicy: testScopePolicy,
        image: 'alpine:3.19',
        cpuLimit: '0.5',
        memoryLimit: '256m',
      },
      ['echo'],
      ['hello', 'from', 'toolbox']
    );

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('hello from toolbox'));
    assert.strictEqual(result.timedOut, false);
    assert.ok(result.sandboxId);
    assert.strictEqual(result.templateId, 'test.echo');
    assert.strictEqual(result.target, 'https://example.com');
  });

  it('should enforce timeout in sandbox', async () => {
    const canRun = await sandboxToolboxRunner.canRun();
    if (!canRun.available) {
      console.log(`Skipping sandbox timeout test: ${canRun.reason}`);
      return;
    }

    const result = await sandboxToolboxRunner.run(
      {
        templateId: 'test.sleep',
        target: 'https://example.com',
        timeoutMs: 2000,
        scopePolicy: testScopePolicy,
        image: 'alpine:3.19',
      },
      ['sleep'],
      ['10']
    );

    assert.strictEqual(result.timedOut, true);
    assert.ok(result.sandboxId);
  });

  it('should apply network isolation based on scope', async () => {
    const canRun = await sandboxToolboxRunner.canRun();
    if (!canRun.available) {
      console.log(`Skipping network isolation test: ${canRun.reason}`);
      return;
    }

    const restrictivePolicy: ScopePolicy = {
      allowedAssets: [], // No assets allowed
      deniedAssets: [],
      allowedMethods: ['GET'],
      destructiveAllowed: false,
      credentialRules: {
        allowVaultReferencesOnly: true,
      },
      rateLimits: {
        requestsPerMinute: 60,
      },
      r4AuthorizationToken: undefined,
    };

    const result = await sandboxToolboxRunner.run(
      {
        templateId: 'test.network',
        target: 'https://example.com',
        timeoutMs: 5000,
        scopePolicy: restrictivePolicy,
        image: 'alpine:3.19',
      },
      ['ping'],
      ['-c', '1', '-W', '1', '8.8.8.8']
    );

    // Should fail due to network isolation
    assert.notStrictEqual(result.exitCode, 0);
  });

  it('should handle command failures gracefully', async () => {
    const canRun = await sandboxToolboxRunner.canRun();
    if (!canRun.available) {
      console.log(`Skipping command failure test: ${canRun.reason}`);
      return;
    }

    const result = await sandboxToolboxRunner.run(
      {
        templateId: 'test.fail',
        target: 'https://example.com',
        timeoutMs: 5000,
        scopePolicy: testScopePolicy,
        image: 'alpine:3.19',
      },
      ['sh'],
      ['-c', 'exit 42']
    );

    assert.strictEqual(result.exitCode, 42);
    assert.strictEqual(result.timedOut, false);
    assert.ok(result.sandboxId);
  });

  it('should cleanup all active sandboxes', async () => {
    const canRun = await sandboxToolboxRunner.canRun();
    if (!canRun.available) {
      console.log(`Skipping cleanup test: ${canRun.reason}`);
      return;
    }

    // Run a command (it will auto-cleanup)
    await sandboxToolboxRunner.run(
      {
        templateId: 'test.cleanup',
        target: 'https://example.com',
        timeoutMs: 5000,
        scopePolicy: testScopePolicy,
        image: 'alpine:3.19',
      },
      ['echo'],
      ['test']
    );

    // Cleanup should succeed even if no active sandboxes
    await sandboxToolboxRunner.cleanup();
    assert.ok(true);
  });
});
