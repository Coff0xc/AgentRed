import { newId, nowIso } from '../domain/ids.js';
import type { DomainSkill, RunSkillBinding } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { PlatformStore } from '../storage/store.js';
import { getDomainSkill, listDomainSkills } from './domain-skill-registry.js';

export interface RunDomainSkillView extends DomainSkill {
  enabled: boolean;
  binding?: RunSkillBinding;
}

export interface WorkerDomainSkillContext {
  id: string;
  name: string;
  category: DomainSkill['category'];
  status: DomainSkill['status'];
  recommendedTools: string[];
  workerHints: string[];
  riskNotes: string[];
}

export class DomainSkillService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly events?: RunEventService,
  ) {}

  list(): DomainSkill[] {
    return listDomainSkills();
  }

  listForRun(runId: string): RunDomainSkillView[] {
    this.graph.getRun(runId);
    const bindings = this.bindingsForRun(runId);
    return this.list().map((skill) => {
      const binding = bindings.find((item) => item.skillId === skill.id);
      return { ...skill, enabled: Boolean(binding), binding };
    });
  }

  enable(runId: string, skillId: string, enabledBy: RunSkillBinding['enabledBy'] = 'operator'): {
    skill: DomainSkill;
    binding: RunSkillBinding;
  } {
    this.graph.getRun(runId);
    const skill = getDomainSkill(skillId);
    if (!skill) {
      throw new Error(`Domain Skill not found: ${skillId}`);
    }
    const existing = this.bindingsForRun(runId).find((item) => item.skillId === skillId);
    if (existing) {
      return { skill, binding: existing };
    }
    const binding: RunSkillBinding = {
      id: newId('run_skill'),
      runId,
      skillId,
      enabledAt: nowIso(),
      enabledBy,
    };
    this.store.state.runSkillBindings[binding.id] = binding;
    this.graph.addHint(runId, this.enabledHint(skill));
    this.events?.record({
      runId,
      type: 'skill.enabled',
      title: 'Domain Skill enabled',
      detail: `${skill.name} (${skill.id})`,
      entityId: binding.id,
    });
    this.store.commit();
    return { skill, binding };
  }

  workerContext(runId: string): WorkerDomainSkillContext[] {
    return this.listForRun(runId)
      .filter((skill) => skill.enabled)
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        category: skill.category,
        status: skill.status,
        recommendedTools: [...skill.recommendedTools],
        workerHints: [...skill.workerHints],
        riskNotes: [...skill.riskNotes],
      }));
  }

  workerHints(runId: string): string[] {
    return this.workerContext(runId).flatMap((skill) =>
      skill.workerHints.map((hint) => `[${skill.id}] ${hint}`),
    );
  }

  private bindingsForRun(runId: string): RunSkillBinding[] {
    return Object.values(this.store.state.runSkillBindings)
      .filter((binding) => binding.runId === runId)
      .sort((left, right) => left.enabledAt.localeCompare(right.enabledAt));
  }

  private enabledHint(skill: DomainSkill): string {
    return [
      `Domain Skill enabled: ${skill.name} (${skill.id}).`,
      `Use cases: ${skill.rigidUseCases.join('; ')}.`,
      `Do not use it for: ${skill.excludedUseCases.join('; ')}.`,
      `Worker hints: ${skill.workerHints.join(' ')}`,
    ].join(' ');
  }
}
