import { join } from 'node:path';
import type { WorkerConfig } from '../domain/types.js';
import type { WorkerAdapter } from './types.js';
import { CliWorkerAdapter } from './cli-worker.js';
import { MockWorkerAdapter } from './mock-worker.js';

export function createWorker(config: WorkerConfig): WorkerAdapter {
  if (config.type === 'mock') {
    return new MockWorkerAdapter(config.name);
  }
  // Built-in claude worker: if type is 'claude' and no command is set, wire up the bundled claude-worker
  if (config.type === 'claude' && !config.command) {
    const claudeWorkerPath = join(process.cwd(), 'dist', 'workers', 'claude-worker.js');
    return new CliWorkerAdapter({
      ...config,
      command: process.execPath, // node binary
      args: [claudeWorkerPath],
    });
  }
  return new CliWorkerAdapter(config);
}
