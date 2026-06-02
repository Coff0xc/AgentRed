import { createHash } from 'node:crypto';

import { newId, nowIso } from '../domain/ids.js';
import type { Confidence, SarifImport, Severity } from '../domain/types.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { FindingService } from '../findings/finding-service.js';
import { redactText } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

export interface SarifImportInput {
  runId: string;
  source?: string;
  content: unknown;
  createFindings: boolean;
}

interface NormalizedSarifResult {
  ruleId: string;
  title: string;
  message: string;
  severity: Severity;
  confidence: Confidence;
  location: string;
  help?: string;
}

export class SarifImportService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly findings: FindingService,
    private readonly events?: RunEventService,
  ) {}

  list(runId: string): SarifImport[] {
    return Object.values(this.store.state.sarifImports)
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  import(input: SarifImportInput): { importRecord: SarifImport; evidenceId: string; findingIds: string[] } {
    const run = this.store.state.runs[input.runId];
    if (!run) {
      throw new Error(`Run not found: ${input.runId}`);
    }
    const raw = serializeSarif(input.content);
    const parsed = parseSarif(raw);
    const normalized = normalizeSarif(parsed);
    const inputSha256 = createHash('sha256').update(raw).digest('hex');
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'sarif.import',
        source: safeText(input.source ?? 'operator-upload', 200),
        inputSha256,
        summary: {
          runs: Array.isArray(parsed.runs) ? parsed.runs.length : 0,
          rules: countRules(parsed),
          results: normalized.length,
          importedFindingLimit: input.createFindings ? 25 : 0,
        },
        results: normalized.slice(0, 100),
        resultTruncated: normalized.length > 100,
        importedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    const findingIds = input.createFindings
      ? normalized.slice(0, 25).map((result) =>
          this.findings.proposeFinding({
            runId: input.runId,
            title: result.title,
            severity: result.severity,
            confidence: result.confidence,
            affectedAssets: [result.location || input.source || run.target],
            evidenceIds: [evidence.id],
            reproSteps: [`Review SARIF rule ${result.ruleId} in imported evidence ${evidence.id}.`],
            impact: `Static analysis reported: ${result.message}`,
            remediation: result.help ?? 'Review the referenced code path and apply the rule-specific remediation.',
          }).id,
        )
      : [];
    const importRecord: SarifImport = {
      id: newId('sarif'),
      runId: input.runId,
      source: safeText(input.source ?? 'operator-upload', 200),
      status: 'imported',
      evidenceId: evidence.id,
      inputSha256,
      runs: Array.isArray(parsed.runs) ? parsed.runs.length : 0,
      rules: countRules(parsed),
      results: normalized.length,
      importedFindings: findingIds.length,
      findingIds,
      createdAt: nowIso(),
    };
    this.store.state.sarifImports[importRecord.id] = importRecord;
    this.events?.record({
      runId: input.runId,
      type: 'sarif.imported',
      title: 'SARIF imported',
      detail: `${importRecord.results} result(s), ${importRecord.importedFindings} candidate finding(s)`,
      entityId: importRecord.id,
    });
    this.store.commit();
    return { importRecord, evidenceId: evidence.id, findingIds };
  }
}

function serializeSarif(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content);
}

function parseSarif(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('SARIF root must be an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(error instanceof Error ? `Invalid SARIF JSON: ${error.message}` : 'Invalid SARIF JSON');
  }
}

function normalizeSarif(sarif: Record<string, unknown>): NormalizedSarifResult[] {
  const results: NormalizedSarifResult[] = [];
  for (const run of arrayOfRecords(sarif.runs)) {
    const rules = ruleIndex(run);
    for (const result of arrayOfRecords(run.results)) {
      const ruleId = safeText(stringValue(result.ruleId) ?? 'unknown-rule', 160);
      const rule = rules.get(ruleId);
      const message = safeText(messageText(result.message) ?? rule?.message ?? 'SARIF result without message', 600);
      const location = safeText(firstLocation(result) ?? 'source-location-unavailable', 500);
      results.push({
        ruleId,
        title: safeText(`${ruleId}: ${rule?.name ?? message}`.slice(0, 180), 180),
        message,
        severity: severityFor(result, rule),
        confidence: 'needs_dynamic_confirmation',
        location,
        help: rule?.help,
      });
    }
  }
  return results;
}

function ruleIndex(run: Record<string, unknown>): Map<string, { name?: string; message?: string; help?: string; severity?: Severity }> {
  const index = new Map<string, { name?: string; message?: string; help?: string; severity?: Severity }>();
  const tool = recordValue(run.tool);
  const driver = recordValue(tool?.driver);
  for (const rule of arrayOfRecords(driver?.rules)) {
    const id = stringValue(rule.id);
    if (!id) continue;
    index.set(id, {
      name: safeText(stringValue(rule.name) ?? stringValue(recordValue(rule.shortDescription)?.text), 180),
      message: safeText(messageText(rule.fullDescription) ?? messageText(rule.shortDescription) ?? '', 600),
      help: safeText(messageText(rule.help) ?? '', 800),
      severity: severityFor(rule),
    });
  }
  return index;
}

function severityFor(result: Record<string, unknown>, rule?: { severity?: Severity }): Severity {
  const securitySeverity = Number(recordValue(result.properties)?.['security-severity']);
  if (Number.isFinite(securitySeverity)) {
    if (securitySeverity >= 9) return 'critical';
    if (securitySeverity >= 7) return 'high';
    if (securitySeverity >= 4) return 'medium';
    if (securitySeverity > 0) return 'low';
  }
  const level = stringValue(result.level);
  if (level === 'error') return rule?.severity ?? 'high';
  if (level === 'warning') return rule?.severity ?? 'medium';
  if (level === 'note') return rule?.severity ?? 'low';
  return rule?.severity ?? 'info';
}

function firstLocation(result: Record<string, unknown>): string | undefined {
  const location = arrayOfRecords(result.locations)[0];
  const physical = recordValue(location?.physicalLocation);
  const artifact = recordValue(physical?.artifactLocation);
  const uri = stringValue(artifact?.uri);
  const region = recordValue(physical?.region);
  const line = typeof region?.startLine === 'number' ? `:${region.startLine}` : '';
  return uri ? `${uri}${line}` : undefined;
}

function countRules(sarif: Record<string, unknown>): number {
  return arrayOfRecords(sarif.runs).reduce((total, run) => {
    const tool = recordValue(run.tool);
    const driver = recordValue(tool?.driver);
    return total + arrayOfRecords(driver?.rules).length;
  }, 0);
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function messageText(value: unknown): string | undefined {
  const record = recordValue(value);
  return stringValue(record?.text) ?? stringValue(record?.markdown);
}

function safeText(value: string | undefined, maxLength: number): string {
  return redactText(value ?? '').slice(0, maxLength);
}
