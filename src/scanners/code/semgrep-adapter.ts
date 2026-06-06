import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';

import type { Confidence, Severity } from '../../domain/types.js';
import { redactText } from '../../security/redaction.js';

export interface SemgrepResult {
  engine: 'semgrep';
  scannerId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  affectedAsset: string;
  description: string;
  remediation: string;
  evidenceSummary: {
    checkId: string;
    path: string;
    line?: number;
  };
}

export interface SemgrepFinding {
  checkId: string;
  path: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: Severity;
  category?: string;
  cwe?: string[];
  owasp?: string[];
}

export interface SemgrepAdapterOptions {
  maxResults?: number;
  workspace?: string;
}

/**
 * Typed adapter for Semgrep JSON output parsing.
 *
 * Semgrep is a static analysis tool for finding bugs and security issues in source code.
 * This adapter parses Semgrep JSON output (--json flag).
 *
 * Risk profile:
 * - Static analysis results are candidate findings only
 * - All results require dynamic confirmation (needs_dynamic_confirmation)
 * - Paths are sanitized relative to workspace or hashed if outside
 * - No source code content is stored in evidence by default
 *
 * @param raw - Raw Semgrep JSON output
 * @param options - Adapter configuration options
 * @returns Array of normalized scanner results
 */
export function parseSemgrepOutput(raw: string, options?: SemgrepAdapterOptions): SemgrepResult[] {
  const maxResults = options?.maxResults ?? 250;

  const parsed = parseJsonObject(raw, 'Semgrep JSON');
  const results = arrayOfRecords(parsed.results).slice(0, maxResults);

  return results.map((result, index) => {
    const extra = recordValue(result.extra);
    const metadata = recordValue(extra?.metadata);
    const severity = severityFromString(stringValue(extra?.severity) ?? stringValue(metadata?.impact)) ?? 'medium';
    const path = safeSemgrepPath(stringValue(result.path), options?.workspace);
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
      remediation: safeText(
        stringValue(metadata?.fix) ?? stringValue(metadata?.references) ?? 'Review the matched code path and apply the Semgrep rule remediation.',
        800,
      ),
      evidenceSummary: {
        checkId,
        path,
        line: typeof start?.line === 'number' ? start.line : undefined,
      },
    };
  });
}

/**
 * Extract structured finding information from Semgrep output
 * for programmatic consumption.
 *
 * @param raw - Raw Semgrep JSON output
 * @param workspace - Optional workspace root for path resolution
 * @returns Array of findings with their metadata
 */
export function extractSemgrepFindings(raw: string, workspace?: string): SemgrepFinding[] {
  const parsed = parseJsonObject(raw, 'Semgrep JSON');
  const results = arrayOfRecords(parsed.results);

  return results.map((result) => {
    const extra = recordValue(result.extra);
    const metadata = recordValue(extra?.metadata);
    const start = recordValue(result.start);
    const end = recordValue(result.end);

    return {
      checkId: stringValue(result.check_id) ?? '',
      path: safeSemgrepPath(stringValue(result.path), workspace),
      line: typeof start?.line === 'number' ? start.line : undefined,
      column: typeof start?.col === 'number' ? start.col : undefined,
      endLine: typeof end?.line === 'number' ? end.line : undefined,
      endColumn: typeof end?.col === 'number' ? end.col : undefined,
      message: stringValue(extra?.message) ?? '',
      severity: severityFromString(stringValue(extra?.severity) ?? stringValue(metadata?.impact)) ?? 'medium',
      category: stringValue(metadata?.category),
      cwe: stringArray(metadata?.cwe),
      owasp: stringArray(metadata?.owasp),
    };
  });
}

/**
 * Validate Semgrep output format.
 *
 * @param raw - Raw Semgrep JSON output
 * @returns true if the output appears to be valid Semgrep JSON format
 */
export function isValidSemgrepOutput(raw: string): boolean {
  if (!raw || typeof raw !== 'string') {
    return false;
  }

  try {
    const parsed = JSON.parse(raw);

    // Semgrep outputs an object with a "results" array
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      (Array.isArray(parsed.results) || parsed.results === undefined)
    );
  } catch {
    return false;
  }
}

function safeSemgrepPath(value: string | undefined, workspaceRaw?: string): string {
  const raw = value?.trim() || 'source-location-unavailable';
  const workspace = workspaceRaw?.trim() || process.env.PLATFORM_SAST_WORKSPACE?.trim();

  if (workspace) {
    const workspaceRoot = resolve(workspace);
    const resolved = looksAbsolutePath(raw) ? resolve(raw) : resolve(workspaceRoot, raw);
    const pathFromWorkspace = relative(workspaceRoot, resolved);

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

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      throw new Error('root must be an object, not an array');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('root must be an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error instanceof Error ? error.message : 'parse failed'}`);
  }
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => safeText(item, 80));
  }
  const single = stringValue(value);
  return single ? [safeText(single, 80)] : [];
}

function safeText(value: string | undefined, maxLength: number): string {
  return redactText(value ?? '').slice(0, maxLength);
}
