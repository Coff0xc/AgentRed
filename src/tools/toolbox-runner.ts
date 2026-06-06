import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { newId, nowIso } from '../domain/ids.js';
import type { RegisteredToolboxBundle, RiskLevel, RunToolboxBundleBinding, ScopePolicy } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { PlatformStore } from '../storage/store.js';
import { sandboxToolboxRunner } from '../sandbox/sandbox-toolbox-runner.js';
import {
  findScannerTemplate,
  listScannerTemplates,
  scannerTemplatePolicy,
  listToolboxBundles,
  listToolboxProfiles,
  type ToolboxBundle,
  type ToolboxBundleStatus,
  type ToolTemplateProfile,
  type ToolboxProfile,
  type ToolboxProfileStatus,
} from './toolbox-registry.js';

export interface ToolboxRuntimeProfile extends ToolboxProfile {
  available: boolean;
  runtimeStatus: ToolboxProfileStatus;
  runner: 'builtin' | 'docker' | 'podman' | 'local' | 'none';
  reason?: string;
  image?: string;
}

export interface ToolboxRuntimeBundle extends ToolboxBundle {
  available: boolean;
  runtimeStatus: ToolboxBundleStatus;
  profiles: ToolboxRuntimeProfile[];
  templateCount: number;
  runnableTemplateCount: number;
  blockedReasons: string[];
}

export interface RunToolboxBundleView extends ToolboxRuntimeBundle {
  enabled: boolean;
  binding?: RunToolboxBundleBinding;
}

export interface WorkerToolboxBundleContext {
  id: string;
  name: string;
  version: string;
  source: ToolboxBundle['source'];
  profileIds: string[];
  engines: string[];
  templateIds: string[];
  riskLevels: RiskLevel[];
  safetyNotes: string[];
}

export interface RegisterToolboxBundleInput {
  id: string;
  name: string;
  version: string;
  status?: ToolboxBundleStatus;
  profileIds: string[];
  engines: string[];
  templateIds: string[];
  riskLevels: RiskLevel[];
  safetyNotes: string[];
  installationNotes: string[];
  commercialUseCases: string[];
  registeredBy?: string;
}

export interface ToolboxPolicyView {
  externalExecutionEnabled: boolean;
  allowAllExternalTemplates: boolean;
  allowedExternalTemplates: string[];
  containerProfileProbeEnabled: boolean;
  localSastProbeEnabled: boolean;
  androidToolboxProbeEnabled: boolean;
  safetyControls: string[];
}

export interface ToolboxRunPlan {
  templateId: string;
  profileId: string;
  engine: string;
  runner: ToolboxRuntimeProfile['runner'];
  command: string;
  args: string[];
  target: string;
  riskLevel: RiskLevel;
  timeoutMs: number;
  cwdPolicy: 'ephemeral_tool_run_directory';
  networkPolicy: 'scope_checked_before_execution';
  evidencePolicy: 'stdout_stderr_redacted_command_output';
  approvalRequired: boolean;
}

export interface ToolboxRunResult {
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  startedAt: string;
  endedAt: string;
}

export type ToolboxPlanDecision =
  | { allowed: true; profile: ToolboxRuntimeProfile; template: ToolTemplateProfile; plan: ToolboxRunPlan }
  | { allowed: false; profile?: ToolboxRuntimeProfile; template?: ToolTemplateProfile; plan?: ToolboxRunPlan; reason: string };

export class ToolboxRunner {
  constructor(
    private readonly store?: PlatformStore,
    private readonly graph?: GraphServer,
    private readonly events?: RunEventService,
  ) {}

  async profiles(): Promise<ToolboxRuntimeProfile[]> {
    const profiles: ToolboxRuntimeProfile[] = [];
    for (const profile of listToolboxProfiles()) {
      profiles.push(await this.resolveProfile(profile));
    }
    return profiles;
  }

  policy(): ToolboxPolicyView {
    const allowlist = externalTemplateAllowlist();
    return {
      externalExecutionEnabled: isExternalExecutionEnabled(),
      allowAllExternalTemplates: allowlist.includes('*'),
      allowedExternalTemplates: allowlist,
      containerProfileProbeEnabled: process.env.PLATFORM_ENABLE_CONTAINER_TOOLBOX === '1',
      localSastProbeEnabled: process.env.PLATFORM_ENABLE_LOCAL_SAST === '1',
      androidToolboxProbeEnabled: process.env.PLATFORM_ENABLE_ANDROID_TOOLBOX === '1',
      safetyControls: [
        'External execution requires PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1.',
        'External scanner templates require PLATFORM_ALLOWED_SCANNER_TEMPLATES allowlist membership.',
        'Profile readiness is probed separately from template allowlisting.',
        'Tool Gateway still enforces scope, risk, approval, rate limit, audit, redaction, and evidence handling.',
      ],
    };
  }

  async bundles(): Promise<ToolboxRuntimeBundle[]> {
    const profiles = await this.profiles();
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const templates = listScannerTemplates();
    return this.bundleManifests().map((bundle) => {
      const bundleProfiles = bundle.profileIds
        .map((profileId) => profileById.get(profileId))
        .filter((profile): profile is ToolboxRuntimeProfile => Boolean(profile));
      const bundleTemplates = templates.filter((template) => bundle.templateIds.includes(template.id));
      const runnableTemplates = bundleTemplates.filter((template) => {
        if (template.executionMode === 'builtin') {
          return true;
        }
        const profile = profileById.get(template.profileId);
        return isExternalExecutionEnabled() && isExternalTemplateAllowed(template.id) && Boolean(profile?.available);
      });
      const blockedByTemplateAllowlist = bundleTemplates
        .filter((template) => template.executionMode === 'external' && !isExternalTemplateAllowed(template.id))
        .map((template) => template.id);
      const blockedReasons = [
        ...bundleProfiles.filter((profile) => !profile.available && profile.reason).map((profile) => `${profile.id}: ${profile.reason}`),
        ...(hasExternalTemplates(bundleTemplates) && !isExternalExecutionEnabled()
          ? ['External toolbox execution is disabled by policy.']
          : []),
        ...(isExternalExecutionEnabled() && blockedByTemplateAllowlist.length > 0
          ? [`External scanner template allowlist does not include: ${blockedByTemplateAllowlist.join(', ')}`]
          : []),
      ];
      return {
        ...bundle,
        available: runnableTemplates.length > 0 && runnableTemplates.length === bundleTemplates.length,
        runtimeStatus: bundleRuntimeStatus(bundle, bundleProfiles, bundleTemplates.length, runnableTemplates.length),
        profiles: bundleProfiles,
        templateCount: bundleTemplates.length,
        runnableTemplateCount: runnableTemplates.length,
        blockedReasons: [...new Set(blockedReasons)],
      };
    });
  }

  registerBundle(input: RegisterToolboxBundleInput): RegisteredToolboxBundle {
    if (!this.store) {
      throw new Error('Toolbox bundle registration requires a platform store');
    }
    if (listToolboxBundles().some((bundle) => bundle.id === input.id)) {
      throw new Error(`Cannot replace built-in toolbox bundle: ${input.id}`);
    }
    if (!input.id.startsWith('bundle.custom.')) {
      throw new Error('Custom toolbox bundle ids must start with bundle.custom.');
    }
    const bundle: RegisteredToolboxBundle = {
      id: input.id,
      name: input.name,
      version: input.version,
      source: 'local_manifest',
      status: input.status ?? 'planned',
      profileIds: [...new Set(input.profileIds)],
      engines: [...new Set(input.engines)],
      templateIds: [...new Set(input.templateIds)],
      riskLevels: [...new Set(input.riskLevels)],
      safetyNotes: [...input.safetyNotes],
      installationNotes: [...input.installationNotes],
      commercialUseCases: [...input.commercialUseCases],
      manifestSha256: hashManifest(input),
      registeredBy: input.registeredBy ?? 'operator',
      registeredAt: nowIso(),
    };
    this.store.state.registeredToolboxBundles[bundle.id] = bundle;
    this.store.commit();
    return bundle;
  }

  async listForRun(runId: string): Promise<RunToolboxBundleView[]> {
    this.graph?.getRun(runId);
    const bindings = this.bindingsForRun(runId);
    return (await this.bundles()).map((bundle) => {
      const binding = bindings.find((item) => item.bundleId === bundle.id);
      return { ...bundle, enabled: Boolean(binding), binding };
    });
  }

  enable(runId: string, bundleId: string, enabledBy: RunToolboxBundleBinding['enabledBy'] = 'operator'): {
    bundle: ToolboxBundle;
    binding: RunToolboxBundleBinding;
  } {
    if (!this.store) {
      throw new Error('Toolbox bundle enablement requires a platform store');
    }
    this.graph?.getRun(runId);
    const bundle = this.findBundleManifest(bundleId);
    if (!bundle) {
      throw new Error(`Toolbox bundle not found: ${bundleId}`);
    }
    const existing = this.bindingsForRun(runId).find((item) => item.bundleId === bundleId);
    if (existing) {
      return { bundle, binding: existing };
    }
    const binding: RunToolboxBundleBinding = {
      id: newId('run_bundle'),
      runId,
      bundleId,
      enabledAt: nowIso(),
      enabledBy,
    };
    this.store.state.runToolboxBundleBindings[binding.id] = binding;
    this.graph?.addHint(runId, this.enabledHint(bundle));
    this.events?.record({
      runId,
      type: 'toolbox.bundle.enabled',
      title: 'Toolbox Bundle enabled',
      detail: `${bundle.name} (${bundle.id})`,
      entityId: binding.id,
    });
    this.store.commit();
    return { bundle, binding };
  }

  workerContext(runId: string): WorkerToolboxBundleContext[] {
    const bindings = this.bindingsForRun(runId);
    return bindings
      .map((binding) => this.findBundleManifest(binding.bundleId))
      .filter((bundle): bundle is ToolboxBundle => Boolean(bundle))
      .map((bundle) => ({
        id: bundle.id,
        name: bundle.name,
        version: bundle.version,
        source: bundle.source,
        profileIds: [...bundle.profileIds],
        engines: [...bundle.engines],
        templateIds: [...bundle.templateIds],
        riskLevels: [...bundle.riskLevels],
        safetyNotes: [...bundle.safetyNotes],
      }));
  }

  workerHints(runId: string): string[] {
    return this.workerContext(runId).map(
      (bundle) =>
        `[${bundle.id}] Toolbox bundle context enabled. Prefer its governed scanner templates when they match the intent, but do not assume execution permission or bypass Tool Gateway gates.`,
    );
  }

  async planTemplate(input: {
    templateId: string;
    target: string;
    riskLevel: RiskLevel;
    timeoutMs: number;
  }): Promise<ToolboxPlanDecision> {
    const template = findScannerTemplate(input.templateId);
    if (!template) {
      return { allowed: false, reason: `Unknown scanner template: ${input.templateId}` };
    }
    const profile = await this.resolveProfileById(template.profileId);
    if (!profile) {
      return { allowed: false, template, reason: `Toolbox profile not found: ${template.profileId}` };
    }
    const policy = scannerTemplatePolicy(template.id);
    if (policy && !policy.allowedRiskLevels.includes(input.riskLevel)) {
      return {
        allowed: false,
        profile,
        template,
        reason: `Risk level ${input.riskLevel} is not allowed for scanner template ${template.id}; allowed: ${policy.allowedRiskLevels.join(', ')}`,
      };
    }
    const plan = buildPlan(template, profile, input.target, input.riskLevel, Math.min(input.timeoutMs, policy?.maxTimeoutMs ?? input.timeoutMs));
    if (template.executionMode === 'builtin') {
      return { allowed: true, profile, template, plan };
    }
    if (!isExternalExecutionEnabled()) {
      return {
        allowed: false,
        profile,
        template,
        plan,
        reason: `External toolbox execution is disabled by policy for profile ${profile.id}`,
      };
    }
    if (!isExternalTemplateAllowed(template.id)) {
      return {
        allowed: false,
        profile,
        template,
        plan,
        reason: `External scanner template is not allowlisted: ${template.id}`,
      };
    }
    if (!profile.available) {
      return {
        allowed: false,
        profile,
        template,
        plan,
        reason: profile.reason ?? `Toolbox profile is unavailable: ${profile.id}`,
      };
    }
    return { allowed: true, profile, template, plan };
  }

  async executePlan(plan: ToolboxRunPlan, toolCallId: string, scopePolicy?: ScopePolicy): Promise<ToolboxRunResult> {
    const cwd = join(process.cwd(), '.local', 'tool-runs', toolCallId);
    mkdirSync(cwd, { recursive: true });

    // Try sandbox mode first if enabled
    const sandboxEnabled = await sandboxToolboxRunner.isEnabled();
    if (sandboxEnabled && scopePolicy && plan.runner !== 'builtin') {
      const canRun = await sandboxToolboxRunner.canRun();
      if (canRun.available) {
        try {
          const result = await sandboxToolboxRunner.run(
            {
              templateId: plan.templateId,
              target: plan.target,
              timeoutMs: plan.timeoutMs,
              scopePolicy,
              cpuLimit: '1.0',
              memoryLimit: '512m',
              workDir: '/workspace',
            },
            [plan.command],
            plan.args
          );
          return {
            command: plan.command,
            args: plan.args,
            cwd: `sandbox:${result.sandboxId}`,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            startedAt: result.startedAt,
            endedAt: result.endedAt,
          };
        } catch (err) {
          console.error('Sandbox execution failed, falling back to process execution:', err);
        }
      }
    }

    // Fallback to direct process execution
    return runToolboxProcess(plan.command, plan.args, cwd, plan.timeoutMs);
  }

  private async resolveProfileById(profileId: string): Promise<ToolboxRuntimeProfile | undefined> {
    const profile = listToolboxProfiles().find((item) => item.id === profileId);
    return profile ? this.resolveProfile(profile) : undefined;
  }

  private async resolveProfile(profile: ToolboxProfile): Promise<ToolboxRuntimeProfile> {
    if (profile.kind === 'builtin') {
      return { ...profile, available: true, runtimeStatus: 'available', runner: 'builtin' };
    }
    if (profile.id === 'container.web-recon' || profile.id === 'container.network-recon') {
      if (process.env.PLATFORM_ENABLE_CONTAINER_TOOLBOX !== '1') {
        return {
          ...profile,
          available: false,
          runtimeStatus: 'planned',
          runner: 'none',
          image: containerImage(profile.id),
          reason: 'Set PLATFORM_ENABLE_CONTAINER_TOOLBOX=1 to enable Docker/Podman profile probing.',
        };
      }
      const runner = await firstAvailableCommand(preferredContainerRuntimes());
      if (!runner) {
        return {
          ...profile,
          available: false,
          runtimeStatus: 'unavailable',
          runner: 'none',
          image: containerImage(profile.id),
          reason: 'Docker or Podman command is not available.',
        };
      }
      return {
        ...profile,
        available: true,
        runtimeStatus: 'available',
        runner,
        image: containerImage(profile.id),
      };
    }
    if (profile.id === 'local.sast') {
      if (process.env.PLATFORM_ENABLE_LOCAL_SAST !== '1') {
        return {
          ...profile,
          available: false,
          runtimeStatus: 'planned',
          runner: 'none',
          reason: 'Set PLATFORM_ENABLE_LOCAL_SAST=1 to probe local SAST commands.',
        };
      }
      const workspaceCheck = localSastWorkspaceCheck();
      if (!workspaceCheck.workspace) {
        return {
          ...profile,
          available: false,
          runtimeStatus: 'unavailable',
          runner: 'none',
          reason: workspaceCheck.reason,
        };
      }
      const semgrep = await firstAvailableCommand(['semgrep']);
      return semgrep
        ? { ...profile, available: true, runtimeStatus: 'available', runner: 'local' }
        : { ...profile, available: false, runtimeStatus: 'unavailable', runner: 'none', reason: 'semgrep command is not available.' };
    }
    if (profile.id === 'mobile.android') {
      if (process.env.PLATFORM_ENABLE_ANDROID_TOOLBOX !== '1') {
        return {
          ...profile,
          available: false,
          runtimeStatus: 'planned',
          runner: 'none',
          reason: 'Set PLATFORM_ENABLE_ANDROID_TOOLBOX=1 to probe Android analysis commands.',
        };
      }
      const apktool = await firstAvailableCommand(['apktool']);
      return apktool
        ? { ...profile, available: true, runtimeStatus: 'available', runner: 'local' }
        : { ...profile, available: false, runtimeStatus: 'unavailable', runner: 'none', reason: 'apktool command is not available.' };
    }
    return { ...profile, available: false, runtimeStatus: profile.status, runner: 'none', reason: 'No runtime resolver is registered.' };
  }

  private bundleManifests(): ToolboxBundle[] {
    const registered = this.store
      ? Object.values(this.store.state.registeredToolboxBundles)
          .sort((left, right) => left.registeredAt.localeCompare(right.registeredAt))
          .map(registeredBundleToManifest)
      : [];
    return [...listToolboxBundles(), ...registered];
  }

  private findBundleManifest(bundleId: string): ToolboxBundle | undefined {
    return this.bundleManifests().find((bundle) => bundle.id === bundleId);
  }

  private bindingsForRun(runId: string): RunToolboxBundleBinding[] {
    if (!this.store) {
      return [];
    }
    return Object.values(this.store.state.runToolboxBundleBindings)
      .filter((binding) => binding.runId === runId)
      .sort((left, right) => left.enabledAt.localeCompare(right.enabledAt));
  }

  private enabledHint(bundle: ToolboxBundle): string {
    return [
      `Toolbox Bundle enabled: ${bundle.name} (${bundle.id}).`,
      `Templates: ${bundle.templateIds.join(', ')}.`,
      `Engines: ${bundle.engines.join(', ')}.`,
      `Risk levels: ${bundle.riskLevels.join(', ')}.`,
      'This bundle is context only; tool execution still requires Tool Gateway scope, approval, profile readiness, and evidence gates.',
    ].join(' ');
  }
}

function registeredBundleToManifest(bundle: RegisteredToolboxBundle): ToolboxBundle {
  return {
    id: bundle.id,
    name: bundle.name,
    version: bundle.version,
    source: bundle.source,
    status: bundle.status,
    profileIds: [...bundle.profileIds],
    engines: [...bundle.engines],
    templateIds: [...bundle.templateIds],
    riskLevels: [...bundle.riskLevels],
    safetyNotes: [
      ...bundle.safetyNotes,
      `Local manifest SHA-256: ${bundle.manifestSha256}`,
      `Registered by ${bundle.registeredBy} at ${bundle.registeredAt}`,
    ],
    installationNotes: [...bundle.installationNotes],
    commercialUseCases: [...bundle.commercialUseCases],
  };
}

function hashManifest(input: RegisterToolboxBundleInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: input.id,
        name: input.name,
        version: input.version,
        status: input.status ?? 'planned',
        profileIds: [...new Set(input.profileIds)].sort(),
        engines: [...new Set(input.engines)].sort(),
        templateIds: [...new Set(input.templateIds)].sort(),
        riskLevels: [...new Set(input.riskLevels)].sort(),
        safetyNotes: input.safetyNotes,
        installationNotes: input.installationNotes,
        commercialUseCases: input.commercialUseCases,
      }),
    )
    .digest('hex');
}

function bundleRuntimeStatus(
  bundle: ToolboxBundle,
  profiles: ToolboxRuntimeProfile[],
  templateCount: number,
  runnableTemplateCount: number,
): ToolboxBundleStatus {
  if (templateCount > 0 && runnableTemplateCount === templateCount) {
    return 'available';
  }
  if (runnableTemplateCount > 0) {
    return 'partial';
  }
  if (profiles.some((profile) => profile.runtimeStatus === 'unavailable')) {
    return 'unavailable';
  }
  return bundle.status;
}

function hasExternalTemplates(templates: ToolTemplateProfile[]): boolean {
  return templates.some((template) => template.executionMode === 'external');
}

function runToolboxProcess(command: string, args: string[], cwd: string, timeoutMs: number): Promise<ToolboxRunResult> {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        command,
        args,
        cwd,
        stdout,
        stderr,
        exitCode,
        timedOut,
        startedAt,
        endedAt: new Date().toISOString(),
      });
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      stderr = stderr || error.message;
      finish(null);
    });
    child.on('close', (code) => {
      finish(code);
    });
  });
}

function buildPlan(
  template: ToolTemplateProfile,
  profile: ToolboxRuntimeProfile,
  target: string,
  riskLevel: RiskLevel,
  timeoutMs: number,
): ToolboxRunPlan {
  const command = profile.runner === 'docker' || profile.runner === 'podman' ? profile.runner : template.engine;
  return {
    templateId: template.id,
    profileId: template.profileId,
    engine: template.engine,
    runner: profile.runner,
    command,
    args: planArgs(template, profile, target),
    target,
    riskLevel,
    timeoutMs,
    cwdPolicy: 'ephemeral_tool_run_directory',
    networkPolicy: 'scope_checked_before_execution',
    evidencePolicy: 'stdout_stderr_redacted_command_output',
    approvalRequired: template.defaultRiskLevel === 'R3' || template.defaultRiskLevel === 'R4',
  };
}

function planArgs(template: ToolTemplateProfile, profile: ToolboxRuntimeProfile, target: string): string[] {
  if (profile.runner === 'docker' || profile.runner === 'podman') {
    const image = profile.image ?? containerImage(profile.id);
    if (template.engine === 'nuclei') {
      return ['run', '--rm', image, 'nuclei', '-u', target, '-severity', 'low,medium,high,critical', '-jsonl'];
    }
    if (template.engine === 'httpx') {
      return ['run', '--rm', image, 'httpx', '-u', target, '-json', '-silent'];
    }
    if (template.engine === 'ffuf') {
      return ['run', '--rm', image, 'ffuf', '-u', `${target.replace(/\/$/, '')}/FUZZ`, '-of', 'json'];
    }
    if (template.engine === 'sqlmap') {
      return ['run', '--rm', image, 'sqlmap', '-u', target, '--batch', '--smart'];
    }
    if (template.engine === 'nmap') {
      return ['run', '--rm', image, 'nmap', '-Pn', '--top-ports', '100', '--open', targetHost(target)];
    }
    if (template.engine === 'tlsx') {
      return ['run', '--rm', image, 'tlsx', '-u', targetHost(target), '-json', '-silent'];
    }
  }
  if (template.engine === 'semgrep') {
    const workspace = localSastWorkspaceCheck().workspace ?? '<PLATFORM_SAST_WORKSPACE-required>';
    const config = process.env.PLATFORM_SEMGREP_CONFIG?.trim() || 'auto';
    return ['scan', '--json', '--metrics=off', '--disable-version-check', '--config', config, workspace];
  }
  if (template.engine === 'apktool') {
    return ['d', '<apk-artifact>', '-o', '<ephemeral-output>'];
  }
  if (template.engine === 'frida') {
    return ['--codeshare', '<approved-probe>', '<lab-device-target>'];
  }
  return [target];
}

function preferredContainerRuntimes(): Array<'docker' | 'podman'> {
  const preferred = process.env.PLATFORM_CONTAINER_RUNTIME;
  if (preferred === 'podman') {
    return ['podman', 'docker'];
  }
  return ['docker', 'podman'];
}

function containerImage(profileId = 'container.web-recon'): string {
  if (profileId === 'container.network-recon') {
    return process.env.PLATFORM_NETWORK_RECON_IMAGE ?? 'ghcr.io/coff0xc/ai-pentest-toolbox:network-recon';
  }
  return process.env.PLATFORM_WEB_RECON_IMAGE ?? 'ghcr.io/coff0xc/ai-pentest-toolbox:web-recon';
}

function targetHost(target: string): string {
  try {
    return new URL(target).hostname;
  } catch {
    return target.replace(/\/.*$/, '');
  }
}

function localSastWorkspaceCheck(): { workspace?: string; reason: string } {
  const raw = process.env.PLATFORM_SAST_WORKSPACE?.trim();
  if (!raw) {
    return {
      reason:
        'Set PLATFORM_SAST_WORKSPACE to an explicit source workspace; local SAST never defaults to the platform process cwd.',
    };
  }
  const workspace = resolve(raw);
  try {
    const stat = statSync(workspace);
    if (!stat.isDirectory()) {
      return { reason: `PLATFORM_SAST_WORKSPACE is not a directory: ${workspace}` };
    }
    return { workspace, reason: 'local SAST workspace is configured' };
  } catch {
    return { reason: `PLATFORM_SAST_WORKSPACE does not exist: ${workspace}` };
  }
}

function isExternalExecutionEnabled(): boolean {
  return process.env.PLATFORM_ALLOW_EXTERNAL_TOOLBOX === '1';
}

function isExternalTemplateAllowed(templateId: string): boolean {
  const allowlist = externalTemplateAllowlist();
  return allowlist.includes('*') || allowlist.includes(templateId);
}

function externalTemplateAllowlist(): string[] {
  return [
    ...new Set(
      (process.env.PLATFORM_ALLOWED_SCANNER_TEMPLATES ?? '')
        .split(/[,;\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].sort();
}

async function firstAvailableCommand<T extends string>(commands: T[]): Promise<T | undefined> {
  for (const command of commands) {
    if (await commandAvailable(command)) {
      return command;
    }
  }
  return undefined;
}

function commandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'], shell: false });
    const timeout = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 1200);
    child.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}
