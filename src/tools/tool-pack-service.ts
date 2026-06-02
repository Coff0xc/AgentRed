import { newId, nowIso } from '../domain/ids.js';
import type { RiskLevel, ToolPackRun, ToolPackRunItem, ToolPackRunStatus } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import { redactUrl } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';
import type { ToolInvokeInput, ToolInvokeResult, ToolPlanPreview } from './tool-gateway.js';
import { ToolGateway } from './tool-gateway.js';

export type ToolPackCategory = 'web' | 'network' | 'commercial';

export interface ToolPackRequest {
  id: string;
  title: string;
  tool: string;
  method: string;
  riskLevel: RiskLevel;
  args: Record<string, unknown>;
  target: 'run.target';
  evidenceGoal: string;
}

export interface ToolPack {
  id: string;
  name: string;
  description: string;
  category: ToolPackCategory;
  requests: ToolPackRequest[];
  safetyNotes: string[];
  commercialUseCases: string[];
}

export interface ToolPackPlanItem {
  request: ToolPackRequest;
  preview: ToolPlanPreview;
}

export interface ToolPackPlan {
  generatedAt: string;
  runId: string;
  pack: ToolPack;
  target: string;
  items: ToolPackPlanItem[];
  summary: {
    total: number;
    executable: number;
    blocked: number;
    approvalRequired: number;
  };
  audit: {
    previewWritesState: false;
    invokesTools: false;
    writesEvidence: false;
  };
}

export interface ToolPackInvokeResult {
  pack: ToolPack;
  runRecord: ToolPackRun;
}

const TOOL_PACKS: ToolPack[] = [
  {
    id: 'pack.web.baseline',
    name: 'Web Baseline Evidence Pack',
    description: 'Collect a bounded first-pass web evidence set through built-in templates.',
    category: 'web',
    requests: [
      scannerRequest('web.technology_fingerprint', 'Technology fingerprint', 'R1', 'Collect response and platform hints.'),
      scannerRequest('web.cookie_flags', 'Cookie flag review', 'R1', 'Inspect Set-Cookie security attributes without storing values.'),
      scannerRequest('web.link_form_map', 'Link and form map', 'R1', 'Map bounded same-origin links and form actions.'),
      scannerRequest('web.security_headers', 'Security headers', 'R2', 'Record missing browser security headers.'),
      scannerRequest('web.endpoint_discovery', 'Well-known endpoint discovery', 'R2', 'Check robots, security.txt, sitemap, and well-known paths.'),
    ],
    safetyNotes: [
      'Every step is a high-level Tool Gateway request.',
      'No raw tool command is exposed to Agent Workers.',
      'Each request is scope checked, rate limited, audited, and redacted independently.',
      'The pack does not submit forms, brute force paths, or perform exploit validation.',
    ],
    commercialUseCases: ['Bug bounty kickoff', 'SRC baseline evidence collection', 'operator-reviewed web triage'],
  },
  {
    id: 'pack.network.baseline',
    name: 'Network Metadata Evidence Pack',
    description: 'Collect passive DNS and TLS metadata for the in-scope target host.',
    category: 'network',
    requests: [
      scannerRequest('network.dns_records', 'DNS records snapshot', 'R0', 'Resolve bounded public DNS metadata.'),
      scannerRequest('network.tls_certificate', 'TLS certificate snapshot', 'R1', 'Capture certificate metadata from one handshake.'),
    ],
    safetyNotes: [
      'No port scanning, packet capture, zone transfer, or TLS interception.',
      'Built-in templates run inside the local platform process.',
      'The same scope and evidence rules apply as individual scanner template runs.',
    ],
    commercialUseCases: ['External surface inventory', 'report context evidence', 'low-risk scope sanity check'],
  },
  {
    id: 'pack.web.client-surface',
    name: 'Web Client-Side Surface Pack',
    description: 'Collect CORS, CSP, and JavaScript asset inventory evidence through built-in low-risk templates.',
    category: 'web',
    requests: [
      scannerRequest('web.cors_policy', 'CORS policy review', 'R1', 'Record CORS headers and permissive-origin signals.'),
      scannerRequest('web.csp_analysis', 'CSP and browser policy analysis', 'R1', 'Summarize CSP, frame, MIME, referrer, and permissions-policy hardening.'),
      scannerRequest('web.js_asset_inventory', 'JavaScript asset inventory', 'R1', 'List bounded script assets and source-map hints without fetching JS files.'),
    ],
    safetyNotes: [
      'Every step is a bounded built-in scanner template.',
      'No JavaScript is executed and no script assets or source maps are downloaded.',
      'The CORS check sends a synthetic Origin header only; it never sends credentials.',
      'All output is redacted command_output evidence behind Tool Gateway policy.',
    ],
    commercialUseCases: ['Modern web client-side exposure review', 'Bug bounty triage', 'SRC browser-policy evidence collection'],
  },
  {
    id: 'pack.web.modern-surface',
    name: 'Modern Web Exposure Pack',
    description: 'Collect security.txt, cookie scope, WebSocket planning, and source-map exposure evidence through safe built-in templates.',
    category: 'web',
    requests: [
      scannerRequest('web.security_txt_policy', 'Security.txt policy review', 'R1', 'Summarize security contact, policy, encryption, and expiry metadata.'),
      scannerRequest('web.cookie_scope_analysis', 'Cookie scope analysis', 'R1', 'Inspect cookie domain/path/prefix/lifetime metadata without values.'),
      scannerRequest('web.websocket_discovery_plan', 'WebSocket discovery plan', 'R1', 'Identify realtime endpoint hints without opening WebSocket connections.'),
      scannerRequest('web.sourcemap_exposure_plan', 'Source-map exposure plan', 'R1', 'Check bounded source-map metadata without downloading map bodies.'),
    ],
    safetyNotes: [
      'Every step is a bounded built-in scanner template.',
      'No WebSocket connection, sourcemap body download, JavaScript fetch, or form submission is performed.',
      'Cookie values are never stored; contact URLs and paths are redacted before evidence storage.',
      'The pack is intended for operator triage before any R3 validation work.',
    ],
    commercialUseCases: ['Modern Bug Bounty surface review', 'SRC disclosure-process evidence', 'client-side exposure triage'],
  },
  {
    id: 'pack.web.api-auth-surface',
    name: 'Web API And Auth Surface Pack',
    description: 'Collect API metadata, OAuth/OIDC, GraphQL planning, redirect, and cache-policy evidence through governed templates.',
    category: 'web',
    requests: [
      scannerRequest('web.openapi_discovery', 'OpenAPI discovery', 'R2', 'Check bounded OpenAPI and Swagger metadata paths without executing API operations.'),
      scannerRequest('web.oauth_oidc_metadata', 'OAuth/OIDC metadata review', 'R1', 'Record well-known identity metadata without credential or token exchange.'),
      scannerRequest('web.graphql_introspection_plan', 'GraphQL introspection plan', 'R2', 'Find GraphQL endpoint hints and produce a safe validation plan without introspection queries.'),
      scannerRequest('web.redirect_policy', 'Redirect policy review', 'R1', 'Record redirect and canonicalization signals without following chains.'),
      scannerRequest('web.cache_policy', 'Cache policy review', 'R1', 'Summarize cache, CDN, validator, and sensitive-response caching signals.'),
    ],
    safetyNotes: [
      'API metadata checks use bounded same-origin GET requests only.',
      'No API operations, mutations, credential exchange, token requests, or GraphQL introspection queries are executed.',
      'Redirect checks do not follow chains and cache checks do not store response bodies.',
      'Every step still passes through scope, rate, audit, redaction, and evidence gates independently.',
    ],
    commercialUseCases: ['Bug bounty API triage', 'SRC auth-surface review', 'enterprise web/API handoff evidence'],
  },
];

export function listToolPacks(): ToolPack[] {
  return TOOL_PACKS.map(clonePack);
}

export class ToolPackService {
  constructor(
    private readonly store: PlatformStore,
    private readonly tools: ToolGateway,
    private readonly events?: RunEventService,
  ) {}

  list(): ToolPack[] {
    return listToolPacks();
  }

  get(packId: string): ToolPack | undefined {
    const pack = TOOL_PACKS.find((item) => item.id === packId);
    return pack ? clonePack(pack) : undefined;
  }

  listRuns(runId: string): ToolPackRun[] {
    this.assertRun(runId);
    return Object.values(this.store.state.toolPackRuns)
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async plan(runId: string, packId: string, target?: string): Promise<ToolPackPlan> {
    const run = this.assertRun(runId);
    const pack = this.assertPack(packId);
    const resolvedTarget = target?.trim() || run.target;
    const items: ToolPackPlanItem[] = [];
    for (const request of pack.requests) {
      const preview = await this.tools.preview(this.requestToInvoke(runId, request, resolvedTarget));
      items.push({ request: { ...request, args: { ...request.args } }, preview });
    }
    return {
      generatedAt: nowIso(),
      runId,
      pack: clonePack(pack),
      target: redactUrl(resolvedTarget),
      items,
      summary: {
        total: items.length,
        executable: items.filter((item) => item.preview.status === 'executable').length,
        blocked: items.filter((item) => item.preview.status === 'blocked').length,
        approvalRequired: items.filter((item) => item.preview.status === 'approval_required').length,
      },
      audit: {
        previewWritesState: false,
        invokesTools: false,
        writesEvidence: false,
      },
    };
  }

  async invoke(runId: string, packId: string, target?: string): Promise<ToolPackInvokeResult> {
    const run = this.assertRun(runId);
    const pack = this.assertPack(packId);
    const resolvedTarget = target?.trim() || run.target;
    const startedAt = nowIso();
    const runRecordId = newId('toolpack_run');
    this.events?.record({
      runId,
      type: 'toolpack.started',
      title: 'Tool Pack started',
      detail: `${pack.name} against ${redactUrl(resolvedTarget)}`,
      entityId: runRecordId,
    });
    const items: ToolPackRunItem[] = [];
    for (const request of pack.requests) {
      try {
        const result = await this.tools.invoke(this.requestToInvoke(runId, request, resolvedTarget));
        items.push(this.resultToItem(request, resolvedTarget, result));
      } catch (error) {
        items.push(this.errorToItem(request, resolvedTarget, error));
      }
    }
    const status = toolPackRunStatus(items);
    const runRecord: ToolPackRun = {
      id: runRecordId,
      runId,
      packId: pack.id,
      target: redactUrl(resolvedTarget),
      status,
      total: items.length,
      allowed: items.filter((item) => item.status === 'allowed').length,
      blocked: items.filter((item) => item.status === 'blocked').length,
      approvalRequired: items.filter((item) => item.status === 'approval_required').length,
      evidenceIds: items.map((item) => item.evidenceId).filter((id): id is string => Boolean(id)),
      invocationIds: items.map((item) => item.invocationId).filter((id): id is string => Boolean(id)),
      approvalIds: items.map((item) => item.approvalId).filter((id): id is string => Boolean(id)),
      items,
      startedAt,
      endedAt: nowIso(),
    };
    this.store.state.toolPackRuns[runRecord.id] = runRecord;
    this.events?.record({
      runId,
      type: 'toolpack.completed',
      title: 'Tool Pack completed',
      detail: `${pack.name}: ${runRecord.allowed}/${runRecord.total} allowed, ${runRecord.blocked} blocked, ${runRecord.approvalRequired} approval required`,
      entityId: runRecord.id,
      level: status === 'completed' ? 'info' : 'warning',
    });
    this.store.commit();
    return { pack: clonePack(pack), runRecord };
  }

  private requestToInvoke(runId: string, request: ToolPackRequest, target: string): ToolInvokeInput {
    return {
      runId,
      tool: request.tool,
      target,
      method: request.method,
      riskLevel: request.riskLevel,
      args: { ...request.args },
    };
  }

  private resultToItem(request: ToolPackRequest, target: string, result: ToolInvokeResult): ToolPackRunItem {
    return {
      requestId: request.id,
      title: request.title,
      tool: request.tool,
      target: redactUrl(target),
      method: request.method,
      riskLevel: request.riskLevel,
      status: result.status,
      invocationId: result.invocationId,
      evidenceId: result.status === 'allowed' ? result.evidenceId : undefined,
      approvalId: result.status === 'approval_required' ? result.approvalId : undefined,
      reason: result.status !== 'allowed' ? result.reason : undefined,
    };
  }

  private errorToItem(request: ToolPackRequest, target: string, error: unknown): ToolPackRunItem {
    return {
      requestId: request.id,
      title: request.title,
      tool: request.tool,
      target: redactUrl(target),
      method: request.method,
      riskLevel: request.riskLevel,
      status: 'blocked',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  private assertRun(runId: string) {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }

  private assertPack(packId: string): ToolPack {
    const pack = TOOL_PACKS.find((item) => item.id === packId);
    if (!pack) {
      throw new Error(`Tool Pack not found: ${packId}`);
    }
    return pack;
  }
}

function scannerRequest(template: string, title: string, riskLevel: RiskLevel, evidenceGoal: string): ToolPackRequest {
  return {
    id: template,
    title,
    tool: 'scanner.run_template',
    target: 'run.target',
    method: 'GET',
    riskLevel,
    args: { template, timeoutMs: 10_000 },
    evidenceGoal,
  };
}

function toolPackRunStatus(items: ToolPackRunItem[]): ToolPackRunStatus {
  if (items.every((item) => item.status === 'allowed')) {
    return 'completed';
  }
  if (items.some((item) => item.status === 'allowed')) {
    return 'partial';
  }
  if (items.some((item) => item.status === 'approval_required')) {
    return 'approval_required';
  }
  return 'blocked';
}

function clonePack(pack: ToolPack): ToolPack {
  return {
    ...pack,
    requests: pack.requests.map((request) => ({ ...request, args: { ...request.args } })),
    safetyNotes: [...pack.safetyNotes],
    commercialUseCases: [...pack.commercialUseCases],
  };
}
