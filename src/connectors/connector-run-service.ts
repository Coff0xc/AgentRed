import { newId, nowIso } from '../domain/ids.js';
import type { ConnectorRun, ConnectorRunItem, ConnectorRunStatus, RiskLevel } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import { redactUrl } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';
import type { ToolGateway, ToolInvokeInput, ToolInvokeResult, ToolPlanPreview } from '../tools/tool-gateway.js';
import { findScannerTemplate, type ToolTemplateProfile } from '../tools/toolbox-registry.js';
import type { ConnectorRegistryService, ConnectorView } from './connector-registry-service.js';

export interface ConnectorTemplatePlanItem {
  template: ToolTemplateProfile;
  preview: ToolPlanPreview;
}

export interface ConnectorPlan {
  generatedAt: string;
  runId: string;
  connector: ConnectorView;
  target: string;
  items: ConnectorTemplatePlanItem[];
  summary: {
    total: number;
    executable: number;
    blocked: number;
    approvalRequired: number;
  };
  audit: {
    previewWritesState: false;
    invokesConnector: false;
    invokesTools: false;
    writesEvidence: false;
  };
}

export interface ConnectorInvokeResult {
  connector: ConnectorView;
  runRecord: ConnectorRun;
}

export class ConnectorRunService {
  constructor(
    private readonly store: PlatformStore,
    private readonly connectors: ConnectorRegistryService,
    private readonly tools: ToolGateway,
    private readonly events?: RunEventService,
  ) {}

  listRuns(runId: string): ConnectorRun[] {
    this.assertRun(runId);
    return Object.values(this.store.state.connectorRuns)
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async plan(runId: string, connectorId: string, target?: string): Promise<ConnectorPlan> {
    const run = this.assertRun(runId);
    const connector = this.assertConnector(connectorId);
    const resolvedTarget = target?.trim() || run.target;
    const templates = connectorTemplates(connector);
    const items: ConnectorTemplatePlanItem[] = [];
    for (const template of templates) {
      const preview = await this.tools.preview(this.templateToInvoke(runId, template, resolvedTarget));
      items.push({ template, preview });
    }
    return {
      generatedAt: nowIso(),
      runId,
      connector,
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
        invokesConnector: false,
        invokesTools: false,
        writesEvidence: false,
      },
    };
  }

  async invoke(runId: string, connectorId: string, target?: string): Promise<ConnectorInvokeResult> {
    const run = this.assertRun(runId);
    const connector = this.assertConnector(connectorId);
    const resolvedTarget = target?.trim() || run.target;
    const templates = connectorTemplates(connector);
    const startedAt = nowIso();
    const runRecordId = newId('connector_run');
    this.events?.record({
      runId,
      type: 'connector.run.started',
      title: 'Connector run started',
      detail: `${connector.name} against ${redactUrl(resolvedTarget)} via ${templates.length} governed template(s)`,
      entityId: runRecordId,
    });
    const items: ConnectorRunItem[] = [];
    for (const template of templates) {
      try {
        const result = await this.tools.invoke(this.templateToInvoke(runId, template, resolvedTarget));
        items.push(this.resultToItem(template, resolvedTarget, result));
      } catch (error) {
        items.push(this.errorToItem(template, resolvedTarget, error));
      }
    }
    const status = connectorRunStatus(items);
    const runRecord: ConnectorRun = {
      id: runRecordId,
      runId,
      connectorId: connector.id,
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
    this.store.state.connectorRuns[runRecord.id] = runRecord;
    this.events?.record({
      runId,
      type: 'connector.run.completed',
      title: 'Connector run completed',
      detail: `${connector.name}: ${runRecord.allowed}/${runRecord.total} allowed, ${runRecord.blocked} blocked, ${runRecord.approvalRequired} approval required`,
      entityId: runRecord.id,
      level: status === 'completed' ? 'info' : 'warning',
    });
    this.store.commit();
    return { connector, runRecord };
  }

  private templateToInvoke(runId: string, template: ToolTemplateProfile, target: string): ToolInvokeInput {
    return {
      runId,
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel: template.defaultRiskLevel,
      args: { template: template.id, timeoutMs: 10_000 },
    };
  }

  private resultToItem(template: ToolTemplateProfile, target: string, result: ToolInvokeResult): ConnectorRunItem {
    return {
      templateId: template.id,
      title: template.name,
      engine: template.engine,
      target: redactUrl(target),
      riskLevel: template.defaultRiskLevel,
      status: result.status,
      invocationId: result.invocationId,
      evidenceId: result.status === 'allowed' ? result.evidenceId : undefined,
      approvalId: result.status === 'approval_required' ? result.approvalId : undefined,
      reason: result.status !== 'allowed' ? result.reason : undefined,
    };
  }

  private errorToItem(template: ToolTemplateProfile, target: string, error: unknown): ConnectorRunItem {
    return {
      templateId: template.id,
      title: template.name,
      engine: template.engine,
      target: redactUrl(target),
      riskLevel: template.defaultRiskLevel,
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

  private assertConnector(connectorId: string): ConnectorView {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }
    return connector;
  }
}

function connectorTemplates(connector: ConnectorView): ToolTemplateProfile[] {
  return connector.capabilityMapping.templateIds
    .map((templateId) => findScannerTemplate(templateId))
    .filter((template): template is ToolTemplateProfile => Boolean(template))
    .filter((template) => template.defaultRiskLevel !== 'R4');
}

function connectorRunStatus(items: ConnectorRunItem[]): ConnectorRunStatus {
  if (items.length === 0) {
    return 'blocked';
  }
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
