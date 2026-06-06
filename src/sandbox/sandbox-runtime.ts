export type SandboxRuntimeKind = 'docker' | 'podman' | 'kata' | 'process';
export type NetworkMode = 'bridge' | 'none' | 'custom';

export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readOnly: boolean;
}

export interface SandboxConfig {
  image: string;
  cpuLimit: string; // '1.0' = 1 core
  memoryLimit: string; // '512m'
  networkMode: NetworkMode;
  volumeMounts: VolumeMount[];
  timeoutSeconds: number;
  env: Record<string, string>;
  workDir?: string;
  user?: string;
  removeOnExit?: boolean;
}

export interface ExecOptions {
  stdin?: string;
  env?: Record<string, string>;
  workDir?: string;
  timeoutMs?: number;
}

export interface SandboxInstance {
  id: string;
  kind: SandboxRuntimeKind;
  config: SandboxConfig;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface SandboxRuntime {
  kind: SandboxRuntimeKind;

  createSandbox(config: SandboxConfig): Promise<SandboxInstance>;
  executeCommand(
    sandbox: SandboxInstance,
    cmd: string[],
    options?: ExecOptions
  ): Promise<SandboxResult>;
  destroySandbox(sandbox: SandboxInstance): Promise<void>;

  // Runtime availability check
  isAvailable(): Promise<boolean>;
  version(): Promise<string | undefined>;
}

export interface SandboxRuntimeRegistry {
  register(runtime: SandboxRuntime): void;
  get(kind: SandboxRuntimeKind): SandboxRuntime | undefined;
  preferred(): Promise<SandboxRuntime | undefined>;
  available(): Promise<SandboxRuntime[]>;
}

export class DefaultSandboxRuntimeRegistry implements SandboxRuntimeRegistry {
  private runtimes = new Map<SandboxRuntimeKind, SandboxRuntime>();

  register(runtime: SandboxRuntime): void {
    this.runtimes.set(runtime.kind, runtime);
  }

  get(kind: SandboxRuntimeKind): SandboxRuntime | undefined {
    return this.runtimes.get(kind);
  }

  async preferred(): Promise<SandboxRuntime | undefined> {
    const preferredOrder = process.env.PLATFORM_SANDBOX_RUNTIME?.trim() as SandboxRuntimeKind | undefined;
    if (preferredOrder) {
      const runtime = this.runtimes.get(preferredOrder);
      if (runtime && (await runtime.isAvailable())) {
        return runtime;
      }
    }

    const defaultOrder: SandboxRuntimeKind[] = ['docker', 'podman', 'kata', 'process'];
    for (const kind of defaultOrder) {
      const runtime = this.runtimes.get(kind);
      if (runtime && (await runtime.isAvailable())) {
        return runtime;
      }
    }

    return undefined;
  }

  async available(): Promise<SandboxRuntime[]> {
    const available: SandboxRuntime[] = [];
    for (const runtime of this.runtimes.values()) {
      if (await runtime.isAvailable()) {
        available.push(runtime);
      }
    }
    return available;
  }
}

export const globalSandboxRegistry = new DefaultSandboxRuntimeRegistry();
