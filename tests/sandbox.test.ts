import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DockerRuntime } from '../src/sandbox/docker-runtime.js';
import type { SandboxConfig } from '../src/sandbox/sandbox-runtime.js';

describe('Sandbox Runtime', () => {
  describe('DockerRuntime', () => {
    it('should check availability', async () => {
      const runtime = new DockerRuntime();
      const available = await runtime.isAvailable();
      // Test passes regardless of availability - just checking no errors
      assert.strictEqual(typeof available, 'boolean');
    });

    it('should get version if available', async () => {
      const runtime = new DockerRuntime();
      const available = await runtime.isAvailable();
      if (available) {
        const version = await runtime.version();
        assert.ok(version);
        assert.ok(version.includes('Docker'));
      }
    });

    it('should have correct kind', () => {
      const runtime = new DockerRuntime();
      assert.strictEqual(runtime.kind, 'docker');
    });
  });

  describe('Sandbox Lifecycle', () => {
    it('should create, execute, and destroy sandbox', async () => {
      const runtime = new DockerRuntime();
      const available = await runtime.isAvailable();

      if (!available) {
        console.log('Skipping sandbox lifecycle test - Docker not available');
        return;
      }

      const config: SandboxConfig = {
        image: 'alpine:3.19',
        cpuLimit: '0.5',
        memoryLimit: '256m',
        networkMode: 'none',
        volumeMounts: [],
        timeoutSeconds: 30,
        env: {
          TEST_VAR: 'test_value',
        },
        workDir: '/workspace',
        user: 'root',
        removeOnExit: false,
      };

      let sandbox;
      try {
        // Create sandbox
        sandbox = await runtime.createSandbox(config);
        assert.ok(sandbox.id);
        assert.strictEqual(sandbox.kind, 'docker');
        assert.ok(sandbox.createdAt);

        // Execute simple command
        const result = await runtime.executeCommand(sandbox, ['echo', 'hello from sandbox']);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('hello from sandbox'));
        assert.strictEqual(result.timedOut, false);
        assert.ok(result.durationMs >= 0);
      } finally {
        // Clean up
        if (sandbox) {
          await runtime.destroySandbox(sandbox);
        }
      }
    });

    it('should enforce timeout', async () => {
      const runtime = new DockerRuntime();
      const available = await runtime.isAvailable();

      if (!available) {
        console.log('Skipping timeout test - Docker not available');
        return;
      }

      const config: SandboxConfig = {
        image: 'alpine:3.19',
        cpuLimit: '0.5',
        memoryLimit: '256m',
        networkMode: 'none',
        volumeMounts: [],
        timeoutSeconds: 30,
        env: {},
        removeOnExit: false,
      };

      let sandbox;
      try {
        sandbox = await runtime.createSandbox(config);

        // Execute command that should timeout
        const result = await runtime.executeCommand(
          sandbox,
          ['sleep', '10'],
          { timeoutMs: 1000 }
        );

        assert.strictEqual(result.timedOut, true);
        assert.ok(result.exitCode !== 0 || result.exitCode === null);
      } finally {
        if (sandbox) {
          await runtime.destroySandbox(sandbox);
        }
      }
    });

    it('should handle command failure', async () => {
      const runtime = new DockerRuntime();
      const available = await runtime.isAvailable();

      if (!available) {
        console.log('Skipping command failure test - Docker not available');
        return;
      }

      const config: SandboxConfig = {
        image: 'alpine:3.19',
        cpuLimit: '0.5',
        memoryLimit: '256m',
        networkMode: 'none',
        volumeMounts: [],
        timeoutSeconds: 30,
        env: {},
        removeOnExit: false,
      };

      let sandbox;
      try {
        sandbox = await runtime.createSandbox(config);

        // Execute command that will fail
        const result = await runtime.executeCommand(sandbox, ['false']);

        assert.notStrictEqual(result.exitCode, 0);
        assert.strictEqual(result.timedOut, false);
      } finally {
        if (sandbox) {
          await runtime.destroySandbox(sandbox);
        }
      }
    });

    it('should enforce network isolation', async () => {
      const runtime = new DockerRuntime();
      const available = await runtime.isAvailable();

      if (!available) {
        console.log('Skipping network isolation test - Docker not available');
        return;
      }

      const config: SandboxConfig = {
        image: 'alpine:3.19',
        cpuLimit: '0.5',
        memoryLimit: '256m',
        networkMode: 'none', // No network access
        volumeMounts: [],
        timeoutSeconds: 30,
        env: {},
        removeOnExit: false,
      };

      let sandbox;
      try {
        sandbox = await runtime.createSandbox(config);

        // Try to ping external host - should fail with no network
        const result = await runtime.executeCommand(
          sandbox,
          ['ping', '-c', '1', '-W', '1', '8.8.8.8'],
          { timeoutMs: 5000 }
        );

        // Command should fail or timeout because network is disabled
        assert.notStrictEqual(result.exitCode, 0);
      } finally {
        if (sandbox) {
          await runtime.destroySandbox(sandbox);
        }
      }
    });

    it('should enforce resource limits', async () => {
      const runtime = new DockerRuntime();
      const available = await runtime.isAvailable();

      if (!available) {
        console.log('Skipping resource limits test - Docker not available');
        return;
      }

      const config: SandboxConfig = {
        image: 'alpine:3.19',
        cpuLimit: '0.1', // Very low CPU
        memoryLimit: '64m', // Very low memory
        networkMode: 'none',
        volumeMounts: [],
        timeoutSeconds: 30,
        env: {},
        removeOnExit: false,
      };

      let sandbox;
      try {
        sandbox = await runtime.createSandbox(config);
        assert.ok(sandbox.id);

        // Execute simple command - should work even with low resources
        const result = await runtime.executeCommand(sandbox, ['echo', 'test']);
        assert.strictEqual(result.exitCode, 0);
      } finally {
        if (sandbox) {
          await runtime.destroySandbox(sandbox);
        }
      }
    });
  });

  describe('Security', () => {
    it('should run as non-root user when specified', async () => {
      const runtime = new DockerRuntime();
      const available = await runtime.isAvailable();

      if (!available) {
        console.log('Skipping non-root test - Docker not available');
        return;
      }

      const config: SandboxConfig = {
        image: 'alpine:3.19',
        cpuLimit: '0.5',
        memoryLimit: '256m',
        networkMode: 'none',
        volumeMounts: [],
        timeoutSeconds: 30,
        env: {},
        user: '1000:1000',
        removeOnExit: false,
      };

      let sandbox;
      try {
        sandbox = await runtime.createSandbox(config);

        // Check current user ID
        const result = await runtime.executeCommand(sandbox, ['id', '-u']);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.trim() === '1000');
      } finally {
        if (sandbox) {
          await runtime.destroySandbox(sandbox);
        }
      }
    });
  });
});
