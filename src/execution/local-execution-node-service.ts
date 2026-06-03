import { nowIso } from '../domain/ids.js';
import type { BrowserSessionStatus, OastSessionStatus, ProxySessionStatus } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import type { ToolboxDoctorService } from '../tools/toolbox-doctor-service.js';
import type { ToolboxRunner } from '../tools/toolbox-runner.js';
import type { WorkerRuntimeService } from '../workers/worker-runtime-service.js';

export type LocalExecutionNodeStatus = 'ready' | 'partial' | 'blocked';
export type LocalExecutionNodeGateStatus = 'pass' | 'warn' | 'fail';

export interface LocalExecutionNodeGate {
  id: string;
  title: string;
  status: LocalExecutionNodeGateStatus;
  detail: string;
}

export interface LocalExecutionRuntimeCard {
  id: string;
  title: string;
  status: LocalExecutionNodeStatus;
  detail: string;
  signals: string[];
  gaps: string[];
}

export interface LocalExecutionNodeReport {
  runId: string;
  generatedAt: string;
  nodeId: 'local.execution.node';
  mode: 'local_first_control_plane';
  status: LocalExecutionNodeStatus;
  summary: string;
  counts: {
    profiles: number;
    availableProfiles: number;
    adapters: number;
    readyAdapters: number;
    scannerTemplates: number;
    runnableScannerTemplates: number;
    workers: number;
    healthyWorkers: number;
    activeBrowserSessions: number;
    activeProxySessions: number;
    activeOastSessions: number;
    enabledToolboxBundles: number;
    enabledConnectors: number;
  };
  policy: {
    externalExecutionEnabled: boolean;
    allowAllExternalTemplates: boolean;
    allowedExternalTemplateCount: number;
    containerProfileProbeEnabled: boolean;
    localSastProbeEnabled: boolean;
    androidToolboxProbeEnabled: boolean;
  };
  runtimes: LocalExecutionRuntimeCard[];
  gates: LocalExecutionNodeGate[];
  recommendedActions: string[];
  safetyNotes: string[];
}

export class LocalExecutionNodeService {
  constructor(
    private readonly store: PlatformStore,
    private readonly toolbox: ToolboxRunner,
    private readonly toolboxDoctor: ToolboxDoctorService,
    private readonly workerRuntimes: WorkerRuntimeService,
  ) {}

  async get(runId: string): Promise<LocalExecutionNodeReport> {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
    const [profiles, bundles, doctor, workers] = await Promise.all([
      this.toolbox.profiles(),
      this.toolbox.bundles(),
      this.toolboxDoctor.report(),
      this.workerRuntimes.list(runId),
    ]);
    const policy = this.toolbox.policy();
    const browserSessions = Object.values(this.store.state.browserSessions).filter((item) => item.runId === runId);
    const proxySessions = Object.values(this.store.state.proxySessions).filter((item) => item.runId === runId);
    const oastSessions = Object.values(this.store.state.oastSessions).filter((item) => item.runId === runId);
    const enabledToolboxBundles = Object.values(this.store.state.runToolboxBundleBindings).filter((item) => item.runId === runId);
    const enabledConnectors = Object.values(this.store.state.runConnectorBindings).filter((item) => item.runId === runId);
    const activeBrowserSessions = countStatus(browserSessions, 'active');
    const activeProxySessions = countStatus(proxySessions, 'active');
    const activeOastSessions = countStatus(oastSessions, 'active');
    const healthyWorkers = workers.filter((worker) => worker.healthy).length;
    const counts = {
      profiles: profiles.length,
      availableProfiles: profiles.filter((profile) => profile.available).length,
      adapters: doctor.counts.adapters,
      readyAdapters: doctor.counts.ready,
      scannerTemplates: doctor.counts.templates,
      runnableScannerTemplates: doctor.counts.runnableTemplates,
      workers: workers.length,
      healthyWorkers,
      activeBrowserSessions,
      activeProxySessions,
      activeOastSessions,
      enabledToolboxBundles: enabledToolboxBundles.length,
      enabledConnectors: enabledConnectors.length,
    };
    const gates = [
      gate(
        'tool_gateway_only',
        'Tool Gateway is the only execution path',
        'pass',
        'Workers can request high-level tools, but all execution still goes through scope, approval, audit, redaction, and evidence gates.',
      ),
      gate(
        'external_toolbox_policy',
        'External toolbox fail-closed policy',
        policy.externalExecutionEnabled ? 'warn' : 'pass',
        policy.externalExecutionEnabled
          ? `${policy.allowedExternalTemplates.length} external template(s) are allowlisted on this local node.`
          : 'External toolbox execution is disabled by default.',
      ),
      gate(
        'worker_runtime_health',
        'Agent Worker runtime health',
        workers.length === 0 ? 'warn' : healthyWorkers === workers.length ? 'pass' : healthyWorkers > 0 ? 'warn' : 'fail',
        workers.length === 0
          ? 'No Worker runtimes are configured for this run.'
          : `${healthyWorkers}/${workers.length} Worker runtime(s) are healthy.`,
      ),
      gate(
        'browser_proxy_surface',
        'Browser and proxy surface',
        activeBrowserSessions > 0 && activeProxySessions > 0 ? 'pass' : activeBrowserSessions + activeProxySessions > 0 ? 'warn' : 'warn',
        `${activeBrowserSessions} active browser session(s), ${activeProxySessions} active proxy session(s). TLS MITM remains a planned desktop capability.`,
      ),
      gate(
        'oast_surface',
        'OAST callback surface',
        activeOastSessions > 0 ? 'pass' : 'warn',
        activeOastSessions > 0
          ? `${activeOastSessions} local OAST inbox session(s) are active.`
          : 'No active OAST inbox for out-of-band validation.',
      ),
      gate(
        'toolbox_runtime_readiness',
        'Toolbox runtime readiness',
        doctor.counts.runnableTemplates > 0 ? 'pass' : 'warn',
        `${doctor.counts.runnableTemplates}/${doctor.counts.templates} scanner template(s) are runnable on this node.`,
      ),
    ];
    const status = nodeStatus(gates, counts);
    return {
      runId,
      generatedAt: nowIso(),
      nodeId: 'local.execution.node',
      mode: 'local_first_control_plane',
      status,
      summary:
        `${counts.healthyWorkers}/${counts.workers} Worker runtime(s), ` +
        `${counts.runnableScannerTemplates}/${counts.scannerTemplates} runnable scanner template(s), ` +
        `${counts.activeBrowserSessions + counts.activeProxySessions + counts.activeOastSessions} active local session(s).`,
      counts,
      policy: {
        externalExecutionEnabled: policy.externalExecutionEnabled,
        allowAllExternalTemplates: policy.allowAllExternalTemplates,
        allowedExternalTemplateCount: policy.allowedExternalTemplates.length,
        containerProfileProbeEnabled: policy.containerProfileProbeEnabled,
        localSastProbeEnabled: policy.localSastProbeEnabled,
        androidToolboxProbeEnabled: policy.androidToolboxProbeEnabled,
      },
      runtimes: [
        profileRuntimeCard(profiles.length, counts.availableProfiles),
        adapterRuntimeCard(doctor.counts.adapters, doctor.counts.ready, doctor.counts.partial, doctor.counts.policyBlocked, doctor.counts.profileBlocked),
        workerRuntimeCard(workers.length, healthyWorkers),
        sessionRuntimeCard('browser', 'Browser controller', browserSessions, 'HTTP fetch controller; full desktop browser automation and DOM execution are future node capabilities.'),
        sessionRuntimeCard('proxy', 'HTTP proxy capture', proxySessions, 'Absolute-form HTTP capture exists; TLS MITM and local CA management are future desktop capabilities.'),
        sessionRuntimeCard('oast', 'OAST callback inbox', oastSessions, 'Local HTTP callbacks exist; interactsh-compatible public callback URLs can be configured, while relay polling remains future work.'),
        bundleRuntimeCard(bundles.length, bundles.filter((bundle) => bundle.runtimeStatus === 'available').length, enabledToolboxBundles.length),
        connectorRuntimeCard(enabledConnectors.length),
      ],
      gates,
      recommendedActions: recommendedActions(doctor.recommendedActions, gates, counts),
      safetyNotes: [
        'Local Execution Node is a read-only readiness view.',
        'It does not execute tools, start containers, approve actions, create sessions, or grant Worker permissions.',
        'External tools remain fail-closed behind environment, allowlist, runtime-profile, Tool Gateway, scope, approval, audit, redaction, and evidence gates.',
        'Browser, proxy, and OAST sessions are operator-controlled local surfaces; Workers only see governed evidence and high-level tool contracts.',
      ],
    };
  }
}

function profileRuntimeCard(total: number, available: number): LocalExecutionRuntimeCard {
  return card({
    id: 'runtime.profiles',
    title: 'Runtime profiles',
    status: total > 0 && available === total ? 'ready' : available > 0 ? 'partial' : 'blocked',
    detail: `${available}/${total} runtime profile(s) available.`,
    signals: [`available=${available}`, `total=${total}`],
    gaps: available < total ? ['Install or enable missing local/container/SAST/mobile profiles before promising tool coverage.'] : [],
  });
}

function adapterRuntimeCard(total: number, ready: number, partial: number, policyBlocked: number, profileBlocked: number): LocalExecutionRuntimeCard {
  return card({
    id: 'runtime.adapters',
    title: 'Tool adapters',
    status: ready === total ? 'ready' : ready + partial > 0 ? 'partial' : 'blocked',
    detail: `${ready} ready adapter(s), ${partial} partial, ${policyBlocked + profileBlocked} blocked by policy/profile.`,
    signals: [`ready=${ready}`, `partial=${partial}`, `policyBlocked=${policyBlocked}`, `profileBlocked=${profileBlocked}`],
    gaps: [
      ...(policyBlocked > 0 ? ['Decide which external templates are commercially allowed on this local node.'] : []),
      ...(profileBlocked > 0 ? ['Install or probe missing runtime commands before enabling external templates.'] : []),
    ],
  });
}

function workerRuntimeCard(total: number, healthy: number): LocalExecutionRuntimeCard {
  return card({
    id: 'runtime.workers',
    title: 'Agent Workers',
    status: total > 0 && healthy === total ? 'ready' : healthy > 0 ? 'partial' : 'blocked',
    detail: `${healthy}/${total} Worker runtime(s) healthy.`,
    signals: [`healthy=${healthy}`, `total=${total}`],
    gaps: total === 0 || healthy < total ? ['Configure and healthcheck Worker CLI runtimes before increasing autonomous concurrency.'] : [],
  });
}

function sessionRuntimeCard(
  id: 'browser' | 'proxy' | 'oast',
  title: string,
  sessions: Array<{ status: BrowserSessionStatus | ProxySessionStatus | OastSessionStatus; limitations?: string[] }>,
  plannedGap: string,
): LocalExecutionRuntimeCard {
  const active = sessions.filter((session) => session.status === 'active').length;
  return card({
    id: `runtime.${id}`,
    title,
    status: active > 0 ? 'ready' : 'partial',
    detail: `${active}/${sessions.length} active session(s).`,
    signals: [`active=${active}`, `total=${sessions.length}`],
    gaps: active > 0 ? [...new Set(sessions.flatMap((session) => session.limitations ?? []))].slice(0, 3) : [plannedGap],
  });
}

function bundleRuntimeCard(total: number, available: number, enabled: number): LocalExecutionRuntimeCard {
  return card({
    id: 'runtime.bundles',
    title: 'Toolbox bundles',
    status: available > 0 ? 'partial' : 'blocked',
    detail: `${available}/${total} bundle(s) fully available; ${enabled} enabled for this run.`,
    signals: [`available=${available}`, `enabled=${enabled}`],
    gaps: enabled === 0 ? ['Enable relevant governed bundles as Worker context when the run needs broader tool coverage.'] : [],
  });
}

function connectorRuntimeCard(enabled: number): LocalExecutionRuntimeCard {
  return card({
    id: 'runtime.connectors',
    title: 'External connector context',
    status: enabled > 0 ? 'partial' : 'blocked',
    detail: `${enabled} connector manifest(s) enabled for this run.`,
    signals: [`enabled=${enabled}`],
    gaps: enabled === 0 ? ['Register and enable connector metadata for external MCP/CLI/API/container ecosystems before mapping them into governed templates.'] : [],
  });
}

function card(input: LocalExecutionRuntimeCard): LocalExecutionRuntimeCard {
  return input;
}

function gate(id: string, title: string, status: LocalExecutionNodeGateStatus, detail: string): LocalExecutionNodeGate {
  return { id, title, status, detail };
}

function countStatus<T extends { status: string }>(items: T[], status: T['status']): number {
  return items.filter((item) => item.status === status).length;
}

function nodeStatus(gates: LocalExecutionNodeGate[], counts: LocalExecutionNodeReport['counts']): LocalExecutionNodeStatus {
  if (gates.some((gate) => gate.status === 'fail')) {
    return 'blocked';
  }
  if (counts.healthyWorkers > 0 && counts.runnableScannerTemplates > 0) {
    return gates.some((gate) => gate.status === 'warn') ? 'partial' : 'ready';
  }
  return 'partial';
}

function recommendedActions(
  doctorActions: string[],
  gates: LocalExecutionNodeGate[],
  counts: LocalExecutionNodeReport['counts'],
): string[] {
  const actions = [...doctorActions];
  if (counts.healthyWorkers === 0) {
    actions.unshift('Fix Worker runtime health before relying on autonomous dispatch.');
  }
  if (counts.activeBrowserSessions === 0) {
    actions.push('Start a browser session when the run needs visible web exploration evidence.');
  }
  if (counts.activeProxySessions === 0) {
    actions.push('Start a proxy capture session when desktop/browser traffic should become reviewable evidence.');
  }
  if (counts.activeOastSessions === 0) {
    actions.push('Start an OAST inbox only for approved out-of-band validation scenarios.');
  }
  if (gates.some((gate) => gate.status === 'fail')) {
    actions.unshift('Resolve failed local execution gates before expanding tool coverage.');
  }
  return [...new Set(actions)].slice(0, 8);
}
