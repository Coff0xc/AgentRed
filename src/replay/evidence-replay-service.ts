import type { Evidence } from '../domain/types.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import { evaluateScope } from '../scope/policy.js';
import { redactHeaders, redactText, redactUrl } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

export interface EvidenceReplayPlan {
  evidenceId: string;
  runId: string;
  kind: Evidence['kind'];
  replayable: boolean;
  status: 'ready' | 'not_http_exchange' | 'unsupported_method' | 'invalid_request' | 'out_of_scope';
  reason: string;
  method?: string;
  target?: string;
  source?: string;
  originalStatus?: number;
  createdAt: string;
}

export interface EvidenceReplayResult {
  status: 'replayed';
  sourceEvidenceId: string;
  replayEvidenceId: string;
  method: string;
  target: string;
  originalStatus?: number;
  replayStatus: number;
  statusChanged: boolean;
  sha256: string;
}

interface ParsedHttpExchange {
  source?: string;
  request?: {
    method?: unknown;
    target?: unknown;
    headers?: unknown;
  };
  response?: {
    status?: unknown;
  };
}

const SAFE_REPLAY_METHODS = new Set(['GET', 'HEAD']);
const STRIPPED_REPLAY_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-platform-token',
  'x-capture-run-id',
  'content-length',
  'host',
  'connection',
]);

export class EvidenceReplayService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
  ) {}

  listPlans(runId: string): EvidenceReplayPlan[] {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
    return Object.values(this.store.state.evidence)
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => this.plan(item.id));
  }

  plan(evidenceId: string): EvidenceReplayPlan {
    const evidence = this.assertEvidence(evidenceId);
    if (evidence.kind !== 'http_exchange') {
      return {
        evidenceId,
        runId: evidence.runId,
        kind: evidence.kind,
        replayable: false,
        status: 'not_http_exchange',
        reason: 'Only http_exchange evidence can be replayed.',
        createdAt: evidence.createdAt,
      };
    }
    const exchange = this.parseExchange(evidenceId);
    const method = stringValue(exchange.request?.method)?.toUpperCase() || 'GET';
    const target = stringValue(exchange.request?.target);
    const originalStatus = numberValue(exchange.response?.status);
    if (!target || !isReplayableUrl(target)) {
      return {
        evidenceId,
        runId: evidence.runId,
        kind: evidence.kind,
        replayable: false,
        status: 'invalid_request',
        reason: 'Evidence does not contain a replayable request URL.',
        method,
        target,
        source: stringValue(exchange.source),
        originalStatus,
        createdAt: evidence.createdAt,
      };
    }
    if (!SAFE_REPLAY_METHODS.has(method)) {
      return {
        evidenceId,
        runId: evidence.runId,
        kind: evidence.kind,
        replayable: false,
        status: 'unsupported_method',
        reason: 'Only GET and HEAD http_exchange evidence can be replayed without a new Tool Gateway action.',
        method,
        target: redactUrl(target),
        source: stringValue(exchange.source),
        originalStatus,
        createdAt: evidence.createdAt,
      };
    }
    const run = this.store.state.runs[evidence.runId];
    const scopeDecision = evaluateScope(evidence.runId, run.scopePolicy, target, method, 'R1');
    if (scopeDecision.action !== 'allow') {
      return {
        evidenceId,
        runId: evidence.runId,
        kind: evidence.kind,
        replayable: false,
        status: 'out_of_scope',
        reason: scopeDecision.reason,
        method,
        target: redactUrl(target),
        source: stringValue(exchange.source),
        originalStatus,
        createdAt: evidence.createdAt,
      };
    }
    return {
      evidenceId,
      runId: evidence.runId,
      kind: evidence.kind,
      replayable: true,
      status: 'ready',
      reason: 'Safe HTTP evidence replay is available.',
      method,
      target: redactUrl(target),
      source: stringValue(exchange.source),
      originalStatus,
      createdAt: evidence.createdAt,
    };
  }

  async replay(evidenceId: string, timeoutMs = 10_000): Promise<EvidenceReplayResult> {
    const evidence = this.assertEvidence(evidenceId);
    const plan = this.plan(evidenceId);
    if (!plan.replayable) {
      throw new Error(plan.reason);
    }
    const exchange = this.parseExchange(evidenceId);
    const method = stringValue(exchange.request?.method)?.toUpperCase() || 'GET';
    const target = stringValue(exchange.request?.target);
    if (!target) {
      throw new Error('Evidence does not contain a replayable request URL.');
    }
    const headers = replayHeaders(exchange.request?.headers);
    const startedAt = new Date().toISOString();
    const response = await fetch(target, {
      method,
      headers: {
        'user-agent': 'AuthorizedAIPentestPlatform/0.1 evidence-replay',
        ...headers,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(Math.max(timeoutMs, 100), 30_000)),
    });
    const body = method === 'HEAD' ? '' : await response.text();
    const replayEvidence = this.evidence.addEvidence({
      runId: evidence.runId,
      kind: 'http_exchange',
      content: JSON.stringify({
        source: 'evidence_replay',
        sourceEvidenceId: evidence.id,
        request: {
          method,
          target: redactUrl(target),
          headers: redactHeaders(headers),
        },
        original: {
          source: stringValue(exchange.source),
          status: plan.originalStatus,
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: redactHeaders(Object.fromEntries(response.headers.entries())),
          bodyPreview: redactText(body).slice(0, 4096),
          bodyTruncated: body.length > 4096,
        },
        replay: {
          startedAt,
          endedAt: new Date().toISOString(),
          statusChanged: plan.originalStatus !== undefined && plan.originalStatus !== response.status,
        },
      }),
      redactionState: 'redacted',
    });
    return {
      status: 'replayed',
      sourceEvidenceId: evidence.id,
      replayEvidenceId: replayEvidence.id,
      method,
      target: redactUrl(target),
      originalStatus: plan.originalStatus,
      replayStatus: response.status,
      statusChanged: plan.originalStatus !== undefined && plan.originalStatus !== response.status,
      sha256: replayEvidence.sha256,
    };
  }

  private assertEvidence(evidenceId: string): Evidence {
    const evidence = this.store.state.evidence[evidenceId];
    if (!evidence) {
      throw new Error(`Evidence not found: ${evidenceId}`);
    }
    return evidence;
  }

  private parseExchange(evidenceId: string): ParsedHttpExchange {
    const blob = this.evidence.readEvidenceBlob(evidenceId);
    if (blob.encoding !== 'utf8') {
      throw new Error('HTTP exchange evidence must be UTF-8 JSON to replay.');
    }
    try {
      const parsed = JSON.parse(blob.content) as ParsedHttpExchange;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      throw new Error('HTTP exchange evidence is not valid JSON.');
    }
  }
}

function replayHeaders(input: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return headers;
  }
  for (const [name, value] of Object.entries(input)) {
    const normalizedName = name.toLowerCase();
    const normalizedValue = stringValue(value);
    if (!normalizedValue || STRIPPED_REPLAY_HEADERS.has(normalizedName) || normalizedValue.includes('[redacted]')) {
      continue;
    }
    headers[name] = normalizedValue;
  }
  return headers;
}

function isReplayableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function stringValue(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined;
}

function numberValue(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isFinite(input) ? input : undefined;
}
