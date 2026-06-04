import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';

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
  if (engine === 'httpx') {
    return normalizeHttpx(raw);
  }
  if (engine === 'ffuf') {
    return normalizeFfuf(raw);
  }
  if (engine === 'sqlmap') {
    return normalizeSqlmap(raw);
  }
  if (engine === 'nmap') {
    return normalizeNmap(raw);
  }
  if (engine === 'tlsx') {
    return normalizeTlsx(raw);
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
    const path = safeSemgrepPath(stringValue(result.path));
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

function normalizeHttpx(raw: string): NormalizedScannerIssue[] {
  return parseJsonLines(raw).map((result, index) => {
    const url = stringValue(result.url) ?? stringValue(result.input) ?? stringValue(result.host) ?? `httpx-${index + 1}`;
    const statusCode = typeof result['status_code'] === 'number' ? (result['status_code'] as number) : undefined;
    const title = stringValue(result.title);
    const webserver = stringValue(result.webserver);
    const tech = stringArray(result.tech);
    const scannerId = safeText(`httpx:${url}`, 160);
    const summaryParts = [
      statusCode ? `HTTP ${statusCode}` : '',
      title ? `title: ${title}` : '',
      webserver ? `server: ${webserver}` : '',
      tech.length > 0 ? `tech: ${tech.join(', ')}` : '',
    ].filter(Boolean);
    return {
      engine: 'httpx',
      scannerId,
      title: safeText(`httpx live host: ${title || url}`, 180),
      // httpx is pure surface discovery — never auto-escalate severity
      severity: 'info',
      confidence: 'needs_dynamic_confirmation',
      affectedAsset: safeTarget(url),
      description: safeText(summaryParts.join(' | ') || `httpx probed ${url} and recorded a live HTTP service.`, 700),
      remediation: 'Discovery signal only; no remediation. Review the exposed surface and continue targeted assessment.',
      evidenceSummary: {
        url: safeTarget(url),
        statusCode,
        webserver: safeText(webserver ?? '', 120),
        contentType: safeText(stringValue(result['content_type']) ?? '', 120),
        tech: tech.slice(0, 10),
      },
    };
  });
}

function normalizeFfuf(raw: string): NormalizedScannerIssue[] {
  // ffuf -of json emits a single object with a "results" array
  const parsed = objectRoot(parseJsonObject(raw, 'FFUF JSON'), 'FFUF JSON');
  return arrayOfRecords(parsed.results).map((result, index) => {
    const url = stringValue(result.url) ?? stringValue(result.input) ?? `ffuf-${index + 1}`;
    const fuzzWord = stringValue(recordValue(result.input)?.FUZZ) ?? stringValue(result.fuzz) ?? '';
    const statusCode = typeof result.status === 'number' ? (result.status as number) : undefined;
    const length = typeof result.length === 'number' ? (result.length as number) : undefined;
    const words = typeof result.words === 'number' ? (result.words as number) : undefined;
    const scannerId = safeText(`ffuf:${fuzzWord || url}`, 160);
    return {
      engine: 'ffuf',
      scannerId,
      title: safeText(`ffuf discovered path: ${fuzzWord || url}`, 180),
      // Content discovery is a low-signal surface hit, not a vulnerability
      severity: 'info',
      confidence: 'needs_dynamic_confirmation',
      affectedAsset: safeTarget(url),
      description: safeText(
        [statusCode ? `HTTP ${statusCode}` : '', length !== undefined ? `len: ${length}` : '', words !== undefined ? `words: ${words}` : '']
          .filter(Boolean)
          .join(' | ') || `ffuf matched ${url} during bounded content discovery.`,
        700,
      ),
      remediation: 'Discovery signal only; no remediation. Confirm the path is in-scope and review exposed functionality.',
      evidenceSummary: {
        url: safeTarget(url),
        statusCode,
        length,
        words,
        fuzzWord: safeText(fuzzWord, 120),
      },
    };
  });
}

function normalizeSqlmap(raw: string): NormalizedScannerIssue[] {
  // sqlmap text output. We look for confirmed-injection signals and treat them as high-severity
  // candidate findings (sqlmap is an R3 confirmation engine, only run on authorized parameters).
  const text = raw.slice(0, 200_000);
  const issues: NormalizedScannerIssue[] = [];

  // "Parameter: id (GET)" blocks indicate a confirmed injectable parameter
  const paramRegex = /Parameter:\s*([^\n(]+)\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = paramRegex.exec(text)) !== null && index < 50) {
    const parameter = safeText(match[1]?.trim() ?? `param-${index + 1}`, 120);
    const place = safeText(match[2]?.trim() ?? '', 40);
    // Capture the technique lines following this parameter block (Type:/Title:)
    const followingText = text.slice(match.index, match.index + 800);
    const titleMatch = /Title:\s*([^\n]+)/i.exec(followingText);
    const typeMatch = /Type:\s*([^\n]+)/i.exec(followingText);
    const techniqueTitle = safeText(titleMatch?.[1]?.trim() ?? typeMatch?.[1]?.trim() ?? 'SQL injection', 180);
    issues.push({
      engine: 'sqlmap',
      scannerId: safeText(`sqlmap:${parameter}:${place}`, 160),
      title: `SQL injection confirmed in ${parameter}${place ? ` (${place})` : ''}`.slice(0, 180),
      severity: 'high',
      confidence: 'likely',
      affectedAsset: safeTarget(stringValue(firstMatch(text, /URL:\s*(\S+)/i)) ?? 'target-unavailable'),
      description: safeText(`sqlmap reported ${techniqueTitle} on parameter ${parameter}. Verify the injection manually before reporting impact.`, 700),
      remediation: 'Use parameterized queries / prepared statements and validate input. Confirm the injection scope with the operator before escalation.',
      evidenceSummary: {
        parameter,
        place,
        technique: techniqueTitle,
      },
    });
    index += 1;
  }

  // Detected DBMS as a contextual signal (only if at least one injection was found)
  if (issues.length === 0) {
    return [];
  }
  return issues;
}

function normalizeNmap(raw: string): NormalizedScannerIssue[] {
  // nmap normal text output. Open ports are surface-discovery signals (info), never auto-findings.
  const text = raw.slice(0, 200_000);
  const issues: NormalizedScannerIssue[] = [];
  const host = safeTarget(stringValue(firstMatch(text, /Nmap scan report for\s+(\S+)/i)) ?? 'target-unavailable');
  // Lines like: "443/tcp open  https" or "22/tcp open ssh OpenSSH 8.9"
  const portRegex = /^(\d{1,5})\/(tcp|udp)\s+(open|open\|filtered)\s+(\S+)(?:\s+(.*))?$/gim;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = portRegex.exec(text)) !== null && index < 200) {
    const port = match[1];
    const proto = match[2];
    const service = safeText(match[4] ?? 'unknown', 60);
    const version = safeText(match[5]?.trim() ?? '', 160);
    issues.push({
      engine: 'nmap',
      scannerId: safeText(`nmap:${host}:${port}/${proto}`, 160),
      title: `Open port ${port}/${proto} (${service})`.slice(0, 180),
      severity: 'info',
      confidence: 'needs_dynamic_confirmation',
      affectedAsset: host,
      description: safeText(
        [`Port ${port}/${proto} is open`, `service: ${service}`, version ? `version: ${version}` : '']
          .filter(Boolean)
          .join(' | '),
        700,
      ),
      remediation: 'Discovery signal only; no remediation. Confirm the service is in-scope and review its exposure.',
      evidenceSummary: {
        host,
        port: Number(port),
        protocol: proto,
        service,
        version,
      },
    });
    index += 1;
  }
  return issues;
}

function normalizeTlsx(raw: string): NormalizedScannerIssue[] {
  // tlsx -json emits JSONL, one certificate record per line. Certificate metadata is info-level;
  // expired or self-signed certificates are surfaced in the description but not auto-escalated.
  return parseJsonLines(raw).map((result, index) => {
    const host = stringValue(result.host) ?? stringValue(result.input) ?? `tlsx-${index + 1}`;
    const port = stringValue(result.port);
    const expired = result.expired === true;
    const selfSigned = result.self_signed === true || result['self-signed'] === true;
    const mismatched = result.mismatched === true;
    const notAfter = stringValue(result.not_after) ?? stringValue(result['not_after']);
    const issuer = stringValue(recordValue(result.issuer_dn)?.toString?.() ?? undefined) ?? stringValue(result.issuer_dn) ?? stringValue(result.issuer);
    const tlsVersion = stringValue(result.tls_version) ?? stringValue(result.version);
    const signals = [expired ? 'expired' : '', selfSigned ? 'self-signed' : '', mismatched ? 'host-mismatch' : ''].filter(Boolean);
    return {
      engine: 'tlsx',
      scannerId: safeText(`tlsx:${host}${port ? `:${port}` : ''}`, 160),
      title: safeText(`TLS certificate for ${host}${signals.length > 0 ? ` (${signals.join(', ')})` : ''}`, 180),
      severity: 'info',
      confidence: 'needs_dynamic_confirmation',
      affectedAsset: safeTarget(host),
      description: safeText(
        [
          tlsVersion ? `TLS: ${tlsVersion}` : '',
          notAfter ? `expires: ${notAfter}` : '',
          issuer ? `issuer: ${issuer}` : '',
          signals.length > 0 ? `signals: ${signals.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' | ') || `tlsx collected TLS certificate metadata for ${host}.`,
        700,
      ),
      remediation: 'Discovery signal only; no remediation. Review certificate hygiene (expiry, issuer, hostname match) if relevant to scope.',
      evidenceSummary: {
        host: safeTarget(host),
        port,
        tlsVersion: safeText(tlsVersion ?? '', 40),
        notAfter: safeText(notAfter ?? '', 60),
        expired,
        selfSigned,
        mismatched,
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
      throw new Error(`Invalid JSONL at line ${index + 1}: ${error instanceof Error ? error.message : 'parse failed'}`);
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

function safeSemgrepPath(value: string | undefined): string {
  const raw = value?.trim() || 'source-location-unavailable';
  const workspaceRaw = process.env.PLATFORM_SAST_WORKSPACE?.trim();
  if (workspaceRaw) {
    const workspace = resolve(workspaceRaw);
    const resolved = looksAbsolutePath(raw) ? resolve(raw) : resolve(workspace, raw);
    const pathFromWorkspace = relative(workspace, resolved);
    if (!pathFromWorkspace) {
      return '.';
    }
    if (!pathFromWorkspace.startsWith('..') && !looksAbsolutePath(pathFromWorkspace)) {
      return safeText(pathFromWorkspace.replace(/\\/g, '/'), 300);
    }
    return `outside-workspace:${shortHash(resolved)}`;
  }
  if (looksAbsolutePath(raw)) {
    return `source-path:${shortHash(resolve(raw))}`;
  }
  return safeText(raw.replace(/\\/g, '/'), 300);
}

function looksAbsolutePath(value: string): boolean {
  return isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
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

function firstMatch(text: string, regex: RegExp): string | undefined {
  const match = regex.exec(text);
  return match?.[1]?.trim() || undefined;
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
