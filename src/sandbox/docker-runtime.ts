import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type {
  SandboxRuntime,
  SandboxConfig,
  SandboxInstance,
  SandboxResult,
  ExecOptions,
} from './sandbox-runtime.js';

export class DockerRuntime implements SandboxRuntime {
  kind = 'docker' as const;

  async isAvailable(): Promise<boolean> {
    return commandAvailable('docker');
  }

  async version(): Promise<string | undefined> {
    try {
      const result = await execCommand('docker', ['--version'], 3000);
      if (result.exitCode === 0) {
        return result.stdout.trim();
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  async createSandbox(config: SandboxConfig): Promise<SandboxInstance> {
    const containerId = `agentred-${randomBytes(8).toString('hex')}`;
    const args = this.buildCreateArgs(containerId, config);

    const result = await execCommand('docker', args, 30000);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create Docker sandbox: ${result.stderr || result.stdout}`);
    }

    const actualContainerId = result.stdout.trim();
    return {
      id: actualContainerId,
      kind: this.kind,
      config,
      createdAt: new Date().toISOString(),
      metadata: {
        containerName: containerId,
        image: config.image,
      },
    };
  }

  async executeCommand(
    sandbox: SandboxInstance,
    cmd: string[],
    options?: ExecOptions
  ): Promise<SandboxResult> {
    const args = ['exec'];

    if (options?.workDir) {
      args.push('-w', options.workDir);
    }

    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    args.push(sandbox.id, ...cmd);

    const timeoutMs = options?.timeoutMs ?? sandbox.config.timeoutSeconds * 1000;
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const result = await execCommand('docker', args, timeoutMs, options?.stdin);

    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      startedAt,
      endedAt,
      durationMs,
    };
  }

  async destroySandbox(sandbox: SandboxInstance): Promise<void> {
    try {
      // Stop container
      await execCommand('docker', ['stop', '-t', '5', sandbox.id], 10000);
    } catch {
      // Continue to remove even if stop fails
    }

    try {
      // Remove container
      await execCommand('docker', ['rm', '-f', sandbox.id], 10000);
    } catch (err) {
      throw new Error(`Failed to remove Docker sandbox ${sandbox.id}: ${err}`);
    }
  }

  private buildCreateArgs(containerName: string, config: SandboxConfig): string[] {
    const args = ['create', '--name', containerName];

    // CPU limit
    if (config.cpuLimit) {
      const cpus = parseFloat(config.cpuLimit);
      if (!isNaN(cpus) && cpus > 0) {
        args.push('--cpus', cpus.toString());
      }
    }

    // Memory limit
    if (config.memoryLimit) {
      args.push('--memory', config.memoryLimit);
    }

    // Network mode
    args.push('--network', config.networkMode);

    // Volume mounts
    for (const mount of config.volumeMounts) {
      const mountSpec = mount.readOnly
        ? `${mount.hostPath}:${mount.containerPath}:ro`
        : `${mount.hostPath}:${mount.containerPath}`;
      args.push('-v', mountSpec);
    }

    // Environment variables
    for (const [key, value] of Object.entries(config.env)) {
      args.push('-e', `${key}=${value}`);
    }

    // Working directory
    if (config.workDir) {
      args.push('-w', config.workDir);
    }

    // User
    if (config.user) {
      args.push('--user', config.user);
    }

    // Auto-remove on exit
    if (config.removeOnExit) {
      args.push('--rm');
    }

    // Security: no privileged mode, drop all capabilities by default
    args.push('--security-opt', 'no-new-privileges');
    args.push('--cap-drop', 'ALL');

    // Read-only root filesystem (can be overridden by specific use cases)
    // args.push('--read-only');

    // Image (must be last before command)
    args.push(config.image);

    // Keep container running (we'll use exec)
    args.push('sleep', 'infinity');

    return args;
  }
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

function execCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  stdin?: string
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: stdin !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode,
        timedOut,
      });
    };

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.on('error', (error) => {
      stderr = stderr || error.message;
      finish(null);
    });

    child.on('close', (code) => {
      finish(code);
    });

    if (stdin !== undefined && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

function commandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      shell: false,
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 3000);

    child.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}
