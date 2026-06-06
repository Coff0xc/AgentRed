import { newId, nowIso } from '../domain/ids.js';
import type { BrowserSession, BrowserSnapshot, RiskLevel } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import { evaluateScope } from '../scope/policy.js';
import { redactHeaders, redactText, redactUrl } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

const DEFAULT_USER_AGENT = 'AuthorizedAIPentestPlatform/0.1 local-browser-controller';
const TEXT_PREVIEW_LIMIT = 20_000;
const BODY_PREVIEW_LIMIT = 4096;
const NETWORK_EVENT_LIMIT = 50;
const CONSOLE_MESSAGE_LIMIT = 50;

export interface BrowserNavigateInput {
  sessionId?: string;
  runId: string;
  target: string;
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  riskLevel?: RiskLevel;
  captureHar?: boolean;
  captureTrace?: boolean;
  captureVideo?: boolean;
}

export interface BrowserNetworkEvent {
  url: string;
  method?: string;
  status?: number;
  resourceType?: string;
}

export interface BrowserConsoleMessage {
  type: string;
  text: string;
}

export interface BrowserAutomationNavigation {
  finalUrl: string;
  title?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  bodyPreview?: string;
  screenshot?: Buffer;
  screenshotContentType?: string;
  textPreview?: string;
  consoleMessages?: BrowserConsoleMessage[];
  networkEvents?: BrowserNetworkEvent[];
  harArchive?: Buffer;
  traceArchive?: Buffer;
  videoRecording?: Buffer;
}

export interface BrowserAutomationRuntime {
  mode: 'playwright_controller';
  navigate(input: {
    sessionId: string;
    target: string;
    method: string;
    headers: Record<string, string>;
    timeoutMs: number;
    userAgent: string;
    allowRequest: (target: string, method: string) => boolean;
    captureHar?: boolean;
    captureTrace?: boolean;
    captureVideo?: boolean;
  }): Promise<BrowserAutomationNavigation>;
  closeSession(sessionId: string): Promise<void>;
}

export interface BrowserNavigateResult {
  session: BrowserSession;
  evidence: { id: string };
  snapshot?: BrowserSnapshot;
  evidenceIds: string[];
}

export class BrowserSessionService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly events?: RunEventService,
    private readonly browserRuntime?: BrowserAutomationRuntime,
  ) {}

  start(input: { runId: string; startUrl?: string }): BrowserSession {
    this.assertRun(input.runId);
    if (input.startUrl) {
      this.assertInScope(input.runId, input.startUrl, 'GET', 'R1');
    }
    const session: BrowserSession = {
      id: newId('browsersession'),
      runId: input.runId,
      status: 'active',
      mode: this.browserRuntime?.mode ?? 'local_fetch_controller',
      currentUrl: input.startUrl ? redactUrl(input.startUrl) : undefined,
      userAgent: DEFAULT_USER_AGENT,
      limitations: this.browserRuntime
        ? ['Playwright browser controller', 'Out-of-scope renderer requests are blocked', 'Screenshots remain raw_local_only']
        : ['HTTP fetch controller only', 'No JavaScript DOM execution yet', 'No TLS MITM certificate handling yet'],
      snapshotIds: [],
      createdAt: nowIso(),
    };
    this.store.state.browserSessions[session.id] = session;
    this.store.commit();
    this.events?.record({
      runId: input.runId,
      type: 'browser.session.started',
      title: 'Browser session started',
      detail: input.startUrl ? `${session.mode} ${redactUrl(input.startUrl)}` : session.mode,
      entityId: session.id,
    });
    return session;
  }

  list(runId: string): BrowserSession[] {
    this.assertRun(runId);
    return Object.values(this.store.state.browserSessions)
      .filter((session) => session.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async navigate(input: BrowserNavigateInput): Promise<BrowserNavigateResult> {
    const method = (input.method ?? 'GET').toUpperCase();
    const session = input.sessionId ? this.getActiveSession(input.sessionId) : this.getOrCreateSession(input.runId, input.target);
    if (session.runId !== input.runId) {
      throw new Error(`Browser session ${session.id} does not belong to run ${input.runId}`);
    }
    this.assertInScope(input.runId, input.target, method, input.riskLevel ?? 'R1');
    const headers = { 'user-agent': session.userAgent, ...(input.headers ?? {}) };
    const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 10_000, 100), 30_000);

    if (this.browserRuntime && (method === 'GET' || method === 'HEAD')) {
      return this.navigateWithBrowserRuntime({ input, session, method, headers, timeoutMs });
    }
    return this.navigateWithFetch({ input, session, method, headers, timeoutMs });
  }

  async close(sessionId: string): Promise<BrowserSession> {
    const session = this.store.state.browserSessions[sessionId];
    if (!session) {
      throw new Error(`Browser session not found: ${sessionId}`);
    }
    if (session.status === 'closed') {
      return session;
    }
    if (this.browserRuntime && session.mode === 'playwright_controller') {
      await this.browserRuntime.closeSession(session.id);
    }
    session.status = 'closed';
    session.closedAt = nowIso();
    this.store.commit();
    this.events?.record({
      runId: session.runId,
      type: 'browser.session.closed',
      title: 'Browser session closed',
      entityId: session.id,
    });
    return session;
  }

  private async navigateWithFetch(input: {
    input: BrowserNavigateInput;
    session: BrowserSession;
    method: string;
    headers: Record<string, string>;
    timeoutMs: number;
  }): Promise<BrowserNavigateResult> {
    const startedAt = nowIso();
    const response = await fetch(input.input.target, {
      method: input.method,
      headers: input.headers,
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    const body = await response.text();
    const evidence = this.evidence.addEvidence({
      runId: input.input.runId,
      kind: 'http_exchange',
      content: JSON.stringify({
        source: 'browser-controller',
        sessionId: input.session.id,
        mode: input.session.mode,
        request: {
          method: input.method,
          target: redactUrl(input.input.target),
          headers: redactHeaders(input.headers),
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: redactHeaders(Object.fromEntries(response.headers.entries())),
          bodyPreview: redactText(body).slice(0, BODY_PREVIEW_LIMIT),
          bodyTruncated: body.length > BODY_PREVIEW_LIMIT,
        },
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    this.finishNavigation(input.session, input.input.target);
    return { session: input.session, evidence, evidenceIds: [evidence.id] };
  }

  private async navigateWithBrowserRuntime(input: {
    input: BrowserNavigateInput;
    session: BrowserSession;
    method: string;
    headers: Record<string, string>;
    timeoutMs: number;
  }): Promise<BrowserNavigateResult> {
    if (!this.browserRuntime) {
      throw new Error('Browser automation runtime is not configured');
    }
    const startedAt = nowIso();
    const rendered = await this.browserRuntime.navigate({
      sessionId: input.session.id,
      target: input.input.target,
      method: input.method,
      headers: input.headers,
      timeoutMs: input.timeoutMs,
      userAgent: input.session.userAgent,
      allowRequest: (target, method) => this.isRequestInScope(input.input.runId, target, method, input.input.riskLevel ?? 'R1'),
      captureHar: input.input.captureHar,
      captureTrace: input.input.captureTrace,
      captureVideo: input.input.captureVideo,
    });
    const finalUrl = rendered.finalUrl || input.input.target;
    if (!this.isRequestInScope(input.input.runId, finalUrl, 'GET', input.input.riskLevel ?? 'R1')) {
      throw new Error(`Browser navigation ended out of scope: ${redactUrl(finalUrl)}`);
    }
    const network = this.sanitizeNetworkEvents(input.input.runId, rendered.networkEvents ?? [], input.input.riskLevel ?? 'R1');
    const consoleMessages = sanitizeConsoleMessages(rendered.consoleMessages ?? []);
    const evidence = this.evidence.addEvidence({
      runId: input.input.runId,
      kind: 'http_exchange',
      content: JSON.stringify({
        source: 'browser-controller',
        sessionId: input.session.id,
        mode: input.session.mode,
        request: {
          method: input.method,
          target: redactUrl(input.input.target),
          headers: redactHeaders(input.headers),
        },
        response: {
          status: rendered.status,
          statusText: rendered.statusText,
          finalUrl: redactUrl(finalUrl),
          headers: redactHeaders(rendered.responseHeaders ?? {}),
          bodyPreview: rendered.bodyPreview ? redactText(rendered.bodyPreview).slice(0, BODY_PREVIEW_LIMIT) : undefined,
          bodyTruncated: (rendered.bodyPreview?.length ?? 0) > BODY_PREVIEW_LIMIT,
        },
        renderer: {
          title: rendered.title ? redactText(rendered.title).slice(0, 240) : undefined,
          consoleMessages,
          network,
        },
        captures: {
          harCaptured: !!rendered.harArchive,
          traceCaptured: !!rendered.traceArchive,
          videoCaptured: !!rendered.videoRecording,
        },
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    const snapshot = this.captureRenderedSnapshot(input.input.runId, {
      target: finalUrl,
      title: rendered.title,
      screenshot: rendered.screenshot,
      screenshotContentType: rendered.screenshotContentType,
      textPreview: rendered.textPreview,
      consoleMessages,
      network,
      harArchive: rendered.harArchive,
      traceArchive: rendered.traceArchive,
      videoRecording: rendered.videoRecording,
    });
    this.finishNavigation(input.session, finalUrl, snapshot?.id);
    return {
      session: input.session,
      evidence,
      snapshot,
      evidenceIds: [evidence.id, ...(snapshot?.evidenceIds ?? [])],
    };
  }

  private captureRenderedSnapshot(
    runId: string,
    input: {
      target: string;
      title?: string;
      screenshot?: Buffer;
      screenshotContentType?: string;
      textPreview?: string;
      consoleMessages: Array<{ type: string; text: string }>;
      network: Array<Record<string, unknown>>;
      harArchive?: Buffer;
      traceArchive?: Buffer;
      videoRecording?: Buffer;
    },
  ): BrowserSnapshot | undefined {
    if (!input.screenshot && !input.textPreview && input.consoleMessages.length === 0 && input.network.length === 0 && !input.harArchive && !input.traceArchive && !input.videoRecording) {
      return undefined;
    }
    const evidenceIds: string[] = [];
    let screenshotEvidenceId: string | undefined;
    let screenshotBytes: number | undefined;
    let screenshotContentType: string | undefined;
    let textEvidenceId: string | undefined;
    let textPreviewTruncated = false;
    let harEvidenceId: string | undefined;
    let traceEvidenceId: string | undefined;
    let videoEvidenceId: string | undefined;

    if (input.screenshot) {
      const screenshot = this.evidence.addEvidence({
        runId,
        kind: 'screenshot',
        content: input.screenshot,
        redactionState: 'raw_local_only',
      });
      screenshotEvidenceId = screenshot.id;
      screenshotBytes = input.screenshot.byteLength;
      screenshotContentType = input.screenshotContentType ?? 'image/png';
      evidenceIds.push(screenshot.id);
    }

    if (input.harArchive) {
      const redactedHar = redactHarArchive(input.harArchive);
      const harEvidence = this.evidence.addEvidence({
        runId,
        kind: 'replay_bundle',
        content: redactedHar,
        redactionState: 'redacted',
      });
      harEvidenceId = harEvidence.id;
      evidenceIds.push(harEvidence.id);
      this.events?.record({
        runId,
        type: 'browser.snapshot.captured',
        title: 'HAR archive captured',
        detail: `${redactUrl(input.target)} - ${redactedHar.byteLength} bytes (redacted)`,
        entityId: harEvidence.id,
      });
    }

    if (input.traceArchive) {
      const traceEvidence = this.evidence.addEvidence({
        runId,
        kind: 'replay_bundle',
        content: input.traceArchive,
        redactionState: 'raw_local_only',
      });
      traceEvidenceId = traceEvidence.id;
      evidenceIds.push(traceEvidence.id);
      this.events?.record({
        runId,
        type: 'browser.snapshot.captured',
        title: 'Playwright trace captured',
        detail: `${redactUrl(input.target)} - ${input.traceArchive.byteLength} bytes (raw_local_only)`,
        entityId: traceEvidence.id,
      });
    }

    if (input.videoRecording) {
      const videoEvidence = this.evidence.addEvidence({
        runId,
        kind: 'replay_bundle',
        content: input.videoRecording,
        redactionState: 'raw_local_only',
      });
      videoEvidenceId = videoEvidence.id;
      evidenceIds.push(videoEvidence.id);
      this.events?.record({
        runId,
        type: 'browser.snapshot.captured',
        title: 'Browser video captured',
        detail: `${redactUrl(input.target)} - ${input.videoRecording.byteLength} bytes (raw_local_only)`,
        entityId: videoEvidence.id,
      });
    }

    if (input.textPreview || input.consoleMessages.length > 0 || input.network.length > 0) {
      const textPreview = limitText(redactText(input.textPreview ?? ''), TEXT_PREVIEW_LIMIT);
      textPreviewTruncated = textPreview.truncated;
      const textEvidence = this.evidence.addEvidence({
        runId,
        kind: 'command_output',
        content: JSON.stringify({
          source: 'browser',
          captureType: 'browser_page_snapshot',
          target: redactUrl(input.target),
          title: input.title ? redactText(input.title).slice(0, 240) : undefined,
          textPreview: textPreview.text,
          textPreviewTruncated,
          consoleMessages: input.consoleMessages,
          network: input.network,
          capturedAt: nowIso(),
        }),
        redactionState: 'redacted',
      });
      textEvidenceId = textEvidence.id;
      evidenceIds.push(textEvidence.id);
    }

    const snapshot: BrowserSnapshot = {
      id: newId('browser_snapshot'),
      runId,
      source: 'browser',
      target: redactUrl(input.target),
      title: input.title ? redactText(input.title).slice(0, 240) : undefined,
      screenshotEvidenceId,
      textEvidenceId,
      evidenceIds,
      screenshotBytes,
      screenshotContentType,
      textPreviewTruncated,
      harEvidenceId,
      traceEvidenceId,
      videoEvidenceId,
      createdAt: nowIso(),
    };
    this.store.state.browserSnapshots[snapshot.id] = snapshot;
    this.events?.record({
      runId,
      type: 'browser.snapshot.captured',
      title: 'Browser snapshot captured',
      detail: `${redactUrl(input.target)} - ${evidenceIds.length} evidence item(s)`,
      entityId: snapshot.id,
    });
    this.store.commit();
    return snapshot;
  }

  private finishNavigation(session: BrowserSession, currentUrl: string, snapshotId?: string): void {
    session.currentUrl = redactUrl(currentUrl);
    session.lastNavigatedAt = nowIso();
    if (snapshotId) {
      session.snapshotIds = [...(session.snapshotIds ?? []), snapshotId];
      session.lastSnapshotId = snapshotId;
    }
    this.store.commit();
    this.events?.record({
      runId: session.runId,
      type: 'browser.session.navigated',
      title: 'Browser session navigated',
      detail: `${session.mode} ${redactUrl(currentUrl)}`,
      entityId: session.id,
    });
  }

  private getOrCreateSession(runId: string, startUrl: string): BrowserSession {
    return this.list(runId).find((session) => session.status === 'active') ?? this.start({ runId, startUrl });
  }

  private getActiveSession(sessionId: string): BrowserSession {
    const session = this.store.state.browserSessions[sessionId];
    if (!session) {
      throw new Error(`Browser session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new Error(`Browser session is not active: ${sessionId}`);
    }
    return session;
  }

  private assertRun(runId: string) {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }

  private assertInScope(runId: string, target: string, method: string, riskLevel: RiskLevel): void {
    const run = this.assertRun(runId);
    const decision = evaluateScope(run.scopePolicy, target, method, riskLevel);
    if (decision.action !== 'allow') {
      throw new Error(decision.reason);
    }
  }

  private isRequestInScope(runId: string, target: string, method: string, riskLevel: RiskLevel): boolean {
    try {
      const run = this.assertRun(runId);
      return evaluateScope(run.scopePolicy, target, method, riskLevel).action === 'allow';
    } catch {
      return false;
    }
  }

  private sanitizeNetworkEvents(runId: string, events: BrowserNetworkEvent[], riskLevel: RiskLevel): Array<Record<string, unknown>> {
    return events.slice(0, NETWORK_EVENT_LIMIT).map((event) => {
      const method = (event.method ?? 'GET').toUpperCase();
      const scopeAllowed = this.isRequestInScope(runId, event.url, method, riskLevel);
      return {
        url: redactUrl(event.url),
        method,
        status: event.status,
        resourceType: redactText(event.resourceType ?? '').slice(0, 80),
        scopeAllowed,
        blockedByScope: !scopeAllowed,
      };
    });
  }
}

export function createPlaywrightRuntimeFromEnv(): BrowserAutomationRuntime | undefined {
  if (process.env.PLATFORM_ENABLE_PLAYWRIGHT_RUNNER !== '1') {
    return undefined;
  }
  return new DynamicPlaywrightRuntime();
}

type PlaywrightModule = {
  chromium: {
    launch(input: { headless: boolean }): Promise<unknown>;
  };
};

class DynamicPlaywrightRuntime implements BrowserAutomationRuntime {
  readonly mode = 'playwright_controller' as const;
  private browser: unknown;
  private readonly sessions = new Map<string, PlaywrightRuntimeSession>();
  private readonly guards = new Map<string, (target: string, method: string) => boolean>();

  async navigate(input: {
    sessionId: string;
    target: string;
    method: string;
    headers: Record<string, string>;
    timeoutMs: number;
    userAgent: string;
    allowRequest: (target: string, method: string) => boolean;
    captureHar?: boolean;
    captureTrace?: boolean;
    captureVideo?: boolean;
  }): Promise<BrowserAutomationNavigation> {
    const session = await this.ensureSession(input.sessionId, input.userAgent, {
      captureHar: input.captureHar,
      captureTrace: input.captureTrace,
      captureVideo: input.captureVideo,
    });
    this.guards.set(input.sessionId, input.allowRequest);
    session.consoleMessages.length = 0;
    session.networkEvents.length = 0;
    await session.page.setExtraHTTPHeaders(playwrightExtraHeaders(input.headers));
    const response = await session.page.goto(input.target, {
      waitUntil: 'networkidle',
      timeout: input.timeoutMs,
    });
    const title = await session.page.title();
    const bodyText = (await session.page.locator('body').textContent({ timeout: 1000 }).catch(() => '')) ?? '';
    const screenshot = await session.page.screenshot({ type: 'png', fullPage: true }).catch(() => undefined);

    let harArchive: Buffer | undefined;
    let traceArchive: Buffer | undefined;
    let videoRecording: Buffer | undefined;

    if (input.captureHar && session.harPath) {
      try {
        const { readFileSync } = await import('node:fs');
        harArchive = readFileSync(session.harPath);
      } catch {
        // HAR capture failed, continue without it
      }
    }

    if (input.captureTrace && session.tracePath) {
      try {
        const { readFileSync } = await import('node:fs');
        traceArchive = readFileSync(session.tracePath);
      } catch {
        // Trace capture failed, continue without it
      }
    }

    if (input.captureVideo && session.videoPath) {
      try {
        const { readFileSync } = await import('node:fs');
        videoRecording = readFileSync(session.videoPath);
      } catch {
        // Video capture failed, continue without it
      }
    }

    return {
      finalUrl: session.page.url(),
      title,
      status: response?.status(),
      statusText: response?.statusText(),
      responseHeaders: response ? sanitizeHeaderRecord(await response.allHeaders().catch(() => ({}))) : {},
      bodyPreview: bodyText,
      screenshot: Buffer.isBuffer(screenshot) ? screenshot : undefined,
      screenshotContentType: 'image/png',
      textPreview: bodyText,
      consoleMessages: [...session.consoleMessages],
      networkEvents: [...session.networkEvents],
      harArchive,
      traceArchive,
      videoRecording,
    };
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Stop trace if active
    if (session.tracePath) {
      try {
        await session.context.tracing.stop({ path: session.tracePath });
      } catch {
        // Trace stop failed, continue cleanup
      }
    }

    // Get video path before closing
    const videoHandle = session.page.video();
    if (videoHandle) {
      try {
        session.videoPath = await videoHandle.path();
      } catch {
        // Video path retrieval failed
      }
    }

    await session.context.close().catch(() => undefined);
    this.sessions.delete(sessionId);
    this.guards.delete(sessionId);

    // Clean up temporary files after a delay to allow evidence capture
    setTimeout(() => {
      this.cleanupSessionFiles(sessionId, session);
    }, 5000);
  }

  private async cleanupSessionFiles(sessionId: string, session: PlaywrightRuntimeSession): Promise<void> {
    try {
      const { unlinkSync, rmSync } = await import('node:fs');
      if (session.harPath) {
        try {
          unlinkSync(session.harPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      if (session.tracePath) {
        try {
          unlinkSync(session.tracePath);
        } catch {
          // Ignore cleanup errors
        }
      }
      if (session.videoPath) {
        try {
          unlinkSync(session.videoPath);
          // Also try to remove the video directory
          const { dirname } = await import('node:path');
          rmSync(dirname(session.videoPath), { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch {
      // Ignore all cleanup errors
    }
  }

  private async ensureSession(sessionId: string, userAgent: string, capture?: { captureHar?: boolean; captureTrace?: boolean; captureVideo?: boolean }): Promise<PlaywrightRuntimeSession> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const browser = await this.ensureBrowser();
    const contextOptions: PlaywrightContextOptions = { userAgent };

    let harPath: string | undefined;
    let tracePath: string | undefined;
    let videoPath: string | undefined;

    if (capture?.captureHar) {
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      harPath = join(tmpdir(), `playwright-har-${sessionId}.har`);
      contextOptions.recordHar = { path: harPath };
    }

    if (capture?.captureVideo) {
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const videoDir = join(tmpdir(), `playwright-video-${sessionId}`);
      contextOptions.recordVideo = { dir: videoDir };
    }

    const context = await browser.newContext(contextOptions);

    if (capture?.captureTrace) {
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      tracePath = join(tmpdir(), `playwright-trace-${sessionId}.zip`);
      await context.tracing.start({ screenshots: true, snapshots: true });
    }

    await context.route('**/*', async (route) => {
      const request = route.request();
      const guard = this.guards.get(sessionId);
      if (!guard || guard(request.url(), request.method())) {
        await route.continue();
        return;
      }
      await route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    const session: PlaywrightRuntimeSession = {
      page,
      context,
      consoleMessages: [],
      networkEvents: [],
      harPath,
      tracePath,
      videoPath: contextOptions.recordVideo ? undefined : undefined, // Will be set after page closes
    };
    page.on('console', (message) => {
      if (session.consoleMessages.length < CONSOLE_MESSAGE_LIMIT) {
        session.consoleMessages.push({ type: message.type(), text: message.text() });
      }
    });
    page.on('response', (response) => {
      if (session.networkEvents.length < NETWORK_EVENT_LIMIT) {
        const request = response.request();
        session.networkEvents.push({
          url: response.url(),
          method: request.method(),
          status: response.status(),
          resourceType: request.resourceType(),
        });
      }
    });
    this.sessions.set(sessionId, session);
    return session;
  }

  private async ensureBrowser(): Promise<PlaywrightBrowser> {
    if (this.browser) {
      return this.browser as PlaywrightBrowser;
    }
    const module = (await import('playwright' as string)) as PlaywrightModule;
    this.browser = await module.chromium.launch({ headless: process.env.PLATFORM_PLAYWRIGHT_HEADLESS !== '0' });
    return this.browser as PlaywrightBrowser;
  }
}

interface PlaywrightBrowser {
  newContext(input: PlaywrightContextOptions): Promise<PlaywrightContext>;
}

interface PlaywrightContextOptions {
  userAgent: string;
  recordHar?: { path: string };
  recordVideo?: { dir: string };
}

interface PlaywrightContext {
  route(pattern: string, handler: (route: PlaywrightRoute) => Promise<void>): Promise<void>;
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
  tracing: {
    start(options: { screenshots: boolean; snapshots: boolean }): Promise<void>;
    stop(options: { path: string }): Promise<void>;
  };
}

interface PlaywrightRoute {
  request(): { url(): string; method(): string };
  continue(): Promise<void>;
  abort(reason: string): Promise<void>;
}

interface PlaywrightPage {
  on(event: 'console', handler: (message: PlaywrightConsoleMessage) => void): void;
  on(event: 'response', handler: (response: PlaywrightResponse) => void): void;
  setExtraHTTPHeaders(input: Record<string, string>): Promise<void>;
  goto(target: string, input: { waitUntil: string; timeout: number }): Promise<PlaywrightResponse | null>;
  title(): Promise<string>;
  locator(selector: string): { textContent(input: { timeout: number }): Promise<string | null> };
  screenshot(input: { type: string; fullPage: boolean }): Promise<Buffer>;
  url(): string;
  video(): { path(): Promise<string> } | null;
}

interface PlaywrightConsoleMessage {
  type(): string;
  text(): string;
}

interface PlaywrightResponse {
  request(): PlaywrightRequest;
  url(): string;
  status(): number;
  statusText(): string;
  allHeaders(): Promise<Record<string, string>>;
}

interface PlaywrightRequest {
  url(): string;
  method(): string;
  resourceType(): string;
}

interface PlaywrightRuntimeSession {
  page: PlaywrightPage;
  context: PlaywrightContext;
  consoleMessages: BrowserConsoleMessage[];
  networkEvents: BrowserNetworkEvent[];
  harPath?: string;
  tracePath?: string;
  videoPath?: string;
}

function limitText(value: string, maxLength: number): { text: string; truncated: boolean } {
  return { text: value.slice(0, maxLength), truncated: value.length > maxLength };
}

function sanitizeConsoleMessages(messages: BrowserConsoleMessage[]): BrowserConsoleMessage[] {
  return messages.slice(0, CONSOLE_MESSAGE_LIMIT).map((message) => ({
    type: redactText(message.type).slice(0, 40),
    text: redactText(message.text).slice(0, 1000),
  }));
}

function sanitizeHeaderRecord(value: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    headers[key] = String(item);
  }
  return headers;
}

function playwrightExtraHeaders(headers: Record<string, string>): Record<string, string> {
  const extraHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!/^user-agent$/i.test(key)) {
      extraHeaders[key] = value;
    }
  }
  return extraHeaders;
}

function redactHarArchive(harBuffer: Buffer): Buffer {
  try {
    const harText = harBuffer.toString('utf-8');
    const har = JSON.parse(harText);

    // Redact HAR entries
    if (har.log?.entries) {
      for (const entry of har.log.entries) {
        // Redact request
        if (entry.request) {
          entry.request.url = redactUrl(entry.request.url);
          if (entry.request.headers) {
            entry.request.headers = entry.request.headers.map((h: { name: string; value: string }) => ({
              name: h.name,
              value: redactSensitiveHeaderValue(h.name, h.value),
            }));
          }
          if (entry.request.cookies) {
            entry.request.cookies = entry.request.cookies.map((c: { name: string; value: string }) => ({
              ...c,
              value: '[REDACTED]',
            }));
          }
          if (entry.request.postData?.text) {
            entry.request.postData.text = redactText(entry.request.postData.text);
          }
          if (entry.request.queryString) {
            entry.request.queryString = entry.request.queryString.map((q: { name: string; value: string }) => ({
              name: q.name,
              value: redactText(q.value),
            }));
          }
        }

        // Redact response
        if (entry.response) {
          if (entry.response.headers) {
            entry.response.headers = entry.response.headers.map((h: { name: string; value: string }) => ({
              name: h.name,
              value: redactSensitiveHeaderValue(h.name, h.value),
            }));
          }
          if (entry.response.cookies) {
            entry.response.cookies = entry.response.cookies.map((c: { name: string; value: string }) => ({
              ...c,
              value: '[REDACTED]',
            }));
          }
          if (entry.response.content?.text) {
            entry.response.content.text = redactText(entry.response.content.text).slice(0, 10_000);
          }
        }
      }
    }

    // Redact creator info
    if (har.log?.creator) {
      har.log.creator.comment = 'Redacted by AgentRed';
    }

    return Buffer.from(JSON.stringify(har, null, 2), 'utf-8');
  } catch {
    // If HAR parsing fails, return redacted placeholder
    return Buffer.from(JSON.stringify({ log: { version: '1.2', creator: { name: 'AgentRed', version: '0.1' }, entries: [], comment: 'HAR parsing failed - redacted' } }), 'utf-8');
  }
}

function redactSensitiveHeaderValue(name: string, value: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName === 'authorization' || lowerName === 'cookie' || lowerName === 'set-cookie' || lowerName === 'x-api-key' || lowerName === 'x-auth-token') {
    return '[REDACTED]';
  }
  return redactText(value);
}
