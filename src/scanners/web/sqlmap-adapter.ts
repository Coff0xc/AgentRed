import type { Confidence, Severity } from '../../domain/types.js';
import { redactText, redactUrl } from '../../security/redaction.js';

export interface SqlmapResult {
  engine: 'sqlmap';
  scannerId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  affectedAsset: string;
  description: string;
  remediation: string;
  evidenceSummary: {
    parameter: string;
    place: string;
    technique: string;
  };
}

export interface SqlmapInjection {
  parameter: string;
  place: string;
  technique: string;
  title: string;
  url?: string;
  dbms?: string;
}

export interface SqlmapAdapterOptions {
  maxResults?: number;
  maxTextLength?: number;
}

/**
 * Typed adapter for sqlmap text output parsing.
 *
 * sqlmap is an R3 confirmation engine for SQL injection testing.
 * This adapter parses sqlmap text output and identifies confirmed-injection signals.
 *
 * Risk profile:
 * - sqlmap is R3 and requires human approval before execution
 * - Only confirmed injectable parameters are surfaced (high severity, likely confidence)
 * - Results still require operator validation before impact escalation
 * - Only executed on explicitly authorized parameters
 *
 * @param raw - Raw sqlmap text output
 * @param options - Adapter configuration options
 * @returns Array of normalized scanner results
 */
export function parseSqlmapOutput(raw: string, options?: SqlmapAdapterOptions): SqlmapResult[] {
  const maxResults = options?.maxResults ?? 50;
  const maxTextLength = options?.maxTextLength ?? 200_000;

  const text = raw.slice(0, maxTextLength);
  const results: SqlmapResult[] = [];

  // "Parameter: id (GET)" blocks indicate a confirmed injectable parameter
  const paramRegex = /Parameter:\s*([^\n(]+)\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = paramRegex.exec(text)) !== null && index < maxResults) {
    const parameter = safeText(match[1]?.trim() ?? `param-${index + 1}`, 120);
    const place = safeText(match[2]?.trim() ?? '', 40);

    // Capture the technique lines following this parameter block (Type:/Title:)
    const followingText = text.slice(match.index, match.index + 800);
    const titleMatch = /Title:\s*([^\n]+)/i.exec(followingText);
    const typeMatch = /Type:\s*([^\n]+)/i.exec(followingText);
    const techniqueTitle = safeText(
      titleMatch?.[1]?.trim() ?? typeMatch?.[1]?.trim() ?? 'SQL injection',
      180,
    );

    results.push({
      engine: 'sqlmap',
      scannerId: safeText(`sqlmap:${parameter}:${place}`, 160),
      title: `SQL injection confirmed in ${parameter}${place ? ` (${place})` : ''}`.slice(0, 180),
      severity: 'high',
      confidence: 'likely',
      affectedAsset: safeTarget(firstMatch(text, /URL:\s*(\S+)/i) ?? 'target-unavailable'),
      description: safeText(
        `sqlmap reported ${techniqueTitle} on parameter ${parameter}. Verify the injection manually before reporting impact.`,
        700,
      ),
      remediation: 'Use parameterized queries / prepared statements and validate input. Confirm the injection scope with the operator before escalation.',
      evidenceSummary: {
        parameter,
        place,
        technique: techniqueTitle,
      },
    });
    index += 1;
  }

  // Only return results if at least one injection was found
  return results;
}

/**
 * Extract structured injection information from sqlmap output
 * for programmatic consumption.
 *
 * @param raw - Raw sqlmap text output
 * @returns Array of identified injections with their metadata
 */
export function extractSqlmapInjections(raw: string): SqlmapInjection[] {
  const text = raw.slice(0, 200_000);
  const injections: SqlmapInjection[] = [];

  const url = firstMatch(text, /URL:\s*(\S+)/i);
  const dbms = firstMatch(text, /back-end DBMS:\s*([^\n]+)/i);

  const paramRegex = /Parameter:\s*([^\n(]+)\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = paramRegex.exec(text)) !== null) {
    const parameter = match[1]?.trim() ?? '';
    const place = match[2]?.trim() ?? '';

    const followingText = text.slice(match.index, match.index + 800);
    const titleMatch = /Title:\s*([^\n]+)/i.exec(followingText);
    const typeMatch = /Type:\s*([^\n]+)/i.exec(followingText);
    const technique = titleMatch?.[1]?.trim() ?? typeMatch?.[1]?.trim() ?? 'SQL injection';
    const title = `${technique} in ${parameter}`;

    injections.push({
      parameter,
      place,
      technique,
      title,
      url,
      dbms,
    });
  }

  return injections;
}

/**
 * Validate sqlmap output format.
 *
 * @param raw - Raw sqlmap text output
 * @returns true if the output appears to be valid sqlmap text format
 */
export function isValidSqlmapOutput(raw: string): boolean {
  if (!raw || typeof raw !== 'string') {
    return false;
  }

  // Check for characteristic sqlmap output markers
  const hasSqlmapHeader = /sqlmap\/\d+\.\d+/i.test(raw);
  const hasParameterBlock = /Parameter:\s*[^\n(]+\([^)]*\)/i.test(raw);
  const hasUrlLine = /URL:\s*\S+/i.test(raw);

  return hasSqlmapHeader || hasParameterBlock || hasUrlLine;
}

function firstMatch(text: string, regex: RegExp): string | undefined {
  const match = regex.exec(text);
  return match?.[1]?.trim() || undefined;
}

function safeTarget(value: string): string {
  return safeText(redactUrl(value), 500);
}

function safeText(value: string | undefined, maxLength: number): string {
  return redactText(value ?? '').slice(0, maxLength);
}
