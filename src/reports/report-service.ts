import type { Finding } from '../domain/types.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { GraphServer } from '../graph/graph-server.js';
import type { FindingService } from '../findings/finding-service.js';
import type { EvidenceQualityService } from '../observability/evidence-quality-service.js';
import type { ObservabilityService } from '../observability/observability-service.js';

export type ReportFindingScope = 'confirmed_only' | 'candidate_and_confirmed';

export class ReportService {
  constructor(
    private readonly graph: GraphServer,
    private readonly findings: FindingService,
    private readonly evidence: EvidenceEngine,
    private readonly evidenceQuality: EvidenceQualityService,
    private readonly events?: RunEventService,
    private readonly observability?: ObservabilityService,
  ) {}

  generate(input: {
    runId: string;
    format: 'hackerone' | 'bugcrowd' | 'src' | 'enterprise';
    findingScope?: ReportFindingScope;
  }): {
    markdown: string;
    evidenceId: string;
    sha256: string;
  } {
    const startedMs = Date.now();
    const snapshot = this.graph.getGraph(input.runId);
    const findingScope = input.findingScope || 'confirmed_only';
    const findings = this.findings.list(input.runId).filter((finding) => shouldIncludeFinding(finding, findingScope));
    if (findingScope === 'confirmed_only' && findings.length > 0) {
      const gates = new Map(this.evidenceQuality.get(input.runId).findingGates.map((gate) => [gate.findingId, gate]));
      const blocked = findings.filter((finding) => !gates.get(finding.id)?.deliveryReady);
      if (blocked.length > 0) {
        throw new Error(`Report requires delivery-ready findings: ${blocked.map((finding) => finding.id).join(', ')}`);
      }
    }
    const referencedEvidenceIds = new Set(findings.flatMap((finding) => finding.evidenceIds));
    for (const evidenceId of referencedEvidenceIds) {
      const evidence = snapshot.evidence.find((item) => item.id === evidenceId);
      if (!evidence) {
        throw new Error(`Report references missing evidence: ${evidenceId}`);
      }
      if (evidence.redactionState === 'raw_local_only') {
        throw new Error(`Report requires redacted evidence and cannot include raw-local-only evidence: ${evidenceId}`);
      }
    }
    const markdown = [
      '# AgentRed Report',
      '',
      `**Format**: ${input.format}`,
      `**Finding scope**: ${findingScope}`,
      `**Target**: ${snapshot.run.target}`,
      `**Goal**: ${snapshot.run.goal}`,
      `**Status**: ${snapshot.run.status}`,
      '',
      '## Scope',
      '',
      `Allowed assets: ${snapshot.run.scopePolicy.allowedAssets.join(', ')}`,
      `Denied assets: ${snapshot.run.scopePolicy.deniedAssets.join(', ') || 'none'}`,
      '',
      '## Findings',
      '',
      findings.length === 0 ? 'No findings match the selected report scope.' : findings.map(formatFinding).join('\n\n'),
      '',
      '## Evidence Policy',
      '',
      'Every finding in this report must reference reproducible evidence. Raw local-only evidence is not uploaded to cloud control plane by default.',
    ].join('\n');
    const reportEvidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'replay_bundle',
      content: markdown,
      redactionState: 'redacted',
    });
    this.events?.record({
      runId: input.runId,
      type: 'report.generated',
      title: 'Report generated',
      detail: `${input.format} report with ${findings.length} findings (${findingScope})`,
      entityId: reportEvidence.id,
    });
    const span = this.observability?.recordDuration({
      runId: input.runId,
      kind: 'report',
      name: `report.${input.format}`,
      status: 'ok',
      startedMs,
      entityId: reportEvidence.id,
      attributes: { format: input.format, findingScope, findings: findings.length },
    });
    if (span) {
      this.observability?.recordCost({
        runId: input.runId,
        source: 'report',
        unit: 'millisecond',
        quantity: span.durationMs,
        entityId: span.id,
      });
    }
    return {
      markdown,
      evidenceId: reportEvidence.id,
      sha256: reportEvidence.sha256,
    };
  }
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

function formatFinding(finding: Finding): string {
  return [
    `### ${finding.title}`,
    '',
    `Severity: ${finding.severity}`,
    `Confidence: ${finding.confidence}`,
    `Validation: ${finding.validationState}`,
    `Affected assets: ${finding.affectedAssets.join(', ')}`,
    `Evidence: ${finding.evidenceIds.join(', ')}`,
    '',
    '**Reproduction**',
    ...finding.reproSteps.map((step, index) => `${index + 1}. ${step}`),
    '',
    `**Impact**: ${finding.impact}`,
    '',
    `**Remediation**: ${finding.remediation}`,
  ].join('\n');
}
