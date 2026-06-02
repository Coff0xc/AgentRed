import type { RiskLevel } from '../domain/types.js';
import {
  listScannerTemplates,
  scannerTemplatePolicy,
  type ScannerTemplateDomain,
  type ToolTemplateProfile,
} from './toolbox-registry.js';
import type { ToolboxPolicyView, ToolboxRunner, ToolboxRuntimeBundle, ToolboxRuntimeProfile } from './toolbox-runner.js';

export type ToolAdapterStatus = 'ready' | 'partial' | 'policy_blocked' | 'profile_blocked' | 'planned';

export interface ToolAdapterDoctorCard {
  engine: string;
  status: ToolAdapterStatus;
  domains: ScannerTemplateDomain[];
  profileIds: string[];
  commands: string[];
  templateIds: string[];
  runnableTemplateIds: string[];
  blockedTemplateIds: string[];
  riskLevels: RiskLevel[];
  executionModes: Array<'builtin' | 'external'>;
  blockedReasons: string[];
  operatorActions: string[];
}

export interface ToolboxDoctorReport {
  generatedAt: string;
  summary: string;
  counts: {
    adapters: number;
    ready: number;
    partial: number;
    policyBlocked: number;
    profileBlocked: number;
    planned: number;
    templates: number;
    runnableTemplates: number;
    blockedTemplates: number;
  };
  policy: ToolboxPolicyView;
  adapters: ToolAdapterDoctorCard[];
  bundles: Array<{
    id: string;
    name: string;
    runtimeStatus: string;
    runnableTemplateCount: number;
    templateCount: number;
    blockedReasons: string[];
  }>;
  recommendedActions: string[];
  safetyNotes: string[];
}

export class ToolboxDoctorService {
  constructor(private readonly toolbox: ToolboxRunner) {}

  async report(): Promise<ToolboxDoctorReport> {
    const [profiles, bundles] = await Promise.all([this.toolbox.profiles(), this.toolbox.bundles()]);
    const policy = this.toolbox.policy();
    const templates = listScannerTemplates();
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const adapters = [...new Set(templates.map((template) => template.engine))]
      .sort()
      .map((engine) => adapterCard(engine, templates.filter((template) => template.engine === engine), profileById, policy));
    const runnableTemplates = adapters.flatMap((adapter) => adapter.runnableTemplateIds);
    const blockedTemplates = adapters.flatMap((adapter) => adapter.blockedTemplateIds);
    const counts = {
      adapters: adapters.length,
      ready: adapters.filter((adapter) => adapter.status === 'ready').length,
      partial: adapters.filter((adapter) => adapter.status === 'partial').length,
      policyBlocked: adapters.filter((adapter) => adapter.status === 'policy_blocked').length,
      profileBlocked: adapters.filter((adapter) => adapter.status === 'profile_blocked').length,
      planned: adapters.filter((adapter) => adapter.status === 'planned').length,
      templates: templates.length,
      runnableTemplates: runnableTemplates.length,
      blockedTemplates: blockedTemplates.length,
    };
    const recommendedActions = recommendations(adapters, policy);
    return {
      generatedAt: new Date().toISOString(),
      summary:
        `${counts.ready} ready adapter(s), ${counts.partial} partial, ${counts.policyBlocked + counts.profileBlocked + counts.planned} blocked/planned. ` +
        `${counts.runnableTemplates}/${counts.templates} scanner template(s) are currently runnable.`,
      counts,
      policy,
      adapters,
      bundles: bundles.map(bundleSummary),
      recommendedActions,
      safetyNotes: [
        'Toolbox Doctor is a read-only diagnostic view.',
        'Ready means a mapped high-level scanner template can pass policy/profile readiness; it does not bypass run scope or approvals.',
        'External adapters remain fail-closed unless global execution, template allowlist, and runtime profile gates all pass.',
        'Agent Workers still see governed templates and bundles, not raw commands.',
      ],
    };
  }
}

function adapterCard(
  engine: string,
  templates: ToolTemplateProfile[],
  profileById: Map<string, ToolboxRuntimeProfile>,
  policy: ToolboxPolicyView,
): ToolAdapterDoctorCard {
  const runnable = templates.filter((template) => templateRunnable(template, profileById, policy));
  const blocked = templates.filter((template) => !runnable.includes(template));
  const blockedReasons = [...new Set(blocked.flatMap((template) => blockedReasonsFor(template, profileById, policy)))];
  const profileIds = [...new Set(templates.map((template) => template.profileId))].sort();
  const profiles = profileIds.map((profileId) => profileById.get(profileId)).filter((profile): profile is ToolboxRuntimeProfile => Boolean(profile));
  return {
    engine,
    status: adapterStatus(templates, runnable, blockedReasons),
    domains: [...new Set(templates.map((template) => template.domain))].sort(),
    profileIds,
    commands: [...new Set(profiles.flatMap((profile) => profile.commands).filter((command) => command === engine || engine === 'builtin'))].sort(),
    templateIds: templates.map((template) => template.id).sort(),
    runnableTemplateIds: runnable.map((template) => template.id).sort(),
    blockedTemplateIds: blocked.map((template) => template.id).sort(),
    riskLevels: [...new Set(templates.map((template) => template.defaultRiskLevel))].sort(riskSort),
    executionModes: [...new Set(templates.map((template) => template.executionMode))].sort(),
    blockedReasons,
    operatorActions: operatorActionsFor(templates, profileById, policy, blockedReasons),
  };
}

function templateRunnable(
  template: ToolTemplateProfile,
  profileById: Map<string, ToolboxRuntimeProfile>,
  policy: ToolboxPolicyView,
): boolean {
  if (template.executionMode === 'builtin') {
    return true;
  }
  const profile = profileById.get(template.profileId);
  return Boolean(policy.externalExecutionEnabled && templateAllowlisted(template.id, policy) && profile?.available);
}

function blockedReasonsFor(
  template: ToolTemplateProfile,
  profileById: Map<string, ToolboxRuntimeProfile>,
  policy: ToolboxPolicyView,
): string[] {
  if (template.executionMode === 'builtin') {
    return [];
  }
  const profile = profileById.get(template.profileId);
  const reasons: string[] = [];
  if (!policy.externalExecutionEnabled) {
    reasons.push('External toolbox execution is disabled by policy.');
  }
  if (!templateAllowlisted(template.id, policy)) {
    reasons.push(`Template is not in PLATFORM_ALLOWED_SCANNER_TEMPLATES: ${template.id}`);
  }
  if (!profile) {
    reasons.push(`Runtime profile is missing: ${template.profileId}`);
  } else if (!profile.available) {
    reasons.push(`${profile.id}: ${profile.reason ?? 'Runtime profile is unavailable.'}`);
  }
  const templatePolicy = scannerTemplatePolicy(template.id);
  if (templatePolicy?.requiresApproval) {
    reasons.push(`${template.id} is R3 and will still require bound operator approval at runtime.`);
  }
  return reasons;
}

function adapterStatus(
  templates: ToolTemplateProfile[],
  runnable: ToolTemplateProfile[],
  blockedReasons: string[],
): ToolAdapterStatus {
  if (runnable.length === templates.length) {
    return 'ready';
  }
  if (runnable.length > 0) {
    return 'partial';
  }
  if (blockedReasons.some((reason) => reason.includes('disabled by policy') || reason.includes('PLATFORM_ALLOWED_SCANNER_TEMPLATES'))) {
    return 'policy_blocked';
  }
  if (blockedReasons.some((reason) => reason.includes('profile') || reason.includes('Runtime') || reason.includes('command'))) {
    return 'profile_blocked';
  }
  return 'planned';
}

function operatorActionsFor(
  templates: ToolTemplateProfile[],
  profileById: Map<string, ToolboxRuntimeProfile>,
  policy: ToolboxPolicyView,
  blockedReasons: string[],
): string[] {
  const actions: string[] = [];
  if (templates.some((template) => template.executionMode === 'external') && !policy.externalExecutionEnabled) {
    actions.push('Set PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1 only on trusted local runners that are allowed to execute external tools.');
  }
  const missingAllowlist = templates
    .filter((template) => template.executionMode === 'external' && !templateAllowlisted(template.id, policy))
    .map((template) => template.id);
  if (missingAllowlist.length > 0) {
    actions.push(`Allowlist needed templates: ${missingAllowlist.join(', ')}.`);
  }
  const profileIds = [...new Set(templates.map((template) => template.profileId))];
  for (const profileId of profileIds) {
    const profile = profileById.get(profileId);
    if (profile && !profile.available && profile.reason) {
      actions.push(profile.reason);
    }
  }
  if (blockedReasons.some((reason) => reason.includes('R3'))) {
    actions.push('Keep R3 templates approval-gated even after adapter readiness is fixed.');
  }
  return [...new Set(actions)];
}

function recommendations(adapters: ToolAdapterDoctorCard[], policy: ToolboxPolicyView): string[] {
  const actions: string[] = [];
  if (!policy.externalExecutionEnabled && adapters.some((adapter) => adapter.executionModes.includes('external'))) {
    actions.push('Keep external execution disabled for default commercial safety; enable it only per trusted runner and allowlist.');
  }
  const policyBlocked = adapters.filter((adapter) => adapter.status === 'policy_blocked');
  if (policyBlocked.length > 0) {
    actions.push(`Map policy decisions for ${policyBlocked.length} blocked adapter(s) before promising external tool coverage.`);
  }
  const profileBlocked = adapters.filter((adapter) => adapter.status === 'profile_blocked');
  if (profileBlocked.length > 0) {
    actions.push(`Install or probe runtime profiles for ${profileBlocked.map((adapter) => adapter.engine).join(', ')}.`);
  }
  const readyExternal = adapters.filter((adapter) => adapter.status === 'ready' && adapter.executionModes.includes('external'));
  if (readyExternal.length > 0) {
    actions.push('Run external adapters only through scanner.run_template so scope, approval, audit, and evidence gates remain intact.');
  }
  return actions.length > 0 ? actions : ['Built-in adapters are ready; external adapters remain optional and fail-closed.'];
}

function bundleSummary(bundle: ToolboxRuntimeBundle): ToolboxDoctorReport['bundles'][number] {
  return {
    id: bundle.id,
    name: bundle.name,
    runtimeStatus: bundle.runtimeStatus,
    runnableTemplateCount: bundle.runnableTemplateCount,
    templateCount: bundle.templateCount,
    blockedReasons: bundle.blockedReasons,
  };
}

function templateAllowlisted(templateId: string, policy: ToolboxPolicyView): boolean {
  return policy.allowAllExternalTemplates || policy.allowedExternalTemplates.includes(templateId);
}

function riskSort(left: RiskLevel, right: RiskLevel): number {
  return riskScore(left) - riskScore(right);
}

function riskScore(value: RiskLevel): number {
  return { R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 }[value];
}
