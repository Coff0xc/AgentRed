import type { WorkerAdapter, WorkerTask, WorkerTaskResult } from './types.js';

export class MockWorkerAdapter implements WorkerAdapter {
  public readonly name: string;

  constructor(name = 'mock-worker') {
    this.name = name;
  }

  async healthcheck(): Promise<boolean> {
    return true;
  }

  async execute(task: WorkerTask): Promise<WorkerTaskResult> {
    if (task.type === 'bootstrap') {
      return {
        accepted: true,
        data: {
          fact: {
            description: `Bootstrap mapped ${task.graph.run.target} against goal "${task.graph.run.goal}"`,
          },
        },
      };
    }

    if (task.type === 'explore') {
      return {
        accepted: true,
        data: {
          description: `Validated intent "${task.intent.hypothesis}" with reproducible local evidence requirements`,
        },
      };
    }

    const validatedFact = task.graph.facts.find((fact) => fact.statement.includes('Validated intent'));
    if (validatedFact) {
      return {
        accepted: true,
        data: {
          complete: {
            from: [validatedFact.id],
            description: `Goal satisfied by ${validatedFact.id}`,
          },
        },
      };
    }

    const latestFact = task.graph.facts.at(-1);
    return {
      accepted: true,
      data: {
        intent: {
          from: latestFact ? [latestFact.id] : [],
          description: 'Explore the highest-signal authenticated request and require evidence before reporting',
          riskLevel: 'R1',
        },
      },
    };
  }
}
