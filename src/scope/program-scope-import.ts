import type { ProgramScopeImportFormat, ScopePolicy } from '../domain/types.js';

export interface ProgramScopeImportRequest {
  format: ProgramScopeImportFormat;
  content: Record<string, unknown>;
  allowedMethods?: string[];
  requestsPerMinute?: number;
  destructiveAllowed?: boolean;
  allowVaultReferencesOnly?: boolean;
}

export interface ProgramScopeImportResult {
  scopePolicy: ScopePolicy;
  defaultTarget?: string;
  notes: string[];
}

type Bucket = 'allow' | 'deny';

const DEFAULT_METHODS = ['GET', 'POST'];
const DEFAULT_REQUESTS_PER_MINUTE = 120;

export function normalizeProgramScope(input: ProgramScopeImportRequest): ProgramScopeImportResult {
  const allowed = new Set<string>();
  const denied = new Set<string>();
  collectAssets(input.content, undefined, allowed, denied);

  const allowedAssets = Array.from(allowed).sort();
  const deniedAssets = Array.from(denied).sort();
  const allowedMethods = normalizeMethods(input.allowedMethods ?? stringArrayField(input.content, ['allowedMethods', 'allowed_methods']));
  const requestsPerMinute = normalizeRateLimit(input.requestsPerMinute ?? numberField(input.content, ['requestsPerMinute', 'requests_per_minute']));
  const scopePolicy: ScopePolicy = {
    allowedAssets,
    deniedAssets,
    allowedMethods,
    destructiveAllowed: input.destructiveAllowed ?? booleanField(input.content, ['destructiveAllowed', 'destructive_allowed']) ?? false,
    credentialRules: {
      allowVaultReferencesOnly:
        input.allowVaultReferencesOnly ??
        booleanField(input.content, ['allowVaultReferencesOnly', 'allow_vault_references_only']) ??
        true,
    },
    rateLimits: {
      requestsPerMinute,
    },
  };
  return {
    scopePolicy,
    defaultTarget: defaultTarget(allowedAssets),
    notes: scopeNotes(input.format, allowedAssets.length, deniedAssets.length),
  };
}

function collectAssets(value: unknown, bucket: Bucket | undefined, allowed: Set<string>, denied: Set<string>): void {
  if (typeof value === 'string') {
    addAsset(value, bucket, allowed, denied);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectAssets(item, bucket, allowed, denied));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const itemBucket = bucketFromStructuredScope(value, bucket);
  const asset = assetFromRecord(value);
  if (asset) {
    addAsset(asset, itemBucket, allowed, denied);
  }

  for (const [key, child] of Object.entries(value)) {
    const nextBucket = bucketFromKey(key) ?? itemBucket;
    collectAssets(child, nextBucket, allowed, denied);
  }
}

function bucketFromKey(key: string): Bucket | undefined {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (
    normalized.includes('out_of_scope') ||
    normalized.includes('outscope') ||
    normalized.includes('denied') ||
    normalized.includes('deny') ||
    normalized.includes('excluded') ||
    normalized.includes('blacklist')
  ) {
    return 'deny';
  }
  if (
    normalized.includes('in_scope') ||
    normalized.includes('inscope') ||
    normalized.includes('allowed') ||
    normalized.includes('allow') ||
    normalized === 'targets' ||
    normalized === 'assets' ||
    normalized === 'structured_scopes' ||
    normalized === 'scopes'
  ) {
    return 'allow';
  }
  return undefined;
}

function bucketFromStructuredScope(record: Record<string, unknown>, fallback: Bucket | undefined): Bucket | undefined {
  const eligible = record.eligible_for_submission ?? record.eligibleForSubmission ?? record.eligible_for_bounty;
  if (typeof eligible === 'boolean') {
    return eligible ? 'allow' : 'deny';
  }
  const status = stringValue(record.status ?? record.state ?? record.scope_status);
  if (status && /out|deny|exclude|inactive|not_eligible/i.test(status)) {
    return 'deny';
  }
  if (status && /in|allow|eligible|active/i.test(status)) {
    return 'allow';
  }
  return fallback;
}

function assetFromRecord(record: Record<string, unknown>): string | undefined {
  const candidate =
    record.asset_identifier ??
    record.assetIdentifier ??
    record.asset ??
    record.target ??
    record.host ??
    record.hostname ??
    record.domain ??
    record.url ??
    record.endpoint ??
    record.value;
  return typeof candidate === 'string' ? candidate : undefined;
}

function addAsset(value: string, bucket: Bucket | undefined, allowed: Set<string>, denied: Set<string>): void {
  if (!bucket) {
    return;
  }
  const normalized = normalizeAsset(value);
  if (!normalized) {
    return;
  }
  if (bucket === 'deny') {
    denied.add(normalized);
    return;
  }
  allowed.add(normalized);
}

function normalizeAsset(value: string): string | undefined {
  let asset = value.trim().replace(/^["'<]+|[">']+$/g, '');
  if (!asset || asset.length > 255) {
    return undefined;
  }
  asset = asset.replace(/^\*:\/\/?/i, '').replace(/^https?:\/\//i, '');
  asset = asset.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  asset = asset.replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
  if (!asset || asset === '*' || asset.includes(' ') || asset.includes('@')) {
    return undefined;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(asset)) {
    return asset;
  }
  if (/^(\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(asset)) {
    return asset;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(asset)) {
    return asset;
  }
  return undefined;
}

function normalizeMethods(input: string[] | undefined): string[] {
  const methods = (input && input.length > 0 ? input : DEFAULT_METHODS)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => /^[A-Z]+$/.test(item));
  return Array.from(new Set(methods.length > 0 ? methods : DEFAULT_METHODS));
}

function normalizeRateLimit(input: number | undefined): number {
  if (!Number.isFinite(input) || !input || input <= 0) {
    return DEFAULT_REQUESTS_PER_MINUTE;
  }
  return Math.min(Math.max(Math.floor(input), 1), 600);
}

function defaultTarget(allowedAssets: string[]): string | undefined {
  const asset = allowedAssets.find((item) => !item.includes('/') && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(item));
  if (!asset) {
    return allowedAssets[0];
  }
  return `https://${asset.replace(/^\*\./, '')}`;
}

function scopeNotes(format: ProgramScopeImportFormat, allowedCount: number, deniedCount: number): string[] {
  return [
    `Imported ${allowedCount} allowed and ${deniedCount} denied asset(s) from ${format}.`,
    'Raw program content was not stored; only hash, counts, and normalized ScopePolicy are persisted.',
  ];
}

function stringArrayField(record: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value;
    }
  }
  return undefined;
}

function numberField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number') {
      return value;
    }
  }
  return undefined;
}

function booleanField(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
