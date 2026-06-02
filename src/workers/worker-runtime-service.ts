import { nowIso } from '../domain/ids.js';
import type { WorkerRuntimeStatus } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import { createWorker } from './factory.js';

export class WorkerRuntimeService {
  constructor(private readonly store: PlatformStore) {}

  async list(runId: string): Promise<WorkerRuntimeStatus[]> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const statuses: WorkerRuntimeStatus[] = [];
    for (const config of run.workerPool) {
      const worker = createWorker(config);
      const commandConfigured = config.type === 'mock' || Boolean(config.command);
      try {
        const healthy = await worker.healthcheck();
        statuses.push({
          name: config.name,
          type: config.type,
          maxRunning: config.maxRunning,
          priority: config.priority,
          commandConfigured,
          healthy,
          status: healthy ? 'healthy' : 'unhealthy',
          reason: healthy ? undefined : commandConfigured ? 'healthcheck failed' : 'command is not configured',
          checkedAt: nowIso(),
        });
      } catch (error) {
        statuses.push({
          name: config.name,
          type: config.type,
          maxRunning: config.maxRunning,
          priority: config.priority,
          commandConfigured,
          healthy: false,
          status: 'unhealthy',
          reason: error instanceof Error ? error.message : String(error),
          checkedAt: nowIso(),
        });
      }
    }
    return statuses;
  }
}
