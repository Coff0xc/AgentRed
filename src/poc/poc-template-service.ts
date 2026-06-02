import { newId, nowIso } from '../domain/ids.js';
import type { PocTemplate, RunPocTemplateBinding } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { PlatformStore } from '../storage/store.js';
import { getPocTemplate, listPocTemplates } from './poc-template-registry.js';

export interface RunPocTemplateView extends PocTemplate {
  enabled: boolean;
  binding?: RunPocTemplateBinding;
}

export interface WorkerPocTemplateContext {
  id: string;
  name: string;
  category: PocTemplate['category'];
  status: PocTemplate['status'];
  vulnerabilityClasses: string[];
  requiredEvidence: PocTemplate['requiredEvidence'];
  recommendedTools: string[];
  workerHints: string[];
  safetyNotes: string[];
}

export class PocTemplateService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly events?: RunEventService,
  ) {}

  list(): PocTemplate[] {
    return listPocTemplates();
  }

  listForRun(runId: string): RunPocTemplateView[] {
    this.graph.getRun(runId);
    const bindings = this.bindingsForRun(runId);
    return this.list().map((template) => {
      const binding = bindings.find((item) => item.templateId === template.id);
      return { ...template, enabled: Boolean(binding), binding };
    });
  }

  enable(runId: string, templateId: string, enabledBy: RunPocTemplateBinding['enabledBy'] = 'operator'): {
    template: PocTemplate;
    binding: RunPocTemplateBinding;
  } {
    this.graph.getRun(runId);
    const template = getPocTemplate(templateId);
    if (!template) {
      throw new Error(`PoC template not found: ${templateId}`);
    }
    const existing = this.bindingsForRun(runId).find((item) => item.templateId === templateId);
    if (existing) {
      return { template, binding: existing };
    }
    const binding: RunPocTemplateBinding = {
      id: newId('run_poc'),
      runId,
      templateId,
      enabledAt: nowIso(),
      enabledBy,
    };
    this.store.state.runPocTemplateBindings[binding.id] = binding;
    this.graph.addHint(runId, this.enabledHint(template));
    this.events?.record({
      runId,
      type: 'poc.template.enabled',
      title: 'PoC template enabled',
      detail: `${template.name} (${template.id})`,
      entityId: binding.id,
    });
    this.store.commit();
    return { template, binding };
  }

  workerContext(runId: string): WorkerPocTemplateContext[] {
    return this.listForRun(runId)
      .filter((template) => template.enabled)
      .map((template) => ({
        id: template.id,
        name: template.name,
        category: template.category,
        status: template.status,
        vulnerabilityClasses: [...template.vulnerabilityClasses],
        requiredEvidence: [...template.requiredEvidence],
        recommendedTools: [...template.recommendedTools],
        workerHints: [...template.workerHints],
        safetyNotes: [...template.safetyNotes],
      }));
  }

  workerHints(runId: string): string[] {
    return this.workerContext(runId).flatMap((template) =>
      template.workerHints.map((hint) => `[${template.id}] ${hint}`),
    );
  }

  private bindingsForRun(runId: string): RunPocTemplateBinding[] {
    return Object.values(this.store.state.runPocTemplateBindings)
      .filter((binding) => binding.runId === runId)
      .sort((left, right) => left.enabledAt.localeCompare(right.enabledAt));
  }

  private enabledHint(template: PocTemplate): string {
    return [
      `PoC template enabled: ${template.name} (${template.id}).`,
      `Vulnerability classes: ${template.vulnerabilityClasses.join(', ')}.`,
      `Required evidence: ${template.requiredEvidence.join(', ')}.`,
      `Worker hints: ${template.workerHints.join(' ')}`,
      `Safety notes: ${template.safetyNotes.join(' ')}`,
    ].join(' ');
  }
}
