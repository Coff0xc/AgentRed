/**
 * Executor engine - manages target setup/teardown and health checks
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { BenchmarkTarget } from './types.js';

const execAsync = promisify(exec);

export class ExecutorEngine {
  /**
   * Setup target environment (e.g., start Docker containers)
   */
  async setupTarget(target: BenchmarkTarget): Promise<void> {
    console.log(`[Executor] Setting up target: ${target.type}`);

    if (target.type === 'docker_compose') {
      await this.setupDockerCompose(target);
    } else if (target.type === 'url') {
      // No setup needed for external URLs
      console.log(`[Executor] Target is external URL: ${target.baseUrl}`);
    } else {
      console.warn(`[Executor] Unknown target type: ${target.type}`);
    }

    // Wait for target to be ready
    if (target.healthcheck) {
      await this.waitForHealthcheck(target);
    } else {
      // Default wait time if no healthcheck configured
      await this.sleep(5000);
    }

    console.log(`[Executor] Target ready: ${target.baseUrl}`);
  }

  /**
   * Teardown target environment
   */
  async teardownTarget(target: BenchmarkTarget): Promise<void> {
    console.log(`[Executor] Tearing down target: ${target.type}`);

    if (target.teardown) {
      try {
        await execAsync(target.teardown);
        console.log(`[Executor] Teardown complete`);
      } catch (error) {
        console.error(`[Executor] Teardown failed:`, error);
      }
    } else if (target.type === 'docker_compose') {
      // Default teardown for docker compose
      const composeFile = target.setup;
      try {
        await execAsync(`docker compose -f ${composeFile} down -v`);
        console.log(`[Executor] Docker Compose teardown complete`);
      } catch (error) {
        console.error(`[Executor] Docker Compose teardown failed:`, error);
      }
    }
  }

  // ===== Private Methods =====

  private async setupDockerCompose(target: BenchmarkTarget): Promise<void> {
    const composeFile = target.setup;

    try {
      // Check if Docker is available
      await execAsync('docker --version');
      await execAsync('docker compose version');
    } catch (error) {
      throw new Error('Docker or Docker Compose not available. Please install Docker.');
    }

    // Start containers
    console.log(`[Executor] Starting Docker Compose: ${composeFile}`);
    try {
      const { stdout, stderr } = await execAsync(`docker compose -f ${composeFile} up -d`);
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
    } catch (error: any) {
      throw new Error(`Failed to start Docker Compose: ${error.message}`);
    }
  }

  private async waitForHealthcheck(target: BenchmarkTarget): Promise<void> {
    if (!target.healthcheck) return;

    const { url, expectedStatus, maxRetries, retryDelayMs } = target.healthcheck;
    console.log(`[Executor] Waiting for healthcheck: ${url}`);

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url);
        if (response.status === expectedStatus) {
          console.log(`[Executor] Healthcheck passed on attempt ${i + 1}`);
          return;
        }
        console.log(`[Executor] Healthcheck attempt ${i + 1}: status ${response.status}, expected ${expectedStatus}`);
      } catch (error) {
        console.log(`[Executor] Healthcheck attempt ${i + 1} failed:`, error instanceof Error ? error.message : error);
      }

      if (i < maxRetries - 1) {
        await this.sleep(retryDelayMs);
      }
    }

    throw new Error(`Healthcheck failed after ${maxRetries} attempts`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
