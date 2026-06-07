import { createHash } from 'node:crypto';
import { resolve4, resolve6, resolveCname, resolveMx, resolveNs, resolveTxt } from 'node:dns/promises';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { connect as tlsConnect, type DetailedPeerCertificate } from 'node:tls';

import { newId, nowIso } from '../domain/ids.js';
import type {
  ApprovalStatus,
  Confidence,
  EvidenceKind,
  ProposeFindingInput,
  RiskLevel,
  ScannerResultEngine,
  Severity,
  ToolInvocation,
} from '../domain/types.js';
import type { AccessReviewService } from '../access/access-review-service.js';
import type { ApprovalService } from '../approvals/approval-service.js';
import type { BrowserSessionService } from '../captures/browser-session-service.js';
import type { CredentialReferenceService } from '../credentials/credential-reference-service.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import type { FindingService } from '../findings/finding-service.js';
import type { OastService } from '../oast/oast-service.js';
import type { ScannerResultImportService } from '../scanners/scanner-result-import-service.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { ObservabilityService } from '../observability/observability-service.js';
import type { McpExecutionService } from '../connectors/mcp-execution-service.js';
import { redactArgs, redactHeaders, redactText, redactUrl } from '../security/redaction.js';
import { evaluateScope } from '../scope/policy.js';
import { getIndexedStoreMutator } from '../storage/indexed-store.js';
import type { PlatformStore } from '../storage/store.js';
import {
  findScannerTemplate,
  capabilityMatrix,
  listScannerTemplatePolicies,
  toolCatalog,
  type CapabilityMatrixEntry,
  type ScannerTemplatePolicy,
  type ToolCatalogEntry,
  type ToolTemplateProfile,
} from './toolbox-registry.js';
import { ToolboxRunner, type ToolboxPlanDecision, type ToolboxRunPlan } from './toolbox-runner.js';

export interface ToolInvokeInput {
  runId: string;
  tool: string;
  target: string;
  method: string;
  riskLevel: RiskLevel;
  args: Record<string, unknown>;
  approvalId?: string;
  r4AuthorizationToken?: string;
}

export type ToolInvokeResult =
  | {
      status: 'allowed';
      invocationId: string;
      stdoutRef: string;
      evidenceId?: string;
      findingId?: string;
      exitCode?: number | null;
      timedOut?: boolean;
    }
  | { status: 'blocked'; invocationId: string; reason: string }
  | { status: 'approval_required'; invocationId: string; approvalId: string; reason: string };

export type ToolPlanPreviewStatus = 'executable' | 'blocked' | 'approval_required';
export type ToolPlanGateStatus = 'pass' | 'blocked' | 'approval_required' | 'info';

export interface ToolPlanPreviewGate {
  gate: string;
  status: ToolPlanGateStatus;
  reason: string;
  detail?: Record<string, string | number | boolean>;
}

export interface ToolPlanPreview {
  generatedAt: string;
  runId: string;
  tool: string;
  target: string;
  method: string;
  riskLevel: RiskLevel;
  args: Record<string, unknown>;
  status: ToolPlanPreviewStatus;
  executable: boolean;
  reason?: string;
  gates: ToolPlanPreviewGate[];
  scanner?: ToolPlanScannerPreview;
  evidence: {
    wouldProduce: boolean;
    kind?: EvidenceKind;
    redactionState?: 'redacted';
    policy: string;
  };
  audit: {
    previewWritesState: false;
    wouldRecordInvocation: boolean;
    wouldCreateApprovalRequest: boolean;
    wouldConsumeRateLimit: boolean;
    wouldExecuteExternalProcess: boolean;
    wouldWriteEvidence: boolean;
  };
}

export interface ToolPlanScannerPreview {
  template?: {
    id: string;
    name: string;
    domain: string;
    engine: string;
    profileId: string;
    executionMode: string;
    defaultRiskLevel: RiskLevel;
    evidenceKind: EvidenceKind;
    riskNotes: string[];
  };
  profile?: {
    id: string;
    name: string;
    runner: string;
    available: boolean;
    runtimeStatus: string;
    reason?: string;
  };
  toolboxDecision: {
    allowed: boolean;
    reason?: string;
  };
  plan?: {
    templateId: string;
    profileId: string;
    engine: string;
    runner: string;
    command: string;
    args: string[];
    target: string;
    timeoutMs: number;
    cwdPolicy: ToolboxRunPlan['cwdPolicy'];
    networkPolicy: ToolboxRunPlan['networkPolicy'];
    evidencePolicy: ToolboxRunPlan['evidencePolicy'];
    approvalRequired: boolean;
  };
}

interface SandboxShellRequest {
  command: string;
  args: string[];
  timeoutMs: number;
}

interface ScannerTemplateRequest {
  template: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

interface ScannerExecutionResult {
  evidenceId: string;
  exitCode?: number | null;
  timedOut?: boolean;
}

interface ParamProbeResponseSample {
  status: number;
  bodyLength: number;
  contentType?: string;
  errorSignals: string[];
  timingMs: number;
  bodyPreview: string;
}

export class ToolGateway {
  constructor(
    private readonly store: PlatformStore,
    private readonly approvals: ApprovalService,
    private readonly evidence: EvidenceEngine,
    private readonly events?: RunEventService,
    private readonly observability?: ObservabilityService,
    private readonly toolbox: ToolboxRunner = new ToolboxRunner(),
    private readonly findings?: FindingService,
    private readonly browserSessions?: BrowserSessionService,
    private readonly credentials?: CredentialReferenceService,
    private readonly accessReviews?: AccessReviewService,
    private readonly oast?: OastService,
    private readonly scannerResults?: ScannerResultImportService,
    private readonly mcp?: McpExecutionService,
  ) {}

  catalog(): ToolCatalogEntry[] {
    return toolCatalog();
  }

  capabilities(): CapabilityMatrixEntry[] {
    return capabilityMatrix();
  }

  scannerTemplatePolicies(): ScannerTemplatePolicy[] {
    return listScannerTemplatePolicies();
  }

  async preview(input: ToolInvokeInput): Promise<ToolPlanPreview> {
    const run = this.store.state.runs[input.runId];
    if (!run) {
      throw new Error(`Run not found: ${input.runId}`);
    }
    const gates: ToolPlanPreviewGate[] = [];
    let scannerTemplate: ToolTemplateProfile | undefined;
    let scannerPlan: ToolboxPlanDecision | undefined;
    const finish = (status: ToolPlanPreviewStatus): ToolPlanPreview => {
      const evidence = evidencePreview(input.tool, scannerTemplate);
      const terminal = terminalGate(gates);
      return {
        generatedAt: nowIso(),
        runId: input.runId,
        tool: input.tool,
        target: redactUrl(input.target),
        method: input.method.toUpperCase(),
        riskLevel: input.riskLevel,
        args: redactArgs(input.args),
        status,
        executable: status === 'executable',
        reason: terminal?.reason,
        gates,
        scanner: scannerPreview(scannerPlan, input.target),
        evidence,
        audit: {
          previewWritesState: false,
          wouldRecordInvocation: true,
          wouldCreateApprovalRequest: status === 'approval_required',
          wouldConsumeRateLimit: status === 'executable',
          wouldExecuteExternalProcess:
            status === 'executable' && Boolean(scannerPlan?.allowed && scannerPlan.template.executionMode === 'external'),
          wouldWriteEvidence: status === 'executable' && evidence.wouldProduce,
        },
      };
    };

    if (!isSupportedTool(input.tool)) {
      gates.push({ gate: 'tool.support', status: 'blocked', reason: `Unsupported tool: ${input.tool}` });
      return finish('blocked');
    }
    gates.push({ gate: 'tool.support', status: 'pass', reason: 'High-level tool is registered in the Tool Gateway' });

    const approvalResolution = this.resolveApprovalStatus(input);
    if (!approvalResolution.valid) {
      gates.push({ gate: 'approval.reference', status: 'blocked', reason: approvalResolution.reason });
      return finish('blocked');
    }
    if (input.approvalId) {
      gates.push({
        gate: 'approval.reference',
        status: approvalResolution.status === 'approved' ? 'pass' : 'info',
        reason: `Approval reference is ${approvalResolution.status ?? 'missing'}`,
      });
    }

    const scopeDecision = evaluateScope(
      input.runId,
      run.scopePolicy,
      input.target,
      input.method,
      input.riskLevel,
      approvalResolution.status,
      input.r4AuthorizationToken,
    );
    if (scopeDecision.action === 'approval_required') {
      gates.push({ gate: 'scope.policy', status: 'approval_required', reason: scopeDecision.reason });
      return finish('approval_required');
    }
    if (scopeDecision.action === 'deny') {
      gates.push({ gate: 'scope.policy', status: 'blocked', reason: scopeDecision.reason });
      return finish('blocked');
    }
    gates.push({ gate: 'scope.policy', status: 'pass', reason: scopeDecision.reason });

    const shellRequest = input.tool === 'shell.run_sandboxed' ? parseSandboxShellRequest(input.args) : undefined;
    if (shellRequest) {
      if (!isShellCommandAllowed(shellRequest.command)) {
        gates.push({
          gate: 'shell.allowlist',
          status: 'blocked',
          reason: `Shell command not allowed: ${commandDisplayName(shellRequest.command)}`,
        });
        return finish('blocked');
      }
      gates.push({
        gate: 'shell.allowlist',
        status: 'pass',
        reason: `Shell command is allowed: ${commandDisplayName(shellRequest.command)}`,
      });
    }

    const scannerRequest = input.tool === 'scanner.run_template' ? parseScannerTemplateRequest(input.args) : undefined;
    if (scannerRequest) {
      scannerTemplate = findScannerTemplate(scannerRequest.template);
      if (!scannerTemplate) {
        gates.push({
          gate: 'scanner.template',
          status: 'blocked',
          reason: `Unsupported scanner template: ${scannerRequest.template || 'missing template'}`,
        });
        return finish('blocked');
      }
      gates.push({
        gate: 'scanner.template',
        status: 'pass',
        reason: `Scanner template is registered: ${scannerTemplate.id}`,
      });
      scannerPlan = await this.toolbox.planTemplate({
        templateId: scannerRequest.template,
        target: input.target,
        riskLevel: input.riskLevel,
        timeoutMs: scannerRequest.timeoutMs,
      });
      if (!scannerPlan.allowed) {
        gates.push({ gate: 'toolbox.plan', status: 'blocked', reason: scannerPlan.reason });
        return finish('blocked');
      }
      gates.push({
        gate: 'toolbox.plan',
        status: 'pass',
        reason: `${scannerPlan.plan.engine} plan is ready on profile ${scannerPlan.plan.profileId}`,
      });
    }

    const rateLimitDecision = this.peekRateLimit(input.runId, run.scopePolicy.rateLimits.requestsPerMinute);
    if (!rateLimitDecision.allowed) {
      gates.push({
        gate: 'rate.limit',
        status: 'blocked',
        reason: rateLimitDecision.reason,
        detail: { current: rateLimitDecision.current, limit: rateLimitDecision.limit },
      });
      return finish('blocked');
    }
    gates.push({
      gate: 'rate.limit',
      status: 'pass',
      reason: `Within rate limit: ${rateLimitDecision.current}/${rateLimitDecision.limit} requests in the current minute`,
      detail: { current: rateLimitDecision.current, limit: rateLimitDecision.limit },
    });

    const semanticGate = this.previewToolSemantics(input);
    if (semanticGate) {
      gates.push(semanticGate);
      if (semanticGate.status === 'blocked') {
        return finish('blocked');
      }
    }

    gates.push({ gate: 'execution.preview', status: 'info', reason: 'Preview completed without writing state or executing tools' });
    return finish('executable');
  }

  async invoke(input: ToolInvokeInput): Promise<ToolInvokeResult> {
    const run = this.store.state.runs[input.runId];
    if (!run) {
      throw new Error(`Run not found: ${input.runId}`);
    }
    const startedMs = Date.now();
    if (!isSupportedTool(input.tool)) {
      const invocation = this.recordInvocation(input, 'blocked', `Unsupported tool: ${input.tool}`, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason: invocation.reason ?? 'Unsupported tool' }, startedMs, {
        reason: invocation.reason,
      });
    }
    const approvalResolution = this.resolveApprovalStatus(input);
    if (approvalResolution.valid === false) {
      const invocation = this.recordInvocation(input, 'blocked', approvalResolution.reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason: approvalResolution.reason }, startedMs, {
        reason: approvalResolution.reason,
      });
    }
    if (approvalResolution.expired) {
      const request = this.approvals.request({
        runId: input.runId,
        tool: input.tool,
        target: redactUrl(input.target),
        riskLevel: input.riskLevel,
        reason: `Previous approval ${input.approvalId} expired; operator approval is required again`,
      });
      const reason = `Approval ${input.approvalId} has expired; new approval ${request.id} is required`;
      const invocation = this.recordInvocation(input, 'approval_required', reason, request.id);
      return this.finishTool(
        input,
        {
          status: 'approval_required',
          invocationId: invocation.id,
          approvalId: request.id,
          reason,
        },
        startedMs,
        { approvalId: request.id, reason },
      );
    }
    const scopeDecision = evaluateScope(
      input.runId,
      run.scopePolicy,
      input.target,
      input.method,
      input.riskLevel,
      approvalResolution.status,
      input.r4AuthorizationToken,
    );

    if (scopeDecision.action === 'approval_required') {
      const request = this.approvals.request({
        runId: input.runId,
        tool: input.tool,
        target: redactUrl(input.target),
        riskLevel: input.riskLevel,
        reason: scopeDecision.reason,
      });
      const invocation = this.recordInvocation(input, 'approval_required', scopeDecision.reason, request.id);
      return this.finishTool(
        input,
        {
          status: 'approval_required',
          invocationId: invocation.id,
          approvalId: request.id,
          reason: scopeDecision.reason,
        },
        startedMs,
        { approvalId: request.id, reason: scopeDecision.reason },
      );
    }

    if (scopeDecision.action === 'deny') {
      const invocation = this.recordInvocation(input, 'blocked', scopeDecision.reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason: scopeDecision.reason }, startedMs, {
        reason: scopeDecision.reason,
      });
    }

    const shellRequest = input.tool === 'shell.run_sandboxed' ? parseSandboxShellRequest(input.args) : undefined;
    if (shellRequest && !isShellCommandAllowed(shellRequest.command)) {
      const invocation = this.recordInvocation(
        input,
        'blocked',
        `Shell command not allowed: ${commandDisplayName(shellRequest.command)}`,
        input.approvalId,
      );
      return this.finishTool(
        input,
        { status: 'blocked', invocationId: invocation.id, reason: invocation.reason ?? 'Shell command not allowed' },
        startedMs,
        { reason: invocation.reason },
      );
    }
    const scannerRequest = input.tool === 'scanner.run_template' ? parseScannerTemplateRequest(input.args) : undefined;
    const scannerTemplate = scannerRequest ? findScannerTemplate(scannerRequest.template) : undefined;
    if (input.tool === 'scanner.run_template' && scannerRequest && !scannerTemplate) {
      const invocation = this.recordInvocation(
        input,
        'blocked',
        `Unsupported scanner template: ${scannerRequest.template || 'missing template'}`,
        input.approvalId,
      );
      return this.finishTool(
        input,
        { status: 'blocked', invocationId: invocation.id, reason: invocation.reason ?? 'Unsupported scanner template' },
        startedMs,
        { reason: invocation.reason },
      );
    }
    let scannerPlan: ToolboxPlanDecision | undefined;
    if (input.tool === 'scanner.run_template' && scannerRequest && scannerTemplate) {
      scannerPlan = await this.toolbox.planTemplate({
        templateId: scannerRequest.template,
        target: input.target,
        riskLevel: input.riskLevel,
        timeoutMs: scannerRequest.timeoutMs,
      });
      if (!scannerPlan.allowed) {
        const invocation = this.recordInvocation(input, 'blocked', scannerPlan.reason, input.approvalId);
        return this.finishTool(
          input,
          {
            status: 'blocked',
            invocationId: invocation.id,
            reason: scannerPlan.reason,
          },
          startedMs,
          scannerPlanAttributes(scannerPlan),
        );
      }
    }
    const rateLimitDecision = this.consumeRateLimit(input.runId, run.scopePolicy.rateLimits.requestsPerMinute);
    if (!rateLimitDecision.allowed) {
      const invocation = this.recordInvocation(input, 'blocked', rateLimitDecision.reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason: rateLimitDecision.reason }, startedMs, {
        reason: rateLimitDecision.reason,
      });
    }

    if (input.tool === 'finding.propose') {
      return this.proposeFinding(input, startedMs);
    }
    if (input.tool === 'credential.use_placeholder') {
      return this.useCredentialPlaceholder(input, startedMs);
    }
    if (input.tool === 'access.compare_evidence') {
      return this.compareAccessEvidence(input, startedMs);
    }
    if (input.tool === 'oast.start_session') {
      return this.startOastSession(input, startedMs);
    }
    if (input.tool === 'oast.record_callback') {
      return this.recordOastCallback(input, startedMs);
    }
    if (input.tool === 'mcp.invoke') {
      return this.invokeMcpTool(input, startedMs);
    }

    if (input.tool === 'browser.navigate') {
      if (!this.browserSessions) {
        const blocked = this.recordInvocation(input, 'blocked', 'Browser session service is not configured', input.approvalId);
        return this.finishTool(
          input,
          { status: 'blocked', invocationId: blocked.id, reason: blocked.reason ?? 'Browser session service is not configured' },
          startedMs,
          { reason: blocked.reason },
        );
      }
      try {
        const result = await this.browserSessions.navigate({
          runId: input.runId,
          sessionId: typeof input.args.sessionId === 'string' ? input.args.sessionId : undefined,
          target: input.target,
          method: input.method,
          headers: parseHeaders(input.args.headers),
          timeoutMs: typeof input.args.timeoutMs === 'number' ? input.args.timeoutMs : undefined,
          riskLevel: input.riskLevel,
        });
        const invocation = this.recordInvocation(input, 'allowed', undefined, input.approvalId, `stdout://${newId('tool')}`);
        this.completeInvocation(invocation.id);
        return this.finishTool(
          input,
          {
            status: 'allowed',
            invocationId: invocation.id,
            stdoutRef: invocation.stdoutRef ?? '',
            evidenceId: result.evidence.id,
          },
          startedMs,
          { evidenceId: result.evidence.id, browserSessionId: result.session.id },
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Browser navigation failed';
        const blocked = this.recordInvocation(input, 'blocked', reason, input.approvalId);
        return this.finishTool(input, { status: 'blocked', invocationId: blocked.id, reason }, startedMs, { reason });
      }
    }

    const invocation = this.recordInvocation(input, 'allowed', undefined, input.approvalId, `stdout://${newId('tool')}`);
    if (input.tool === 'http.request') {
      const evidence = await this.executeHttpRequest(input, invocation.id);
      this.completeInvocation(invocation.id);
      return this.finishTool(
        input,
        { status: 'allowed', invocationId: invocation.id, stdoutRef: invocation.stdoutRef ?? '', evidenceId: evidence.id },
        startedMs,
        { evidenceId: evidence.id },
      );
    }
    if (input.tool === 'shell.run_sandboxed' && shellRequest) {
      const result = await this.executeSandboxedShell(input, invocation.id, shellRequest);
      this.completeInvocation(invocation.id, { exitCode: result.exitCode, timedOut: result.timedOut });
      return this.finishTool(
        input,
        {
          status: 'allowed',
          invocationId: invocation.id,
          stdoutRef: invocation.stdoutRef ?? '',
          evidenceId: result.evidenceId,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        },
        startedMs,
        { evidenceId: result.evidenceId, exitCode: result.exitCode ?? undefined, timedOut: result.timedOut },
      );
    }
    if (input.tool === 'scanner.run_template' && scannerRequest) {
      const result =
        scannerTemplate?.executionMode === 'external'
          ? await this.executeExternalScannerTemplate(input, invocation.id, scannerRequest, scannerPlan)
          : await this.executeScannerTemplate(input, invocation.id, scannerRequest, scannerTemplate);
      this.completeInvocation(invocation.id, { exitCode: result.exitCode, timedOut: result.timedOut });
      return this.finishTool(
        input,
        {
          status: 'allowed',
          invocationId: invocation.id,
          stdoutRef: invocation.stdoutRef ?? '',
          evidenceId: result.evidenceId,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        },
        startedMs,
        {
          evidenceId: result.evidenceId,
          template: scannerRequest.template,
          exitCode: result.exitCode ?? undefined,
          timedOut: result.timedOut,
          ...scannerPlanAttributes(scannerPlan),
        },
      );
    }
    return this.finishTool(input, { status: 'allowed', invocationId: invocation.id, stdoutRef: invocation.stdoutRef ?? '' }, startedMs);
  }

  private recordInvocation(
    input: ToolInvokeInput,
    status: ToolInvocation['status'],
    reason?: string,
    approvalId?: string,
    stdoutRef?: string,
  ): ToolInvocation {
    const timestamp = nowIso();
    const invocation: ToolInvocation = {
      id: newId('toolcall'),
      runId: input.runId,
      tool: input.tool,
      args: redactArgs(input.args),
      target: redactUrl(input.target),
      method: input.method.toUpperCase(),
      riskLevel: input.riskLevel,
      approvalId,
      status,
      stdoutRef,
      reason,
      startedAt: timestamp,
      endedAt: timestamp,
    };
    this.store.state.toolInvocations[invocation.id] = invocation;
    getIndexedStoreMutator(this.store)?.onToolInvocationAdded(invocation.id, invocation);
    if (status === 'allowed' || status === 'blocked') {
      this.events?.record({
        runId: input.runId,
        type: status === 'allowed' ? 'tool.allowed' : 'tool.blocked',
        title: status === 'allowed' ? 'Tool allowed' : 'Tool blocked',
        detail: `${input.tool} ${input.riskLevel} ${redactUrl(input.target)}${reason ? `: ${reason}` : ''}`,
        level: status === 'blocked' ? 'warning' : 'info',
        entityId: invocation.id,
      });
    }
    this.store.commit();
    return invocation;
  }

  private completeInvocation(
    invocationId: string,
    update: { exitCode?: number | null; timedOut?: boolean } = {},
  ): void {
    const invocation = this.store.state.toolInvocations[invocationId];
    if (!invocation) {
      return;
    }
    invocation.endedAt = nowIso();
    if ('exitCode' in update) {
      invocation.exitCode = update.exitCode;
    }
    if (update.timedOut !== undefined) {
      invocation.timedOut = update.timedOut;
    }
    this.store.commit();
  }

  private resolveApprovalStatus(input: ToolInvokeInput):
    | { valid: true; status?: ApprovalStatus; expired?: boolean }
    | { valid: false; reason: string } {
    if (!input.approvalId) {
      return { valid: true };
    }
    try {
      const approval = this.approvals.get(input.approvalId);
      const expectedTarget = redactUrl(input.target);
      if (approval.runId !== input.runId) {
        return { valid: false, reason: `Approval ${input.approvalId} does not belong to run ${input.runId}` };
      }
      if (approval.tool !== input.tool) {
        return { valid: false, reason: `Approval ${input.approvalId} was issued for ${approval.tool}, not ${input.tool}` };
      }
      if (approval.riskLevel !== input.riskLevel) {
        return {
          valid: false,
          reason: `Approval ${input.approvalId} was issued for ${approval.riskLevel}, not ${input.riskLevel}`,
        };
      }
      if (approval.target !== expectedTarget) {
        return { valid: false, reason: `Approval ${input.approvalId} target does not match this request` };
      }

      // Check if approval is expired
      if (this.approvals.isExpired(approval)) {
        return { valid: true, status: 'pending', expired: true };
      }

      return { valid: true, status: approval.status };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  private peekRateLimit(
    runId: string,
    requestsPerMinute: number,
  ): { allowed: true; current: number; limit: number } | { allowed: false; current: number; limit: number; reason: string } {
    const now = Date.now();
    const windowStart = now - 60_000;
    const current = (this.store.state.rateLimitEvents[runId] ?? [])
      .map((timestamp) => Date.parse(timestamp))
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= windowStart).length;
    if (current >= requestsPerMinute) {
      return {
        allowed: false,
        current,
        limit: requestsPerMinute,
        reason: `Rate limit would block execution: ${current}/${requestsPerMinute} requests in the current minute`,
      };
    }
    return { allowed: true, current, limit: requestsPerMinute };
  }

  private previewToolSemantics(input: ToolInvokeInput): ToolPlanPreviewGate | undefined {
    if (input.tool === 'browser.navigate' && !this.browserSessions) {
      return { gate: 'service.browser', status: 'blocked', reason: 'Browser session service is not configured' };
    }
    if (input.tool === 'credential.use_placeholder') {
      if (!this.credentials) {
        return { gate: 'service.credential', status: 'blocked', reason: 'Credential service is not configured' };
      }
      try {
        const credential = this.credentials.resolveForUse(input.runId, {
          credentialId: optionalArgText(input.args.credentialId),
          role: optionalArgText(input.args.role),
          label: optionalArgText(input.args.label),
          usedFor: optionalArgText(input.args.usedFor),
        });
        return {
          gate: 'credential.reference',
          status: 'pass',
          reason: `Active credential reference is available for role ${credential.role}`,
        };
      } catch (error) {
        return { gate: 'credential.reference', status: 'blocked', reason: error instanceof Error ? error.message : String(error) };
      }
    }
    if (input.tool === 'access.compare_evidence') {
      const baselineEvidenceId = optionalArgText(input.args.baselineEvidenceId);
      const comparisonEvidenceId = optionalArgText(input.args.comparisonEvidenceId);
      if (!baselineEvidenceId || !comparisonEvidenceId) {
        return {
          gate: 'access.evidence',
          status: 'blocked',
          reason: 'Access comparison requires baselineEvidenceId and comparisonEvidenceId',
        };
      }
      const missing = [baselineEvidenceId, comparisonEvidenceId].filter((id) => !this.evidenceBelongsToRun(id, input.runId));
      if (missing.length > 0) {
        return { gate: 'access.evidence', status: 'blocked', reason: `Evidence not found in this run: ${missing.join(', ')}` };
      }
      return { gate: 'access.evidence', status: 'pass', reason: 'Both access comparison evidence items belong to this run' };
    }
    if (input.tool === 'oast.start_session' && !this.oast) {
      return { gate: 'service.oast', status: 'blocked', reason: 'OAST service is not configured' };
    }
    if (input.tool === 'oast.record_callback' && !this.oast) {
      return { gate: 'service.oast', status: 'blocked', reason: 'OAST service is not configured' };
    }
    if (input.tool === 'mcp.invoke') {
      if (!this.mcp) {
        return { gate: 'service.mcp', status: 'blocked', reason: 'MCP execution service is not configured' };
      }
      const connectionId = optionalArgText(input.args.connectionId);
      const toolName = optionalArgText(input.args.toolName);
      if (!connectionId || !toolName) {
        return {
          gate: 'mcp.args',
          status: 'blocked',
          reason: 'MCP invocation requires connectionId and toolName',
        };
      }
      const connection = this.mcp.getConnection(connectionId);
      if (!connection) {
        return {
          gate: 'mcp.connection',
          status: 'blocked',
          reason: `MCP connection not found: ${connectionId}`,
        };
      }
      if (!connection.isReady()) {
        return {
          gate: 'mcp.connection',
          status: 'blocked',
          reason: `MCP connection ${connectionId} is not ready: ${connection.getState().status}`,
        };
      }
      return {
        gate: 'mcp.connection',
        status: 'pass',
        reason: `MCP connection ${connectionId} is ready and tool ${toolName} will be validated at invocation time`,
      };
    }
    if (input.tool === 'finding.propose') {
      if (!this.findings) {
        return { gate: 'service.finding', status: 'blocked', reason: 'Finding service is not configured' };
      }
      try {
        const proposal = parseFindingProposalRequest(input.runId, input.args);
        const missing = proposal.evidenceIds.filter((id) => !this.evidenceBelongsToRun(id, input.runId));
        if (missing.length > 0) {
          return { gate: 'finding.evidence', status: 'blocked', reason: `Evidence not found in this run: ${missing.join(', ')}` };
        }
        return {
          gate: 'finding.evidence',
          status: 'pass',
          reason: `Finding proposal references ${proposal.evidenceIds.length} same-run evidence item(s)`,
        };
      } catch (error) {
        return { gate: 'finding.evidence', status: 'blocked', reason: error instanceof Error ? error.message : String(error) };
      }
    }
    return undefined;
  }

  private evidenceBelongsToRun(evidenceId: string, runId: string): boolean {
    const evidence = this.store.state.evidence[evidenceId];
    return Boolean(evidence && evidence.runId === runId);
  }

  private consumeRateLimit(runId: string, requestsPerMinute: number): { allowed: true } | { allowed: false; reason: string } {
    const now = Date.now();
    const windowStart = now - 60_000;
    const retained = (this.store.state.rateLimitEvents[runId] ?? [])
      .map((timestamp) => Date.parse(timestamp))
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= windowStart);
    if (retained.length >= requestsPerMinute) {
      this.store.state.rateLimitEvents[runId] = retained.map((timestamp) => new Date(timestamp).toISOString());
      return { allowed: false, reason: `Rate limit exceeded: ${requestsPerMinute} requests per minute` };
    }
    retained.push(now);
    this.store.state.rateLimitEvents[runId] = retained.map((timestamp) => new Date(timestamp).toISOString());
    return { allowed: true };
  }

  private async executeHttpRequest(input: ToolInvokeInput, toolCallId: string) {
    const headers = parseHeaders(input.args.headers);
    const body = typeof input.args.body === 'string' ? input.args.body : undefined;
    const timeoutMs =
      typeof input.args.timeoutMs === 'number' ? Math.min(Math.max(input.args.timeoutMs, 100), 30_000) : 10_000;
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: input.method.toUpperCase(),
      headers,
      body: input.method.toUpperCase() === 'GET' || input.method.toUpperCase() === 'HEAD' ? undefined : body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseBody = await response.text();
    const exchange = {
      request: {
        target: redactUrl(input.target),
        method: input.method.toUpperCase(),
        headers: redactHeaders(headers),
        bodySha256: body ? hashText(body) : undefined,
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: redactHeaders(Object.fromEntries(response.headers.entries())),
        bodyPreview: redactText(responseBody).slice(0, 4096),
        bodyTruncated: responseBody.length > 4096,
      },
      startedAt,
      endedAt: nowIso(),
    };
    return this.evidence.addEvidence({
      runId: input.runId,
      kind: 'http_exchange',
      content: JSON.stringify(exchange),
      redactionState: 'redacted',
      toolCallId,
    });
  }

  private async executeSandboxedShell(input: ToolInvokeInput, toolCallId: string, request: SandboxShellRequest) {
    const sandboxCwd = join(process.cwd(), '.local', 'tool-runs', toolCallId);
    mkdirSync(sandboxCwd, { recursive: true });
    const startedAt = nowIso();
    const result = await runSandboxProcess(request.command, request.args, sandboxCwd, request.timeoutMs);
    const stdout = limitText(redactText(result.stdout), 8192);
    const stderr = limitText(redactText(result.stderr), 8192);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        command: commandDisplayName(request.command),
        args: request.args.map((value) => redactText(value)),
        sandboxCwd,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdout: stdout.text,
        stderr: stderr.text,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id, exitCode: result.exitCode, timedOut: result.timedOut };
  }

  private async executeScannerTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    if (request.template === 'web.endpoint_discovery') {
      return this.executeEndpointDiscoveryTemplate(input, toolCallId, request);
    }
    if (request.template === 'web.technology_fingerprint') {
      return this.executeTechnologyFingerprintTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.cookie_flags') {
      return this.executeCookieFlagsTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.link_form_map') {
      return this.executeLinkFormMapTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.cors_policy') {
      return this.executeCorsPolicyTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.csp_analysis') {
      return this.executeCspAnalysisTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.js_asset_inventory') {
      return this.executeJavaScriptAssetInventoryTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.cookie_scope_analysis') {
      return this.executeCookieScopeAnalysisTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.security_txt_policy') {
      return this.executeSecurityTxtPolicyTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.websocket_discovery_plan') {
      return this.executeWebSocketDiscoveryPlanTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.sourcemap_exposure_plan') {
      return this.executeSourceMapExposurePlanTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.redirect_policy') {
      return this.executeRedirectPolicyTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.cache_policy') {
      return this.executeCachePolicyTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.openapi_discovery') {
      return this.executeOpenApiDiscoveryTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.oauth_oidc_metadata') {
      return this.executeOauthOidcMetadataTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.graphql_introspection_plan') {
      return this.executeGraphqlIntrospectionPlanTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'network.dns_records') {
      return this.executeDnsRecordsTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'network.tls_certificate') {
      return this.executeTlsCertificateTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.auth_endpoint_discovery') {
      return this.executeAuthEndpointDiscoveryTemplate(input, toolCallId, request);
    }
    if (request.template === 'web.api_version_discovery') {
      return this.executeApiVersionDiscoveryTemplate(input, toolCallId, request);
    }
    if (request.template === 'web.host_header_probe') {
      return this.executeHostHeaderProbeTemplate(input, toolCallId, request, template);
    }
    if (request.template === 'web.param_probe') {
      return this.executeParamProbeTemplate(input, toolCallId, request, template);
    }
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: input.method.toUpperCase(),
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const headers = Object.fromEntries(response.headers.entries());
    const missingSecurityHeaders = SECURITY_HEADERS.filter((header) => !headers[header]);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: input.method.toUpperCase(),
        result: {
          status: response.status,
          statusText: response.statusText,
          checkedHeaders: SECURITY_HEADERS,
          presentSecurityHeaders: SECURITY_HEADERS.filter((header) => Boolean(headers[header])),
          missingSecurityHeaders,
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeExternalScannerTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    decision: ToolboxPlanDecision | undefined,
  ): Promise<ScannerExecutionResult> {
    if (!decision?.allowed) {
      throw new Error('External scanner plan is not allowed');
    }
    const result = await this.toolbox.executePlan(decision.plan, toolCallId);
    const stdout = limitText(redactText(result.stdout), 16_384);
    const stderr = limitText(redactText(result.stderr), 16_384);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: decision.plan.engine,
        profileId: decision.plan.profileId,
        runner: decision.plan.runner,
        target: redactUrl(input.target),
        command: commandDisplayName(result.command),
        args: result.args.map((value) => redactText(value)),
        cwd: result.cwd,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdout: stdout.text,
        stderr: stderr.text,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
      }),
      redactionState: 'redacted',
      toolCallId,
    });

    // Auto-parse structured scanner output into findings when the service is available.
    // Each engine has a dedicated JSONL/JSON normalizer in ScannerResultImportService.
    const autoParseEngine = autoParseEngineFor(decision.plan.engine);
    if (autoParseEngine && this.scannerResults && result.stdout.trim()) {
      try {
        this.scannerResults.import({
          runId: input.runId,
          source: `${decision.plan.engine}:${request.template}`,
          engine: autoParseEngine,
          content: result.stdout,
          // Confirmation engines (nuclei/sqlmap) create candidate findings; discovery
          // engines (httpx/ffuf/nmap/tlsx) only store evidence + an import record.
          createFindings: autoCreateFindingsFor(autoParseEngine),
        });
      } catch (error) {
        // Parsing failures are non-fatal; raw stdout evidence is already stored above.
        this.events?.record({
          runId: input.runId,
          type: 'scanner.result.import_failed',
          title: 'Scanner result auto-import failed',
          detail: `${autoParseEngine}:${request.template}: ${error instanceof Error ? error.message : 'parse failed'}`,
          level: 'warning',
          entityId: toolCallId,
        });
      }
    }

    return { evidenceId: evidence.id, exitCode: result.exitCode, timedOut: result.timedOut };
  }

  private proposeFinding(input: ToolInvokeInput, startedMs: number): ToolInvokeResult {
    if (!this.findings) {
      const invocation = this.recordInvocation(input, 'blocked', 'Finding service is not configured', input.approvalId);
      return this.finishTool(
        input,
        { status: 'blocked', invocationId: invocation.id, reason: invocation.reason ?? 'Finding service is not configured' },
        startedMs,
        { reason: invocation.reason },
      );
    }
    try {
      const proposal = parseFindingProposalRequest(input.runId, input.args);
      const finding = this.findings.proposeFinding(proposal);
      const invocation = this.recordInvocation(input, 'allowed', undefined, input.approvalId, `stdout://${newId('tool')}`);
      return this.finishTool(
        input,
        { status: 'allowed', invocationId: invocation.id, stdoutRef: invocation.stdoutRef ?? '', findingId: finding.id },
        startedMs,
        { findingId: finding.id, severity: finding.severity, evidenceCount: finding.evidenceIds.length },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const invocation = this.recordInvocation(input, 'blocked', reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
    }
  }

  private useCredentialPlaceholder(input: ToolInvokeInput, startedMs: number): ToolInvokeResult {
    if (!this.credentials) {
      const invocation = this.recordInvocation(input, 'blocked', 'Credential service is not configured', input.approvalId);
      return this.finishTool(
        input,
        { status: 'blocked', invocationId: invocation.id, reason: invocation.reason ?? 'Credential service is not configured' },
        startedMs,
        { reason: invocation.reason },
      );
    }
    try {
      const credential = this.credentials.resolveForUse(input.runId, {
        credentialId: optionalArgText(input.args.credentialId),
        role: optionalArgText(input.args.role),
        label: optionalArgText(input.args.label),
        usedFor: optionalArgText(input.args.usedFor),
      });
      const usedFor = optionalArgText(input.args.usedFor) ?? input.tool;
      const invocation = this.recordInvocation(input, 'allowed', undefined, input.approvalId, `stdout://${newId('tool')}`);
      const evidence = this.evidence.addEvidence({
        runId: input.runId,
        kind: 'command_output',
        content: JSON.stringify({
          tool: 'credential.use_placeholder',
          credentialId: credential.id,
          label: credential.label,
          role: credential.role,
          kind: credential.kind,
          placeholderReference: credential.placeholder,
          allowedUse: credential.allowedUse,
          usedFor,
          secretMaterialStored: false,
          target: redactUrl(input.target),
          createdAt: nowIso(),
        }),
        redactionState: 'redacted',
        toolCallId: invocation.id,
      });
      this.events?.record({
        runId: input.runId,
        type: 'credential.placeholder.used',
        title: 'Credential placeholder used',
        detail: `${credential.label} (${credential.role}) for ${usedFor}`,
        level: 'info',
        entityId: credential.id,
      });
      this.completeInvocation(invocation.id);
      return this.finishTool(
        input,
        {
          status: 'allowed',
          invocationId: invocation.id,
          stdoutRef: invocation.stdoutRef ?? '',
          evidenceId: evidence.id,
        },
        startedMs,
        { credentialId: credential.id, role: credential.role, evidenceId: evidence.id },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const invocation = this.recordInvocation(input, 'blocked', reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
    }
  }

  private compareAccessEvidence(input: ToolInvokeInput, startedMs: number): ToolInvokeResult {
    if (!this.accessReviews) {
      const invocation = this.recordInvocation(input, 'blocked', 'Access review service is not configured', input.approvalId);
      return this.finishTool(
        input,
        { status: 'blocked', invocationId: invocation.id, reason: invocation.reason ?? 'Access review service is not configured' },
        startedMs,
        { reason: invocation.reason },
      );
    }
    const invocation = this.recordInvocation(input, 'allowed', undefined, input.approvalId, `stdout://${newId('tool')}`);
    try {
      const request = parseAccessCompareRequest(input);
      const result = this.accessReviews.compareEvidence({ ...request, toolCallId: invocation.id });
      this.completeInvocation(invocation.id);
      return this.finishTool(
        input,
        {
          status: 'allowed',
          invocationId: invocation.id,
          stdoutRef: invocation.stdoutRef ?? '',
          evidenceId: result.diffEvidenceId,
        },
        startedMs,
        {
          accessReviewId: result.review.id,
          evidenceId: result.diffEvidenceId,
          accessReviewStatus: result.review.status,
        },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.store.state.toolInvocations[invocation.id].status = 'blocked';
      this.store.state.toolInvocations[invocation.id].reason = reason;
      this.store.state.toolInvocations[invocation.id].endedAt = nowIso();
      this.events?.record({
        runId: input.runId,
        type: 'tool.blocked',
        title: 'Tool blocked',
        detail: `${input.tool} ${input.riskLevel} ${redactUrl(input.target)}: ${reason}`,
        level: 'warning',
        entityId: invocation.id,
      });
      this.store.commit();
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
    }
  }

  private startOastSession(input: ToolInvokeInput, startedMs: number): ToolInvokeResult {
    if (!this.oast) {
      const invocation = this.recordInvocation(input, 'blocked', 'OAST service is not configured', input.approvalId);
      return this.finishTool(
        input,
        { status: 'blocked', invocationId: invocation.id, reason: invocation.reason ?? 'OAST service is not configured' },
        startedMs,
        { reason: invocation.reason },
      );
    }
    const invocation = this.recordInvocation(input, 'allowed', undefined, input.approvalId, `stdout://${newId('tool')}`);
    const session = this.oast.start({
      runId: input.runId,
      baseUrl: optionalArgText(input.args.baseUrl) ?? 'http://127.0.0.1:4317',
    });
    this.completeInvocation(invocation.id);
    return this.finishTool(
      input,
      { status: 'allowed', invocationId: invocation.id, stdoutRef: invocation.stdoutRef ?? '' },
      startedMs,
      { oastSessionId: session.id, callbackUrl: session.callbackUrl },
    );
  }

  private recordOastCallback(input: ToolInvokeInput, startedMs: number): ToolInvokeResult {
    if (!this.oast) {
      const invocation = this.recordInvocation(input, 'blocked', 'OAST service is not configured', input.approvalId);
      return this.finishTool(
        input,
        { status: 'blocked', invocationId: invocation.id, reason: invocation.reason ?? 'OAST service is not configured' },
        startedMs,
        { reason: invocation.reason },
      );
    }
    try {
      const invocation = this.recordInvocation(input, 'allowed', undefined, input.approvalId, `stdout://${newId('tool')}`);
      const callback = this.oast.recordCallback({
        sessionId: optionalArgText(input.args.sessionId),
        token: optionalArgText(input.args.token),
        protocol: parseOastProtocol(input.args.protocol),
        method: optionalArgText(input.args.method) ?? input.method,
        path: optionalArgText(input.args.path) ?? input.target,
        headers: parseHeaders(input.args.headers),
        bodyPreview: optionalArgText(input.args.bodyPreview),
        source: optionalArgText(input.args.source) ?? 'tool',
      });
      this.completeInvocation(invocation.id);
      return this.finishTool(
        input,
        {
          status: 'allowed',
          invocationId: invocation.id,
          stdoutRef: invocation.stdoutRef ?? '',
          evidenceId: callback.evidenceId,
        },
        startedMs,
        { oastSessionId: callback.sessionId, evidenceId: callback.evidenceId },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const invocation = this.recordInvocation(input, 'blocked', reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
    }
  }

  private async invokeMcpTool(input: ToolInvokeInput, startedMs: number): Promise<ToolInvokeResult> {
    if (!this.mcp) {
      const invocation = this.recordInvocation(input, 'blocked', 'MCP execution service is not configured', input.approvalId);
      return this.finishTool(
        input,
        { status: 'blocked', invocationId: invocation.id, reason: invocation.reason ?? 'MCP execution service is not configured' },
        startedMs,
        { reason: invocation.reason },
      );
    }

    // Parse required arguments
    const connectionId = optionalArgText(input.args.connectionId);
    const toolName = optionalArgText(input.args.toolName);

    if (!connectionId || !toolName) {
      const reason = 'MCP invocation requires connectionId and toolName';
      const invocation = this.recordInvocation(input, 'blocked', reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
    }

    // Get and validate MCP connection
    const connection = this.mcp.getConnection(connectionId);
    if (!connection) {
      const reason = `MCP connection not found: ${connectionId}`;
      const invocation = this.recordInvocation(input, 'blocked', reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
    }

    if (!connection.isReady()) {
      const reason = `MCP connection ${connectionId} is not ready: ${connection.getState().status}`;
      const invocation = this.recordInvocation(input, 'blocked', reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
    }

    // MCP GOVERNANCE LAYER: Tool Registry Allowlist Check
    // This is the critical gate that enforces MCP tool policies
    const { mcpToolRegistry } = await import('../mcp/mcp-tool-registry.js');
    const toolPolicy = mcpToolRegistry.lookup(connectionId, toolName);

    if (!toolPolicy) {
      const reason = `MCP tool ${toolName} is not registered in the tool registry for connection ${connectionId}`;
      const invocation = this.recordInvocation(input, 'blocked', reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
    }

    if (!toolPolicy.allowed) {
      const reason = `MCP tool ${toolName} is blocked by policy: ${toolPolicy.policyNotes || 'not allowed'}`;
      const invocation = this.recordInvocation(input, 'blocked', reason, input.approvalId);
      return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
    }

    // MCP GOVERNANCE LAYER: Poisoning Detection
    const { mcpPoisonDetector } = await import('../mcp/mcp-poison-detector.js');
    const connectionState = connection.getState();
    const toolMetadata = connectionState.tools.find(t => t.name === toolName);

    // Check tool schema for suspicious patterns
    if (toolMetadata) {
      const schemaCheck = mcpPoisonDetector.checkToolSchema({
        name: toolMetadata.name,
        description: toolMetadata.description,
        inputSchema: toolMetadata.inputSchema,
      });

      if (!schemaCheck.safe) {
        const reason = `MCP tool schema poisoning detected: ${schemaCheck.reason}`;
        const invocation = this.recordInvocation(input, 'blocked', reason, input.approvalId);
        this.events?.record({
          runId: input.runId,
          type: 'tool.blocked',
          title: 'MCP tool poisoning detected',
          detail: `${toolName}: ${schemaCheck.reason}`,
          level: 'error',
          entityId: invocation.id,
        });
        return this.finishTool(input, { status: 'blocked', invocationId: invocation.id, reason }, startedMs, { reason });
      }
    }

    // Parse tool arguments
    const toolArgs = typeof input.args.args === 'object' && input.args.args !== null && !Array.isArray(input.args.args)
      ? (input.args.args as Record<string, unknown>)
      : {};

    // Record allowed invocation
    const invocation = this.recordInvocation(input, 'allowed', undefined, input.approvalId, `stdout://${newId('tool')}`);

    try {
      // Invoke MCP tool through the connection
      const timeoutMs = typeof input.args.timeoutMs === 'number' ? input.args.timeoutMs : 60_000;
      const result = await connection.invokeTool({
        runId: input.runId,
        connectionId,
        toolName,
        args: toolArgs,
        riskLevel: input.riskLevel,
        approvalId: input.approvalId,
        timeoutMs,
      });

      // MCP GOVERNANCE LAYER: Output Content Scanning
      if (result.output && typeof result.output === 'string') {
        const outputCheck = mcpPoisonDetector.checkOutputContent(result.output);
        if (!outputCheck.safe) {
          this.events?.record({
            runId: input.runId,
            type: 'tool.blocked',
            title: 'MCP output poisoning detected',
            detail: `${toolName}: ${outputCheck.reason}`,
            level: 'warning',
            entityId: invocation.id,
          });
          // Note: We still complete the invocation but flag the threat
        }
      }

      // MCP GOVERNANCE LAYER: Apply Output Sanitization
      const { mcpBundleManager } = await import('../mcp/mcp-bundle-manager.js');
      let sanitizedOutput = result.output;
      const bundle = mcpBundleManager.listBundles().find(b => b.connection.id === connectionId);
      if (bundle && typeof result.output === 'string') {
        const sanitization = mcpBundleManager.sanitizeOutput(bundle.id, result.output);
        sanitizedOutput = sanitization.sanitized;
        if (sanitization.appliedRules.length > 0) {
          this.events?.record({
            runId: input.runId,
            type: 'tool.allowed',
            title: 'MCP output sanitized',
            detail: `Applied rules: ${sanitization.appliedRules.join(', ')}`,
            level: 'info',
            entityId: invocation.id,
          });
        }
      }

      this.completeInvocation(invocation.id);

      return this.finishTool(
        input,
        {
          status: 'allowed',
          invocationId: invocation.id,
          stdoutRef: invocation.stdoutRef ?? '',
          evidenceId: result.evidenceId,
        },
        startedMs,
        {
          mcpConnectionId: connectionId,
          mcpToolName: toolName,
          mcpInvocationId: result.invocationId,
          mcpStatus: result.status,
          evidenceId: result.evidenceId,
          durationMs: result.durationMs,
          mcpGovernanceApplied: true,
        },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      // Update invocation status to blocked
      this.store.state.toolInvocations[invocation.id].status = 'blocked';
      this.store.state.toolInvocations[invocation.id].reason = reason;
      this.store.state.toolInvocations[invocation.id].endedAt = nowIso();

      this.events?.record({
        runId: input.runId,
        type: 'tool.blocked',
        title: 'MCP tool invocation failed',
        detail: `${toolName} via ${connectionId}: ${redactText(reason)}`,
        level: 'error',
        entityId: invocation.id,
      });

      this.store.commit();

      return this.finishTool(
        input,
        { status: 'blocked', invocationId: invocation.id, reason },
        startedMs,
        { mcpConnectionId: connectionId, mcpToolName: toolName, reason },
      );
    }
  }

  private async executeEndpointDiscoveryTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const checks = ['/robots.txt', '/.well-known/security.txt', '/security.txt', '/sitemap.xml'];
    const results = [];
    for (const path of checks) {
      const target = resolveTargetPath(input.target, path);
      const response = await fetch(target, {
        method: 'GET',
        headers: request.headers,
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      const body = await response.text();
      results.push({
        path,
        target: redactUrl(target),
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type') ?? undefined,
        bodyPreview: redactText(body).slice(0, 2048),
        bodyTruncated: body.length > 2048,
      });
    }
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: 'builtin',
        profileId: 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        results,
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeTechnologyFingerprintTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: input.method.toUpperCase(),
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    const signals = technologySignals(headers, body);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: input.method.toUpperCase(),
        result: {
          status: response.status,
          statusText: response.statusText,
          signals,
          bodyPreview: redactText(body).slice(0, 2048),
          bodyTruncated: body.length > 2048,
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeCookieFlagsTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: input.method.toUpperCase(),
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const headers = Object.fromEntries(response.headers.entries());
    const cookies = parseSetCookieHeaders(response.headers);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: input.method.toUpperCase(),
        result: {
          status: response.status,
          statusText: response.statusText,
          cookies,
          cookieCount: cookies.length,
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeLinkFormMapTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: input.method.toUpperCase(),
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    const map = extractLinksAndForms(input.target, body);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: input.method.toUpperCase(),
        result: {
          status: response.status,
          statusText: response.statusText,
          ...map,
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeCorsPolicyTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const syntheticOrigin = 'https://authorized-platform-cors-check.invalid';
    const response = await fetch(input.target, {
      method: 'GET',
      headers: { ...request.headers, origin: syntheticOrigin },
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const headers = Object.fromEntries(response.headers.entries());
    const cors = corsPolicySignals(headers, syntheticOrigin);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        request: {
          syntheticOrigin,
          credentialMaterialSent: false,
        },
        result: {
          status: response.status,
          statusText: response.statusText,
          ...cors,
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeCspAnalysisTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: 'GET',
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    const analysis = browserPolicyAnalysis(headers, body);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        result: {
          status: response.status,
          statusText: response.statusText,
          ...analysis,
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeJavaScriptAssetInventoryTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: 'GET',
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    const inventory = extractJavaScriptAssets(input.target, body);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        result: {
          status: response.status,
          statusText: response.statusText,
          ...inventory,
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeCookieScopeAnalysisTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: input.method.toUpperCase(),
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const headers = Object.fromEntries(response.headers.entries());
    const cookies = parseCookieScopeMetadata(response.headers);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: input.method.toUpperCase(),
        result: {
          status: response.status,
          statusText: response.statusText,
          cookieCount: cookies.length,
          cookies,
          summary: cookieScopeSummary(cookies),
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeSecurityTxtPolicyTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const checks = ['/.well-known/security.txt', '/security.txt'];
    const results = [];
    for (const path of checks) {
      const target = resolveTargetPath(input.target, path);
      const response = await fetch(target, {
        method: 'GET',
        headers: { ...request.headers, accept: 'text/plain, text/*;q=0.9, */*;q=0.5' },
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      const body = await response.text();
      results.push(securityTxtPolicyResult(path, target, response.status, response.statusText, response.headers, body));
    }
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        results,
        summary: securityTxtPolicySummary(results),
        limitations: ['No external contact, policy, hiring, or encryption URLs are fetched', 'Body preview is redacted and bounded'],
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeWebSocketDiscoveryPlanTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: 'GET',
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    const discovery = webSocketDiscoveryPlan(input.target, body, headers);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        result: {
          status: response.status,
          statusText: response.statusText,
          ...discovery,
        },
        responseHeaders: redactHeaders(headers),
        limitations: ['No WebSocket handshake', 'No realtime messages sent', 'Endpoint hints are derived from one HTML response only'],
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeSourceMapExposurePlanTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const pageResponse = await fetch(input.target, {
      method: 'GET',
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const body = await pageResponse.text();
    const headers = Object.fromEntries(pageResponse.headers.entries());
    const candidates = sourceMapCandidates(input.target, body);
    const checks = [];
    for (const candidate of candidates.slice(0, 10)) {
      const response = await fetch(candidate, {
        method: 'HEAD',
        headers: request.headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      checks.push(sourceMapHeadResult(candidate, response.status, response.statusText, response.headers));
    }
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET+HEAD',
        result: {
          pageStatus: pageResponse.status,
          pageStatusText: pageResponse.statusText,
          candidateCount: candidates.length,
          checkedCandidates: checks.length,
          checks,
          plan: sourceMapExposurePlan(checks),
        },
        responseHeaders: redactHeaders(headers),
        limitations: ['No source-map body downloads', 'No JavaScript asset downloads', 'Only bounded same-origin HEAD metadata is stored'],
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeRedirectPolicyTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: 'GET',
      headers: request.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const headers = Object.fromEntries(response.headers.entries());
    const redirect = redirectPolicySignals(input.target, response.status, headers);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        result: {
          status: response.status,
          statusText: response.statusText,
          ...redirect,
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeCachePolicyTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const response = await fetch(input.target, {
      method: 'GET',
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const headers = Object.fromEntries(response.headers.entries());
    const cache = cachePolicySignals(headers, response.status);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        result: {
          status: response.status,
          statusText: response.statusText,
          ...cache,
        },
        responseHeaders: redactHeaders(headers),
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeOpenApiDiscoveryTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const checks = ['/openapi.json', '/swagger.json', '/swagger/v1/swagger.json', '/v3/api-docs', '/api-docs'];
    const results = [];
    for (const path of checks) {
      const target = resolveTargetPath(input.target, path);
      const response = await fetch(target, {
        method: 'GET',
        headers: { ...request.headers, accept: 'application/json, application/yaml, text/yaml, text/plain;q=0.8' },
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      const body = await response.text();
      results.push(openApiDiscoveryResult(path, target, response.status, response.statusText, response.headers, body));
    }
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        results,
        summary: openApiDiscoverySummary(results),
        limitations: ['No API operation execution', 'No schema fuzzing', 'Redacted bounded metadata previews only'],
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeOauthOidcMetadataTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const checks = ['/.well-known/openid-configuration', '/.well-known/oauth-authorization-server'];
    const results = [];
    for (const path of checks) {
      const target = resolveTargetPath(input.target, path);
      const response = await fetch(target, {
        method: 'GET',
        headers: { ...request.headers, accept: 'application/json, text/plain;q=0.8' },
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      const body = await response.text();
      results.push(oauthMetadataResult(path, target, response.status, response.statusText, response.headers, body));
    }
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        results,
        summary: oauthMetadataSummary(results),
        limitations: ['No credential material sent', 'No authorization flow, token request, refresh, or revocation call'],
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeGraphqlIntrospectionPlanTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const checks = ['/graphql', '/api/graphql', '/gql'];
    const results = [];
    for (const path of checks) {
      const target = resolveTargetPath(input.target, path);
      const response = await fetch(target, {
        method: 'GET',
        headers: { ...request.headers, accept: 'application/json, text/html, text/plain;q=0.8' },
        redirect: 'manual',
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      const body = await response.text();
      results.push(graphqlEndpointProbeResult(path, target, response.status, response.statusText, response.headers, body));
    }
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        results,
        plan: graphqlIntrospectionPlan(results),
        limitations: ['No introspection query sent', 'No mutation or authenticated probe executed', 'Endpoint body preview is redacted and bounded'],
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeDnsRecordsTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const host = targetHost(input.target);
    const records = await resolveDnsRecords(host);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.network',
        target: redactUrl(input.target),
        host,
        result: records,
        limitations: ['No zone transfer', 'Bounded public DNS record types only'],
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeTlsCertificateTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const host = targetHost(input.target);
    const port = targetPort(input.target) ?? 443;
    const certificate = await readTlsCertificate(host, port, request.timeoutMs);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.network',
        target: redactUrl(input.target),
        host,
        port,
        result: certificate,
        limitations: ['Single TLS handshake only', 'No HTTP request body', 'No TLS interception'],
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeAuthEndpointDiscoveryTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const paths = ['/login', '/signin', '/api/auth', '/oauth/authorize', '/auth', '/sso', '/saml', '/api/login', '/api/v1/auth'];
    const results = [];
    for (const path of paths) {
      const target = resolveTargetPath(input.target, path);
      const res = await fetch(target, {
        method: 'HEAD',
        headers: request.headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      results.push({
        path,
        target: redactUrl(target),
        status: res.status,
        statusText: res.statusText,
        location: res.headers.get('location') ? redactUrl(resolveTargetPath(target, res.headers.get('location') ?? '')) : undefined,
        wwwAuthenticate: res.headers.get('www-authenticate') ?? undefined,
        setsCookie: Boolean(res.headers.get('set-cookie')),
      });
    }
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({ tool: 'scanner.run_template', template: request.template, engine: 'builtin', profileId: 'builtin.web', target: redactUrl(input.target), method: 'HEAD', results, startedAt, endedAt: nowIso() }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeApiVersionDiscoveryTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const paths = ['/v1', '/v2', '/v3', '/api/v1', '/api/v2', '/api/v3', '/rest/v1', '/rest/v2', '/api/v1.0', '/api/v2.0'];
    const results = [];
    for (const path of paths) {
      const target = resolveTargetPath(input.target, path);
      const res = await fetch(target, {
        method: 'HEAD',
        headers: request.headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      results.push({ path, target: redactUrl(target), status: res.status, statusText: res.statusText, contentType: res.headers.get('content-type') ?? undefined });
    }
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({ tool: 'scanner.run_template', template: request.template, engine: 'builtin', profileId: 'builtin.web', target: redactUrl(input.target), method: 'HEAD', results, startedAt, endedAt: nowIso() }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeHostHeaderProbeTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const baseline = await fetch(input.target, { method: 'GET', headers: request.headers, signal: AbortSignal.timeout(request.timeoutMs) });
    const baselineBody = await baseline.text();
    const results: unknown[] = [{ probe: 'baseline', status: baseline.status, bodyLength: baselineBody.length, bodyPreview: redactText(baselineBody).slice(0, 512) }];
    for (const syntheticHost of ['evil.example.com', '127.0.0.1']) {
      const res = await fetch(input.target, { method: 'GET', headers: { ...request.headers, host: syntheticHost }, signal: AbortSignal.timeout(request.timeoutMs) });
      const body = await res.text();
      results.push({
        probe: syntheticHost,
        status: res.status,
        bodyLength: body.length,
        bodyPreview: redactText(body).slice(0, 512),
        differential: { statusDiff: res.status !== baseline.status, bodyLengthDiff: Math.abs(body.length - baselineBody.length) > 100, hostReflected: body.toLowerCase().includes(syntheticHost.toLowerCase()) },
      });
    }
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({ tool: 'scanner.run_template', template: request.template, engine: template?.engine ?? 'builtin', profileId: template?.profileId ?? 'builtin.web', target: redactUrl(input.target), method: 'GET', results, startedAt, endedAt: nowIso() }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private async executeParamProbeTemplate(
    input: ToolInvokeInput,
    toolCallId: string,
    request: ScannerTemplateRequest,
    template?: ToolTemplateProfile,
  ): Promise<ScannerExecutionResult> {
    const startedAt = nowIso();
    const baselineStartedMs = Date.now();
    const baseline = await fetch(input.target, {
      method: 'GET',
      headers: request.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const baselineBody = await baseline.text();
    const baselineSample = responseSample(baseline.status, baseline.headers, baselineBody, Date.now() - baselineStartedMs);
    const parameters = queryParameterNames(input.target).slice(0, 8);
    const probes: Array<Record<string, unknown>> = [];

    for (const parameter of parameters) {
      for (const probe of PARAMETER_PROBES) {
        const target = mutateQueryParameter(input.target, parameter, probe.value);
        const probeStartedMs = Date.now();
        const response = await fetch(target, {
          method: 'GET',
          headers: request.headers,
          redirect: 'manual',
          signal: AbortSignal.timeout(request.timeoutMs),
        });
        const body = await response.text();
        const elapsedMs = Date.now() - probeStartedMs;
        probes.push({
          parameter,
          probe: probe.id,
          target: redactUrl(target),
          status: response.status,
          statusDiff: response.status !== baselineSample.status,
          bodyLength: body.length,
          bodyLengthDiff: Math.abs(body.length - baselineSample.bodyLength),
          contentType: response.headers.get('content-type') ?? undefined,
          reflected: body.includes(probe.value),
          errorSignals: detectWebErrorSignals(body),
          timingMs: elapsedMs,
          timingDiffMs: elapsedMs - baselineSample.timingMs,
          bodyPreview: redactText(body).slice(0, 512),
        });
      }
    }

    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.run_template',
        template: request.template,
        engine: template?.engine ?? 'builtin',
        profileId: template?.profileId ?? 'builtin.web',
        target: redactUrl(input.target),
        method: 'GET',
        parameterCount: parameters.length,
        skipped: parameters.length === 0 ? 'Target URL has no query parameters to mutate' : undefined,
        baseline: baselineSample,
        probes,
        startedAt,
        endedAt: nowIso(),
      }),
      redactionState: 'redacted',
      toolCallId,
    });
    return { evidenceId: evidence.id };
  }

  private finishTool<T extends ToolInvokeResult>(
    input: ToolInvokeInput,
    result: T,
    startedMs: number,
    attributes: Record<string, string | number | boolean | undefined> = {},
  ): T {
    const span = this.observability?.recordDuration({
      runId: input.runId,
      kind: 'tool',
      name: input.tool,
      status: toolSpanStatus(result.status),
      startedMs,
      entityId: result.invocationId,
      attributes: {
        ...attributes,
        tool: input.tool,
        target: input.target,
        method: input.method.toUpperCase(),
        riskLevel: input.riskLevel,
        result: result.status,
      },
    });
    this.observability?.recordCost({
      runId: input.runId,
      source: 'tool',
      unit: 'request',
      quantity: 1,
      tool: input.tool,
      entityId: result.invocationId,
    });
    if (span) {
      this.observability?.recordCost({
        runId: input.runId,
        source: 'tool',
        unit: 'millisecond',
        quantity: span.durationMs,
        tool: input.tool,
        entityId: span.id,
      });
    }
    return result;
  }
}

function scannerPlanAttributes(
  decision: ToolboxPlanDecision | undefined,
): Record<string, string | number | boolean | undefined> {
  if (!decision) {
    return {};
  }
  return {
    reason: decision.allowed ? undefined : decision.reason,
    template: decision.template?.id,
    profileId: decision.template?.profileId ?? decision.profile?.id,
    engine: decision.template?.engine,
    runner: decision.profile?.runner,
    runtimeStatus: decision.profile?.runtimeStatus,
    planCommand: decision.plan?.command,
    planArgs: decision.plan?.args.join(' '),
    externalPlanAllowed: decision.allowed,
  };
}

function terminalGate(gates: ToolPlanPreviewGate[]): ToolPlanPreviewGate | undefined {
  return [...gates].reverse().find((gate) => gate.status === 'blocked' || gate.status === 'approval_required');
}

function scannerPreview(decision: ToolboxPlanDecision | undefined, target: string): ToolPlanScannerPreview | undefined {
  if (!decision) {
    return undefined;
  }
  return {
    template: decision.template
      ? {
          id: decision.template.id,
          name: decision.template.name,
          domain: decision.template.domain,
          engine: decision.template.engine,
          profileId: decision.template.profileId,
          executionMode: decision.template.executionMode,
          defaultRiskLevel: decision.template.defaultRiskLevel,
          evidenceKind: decision.template.evidenceKind,
          riskNotes: [...decision.template.riskNotes],
        }
      : undefined,
    profile: decision.profile
      ? {
          id: decision.profile.id,
          name: decision.profile.name,
          runner: decision.profile.runner,
          available: decision.profile.available,
          runtimeStatus: decision.profile.runtimeStatus,
          reason: decision.profile.reason,
        }
      : undefined,
    toolboxDecision: {
      allowed: decision.allowed,
      reason: decision.allowed ? undefined : decision.reason,
    },
    plan: decision.plan ? planPreview(decision.plan, target) : undefined,
  };
}

function planPreview(plan: ToolboxRunPlan, target: string): ToolPlanScannerPreview['plan'] {
  return {
    templateId: plan.templateId,
    profileId: plan.profileId,
    engine: plan.engine,
    runner: plan.runner,
    command: commandDisplayName(plan.command),
    args: plan.args.map((arg) => redactPlanArg(arg, target)),
    target: redactUrl(plan.target),
    timeoutMs: plan.timeoutMs,
    cwdPolicy: plan.cwdPolicy,
    networkPolicy: plan.networkPolicy,
    evidencePolicy: plan.evidencePolicy,
    approvalRequired: plan.approvalRequired,
  };
}

function redactPlanArg(value: string, target: string): string {
  const redactedTarget = redactUrl(target);
  return redactText(value.replaceAll(target, redactedTarget));
}

function evidencePreview(tool: string, scannerTemplate?: ToolTemplateProfile): ToolPlanPreview['evidence'] {
  if (tool === 'scanner.run_template') {
    return {
      wouldProduce: true,
      kind: scannerTemplate?.evidenceKind ?? 'command_output',
      redactionState: 'redacted',
      policy: 'Scanner output is stored as redacted evidence through the Evidence Engine',
    };
  }
  if (tool === 'http.request' || tool === 'browser.navigate') {
    return {
      wouldProduce: true,
      kind: 'http_exchange',
      redactionState: 'redacted',
      policy: 'HTTP traffic is captured with redacted headers and bounded body previews',
    };
  }
  if (
    tool === 'shell.run_sandboxed' ||
    tool === 'credential.use_placeholder' ||
    tool === 'access.compare_evidence' ||
    tool === 'oast.record_callback' ||
    tool === 'mcp.invoke'
  ) {
    return {
      wouldProduce: true,
      kind: tool === 'oast.record_callback' ? 'oast_callback' : 'command_output',
      redactionState: 'redacted',
      policy: tool === 'mcp.invoke'
        ? 'MCP tool output is stored as raw local-only evidence initially, then redacted if needed'
        : 'Execution output is stored as redacted local evidence',
    };
  }
  if (tool === 'finding.propose') {
    return {
      wouldProduce: false,
      policy: 'Finding creation requires existing same-run evidence references',
    };
  }
  if (tool === 'oast.start_session') {
    return {
      wouldProduce: false,
      policy: 'OAST session creation records run state; callbacks become evidence later',
    };
  }
  return {
    wouldProduce: false,
    policy: 'No evidence output is defined for this tool',
  };
}

function toolSpanStatus(status: ToolInvokeResult['status']) {
  if (status === 'allowed') {
    return 'ok';
  }
  if (status === 'blocked') {
    return 'blocked';
  }
  return 'approval_required';
}

const SECURITY_HEADERS = [
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'strict-transport-security',
];

const PARAMETER_PROBES = [
  { id: 'reflection_marker', value: 'agentred-param-marker-7f3b' },
  { id: 'single_quote', value: "'" },
  { id: 'timing_hint', value: '1 AND 1=1' },
];

function parseFindingProposalRequest(runId: string, args: Record<string, unknown>): ProposeFindingInput {
  return {
    runId,
    title: requiredText(args.title, 'title'),
    severity: parseSeverity(args.severity),
    confidence: parseConfidence(args.confidence),
    affectedAssets: requiredStringList(args.affectedAssets, 'affectedAssets'),
    evidenceIds: requiredStringList(args.evidenceIds, 'evidenceIds'),
    reproSteps: requiredStringList(args.reproSteps, 'reproSteps'),
    impact: requiredText(args.impact, 'impact'),
    remediation: requiredText(args.remediation, 'remediation'),
  };
}

function parseAccessCompareRequest(input: ToolInvokeInput) {
  return {
    runId: input.runId,
    title: optionalArgText(input.args.title) ?? 'Role access evidence comparison',
    target: input.target,
    method: input.method.toUpperCase(),
    baselineCredentialId: optionalArgText(input.args.baselineCredentialId),
    comparisonCredentialId: optionalArgText(input.args.comparisonCredentialId),
    baselineEvidenceId: requiredText(input.args.baselineEvidenceId, 'baselineEvidenceId'),
    comparisonEvidenceId: requiredText(input.args.comparisonEvidenceId, 'comparisonEvidenceId'),
  };
}

function parseSandboxShellRequest(args: Record<string, unknown>): SandboxShellRequest {
  const command = typeof args.command === 'string' ? args.command : '';
  if (!command.trim()) {
    return { command: '', args: [], timeoutMs: 10_000 };
  }
  return {
    command,
    args: parseStringArgs(args.args),
    timeoutMs: typeof args.timeoutMs === 'number' ? Math.min(Math.max(args.timeoutMs, 100), 30_000) : 10_000,
  };
}

function parseScannerTemplateRequest(args: Record<string, unknown>): ScannerTemplateRequest {
  const template = typeof args.template === 'string' ? args.template : '';
  return {
    template,
    headers: parseHeaders(args.headers),
    timeoutMs: typeof args.timeoutMs === 'number' ? Math.min(Math.max(args.timeoutMs, 100), 30_000) : 10_000,
  };
}

function resolveTargetPath(target: string, path: string): string {
  const url = new URL(target);
  return `${url.origin}${path}`;
}

function queryParameterNames(target: string): string[] {
  try {
    return [...new Set(Array.from(new URL(target).searchParams.keys()).filter(Boolean))];
  } catch {
    return [];
  }
}

function mutateQueryParameter(target: string, parameter: string, value: string): string {
  const url = new URL(target);
  url.searchParams.set(parameter, value);
  return url.toString();
}

function responseSample(status: number, headers: Headers, body: string, timingMs: number): ParamProbeResponseSample {
  return {
    status,
    bodyLength: body.length,
    contentType: headers.get('content-type') ?? undefined,
    errorSignals: detectWebErrorSignals(body),
    timingMs,
    bodyPreview: redactText(body).slice(0, 512),
  };
}

function detectWebErrorSignals(body: string): string[] {
  const lower = body.toLowerCase();
  return [
    /\bsql syntax\b|\bmysql\b|\bpostgresql\b|\bsqlite\b|\boracle error\b|\bodbc\b/i.test(body) ? 'sql_error_signal' : undefined,
    lower.includes('stack trace') || lower.includes('traceback') || lower.includes('exception') ? 'stack_trace_signal' : undefined,
    lower.includes('invalid input') || lower.includes('unterminated') || lower.includes('syntax error') ? 'input_parser_error_signal' : undefined,
    lower.includes('typeerror') || lower.includes('referenceerror') || lower.includes('null pointer') ? 'runtime_error_signal' : undefined,
  ].filter((item): item is string => Boolean(item));
}

async function resolveDnsRecords(host: string): Promise<Record<string, unknown>> {
  const [a, aaaa, cname, mx, ns, txt] = await Promise.all([
    resolveDns('A', () => resolve4(host)),
    resolveDns('AAAA', () => resolve6(host)),
    resolveDns('CNAME', () => resolveCname(host)),
    resolveDns('MX', () => resolveMx(host)),
    resolveDns('NS', () => resolveNs(host)),
    resolveDns('TXT', () => resolveTxt(host)),
  ]);
  return { A: a, AAAA: aaaa, CNAME: cname, MX: mx, NS: ns, TXT: txt };
}

async function resolveDns(type: string, resolver: () => Promise<unknown>): Promise<unknown> {
  try {
    return await resolver();
  } catch (error) {
    return { unavailable: true, type, reason: error instanceof Error ? error.message : String(error) };
  }
}

function readTlsCertificate(host: string, port: number, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const socket = tlsConnect({
      host,
      port,
      servername: host,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });
    const finish = (result: Record<string, unknown>) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate(true) as DetailedPeerCertificate | undefined;
      finish({
        authorized: socket.authorized,
        authorizationError: socket.authorizationError,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher(),
        certificate: cert ? summarizeCertificate(cert) : undefined,
      });
    });
    socket.once('timeout', () => finish({ error: 'TLS handshake timed out' }));
    socket.once('error', (error) => finish({ error: error.message }));
  });
}

function summarizeCertificate(cert: DetailedPeerCertificate): Record<string, unknown> {
  return {
    subject: cert.subject,
    issuer: cert.issuer,
    subjectaltname: cert.subjectaltname,
    validFrom: cert.valid_from,
    validTo: cert.valid_to,
    fingerprint256: cert.fingerprint256,
    serialNumber: cert.serialNumber,
  };
}

function targetHost(target: string): string {
  try {
    return new URL(target).hostname;
  } catch {
    return target.replace(/\/.*$/, '');
  }
}

function targetPort(target: string): number | undefined {
  try {
    const url = new URL(target);
    if (url.port) {
      return Number(url.port);
    }
    return url.protocol === 'http:' ? 80 : 443;
  } catch {
    return undefined;
  }
}

function technologySignals(headers: Record<string, string>, body: string): Array<{ source: string; name: string; value: string }> {
  const signals: Array<{ source: string; name: string; value: string }> = [];
  for (const header of ['server', 'x-powered-by', 'x-aspnet-version', 'x-generator']) {
    if (headers[header]) {
      signals.push({ source: 'header', name: header, value: redactText(headers[header]).slice(0, 120) });
    }
  }
  const lower = body.toLowerCase();
  const bodySignals = [
    ['react', ['data-reactroot', '__react', 'react-dom']],
    ['next.js', ['__next_data__', '/_next/']],
    ['nuxt', ['__nuxt__', '/_nuxt/']],
    ['vue', ['data-v-', 'vue.js']],
    ['angular', ['ng-version', 'ng-app']],
    ['wordpress', ['wp-content', 'wp-includes']],
    ['laravel', ['laravel_session']],
  ];
  for (const [name, needles] of bodySignals) {
    if ((needles as string[]).some((needle) => lower.includes(needle))) {
      signals.push({ source: 'body', name: String(name), value: 'observed' });
    }
  }
  return signals.slice(0, 20);
}

function corsPolicySignals(headers: Record<string, string>, syntheticOrigin: string): Record<string, unknown> {
  const allowOrigin = headers['access-control-allow-origin'];
  const allowCredentials = headers['access-control-allow-credentials'];
  const allowMethods = headers['access-control-allow-methods'];
  const exposeHeaders = headers['access-control-expose-headers'];
  const vary = headers.vary;
  const riskSignals = [
    ...(allowOrigin === '*' ? ['access-control-allow-origin wildcard'] : []),
    ...(allowOrigin === syntheticOrigin ? ['origin reflection observed'] : []),
    ...(allowOrigin === '*' && /true/i.test(allowCredentials ?? '') ? ['wildcard origin with credentials flag'] : []),
    ...(!vary || !/\borigin\b/i.test(vary) ? ['Vary: Origin missing when CORS headers are present'] : []),
  ];
  return {
    corsHeaders: {
      accessControlAllowOrigin: allowOrigin,
      accessControlAllowCredentials: allowCredentials,
      accessControlAllowMethods: allowMethods,
      accessControlExposeHeaders: exposeHeaders,
      vary,
    },
    policy: {
      allowAnyOrigin: allowOrigin === '*',
      reflectsSyntheticOrigin: allowOrigin === syntheticOrigin,
      credentialsAllowed: /true/i.test(allowCredentials ?? ''),
      methods: splitHeaderList(allowMethods),
      exposedHeaders: splitHeaderList(exposeHeaders),
      varyIncludesOrigin: Boolean(vary && /\borigin\b/i.test(vary)),
    },
    riskSignals,
  };
}

function browserPolicyAnalysis(headers: Record<string, string>, body: string): Record<string, unknown> {
  const headerCsp = headers['content-security-policy'];
  const reportOnlyCsp = headers['content-security-policy-report-only'];
  const metaCsp = extractMetaCsp(body);
  const effectiveCsp = headerCsp || metaCsp;
  const directives = effectiveCsp ? parseCspDirectives(effectiveCsp) : {};
  const riskSignals = [
    ...(!effectiveCsp ? ['content-security-policy missing'] : []),
    ...(directiveContains(directives, 'script-src', "'unsafe-inline'") ? ['script-src allows unsafe-inline'] : []),
    ...(directiveContains(directives, 'script-src', "'unsafe-eval'") ? ['script-src allows unsafe-eval'] : []),
    ...(effectiveCsp && !directives['object-src'] ? ['object-src directive missing'] : []),
    ...(effectiveCsp && !directives['base-uri'] ? ['base-uri directive missing'] : []),
    ...(effectiveCsp && !directives['frame-ancestors'] && !headers['x-frame-options'] ? ['frame ancestors and x-frame-options missing'] : []),
    ...(!headers['x-content-type-options'] ? ['x-content-type-options missing'] : []),
    ...(!headers['referrer-policy'] ? ['referrer-policy missing'] : []),
    ...(!headers['permissions-policy'] ? ['permissions-policy missing'] : []),
  ];
  return {
    policies: {
      contentSecurityPolicy: headerCsp ? redactText(headerCsp).slice(0, 2000) : undefined,
      contentSecurityPolicyReportOnly: reportOnlyCsp ? redactText(reportOnlyCsp).slice(0, 2000) : undefined,
      metaContentSecurityPolicy: metaCsp ? redactText(metaCsp).slice(0, 2000) : undefined,
      xFrameOptions: headers['x-frame-options'],
      xContentTypeOptions: headers['x-content-type-options'],
      referrerPolicy: headers['referrer-policy'],
      permissionsPolicy: headers['permissions-policy'] ? redactText(headers['permissions-policy']).slice(0, 1000) : undefined,
    },
    directives,
    riskSignals,
  };
}

function extractJavaScriptAssets(target: string, body: string): Record<string, unknown> {
  const base = new URL(target);
  const scriptTags = [...body.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  const scripts = scriptTags
    .map((tag) => {
      const src = attrValue(tag, 'src');
      const normalized = src ? normalizeUrl(base, src) : undefined;
      return {
        src: normalized,
        type: attrValue(tag, 'type'),
        async: /\basync\b/i.test(tag),
        defer: /\bdefer\b/i.test(tag),
        integrity: Boolean(attrValue(tag, 'integrity')),
        crossorigin: attrValue(tag, 'crossorigin'),
      };
    })
    .filter((script) => script.src);
  const sameOrigin = scripts.filter((script) => script.src && safeOrigin(script.src) === base.origin);
  const external = scripts.filter((script) => script.src && safeOrigin(script.src) !== base.origin);
  const sourceMapHints = scripts
    .map((script) => script.src)
    .filter((src): src is string => Boolean(src && /\.map(?:$|[?#])/i.test(src)))
    .slice(0, 25);
  const inlineScriptCount = scriptTags.filter((tag) => !attrValue(tag, 'src')).length;
  return {
    scriptCount: scriptTags.length,
    inlineScriptCount,
    sameOriginScriptCount: sameOrigin.length,
    externalScriptCount: external.length,
    moduleScriptCount: scripts.filter((script) => /module/i.test(script.type ?? '')).length,
    scripts: sameOrigin.slice(0, 50).map((script) => ({
      src: redactUrl(script.src ?? ''),
      type: script.type,
      async: script.async,
      defer: script.defer,
      integrity: script.integrity,
      crossorigin: script.crossorigin,
    })),
    externalHosts: [...new Set(external.map((script) => (script.src ? new URL(script.src).hostname : '')).filter(Boolean))].slice(0, 25),
    sourceMapHints: sourceMapHints.map(redactUrl),
    riskSignals: [
      ...(inlineScriptCount > 0 ? [`${inlineScriptCount} inline script block(s) observed`] : []),
      ...(external.some((script) => !script.integrity) ? ['external script without subresource integrity observed'] : []),
      ...(sourceMapHints.length > 0 ? ['script source-map URL hint observed'] : []),
    ],
    truncated: scripts.length > 50 || external.length > 25,
  };
}

function parseCookieScopeMetadata(headers: Headers): Array<Record<string, unknown>> {
  return getSetCookieValues(headers)
    .slice(0, 50)
    .map((cookie) => {
      const [nameValue, ...attrs] = cookie.split(';').map((part) => part.trim());
      const name = redactText(nameValue.split('=')[0] ?? '').slice(0, 80) || '[unnamed]';
      const attributes = cookieAttributeMap(attrs);
      const domain = textMapValue(attributes, 'domain');
      const path = textMapValue(attributes, 'path');
      const maxAge = textMapValue(attributes, 'max-age');
      const expires = textMapValue(attributes, 'expires');
      const sameSite = textMapValue(attributes, 'samesite');
      const prefix = cookiePrefix(name);
      const secure = attributes.has('secure');
      const httpOnly = attributes.has('httponly');
      const partitioned = attributes.has('partitioned');
      const hostOnly = !domain;
      const riskSignals = [
        ...(domain && domain.startsWith('.') ? ['broad parent-domain cookie scope'] : []),
        ...(path === '/' ? ['root path cookie scope'] : []),
        ...(sameSite && sameSite.toLowerCase() === 'none' && !secure ? ['SameSite=None without Secure'] : []),
        ...(prefix === '__Host-' && (domain || path !== '/' || !secure) ? ['__Host- prefix requirements not met'] : []),
        ...(prefix === '__Secure-' && !secure ? ['__Secure- prefix without Secure'] : []),
        ...(maxAge === undefined && expires === undefined ? ['session cookie lifetime'] : []),
      ];
      return {
        name,
        prefix,
        secure,
        httpOnly,
        sameSite,
        partitioned,
        hostOnly,
        domain: domain ? redactText(domain).slice(0, 160) : undefined,
        path: path ? redactText(path).slice(0, 160) : undefined,
        maxAgeSeconds: numericDirective(maxAge),
        expires: expires ? redactText(expires).slice(0, 160) : undefined,
        valueStored: false,
        riskSignals,
      };
    });
}

function cookieScopeSummary(cookies: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    cookies: cookies.length,
    hostOnly: cookies.filter((cookie) => cookie.hostOnly).length,
    broadDomain: cookies.filter((cookie) => (cookie.riskSignals as string[] | undefined)?.includes('broad parent-domain cookie scope')).length,
    rootPath: cookies.filter((cookie) => (cookie.riskSignals as string[] | undefined)?.includes('root path cookie scope')).length,
    partitioned: cookies.filter((cookie) => cookie.partitioned).length,
    prefixIssues: cookies.filter((cookie) =>
      (cookie.riskSignals as string[] | undefined)?.some((signal) => signal.includes('prefix')),
    ).length,
    riskSignals: [...new Set(cookies.flatMap((cookie) => (cookie.riskSignals as string[] | undefined) ?? []))].slice(0, 20),
  };
}

function securityTxtPolicyResult(
  path: string,
  target: string,
  status: number,
  statusText: string,
  headers: Headers,
  body: string,
): Record<string, unknown> {
  const contentType = headers.get('content-type') ?? undefined;
  const fields = parseSecurityTxt(body);
  const expires = fields.expires[0];
  const expiresAt = expires ? Date.parse(expires) : Number.NaN;
  const found = status >= 200 && status < 300 && (fields.contact.length > 0 || fields.policy.length > 0 || fields.expires.length > 0);
  const riskSignals = [
    ...(found && fields.contact.length === 0 ? ['Contact field missing'] : []),
    ...(found && fields.expires.length === 0 ? ['Expires field missing'] : []),
    ...(found && Number.isFinite(expiresAt) && expiresAt < Date.now() ? ['security.txt expired'] : []),
    ...(found && !/text\/plain/i.test(contentType ?? '') ? ['security.txt content-type is not text/plain'] : []),
    ...(found && fields.encryption.length === 0 ? ['Encryption field missing'] : []),
  ];
  return {
    path,
    target: redactUrl(target),
    status,
    statusText,
    contentType,
    found,
    fields,
    riskSignals,
    bodyPreview: found ? redactText(body).slice(0, 2048) : undefined,
    bodyTruncated: found && body.length > 2048,
  };
}

function securityTxtPolicySummary(results: Array<Record<string, unknown>>): Record<string, unknown> {
  const found = results.filter((item) => item.found);
  return {
    checkedPaths: results.length,
    documentsFound: found.length,
    preferredPathFound: found.some((item) => item.path === '/.well-known/security.txt'),
    riskSignals:
      found.length > 0
        ? [...new Set(found.flatMap((item) => (item.riskSignals as string[] | undefined) ?? []))]
        : ['no security.txt document observed on bounded paths'],
  };
}

function webSocketDiscoveryPlan(target: string, body: string, headers: Record<string, string>): Record<string, unknown> {
  const base = new URL(target);
  const directUrls = uniqueMatches(body, /\b(wss?:\/\/[^"'`<>\s)]+)/gi)
    .map((url) => redactUrl(url))
    .slice(0, 25);
  const pathHints = uniqueMatches(body, /["'`](\/(?:socket\.io|ws|websocket|realtime|subscriptions|events)[^"'`<>\s]*)["'`]/gi)
    .map((path) => normalizeUrl(base, path))
    .filter((url): url is string => Boolean(url && safeOrigin(url) === base.origin))
    .map(redactUrl)
    .slice(0, 25);
  const libraryHints = [
    body.match(/socket\.io/i) ? 'socket.io' : undefined,
    body.match(/new\s+WebSocket/i) ? 'WebSocket constructor' : undefined,
    body.match(/graphql-ws|subscriptions-transport-ws/i) ? 'GraphQL subscription client' : undefined,
    body.match(/EventSource/i) ? 'EventSource/SSE' : undefined,
    body.match(/SignalR/i) ? 'SignalR' : undefined,
  ].filter((item): item is string => Boolean(item));
  const upgradeHeader = headers.upgrade;
  const candidates = [...new Set([...directUrls, ...pathHints])];
  return {
    directUrls,
    pathHints,
    libraryHints,
    upgradeHeader,
    candidateCount: candidates.length,
    connectionAttempted: false,
    messagesSent: false,
    recommendedRiskLevelForLiveValidation: 'R3',
    operatorChecks: [
      'Confirm WebSocket testing is in scope before opening a handshake.',
      'Bind authenticated realtime checks to credential references and approval records.',
      'Capture request/response transcript as evidence before proposing realtime authorization findings.',
    ],
    riskSignals:
      candidates.length > 0 || libraryHints.length > 0
        ? ['Realtime or WebSocket endpoint hints observed; live validation is a separate approval-gated action']
        : ['no WebSocket or realtime endpoint hints observed in one HTML response'],
  };
}

function sourceMapCandidates(target: string, body: string): string[] {
  const base = new URL(target);
  const scriptTags = [...body.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  const scriptCandidates = scriptTags
    .map((tag) => attrValue(tag, 'src'))
    .map((src) => (src ? normalizeUrl(base, src) : undefined))
    .filter((src): src is string => Boolean(src && safeOrigin(src) === base.origin))
    .flatMap((src) => {
      const url = new URL(src);
      url.hash = '';
      url.search = '';
      const plain = url.toString();
      return /\.map$/i.test(url.pathname) ? [plain] : /\.js$/i.test(url.pathname) ? [`${plain}.map`] : [];
    });
  const explicitHints = uniqueMatches(body, /sourceMappingURL=([^\s"'`<>]+)/gi)
    .map((hint) => normalizeUrl(base, hint))
    .filter((url): url is string => Boolean(url && safeOrigin(url) === base.origin && /\.map(?:$|[?#])/i.test(url)));
  return [...new Set([...explicitHints, ...scriptCandidates])].slice(0, 25);
}

function sourceMapHeadResult(target: string, status: number, statusText: string, headers: Headers): Record<string, unknown> {
  const contentLength = headers.get('content-length');
  const contentType = headers.get('content-type') ?? undefined;
  const location = headers.get('location');
  return {
    target: redactUrl(target),
    status,
    statusText,
    contentType,
    contentLength: contentLength ? Number(contentLength) : undefined,
    location: location ? redactUrl(normalizeUrl(new URL(target), location) ?? location) : undefined,
    bodyDownloaded: false,
    riskSignals: [
      ...(status >= 200 && status < 300 ? ['source-map candidate metadata is reachable'] : []),
      ...(status >= 300 && status < 400 ? ['source-map candidate redirects'] : []),
      ...(contentType && !/json|map|javascript|octet-stream|text/i.test(contentType) ? ['unexpected source-map content-type'] : []),
    ],
  };
}

function sourceMapExposurePlan(results: Array<Record<string, unknown>>): Record<string, unknown> {
  const reachable = results.filter((item) => typeof item.status === 'number' && item.status >= 200 && item.status < 300);
  return {
    reachableCandidates: reachable.length,
    bodyDownloadsPerformed: false,
    recommendedRiskLevelForBodyReview: 'R3',
    operatorChecks: [
      'Confirm source-map body review is authorized before downloading map contents.',
      'Store map body as local-only evidence unless redacted for cloud sync.',
      'Review whether maps disclose source, comments, internal URLs, or secrets before proposing a finding.',
    ],
    riskSignals:
      reachable.length > 0
        ? ['source-map metadata reachable; body review requires separate approval']
        : ['no reachable source-map metadata observed with bounded HEAD checks'],
  };
}

function redirectPolicySignals(target: string, status: number, headers: Record<string, string>): Record<string, unknown> {
  const base = new URL(target);
  const location = headers.location;
  const normalizedLocation = location ? normalizeUrl(base, location) : undefined;
  const locationOrigin = normalizedLocation ? safeOrigin(normalizedLocation) : undefined;
  const isRedirect = status >= 300 && status < 400;
  const isHttps = base.protocol === 'https:';
  const riskSignals = [
    ...(isRedirect && normalizedLocation && locationOrigin !== base.origin ? ['cross-origin redirect location observed'] : []),
    ...(!isHttps && !isRedirect ? ['plain HTTP target did not issue a redirect'] : []),
    ...(isHttps && !headers['strict-transport-security'] ? ['strict-transport-security missing on HTTPS response'] : []),
    ...(isRedirect && !location ? ['redirect status without Location header'] : []),
  ];
  return {
    redirect: {
      isRedirect,
      location: normalizedLocation ? redactUrl(normalizedLocation) : undefined,
      sameOriginLocation: normalizedLocation ? locationOrigin === base.origin : undefined,
      locationScheme: normalizedLocation ? new URL(normalizedLocation).protocol.replace(':', '') : undefined,
    },
    canonicalization: {
      sourceScheme: base.protocol.replace(':', ''),
      strictTransportSecurity: headers['strict-transport-security'],
      cacheControl: headers['cache-control'],
      referrerPolicy: headers['referrer-policy'],
    },
    riskSignals,
  };
}

function cachePolicySignals(headers: Record<string, string>, status: number): Record<string, unknown> {
  const cacheControl = headers['cache-control'];
  const directives = parseCacheControl(cacheControl);
  const pragma = headers.pragma;
  const expires = headers.expires;
  const vary = headers.vary;
  const etag = headers.etag;
  const setCookiePresent = Boolean(headers['set-cookie']);
  const hasPublicCache = directives.public || Boolean(directives['s-maxage']);
  const explicitlyPrivate = directives.private || directives['no-store'] || directives['no-cache'];
  const riskSignals = [
    ...(!cacheControl ? ['cache-control missing'] : []),
    ...(setCookiePresent && hasPublicCache ? ['set-cookie response appears publicly cacheable'] : []),
    ...(status >= 200 && status < 300 && !etag && !headers['last-modified'] ? ['validator headers missing'] : []),
    ...(vary && vary === '*' ? ['Vary wildcard observed'] : []),
    ...(cacheControl && !explicitlyPrivate && !hasPublicCache ? ['cache policy lacks explicit private/no-store/public intent'] : []),
  ];
  return {
    cacheHeaders: {
      cacheControl,
      pragma,
      expires,
      vary,
      etagPresent: Boolean(etag),
      lastModifiedPresent: Boolean(headers['last-modified']),
      age: headers.age,
      cdnCacheStatus: cdnCacheStatus(headers),
    },
    policy: {
      directives,
      setCookiePresent,
      explicitlyPrivate,
      publiclyCacheable: hasPublicCache,
      noStore: Boolean(directives['no-store']),
      noCache: Boolean(directives['no-cache']),
      maxAgeSeconds: numericDirective(directives['max-age']),
      sharedMaxAgeSeconds: numericDirective(directives['s-maxage']),
    },
    riskSignals,
  };
}

function openApiDiscoveryResult(
  path: string,
  target: string,
  status: number,
  statusText: string,
  headers: Headers,
  body: string,
): Record<string, unknown> {
  const contentType = headers.get('content-type') ?? undefined;
  const parsed = parseJsonObject(body);
  const signals = openApiSignals(parsed, body);
  return {
    path,
    target: redactUrl(target),
    status,
    statusText,
    contentType,
    ...signals,
    bodyPreview: status >= 200 && status < 300 && signals.looksLikeSpec ? redactText(body).slice(0, 2048) : undefined,
    bodyTruncated: signals.looksLikeSpec && body.length > 2048,
  };
}

function openApiDiscoverySummary(results: Array<Record<string, unknown>>): Record<string, unknown> {
  const matches = results.filter((item) => item.looksLikeSpec);
  return {
    checkedPaths: results.length,
    candidateSpecs: matches.length,
    candidatePaths: matches.map((item) => item.path).filter(Boolean).slice(0, 10),
    riskSignals:
      matches.length > 0
        ? ['public API specification metadata observed']
        : ['no OpenAPI/Swagger metadata observed on bounded paths'],
  };
}

function oauthMetadataResult(
  path: string,
  target: string,
  status: number,
  statusText: string,
  headers: Headers,
  body: string,
): Record<string, unknown> {
  const contentType = headers.get('content-type') ?? undefined;
  const parsed = parseJsonObject(body);
  const metadata = parsed ? oauthMetadataSignals(parsed) : undefined;
  return {
    path,
    target: redactUrl(target),
    status,
    statusText,
    contentType,
    metadataFound: Boolean(metadata),
    metadata,
    bodyPreview: status >= 200 && status < 300 && !metadata ? redactText(body).slice(0, 512) : undefined,
    bodyTruncated: !metadata && body.length > 512,
  };
}

function oauthMetadataSummary(results: Array<Record<string, unknown>>): Record<string, unknown> {
  const found = results.filter((item) => item.metadataFound);
  return {
    checkedPaths: results.length,
    metadataDocuments: found.length,
    issuers: found
      .map((item) => {
        const metadata = item.metadata as Record<string, unknown> | undefined;
        return metadata?.issuer;
      })
      .filter(Boolean)
      .slice(0, 10),
    riskSignals:
      found.length > 0
        ? ['public OAuth/OIDC metadata observed; review redirect, issuer, signing algorithm, and grant support manually']
        : ['no OAuth/OIDC well-known metadata observed on bounded paths'],
  };
}

function graphqlEndpointProbeResult(
  path: string,
  target: string,
  status: number,
  statusText: string,
  headers: Headers,
  body: string,
): Record<string, unknown> {
  const contentType = headers.get('content-type') ?? undefined;
  const signals = graphqlSignals(contentType, body, status);
  return {
    path,
    target: redactUrl(target),
    status,
    statusText,
    contentType,
    allow: headers.get('allow') ?? undefined,
    location: headers.get('location') ? redactUrl(normalizeUrl(new URL(target), headers.get('location') ?? '') ?? headers.get('location') ?? '') : undefined,
    ...signals,
    bodyPreview: redactText(body).slice(0, 512),
    bodyTruncated: body.length > 512,
  };
}

function graphqlIntrospectionPlan(results: Array<Record<string, unknown>>): Record<string, unknown> {
  const candidates = results.filter((item) => item.graphqlLikely || (typeof item.status === 'number' && item.status < 500 && item.status !== 404));
  return {
    candidateEndpoints: candidates.map((item) => item.target).slice(0, 10),
    introspectionExecuted: false,
    mutationExecuted: false,
    recommendedRiskLevelForLiveIntrospection: 'R3',
    requiresHumanApproval: true,
    operatorChecks: [
      'Confirm the program explicitly allows GraphQL schema introspection before sending introspection queries.',
      'Bind any authenticated GraphQL validation to a run-local credential reference and approval record.',
      'Store schema or error output as redacted evidence before proposing a finding.',
    ],
    riskSignals:
      candidates.length > 0
        ? ['GraphQL endpoint candidate observed; live introspection is a separate approval-gated action']
        : ['no GraphQL endpoint candidate observed on bounded paths'],
  };
}

function parseSetCookieHeaders(headers: Headers): Array<{
  name: string;
  flags: { secure: boolean; httpOnly: boolean; sameSite: boolean };
  missingFlags: string[];
}> {
  const values = getSetCookieValues(headers);
  return values.slice(0, 25).map((cookie) => {
    const [nameValue, ...attrs] = cookie.split(';').map((part) => part.trim());
    const name = redactText(nameValue.split('=')[0] ?? '').slice(0, 80) || '[unnamed]';
    const normalizedAttrs = attrs.map((attr) => attr.toLowerCase());
    const flags = {
      secure: normalizedAttrs.includes('secure'),
      httpOnly: normalizedAttrs.includes('httponly'),
      sameSite: normalizedAttrs.some((attr) => attr.startsWith('samesite=')),
    };
    const missingFlags = [
      flags.secure ? undefined : 'secure',
      flags.httpOnly ? undefined : 'httponly',
      flags.sameSite ? undefined : 'samesite',
    ].filter((flag): flag is string => Boolean(flag));
    return { name, flags, missingFlags };
  });
}

function getSetCookieValues(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie();
  }
  const combined = headers.get('set-cookie');
  if (!combined) {
    return [];
  }
  return combined.split(/,(?=\s*[^;,=\s]+=[^;,]+)/).map((value) => value.trim()).filter(Boolean);
}

function cookieAttributeMap(attrs: string[]): Map<string, string | true> {
  const result = new Map<string, string | true>();
  for (const attr of attrs) {
    const separator = attr.indexOf('=');
    if (separator === -1) {
      result.set(attr.toLowerCase(), true);
      continue;
    }
    const key = attr.slice(0, separator).trim().toLowerCase();
    const value = attr.slice(separator + 1).trim().replace(/^"|"$/g, '');
    if (key) {
      result.set(key, value);
    }
  }
  return result;
}

function textMapValue(input: Map<string, string | true>, key: string): string | undefined {
  const value = input.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cookiePrefix(name: string): '__Host-' | '__Secure-' | undefined {
  if (name.startsWith('__Host-')) {
    return '__Host-';
  }
  if (name.startsWith('__Secure-')) {
    return '__Secure-';
  }
  return undefined;
}

function splitHeaderList(value: string | undefined): string[] {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 50) : [];
}

function parseCacheControl(value: string | undefined): Record<string, string | boolean> {
  const directives: Record<string, string | boolean> = {};
  if (!value) {
    return directives;
  }
  for (const part of value.split(',')) {
    const [rawKey, rawValue] = part.trim().split('=', 2);
    const key = rawKey?.trim().toLowerCase();
    if (!key) {
      continue;
    }
    directives[key] = rawValue === undefined ? true : rawValue.trim().replace(/^"|"$/g, '');
  }
  return directives;
}

function numericDirective(value: string | boolean | undefined): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cdnCacheStatus(headers: Record<string, string>): Record<string, string | undefined> {
  return {
    cfCacheStatus: headers['cf-cache-status'],
    xCache: headers['x-cache'],
    xCacheStatus: headers['x-cache-status'],
    fastlyCache: headers['x-served-by'] ? headers['x-cache'] : undefined,
    age: headers.age,
  };
}

function parseJsonObject(body: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function openApiSignals(parsed: Record<string, unknown> | undefined, body: string): Record<string, unknown> {
  const openapi = typeof parsed?.openapi === 'string' ? parsed.openapi : undefined;
  const swagger = typeof parsed?.swagger === 'string' ? parsed.swagger : undefined;
  const info = parsed?.info && typeof parsed.info === 'object' && !Array.isArray(parsed.info)
    ? (parsed.info as Record<string, unknown>)
    : undefined;
  const paths = parsed?.paths && typeof parsed.paths === 'object' && !Array.isArray(parsed.paths)
    ? (parsed.paths as Record<string, unknown>)
    : undefined;
  const bodyLooksLikeSpec = /(?:openapi|swagger)\s*[:=]/i.test(body.slice(0, 4096));
  const looksLikeSpec = Boolean(openapi || swagger || (paths && info) || bodyLooksLikeSpec);
  return {
    looksLikeSpec,
    spec: {
      openapi,
      swagger,
      title: typeof info?.title === 'string' ? redactText(info.title).slice(0, 200) : undefined,
      version: typeof info?.version === 'string' ? redactText(info.version).slice(0, 80) : undefined,
      pathCount: paths ? Object.keys(paths).length : undefined,
      serverCount: Array.isArray(parsed?.servers) ? parsed.servers.length : undefined,
    },
    riskSignals: looksLikeSpec ? ['OpenAPI/Swagger metadata candidate observed'] : [],
  };
}

function oauthMetadataSignals(parsed: Record<string, unknown>): Record<string, unknown> | undefined {
  const issuer = textField(parsed, 'issuer');
  const authorizationEndpoint = urlField(parsed, 'authorization_endpoint');
  const tokenEndpoint = urlField(parsed, 'token_endpoint');
  const jwksUri = urlField(parsed, 'jwks_uri');
  const responseTypes = stringArrayField(parsed, 'response_types_supported');
  const grantTypes = stringArrayField(parsed, 'grant_types_supported');
  const scopes = splitOauthScopes(parsed.scopes_supported);
  const signingAlgorithms = stringArrayField(parsed, 'id_token_signing_alg_values_supported');
  if (!issuer && !authorizationEndpoint && !tokenEndpoint && !jwksUri) {
    return undefined;
  }
  return {
    issuer: issuer ? redactUrl(issuer) : undefined,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
    responseTypes,
    grantTypes,
    scopes,
    signingAlgorithms,
    riskSignals: [
      ...(grantTypes.includes('password') ? ['resource owner password grant advertised'] : []),
      ...(signingAlgorithms.includes('none') ? ['unsigned id token algorithm advertised'] : []),
      ...(!jwksUri ? ['jwks_uri missing from metadata'] : []),
    ],
  };
}

function graphqlSignals(contentType: string | undefined, body: string, status: number): Record<string, unknown> {
  const lower = body.toLowerCase();
  const bodySignals = [
    lower.includes('graphql') ? 'graphql keyword in response' : undefined,
    lower.includes('query') && lower.includes('variable') ? 'query/variables language in response' : undefined,
    lower.includes('must provide query') ? 'missing query error shape' : undefined,
    lower.includes('cannot query field') ? 'graphql field error shape' : undefined,
  ].filter((item): item is string => Boolean(item));
  const contentTypeSignal = Boolean(contentType && /graphql|json/i.test(contentType));
  const graphqlLikely = status !== 404 && (contentTypeSignal || bodySignals.length > 0);
  return {
    graphqlLikely,
    signals: bodySignals,
    introspectionExecuted: false,
    mutationExecuted: false,
    riskSignals: graphqlLikely ? ['GraphQL endpoint candidate signal observed'] : [],
  };
}

function textField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function urlField(input: Record<string, unknown>, key: string): string | undefined {
  const value = textField(input, key);
  return value ? redactUrl(value) : undefined;
}

function stringArrayField(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string').map((item) => redactText(item).slice(0, 120)).slice(0, 50);
}

function splitOauthScopes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').slice(0, 80);
  }
  if (typeof value === 'string') {
    return value.split(/\s+/).filter(Boolean).slice(0, 80);
  }
  return [];
}

function parseSecurityTxt(body: string): Record<string, string[]> {
  const fields: Record<string, string[]> = {
    contact: [],
    expires: [],
    encryption: [],
    acknowledgments: [],
    policy: [],
    hiring: [],
    canonical: [],
    preferredLanguages: [],
  };
  for (const rawLine of body.split(/\r?\n/).slice(0, 200)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = redactSecurityTxtValue(line.slice(separator + 1).trim());
    if (!value) {
      continue;
    }
    if (key === 'contact') fields.contact.push(value);
    if (key === 'expires') fields.expires.push(value);
    if (key === 'encryption') fields.encryption.push(value);
    if (key === 'acknowledgments') fields.acknowledgments.push(value);
    if (key === 'policy') fields.policy.push(value);
    if (key === 'hiring') fields.hiring.push(value);
    if (key === 'canonical') fields.canonical.push(value);
    if (key === 'preferred-languages') fields.preferredLanguages.push(value);
  }
  return Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, values.slice(0, 20)]));
}

function redactSecurityTxtValue(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    return redactUrl(value).slice(0, 500);
  }
  return redactText(value).slice(0, 500);
}

function extractMetaCsp(body: string): string | undefined {
  for (const match of body.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const httpEquiv = attrValue(tag, 'http-equiv');
    if (httpEquiv && /^content-security-policy$/i.test(httpEquiv)) {
      return attrValue(tag, 'content');
    }
  }
  return undefined;
}

function parseCspDirectives(csp: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const name = tokens.shift();
    if (name) {
      directives[name.toLowerCase()] = tokens.slice(0, 40);
    }
  }
  return directives;
}

function directiveContains(directives: Record<string, string[]>, name: string, value: string): boolean {
  return (directives[name] ?? directives['default-src'] ?? []).some((item) => item.toLowerCase() === value.toLowerCase());
}

function extractLinksAndForms(target: string, body: string): {
  links: string[];
  forms: Array<{ method: string; action: string }>;
  externalLinkCount: number;
  truncated: boolean;
} {
  const base = new URL(target);
  const links = uniqueMatches(body, /\bhref\s*=\s*["']([^"']+)["']/gi)
    .map((href) => normalizeUrl(base, href))
    .filter((href): href is string => Boolean(href));
  const forms = [...body.matchAll(/<form\b[^>]*>/gi)].map((match) => {
    const tag = match[0];
    const action = attrValue(tag, 'action') ?? target;
    const method = (attrValue(tag, 'method') ?? 'GET').toUpperCase();
    return { method, action: normalizeUrl(base, action) ?? redactUrl(action).slice(0, 500) };
  });
  const sameOriginLinks = links.filter((link) => safeOrigin(link) === base.origin);
  return {
    links: sameOriginLinks.slice(0, 50).map(redactUrl),
    forms: forms.slice(0, 25).map((form) => ({ method: form.method, action: redactUrl(form.action) })),
    externalLinkCount: links.length - sameOriginLinks.length,
    truncated: links.length > 50 || forms.length > 25,
  };
}

function uniqueMatches(body: string, pattern: RegExp): string[] {
  return [...new Set([...body.matchAll(pattern)].map((match) => match[1]).filter((value): value is string => Boolean(value)))];
}

function attrValue(tag: string, attr: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1];
}

function normalizeUrl(base: URL, value: string): string | undefined {
  if (value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('javascript:') || value.startsWith('tel:')) {
    return undefined;
  }
  try {
    return new URL(value, base).toString();
  } catch {
    return undefined;
  }
}

function safeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function parseStringArgs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function requiredStringList(value: unknown, field: string): string[] {
  const values = parseStringArgs(value).map((item) => item.trim()).filter(Boolean);
  if (values.length === 0) {
    throw new Error(`Finding proposal requires ${field}`);
  }
  return values;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Finding proposal requires ${field}`);
  }
  return value.trim();
}

function parseSeverity(value: unknown): Severity {
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low' || value === 'info') {
    return value;
  }
  throw new Error(`Invalid finding severity: ${String(value)}`);
}

function parseConfidence(value: unknown): Confidence {
  if (value === 'confirmed' || value === 'likely' || value === 'needs_dynamic_confirmation') {
    return value;
  }
  throw new Error(`Invalid finding confidence: ${String(value)}`);
}

function isShellCommandAllowed(command: string): boolean {
  const safeToolsDir = resolve(process.cwd(), '.local', 'safe-tools');
  const commandPath = resolve(command);
  if (commandPath !== safeToolsDir && !commandPath.startsWith(`${safeToolsDir}\\`) && !commandPath.startsWith(`${safeToolsDir}/`)) {
    return false;
  }
  const displayName = commandDisplayName(command);
  return /^agentred-safe-[a-z0-9_.-]+(?:\.(?:exe))?$/i.test(displayName);
}

function commandDisplayName(command: string): string {
  return basename(command).toLowerCase();
}

/** Maps a toolbox engine to the scanner-result normalizer engine, or undefined if none exists. */
function autoParseEngineFor(engine: string): ScannerResultEngine | undefined {
  if (engine === 'nuclei') return 'nuclei';
  if (engine === 'httpx') return 'httpx';
  if (engine === 'ffuf') return 'ffuf';
  if (engine === 'sqlmap') return 'sqlmap';
  if (engine === 'nmap') return 'nmap';
  if (engine === 'tlsx') return 'tlsx';
  if (engine === 'semgrep') return 'semgrep';
  return undefined;
}

/** Confirmation engines whose normalized results become candidate findings automatically.
 *  Discovery engines (httpx, ffuf, nmap, tlsx) only store evidence + an import record. */
function autoCreateFindingsFor(engine: ScannerResultEngine): boolean {
  return engine === 'nuclei' || engine === 'sqlmap' || engine === 'semgrep';
}

function runSandboxProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: sandboxProcessEnv(),
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
    const finish = (result: { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(result);
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
      finish({ stdout, stderr: stderr || error.message, exitCode: null, timedOut });
    });
    child.on('close', (code) => {
      finish({ stdout, stderr, exitCode: code, timedOut });
    });
  });
}

function sandboxProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }
  return env;
}

function limitText(value: string, maxLength: number): { text: string; truncated: boolean } {
  return { text: value.slice(0, maxLength), truncated: value.length > maxLength };
}

function parseHeaders(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function isSupportedTool(tool: string): boolean {
  return (
    tool === 'http.request' ||
    tool === 'browser.navigate' ||
    tool === 'oast.start_session' ||
    tool === 'oast.record_callback' ||
    tool === 'scanner.run_template' ||
    tool === 'shell.run_sandboxed' ||
    tool === 'credential.use_placeholder' ||
    tool === 'access.compare_evidence' ||
    tool === 'finding.propose' ||
    tool === 'mcp.invoke'
  );
}

function optionalArgText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseOastProtocol(value: unknown): 'http' | 'dns' | 'manual' {
  if (value === 'dns' || value === 'manual') {
    return value;
  }
  return 'http';
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
