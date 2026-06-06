import type { Confidence, Severity } from '../../domain/types.js';
import { redactText, redactUrl } from '../../security/redaction.js';

export interface FfufResult {
  engine: 'ffuf';
  scannerId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  affectedAsset: string;
  description: string;
  remediation: string;
  evidenceSummary: {
    url: string;
    statusCode?: number;
    length?: number;
    words?: number;
    fuzzWord: string;
  };
}

export interface FfufMatch {
  url: string;
  statusCode?: number;
  length?: number;
  words?: number;
  lines?: number;
  fuzzWord: string;
  redirectLocation?: string;
}

export interface FfufAdapterOptions {
  maxResults?: number;
}

/**
 * Typed adapter for ffuf JSON output parsing.
 *
 * ffuf is a fast web fuzzer for content discovery.
 * This adapter parses ffuf JSON output (-of json), which emits a single JSON object
 * with a "results" array containing discovered paths.
 *
 * Risk profile:
 * - Content discovery is a low-signal surface hit, not a vulnerability
 * - All results are info-level and require operator validation
 * - Used for path enumeration and hidden resource discovery
 *
 * @param raw - Raw ffuf JSON output
 * @param options - Adapter configuration options
 * @returns Array of normalized scanner results
 */
export function parseFfufOutput(raw: string, options?: FfufAdapterOptions): FfufResult[] {
  const maxResults = options?.maxResults ?? 250;

  const parsed = parseJsonObject(raw, 'FFUF JSON');
  const results = arrayOfRecords(parsed.results).slice(0, maxResults);

  return results.map((result, index) => {
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
      severity: 'info',
      confidence: 'needs_dynamic_confirmation',
      affectedAsset: safeTarget(url),
      description: safeText(
        [
          statusCode ? `HTTP ${statusCode}` : '',
          length !== undefined ? `len: ${length}` : '',
          words !== undefined ? `words: ${words}` : '',
        ]
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

/**
 * Extract structured match information from ffuf output
 * for programmatic consumption.
 *
 * @param raw - Raw ffuf JSON output
 * @returns Array of matches with their metadata
 */
export function extractFfufMatches(raw: string): FfufMatch[] {
  const parsed = parseJsonObject(raw, 'FFUF JSON');
  const results = arrayOfRecords(parsed.results);

  return results.map((result) => ({
    url: stringValue(result.url) ?? '',
    statusCode: typeof result.status === 'number' ? (result.status as number) : undefined,
    length: typeof result.length === 'number' ? (result.length as number) : undefined,
    words: typeof result.words === 'number' ? (result.words as number) : undefined,
    lines: typeof result.lines === 'number' ? (result.lines as number) : undefined,
    fuzzWord: stringValue(recordValue(result.input)?.FUZZ) ?? stringValue(result.fuzz) ?? '',
    redirectLocation: stringValue(result.redirectlocation),
  }));
}

/**
 * Validate ffuf output format.
 *
 * @param raw - Raw ffuf JSON output
 * @returns true if the output appears to be valid ffuf JSON format
 */
export function isValidFfufOutput(raw: string): boolean {
  if (!raw || typeof raw !== 'string') {
    return false;
  }

  try {
    const parsed = JSON.parse(raw);

    // ffuf outputs a single object with a "results" array
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

function safeTarget(value: string): string {
  return safeText(redactUrl(value), 500);
}

function safeText(value: string | undefined, maxLength: number): string {
  return redactText(value ?? '').slice(0, maxLength);
}
