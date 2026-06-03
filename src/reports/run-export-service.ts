import { newId, nowIso } from '../domain/ids.js';
import type { Evidence, Finding, RunExport } from '../domain/types.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { FindingService } from '../findings/finding-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { EvidenceQualityService } from '../observability/evidence-quality-service.js';
import type { PlatformStore } from '../storage/store.js';
import { redactRun } from '../security/redaction.js';
import type { ReportFindingScope } from './report-service.js';

export interface RunExportInput {
  runId: string;
  findingScope?: ReportFindingScope;
  includeEvidenceContent?: boolean;
}

export class RunExportService {
  constructor(
    private readonly store: PlatformStore,
    private readonly graph: GraphServer,
    private readonly findings: FindingService,
    private readonly evidence: EvidenceEngine,
    private readonly evidenceQuality: EvidenceQualityService,
    private readonly events?: RunEventService,
  ) {}

  generate(input: RunExportInput): RunExport {
    const snapshot = this.graph.getGraph(input.runId);
    const findingScope = input.findingScope || 'confirmed_only';
    const findings = this.findings.list(input.runId).filter((finding) => shouldIncludeFinding(finding, findingScope));
    if (findingScope === 'confirmed_only' && findings.length > 0) {
      const gates = new Map(this.evidenceQuality.get(input.runId).findingGates.map((gate) => [gate.findingId, gate]));
      const blocked = findings.filter((finding) => !gates.get(finding.id)?.deliveryReady);
      if (blocked.length > 0) {
        throw new Error(`Run export requires delivery-ready findings: ${blocked.map((finding) => finding.id).join(', ')}`);
      }
    }
    const approvals = byRun(Object.values(this.store.state.approvals), input.runId);
    const toolInvocations = byRun(Object.values(this.store.state.toolInvocations), input.runId);
    const evidenceReviews = byRun(Object.values(this.store.state.evidenceReviews), input.runId);
    const reports = snapshot.evidence.filter((item) => item.kind === 'replay_bundle');
    const evidenceContent = {};
    const bundle = {
      schema: 'run-export.v1',
      generatedAt: nowIso(),
      run: redactRun(snapshot.run),
      graph: {
        facts: snapshot.facts,
        intents: snapshot.intents,
        hints: snapshot.hints,
      },
      findings,
      evidence: snapshot.evidence,
      evidenceReviews,
      evidenceContent,
      reports,
      runContext: {
        skillBindings: byRun(Object.values(this.store.state.runSkillBindings), input.runId),
        pocTemplateBindings: byRun(Object.values(this.store.state.runPocTemplateBindings), input.runId),
        toolboxBundleBindings: byRun(Object.values(this.store.state.runToolboxBundleBindings), input.runId),
        connectorBindings: byRun(Object.values(this.store.state.runConnectorBindings), input.runId),
        registeredToolboxBundles: Object.values(this.store.state.registeredToolboxBundles),
        registeredConnectors: Object.values(this.store.state.registeredConnectors),
      },
      approvals,
      toolInvocations,
      connectorRuns: byRun(Object.values(this.store.state.connectorRuns), input.runId),
      toolPackRuns: byRun(Object.values(this.store.state.toolPackRuns), input.runId),
      browserSessions: byRun(Object.values(this.store.state.browserSessions), input.runId),
      browserSnapshots: byRun(Object.values(this.store.state.browserSnapshots), input.runId),
      proxySessions: byRun(Object.values(this.store.state.proxySessions), input.runId),
      oastSessions: byRun(Object.values(this.store.state.oastSessions), input.runId).map((session) => ({
        id: session.id,
        runId: session.runId,
        status: session.status,
        interactionCount: session.interactionCount,
        limitations: session.limitations,
        createdAt: session.createdAt,
        closedAt: session.closedAt,
        callbackUrl: '[redacted]',
        token: '[redacted]',
      })),
      oastCallbacks: byRun(Object.values(this.store.state.oastCallbacks), input.runId),
      credentialReferences: byRun(Object.values(this.store.state.credentialReferences), input.runId),
      accessReviews: byRun(Object.values(this.store.state.accessReviews), input.runId),
      captureImports: byRun(Object.values(this.store.state.captureImports), input.runId),
      sarifImports: byRun(Object.values(this.store.state.sarifImports), input.runId),
      androidManifestImports: byRun(Object.values(this.store.state.androidManifestImports), input.runId),
      policy: {
        findingScope,
        includeEvidenceContent: false,
        rawLocalOnlyEvidenceContentIncluded: false,
        evidenceContentEmbeddingDisabled: true,
      },
    };
    const exportEvidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'replay_bundle',
      content: JSON.stringify(bundle, null, 2),
      redactionState: 'redacted',
    });
    const record: RunExport = {
      id: newId('run_export'),
      runId: input.runId,
      status: 'generated',
      evidenceId: exportEvidence.id,
      sha256: exportEvidence.sha256,
      findingScope,
      includeEvidenceContent: false,
      includedEvidenceContent: 0,
      omittedRawLocalOnly: snapshot.evidence.filter((item) => item.redactionState === 'raw_local_only').length,
      counts: {
        facts: snapshot.facts.length,
        intents: snapshot.intents.length,
        evidence: snapshot.evidence.length,
        findings: findings.length,
        approvals: approvals.length,
        toolInvocations: toolInvocations.length,
        reports: reports.length,
      },
      createdAt: nowIso(),
    };
    this.store.state.runExports[record.id] = record;
    this.store.commit();
    this.events?.record({
      runId: input.runId,
      type: 'run.export.generated',
      title: 'Run export generated',
      detail: `${record.findingScope} export with ${record.counts.findings} finding(s) and ${record.counts.evidence} evidence item(s)`,
      entityId: record.id,
    });
    return record;
  }

  list(runId: string): RunExport[] {
    this.graph.getRun(runId);
    return byRun(Object.values(this.store.state.runExports), runId).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

}

function byRun<T extends { runId: string }>(items: T[], runId: string): T[] {
  return items.filter((item) => item.runId === runId);
}

function shouldIncludeFinding(finding: Finding, scope: ReportFindingScope): boolean {
  if (finding.validationState === 'rejected') {
    return false;
  }
  if (scope === 'confirmed_only') {
    return finding.validationState === 'confirmed';
  }
  return finding.validationState === 'candidate' || finding.validationState === 'confirmed';
}
