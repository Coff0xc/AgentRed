import { existsSync } from 'node:fs';

import { nowIso } from '../domain/ids.js';
import type { PlatformStore } from '../storage/store.js';
import type { LocalExecutionNodeReport, LocalExecutionNodeService, LocalExecutionNodeStatus } from '../execution/local-execution-node-service.js';

export type DesktopRunnerComponentStatus = 'ready' | 'partial' | 'planned' | 'blocked';

export interface DesktopRunnerComponent {
  id: string;
  name: string;
  status: DesktopRunnerComponentStatus;
  ownerSurface: string;
  currentState: string;
  implementedSignals: string[];
  missingPieces: string[];
  nextBuildActions: string[];
  securityGates: string[];
}

export interface DesktopRunnerHandoffContract {
  id: string;
  name: string;
  status: DesktopRunnerComponentStatus;
  producer: string;
  consumer: string;
  contract: string[];
  mustNotDo: string[];
}

export interface DesktopRunnerReadinessReport {
  runId: string;
  generatedAt: string;
  mode: 'desktop_runner_readiness';
  status: DesktopRunnerComponentStatus;
  summary: string;
  counts: {
    components: number;
    ready: number;
    partial: number;
    planned: number;
    blocked: number;
    activeLocalSessions: number;
    evidenceItems: number;
    credentialReferences: number;
    runnableScannerTemplates: number;
    healthyWorkers: number;
    commercialDesktopGaps: number;
  };
  components: DesktopRunnerComponent[];
  handoffContracts: DesktopRunnerHandoffContract[];
  nextActions: string[];
  safetyNotes: string[];
}

export class DesktopRunnerReadinessService {
  constructor(
    private readonly store: PlatformStore,
    private readonly executionNode: LocalExecutionNodeService,
  ) {}

  async get(runId: string): Promise<DesktopRunnerReadinessReport> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const node = await this.executionNode.get(runId);
    const signals = runSignals(this.store, runId, node);
    const components = [
      webConsoleComponent(),
      tauriShellComponent(),
      rustDaemonComponent(),
      browserControllerComponent(signals.activeBrowserSessions),
      mitmProxyComponent(signals.activeProxySessions),
      vaultComponent(signals.credentialReferences),
      toolboxRuntimeComponent(node.status, signals.runnableScannerTemplates, signals.healthyWorkers),
      evidenceViewerComponent(signals.evidenceItems),
      cloudSyncComponent(signals.reportBundles, signals.safeEvidenceItems),
      remoteWorkerComponent(run.workerPool.length, signals.healthyWorkers),
    ];
    const counts = {
      components: components.length,
      ready: countStatus(components, 'ready'),
      partial: countStatus(components, 'partial'),
      planned: countStatus(components, 'planned'),
      blocked: countStatus(components, 'blocked'),
      activeLocalSessions: signals.activeBrowserSessions + signals.activeProxySessions + signals.activeOastSessions,
      evidenceItems: signals.evidenceItems,
      credentialReferences: signals.credentialReferences,
      runnableScannerTemplates: signals.runnableScannerTemplates,
      healthyWorkers: signals.healthyWorkers,
      commercialDesktopGaps: components.filter((item) => item.status === 'planned' || item.status === 'blocked').length,
    };
    const status = overallStatus(counts, components);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'desktop_runner_readiness',
      status,
      summary:
        `${counts.ready} ready, ${counts.partial} partial, ${counts.planned} planned desktop component(s). ` +
        `${counts.activeLocalSessions} active local session(s), ${counts.runnableScannerTemplates} runnable scanner template(s), ` +
        `${counts.evidenceItems} evidence item(s).`,
      counts,
      components,
      handoffContracts: handoffContracts(components),
      nextActions: nextActions(components, counts),
      safetyNotes: [
        'Desktop Runner Readiness is a read-only productization view.',
        'It does not install a certificate, start a proxy, run a browser, execute tools, grant Worker permissions, or sync evidence.',
        'Tauri shell, Rust daemon, TLS MITM, vault, toolbox, and cloud sync must keep the existing Tool Gateway, scope, approval, audit, redaction, and evidence gates.',
        'Raw credentials and raw local-only traffic remain local-only unless an operator explicitly creates a safe redacted export.',
      ],
    };
  }
}

interface DesktopSignals {
  activeBrowserSessions: number;
  activeProxySessions: number;
  activeOastSessions: number;
  evidenceItems: number;
  safeEvidenceItems: number;
  reportBundles: number;
  credentialReferences: number;
  runnableScannerTemplates: number;
  healthyWorkers: number;
}

function runSignals(store: PlatformStore, runId: string, node: LocalExecutionNodeReport): DesktopSignals {
  const evidence = Object.values(store.state.evidence).filter((item) => item.runId === runId);
  return {
    activeBrowserSessions: node.counts.activeBrowserSessions,
    activeProxySessions: node.counts.activeProxySessions,
    activeOastSessions: node.counts.activeOastSessions,
    evidenceItems: evidence.filter((item) => item.kind !== 'replay_bundle').length,
    safeEvidenceItems: evidence.filter((item) => item.redactionState === 'safe_for_cloud' || item.redactionState === 'redacted').length,
    reportBundles: evidence.filter((item) => item.kind === 'replay_bundle').length,
    credentialReferences: Object.values(store.state.credentialReferences).filter((item) => item.runId === runId && item.status === 'active').length,
    runnableScannerTemplates: node.counts.runnableScannerTemplates,
    healthyWorkers: node.counts.healthyWorkers,
  };
}

function webConsoleComponent(): DesktopRunnerComponent {
  return component({
    id: 'desktop.web_console',
    name: 'Web Operator Console',
    status: 'ready',
    ownerSurface: 'TypeScript API / embedded Web Console',
    currentState: 'Local browser-accessible console is served from /app with multilingual operator views.',
    implementedSignals: ['run control', 'progress metrics', 'evidence review', 'tool planning', 'framework benchmark'],
    missingPieces: [],
    nextBuildActions: ['Keep the Web Console as the shared UI contract for the future Tauri shell.'],
    securityGates: ['Token-gated local API', 'no raw evidence content in graph snapshots', 'operator-visible approvals'],
  });
}

function tauriShellComponent(): DesktopRunnerComponent {
  const hasTauri = existsSync('src-tauri') || existsSync('tauri.conf.json');
  return component({
    id: 'desktop.tauri_shell',
    name: 'Tauri Desktop Shell',
    status: hasTauri ? 'partial' : 'planned',
    ownerSurface: 'Desktop App Packaging',
    currentState: hasTauri ? 'Tauri files are present but not yet a hardened runner shell.' : 'No Tauri shell scaffold is present in the repo.',
    implementedSignals: hasTauri ? ['desktop scaffold detected'] : ['Web Console is ready to embed'],
    missingPieces: ['tray/session lifecycle', 'secure local token bootstrap', 'deep-link handoff', 'auto-update policy', 'offline packaging'],
    nextBuildActions: ['Create a Tauri shell that embeds /app and manages runner lifecycle without changing API contracts.'],
    securityGates: ['Never expose raw secrets to frontend storage', 'bind control API to localhost', 'explicit operator consent for active testing sessions'],
  });
}

function rustDaemonComponent(): DesktopRunnerComponent {
  const hasRustDaemon = existsSync('src-tauri/src') || existsSync('crates/local-daemon');
  return component({
    id: 'desktop.rust_daemon',
    name: 'Rust Local Daemon',
    status: hasRustDaemon ? 'partial' : 'planned',
    ownerSurface: 'Local Execution Node',
    currentState: hasRustDaemon ? 'Rust daemon source is present but not wired as the execution authority.' : 'Node.js local API currently owns the local kernel; Rust daemon is planned.',
    implementedSignals: ['Local Execution Node read model', 'Toolbox Runner policy', 'Worker runtime health checks'],
    missingPieces: ['daemon supervisor', 'sandbox directory lifecycle', 'tool process isolation boundary', 'structured daemon logs', 'per-run runtime leases'],
    nextBuildActions: ['Move local process supervision behind a Rust daemon while preserving Tool Gateway policy decisions in the control plane.'],
    securityGates: ['no shell string execution', 'timeout kill', 'per-run working directory', 'redacted stdout/stderr evidence'],
  });
}

function browserControllerComponent(activeSessions: number): DesktopRunnerComponent {
  return component({
    id: 'desktop.browser_controller',
    name: 'Browser Controller',
    status: activeSessions > 0 ? 'partial' : 'planned',
    ownerSurface: 'Browser Session Service / Desktop Shell',
    currentState: `${activeSessions} active browser session(s); current implementation captures scope-gated navigation evidence through the local API.`,
    implementedSignals: ['browser.navigate high-level tool', 'browser snapshot import', 'HTTP exchange evidence'],
    missingPieces: ['desktop browser process control', 'DOM action capture', 'authenticated profile selection', 'screenshot/video capture pipeline'],
    nextBuildActions: ['Add a desktop-controlled browser driver that writes snapshots and traffic back through Evidence Engine.'],
    securityGates: ['scope-gated navigation', 'credential references only', 'no hidden cross-origin automation outside run policy'],
  });
}

function mitmProxyComponent(activeSessions: number): DesktopRunnerComponent {
  return component({
    id: 'desktop.mitm_proxy',
    name: 'MITM Proxy and Local CA',
    status: activeSessions > 0 ? 'partial' : 'planned',
    ownerSurface: 'Proxy Session Service / Rust Daemon',
    currentState: `${activeSessions} active proxy capture session(s); absolute-form HTTP capture exists, TLS MITM is still planned.`,
    implementedSignals: ['proxy session records', 'HTTP capture import', 'scope-gated proxy storage'],
    missingPieces: ['local CA generation', 'certificate trust workflow', 'TLS interception', 'WebSocket capture', 'redaction-at-ingest'],
    nextBuildActions: ['Build a scoped MITM proxy with explicit CA install/removal workflow and per-run capture boundaries.'],
    securityGates: ['operator approval before CA install', 'scope match before storing traffic', 'raw traffic local-only by default'],
  });
}

function vaultComponent(activeReferences: number): DesktopRunnerComponent {
  return component({
    id: 'desktop.vault',
    name: 'Credential Vault Bridge',
    status: activeReferences > 0 ? 'partial' : 'planned',
    ownerSurface: 'Credential Reference Service / Desktop Secret Bridge',
    currentState: `${activeReferences} active credential reference(s); raw secrets are rejected by API validation.`,
    implementedSignals: ['vault_reference placeholders', 'credential.use_placeholder audit evidence', 'role metadata in Worker envelope'],
    missingPieces: ['OS keychain bridge', '1Password/Secrets Manager adapters', 'request-time injection', 'per-run credential lease UI'],
    nextBuildActions: ['Add a desktop-only vault bridge that resolves secrets at request time without persisting them in graph state.'],
    securityGates: ['no raw secret in store', 'placeholder-only Worker context', 'audit every credential use'],
  });
}

function toolboxRuntimeComponent(nodeStatus: LocalExecutionNodeStatus, runnableTemplates: number, healthyWorkers: number): DesktopRunnerComponent {
  const status = runnableTemplates > 0 && healthyWorkers > 0 ? 'partial' : nodeStatus === 'blocked' ? 'blocked' : 'planned';
  return component({
    id: 'desktop.toolbox_runtime',
    name: 'Toolbox Runtime Manager',
    status,
    ownerSurface: 'Tool Gateway / Toolbox Runner / Rust Daemon',
    currentState: `${runnableTemplates} runnable scanner template(s), ${healthyWorkers} healthy Worker runtime(s).`,
    implementedSignals: ['scanner.run_template policy', 'toolbox profiles', 'toolbox doctor', 'external execution fail-closed'],
    missingPieces: ['container lifecycle manager', 'tool image registry', 'offline tool cache', 'per-template resource limits', 'runtime install assistant'],
    nextBuildActions: ['Turn Toolbox Doctor and Tool Integration Backlog into an operator-guided runtime setup flow.'],
    securityGates: ['template allowlist', 'profile probes', 'approval tiers', 'per-invocation directories', 'evidence redaction'],
  });
}

function evidenceViewerComponent(evidenceItems: number): DesktopRunnerComponent {
  return component({
    id: 'desktop.evidence_viewer',
    name: 'Evidence Viewer and Replay',
    status: 'ready',
    ownerSurface: 'Evidence Engine / Operator Console',
    currentState: `${evidenceItems} non-report evidence item(s) are available for this run.`,
    implementedSignals: ['local evidence blob preview', 'SHA-256 hash', 'evidence review', 'replay bundle exports'],
    missingPieces: evidenceItems > 0 ? [] : ['no run evidence captured yet'],
    nextBuildActions: ['Add richer desktop media capture and replay packaging while preserving local-only raw evidence semantics.'],
    securityGates: ['raw_local_only stays local', 'safe_for_cloud requires redaction state', 'Finding confirmation requires useful-reviewed evidence'],
  });
}

function cloudSyncComponent(reportBundles: number, safeEvidence: number): DesktopRunnerComponent {
  return component({
    id: 'desktop.cloud_sync',
    name: 'Redacted Cloud Sync',
    status: safeEvidence > 0 || reportBundles > 0 ? 'partial' : 'planned',
    ownerSurface: 'Cloud Control Plane Handoff',
    currentState: `${safeEvidence} redacted/safe evidence item(s), ${reportBundles} report bundle(s). Cloud control plane is not implemented in this local repo.`,
    implementedSignals: ['redaction state', 'confirmed-only report option', 'run export bundle'],
    missingPieces: ['tenant sync API', 'object storage writer', 'redacted indexer', 'SSO/RBAC bridge', 'billing ledger'],
    nextBuildActions: ['Define cloud sync around redacted graph snapshots and report bundles, not raw local traffic.'],
    securityGates: ['no raw credentials', 'no raw_local_only evidence upload', 'tenant audit log', 'export scope selection'],
  });
}

function remoteWorkerComponent(configuredWorkers: number, healthyWorkers: number): DesktopRunnerComponent {
  return component({
    id: 'desktop.remote_workers',
    name: 'Remote Worker Nodes',
    status: configuredWorkers > 1 && healthyWorkers > 1 ? 'partial' : 'planned',
    ownerSurface: 'Enterprise Edition / Worker Runtime Service',
    currentState: `${configuredWorkers} configured Worker(s), ${healthyWorkers} healthy Worker runtime(s); current execution is local-first.`,
    implementedSignals: ['Worker pool contract', 'Worker Selection Policy', 'Worker Leaderboard', 'agent-worker.v1 envelope'],
    missingPieces: ['remote node enrollment', 'mTLS control channel', 'node-scoped policy', 'job lease persistence', 'private model routing'],
    nextBuildActions: ['Add remote worker nodes only after local Worker contracts and evidence gates remain stable.'],
    securityGates: ['node identity', 'least-privilege run lease', 'no raw evidence in Worker prompt', 'Dispatcher-only graph writes'],
  });
}

function handoffContracts(components: DesktopRunnerComponent[]): DesktopRunnerHandoffContract[] {
  const statusById = new Map(components.map((item) => [item.id, item.status]));
  return [
    {
      id: 'contract.shell_api',
      name: 'Tauri shell -> Local API',
      status: statusById.get('desktop.tauri_shell') ?? 'planned',
      producer: 'Tauri Desktop Shell',
      consumer: 'Local REST API',
      contract: ['localhost URL discovery', 'ephemeral local token', 'runner health state', 'open current run deep link'],
      mustNotDo: ['store raw credentials in browser localStorage', 'open remote control ports by default'],
    },
    {
      id: 'contract.daemon_tools',
      name: 'Rust daemon -> Tool Gateway',
      status: statusById.get('desktop.rust_daemon') ?? 'planned',
      producer: 'Rust Local Daemon',
      consumer: 'Tool Gateway / Toolbox Runner',
      contract: ['spawn request id', 'profile id', 'timeout', 'working directory', 'stdout/stderr evidence refs'],
      mustNotDo: ['execute unreviewed shell strings', 'run outside scope policy', 'return unredacted stdout to cloud surfaces'],
    },
    {
      id: 'contract.proxy_evidence',
      name: 'MITM proxy -> Evidence Engine',
      status: statusById.get('desktop.mitm_proxy') ?? 'planned',
      producer: 'Scoped Proxy',
      consumer: 'Evidence Engine',
      contract: ['request/response metadata', 'redaction state', 'scope decision', 'body truncation policy', 'replay bundle pointer'],
      mustNotDo: ['capture denied assets', 'install a CA without operator consent', 'sync raw traffic by default'],
    },
    {
      id: 'contract.vault_requests',
      name: 'Vault bridge -> HTTP/browser tools',
      status: statusById.get('desktop.vault') ?? 'planned',
      producer: 'Desktop Vault Bridge',
      consumer: 'Tool Gateway high-level tools',
      contract: ['credential id', 'role', 'allowed use', 'lease ttl', 'redacted audit evidence'],
      mustNotDo: ['place secret material into Worker envelopes', 'persist resolved secrets in graph state'],
    },
    {
      id: 'contract.cloud_summary',
      name: 'Local runner -> Cloud control plane',
      status: statusById.get('desktop.cloud_sync') ?? 'planned',
      producer: 'Local Runner',
      consumer: 'Cloud Control Plane',
      contract: ['redacted graph snapshot', 'safe evidence index', 'report bundle metadata', 'audit digest'],
      mustNotDo: ['upload raw_local_only evidence', 'upload raw credentials', 'let cloud initiate active tests by default'],
    },
  ];
}

function nextActions(components: DesktopRunnerComponent[], counts: DesktopRunnerReadinessReport['counts']): string[] {
  const planned = components.filter((item) => item.status === 'planned' || item.status === 'blocked');
  const partial = components.filter((item) => item.status === 'partial');
  const actions = [
    ...(planned[0] ? [`Start desktop productization with ${planned[0].name}: ${planned[0].nextBuildActions[0]}`] : []),
    ...(partial[0] ? [`Harden partial surface ${partial[0].name}: ${partial[0].missingPieces.slice(0, 2).join(' | ')}`] : []),
    ...(counts.runnableScannerTemplates === 0 ? ['Make at least one external scanner template runnable through Toolbox policy before claiming tool parity.'] : []),
    'Keep /app as the canonical operator UI while Tauri becomes a shell and lifecycle manager around it.',
    'Do not implement MITM, vault, or remote workers as bypasses; wire them back into Tool Gateway and Evidence Engine contracts.',
  ];
  return [...new Set(actions)].slice(0, 6);
}

function component(input: DesktopRunnerComponent): DesktopRunnerComponent {
  return input;
}

function countStatus(items: DesktopRunnerComponent[], status: DesktopRunnerComponentStatus): number {
  return items.filter((item) => item.status === status).length;
}

function overallStatus(
  counts: DesktopRunnerReadinessReport['counts'],
  components: DesktopRunnerComponent[],
): DesktopRunnerComponentStatus {
  if (components.some((item) => item.status === 'blocked')) return 'blocked';
  if (counts.planned > 0) return 'partial';
  if (counts.partial > 0) return 'partial';
  return 'ready';
}
