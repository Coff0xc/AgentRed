import type { Confidence, Severity } from '../../domain/types.js';
import { redactText, redactUrl } from '../../security/redaction.js';

export interface NmapPort {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'open|filtered';
  service: string;
  version: string;
}

export interface NmapHost {
  host: string;
  ports: NmapPort[];
}

export interface NmapResult {
  engine: 'nmap';
  scannerId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  affectedAsset: string;
  description: string;
  remediation: string;
  evidenceSummary: {
    host: string;
    port: number;
    protocol: string;
    service: string;
    version: string;
  };
}

export interface NmapAdapterOptions {
  maxResults?: number;
  maxTextLength?: number;
}

/**
 * Typed adapter for nmap output parsing.
 *
 * Nmap is a network scanning tool that discovers open ports and services.
 * This adapter parses nmap text output and extracts structured port/service information.
 *
 * Risk profile:
 * - Open ports are surface-discovery signals (info), never auto-findings
 * - All results require operator validation and scope confirmation
 * - No automatic severity escalation regardless of service type
 *
 * @param raw - Raw nmap text output
 * @param options - Adapter configuration options
 * @returns Array of normalized scanner results
 */
export function parseNmapOutput(raw: string, options?: NmapAdapterOptions): NmapResult[] {
  const maxResults = options?.maxResults ?? 200;
  const maxTextLength = options?.maxTextLength ?? 200_000;

  const text = raw.slice(0, maxTextLength);
  const host = safeTarget(firstMatch(text, /Nmap scan report for\s+(\S+)/i) ?? 'target-unavailable');

  // Lines like: "443/tcp open  https" or "22/tcp open ssh OpenSSH 8.9"
  const lines = text.split(/\r?\n/);
  const portRegex = /^(\d{1,5})\/(tcp|udp)\s+(open|open\|filtered)\s+(\S+)(?:\s+(.*))?$/i;
  const results: NmapResult[] = [];
  let index = 0;

  for (const line of lines) {
    if (index >= maxResults) break;
    const match = portRegex.exec(line.trim());
    if (!match) continue;

    const port = match[1];
    const proto = match[2] as 'tcp' | 'udp';
    const service = safeText(match[4] ?? 'unknown', 60);
    const version = safeText(match[5]?.trim() ?? '', 160);

    results.push({
      engine: 'nmap',
      scannerId: safeText(`nmap:${host}:${port}/${proto}`, 160),
      title: `Open port ${port}/${proto} (${service})`.slice(0, 180),
      severity: 'info',
      confidence: 'needs_dynamic_confirmation',
      affectedAsset: host,
      description: safeText(
        [
          `Port ${port}/${proto} is open`,
          `service: ${service}`,
          version ? `version: ${version}` : '',
        ]
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

  return results;
}

/**
 * Extract structured host and port information from nmap output
 * for programmatic consumption (e.g., feeding into further scanning).
 *
 * @param raw - Raw nmap text output
 * @returns Array of hosts with their discovered ports
 */
export function extractNmapHosts(raw: string): NmapHost[] {
  const text = raw.slice(0, 200_000);
  const hosts = new Map<string, NmapPort[]>();

  const host = firstMatch(text, /Nmap scan report for\s+(\S+)/i) ?? 'target-unavailable';

  const lines = text.split(/\r?\n/);
  const portRegex = /^(\d{1,5})\/(tcp|udp)\s+(open|open\|filtered)\s+(\S+)(?:\s+(.*))?$/i;

  for (const line of lines) {
    const match = portRegex.exec(line.trim());
    if (!match) continue;

    const port = Number(match[1]);
    const proto = match[2] as 'tcp' | 'udp';
    const state = match[3] as 'open' | 'open|filtered';
    const service = match[4] ?? 'unknown';
    const version = match[5]?.trim() ?? '';

    if (!hosts.has(host)) {
      hosts.set(host, []);
    }

    hosts.get(host)?.push({
      port,
      protocol: proto,
      state,
      service,
      version,
    });
  }

  return Array.from(hosts.entries()).map(([hostName, ports]) => ({
    host: hostName,
    ports,
  }));
}

/**
 * Validate nmap output format.
 *
 * @param raw - Raw nmap text output
 * @returns true if the output appears to be valid nmap text format
 */
export function isValidNmapOutput(raw: string): boolean {
  if (!raw || typeof raw !== 'string') {
    return false;
  }

  // Check for characteristic nmap output markers
  const hasNmapHeader = /Nmap scan report/i.test(raw);
  const hasPortInfo = /\d+\/(tcp|udp)\s+(open|closed|filtered)/i.test(raw);

  return hasNmapHeader || hasPortInfo;
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
