import { createHash } from 'node:crypto';

import { newId, nowIso } from '../domain/ids.js';
import type { Confidence, ScannerResultEngine, ScannerResultImport, Severity } from '../domain/types.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { FindingService } from '../findings/finding-service.js';
import { redactText, redactUrl } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

export interface ScannerResultImportInput {
  runId: string;
  source?: string;
  engine: ScannerResultEngine;
  content: unknown;
  createFindings: boolean;
}

interface NormalizedScannerIssue {
  engine: ScannerResultEngine;
  scannerId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  affectedAsset: string;
  description: string;
  remediation: string;
  evidenceSummary: Record<string, unknown>;
}

export class ScannerResultImportService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly findings: FindingService,
    private readonly events?: RunEventService,
  ) {}

  list(runId: string): ScannerResultImport[] {
    return Object.values(this.store.state.scannerResultImports)
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  import(input: ScannerResultImportInput): { importRecord: ScannerResultImport; evidenceId: string; findingIds: string[] } {
    const run = this.store.state.runs[input.runId];
    if (!run) {
      throw new Error(`Run not found: ${input.runId}`);
    }
    const raw = serializeScannerContent(input.content);
    const normalized = normalizeScannerResults(input.engine, raw).slice(0, 250);
    const inputSha256 = createHash('sha256').update(raw).digest('hex');
    const source = safeText(input.source ?? `${input.engine}-results`, 200);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'scanner.result.import',
        engine: input.engine,
        source,
        inputSha256,
        summary: {
          results: normalized.length,
          highOrCritical: normalized.filter((issue) => issue.severity === 'high' || issue.severity === 'critical').length,
          importedFindingLimit: input.createFindings ? 25 : 0,
        },
        results: normalized.slice(0, 100),
        resultTruncated: normalized.length > 100,
        importedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    const findingIds = input.createFindings
      ? normalized.slice(0, 25).map((issue) =>
          this.findings.proposeFinding({
            runId: input.runId,
            title: issue.title,
            severity: issue.severity,
            confidence: issue.confidence,
            affectedAssets: [issue.affectedAsset || run.target],
            evidenceIds: [evidence.id],
            reproSteps: [`Review ${issue.engine} scanner result ${issue.scannerId} in imported evidence ${evidence.id}.`],
            impact: issue.description,
            remediation: issue.remediation,
          }).id,
        )
      : [];
    const affectedAssets = [...new Set(normalized.map((issue) => issue.affectedAsset).filter(Boolean))].slice(0, 50);
    const importRecord: ScannerResultImport = {
      id: newId('scanner_import'),
      runId: input.runId,
      source,
      engine: input.engine,
      status: 'imported',
      evidenceId: evidence.id,
      inputSha256,
      results: normalized.length,
      highOrCritical: normalized.filter((issue) => issue.severity === 'high' || issue.severity === 'critical').length,
      affectedAssets,
      importedFindings: findingIds.length,
      findingIds,
      createdAt: nowIso(),
    };
    this.store.state.scannerResultImports[importRecord.id] = importRecord;
    this.events?.record({
      runId: input.runId,
      type: 'scanner.result.imported',
      title: 'Scanner results imported',
      detail: `${input.engine}: ${importRecord.results} result(s), ${importRecord.importedFindings} candidate finding(s)`,
      entityId: importRecord.id,
      level: importRecord.highOrCritical > 0 ? 'warning' : 'info',
    });
    this.store.commit();
    return { importRecord, evidenceId: evidence.id, findingIds };
  }
}

function serializeScannerContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content);
}

function normalizeScannerResults(engine: ScannerResultEngine, raw: string): NormalizedScannerIssue[] {
  if (engine === 'nuclei') {
    return normalizeNuclei(raw);
  }
  if (engine === 'semgrep') {
    return normalizeSemgrep(raw);
  }
  return normalizeGeneric(raw);
}

function normalizeNuclei(raw: string): NormalizedScannerIssue[] {
  return parseJsonLines(raw).map((result, index) => {
    const info = recordValue(result.info);
    const classification = recordValue(info?.classification);
    const templateId = safeText(stringValue(result['template-id']) ?? stringValue(result.templateID) ?? `nuclei-${index + 1}`, 160);
    const name = safeText(stringValue(info?.name) ?? templateId, 180);
    const severity = severityFromString(stringValue(info?.severity)) ?? 'info';
    const matchedAt = safeTarget(stringValue(result['matched-at']) ?? stringValue(result.host) ?? stringValue(result.url) ?? 'target-unavailable');
    const cwe = stringArray(classification?.['cwe-id']).join(', ');
    const cvss = stringValue(classification?.['cvss-score']);
    const description = safeText(
      stringValue(info?.description) ??
        [name, cwe ? `CWE: ${cwe}` : '', cvss ? `CVSS: ${cvss}` : ''].filter(Boolean).join(' '),
      700,
    );
    return {
      engine: 'nuclei',
      scannerId: templateId,
      title: `${severityLabel(severity)} nuclei: ${name}`.slice(0, 180),
      severity,
      confidence: severity === 'critical' || severity === 'high' ? 'likely' : 'needs_dynamic_confirmation',
      affectedAsset: matchedAt,
      description: description || `${name} was reported by Nuclei and requires operator validation.`,
      remediation: safeText(stringValue(info?.remediation) ?? 'Validate the scanner signal, reproduce safely, and apply the template-specific remediation.', 800),
      evidenceSummary: {
        templateId,
        matcherName: safeText(stringValue(result['matcher-name']) ?? '', 120),
        extractedResults: stringArray(result['extracted-results']).slice(0, 10),
      },
    };
  });
}

function normalizeSemgrep(raw: string): NormalizedScannerIssue[] {
  const parsed = objectRoot(parseJsonObject(raw, 'Semgrep JSON'), 'Semgrep JSON');
  return arrayOfRecords(parsed.results).map((result, index) => {
    const extra = recordValue(result.extra);
    const metadata = recordValue(extra?.metadata);
    const severity = severityFromString(stringValue(extra?.severity) ?? stringValue(metadata?.impact)) ?? 'medium';
    const path = safeText(stringValue(result.path) ?? 'source-location-unavailable', 300);
    const start = recordValue(result.start);
    const line = typeof start?.line === 'number' ? `:${start.line}` : '';
    const checkId = safeText(stringValue(result.check_id) ?? `semgrep-${index + 1}`, 180);
    const message = safeText(stringValue(extra?.message) ?? checkId, 700);
    return {
      engine: 'semgrep',
      scannerId: checkId,
      title: `${severityLabel(severity)} semgrep: ${checkId}`.slice(0, 180),
      severity,
      confidence: 'needs_dynamic_confirmation',
      affectedAsset: `${path}${line}`,
      description: message,
      remediation: safeText(stringValue(metadata?.fix) ?? stringValue(metadata?.references) ?? 'Review the matched code path and apply the Semgrep rule remediation.', 800),
      evidenceSummary: {
        checkId,
        path,
        line: typeof start?.line === 'number' ? start.line : undefined,
      },
    };
  });
}

function normalizeGeneric(raw: string): NormalizedScannerIssue[] {
  const parsed = parseJsonObject(raw, 'Generic scanner JSON');
  const source = Array.isArray(parsed)
    ? parsed
    : arrayValue(parsed.results) ?? arrayValue(parsed.findings) ?? arrayValue(parsed.issues) ?? [];
  return source
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => {
      const severity = severityFromString(stringValue(item.severity) ?? stringValue(item.risk)) ?? 'medium';
      const scannerId = safeText(stringValue(item.id) ?? stringValue(item.ruleId) ?? stringValue(item.templateId) ?? `generic-${index + 1}`, 160);
      const title = safeText(stringValue(item.title) ?? stringValue(item.name) ?? scannerId, 180);
      const affectedAsset = safeTarget(stringValue(item.target) ?? stringValue(item.url) ?? stringValue(item.asset) ?? stringValue(item.location) ?? 'target-unavailable');
      return {
        engine: 'generic',
        scannerId,
        title: `${severityLabel(severity)} scanner: ${title}`.slice(0, 180),
        severity,
        confidence: severity === 'critical' || severity === 'high' ? 'likely' : 'needs_dynamic_confirmation',
        affectedAsset,
        description: safeText(stringValue(item.description) ?? stringValue(item.message) ?? `${title} was reported by an imported scanner result.`, 700),
        remediation: safeText(stringValue(item.remediation) ?? stringValue(item.fix) ?? 'Validate the scanner signal and apply the vendor or rule-specific remediation.', 800),
        evidenceSummary: {
          scannerId,
          category: safeText(stringValue(item.category) ?? '', 120),
        },
      };
    });
}

function parseJsonLines(raw: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('line is not an object');
      }
      records.push(parsed as Record<string, unknown>);
    } catch (error) {
      throw new Error(`Invalid Nuclei JSONL at line ${index + 1}: ${error instanceof Error ? error.message : 'parse failed'}`);
    }
  }
  return records;
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> | Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('root must be an object or array');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error instanceof Error ? error.message : 'parse failed'}`);
  }
}

function objectRoot(parsed: Record<string, unknown> | Record<string, unknown>[], label: string): Record<string, unknown> {
  if (Array.isArray(parsed)) {
    throw new Error(`Invalid ${label}: root must be an object`);
  }
  return parsed;
}

function severityFromString(input: string | undefined): Severity | undefined {
  const value = input?.toLowerCase();
  if (value === 'critical') return 'critical';
  if (value === 'high' || value === 'error') return 'high';
  if (value === 'medium' || value === 'moderate' || value === 'warning' || value === 'warn') return 'medium';
  if (value === 'low' || value === 'note') return 'low';
  if (value === 'info' || value === 'informational') return 'info';
  return undefined;
}

function severityLabel(severity: Severity): string {
  return severity === 'info' ? 'Info' : severity[0].toUpperCase() + severity.slice(1);
}

function safeTarget(value: string): string {
  return safeText(redactUrl(value), 500);
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => safeText(item, 160));
  }
  const single = stringValue(value);
  return single ? [safeText(single, 160)] : [];
}

function safeText(value: string | undefined, maxLength: number): string {
  return redactText(value ?? '').slice(0, maxLength);
}
