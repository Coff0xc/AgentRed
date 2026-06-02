import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { Platform } from '../platform.js';
import type { WorkerEnvelopePreviewTask } from '../dispatcher/dispatcher.js';
import { newId, nowIso } from '../domain/ids.js';
import type {
  BrowserSnapshot,
  BrowserSnapshotSource,
  CaptureImport,
  CaptureImportSkippedEntry,
  CloudProvider,
  Confidence,
  CreateRunInput,
  CredentialReferenceKind,
  EvidenceReviewStatus,
  EvidenceKind,
  ProgramScopeImport,
  ProgramScopeImportFormat,
  AccessReviewSide,
  IdentityGraphProvider,
  RedactionState,
  RiskLevel,
  ScopePolicy,
  Severity,
  ValidationState,
  WorkerConfig,
} from '../domain/types.js';
import { redactHeaders, redactText, redactUrl } from '../security/redaction.js';
import { evaluateScope } from '../scope/policy.js';
import { normalizeProgramScope } from '../scope/program-scope-import.js';
import type { ReportFindingScope } from '../reports/report-service.js';
import type { ToolInvokeInput } from '../tools/tool-gateway.js';
import type { RegisterToolboxBundleInput } from '../tools/toolbox-runner.js';
import type { RegisterConnectorInput } from '../connectors/connector-registry-service.js';
import { OPERATOR_CONSOLE_CSS, OPERATOR_CONSOLE_HTML, OPERATOR_CONSOLE_JS } from '../ui/operator-console.js';

export interface ApiHandle {
  server: Server;
  url: string;
  close(): Promise<void>;
}

export async function startApiServer(
  platform: Platform,
  options: { port: number; host?: string; authToken?: string },
): Promise<ApiHandle> {
  const host = options.host ?? '127.0.0.1';
  const server = createServer((request, response) => {
    route(platform, request, response, options.authToken).catch((error: unknown) => {
      if (error instanceof HttpError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      sendJson(response, 500, { error: 'Internal server error' });
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port, host, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve API server address');
  }
  return {
    server,
    url: `http://${host}:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function route(
  platform: Platform,
  request: IncomingMessage,
  response: ServerResponse,
  authToken?: string,
): Promise<void> {
  const method = request.method ?? 'GET';
  const rawUrl = request.url ?? '/';
  if (method === 'CONNECT') {
    sendJson(response, 501, { error: 'CONNECT/TLS interception is not implemented in the local kernel' });
    return;
  }
  if (isAbsoluteProxyRequest(rawUrl)) {
    await handleHttpProxyRequest(platform, request, response, rawUrl, method, authToken);
    return;
  }

  const url = new URL(rawUrl, 'http://localhost');
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (pathParts[0] === 'oast' && pathParts[1]) {
    await handleOastCallback(platform, request, response, method, decodeURIComponent(pathParts[1]), url);
    return;
  }

  if (method === 'GET' && url.pathname === '/') {
    sendJson(response, 200, {
      status: 'ok',
      service: 'Authorized AI Pentest Platform API',
      auth: 'required for all routes except / and /health',
      health: '/health',
      app: '/app',
      primaryEndpoints: [
        'GET /runs',
        'POST /runs',
        'GET /runs/{id}/graph',
        'GET /runs/{id}/events',
        'GET /runs/{id}/progress',
        'GET /runs/{id}/mission-control',
        'GET /runs/{id}/runtime-operations-workbench',
        'GET /runs/{id}/workbench',
        'GET /runs/{id}/flow',
        'GET /runs/{id}/strategy',
        'GET /runs/{id}/search-plan',
        'POST /runs/{id}/search-plan/advance',
        'GET /runs/{id}/surface',
        'GET /runs/{id}/surface/frontier/{frontierId}/plan',
        'POST /runs/{id}/surface/frontier/{frontierId}/intent',
        'POST /runs/{id}/surface/frontier/{frontierId}/invoke',
        'POST /runs/{id}/autopilot/tick',
        'GET /skills',
        'GET /runs/{id}/skills',
        'GET /runs/{id}/domain-skill-readiness',
        'POST /runs/{id}/skills/{skillId}/enable',
        'GET /poc-templates',
        'GET /runs/{id}/poc-templates',
        'POST /runs/{id}/poc-templates/{templateId}/enable',
        'GET /runs/{id}/strategy/recommendations/{recommendationId}/plan',
        'POST /runs/{id}/strategy/recommendations/{recommendationId}/invoke',
        'POST /runs/{id}/strategy/recommendations/{recommendationId}/intent',
        'GET /runs/{id}/worker-envelope/preview',
        'GET /runs/{id}/worker-selection',
        'GET /runs/{id}/worker-evaluation-plan',
        'GET /runs/{id}/agent-harness',
        'GET /runs/{id}/agent-harness/plan',
        'GET /runs/{id}/workers',
        'GET /runs/{id}/execution-node',
        'GET /runs/{id}/desktop-readiness',
        'GET /runs/{id}/local-runner-workbench',
        'POST /runs/{id}/local-runner-workbench/prepare',
        'GET /runs/{id}/observability',
        'GET /runs/{id}/capability-radar',
        'GET /runs/{id}/scorecard',
        'GET /runs/{id}/evidence-quality',
        'GET /runs/{id}/delivery-readiness',
        'GET /runs/{id}/reference-benchmark',
        'GET /runs/{id}/replay-plans',
        'GET /runs/{id}/exports',
        'POST /runs/{id}/exports',
        'GET /capabilities',
        'GET /program-scope-imports',
        'POST /program-scopes/import',
        'GET /tool-catalog',
        'GET /agent-framework',
        'GET /worker-leaderboard',
        'GET /tool-packs',
        'GET /runs/{id}/tool-ecosystem-workbench',
        'GET /scanner-template-policies',
        'GET /toolbox-policy',
        'GET /toolbox-doctor',
        'GET /runs/{id}/runtime-activation-plan',
        'GET /toolbox-bundles',
        'POST /toolbox-bundles',
        'GET /toolbox-profiles',
        'GET /connectors',
        'POST /connectors',
        'GET /runs/{id}/toolbox-bundles',
        'POST /runs/{id}/toolbox-bundles/{bundleId}/enable',
        'GET /runs/{id}/connectors',
        'GET /runs/{id}/ecosystem-coverage',
        'GET /runs/{id}/tool-integration-backlog',
        'POST /runs/{id}/connectors/{connectorId}/enable',
        'GET /runs/{id}/connector-runs',
        'POST /runs/{id}/connectors/{connectorId}/plan',
        'POST /runs/{id}/connectors/{connectorId}/invoke',
        'POST /intents/{id}/heartbeat',
        'GET /runs/{id}/tool-pack-runs',
        'POST /runs/{id}/tool-packs/{packId}/plan',
        'POST /runs/{id}/tool-packs/{packId}/invoke',
        'POST /runs/{id}/tools/plan',
        'POST /runs/{id}/tools',
        'GET /runs/{id}/credentials',
        'POST /runs/{id}/credentials',
        'POST /credentials/{id}/revoke',
        'GET /runs/{id}/access-reviews',
        'POST /runs/{id}/access-reviews',
        'POST /runs/{id}/access-reviews/compare',
        'POST /access-reviews/{id}/evidence',
        'GET /runs/{id}/android-manifest-imports',
        'POST /runs/{id}/android-manifest-imports',
        'GET /runs/{id}/cloud-iam-imports',
        'POST /runs/{id}/cloud-iam-imports',
        'GET /runs/{id}/identity-graph-imports',
        'POST /runs/{id}/identity-graph-imports',
        'GET /runs/{id}/sarif-imports',
        'POST /runs/{id}/sarif-imports',
        'GET /runs/{id}/capture-imports',
        'GET /runs/{id}/browser-snapshots',
        'POST /runs/{id}/captures/http-exchange',
        'POST /runs/{id}/captures/har',
        'POST /runs/{id}/captures/browser-snapshot',
        'POST /runs/{id}/browser-sessions',
        'GET /runs/{id}/browser-sessions',
        'POST /browser-sessions/{id}/navigate',
        'POST /browser-sessions/{id}/close',
        'POST /runs/{id}/oast-sessions',
        'GET /runs/{id}/oast-sessions',
        'POST /oast-sessions/{id}/close',
        'GET|POST /oast/{token}',
        'POST /runs/{id}/proxy-sessions',
        'GET /runs/{id}/proxy-sessions',
        'POST /proxy-sessions/{id}/close',
        'HTTP proxy absolute-form requests with X-Capture-Run-Id',
        'POST /runs/{id}/evidence',
        'GET /runs/{id}/evidence-reviews',
        'POST /evidence/{id}/review',
        'POST /evidence/{id}/promote-finding',
        'POST /runs/{id}/findings',
        'POST /findings/{id}/validation',
        'GET /runs/{id}/approvals',
        'GET /runs/{id}/tool-invocations',
        'GET /evidence/{id}/content',
        'POST /evidence/{id}/replay',
        'GET /findings?runId={id}',
        'POST /runs/{id}/evaluations',
        'POST /reports',
      ],
    });
    return;
  }

  if (method === 'GET' && (url.pathname === '/app' || url.pathname === '/app/')) {
    sendText(response, 200, OPERATOR_CONSOLE_HTML, 'text/html; charset=utf-8');
    return;
  }

  if (method === 'GET' && url.pathname === '/app/app.js') {
    sendText(response, 200, OPERATOR_CONSOLE_JS, 'application/javascript; charset=utf-8');
    return;
  }

  if (method === 'GET' && url.pathname === '/app/styles.css') {
    sendText(response, 200, OPERATOR_CONSOLE_CSS, 'text/css; charset=utf-8');
    return;
  }

  if (authToken && !isAuthorized(request, authToken)) {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  if (method === 'GET' && url.pathname === '/runs') {
    const runs = Object.values(platform.store.state.runs)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((run) => ({ ...run, progress: platform.events.progress(run.id) }));
    sendJson(response, 200, runs);
    return;
  }

  if (method === 'GET' && url.pathname === '/tool-catalog') {
    sendJson(response, 200, platform.tools.catalog());
    return;
  }

  if (method === 'GET' && url.pathname === '/program-scope-imports') {
    sendJson(response, 200, listProgramScopeImports(platform));
    return;
  }

  if (method === 'POST' && url.pathname === '/program-scopes/import') {
    const input = validateProgramScopeImport(await readJson(request));
    sendJson(response, 201, importProgramScope(platform, input));
    return;
  }

  if (method === 'GET' && url.pathname === '/tool-packs') {
    sendJson(response, 200, platform.toolPacks.list());
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'tool-ecosystem-workbench') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.toolEcosystemWorkbench.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'mission-control') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.missionControl.get(pathParts[1], requestBaseUrl(request)));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'runtime-operations-workbench') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.runtimeOperationsWorkbench.get(pathParts[1], requestBaseUrl(request)));
    return;
  }

  if (method === 'GET' && url.pathname === '/scanner-template-policies') {
    sendJson(response, 200, platform.tools.scannerTemplatePolicies());
    return;
  }

  if (method === 'GET' && url.pathname === '/capabilities') {
    sendJson(response, 200, platform.tools.capabilities());
    return;
  }

  if (method === 'GET' && url.pathname === '/agent-framework') {
    sendJson(response, 200, await platform.agentFramework.report());
    return;
  }

  if (method === 'GET' && url.pathname === '/worker-leaderboard') {
    sendJson(response, 200, platform.workerLeaderboard.get());
    return;
  }

  if (method === 'GET' && url.pathname === '/toolbox-policy') {
    sendJson(response, 200, platform.toolbox.policy());
    return;
  }

  if (method === 'GET' && url.pathname === '/toolbox-doctor') {
    sendJson(response, 200, await platform.toolboxDoctor.report());
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'runtime-activation-plan') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.runtimeActivation.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && url.pathname === '/toolbox-profiles') {
    sendJson(response, 200, await platform.toolbox.profiles());
    return;
  }

  if (method === 'GET' && url.pathname === '/toolbox-bundles') {
    sendJson(response, 200, await platform.toolbox.bundles());
    return;
  }

  if (method === 'POST' && url.pathname === '/toolbox-bundles') {
    const input = validateToolboxBundleRegistration(await readJson(request));
    try {
      sendJson(response, 201, platform.toolbox.registerBundle(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Toolbox bundle registration failed');
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/connectors') {
    sendJson(response, 200, platform.connectors.list());
    return;
  }

  if (method === 'POST' && url.pathname === '/connectors') {
    const input = validateConnectorRegistration(await readJson(request));
    try {
      sendJson(response, 201, platform.connectors.registerConnector(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Connector registration failed');
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/skills') {
    sendJson(response, 200, platform.skills.list());
    return;
  }

  if (method === 'GET' && url.pathname === '/poc-templates') {
    sendJson(response, 200, platform.pocs.list());
    return;
  }

  if (method === 'POST' && url.pathname === '/runs') {
    const input = validateCreateRun(await readJson(request));
    const run = platform.graph.createRun(input);
    sendJson(response, 201, run);
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'toolbox-bundles') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.toolbox.listForRun(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'toolbox-bundles' && pathParts[4] === 'enable') {
    assertRunExists(platform, pathParts[1]);
    try {
      sendJson(response, 201, platform.toolbox.enable(pathParts[1], decodeURIComponent(pathParts[3])));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Toolbox bundle not found');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'connectors') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.connectors.listForRun(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'ecosystem-coverage') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.ecosystemCoverage.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'tool-integration-backlog') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.toolIntegrationBacklog.get(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'connectors' && pathParts[4] === 'enable') {
    assertRunExists(platform, pathParts[1]);
    try {
      sendJson(response, 201, platform.connectors.enable(pathParts[1], decodeURIComponent(pathParts[3])));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Connector not found');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'connectors' && pathParts[4] === 'plan') {
    assertRunExists(platform, pathParts[1]);
    const input = validateToolPackRequest(await readJson(request));
    try {
      sendJson(response, 200, await platform.connectorRuns.plan(pathParts[1], decodeURIComponent(pathParts[3]), input.target));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Connector not found');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'connectors' && pathParts[4] === 'invoke') {
    assertRunExists(platform, pathParts[1]);
    const input = validateToolPackRequest(await readJson(request));
    try {
      sendJson(response, 200, await platform.connectorRuns.invoke(pathParts[1], decodeURIComponent(pathParts[3]), input.target));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Connector not found');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'graph') {
    sendJson(response, 200, platform.graph.getGraph(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'events') {
    sendJson(response, 200, platform.events.list(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'progress') {
    sendJson(response, 200, platform.events.progress(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'workbench') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.agentWorkbench.getRunWorkbench(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'flow') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.flow.getBrief(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'strategy' && pathParts.length === 3) {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.strategy.getBrief(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'search-plan' && pathParts.length === 3) {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.searchPlan.getPlan(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'search-plan' && pathParts[3] === 'advance') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.searchPlan.advance(pathParts[1]));
    return;
  }

  if (
    method === 'GET' &&
    pathParts[0] === 'runs' &&
    pathParts[2] === 'surface' &&
    pathParts[3] === 'frontier' &&
    pathParts[5] === 'plan'
  ) {
    assertRunExists(platform, pathParts[1]);
    const request = getSurfaceFrontierToolRequest(platform, pathParts[1], decodeURIComponent(pathParts[4]));
    sendJson(
      response,
      200,
      await platform.tools.preview({
        runId: pathParts[1],
        tool: request.toolRequest.tool,
        target: request.toolRequest.target,
        method: request.toolRequest.method ?? 'GET',
        riskLevel: request.toolRequest.riskLevel ?? 'R1',
        args: request.toolRequest.args ?? {},
        approvalId: request.toolRequest.approvalId,
      }),
    );
    return;
  }

  if (
    method === 'POST' &&
    pathParts[0] === 'runs' &&
    pathParts[2] === 'surface' &&
    pathParts[3] === 'frontier' &&
    pathParts[5] === 'intent'
  ) {
    assertRunExists(platform, pathParts[1]);
    try {
      sendJson(response, 201, platform.surface.queueFrontierIntent(pathParts[1], decodeURIComponent(pathParts[4])));
    } catch (error) {
      throw surfaceFrontierError(error);
    }
    return;
  }

  if (
    method === 'POST' &&
    pathParts[0] === 'runs' &&
    pathParts[2] === 'surface' &&
    pathParts[3] === 'frontier' &&
    pathParts[5] === 'invoke'
  ) {
    assertRunExists(platform, pathParts[1]);
    const request = getSurfaceFrontierToolRequest(platform, pathParts[1], decodeURIComponent(pathParts[4]));
    sendJson(
      response,
      200,
      await platform.tools.invoke({
        runId: pathParts[1],
        tool: request.toolRequest.tool,
        target: request.toolRequest.target,
        method: request.toolRequest.method ?? 'GET',
        riskLevel: request.toolRequest.riskLevel ?? 'R1',
        args: request.toolRequest.args ?? {},
        approvalId: request.toolRequest.approvalId,
      }),
    );
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'surface' && pathParts.length === 3) {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.surface.getMap(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'skills') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.skills.listForRun(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'domain-skill-readiness') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.skillReadiness.get(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'skills' && pathParts[4] === 'enable') {
    assertRunExists(platform, pathParts[1]);
    try {
      sendJson(response, 201, platform.skills.enable(pathParts[1], decodeURIComponent(pathParts[3])));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Domain Skill not found');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'poc-templates') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.pocs.listForRun(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'poc-templates' && pathParts[4] === 'enable') {
    assertRunExists(platform, pathParts[1]);
    try {
      sendJson(response, 201, platform.pocs.enable(pathParts[1], decodeURIComponent(pathParts[3])));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'PoC template not found');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'autopilot' && pathParts[3] === 'tick') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.autopilot.tick(pathParts[1]));
    return;
  }

  if (
    method === 'GET' &&
    pathParts[0] === 'runs' &&
    pathParts[2] === 'strategy' &&
    pathParts[3] === 'recommendations' &&
    pathParts[5] === 'plan'
  ) {
    assertRunExists(platform, pathParts[1]);
    const strategy = platform.strategy.getBrief(pathParts[1]);
    const recommendation = strategy.recommendations.find((item) => item.id === decodeURIComponent(pathParts[4]));
    if (!recommendation) {
      throw new HttpError(404, `Strategy recommendation not found: ${pathParts[4]}`);
    }
    if (!recommendation.toolRequest) {
      throw new HttpError(400, `Strategy recommendation is not directly executable: ${pathParts[4]}`);
    }
    const request = recommendation.toolRequest;
    sendJson(
      response,
      200,
      await platform.tools.preview({
        runId: pathParts[1],
        tool: request.tool,
        target: request.target,
        method: request.method ?? 'GET',
        riskLevel: request.riskLevel ?? 'R1',
        args: request.args ?? {},
        approvalId: request.approvalId,
      }),
    );
    return;
  }

  if (
    method === 'POST' &&
    pathParts[0] === 'runs' &&
    pathParts[2] === 'strategy' &&
    pathParts[3] === 'recommendations' &&
    pathParts[5] === 'intent'
  ) {
    assertRunExists(platform, pathParts[1]);
    try {
      sendJson(response, 201, platform.strategy.queueRecommendationIntent(pathParts[1], decodeURIComponent(pathParts[4])));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Strategy recommendation not found');
    }
    return;
  }

  if (
    method === 'POST' &&
    pathParts[0] === 'runs' &&
    pathParts[2] === 'strategy' &&
    pathParts[3] === 'recommendations' &&
    pathParts[5] === 'invoke'
  ) {
    assertRunExists(platform, pathParts[1]);
    const strategy = platform.strategy.getBrief(pathParts[1]);
    const recommendation = strategy.recommendations.find((item) => item.id === decodeURIComponent(pathParts[4]));
    if (!recommendation) {
      throw new HttpError(404, `Strategy recommendation not found: ${pathParts[4]}`);
    }
    if (!recommendation.toolRequest) {
      throw new HttpError(400, `Strategy recommendation is not directly executable: ${pathParts[4]}`);
    }
    const request = recommendation.toolRequest;
    sendJson(
      response,
      200,
      await platform.tools.invoke({
        runId: pathParts[1],
        tool: request.tool,
        target: request.target,
        method: request.method ?? 'GET',
        riskLevel: request.riskLevel ?? 'R1',
        args: request.args ?? {},
        approvalId: request.approvalId,
      }),
    );
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'worker-envelope' && pathParts[3] === 'preview') {
    assertRunExists(platform, pathParts[1]);
    const task = validateWorkerEnvelopePreviewTask(url.searchParams.get('task') ?? 'auto');
    try {
      sendJson(response, 200, await platform.dispatcher.previewEnvelope(pathParts[1], task));
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : 'Worker envelope preview is not available');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'worker-selection') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.workerSelection.preview(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'worker-evaluation-plan') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.workerEvaluationPlan.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'agent-harness' && pathParts[3] === 'plan') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.agentHarness.getPlan(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'agent-harness' && pathParts.length === 3) {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.agentHarness.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'workers') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.workerRuntimes.list(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'execution-node') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.executionNode.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'desktop-readiness') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.desktopReadiness.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'local-runner-workbench') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.localRunnerWorkbench.get(pathParts[1], requestBaseUrl(request)));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'local-runner-workbench' && pathParts[3] === 'prepare') {
    assertRunExists(platform, pathParts[1]);
    const input = validateLocalRunnerWorkbenchPrepare(await readJson(request));
    try {
      sendJson(
        response,
        201,
        platform.localRunnerWorkbench.prepare({
          runId: pathParts[1],
          baseUrl: requestBaseUrl(request),
          includeBrowser: input.includeBrowser,
          includeProxy: input.includeProxy,
          includeOast: input.includeOast,
        }),
      );
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Local runner preparation failed');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'observability') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.observability.summary(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'capability-radar') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.capabilityRadar.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'scorecard') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.scorecards.getRunScorecard(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'evidence-quality') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.evidenceQuality.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'delivery-readiness') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.deliveryReadiness.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'reference-benchmark') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, await platform.referenceBenchmark.get(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'replay-plans') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.replay.listPlans(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'review') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, getRunReview(platform, pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'exports') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.runExports.list(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'exports') {
    assertRunExists(platform, pathParts[1]);
    const input = validateRunExportRequest(pathParts[1], await readJson(request));
    sendJson(response, 201, platform.runExports.generate(input));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'hints') {
    const input = validateHint(await readJson(request));
    sendJson(response, 201, platform.graph.addHint(pathParts[1], input.text));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'dispatch') {
    sendJson(response, 200, await platform.dispatcher.dispatchOnce(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'tool-pack-runs') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.toolPacks.listRuns(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'connector-runs') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.connectorRuns.listRuns(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'tool-packs' && pathParts[4] === 'plan') {
    assertRunExists(platform, pathParts[1]);
    const input = validateToolPackRequest(await readJson(request));
    try {
      sendJson(response, 200, await platform.toolPacks.plan(pathParts[1], decodeURIComponent(pathParts[3]), input.target));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Tool Pack not found');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'tool-packs' && pathParts[4] === 'invoke') {
    assertRunExists(platform, pathParts[1]);
    const input = validateToolPackRequest(await readJson(request));
    try {
      sendJson(response, 200, await platform.toolPacks.invoke(pathParts[1], decodeURIComponent(pathParts[3]), input.target));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Tool Pack not found');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'tools' && pathParts[3] === 'plan') {
    assertRunExists(platform, pathParts[1]);
    const input = validateToolInvoke(pathParts[1], await readJson(request));
    sendJson(response, 200, await platform.tools.preview(input));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'tools' && pathParts.length === 3) {
    assertRunExists(platform, pathParts[1]);
    const input = validateToolInvoke(pathParts[1], await readJson(request));
    sendJson(response, 200, await platform.tools.invoke(input));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'credentials') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.credentials.list(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'credentials') {
    assertRunExists(platform, pathParts[1]);
    const input = validateCredentialReferenceCreate(pathParts[1], await readJson(request));
    try {
      sendJson(response, 201, platform.credentials.create(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Credential reference creation failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'credentials' && pathParts[2] === 'revoke') {
    try {
      sendJson(response, 200, platform.credentials.revoke(pathParts[1]));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Credential reference not found');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'access-reviews') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.accessReviews.list(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'android-manifest-imports') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.androidManifests.list(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'android-manifest-imports') {
    assertRunExists(platform, pathParts[1]);
    const input = validateAndroidManifestImport(pathParts[1], await readJson(request));
    try {
      sendJson(response, 201, platform.androidManifests.import(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Android Manifest import failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'access-reviews' && pathParts.length === 3) {
    assertRunExists(platform, pathParts[1]);
    const input = validateAccessReviewCreate(pathParts[1], await readJson(request));
    try {
      sendJson(response, 201, platform.accessReviews.create(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Access review creation failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'access-reviews' && pathParts[3] === 'compare') {
    assertRunExists(platform, pathParts[1]);
    const input = validateAccessReviewCompare(pathParts[1], await readJson(request));
    try {
      sendJson(response, 201, platform.accessReviews.compareEvidence(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Access review comparison failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'access-reviews' && pathParts[2] === 'evidence') {
    const input = validateAccessReviewEvidence(await readJson(request));
    try {
      sendJson(response, 200, platform.accessReviews.attachEvidence({ reviewId: pathParts[1], ...input }));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Access review evidence attach failed');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'evidence-reviews') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.evidenceReviews.list(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'evidence' && pathParts[2] === 'review') {
    const input = validateEvidenceReview(pathParts[1], await readJson(request));
    try {
      sendJson(response, 200, platform.evidenceReviews.review(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Evidence review failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'evidence' && pathParts[2] === 'replay') {
    const input = validateEvidenceReplayRequest(await readJson(request));
    try {
      sendJson(response, 201, await platform.replay.replay(pathParts[1], input.timeoutMs));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Evidence replay failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'evidence' && pathParts[2] === 'promote-finding') {
    const input = validateEvidenceFindingPromotion(pathParts[1], await readJson(request));
    sendJson(response, 201, promoteEvidenceToFinding(platform, input));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'sarif-imports') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.sarif.list(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'cloud-iam-imports') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.cloudIam.list(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'identity-graph-imports') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.identityGraphs.list(pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'capture-imports') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, listCaptureImports(platform, pathParts[1]));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'browser-snapshots') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, listBrowserSnapshots(platform, pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'sarif-imports') {
    assertRunExists(platform, pathParts[1]);
    const input = validateSarifImport(pathParts[1], await readJson(request));
    try {
      sendJson(response, 201, platform.sarif.import(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'SARIF import failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'cloud-iam-imports') {
    assertRunExists(platform, pathParts[1]);
    const input = validateCloudIamImport(pathParts[1], await readJson(request));
    try {
      sendJson(response, 201, platform.cloudIam.import(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Cloud IAM import failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'identity-graph-imports') {
    assertRunExists(platform, pathParts[1]);
    const input = validateIdentityGraphImport(pathParts[1], await readJson(request));
    try {
      sendJson(response, 201, platform.identityGraphs.import(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Identity graph import failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'captures' && pathParts[3] === 'http-exchange') {
    const input = validateHttpExchangeCapture(pathParts[1], await readJson(request));
    sendJson(response, 201, captureHttpExchange(platform, input));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'captures' && pathParts[3] === 'har') {
    const input = validateHarCapture(pathParts[1], await readJson(request));
    sendJson(response, 201, importHarCapture(platform, input));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'captures' && pathParts[3] === 'browser-snapshot') {
    const input = validateBrowserSnapshotCapture(pathParts[1], await readJson(request));
    sendJson(response, 201, captureBrowserSnapshot(platform, input));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'browser-sessions') {
    assertRunExists(platform, pathParts[1]);
    const input = validateBrowserSessionStart(await readJson(request));
    try {
      sendJson(response, 201, platform.browserSessions.start({ runId: pathParts[1], startUrl: input.startUrl }));
    } catch (error) {
      throw new HttpError(403, error instanceof Error ? error.message : 'Browser session start failed');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'browser-sessions') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.browserSessions.list(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'browser-sessions' && pathParts[2] === 'navigate') {
    const session = platform.store.state.browserSessions[pathParts[1]];
    if (!session) {
      throw new HttpError(404, `Browser session not found: ${pathParts[1]}`);
    }
    const input = validateBrowserNavigate(await readJson(request));
    try {
      sendJson(
        response,
        200,
        await platform.browserSessions.navigate({
          sessionId: pathParts[1],
          runId: session.runId,
          target: input.target,
          method: input.method,
          headers: input.headers,
          timeoutMs: input.timeoutMs,
        }),
      );
    } catch (error) {
      throw new HttpError(403, error instanceof Error ? error.message : 'Browser navigation failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'browser-sessions' && pathParts[2] === 'close') {
    try {
      sendJson(response, 200, platform.browserSessions.close(pathParts[1]));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Browser session not found');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'oast-sessions') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 201, platform.oast.start({ runId: pathParts[1], baseUrl: requestBaseUrl(request) }));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'oast-sessions') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.oast.list(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'oast-sessions' && pathParts[2] === 'close') {
    try {
      sendJson(response, 200, platform.oast.close(pathParts[1]));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'OAST session not found');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'proxy-sessions') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 201, platform.proxySessions.start({ runId: pathParts[1], proxyUrl: requestBaseUrl(request) }));
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'proxy-sessions') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 200, platform.proxySessions.list(pathParts[1]));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'proxy-sessions' && pathParts[2] === 'close') {
    try {
      sendJson(response, 200, platform.proxySessions.close(pathParts[1]));
    } catch (error) {
      throw new HttpError(404, error instanceof Error ? error.message : 'Proxy session not found');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'evidence') {
    assertRunExists(platform, pathParts[1]);
    const input = validateEvidenceImport(pathParts[1], await readJson(request));
    sendJson(response, 201, platform.evidence.addEvidence(input));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'findings') {
    assertRunExists(platform, pathParts[1]);
    const input = validateProposeFinding(pathParts[1], await readJson(request));
    try {
      sendJson(response, 201, platform.findings.proposeFinding(input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Finding proposal failed');
    }
    return;
  }

  if (method === 'POST' && pathParts[0] === 'findings' && pathParts[2] === 'validation') {
    const input = validateFindingValidation(await readJson(request));
    try {
      sendJson(response, 200, platform.findings.updateValidationState(pathParts[1], input));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Finding validation failed');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'approvals') {
    assertRunExists(platform, pathParts[1]);
    sendJson(
      response,
      200,
      Object.values(platform.store.state.approvals).filter((approval) => approval.runId === pathParts[1]),
    );
    return;
  }

  if (method === 'GET' && pathParts[0] === 'runs' && pathParts[2] === 'tool-invocations') {
    assertRunExists(platform, pathParts[1]);
    sendJson(
      response,
      200,
      Object.values(platform.store.state.toolInvocations).filter((invocation) => invocation.runId === pathParts[1]),
    );
    return;
  }

  if (method === 'POST' && pathParts[0] === 'approvals' && pathParts[2] === 'decision') {
    const input = validateApprovalDecision(await readJson(request));
    sendJson(response, 200, platform.approvals.decide(pathParts[1], input.status));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'intents' && pathParts[2] === 'heartbeat') {
    const input = validateIntentHeartbeat(await readJson(request));
    try {
      sendJson(response, 200, platform.graph.heartbeatIntent(pathParts[1], input.leaseId, input.leaseMs));
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : 'Intent heartbeat failed');
    }
    return;
  }

  if (method === 'GET' && pathParts[0] === 'evidence' && pathParts[2] === 'content') {
    const evidence = platform.store.state.evidence[pathParts[1]];
    if (!evidence) {
      throw new HttpError(404, `Evidence not found: ${pathParts[1]}`);
    }
    const blob = platform.evidence.readEvidenceBlob(evidence.id);
    sendJson(response, 200, { evidence, ...blob });
    return;
  }

  if (method === 'GET' && url.pathname === '/findings') {
    sendJson(response, 200, platform.findings.list(url.searchParams.get('runId') ?? undefined));
    return;
  }

  if (method === 'POST' && pathParts[0] === 'runs' && pathParts[2] === 'evaluations') {
    assertRunExists(platform, pathParts[1]);
    sendJson(response, 201, platform.observability.evaluateRun(pathParts[1]));
    return;
  }

  if (method === 'POST' && url.pathname === '/reports') {
    const input = validateReportRequest(await readJson(request));
    sendJson(response, 201, platform.reports.generate(input));
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    const maxBytes = 1_048_576;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        reject(new HttpError(413, 'Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpError(400, 'Invalid JSON request body'));
      }
    });
    request.on('error', reject);
  });
}

function readRawBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const maxBytes = 1_048_576;
    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        reject(new HttpError(413, 'Request body too large'));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendText(response: ServerResponse, statusCode: number, payload: string, contentType: string): void {
  response.writeHead(statusCode, { 'content-type': contentType, 'cache-control': 'no-store' });
  response.end(payload);
}

async function handleHttpProxyRequest(
  platform: Platform,
  request: IncomingMessage,
  response: ServerResponse,
  rawUrl: string,
  method: string,
  authToken?: string,
): Promise<void> {
  if (!isProxyAuthorized(request, authToken)) {
    response.writeHead(407, {
      'content-type': 'application/json; charset=utf-8',
      'proxy-authenticate': 'Bearer realm="authorized-ai-pentest-platform"',
    });
    response.end(JSON.stringify({ error: 'Proxy authentication required' }));
    return;
  }

  const runId = headerValue(request.headers['x-capture-run-id']);
  if (!runId) {
    throw new HttpError(400, 'X-Capture-Run-Id header is required for proxy capture');
  }
  const run = platform.store.state.runs[runId];
  if (!run) {
    throw new HttpError(404, `Run not found: ${runId}`);
  }
  if (!platform.proxySessions.hasActive(runId)) {
    throw new HttpError(409, `No active proxy capture session for run: ${runId}`);
  }
  const target = new URL(rawUrl);
  const scopeDecision = evaluateScope(run.scopePolicy, target.toString(), method, 'R1');
  if (scopeDecision.action !== 'allow') {
    throw new HttpError(403, scopeDecision.reason);
  }

  const requestBody = await readRawBody(request);
  const forwardedHeaders = forwardedHeaderRecord(request.headers);
  try {
    const upstream = await fetch(target, {
      method: method.toUpperCase(),
      headers: forwardedHeaders,
      body: methodHasBody(method) && requestBody.length > 0 ? requestBody.toString('utf8') : undefined,
      redirect: 'manual',
    });
    const responseBody = Buffer.from(await upstream.arrayBuffer());
    const responseHeaders = Object.fromEntries(upstream.headers.entries());
    captureHttpExchange(platform, {
      runId,
      source: 'proxy',
      request: {
        method,
        target: target.toString(),
        headers: forwardedHeaders,
        bodyPreview: requestBody.length > 0 ? requestBody.toString('utf8') : undefined,
      },
      response: {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
        bodyPreview: responseBody.toString('utf8'),
      },
    });

    const contentType = upstream.headers.get('content-type');
    response.writeHead(upstream.status, {
      ...(contentType ? { 'content-type': contentType } : {}),
      'content-length': String(responseBody.length),
    });
    response.end(responseBody);
  } catch (error) {
    throw new HttpError(502, error instanceof Error ? `Proxy request failed: ${error.message}` : 'Proxy request failed');
  }
}

async function handleOastCallback(
  platform: Platform,
  request: IncomingMessage,
  response: ServerResponse,
  method: string,
  token: string,
  url: URL,
): Promise<void> {
  const body = await readRawBody(request);
  try {
    const callback = platform.oast.recordCallback({
      token,
      protocol: 'http',
      method,
      path: `${url.pathname}${url.search}`,
      headers: headerRecord(request.headers),
      bodyPreview: body.length > 0 ? body.toString('utf8') : undefined,
      source: 'http-callback',
      remoteAddress: request.socket.remoteAddress,
    });
    sendJson(response, 202, { status: 'recorded', callbackId: callback.id, evidenceId: callback.evidenceId });
  } catch (error) {
    throw new HttpError(404, error instanceof Error ? error.message : 'OAST callback token not found');
  }
}

class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function isAuthorized(request: IncomingMessage, authToken: string): boolean {
  const authorization = request.headers.authorization;
  if (authorization === `Bearer ${authToken}`) {
    return true;
  }
  return request.headers['x-platform-token'] === authToken;
}

function isProxyAuthorized(request: IncomingMessage, authToken?: string): boolean {
  if (!authToken) {
    return true;
  }
  if (headerValue(request.headers['x-platform-token']) === authToken) {
    return true;
  }
  return headerValue(request.headers['proxy-authorization']) === `Bearer ${authToken}`;
}

function isAbsoluteProxyRequest(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function headerRecord(headers: IncomingMessage['headers']): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = headerValue(value);
    if (normalized) {
      result[key] = normalized;
    }
  }
  return result;
}

function requestBaseUrl(request: IncomingMessage): string {
  return `http://${headerValue(request.headers.host) ?? '127.0.0.1'}`;
}

const STRIPPED_PROXY_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-capture-run-id',
  'x-platform-token',
]);

function forwardedHeaderRecord(headers: IncomingMessage['headers']): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (STRIPPED_PROXY_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    const normalized = headerValue(value);
    if (normalized) {
      result[key] = normalized;
    }
  }
  return result;
}

function methodHasBody(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD';
}

function getSurfaceFrontierToolRequest(platform: Platform, runId: string, frontierId: string) {
  try {
    return platform.surface.toolRequestForFrontier(runId, frontierId);
  } catch (error) {
    throw surfaceFrontierError(error);
  }
}

function surfaceFrontierError(error: unknown): HttpError {
  const message = error instanceof Error ? error.message : 'Search frontier request failed';
  return new HttpError(message.includes('not found') ? 404 : 400, message);
}

function assertRunExists(platform: Platform, runId: string): void {
  if (!platform.store.state.runs[runId]) {
    throw new HttpError(404, `Run not found: ${runId}`);
  }
}

function getRunReview(platform: Platform, runId: string) {
  const graph = platform.graph.getGraph(runId);
  const progress = platform.events.progress(runId);
  const approvals = Object.values(platform.store.state.approvals)
    .filter((approval) => approval.runId === runId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const toolInvocations = Object.values(platform.store.state.toolInvocations)
    .filter((invocation) => invocation.runId === runId)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const findings = platform.findings.list(runId);
  const runExports = platform.runExports.list(runId);
  const exportEvidenceIds = new Set(runExports.map((item) => item.evidenceId));
  const reports = graph.evidence.filter((item) => item.kind === 'replay_bundle' && !exportEvidenceIds.has(item.id));
  const browserSessions = platform.browserSessions.list(runId);
  const proxySessions = platform.proxySessions.list(runId);
  const oastSessions = platform.oast.list(runId);
  const oastCallbacks = platform.oast.listCallbacks(runId);
  const credentialReferences = platform.credentials.list(runId);
  const accessReviews = platform.accessReviews.list(runId);
  const androidManifestImports = platform.androidManifests.list(runId);
  const cloudIamImports = platform.cloudIam.list(runId);
  const identityGraphImports = platform.identityGraphs.list(runId);
  const sarifImports = platform.sarif.list(runId);
  const captureImports = listCaptureImports(platform, runId);
  const browserSnapshots = listBrowserSnapshots(platform, runId);
  const toolPackRuns = platform.toolPacks.listRuns(runId);
  const connectorRuns = platform.connectorRuns.listRuns(runId);
  const evidenceReviews = platform.evidenceReviews.list(runId);
  const observability = platform.observability.summary(runId);
  return {
    run: graph.run,
    progress,
    approvals,
    toolInvocations,
    evidence: graph.evidence,
    findings,
    reports,
    runExports,
    browserSessions,
    proxySessions,
    oastSessions,
    oastCallbacks,
    credentialReferences,
    accessReviews,
    androidManifestImports,
    cloudIamImports,
    identityGraphImports,
    sarifImports,
    captureImports,
    browserSnapshots,
    toolPackRuns,
    connectorRuns,
    evidenceReviews,
    observability,
  };
}

interface HttpExchangeCaptureInput {
  runId: string;
  source: 'browser' | 'proxy' | 'manual';
  request: {
    method: string;
    target: string;
    headers: Record<string, string>;
    bodyPreview?: string;
  };
  response: {
    status?: number;
    statusText?: string;
    headers: Record<string, string>;
    bodyPreview?: string;
  };
}

interface HarCaptureInput {
  runId: string;
  source: string;
  content: Record<string, unknown>;
  maxEntries: number;
}

interface BrowserSnapshotCaptureInput {
  runId: string;
  source: BrowserSnapshotSource;
  target: string;
  title?: string;
  screenshotBase64?: string;
  screenshotContentType?: string;
  textPreview?: string;
}

interface ProgramScopeImportInput {
  source: string;
  format: ProgramScopeImportFormat;
  content: Record<string, unknown>;
  allowedMethods?: string[];
  requestsPerMinute?: number;
  destructiveAllowed?: boolean;
  allowVaultReferencesOnly?: boolean;
}

interface HarImportResult {
  runId: string;
  source: string;
  totalEntries: number;
  processedEntries: number;
  imported: number;
  skipped: number;
  truncatedEntries: number;
  evidenceIds: string[];
  skippedEntries: CaptureImportSkippedEntry[];
  importRecord: CaptureImport;
}

interface EvidenceFindingPromotionInput {
  evidenceId: string;
  title?: string;
  severity?: Severity;
  affectedAssets?: string[];
  reproSteps?: string[];
  impact?: string;
  remediation?: string;
}

function promoteEvidenceToFinding(platform: Platform, input: EvidenceFindingPromotionInput) {
  const evidence = platform.store.state.evidence[input.evidenceId];
  if (!evidence) {
    throw new HttpError(404, `Evidence not found: ${input.evidenceId}`);
  }
  const run = platform.store.state.runs[evidence.runId];
  if (!run) {
    throw new HttpError(404, `Run not found: ${evidence.runId}`);
  }
  const review = Object.values(platform.store.state.evidenceReviews).find(
    (item) => item.runId === evidence.runId && item.evidenceId === evidence.id,
  );
  if (!review || review.status !== 'useful') {
    throw new HttpError(409, 'Evidence must be reviewed as useful before promotion to a finding');
  }
  const title = input.title || `Human-reviewed ${evidence.kind} evidence requires validation`;
  const existing = Object.values(platform.store.state.findings).find(
    (finding) =>
      finding.runId === evidence.runId &&
      finding.validationState !== 'rejected' &&
      finding.title === title &&
      finding.evidenceIds.length === 1 &&
      finding.evidenceIds[0] === evidence.id,
  );
  if (existing) {
    return existing;
  }
  const note = review.note ? ` Operator note: ${review.note}` : '';
  return platform.findings.proposeFinding({
    runId: evidence.runId,
    title,
    severity: input.severity || 'medium',
    confidence: 'needs_dynamic_confirmation',
    affectedAssets: input.affectedAssets && input.affectedAssets.length > 0 ? input.affectedAssets : [run.target],
    evidenceIds: [evidence.id],
    reproSteps:
      input.reproSteps && input.reproSteps.length > 0
        ? input.reproSteps
        : [`Review local evidence ${evidence.id} (${evidence.kind}) with SHA-256 ${evidence.sha256}.`],
    impact:
      input.impact ||
      `This candidate was promoted from operator-reviewed evidence and still requires impact validation before confirmation.${note}`,
    remediation:
      input.remediation ||
      'Validate the affected behavior, identify the root cause, and apply the appropriate product-specific remediation before marking this finding confirmed.',
  });
}

function importProgramScope(platform: Platform, input: ProgramScopeImportInput): ProgramScopeImport {
  const normalized = normalizeProgramScope(input);
  if (normalized.scopePolicy.allowedAssets.length === 0) {
    throw new HttpError(400, 'Program scope import did not contain any allowed assets');
  }
  const raw = JSON.stringify(input.content);
  const record: ProgramScopeImport = {
    id: newId('program_scope'),
    source: redactText(input.source).slice(0, 200) || 'program-scope.json',
    format: input.format,
    status: 'imported',
    inputSha256: createHash('sha256').update(raw).digest('hex'),
    allowedAssetCount: normalized.scopePolicy.allowedAssets.length,
    deniedAssetCount: normalized.scopePolicy.deniedAssets.length,
    allowedMethods: normalized.scopePolicy.allowedMethods,
    requestsPerMinute: normalized.scopePolicy.rateLimits.requestsPerMinute,
    destructiveAllowed: normalized.scopePolicy.destructiveAllowed,
    allowVaultReferencesOnly: normalized.scopePolicy.credentialRules.allowVaultReferencesOnly,
    defaultTarget: normalized.defaultTarget,
    scopePolicy: normalized.scopePolicy,
    notes: normalized.notes,
    createdAt: nowIso(),
  };
  platform.store.state.programScopeImports[record.id] = record;
  platform.store.commit();
  return record;
}

function listProgramScopeImports(platform: Platform): ProgramScopeImport[] {
  return Object.values(platform.store.state.programScopeImports).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function captureHttpExchange(platform: Platform, input: HttpExchangeCaptureInput) {
  const run = platform.store.state.runs[input.runId];
  if (!run) {
    throw new HttpError(404, `Run not found: ${input.runId}`);
  }
  const scopeDecision = evaluateScope(run.scopePolicy, input.request.target, input.request.method, 'R1');
  if (scopeDecision.action !== 'allow') {
    throw new HttpError(403, scopeDecision.reason);
  }
  const requestBody = input.request.bodyPreview ? limitPreview(redactText(input.request.bodyPreview), 4096) : undefined;
  const responseBody = input.response.bodyPreview ? limitPreview(redactText(input.response.bodyPreview), 4096) : undefined;
  return platform.evidence.addEvidence({
    runId: input.runId,
    kind: 'http_exchange',
    content: JSON.stringify({
      source: input.source,
      request: {
        method: input.request.method.toUpperCase(),
        target: redactUrl(input.request.target),
        headers: redactHeaders(input.request.headers),
        bodyPreview: requestBody?.text,
        bodyTruncated: requestBody?.truncated,
      },
      response: {
        status: input.response.status,
        statusText: input.response.statusText,
        headers: redactHeaders(input.response.headers),
        bodyPreview: responseBody?.text,
        bodyTruncated: responseBody?.truncated,
      },
      capturedAt: nowIso(),
    }),
    redactionState: 'redacted',
  });
}

function importHarCapture(platform: Platform, input: HarCaptureInput): HarImportResult {
  const run = platform.store.state.runs[input.runId];
  if (!run) {
    throw new HttpError(404, `Run not found: ${input.runId}`);
  }
  const source = safeCaptureSource(input.source);
  const raw = JSON.stringify(input.content);
  const inputSha256 = createHash('sha256').update(raw).digest('hex');
  const allEntries = harEntries(input.content);
  const entries = allEntries.slice(0, input.maxEntries);
  const evidenceIds: string[] = [];
  const skippedEntries: HarImportResult['skippedEntries'] = [];
  entries.forEach((entry, index) => {
    const request = asOptionalRecord(entry.request);
    const response = asOptionalRecord(entry.response);
    const target = harString(request.url);
    const method = harString(request.method) || 'GET';
    if (!target) {
      skippedEntries.push({ index, reason: 'HAR entry request.url is missing' });
      return;
    }
    const scopeDecision = evaluateScope(run.scopePolicy, target, method, 'R1');
    if (scopeDecision.action !== 'allow') {
      skippedEntries.push({ index, target: redactUrl(target), reason: scopeDecision.reason });
      return;
    }
    const requestBody = harString(asOptionalRecord(request.postData).text);
    const responseContent = asOptionalRecord(response.content);
    const responseBody = harString(responseContent.text);
    const requestPreview = requestBody ? limitPreview(redactText(requestBody), 4096) : undefined;
    const responsePreview = responseBody ? limitPreview(redactText(responseBody), 4096) : undefined;
    const evidence = platform.evidence.addEvidence({
      runId: input.runId,
      kind: 'http_exchange',
      content: JSON.stringify({
        source: 'har',
        sourceLabel: source,
        harEntryIndex: index,
        request: {
          method: method.toUpperCase(),
          target: redactUrl(target),
          headers: redactHeaders(harHeaders(request.headers)),
          bodyPreview: requestPreview?.text,
          bodyTruncated: requestPreview?.truncated,
        },
        response: {
          status: typeof response.status === 'number' ? response.status : undefined,
          statusText: harString(response.statusText),
          headers: redactHeaders(harHeaders(response.headers)),
          bodyPreview: responsePreview?.text,
          bodyTruncated: responsePreview?.truncated,
          contentMimeType: harString(responseContent.mimeType),
          contentEncoding: harString(responseContent.encoding),
        },
        timing: asOptionalRecord(entry.timings),
        capturedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    evidenceIds.push(evidence.id);
  });
  const importRecord: CaptureImport = {
    id: newId('capture_import'),
    runId: input.runId,
    kind: 'har',
    source,
    status: 'imported',
    inputSha256,
    totalEntries: allEntries.length,
    processedEntries: entries.length,
    imported: evidenceIds.length,
    skipped: skippedEntries.length,
    truncatedEntries: Math.max(allEntries.length - entries.length, 0),
    evidenceIds,
    skippedEntries,
    createdAt: nowIso(),
  };
  platform.store.state.captureImports[importRecord.id] = importRecord;
  platform.events.record({
    runId: input.runId,
    type: 'capture.imported',
    title: 'HAR imported',
    detail: `${importRecord.imported}/${importRecord.processedEntries} entry(s) imported, ${importRecord.skipped} skipped, ${importRecord.truncatedEntries} over limit`,
    entityId: importRecord.id,
    level: importRecord.skipped > 0 || importRecord.truncatedEntries > 0 ? 'warning' : 'info',
  });
  platform.store.commit();
  return {
    runId: input.runId,
    source: importRecord.source,
    totalEntries: importRecord.totalEntries,
    processedEntries: importRecord.processedEntries,
    imported: evidenceIds.length,
    skipped: skippedEntries.length,
    truncatedEntries: importRecord.truncatedEntries,
    evidenceIds,
    skippedEntries,
    importRecord,
  };
}

function captureBrowserSnapshot(platform: Platform, input: BrowserSnapshotCaptureInput): BrowserSnapshot {
  const run = platform.store.state.runs[input.runId];
  if (!run) {
    throw new HttpError(404, `Run not found: ${input.runId}`);
  }
  const scopeDecision = evaluateScope(run.scopePolicy, input.target, 'GET', 'R1');
  if (scopeDecision.action !== 'allow') {
    throw new HttpError(403, scopeDecision.reason);
  }

  const evidenceIds: string[] = [];
  let screenshotEvidenceId: string | undefined;
  let screenshotBytes: number | undefined;
  let screenshotContentType: string | undefined;
  let textEvidenceId: string | undefined;
  let textPreviewTruncated = false;

  if (input.screenshotBase64) {
    const screenshot = decodeScreenshotPayload(input.screenshotBase64);
    screenshotContentType = safeScreenshotContentType(input.screenshotContentType ?? screenshot.contentType);
    const evidence = platform.evidence.addEvidence({
      runId: input.runId,
      kind: 'screenshot',
      content: screenshot.buffer,
      redactionState: 'raw_local_only',
    });
    screenshotEvidenceId = evidence.id;
    screenshotBytes = screenshot.buffer.byteLength;
    evidenceIds.push(evidence.id);
  }

  if (input.textPreview) {
    const textPreview = limitPreview(redactText(input.textPreview), 20_000);
    textPreviewTruncated = textPreview.truncated;
    const evidence = platform.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        source: input.source,
        captureType: 'browser_page_snapshot',
        target: redactUrl(input.target),
        title: input.title ? limitPreview(redactText(input.title), 240).text : undefined,
        textPreview: textPreview.text,
        textPreviewTruncated,
        capturedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    textEvidenceId = evidence.id;
    evidenceIds.push(evidence.id);
  }

  const snapshot: BrowserSnapshot = {
    id: newId('browser_snapshot'),
    runId: input.runId,
    source: input.source,
    target: redactUrl(input.target),
    title: input.title ? limitPreview(redactText(input.title), 240).text : undefined,
    screenshotEvidenceId,
    textEvidenceId,
    evidenceIds,
    screenshotBytes,
    screenshotContentType,
    textPreviewTruncated,
    createdAt: nowIso(),
  };
  platform.store.state.browserSnapshots[snapshot.id] = snapshot;
  platform.events.record({
    runId: input.runId,
    type: 'browser.snapshot.captured',
    title: 'Browser snapshot captured',
    detail: `${redactUrl(input.target)} - ${evidenceIds.length} evidence item(s)`,
    entityId: snapshot.id,
  });
  platform.store.commit();
  return snapshot;
}

function listCaptureImports(platform: Platform, runId: string): CaptureImport[] {
  return Object.values(platform.store.state.captureImports)
    .filter((item) => item.runId === runId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function listBrowserSnapshots(platform: Platform, runId: string): BrowserSnapshot[] {
  return Object.values(platform.store.state.browserSnapshots)
    .filter((item) => item.runId === runId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function validateProgramScopeImport(input: unknown): ProgramScopeImportInput {
  const object = asRecord(input, 'request body');
  let content = object.content;
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      throw new HttpError(400, 'Program scope content must be valid JSON');
    }
  }
  const allowedMethods =
    object.allowedMethods === undefined ? undefined : stringArray(object.allowedMethods, 'allowedMethods');
  const requestsPerMinute =
    object.requestsPerMinute === undefined ? undefined : positiveInteger(object.requestsPerMinute, 'requestsPerMinute');
  return {
    source: optionalString(object.source, 'source') ?? 'program-scope.json',
    format: validateProgramScopeImportFormat(object.format),
    content: asRecord(content, 'content'),
    allowedMethods,
    requestsPerMinute,
    destructiveAllowed:
      object.destructiveAllowed === undefined ? undefined : booleanValue(object.destructiveAllowed, 'destructiveAllowed'),
    allowVaultReferencesOnly:
      object.allowVaultReferencesOnly === undefined
        ? undefined
        : booleanValue(object.allowVaultReferencesOnly, 'allowVaultReferencesOnly'),
  };
}

function validateCreateRun(input: unknown): CreateRunInput {
  const object = asRecord(input, 'request body');
  const target = requiredString(object.target, 'target');
  const goal = requiredString(object.goal, 'goal');
  const scopePolicy = validateScopePolicy(object.scopePolicy);
  const workerPool = validateWorkerPool(object.workerPool);
  return { target, goal, scopePolicy, workerPool };
}

function validateHint(input: unknown): { text: string } {
  const object = asRecord(input, 'request body');
  return { text: requiredString(object.text, 'text') };
}

function validateToolInvoke(runId: string, input: unknown): ToolInvokeInput {
  const object = asRecord(input, 'request body');
  return {
    runId,
    tool: requiredString(object.tool, 'tool'),
    target: requiredString(object.target, 'target'),
    method: requiredString(object.method, 'method'),
    riskLevel: validateRiskLevel(object.riskLevel),
    args: object.args === undefined ? {} : asRecord(object.args, 'args'),
    approvalId: optionalString(object.approvalId, 'approvalId'),
  };
}

function validateToolPackRequest(input: unknown): { target?: string } {
  const object = asRecord(input, 'request body');
  return { target: optionalString(object.target, 'target') };
}

function validateToolboxBundleRegistration(input: unknown): RegisterToolboxBundleInput {
  const object = asRecord(input, 'request body');
  for (const forbidden of ['command', 'commands', 'args', 'payload', 'payloads', 'rawTools']) {
    if (object[forbidden] !== undefined) {
      throw new HttpError(400, `${forbidden} is not accepted in toolbox bundle manifests`);
    }
  }
  return {
    id: requiredString(object.id, 'id'),
    name: requiredString(object.name, 'name'),
    version: requiredString(object.version, 'version'),
    status: object.status === undefined ? undefined : validateToolboxBundleStatus(object.status),
    profileIds: stringArray(object.profileIds, 'profileIds'),
    engines: stringArray(object.engines, 'engines'),
    templateIds: stringArray(object.templateIds, 'templateIds'),
    riskLevels: stringArray(object.riskLevels, 'riskLevels').map((risk) => validateRiskLevel(risk)),
    safetyNotes: stringArray(object.safetyNotes, 'safetyNotes'),
    installationNotes: stringArray(object.installationNotes, 'installationNotes'),
    commercialUseCases: stringArray(object.commercialUseCases, 'commercialUseCases'),
    registeredBy: optionalString(object.registeredBy, 'registeredBy'),
  };
}

function validateConnectorRegistration(input: unknown): RegisterConnectorInput {
  assertConnectorManifestSafe(input);
  const object = asRecord(input, 'request body');
  return {
    id: requiredString(object.id, 'id'),
    name: requiredString(object.name, 'name'),
    version: requiredString(object.version, 'version'),
    kind: validateConnectorKind(object.kind),
    status: object.status === undefined ? undefined : validateConnectorStatus(object.status),
    toolNames: stringArray(object.toolNames, 'toolNames'),
    riskLevels: stringArray(object.riskLevels, 'riskLevels').map((risk) => validateRiskLevel(risk)),
    inputKinds: stringArray(object.inputKinds, 'inputKinds'),
    evidenceKinds: stringArray(object.evidenceKinds, 'evidenceKinds').map((kind) => validateEvidenceKind(kind)),
    requiredEnv: stringArray(object.requiredEnv, 'requiredEnv'),
    safetyNotes: stringArray(object.safetyNotes, 'safetyNotes'),
    installationNotes: stringArray(object.installationNotes, 'installationNotes'),
    commercialUseCases: stringArray(object.commercialUseCases, 'commercialUseCases'),
    registeredBy: optionalString(object.registeredBy, 'registeredBy'),
  };
}

function validateHttpExchangeCapture(runId: string, input: unknown): HttpExchangeCaptureInput {
  const object = asRecord(input, 'request body');
  const request = asRecord(object.request, 'request');
  const response = object.response === undefined ? {} : asRecord(object.response, 'response');
  return {
    runId,
    source: validateCaptureSource(object.source),
    request: {
      method: requiredString(request.method, 'request.method').toUpperCase(),
      target: requiredString(request.target, 'request.target'),
      headers: request.headers === undefined ? {} : stringRecord(request.headers, 'request.headers'),
      bodyPreview: optionalString(request.bodyPreview, 'request.bodyPreview'),
    },
    response: {
      status: response.status === undefined ? undefined : statusCode(response.status, 'response.status'),
      statusText: optionalString(response.statusText, 'response.statusText'),
      headers: response.headers === undefined ? {} : stringRecord(response.headers, 'response.headers'),
      bodyPreview: optionalString(response.bodyPreview, 'response.bodyPreview'),
    },
  };
}

function validateHarCapture(runId: string, input: unknown): HarCaptureInput {
  const object = asRecord(input, 'request body');
  const source = optionalString(object.source, 'source') ?? 'browser.har';
  const maxEntries =
    object.maxEntries === undefined ? 100 : Math.min(Math.max(positiveInteger(object.maxEntries, 'maxEntries'), 1), 200);
  let content = object.content;
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      throw new HttpError(400, 'HAR content must be valid JSON');
    }
  }
  return { runId, source, content: asRecord(content, 'content'), maxEntries };
}

function validateBrowserSnapshotCapture(runId: string, input: unknown): BrowserSnapshotCaptureInput {
  const object = asRecord(input, 'request body');
  const screenshotBase64 =
    optionalString(object.screenshotBase64, 'screenshotBase64') ??
    optionalString(object.screenshotDataUrl, 'screenshotDataUrl');
  const textPreview =
    optionalString(object.textPreview, 'textPreview') ??
    optionalString(object.domText, 'domText') ??
    optionalString(object.domPreview, 'domPreview');
  if (!screenshotBase64 && !textPreview) {
    throw new HttpError(400, 'screenshotBase64 or textPreview is required');
  }
  if (textPreview && Buffer.byteLength(textPreview, 'utf8') > 1_000_000) {
    throw new HttpError(413, 'textPreview is too large');
  }
  return {
    runId,
    source: validateBrowserSnapshotSource(object.source),
    target: requiredString(object.target, 'target'),
    title: optionalString(object.title, 'title'),
    screenshotBase64,
    screenshotContentType: optionalString(object.screenshotContentType, 'screenshotContentType'),
    textPreview,
  };
}

function validateBrowserSessionStart(input: unknown): { startUrl?: string } {
  const object = asRecord(input, 'request body');
  return { startUrl: optionalString(object.startUrl, 'startUrl') };
}

function validateBrowserNavigate(input: unknown): {
  target: string;
  method: string;
  headers: Record<string, string>;
  timeoutMs?: number;
} {
  const object = asRecord(input, 'request body');
  return {
    target: requiredString(object.target, 'target'),
    method: object.method === undefined ? 'GET' : requiredString(object.method, 'method').toUpperCase(),
    headers: object.headers === undefined ? {} : stringRecord(object.headers, 'headers'),
    timeoutMs: object.timeoutMs === undefined ? undefined : positiveInteger(object.timeoutMs, 'timeoutMs'),
  };
}

function validateCredentialReferenceCreate(runId: string, input: unknown): {
  runId: string;
  label: string;
  role: string;
  kind: CredentialReferenceKind;
  placeholder: string;
  allowedUse: string[];
} {
  const object = asRecord(input, 'request body');
  return {
    runId,
    label: requiredString(object.label, 'label'),
    role: requiredString(object.role, 'role'),
    kind: validateCredentialReferenceKind(object.kind),
    placeholder: requiredString(object.placeholder, 'placeholder'),
    allowedUse: stringArray(object.allowedUse, 'allowedUse'),
  };
}

function validateCredentialReferenceKind(input: unknown): CredentialReferenceKind {
  if (
    input !== 'vault_reference' &&
    input !== 'header_placeholder' &&
    input !== 'cookie_placeholder' &&
    input !== 'account_note'
  ) {
    throw new HttpError(400, 'kind must be vault_reference, header_placeholder, cookie_placeholder, or account_note');
  }
  return input;
}

function validateAccessReviewCreate(runId: string, input: unknown): {
  runId: string;
  title: string;
  target: string;
  method: string;
  baselineCredentialId?: string;
  comparisonCredentialId?: string;
} {
  const object = asRecord(input, 'request body');
  return {
    runId,
    title: requiredString(object.title, 'title'),
    target: requiredString(object.target, 'target'),
    method: object.method === undefined ? 'GET' : requiredString(object.method, 'method'),
    baselineCredentialId: optionalString(object.baselineCredentialId, 'baselineCredentialId'),
    comparisonCredentialId: optionalString(object.comparisonCredentialId, 'comparisonCredentialId'),
  };
}

function validateAccessReviewCompare(runId: string, input: unknown): {
  runId: string;
  title: string;
  target: string;
  method: string;
  baselineCredentialId?: string;
  comparisonCredentialId?: string;
  baselineEvidenceId: string;
  comparisonEvidenceId: string;
} {
  const object = asRecord(input, 'request body');
  return {
    ...validateAccessReviewCreate(runId, object),
    baselineEvidenceId: requiredString(object.baselineEvidenceId, 'baselineEvidenceId'),
    comparisonEvidenceId: requiredString(object.comparisonEvidenceId, 'comparisonEvidenceId'),
  };
}

function validateAccessReviewEvidence(input: unknown): { side: AccessReviewSide; evidenceId: string } {
  const object = asRecord(input, 'request body');
  return {
    side: validateAccessReviewSide(object.side),
    evidenceId: requiredString(object.evidenceId, 'evidenceId'),
  };
}

function validateSarifImport(runId: string, input: unknown): {
  runId: string;
  source?: string;
  content: unknown;
  createFindings: boolean;
} {
  const object = asRecord(input, 'request body');
  if (object.content === undefined) {
    throw new HttpError(400, 'content is required');
  }
  return {
    runId,
    source: optionalString(object.source, 'source'),
    content: object.content,
    createFindings: object.createFindings === undefined ? true : booleanValue(object.createFindings, 'createFindings'),
  };
}

function validateAndroidManifestImport(runId: string, input: unknown): {
  runId: string;
  source?: string;
  content: string;
  createFindings: boolean;
} {
  const object = asRecord(input, 'request body');
  const content = requiredString(object.content, 'content');
  if (Buffer.byteLength(content, 'utf8') > 1_000_000) {
    throw new HttpError(413, 'Android Manifest content is too large');
  }
  return {
    runId,
    source: optionalString(object.source, 'source'),
    content,
    createFindings: object.createFindings === undefined ? true : booleanValue(object.createFindings, 'createFindings'),
  };
}

function validateCloudIamImport(runId: string, input: unknown): {
  runId: string;
  source?: string;
  provider: CloudProvider;
  content: unknown;
  createFindings: boolean;
} {
  const object = asRecord(input, 'request body');
  if (object.content === undefined) {
    throw new HttpError(400, 'content is required');
  }
  const raw = typeof object.content === 'string' ? object.content : JSON.stringify(object.content);
  if (Buffer.byteLength(raw, 'utf8') > 1_000_000) {
    throw new HttpError(413, 'Cloud IAM policy content is too large');
  }
  return {
    runId,
    source: optionalString(object.source, 'source'),
    provider: validateCloudProvider(object.provider),
    content: object.content,
    createFindings: object.createFindings === undefined ? true : booleanValue(object.createFindings, 'createFindings'),
  };
}

function validateIdentityGraphImport(runId: string, input: unknown): {
  runId: string;
  source?: string;
  provider: IdentityGraphProvider;
  content: unknown;
  createFindings: boolean;
} {
  const object = asRecord(input, 'request body');
  if (object.content === undefined) {
    throw new HttpError(400, 'content is required');
  }
  const raw = typeof object.content === 'string' ? object.content : JSON.stringify(object.content);
  if (Buffer.byteLength(raw, 'utf8') > 1_000_000) {
    throw new HttpError(413, 'Identity graph content is too large');
  }
  return {
    runId,
    source: optionalString(object.source, 'source'),
    provider: validateIdentityGraphProvider(object.provider),
    content: object.content,
    createFindings: object.createFindings === undefined ? true : booleanValue(object.createFindings, 'createFindings'),
  };
}

function validateEvidenceReview(evidenceId: string, input: unknown): {
  evidenceId: string;
  status: EvidenceReviewStatus;
  note?: string;
  reviewer?: string;
} {
  const object = asRecord(input, 'request body');
  return {
    evidenceId,
    status: validateEvidenceReviewStatus(object.status),
    note: optionalString(object.note, 'note'),
    reviewer: optionalString(object.reviewer, 'reviewer'),
  };
}

function validateEvidenceFindingPromotion(evidenceId: string, input: unknown): EvidenceFindingPromotionInput {
  const object = asRecord(input, 'request body');
  return {
    evidenceId,
    title: optionalString(object.title, 'title'),
    severity: object.severity === undefined ? undefined : validateSeverity(object.severity),
    affectedAssets: object.affectedAssets === undefined ? undefined : stringArray(object.affectedAssets, 'affectedAssets'),
    reproSteps: object.reproSteps === undefined ? undefined : stringArray(object.reproSteps, 'reproSteps'),
    impact: optionalString(object.impact, 'impact'),
    remediation: optionalString(object.remediation, 'remediation'),
  };
}

function validateEvidenceReplayRequest(input: unknown): { timeoutMs?: number } {
  const object = asRecord(input, 'request body');
  return {
    timeoutMs: object.timeoutMs === undefined ? undefined : positiveInteger(object.timeoutMs, 'timeoutMs'),
  };
}

function validateAccessReviewSide(input: unknown): AccessReviewSide {
  if (input !== 'baseline' && input !== 'comparison') {
    throw new HttpError(400, 'side must be baseline or comparison');
  }
  return input;
}

function validateEvidenceReviewStatus(input: unknown): EvidenceReviewStatus {
  if (input !== 'useful' && input !== 'not_relevant' && input !== 'needs_more_context') {
    throw new HttpError(400, 'status must be useful, not_relevant, or needs_more_context');
  }
  return input;
}

function validateEvidenceImport(runId: string, input: unknown): {
  runId: string;
  kind: EvidenceKind;
  content: string;
  redactionState: RedactionState;
  toolCallId?: string;
  cloudUri?: string;
} {
  const object = asRecord(input, 'request body');
  if (object.content === undefined) {
    throw new HttpError(400, 'content is required');
  }
  return {
    runId,
    kind: validateEvidenceKind(object.kind),
    content: typeof object.content === 'string' ? object.content : JSON.stringify(object.content),
    redactionState: validateRedactionState(object.redactionState),
    toolCallId: optionalString(object.toolCallId, 'toolCallId'),
    cloudUri: optionalString(object.cloudUri, 'cloudUri'),
  };
}

function validateProposeFinding(runId: string, input: unknown) {
  const object = asRecord(input, 'request body');
  return {
    runId,
    title: requiredString(object.title, 'title'),
    severity: validateSeverity(object.severity),
    confidence: validateConfidence(object.confidence),
    affectedAssets: stringArray(object.affectedAssets, 'affectedAssets'),
    evidenceIds: stringArray(object.evidenceIds, 'evidenceIds'),
    reproSteps: stringArray(object.reproSteps, 'reproSteps'),
    impact: requiredString(object.impact, 'impact'),
    remediation: requiredString(object.remediation, 'remediation'),
  };
}

function validateRiskLevel(input: unknown): RiskLevel {
  if (input !== 'R0' && input !== 'R1' && input !== 'R2' && input !== 'R3' && input !== 'R4') {
    throw new HttpError(400, 'riskLevel must be R0, R1, R2, R3, or R4');
  }
  return input;
}

function validateWorkerEnvelopePreviewTask(input: unknown): WorkerEnvelopePreviewTask {
  if (input === 'auto' || input === 'bootstrap' || input === 'reason' || input === 'explore') {
    return input;
  }
  throw new HttpError(400, 'task must be auto, bootstrap, reason, or explore');
}

function validateToolboxBundleStatus(input: unknown): RegisterToolboxBundleInput['status'] {
  if (input !== 'available' && input !== 'partial' && input !== 'planned' && input !== 'unavailable') {
    throw new HttpError(400, 'status must be available, partial, planned, or unavailable');
  }
  return input;
}

function validateConnectorKind(input: unknown): RegisterConnectorInput['kind'] {
  if (input !== 'mcp' && input !== 'cli' && input !== 'http_api' && input !== 'container') {
    throw new HttpError(400, 'kind must be mcp, cli, http_api, or container');
  }
  return input;
}

function validateConnectorStatus(input: unknown): RegisterConnectorInput['status'] {
  if (input !== 'available' && input !== 'partial' && input !== 'planned' && input !== 'disabled') {
    throw new HttpError(400, 'status must be available, partial, planned, or disabled');
  }
  return input;
}

function assertConnectorManifestSafe(input: unknown, path = 'manifest'): void {
  if (!input || typeof input !== 'object') {
    return;
  }
  if (Array.isArray(input)) {
    input.forEach((item, index) => assertConnectorManifestSafe(item, `${path}[${index}]`));
    return;
  }
  const forbidden = new Set([
    'command',
    'commands',
    'args',
    'payload',
    'payloads',
    'rawtool',
    'rawtools',
    'secret',
    'secrets',
    'credential',
    'credentials',
    'token',
    'tokens',
    'password',
    'apikey',
    'api_key',
    'authorization',
    'headers',
    'endpoint',
    'endpoints',
    'baseurl',
  ]);
  for (const [key, value] of Object.entries(input)) {
    if (forbidden.has(key.toLowerCase())) {
      throw new HttpError(400, `${path}.${key} is not accepted in connector manifests`);
    }
    assertConnectorManifestSafe(value, `${path}.${key}`);
  }
}

function validateCaptureSource(input: unknown): 'browser' | 'proxy' | 'manual' {
  if (input !== 'browser' && input !== 'proxy' && input !== 'manual') {
    throw new HttpError(400, 'source must be browser, proxy, or manual');
  }
  return input;
}

function validateBrowserSnapshotSource(input: unknown): BrowserSnapshotSource {
  if (input === undefined) {
    return 'manual';
  }
  if (input !== 'browser' && input !== 'desktop' && input !== 'manual') {
    throw new HttpError(400, 'source must be browser, desktop, or manual');
  }
  return input;
}

function validateProgramScopeImportFormat(input: unknown): ProgramScopeImportFormat {
  if (
    input !== 'hackerone' &&
    input !== 'bugcrowd' &&
    input !== 'src' &&
    input !== 'enterprise' &&
    input !== 'generic_json'
  ) {
    throw new HttpError(400, 'format must be hackerone, bugcrowd, src, enterprise, or generic_json');
  }
  return input;
}

function validateCloudProvider(input: unknown): CloudProvider {
  if (input === undefined) {
    return 'aws';
  }
  if (input !== 'aws' && input !== 'generic') {
    throw new HttpError(400, 'provider must be aws or generic');
  }
  return input;
}

function validateIdentityGraphProvider(input: unknown): IdentityGraphProvider {
  if (input === undefined) {
    return 'bloodhound';
  }
  if (input !== 'bloodhound' && input !== 'generic') {
    throw new HttpError(400, 'provider must be bloodhound or generic');
  }
  return input;
}

function validateLocalRunnerWorkbenchPrepare(input: unknown): {
  includeBrowser?: boolean;
  includeProxy?: boolean;
  includeOast?: boolean;
} {
  const object = asRecord(input, 'request body');
  return {
    includeBrowser: optionalBoolean(object.includeBrowser, 'includeBrowser'),
    includeProxy: optionalBoolean(object.includeProxy, 'includeProxy'),
    includeOast: optionalBoolean(object.includeOast, 'includeOast'),
  };
}

function validateEvidenceKind(input: unknown): EvidenceKind {
  if (
    input !== 'http_exchange' &&
    input !== 'screenshot' &&
    input !== 'command_output' &&
    input !== 'oast_callback' &&
    input !== 'file_hash' &&
    input !== 'replay_bundle'
  ) {
    throw new HttpError(400, 'kind is invalid');
  }
  return input;
}

function validateRedactionState(input: unknown): RedactionState {
  if (input !== 'raw_local_only' && input !== 'redacted' && input !== 'safe_for_cloud') {
    throw new HttpError(400, 'redactionState is invalid');
  }
  return input;
}

function validateSeverity(input: unknown): Severity {
  if (input !== 'critical' && input !== 'high' && input !== 'medium' && input !== 'low' && input !== 'info') {
    throw new HttpError(400, 'severity is invalid');
  }
  return input;
}

function validateConfidence(input: unknown): Confidence {
  if (input !== 'confirmed' && input !== 'likely' && input !== 'needs_dynamic_confirmation') {
    throw new HttpError(400, 'confidence is invalid');
  }
  return input;
}

function validateApprovalDecision(input: unknown): { status: 'approved' | 'rejected' } {
  const object = asRecord(input, 'request body');
  if (object.status !== 'approved' && object.status !== 'rejected') {
    throw new HttpError(400, 'status must be approved or rejected');
  }
  return { status: object.status };
}

function validateFindingValidation(input: unknown): { validationState: ValidationState; note?: string; reviewer?: string } {
  const object = asRecord(input, 'request body');
  const validationState = object.validationState;
  if (validationState !== 'candidate' && validationState !== 'confirmed' && validationState !== 'rejected') {
    throw new HttpError(400, 'validationState must be candidate, confirmed, or rejected');
  }
  return {
    validationState,
    note: optionalString(object.note, 'note'),
    reviewer: optionalString(object.reviewer, 'reviewer'),
  };
}

function validateIntentHeartbeat(input: unknown): { leaseId: string; leaseMs: number } {
  const object = asRecord(input, 'request body');
  const leaseMs = object.leaseMs === undefined ? 5 * 60_000 : positiveInteger(object.leaseMs, 'leaseMs');
  if (leaseMs > 30 * 60_000) {
    throw new HttpError(400, 'leaseMs must be at most 1800000');
  }
  return { leaseId: requiredString(object.leaseId, 'leaseId'), leaseMs };
}

function validateReportRequest(input: unknown): {
  runId: string;
  format: 'hackerone' | 'bugcrowd' | 'src' | 'enterprise';
  findingScope?: ReportFindingScope;
} {
  const object = asRecord(input, 'request body');
  const format = object.format;
  if (format !== 'hackerone' && format !== 'bugcrowd' && format !== 'src' && format !== 'enterprise') {
    throw new HttpError(400, 'format must be hackerone, bugcrowd, src, or enterprise');
  }
  return {
    runId: requiredString(object.runId, 'runId'),
    format,
    findingScope: object.findingScope === undefined ? undefined : validateReportFindingScope(object.findingScope),
  };
}

function validateRunExportRequest(runId: string, input: unknown): {
  runId: string;
  findingScope?: ReportFindingScope;
  includeEvidenceContent?: boolean;
} {
  const object = asRecord(input, 'request body');
  return {
    runId,
    findingScope: object.findingScope === undefined ? undefined : validateReportFindingScope(object.findingScope),
    includeEvidenceContent:
      object.includeEvidenceContent === undefined
        ? undefined
        : booleanValue(object.includeEvidenceContent, 'includeEvidenceContent'),
  };
}

function validateReportFindingScope(input: unknown): ReportFindingScope {
  if (input !== 'confirmed_only' && input !== 'candidate_and_confirmed') {
    throw new HttpError(400, 'findingScope must be confirmed_only or candidate_and_confirmed');
  }
  return input;
}

function validateScopePolicy(input: unknown): ScopePolicy {
  const object = asRecord(input, 'scopePolicy');
  const credentialRules = asRecord(object.credentialRules, 'scopePolicy.credentialRules');
  const rateLimits = asRecord(object.rateLimits, 'scopePolicy.rateLimits');
  if (typeof object.destructiveAllowed !== 'boolean') {
    throw new HttpError(400, 'scopePolicy.destructiveAllowed must be boolean');
  }
  if (typeof credentialRules.allowVaultReferencesOnly !== 'boolean') {
    throw new HttpError(400, 'scopePolicy.credentialRules.allowVaultReferencesOnly must be boolean');
  }
  if (typeof rateLimits.requestsPerMinute !== 'number' || rateLimits.requestsPerMinute <= 0) {
    throw new HttpError(400, 'scopePolicy.rateLimits.requestsPerMinute must be a positive number');
  }
  return {
    allowedAssets: stringArray(object.allowedAssets, 'scopePolicy.allowedAssets'),
    deniedAssets: stringArray(object.deniedAssets, 'scopePolicy.deniedAssets'),
    allowedMethods: stringArray(object.allowedMethods, 'scopePolicy.allowedMethods'),
    destructiveAllowed: object.destructiveAllowed,
    credentialRules: { allowVaultReferencesOnly: credentialRules.allowVaultReferencesOnly },
    rateLimits: { requestsPerMinute: rateLimits.requestsPerMinute },
  };
}

function validateWorkerPool(input: unknown): WorkerConfig[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new HttpError(400, 'workerPool must be a non-empty array');
  }
  return input.map((item, index) => {
    const object = asRecord(item, `workerPool[${index}]`);
    const type = object.type;
    if (type !== 'mock' && type !== 'claude' && type !== 'codex' && type !== 'gemini' && type !== 'kimi') {
      throw new HttpError(400, `workerPool[${index}].type is invalid`);
    }
    return {
      name: requiredString(object.name, `workerPool[${index}].name`),
      type,
      maxRunning: positiveInteger(object.maxRunning, `workerPool[${index}].maxRunning`),
      priority: nonNegativeInteger(object.priority, `workerPool[${index}].priority`),
      command: optionalString(object.command, `workerPool[${index}].command`),
      args: object.args === undefined ? undefined : stringArray(object.args, `workerPool[${index}].args`),
      env: object.env === undefined ? undefined : workerEnvRecord(object.env, `workerPool[${index}].env`),
      timeoutMs: object.timeoutMs === undefined ? undefined : positiveInteger(object.timeoutMs, `workerPool[${index}].timeoutMs`),
    };
  });
}

function workerEnvRecord(input: unknown, name: string): Record<string, string> {
  const env = stringRecord(input, name);
  for (const [key, value] of Object.entries(env)) {
    if (isSensitiveWorkerEnv(key) && value.trim().length > 0) {
      throw new HttpError(
        400,
        `${name}.${key} must not contain secret material; set it in the server process environment instead`,
      );
    }
  }
  return env;
}

function isSensitiveWorkerEnv(name: string): boolean {
  return /(?:^|_)(?:api[_-]?key|token|secret|password|passwd|authorization|cookie|jwt|credential)(?:$|_)/i.test(name);
}

function harEntries(content: Record<string, unknown>): Array<Record<string, unknown>> {
  const log = asOptionalRecord(content.log);
  const entries = log.entries;
  if (!Array.isArray(entries)) {
    throw new HttpError(400, 'HAR content.log.entries must be an array');
  }
  return entries.map((entry, index) => asRecord(entry, `content.log.entries[${index}]`));
}

function asOptionalRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function harString(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim().length > 0 ? input : undefined;
}

function safeCaptureSource(input: string): string {
  return redactText(input).slice(0, 200) || 'browser.har';
}

function harHeaders(input: unknown): Record<string, string> {
  if (!Array.isArray(input)) {
    return {};
  }
  const headers: Record<string, string> = {};
  for (const header of input) {
    const item = asOptionalRecord(header);
    const name = harString(item.name);
    const value = harString(item.value);
    if (name && value) {
      headers[name] = value;
    }
  }
  return headers;
}

function decodeScreenshotPayload(input: string): { buffer: Buffer; contentType?: string } {
  const trimmed = input.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;,]+);base64,(.*)$/i);
  const contentType = dataUrlMatch ? dataUrlMatch[1] : undefined;
  const encoded = (dataUrlMatch ? dataUrlMatch[2] : trimmed).replace(/\s+/g, '');
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new HttpError(400, 'screenshotBase64 must be valid base64 or a data URL');
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.byteLength === 0) {
    throw new HttpError(400, 'screenshotBase64 must not be empty');
  }
  if (buffer.byteLength > 2_000_000) {
    throw new HttpError(413, 'screenshotBase64 is too large');
  }
  return { buffer, contentType };
}

function safeScreenshotContentType(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }
  const normalized = input.trim().toLowerCase();
  if (normalized === 'image/png' || normalized === 'image/jpeg' || normalized === 'image/webp') {
    return normalized;
  }
  return undefined;
}

function asRecord(input: unknown, name: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, `${name} must be an object`);
  }
  return input as Record<string, unknown>;
}

function requiredString(input: unknown, name: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new HttpError(400, `${name} must be a non-empty string`);
  }
  return input;
}

function optionalString(input: unknown, name: string): string | undefined {
  if (input === undefined) {
    return undefined;
  }
  return requiredString(input, name);
}

function optionalBoolean(input: unknown, name: string): boolean | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (typeof input !== 'boolean') {
    throw new HttpError(400, `${name} must be a boolean`);
  }
  return input;
}

function stringArray(input: unknown, name: string): string[] {
  if (!Array.isArray(input) || input.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new HttpError(400, `${name} must be an array of non-empty strings`);
  }
  return input;
}

function stringRecord(input: unknown, name: string): Record<string, string> {
  const object = asRecord(input, name);
  for (const [key, value] of Object.entries(object)) {
    if (typeof value !== 'string') {
      throw new HttpError(400, `${name}.${key} must be a string`);
    }
  }
  return object as Record<string, string>;
}

function booleanValue(input: unknown, name: string): boolean {
  if (typeof input !== 'boolean') {
    throw new HttpError(400, `${name} must be boolean`);
  }
  return input;
}

function positiveInteger(input: unknown, name: string): number {
  if (!Number.isInteger(input) || Number(input) <= 0) {
    throw new HttpError(400, `${name} must be a positive integer`);
  }
  return Number(input);
}

function nonNegativeInteger(input: unknown, name: string): number {
  if (!Number.isInteger(input) || Number(input) < 0) {
    throw new HttpError(400, `${name} must be a non-negative integer`);
  }
  return Number(input);
}

function statusCode(input: unknown, name: string): number {
  if (!Number.isInteger(input) || Number(input) < 100 || Number(input) > 599) {
    throw new HttpError(400, `${name} must be an HTTP status code`);
  }
  return Number(input);
}

function limitPreview(value: string, maxLength: number): { text: string; truncated: boolean } {
  return { text: value.slice(0, maxLength), truncated: value.length > maxLength };
}
