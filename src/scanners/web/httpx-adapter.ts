import type { Confidence, Severity } from '../../domain/types.js';
import { redactText, redactUrl } from '../../security/redaction.js';

export interface HttpxResult {
  engine: 'httpx';
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
    webserver: string;
    contentType: string;
    tech: string[];
  };
}

export interface HttpxHost {
  url: string;
  statusCode?: number;
  title?: string;
  webserver?: string;
  contentType?: string;
  contentLength?: number;
  tech: string[];
}

export interface HttpxAdapterOptions {
  maxResults?: number;
}

/**
 * Typed adapter for httpx JSONL output parsing.
 *
 * httpx is a fast HTTP toolkit for probing web services and gathering metadata.
 * This adapter parses httpx JSONL output (one JSON object per line).
 *
 * Risk profile:
 * - httpx is pure surface discovery — never auto-escalate severity
 * - All results are info-level and require operator validation
 * - Used for live host detection and technology fingerprinting
 *
 * @param raw - Raw httpx JSONL output (one JSON per line)
 * @param options - Adapter configuration options
 * @returns Array of normalized scanner results
 */
export function parseHttpxOutput(raw: string, options?: HttpxAdapterOptions): HttpxResult[] {
  const maxResults = options?.maxResults ?? 250;

  return parseJsonLines(raw)
    .slice(0, maxResults)
    .map((result, index) => {
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
        severity: 'info',
        confidence: 'needs_dynamic_confirmation',
        affectedAsset: safeTarget(url),
        description: safeText(
          summaryParts.join(' | ') || `httpx probed ${url} and recorded a live HTTP service.`,
          700,
        ),
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

/**
 * Extract structured host information from httpx output
 * for programmatic consumption.
 *
 * @param raw - Raw httpx JSONL output
 * @returns Array of hosts with their metadata
 */
export function extractHttpxHosts(raw: string): HttpxHost[] {
  return parseJsonLines(raw).map((result) => ({
    url: stringValue(result.url) ?? stringValue(result.input) ?? stringValue(result.host) ?? '',
    statusCode: typeof result['status_code'] === 'number' ? (result['status_code'] as number) : undefined,
    title: stringValue(result.title),
    webserver: stringValue(result.webserver),
    contentType: stringValue(result['content_type']),
    contentLength: typeof result['content_length'] === 'number' ? (result['content_length'] as number) : undefined,
    tech: stringArray(result.tech),
  }));
}

/**
 * Validate httpx output format.
 *
 * @param raw - Raw httpx JSONL output
 * @returns true if the output appears to be valid httpx JSONL format
 */
export function isValidHttpxOutput(raw: string): boolean {
  if (!raw || typeof raw !== 'string') {
    return false;
  }

  try {
    const lines = raw.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) {
      return false;
    }

    // Try to parse the first line
    const firstLine = JSON.parse(lines[0]);

    // Check for characteristic httpx fields
    return (
      typeof firstLine === 'object' &&
      firstLine !== null &&
      (firstLine.url !== undefined || firstLine.host !== undefined || firstLine.input !== undefined)
    );
  } catch {
    return false;
  }
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

function safeTarget(value: string): string {
  return safeText(redactUrl(value), 500);
}

function safeText(value: string | undefined, maxLength: number): string {
  return redactText(value ?? '').slice(0, maxLength);
}
