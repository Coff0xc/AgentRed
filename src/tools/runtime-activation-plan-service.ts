import { nowIso } from '../domain/ids.js';
import type { PlatformStore } from '../storage/store.js';
import type { ToolboxDoctorService, ToolAdapterDoctorCard } from './toolbox-doctor-service.js';
import type { ToolboxRunner, ToolboxRuntimeProfile } from './toolbox-runner.js';

export type RuntimeActivationStepStatus = 'ready' | 'operator_action' | 'blocked' | 'optional';
export type RuntimeActivationStepKind = 'policy' | 'profile' | 'allowlist' | 'bundle' | 'validation' | 'safety';

export interface RuntimeActivationStep {
  id: string;
  kind: RuntimeActivationStepKind;
  status: RuntimeActivationStepStatus;
  title: string;
  detail: string;
  affectsProfiles: string[];
  affectsTemplates: string[];
  affectsEngines: string[];
  environment: Record<string, string>;
  acceptanceCriteria: string[];
  safetyControls: string[];
}

export interface RuntimeActivationProfileCard {
  id: string;
  name: string;
  runner: ToolboxRuntimeProfile['runner'];
  status: RuntimeActivationStepStatus;
  available: boolean;
  commands: string[];
  runnableTemplates: string[];
  blockedTemplates: string[];
  nextAction: string;
}

export interface RuntimeActivationPlanReport {
  runId: string;
  generatedAt: string;
  mode: 'governed_runtime_activation_plan';
  summary: string;
  counts: {
    profiles: number;
    availableProfiles: number;
    adapters: number;
    readyAdapters: number;
    policyBlockedAdapters: number;
    profileBlockedAdapters: number;
    templates: number;
    runnableTemplates: number;
    blockedTemplates: number;
    activationSteps: number;
    operatorActions: number;
    blockedSteps: number;
    enabledBundles: number;
  };
  profiles: RuntimeActivationProfileCard[];
  steps: RuntimeActivationStep[];
  recommendedOrder: string[];
  safetyNotes: string[];
}

export class RuntimeActivationPlanService {
  constructor(
    private readonly store: PlatformStore,
    private readonly toolbox: ToolboxRunner,
    private readonly doctor: ToolboxDoctorService,
  ) {}

  async get(runId: string): Promise<RuntimeActivationPlanReport> {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
    const [doctor, profiles, bundles] = await Promise.all([
      this.doctor.report(),
      this.toolbox.profiles(),
      this.toolbox.listForRun(runId),
    ]);
    const enabledBundles = bundles.filter((bundle) => bundle.enabled);
    const steps = uniqueSteps([
      policyStep(doctor.adapters, doctor.policy),
      ...profileSteps(doctor.adapters, profiles),
      ...allowlistSteps(doctor.adapters, doctor.policy),
      bundleStep(enabledBundles.length, bundles.length),
      validationStep(doctor.counts.runnableTemplates, doctor.counts.templates),
      safetyStep(),
    ]).sort(stepSort);
    const profileCards = profiles.map((profile) => profileCard(profile, doctor.adapters));
    const counts = {
      profiles: profiles.length,
      availableProfiles: profiles.filter((profile) => profile.available).length,
      adapters: doctor.counts.adapters,
      readyAdapters: doctor.counts.ready,
      policyBlockedAdapters: doctor.counts.policyBlocked,
      profileBlockedAdapters: doctor.counts.profileBlocked,
      templates: doctor.counts.templates,
      runnableTemplates: doctor.counts.runnableTemplates,
      blockedTemplates: doctor.counts.blockedTemplates,
      activationSteps: steps.length,
      operatorActions: steps.filter((step) => step.status === 'operator_action').length,
      blockedSteps: steps.filter((step) => step.status === 'blocked').length,
      enabledBundles: enabledBundles.length,
    };
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'governed_runtime_activation_plan',
      summary:
        `${counts.runnableTemplates}/${counts.templates} scanner template(s) runnable. ` +
        `${counts.readyAdapters}/${counts.adapters} adapter(s) ready; ` +
        `${counts.operatorActions} operator action(s), ${counts.blockedSteps} blocked step(s).`,
      counts,
      profiles: profileCards,
      steps,
      recommendedOrder: recommendedOrder(steps, profileCards),
      safetyNotes: [
        'Runtime Activation Plan is read-only and does not change process environment, pull images, install tools, enable bundles, or allowlist templates.',
        'External execution remains disabled unless PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1 is set on a trusted local runner.',
        'Allowlisting a template is not execution permission; Tool Gateway still enforces scope, risk, approval, rate, audit, redaction, and evidence gates.',
        'R3 templates remain approval-gated after runtime activation, and R4 remains denied by default.',
      ],
    };
  }
}

function policyStep(
  adapters: ToolAdapterDoctorCard[],
  policy: ReturnType<ToolboxRunner['policy']>,
): RuntimeActivationStep {
  const externalAdapters = adapters.filter((adapter) => adapter.executionModes.includes('external'));
  const blocked = externalAdapters.filter((adapter) => adapter.status === 'policy_blocked');
  const status: RuntimeActivationStepStatus = externalAdapters.length === 0
    ? 'optional'
    : policy.externalExecutionEnabled
      ? 'ready'
      : 'operator_action';
  return {
    id: 'activation.policy.external_toolbox',
    kind: 'policy',
    status,
    title: 'Decide external toolbox execution policy',
    detail: policy.externalExecutionEnabled
      ? 'External toolbox execution is enabled on this local runner; template allowlist and profile readiness still apply.'
      : `${blocked.length || externalAdapters.length} external adapter(s) require explicit local policy before they can run.`,
    affectsProfiles: [],
    affectsTemplates: externalAdapters.flatMap((adapter) => adapter.templateIds),
    affectsEngines: externalAdapters.map((adapter) => adapter.engine),
    environment: { PLATFORM_ALLOW_EXTERNAL_TOOLBOX: policy.externalExecutionEnabled ? '1' : '0 -> 1 on trusted local runners only' },
    acceptanceCriteria: [
      'Operator explicitly decides whether this local runner is allowed to execute external tools.',
      'External execution remains disabled in default commercial installs.',
      'The policy decision is visible in Toolbox Policy, Toolbox Doctor, and Runtime Activation Plan.',
    ],
    safetyControls: ['trusted local runner only', 'no cloud-triggered external execution by default', 'Tool Gateway remains mandatory'],
  };
}

function profileSteps(
  adapters: ToolAdapterDoctorCard[],
  profiles: ToolboxRuntimeProfile[],
): RuntimeActivationStep[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const blockedProfileIds = new Set(
    adapters
      .filter((adapter) => adapter.status === 'profile_blocked' || adapter.status === 'planned')
      .flatMap((adapter) => adapter.profileIds),
  );
  return [...blockedProfileIds].sort().map((profileId) => {
    const profile = profileById.get(profileId);
    const related = adapters.filter((adapter) => adapter.profileIds.includes(profileId));
    const status: RuntimeActivationStepStatus = profile?.available ? 'ready' : profile ? 'operator_action' : 'blocked';
    return {
      id: `activation.profile.${normalize(profileId)}`,
      kind: 'profile',
      status,
      title: `Make runtime profile ${profileId} available`,
      detail: profile?.reason ?? profile?.description ?? `Runtime profile ${profileId} is not registered.`,
      affectsProfiles: [profileId],
      affectsTemplates: related.flatMap((adapter) => adapter.templateIds),
      affectsEngines: related.map((adapter) => adapter.engine),
      environment: profileEnvironment(profileId),
      acceptanceCriteria: [
        'Profile probe reports available only when required runtime commands or container support are present.',
        'Tool execution uses no-shell spawn, timeout, per-run working directories, and redacted stdout/stderr evidence.',
        'Profile availability does not bypass template allowlist or approval gates.',
      ],
      safetyControls: profileSafety(profileId),
    };
  });
}

function allowlistSteps(
  adapters: ToolAdapterDoctorCard[],
  policy: ReturnType<ToolboxRunner['policy']>,
): RuntimeActivationStep[] {
  const missing = adapters
    .flatMap((adapter) => adapter.blockedTemplateIds.map((templateId) => ({ adapter, templateId })))
    .filter((item) => !policy.allowAllExternalTemplates && !policy.allowedExternalTemplates.includes(item.templateId));
  if (missing.length === 0) {
    return [
      {
        id: 'activation.allowlist.ready',
        kind: 'allowlist',
        status: policy.allowAllExternalTemplates ? 'operator_action' : 'ready',
        title: 'External scanner template allowlist',
        detail: policy.allowAllExternalTemplates
          ? 'All external templates are allowlisted. This is powerful but should be avoided for shared commercial runners.'
          : 'No missing external scanner template allowlist entries were detected.',
        affectsProfiles: [],
        affectsTemplates: policy.allowedExternalTemplates,
        affectsEngines: [],
        environment: {
          PLATFORM_ALLOWED_SCANNER_TEMPLATES: policy.allowAllExternalTemplates ? '*' : policy.allowedExternalTemplates.join(','),
        },
        acceptanceCriteria: ['Allowlist is explicit and reviewed for each commercial runner profile.'],
        safetyControls: ['avoid wildcard allowlist in shared runners', 'prefer per-template enablement'],
      },
    ];
  }
  const byEngine = new Map<string, string[]>();
  for (const item of missing) {
    byEngine.set(item.adapter.engine, [...(byEngine.get(item.adapter.engine) ?? []), item.templateId]);
  }
  return [...byEngine.entries()].map(([engine, templateIds]) => ({
    id: `activation.allowlist.${normalize(engine)}`,
    kind: 'allowlist',
    status: 'operator_action',
    title: `Allowlist ${engine} scanner templates`,
    detail: `${templateIds.length} ${engine} template(s) are blocked by PLATFORM_ALLOWED_SCANNER_TEMPLATES.`,
    affectsProfiles: [],
    affectsTemplates: [...new Set(templateIds)].sort(),
    affectsEngines: [engine],
    environment: {
      PLATFORM_ALLOWED_SCANNER_TEMPLATES: mergeAllowlist(policy.allowedExternalTemplates, templateIds),
    },
    acceptanceCriteria: [
      'Only reviewed template ids are added to the allowlist.',
      'R3 templates still require bound operator approval at invocation time.',
      'Template policy remains visible through Scanner Template Policies and Toolbox Doctor.',
    ],
    safetyControls: ['no wildcard allowlist by default', 'scope and rate checks still mandatory', 'review each template risk note'],
  }));
}

function bundleStep(enabled: number, total: number): RuntimeActivationStep {
  return {
    id: 'activation.bundle.context',
    kind: 'bundle',
    status: enabled > 0 ? 'ready' : total > 0 ? 'operator_action' : 'optional',
    title: 'Enable governed Toolbox Bundle context',
    detail: `${enabled}/${total} toolbox bundle(s) are enabled for this run.`,
    affectsProfiles: [],
    affectsTemplates: [],
    affectsEngines: [],
    environment: {},
    acceptanceCriteria: [
      'Only bundles relevant to the run are enabled as Worker context.',
      'Bundle enablement writes a graph hint and timeline event but grants no execution permission.',
    ],
    safetyControls: ['bundle metadata is not permission', 'Tool Gateway still decides execution'],
  };
}

function validationStep(runnable: number, total: number): RuntimeActivationStep {
  return {
    id: 'activation.validation.smoke',
    kind: 'validation',
    status: runnable > 0 ? 'ready' : 'blocked',
    title: 'Validate at least one governed scanner path',
    detail: `${runnable}/${total} scanner template(s) are runnable on this local node.`,
    affectsProfiles: [],
    affectsTemplates: [],
    affectsEngines: [],
    environment: {},
    acceptanceCriteria: [
      'Operator can preview scanner.run_template before execution.',
      'A low-risk template can produce redacted command_output evidence on an in-scope target.',
      'Blocked templates produce clear audit reasons instead of falling back to raw commands.',
    ],
    safetyControls: ['preview before run', 'scope-gated target', 'evidence-backed result'],
  };
}

function safetyStep(): RuntimeActivationStep {
  return {
    id: 'activation.safety.invariants',
    kind: 'safety',
    status: 'ready',
    title: 'Keep runtime activation behind platform gates',
    detail: 'Runtime activation expands available engines, not Agent authority.',
    affectsProfiles: [],
    affectsTemplates: [],
    affectsEngines: [],
    environment: {},
    acceptanceCriteria: [
      'Workers see governed templates and bundles, not raw shell commands.',
      'Dispatcher remains the only graph writer.',
      'Evidence and Findings remain same-run and review-gated.',
    ],
    safetyControls: ['scope policy', 'risk tiers', 'approval binding', 'audit log', 'redaction', 'rate limit'],
  };
}

function profileCard(profile: ToolboxRuntimeProfile, adapters: ToolAdapterDoctorCard[]): RuntimeActivationProfileCard {
  const related = adapters.filter((adapter) => adapter.profileIds.includes(profile.id));
  const runnableTemplates = related.flatMap((adapter) => adapter.runnableTemplateIds);
  const blockedTemplates = related.flatMap((adapter) => adapter.blockedTemplateIds);
  return {
    id: profile.id,
    name: profile.name,
    runner: profile.runner,
    status: profile.available ? 'ready' : related.length > 0 ? 'operator_action' : 'optional',
    available: profile.available,
    commands: profile.commands,
    runnableTemplates,
    blockedTemplates,
    nextAction: profile.available
      ? 'Profile is available; keep template allowlist and Tool Gateway policy reviewed.'
      : profile.reason ?? 'Install or enable this runtime profile before external templates can run.',
  };
}

function recommendedOrder(steps: RuntimeActivationStep[], profiles: RuntimeActivationProfileCard[]): string[] {
  const actions: string[] = [];
  const policy = steps.find((step) => step.kind === 'policy' && step.status !== 'ready');
  if (policy) actions.push(policy.title);
  const profile = profiles.find((item) => item.status === 'operator_action');
  if (profile) actions.push(`Resolve ${profile.id}: ${profile.nextAction}`);
  const allowlist = steps.find((step) => step.kind === 'allowlist' && step.status !== 'ready');
  if (allowlist) actions.push(allowlist.title);
  const bundle = steps.find((step) => step.kind === 'bundle' && step.status !== 'ready');
  if (bundle) actions.push(bundle.title);
  const validation = steps.find((step) => step.kind === 'validation');
  if (validation) actions.push(validation.title);
  return [...new Set(actions)].slice(0, 6);
}

function profileEnvironment(profileId: string): Record<string, string> {
  if (profileId.startsWith('container.')) {
    return { PLATFORM_ENABLE_CONTAINER_TOOLBOX: '0 -> 1 when Docker/Podman runtime is trusted and installed' };
  }
  if (profileId === 'local.sast') {
    return { PLATFORM_ENABLE_LOCAL_SAST: '0 -> 1 when local source workspace policy is configured' };
  }
  if (profileId === 'mobile.android') {
    return { PLATFORM_ENABLE_ANDROID_TOOLBOX: '0 -> 1 when APK/lab-device policy is configured' };
  }
  return {};
}

function profileSafety(profileId: string): string[] {
  if (profileId.startsWith('container.')) {
    return ['trusted image source', 'resource limits', 'network scoped by target policy', 'ephemeral run directory'];
  }
  if (profileId === 'local.sast') {
    return ['local source only', 'no source upload by default', 'bounded SARIF import'];
  }
  if (profileId === 'mobile.android') {
    return ['APK hash evidence', 'dynamic checks approval-gated', 'lab device isolation'];
  }
  return ['profile probe must be explicit', 'Tool Gateway remains mandatory'];
}

function mergeAllowlist(existing: string[], missing: string[]): string {
  return [...new Set([...existing.filter((item) => item !== '*'), ...missing])].sort().join(',');
}

function uniqueSteps(steps: RuntimeActivationStep[]): RuntimeActivationStep[] {
  const seen = new Set<string>();
  return steps.filter((step) => {
    if (seen.has(step.id)) return false;
    seen.add(step.id);
    return true;
  });
}

function stepSort(left: RuntimeActivationStep, right: RuntimeActivationStep): number {
  return kindWeight(left.kind) - kindWeight(right.kind) || statusWeight(right.status) - statusWeight(left.status) || left.title.localeCompare(right.title);
}

function kindWeight(kind: RuntimeActivationStepKind): number {
  return { policy: 0, profile: 1, allowlist: 2, bundle: 3, validation: 4, safety: 5 }[kind];
}

function statusWeight(status: RuntimeActivationStepStatus): number {
  return { blocked: 4, operator_action: 3, optional: 2, ready: 1 }[status];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
