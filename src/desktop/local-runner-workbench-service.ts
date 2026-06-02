import { nowIso } from '../domain/ids.js';
import type { BrowserSession, Evidence, OastSession, ProxySession, RedactionState } from '../domain/types.js';
import type { BrowserSessionService } from '../captures/browser-session-service.js';
import type { OastService } from '../oast/oast-service.js';
import type { ProxySessionService } from '../captures/proxy-session-service.js';
import type { PlatformStore } from '../storage/store.js';

export type LocalRunnerWorkbenchStatus = 'ready' | 'partial' | 'blocked';
export type LocalRunnerWorkbenchGateStatus = 'pass' | 'warn' | 'fail';
export type LocalRunnerCaptureProfileStatus = 'ready' | 'prepare_required' | 'approval_required' | 'planned' | 'blocked';

export interface LocalRunnerWorkbenchSurface {
  id: string;
  title: string;
  status: LocalRunnerWorkbenchStatus;
  detail: string;
  signals: string[];
  operatorControls: string[];
  limitations: string[];
  nextActions: string[];
}

export interface LocalRunnerCaptureGate {
  id: string;
  title: string;
  status: LocalRunnerWorkbenchGateStatus;
  detail: string;
}

export interface LocalRunnerProxySetup {
  status: 'active' | 'not_started';
  proxyUrl: string;
  requiredHeaders: Record<string, string>;
  curlExample: string;
  browserSetupNotes: string[];
  pac: {
    status: 'planned';
    detail: string;
  };
  limitations: string[];
}

export interface LocalRunnerEvidencePreview {
  id: string;
  kind: string;
  redactionState: RedactionState;
  reviewStatus: string;
  source: string;
  target?: string;
  sha256: string;
  createdAt: string;
}

export interface LocalRunnerCaptureProfile {
  id: string;
  title: string;
  status: LocalRunnerCaptureProfileStatus;
  summary: string;
  riskLevel: string;
  readinessSignals: string[];
  entrypoints: string[];
  setupSteps: string[];
  safetyGates: string[];
  blockedReasons: string[];
  nextActions: string[];
}

export interface LocalRunnerWorkbenchReport {
  runId: string;
  generatedAt: string;
  mode: 'local_runner_workbench';
  status: LocalRunnerWorkbenchStatus;
  summary: string;
  counts: {
    activeBrowserSessions: number;
    activeProxySessions: number;
    activeOastSessions: number;
    browserSnapshots: number;
    captureImports: number;
    httpExchangeEvidence: number;
    screenshotEvidence: number;
    totalEvidence: number;
    replayableHttpEvidence: number;
    reviewedEvidence: number;
    usefulEvidence: number;
    rawLocalOnlyEvidence: number;
    cloudSafeEvidence: number;
    activeCredentialReferences: number;
  };
  proxySetup: LocalRunnerProxySetup;
  captureProfiles: LocalRunnerCaptureProfile[];
  surfaces: LocalRunnerWorkbenchSurface[];
  captureGates: LocalRunnerCaptureGate[];
  recentEvidence: LocalRunnerEvidencePreview[];
  operatorNextActions: string[];
  referenceAlignment: string[];
  safetyNotes: string[];
}

export interface LocalRunnerWorkbenchPrepareResult {
  status: 'prepared';
  runId: string;
  created: {
    browserSessionId?: string;
    proxySessionId?: string;
    oastSessionId?: string;
  };
  skipped: string[];
  workbench: LocalRunnerWorkbenchReport;
}

export class LocalRunnerWorkbenchService {
  constructor(
    private readonly store: PlatformStore,
    private readonly browserSessions: BrowserSessionService,
    private readonly proxySessions: ProxySessionService,
    private readonly oast: OastService,
  ) {}

  get(runId: string, baseUrl: string): LocalRunnerWorkbenchReport {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const browserSessions = Object.values(this.store.state.browserSessions).filter((item) => item.runId === runId);
    const proxySessions = Object.values(this.store.state.proxySessions).filter((item) => item.runId === runId);
    const oastSessions = Object.values(this.store.state.oastSessions).filter((item) => item.runId === runId);
    const evidence = Object.values(this.store.state.evidence).filter((item) => item.runId === runId);
    const reviews = Object.values(this.store.state.evidenceReviews).filter((item) => item.runId === runId);
    const browserSnapshots = Object.values(this.store.state.browserSnapshots).filter((item) => item.runId === runId);
    const captureImports = Object.values(this.store.state.captureImports).filter((item) => item.runId === runId);
    const activeCredentials = Object.values(this.store.state.credentialReferences).filter(
      (item) => item.runId === runId && item.status === 'active',
    );

    const activeBrowserSessions = browserSessions.filter((item) => item.status === 'active').length;
    const activeProxySessions = proxySessions.filter((item) => item.status === 'active').length;
    const activeOastSessions = oastSessions.filter((item) => item.status === 'active').length;
    const reviewedEvidenceIds = new Set(reviews.map((item) => item.evidenceId));
    const usefulEvidence = reviews.filter((item) => item.status === 'useful').length;
    const counts = {
      activeBrowserSessions,
      activeProxySessions,
      activeOastSessions,
      browserSnapshots: browserSnapshots.length,
      captureImports: captureImports.length,
      httpExchangeEvidence: evidence.filter((item) => item.kind === 'http_exchange').length,
      screenshotEvidence: evidence.filter((item) => item.kind === 'screenshot').length,
      totalEvidence: evidence.length,
      replayableHttpEvidence: replayableHttpEvidenceCount(this.store, evidence),
      reviewedEvidence: reviewedEvidenceIds.size,
      usefulEvidence,
      rawLocalOnlyEvidence: evidence.filter((item) => item.redactionState === 'raw_local_only').length,
      cloudSafeEvidence: evidence.filter((item) => item.redactionState === 'redacted' || item.redactionState === 'safe_for_cloud').length,
      activeCredentialReferences: activeCredentials.length,
    };
    const proxySetup = proxySetupCard(runId, run.target, baseUrl, proxySessions);
    const surfaces = surfaceCards(browserSessions, proxySessions, oastSessions, counts);
    const captureGates = gates(counts, Boolean(run.target), proxySetup.status === 'active');
    const status = workbenchStatus(captureGates, counts);
    return {
      runId,
      generatedAt: nowIso(),
      mode: 'local_runner_workbench',
      status,
      summary:
        `${counts.activeBrowserSessions} active browser session(s), ${counts.activeProxySessions} active proxy session(s), ` +
        `${counts.totalEvidence} evidence item(s), ${counts.reviewedEvidence}/${counts.totalEvidence} reviewed.`,
      counts,
      proxySetup,
      captureProfiles: captureProfiles(runId, run.target, counts, proxySetup),
      surfaces,
      captureGates,
      recentEvidence: recentEvidence(this.store, evidence, reviews),
      operatorNextActions: operatorNextActions(counts, proxySetup.status),
      referenceAlignment: [
        'AIDA/CyberStrike: make local evidence, review, and report handoff visible to the operator.',
        'WonderSuite: keep browser/proxy workflow ergonomic, but route capture through scope and evidence gates.',
        'Cairn: preserve the graph/search model; this workbench is a view, not another Agent role.',
        'HexStrike/AutoRedTeam: do not expose raw tool sprawl to Workers; show governed capture capability instead.',
      ],
      safetyNotes: [
        'Local Runner Workbench is read-only and does not start sessions, execute tools, approve actions, install certificates, or sync evidence.',
        'HTTP proxy capture requires an active proxy session, X-Capture-Run-Id, and either X-Platform-Token or Proxy-Authorization when auth is enabled.',
        'Every captured target is checked against the run ScopePolicy before forwarding or storage.',
        'CONNECT/TLS MITM, PAC generation, local CA install, and full DOM browser automation remain planned desktop capabilities.',
        'Raw local-only evidence remains on this runner unless a future redaction workflow explicitly promotes it.',
      ],
    };
  }

  prepare(input: {
    runId: string;
    baseUrl: string;
    includeBrowser?: boolean;
    includeProxy?: boolean;
    includeOast?: boolean;
  }): LocalRunnerWorkbenchPrepareResult {
    const run = this.store.state.runs[input.runId];
    if (!run) {
      throw new Error(`Run not found: ${input.runId}`);
    }
    const created: LocalRunnerWorkbenchPrepareResult['created'] = {};
    const skipped: string[] = [];
    const includeBrowser = input.includeBrowser ?? true;
    const includeProxy = input.includeProxy ?? true;
    const includeOast = input.includeOast ?? false;

    if (includeBrowser) {
      const activeBrowser = this.browserSessions.list(input.runId).find((item) => item.status === 'active');
      if (activeBrowser) {
        skipped.push(`Browser session already active: ${activeBrowser.id}`);
      } else {
        const startUrl = httpUrlOrUndefined(run.target);
        try {
          const session = this.browserSessions.start({ runId: input.runId, startUrl });
          created.browserSessionId = session.id;
        } catch {
          const session = this.browserSessions.start({ runId: input.runId });
          created.browserSessionId = session.id;
          skipped.push('Run target could not be used as browser start URL; session was created without navigation state.');
        }
      }
    } else {
      skipped.push('Browser session creation skipped by request.');
    }

    if (includeProxy) {
      const activeProxy = this.proxySessions.list(input.runId).find((item) => item.status === 'active');
      if (activeProxy) {
        skipped.push(`Proxy session already active: ${activeProxy.id}`);
      } else {
        const session = this.proxySessions.start({ runId: input.runId, proxyUrl: input.baseUrl });
        created.proxySessionId = session.id;
      }
    } else {
      skipped.push('Proxy session creation skipped by request.');
    }

    if (includeOast) {
      const activeOast = this.oast.list(input.runId).find((item) => item.status === 'active');
      if (activeOast) {
        skipped.push(`OAST session already active: ${activeOast.id}`);
      } else {
        const session = this.oast.start({ runId: input.runId, baseUrl: input.baseUrl });
        created.oastSessionId = session.id;
      }
    } else {
      skipped.push('OAST session not started by Prepare Runner; use it only for approved out-of-band validation.');
    }

    return {
      status: 'prepared',
      runId: input.runId,
      created,
      skipped,
      workbench: this.get(input.runId, input.baseUrl),
    };
  }
}

function httpUrlOrUndefined(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function proxySetupCard(
  runId: string,
  target: string,
  baseUrl: string,
  proxySessions: ProxySession[],
): LocalRunnerProxySetup {
  const active = proxySessions.find((item) => item.status === 'active');
  const proxyUrl = active?.proxyUrl ?? baseUrl;
  const requiredHeaders = active?.requiredHeaders ?? {
    'X-Capture-Run-Id': runId,
    'X-Platform-Token': '<local token>',
  };
  const curlTarget = target || 'http://in-scope.example/';
  return {
    status: active ? 'active' : 'not_started',
    proxyUrl,
    requiredHeaders,
    curlExample:
      `curl -x ${proxyUrl} ` +
      `-H "X-Capture-Run-Id: ${runId}" ` +
      `-H "X-Platform-Token: <local token>" ` +
      `"${curlTarget}"`,
    browserSetupNotes: [
      'Start a proxy session for the run before routing traffic through the local proxy.',
      'Configure the browser or upstream tool to use the proxy URL as an HTTP proxy.',
      'Send X-Capture-Run-Id and local auth through headers or Proxy-Authorization where the client supports it.',
      'Use HAR import for browsers that cannot attach custom proxy headers yet.',
    ],
    pac: {
      status: 'planned',
      detail: 'PAC generation and automatic browser proxy profile switching are planned for the desktop shell.',
    },
    limitations: active?.limitations ?? ['HTTP absolute-form only', 'CONNECT/TLS interception is not implemented'],
  };
}

function captureProfiles(
  runId: string,
  target: string,
  counts: LocalRunnerWorkbenchReport['counts'],
  proxySetup: LocalRunnerProxySetup,
): LocalRunnerCaptureProfile[] {
  const httpTarget = Boolean(httpUrlOrUndefined(target));
  return [
    {
      id: 'capture.header_proxy_http',
      title: 'Header-capable HTTP proxy capture',
      status: proxySetup.status === 'active' ? 'ready' : 'prepare_required',
      summary:
        proxySetup.status === 'active'
          ? 'Header-capable clients can route in-scope HTTP requests through the local proxy and create http_exchange evidence.'
          : 'Prepare the Runner before routing header-capable clients through the local proxy.',
      riskLevel: 'R1',
      readinessSignals: [
        `proxy=${proxySetup.status}`,
        `httpEvidence=${counts.httpExchangeEvidence}`,
        `proxyUrl=${proxySetup.proxyUrl}`,
      ],
      entrypoints: [
        'POST /runs/{id}/local-runner-workbench/prepare',
        'HTTP proxy absolute-form request with X-Capture-Run-Id',
        proxySetup.curlExample,
      ],
      setupSteps: [
        'Prepare the Runner or start a proxy session.',
        'Configure a header-capable client to use the local proxy URL.',
        'Send X-Capture-Run-Id and X-Platform-Token or Proxy-Authorization.',
        'Review created http_exchange evidence before attaching it to a finding.',
      ],
      safetyGates: ['active proxy session', 'ScopePolicy target check before forwarding', 'redaction at evidence ingest'],
      blockedReasons: proxySetup.status === 'active' ? [] : ['No active proxy session.'],
      nextActions:
        proxySetup.status === 'active'
          ? ['Send one bounded in-scope request through the proxy and review the produced evidence.']
          : ['Click Prepare Runner to create a run-local proxy session.'],
    },
    {
      id: 'capture.browser_snapshot',
      title: 'Browser snapshot capture',
      status: counts.activeBrowserSessions > 0 ? 'ready' : 'prepare_required',
      summary:
        counts.activeBrowserSessions > 0
          ? 'Rendered page state can be attached as screenshot and redacted text evidence.'
          : 'Prepare the Runner before capturing browser page-state evidence.',
      riskLevel: 'R1',
      readinessSignals: [
        `browser=${counts.activeBrowserSessions}`,
        `snapshots=${counts.browserSnapshots}`,
        `screenshotEvidence=${counts.screenshotEvidence}`,
      ],
      entrypoints: ['POST /runs/{id}/captures/browser-snapshot', 'Operator Console Browser Snapshot form'],
      setupSteps: [
        'Prepare the Runner or start a browser session.',
        'Capture screenshot bytes and bounded visible text/DOM preview.',
        'Keep screenshots raw_local_only until a redaction workflow promotes them.',
      ],
      safetyGates: ['ScopePolicy target check before storage', 'screenshot size cap', 'raw_local_only screenshot boundary'],
      blockedReasons: counts.activeBrowserSessions > 0 ? [] : ['No active browser session.'],
      nextActions:
        counts.activeBrowserSessions > 0
          ? ['Capture a snapshot after a meaningful page state is reached.']
          : ['Click Prepare Runner to create a run-local browser session.'],
    },
    {
      id: 'capture.har_bridge',
      title: 'Browser HAR import bridge',
      status: 'ready',
      summary: 'Use browser DevTools, Burp, Playwright, or desktop proxy HAR exports when the client cannot attach proxy headers.',
      riskLevel: 'R1',
      readinessSignals: [`harImports=${counts.captureImports}`, `httpEvidence=${counts.httpExchangeEvidence}`],
      entrypoints: ['POST /runs/{id}/captures/har', 'Operator Console HAR Import form'],
      setupSteps: [
        'Export HAR from an authorized browser or proxy session.',
        'Import a bounded HAR into the run.',
        'Review imported and skipped entries before proposing findings.',
      ],
      safetyGates: ['per-entry ScopePolicy check', 'entry count clamp', 'redacted http_exchange evidence only'],
      blockedReasons: [],
      nextActions: ['Import HAR when browser proxy headers are not available.'],
    },
    {
      id: 'capture.browser_fetch_navigation',
      title: 'Browser fetch navigation',
      status: counts.activeBrowserSessions > 0 && httpTarget ? 'ready' : httpTarget ? 'prepare_required' : 'blocked',
      summary:
        counts.activeBrowserSessions > 0 && httpTarget
          ? 'The local fetch controller can navigate to in-scope HTTP targets and store the exchange as evidence.'
          : httpTarget
            ? 'Prepare the Runner before using browser.navigate capture.'
            : 'The current target is not an HTTP(S) URL for browser navigation.',
      riskLevel: 'R1',
      readinessSignals: [`browser=${counts.activeBrowserSessions}`, `targetHttp=${httpTarget}`],
      entrypoints: ['POST /browser-sessions/{id}/navigate', 'browser.navigate high-level tool'],
      setupSteps: [
        'Prepare the Runner or start a browser session.',
        'Navigate only to in-scope HTTP(S) URLs.',
        'Use snapshots for rendered state; navigate captures HTTP exchange only.',
      ],
      safetyGates: ['ScopePolicy target check before fetch', 'timeout cap', 'redacted response preview'],
      blockedReasons: [
        ...(httpTarget ? [] : ['Run target is not HTTP(S).']),
        ...(counts.activeBrowserSessions > 0 ? [] : ['No active browser session.']),
      ],
      nextActions:
        counts.activeBrowserSessions > 0 && httpTarget
          ? ['Use browser.navigate for a bounded in-scope request.']
          : ['Prepare the Runner and use an HTTP(S) in-scope target.'],
    },
    {
      id: 'capture.evidence_replay',
      title: 'Safe evidence replay',
      status: counts.replayableHttpEvidence > 0 ? 'ready' : 'prepare_required',
      summary:
        counts.replayableHttpEvidence > 0
          ? 'GET/HEAD http_exchange evidence can be replayed to check reproducibility.'
          : 'No replayable GET/HEAD http_exchange evidence exists yet.',
      riskLevel: 'R1',
      readinessSignals: [`replayable=${counts.replayableHttpEvidence}`, `httpEvidence=${counts.httpExchangeEvidence}`],
      entrypoints: ['GET /runs/{id}/replay-plans', 'POST /evidence/{id}/replay'],
      setupSteps: [
        'Capture GET/HEAD http_exchange evidence.',
        'Review replay plans before replaying.',
        'Attach replay output only when it supports reproduction.',
      ],
      safetyGates: ['GET/HEAD only', 'ScopePolicy target check', 'stripped sensitive headers', 'redacted replay evidence'],
      blockedReasons: counts.replayableHttpEvidence > 0 ? [] : ['No replayable GET/HEAD http_exchange evidence.'],
      nextActions:
        counts.replayableHttpEvidence > 0
          ? ['Replay one reviewed evidence item when validating reproducibility.']
          : ['Capture a safe GET/HEAD HTTP exchange first.'],
    },
    {
      id: 'capture.oast_r3_callback',
      title: 'OAST callback validation',
      status: counts.activeOastSessions > 0 ? 'approval_required' : 'prepare_required',
      summary:
        counts.activeOastSessions > 0
          ? 'OAST inbox exists, but callback use remains an R3 validation path requiring operator approval.'
          : 'Start OAST only when an approved validation scenario needs callback evidence.',
      riskLevel: 'R3',
      readinessSignals: [`oast=${counts.activeOastSessions}`],
      entrypoints: ['POST /runs/{id}/oast-sessions', 'GET|POST /oast/{token}'],
      setupSteps: [
        'Confirm the validation is in scope and approved.',
        'Start an OAST session only for that validation.',
        'Attach received callbacks as evidence.',
      ],
      safetyGates: ['R3 operator approval before use', 'run-scoped token', 'redacted callback evidence'],
      blockedReasons: counts.activeOastSessions > 0 ? ['Callback use still requires R3 approval.'] : ['No active OAST session.'],
      nextActions: ['Keep OAST disabled until a scoped R3 validation requires it.'],
    },
    {
      id: 'capture.desktop_tls_mitm',
      title: 'Desktop TLS MITM capture',
      status: 'planned',
      summary: 'Full TLS MITM, local CA lifecycle, PAC generation, and WebSocket capture belong to the hardened desktop Runner.',
      riskLevel: 'R2/R3',
      readinessSignals: ['tauriShell=planned', 'localCa=planned', 'connectTls=blocked'],
      entrypoints: ['Future Tauri/Rust desktop Runner', 'Future scoped MITM proxy'],
      setupSteps: [
        'Implement local CA generation and removal workflow.',
        'Require explicit operator consent before trust-store changes.',
        'Route captured traffic through Evidence Engine and redaction at ingest.',
      ],
      safetyGates: ['operator CA approval', 'scope match before storage', 'raw traffic local-only by default'],
      blockedReasons: ['CONNECT/TLS interception is intentionally blocked in the local kernel.'],
      nextActions: ['Keep using HAR import and header-capable proxy capture until the desktop MITM layer is implemented.'],
    },
  ];
}

function surfaceCards(
  browserSessions: BrowserSession[],
  proxySessions: ProxySession[],
  oastSessions: OastSession[],
  counts: LocalRunnerWorkbenchReport['counts'],
): LocalRunnerWorkbenchSurface[] {
  const activeBrowser = browserSessions.filter((item) => item.status === 'active').length;
  const activeProxy = proxySessions.filter((item) => item.status === 'active').length;
  const activeOast = oastSessions.filter((item) => item.status === 'active').length;
  return [
    {
      id: 'workbench.browser',
      title: 'Browser controller',
      status: activeBrowser > 0 ? 'ready' : 'partial',
      detail:
        activeBrowser > 0
          ? `${activeBrowser} browser controller session(s) can capture scope-gated navigation evidence.`
          : 'No active browser session; browser snapshot and navigate actions are still available after session start.',
      signals: [`active=${activeBrowser}`, `snapshots=${counts.browserSnapshots}`, `screenshotEvidence=${counts.screenshotEvidence}`],
      operatorControls: ['Start browser session', 'Navigate in scope', 'Capture browser snapshot', 'Attach evidence to finding'],
      limitations: unique(browserSessions.flatMap((item) => item.limitations)).concat(
        activeBrowser > 0 ? [] : ['No active browser controller session'],
      ),
      nextActions:
        activeBrowser > 0
          ? ['Capture a browser snapshot after meaningful state is reached.']
          : ['Start a browser session for visible exploration evidence.'],
    },
    {
      id: 'workbench.proxy',
      title: 'HTTP proxy capture',
      status: activeProxy > 0 ? 'ready' : 'partial',
      detail:
        activeProxy > 0
          ? `${activeProxy} proxy capture session(s) can turn in-scope HTTP traffic into evidence.`
          : 'No active proxy session; start one before routing local tools or browsers through the API proxy.',
      signals: [`active=${activeProxy}`, `httpEvidence=${counts.httpExchangeEvidence}`, `harImports=${counts.captureImports}`],
      operatorControls: ['Start proxy session', 'Route HTTP absolute-form traffic', 'Import HAR when headers are unavailable'],
      limitations: unique(proxySessions.flatMap((item) => item.limitations)).concat(activeProxy > 0 ? [] : ['No active proxy capture session']),
      nextActions:
        activeProxy > 0
          ? ['Use the proxy setup card to route a bounded in-scope request.']
          : ['Start a proxy session before expecting live traffic capture.'],
    },
    {
      id: 'workbench.evidence_review',
      title: 'Evidence review loop',
      status: counts.totalEvidence > 0 && counts.reviewedEvidence > 0 ? 'ready' : counts.totalEvidence > 0 ? 'partial' : 'partial',
      detail:
        counts.totalEvidence > 0
          ? `${counts.reviewedEvidence}/${counts.totalEvidence} evidence item(s) reviewed; ${counts.usefulEvidence} marked useful.`
          : 'No evidence is available yet; findings cannot be commercially confirmed without evidence.',
      signals: [`total=${counts.totalEvidence}`, `reviewed=${counts.reviewedEvidence}`, `useful=${counts.usefulEvidence}`],
      operatorControls: ['View evidence content', 'Mark useful / needs context', 'Promote to finding', 'Create replay bundle'],
      limitations: counts.totalEvidence > 0 ? [] : ['No captured evidence yet'],
      nextActions:
        counts.totalEvidence > 0 && counts.reviewedEvidence === 0
          ? ['Review at least one evidence item before confirming a finding.']
          : ['Keep finding confirmation tied to reviewed evidence.'],
    },
    {
      id: 'workbench.oast',
      title: 'OAST inbox',
      status: activeOast > 0 ? 'ready' : 'partial',
      detail:
        activeOast > 0
          ? `${activeOast} OAST session(s) are active for approved out-of-band validation.`
          : 'No active OAST session; keep it off until an approved R3 validation needs callback evidence.',
      signals: [`active=${activeOast}`],
      operatorControls: ['Start OAST session for approved validation', 'Review callbacks as evidence'],
      limitations: unique(oastSessions.flatMap((item) => item.limitations)).concat(activeOast > 0 ? [] : ['No active OAST inbox']),
      nextActions:
        activeOast > 0
          ? ['Use callbacks only for approved in-scope validation paths.']
          : ['Start OAST only when an R3 approval and target need it.'],
    },
    {
      id: 'workbench.credentials',
      title: 'Credential references',
      status: counts.activeCredentialReferences > 0 ? 'ready' : 'partial',
      detail:
        counts.activeCredentialReferences > 0
          ? `${counts.activeCredentialReferences} active credential reference(s) are available as placeholders.`
          : 'No active credential references; authenticated testing can still use manually imported redacted evidence.',
      signals: [`active=${counts.activeCredentialReferences}`],
      operatorControls: ['Create placeholder reference', 'Use placeholder through Tool Gateway', 'Audit credential use evidence'],
      limitations: ['Raw credentials must not enter Worker context or graph state'],
      nextActions:
        counts.activeCredentialReferences > 0
          ? ['Use role labels to compare authenticated flows.']
          : ['Create placeholder-only credential references before role-difference testing.'],
    },
  ];
}

function gates(
  counts: LocalRunnerWorkbenchReport['counts'],
  targetAnchored: boolean,
  proxyActive: boolean,
): LocalRunnerCaptureGate[] {
  return [
    {
      id: 'gate.scope_anchor',
      title: 'Scope anchor',
      status: targetAnchored ? 'pass' : 'fail',
      detail: targetAnchored
        ? 'Run target and ScopePolicy exist before local capture starts.'
        : 'A run target is required before local capture can be trusted.',
    },
    {
      id: 'gate.capture_surface',
      title: 'Capture surface',
      status: counts.activeBrowserSessions + counts.activeProxySessions > 0 ? 'pass' : 'warn',
      detail: `${counts.activeBrowserSessions} browser session(s), ${counts.activeProxySessions} proxy session(s) active.`,
    },
    {
      id: 'gate.proxy_config',
      title: 'Proxy setup',
      status: proxyActive ? 'pass' : 'warn',
      detail: proxyActive
        ? 'Proxy session is active; traffic still requires run header and local auth.'
        : 'Proxy setup is available, but a run-scoped proxy session has not been started.',
    },
    {
      id: 'gate.evidence_ingest',
      title: 'Evidence ingest',
      status: counts.totalEvidence > 0 ? 'pass' : 'warn',
      detail: `${counts.httpExchangeEvidence} HTTP exchange(s), ${counts.screenshotEvidence} screenshot(s), ${counts.captureImports} HAR import(s).`,
    },
    {
      id: 'gate.evidence_review',
      title: 'Human evidence review',
      status: counts.totalEvidence === 0 ? 'warn' : counts.reviewedEvidence > 0 ? 'pass' : 'warn',
      detail:
        counts.totalEvidence === 0
          ? 'No evidence exists yet.'
          : `${counts.reviewedEvidence}/${counts.totalEvidence} evidence item(s) reviewed; ${counts.usefulEvidence} useful.`,
    },
    {
      id: 'gate.local_only_boundary',
      title: 'Local-only evidence boundary',
      status: 'pass',
      detail: `${counts.rawLocalOnlyEvidence} raw-local item(s); ${counts.cloudSafeEvidence} redacted or cloud-safe item(s).`,
    },
    {
      id: 'gate.tls_mitm_boundary',
      title: 'TLS MITM boundary',
      status: 'warn',
      detail: 'CONNECT/TLS interception, local CA install, and WebSocket capture are intentionally not enabled in this local kernel yet.',
    },
  ];
}

function recentEvidence(
  store: PlatformStore,
  evidence: Evidence[],
  reviews: Array<{ evidenceId: string; status: string }>,
): LocalRunnerEvidencePreview[] {
  const reviewByEvidence = new Map(reviews.map((item) => [item.evidenceId, item.status]));
  return evidence
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 8)
    .map((item) => {
      const parsed = evidenceSummary(store, item);
      return {
        id: item.id,
        kind: item.kind,
        redactionState: item.redactionState,
        reviewStatus: reviewByEvidence.get(item.id) ?? 'unreviewed',
        source: parsed.source,
        target: parsed.target,
        sha256: item.sha256,
        createdAt: item.createdAt,
      };
    });
}

function replayableHttpEvidenceCount(store: PlatformStore, evidence: Evidence[]): number {
  return evidence.filter((item) => {
    if (item.kind !== 'http_exchange') {
      return false;
    }
    const blob = store.state.evidenceBlobs[item.localUri];
    if (!blob || blob.encoding !== 'utf8') {
      return false;
    }
    try {
      const parsed = JSON.parse(blob.content) as { request?: { method?: unknown; target?: unknown } };
      const method = typeof parsed.request?.method === 'string' ? parsed.request.method.toUpperCase() : 'GET';
      const target = typeof parsed.request?.target === 'string' ? parsed.request.target : '';
      return (method === 'GET' || method === 'HEAD') && Boolean(httpUrlOrUndefined(target));
    } catch {
      return false;
    }
  }).length;
}

function evidenceSummary(store: PlatformStore, evidence: Evidence): { source: string; target?: string } {
  const blob = store.state.evidenceBlobs[evidence.localUri];
  if (!blob || blob.encoding !== 'utf8') {
    return { source: evidence.kind };
  }
  try {
    const parsed = JSON.parse(blob.content) as {
      source?: string;
      request?: { target?: string };
      target?: string;
      url?: string;
    };
    return {
      source: parsed.source ?? evidence.kind,
      target: parsed.request?.target ?? parsed.target ?? parsed.url,
    };
  } catch {
    return { source: evidence.kind };
  }
}

function operatorNextActions(
  counts: LocalRunnerWorkbenchReport['counts'],
  proxyStatus: LocalRunnerProxySetup['status'],
): string[] {
  const actions = [];
  if (counts.activeBrowserSessions === 0) {
    actions.push('Start a browser session when the operator needs visible page-state evidence.');
  }
  if (proxyStatus !== 'active') {
    actions.push('Start a proxy session before routing local browser or tool traffic through capture.');
  }
  if (counts.totalEvidence === 0) {
    actions.push('Capture one in-scope HTTP exchange or browser snapshot before proposing commercial findings.');
  }
  if (counts.totalEvidence > 0 && counts.reviewedEvidence === 0) {
    actions.push('Review captured evidence and mark useful items before confirming findings.');
  }
  if (counts.activeCredentialReferences === 0) {
    actions.push('Add placeholder-only credential references before authenticated role comparison work.');
  }
  if (counts.activeOastSessions === 0) {
    actions.push('Keep OAST off until a scoped R3 validation requires callback evidence.');
  }
  actions.push('Use HAR import as the bridge until desktop PAC, TLS MITM, and real browser profile control are implemented.');
  return unique(actions).slice(0, 7);
}

function workbenchStatus(
  captureGates: LocalRunnerCaptureGate[],
  counts: LocalRunnerWorkbenchReport['counts'],
): LocalRunnerWorkbenchStatus {
  if (captureGates.some((item) => item.status === 'fail')) {
    return 'blocked';
  }
  if (
    counts.totalEvidence > 0 &&
    counts.reviewedEvidence > 0 &&
    counts.activeBrowserSessions + counts.activeProxySessions > 0
  ) {
    return 'ready';
  }
  return 'partial';
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
