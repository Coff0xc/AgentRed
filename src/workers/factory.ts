import type { WorkerConfig } from '../domain/types.js';
import type { WorkerAdapter } from './types.js';
import { CliWorkerAdapter } from './cli-worker.js';
import { MockWorkerAdapter } from './mock-worker.js';

export function createWorker(config: WorkerConfig): WorkerAdapter {
  if (config.type === 'mock') {
    return new MockWorkerAdapter(config.name);
  }
  return new CliWorkerAdapter(config);
}
