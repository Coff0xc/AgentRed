import { spawn } from 'node:child_process';

import type { WorkerConfig } from '../domain/types.js';
import { buildWorkerProtocolEnvelope } from './protocol.js';
import type { WorkerAdapter, WorkerTask, WorkerTaskResult } from './types.js';

export class CliWorkerAdapter implements WorkerAdapter {
  public readonly name: string;

  constructor(private readonly config: WorkerConfig) {
    this.name = config.name;
  }

  async healthcheck(): Promise<boolean> {
    if (!this.config.command) {
      return false;
    }
    return true;
  }

  async execute(task: WorkerTask): Promise<WorkerTaskResult> {
    if (!this.config.command) {
      return { accepted: false, reason: `${this.name} has no command configured` };
    }
    const prompt = JSON.stringify(buildWorkerProtocolEnvelope(task));
    try {
      const output = await runProcess(
        this.config.command,
        [...(this.config.args ?? []), prompt],
        this.config.env,
        this.config.timeoutMs ?? 60_000,
      );
      return parseWorkerResult(this.name, output);
    } catch (error) {
      return { accepted: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
}

function runProcess(command: string, args: string[], env: Record<string, string> = {}, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`Worker timed out after ${timeoutMs}ms`));
        return;
      }
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Worker exited with code ${code}`));
      }
    });
  });
}

function parseWorkerResult(workerName: string, output: string): WorkerTaskResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`Worker ${workerName} returned non-JSON output`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Worker ${workerName} returned invalid result schema`);
  }
  const result = parsed as Record<string, unknown>;
  if (result.accepted === false) {
    if (typeof result.reason !== 'string' || result.reason.trim().length === 0) {
      throw new Error(`Worker ${workerName} returned invalid rejection schema`);
    }
    return { accepted: false, reason: result.reason };
  }
  if (result.accepted !== true || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    throw new Error(`Worker ${workerName} returned invalid result schema`);
  }
  const data = result.data as Record<string, unknown>;
  validateOptionalDescriptionObject(workerName, data.fact, 'fact');
  validateOptionalDescriptionObject(workerName, data.complete, 'complete');
  validateOptionalIntent(workerName, data.intent);
  validateOptionalToolRequests(workerName, data.toolRequests);
  if (data.description !== undefined && typeof data.description !== 'string') {
    throw new Error(`Worker ${workerName} returned invalid explore description`);
  }
  if (data.continueExplore !== undefined && typeof data.continueExplore !== 'boolean') {
    throw new Error(`Worker ${workerName} returned invalid continueExplore flag`);
  }
  return result as WorkerTaskResult;
}

function validateOptionalDescriptionObject(workerName: string, value: unknown, key: string): void {
  if (value === undefined) {
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Worker ${workerName} returned invalid ${key} schema`);
  }
  const object = value as Record<string, unknown>;
  if (typeof object.description !== 'string' || object.description.trim().length === 0) {
    throw new Error(`Worker ${workerName} returned invalid ${key} description`);
  }
}

function validateOptionalIntent(workerName: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Worker ${workerName} returned invalid intent schema`);
  }
  const intent = value as Record<string, unknown>;
  if (typeof intent.description !== 'string' || intent.description.trim().length === 0) {
    throw new Error(`Worker ${workerName} returned invalid intent description`);
  }
  if (!Array.isArray(intent.from) || intent.from.some((item) => typeof item !== 'string')) {
    throw new Error(`Worker ${workerName} returned invalid intent from list`);
  }
}

function validateOptionalToolRequests(workerName: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new Error(`Worker ${workerName} returned invalid toolRequests schema`);
  }
  if (value.length > 5) {
    throw new Error(`Worker ${workerName} returned too many toolRequests`);
  }
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Worker ${workerName} returned invalid tool request`);
    }
    const request = item as Record<string, unknown>;
    if (typeof request.tool !== 'string' || request.tool.trim().length === 0) {
      throw new Error(`Worker ${workerName} returned invalid tool request tool`);
    }
    if (typeof request.target !== 'string' || request.target.trim().length === 0) {
      throw new Error(`Worker ${workerName} returned invalid tool request target`);
    }
    if (request.method !== undefined && typeof request.method !== 'string') {
      throw new Error(`Worker ${workerName} returned invalid tool request method`);
    }
    if (request.riskLevel !== undefined && !['R0', 'R1', 'R2', 'R3', 'R4'].includes(String(request.riskLevel))) {
      throw new Error(`Worker ${workerName} returned invalid tool request riskLevel`);
    }
    if (request.args !== undefined && (!request.args || typeof request.args !== 'object' || Array.isArray(request.args))) {
      throw new Error(`Worker ${workerName} returned invalid tool request args`);
    }
    if (request.approvalId !== undefined && typeof request.approvalId !== 'string') {
      throw new Error(`Worker ${workerName} returned invalid tool request approvalId`);
    }
  }
}
