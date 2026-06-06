import type { SandboxConfig, SandboxInstance, SandboxResult } from './sandbox-runtime.js';
import { globalSandboxRegistry } from './sandbox-runtime.js';
import { DockerRuntime } from './docker-runtime.js';
import type { ScopePolicy } from '../domain/types.js';
import { defaultNetworkPolicyBuilder } from './network-policy.js';

export interface SandboxToolboxConfig {
  templateId: string;
  target: string;
  timeoutMs: number;
  scopePolicy: ScopePolicy;
  image?: string;
  cpuLimit?: string;
  memoryLimit?: string;
  workDir?: string;
}

export interface SandboxToolboxResult extends SandboxResult {
  templateId: string;
  target: string;
  sandboxId: string;
}

export class SandboxToolboxRunner {
  private activeSandboxes = new Map<string, SandboxInstance>();

  constructor() {
    // Register Docker runtime
    globalSandboxRegistry.register(new DockerRuntime());
  }

  async isEnabled(): Promise<boolean> {
    return process.env.PLATFORM_ENABLE_SANDBOX === '1';
  }

  async canRun(): Promise<{ available: boolean; reason?: string }> {
    if (!(await this.isEnabled())) {
      return {
        available: false,
        reason: 'Sandbox mode is disabled. Set PLATFORM_ENABLE_SANDBOX=1 to enable.',
      };
    }

    const runtime = await globalSandboxRegistry.preferred();
    if (!runtime) {
      return {
        available: false,
        reason: 'No container runtime available. Docker or Podman required.',
      };
    }

    return { available: true };
  }

  async run(config: SandboxToolboxConfig, cmd: string[], args: string[]): Promise<SandboxToolboxResult> {
    const canRun = await this.canRun();
    if (!canRun.available) {
      throw new Error(canRun.reason);
    }

    const runtime = await globalSandboxRegistry.preferred();
    if (!runtime) {
      throw new Error('No sandbox runtime available');
    }

    // Build network policy from scope
    const networkPolicy = defaultNetworkPolicyBuilder.fromScopePolicy(config.scopePolicy);
    const dockerNetworkConfig = defaultNetworkPolicyBuilder.toDockerNetworkConfig(networkPolicy);

    // Create sandbox configuration
    const sandboxConfig: SandboxConfig = {
      image: config.image ?? this.defaultImage(),
      cpuLimit: config.cpuLimit ?? '1.0',
      memoryLimit: config.memoryLimit ?? '512m',
      networkMode: dockerNetworkConfig.networkMode === 'none' ? 'none' : 'bridge',
      volumeMounts: [],
      timeoutSeconds: Math.ceil(config.timeoutMs / 1000),
      env: {
        TARGET: config.target,
        TEMPLATE_ID: config.templateId,
      },
      workDir: config.workDir ?? '/workspace',
      user: 'agentred',
      removeOnExit: false, // We manage lifecycle explicitly
    };

    let sandbox: SandboxInstance | undefined;
    try {
      // Create sandbox
      sandbox = await runtime.createSandbox(sandboxConfig);
      this.activeSandboxes.set(sandbox.id, sandbox);

      // Execute command
      const result = await runtime.executeCommand(sandbox, [...cmd, ...args], {
        timeoutMs: config.timeoutMs,
      });

      return {
        ...result,
        templateId: config.templateId,
        target: config.target,
        sandboxId: sandbox.id,
      };
    } finally {
      // Clean up sandbox
      if (sandbox) {
        try {
          await runtime.destroySandbox(sandbox);
          this.activeSandboxes.delete(sandbox.id);
        } catch (err) {
          console.error(`Failed to destroy sandbox ${sandbox.id}:`, err);
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    const runtime = await globalSandboxRegistry.preferred();
    if (!runtime) {
      return;
    }

    const cleanup = Array.from(this.activeSandboxes.values()).map(async (sandbox) => {
      try {
        await runtime.destroySandbox(sandbox);
        this.activeSandboxes.delete(sandbox.id);
      } catch (err) {
        console.error(`Failed to destroy sandbox ${sandbox.id}:`, err);
      }
    });

    await Promise.all(cleanup);
  }

  private defaultImage(): string {
    return process.env.PLATFORM_SANDBOX_IMAGE ?? 'ghcr.io/coff0xc/agentred-toolbox:latest';
  }
}

export const sandboxToolboxRunner = new SandboxToolboxRunner();
