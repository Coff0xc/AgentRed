/**
 * Scenario loader - loads benchmark scenarios from YAML files
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchmarkScenario, BenchmarkSuite } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ScenarioLoader {
  private scenarioCache: Map<string, BenchmarkScenario> = new Map();
  private suiteCache: Map<string, BenchmarkSuite> = new Map();

  /**
   * Load a scenario by ID
   */
  async load(scenarioId: string): Promise<BenchmarkScenario> {
    // Check cache
    if (this.scenarioCache.has(scenarioId)) {
      return this.scenarioCache.get(scenarioId)!;
    }

    // Find scenario file
    const scenarioPath = this.findScenarioFile(scenarioId);
    if (!scenarioPath) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    // Load and parse
    const content = readFileSync(scenarioPath, 'utf-8');
    const scenario = this.parseScenario(content);

    // Validate
    this.validateScenario(scenario);

    // Cache
    this.scenarioCache.set(scenarioId, scenario);

    return scenario;
  }

  /**
   * Load a suite by ID
   */
  async loadSuite(suiteId: string): Promise<BenchmarkSuite> {
    // Check cache
    if (this.suiteCache.has(suiteId)) {
      return this.suiteCache.get(suiteId)!;
    }

    // Find suite file
    const suitePath = this.findSuiteFile(suiteId);
    if (!suitePath) {
      throw new Error(`Suite not found: ${suiteId}`);
    }

    // Load and parse
    const content = readFileSync(suitePath, 'utf-8');
    const suite = this.parseSuite(content);

    // Validate
    this.validateSuite(suite);

    // Cache
    this.suiteCache.set(suiteId, suite);

    return suite;
  }

  /**
   * List all available scenarios
   */
  async listScenarios(): Promise<string[]> {
    const benchmarkDir = join(__dirname, '../../benchmarks/scenarios');
    const categories = readdirSync(benchmarkDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const scenarios: string[] = [];
    for (const category of categories) {
      const categoryDir = join(benchmarkDir, category);
      const files = readdirSync(categoryDir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

      for (const file of files) {
        const id = file.replace(/\.ya?ml$/, '');
        scenarios.push(id);
      }
    }

    return scenarios;
  }

  /**
   * List all available suites
   */
  async listSuites(): Promise<string[]> {
    const suiteDir = join(__dirname, '../../benchmarks/suites');
    const files = readdirSync(suiteDir)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    return files.map(f => f.replace(/\.ya?ml$/, ''));
  }

  // ===== Private Methods =====

  private findScenarioFile(scenarioId: string): string | null {
    const benchmarkDir = join(__dirname, '../../benchmarks/scenarios');
    const categories = ['owasp', 'api', 'ctf', 'cloud', 'enterprise'];

    for (const category of categories) {
      const yamlPath = join(benchmarkDir, category, `${scenarioId}.yml`);
      const yamlAltPath = join(benchmarkDir, category, `${scenarioId}.yaml`);

      try {
        readFileSync(yamlPath);
        return yamlPath;
      } catch {
        try {
          readFileSync(yamlAltPath);
          return yamlAltPath;
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  private findSuiteFile(suiteId: string): string | null {
    const suiteDir = join(__dirname, '../../benchmarks/suites');
    const yamlPath = join(suiteDir, `${suiteId}.yml`);
    const yamlAltPath = join(suiteDir, `${suiteId}.yaml`);

    try {
      readFileSync(yamlPath);
      return yamlPath;
    } catch {
      try {
        readFileSync(yamlAltPath);
        return yamlAltPath;
      } catch {
        return null;
      }
    }
  }

  private parseScenario(content: string): BenchmarkScenario {
    // Simple YAML parser (for production, use js-yaml or similar)
    // For now, use JSON format with .yml extension
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse scenario: ${error}`);
    }
  }

  private parseSuite(content: string): BenchmarkSuite {
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse suite: ${error}`);
    }
  }

  private validateScenario(scenario: BenchmarkScenario): void {
    if (!scenario.id) {
      throw new Error('Scenario missing required field: id');
    }
    if (!scenario.version) {
      throw new Error('Scenario missing required field: version');
    }
    if (!scenario.category) {
      throw new Error('Scenario missing required field: category');
    }
    if (!scenario.target) {
      throw new Error('Scenario missing required field: target');
    }
    if (!scenario.goal) {
      throw new Error('Scenario missing required field: goal');
    }
    if (!scenario.expectedFindings || scenario.expectedFindings.length === 0) {
      throw new Error('Scenario must have at least one expected finding');
    }
    if (!scenario.successCriteria) {
      throw new Error('Scenario missing required field: successCriteria');
    }
  }

  private validateSuite(suite: BenchmarkSuite): void {
    if (!suite.id) {
      throw new Error('Suite missing required field: id');
    }
    if (!suite.name) {
      throw new Error('Suite missing required field: name');
    }
    if (!suite.scenarios || suite.scenarios.length === 0) {
      throw new Error('Suite must contain at least one scenario');
    }
    if (typeof suite.passThreshold !== 'number' || suite.passThreshold < 0 || suite.passThreshold > 1) {
      throw new Error('Suite passThreshold must be a number between 0 and 1');
    }
  }
}
