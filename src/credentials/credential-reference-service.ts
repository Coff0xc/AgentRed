import { newId, nowIso } from '../domain/ids.js';
import type { CredentialReference, CredentialReferenceKind } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { PlatformStore } from '../storage/store.js';

export interface CreateCredentialReferenceInput {
  runId: string;
  label: string;
  role: string;
  kind: CredentialReferenceKind;
  placeholder: string;
  allowedUse: string[];
}

export interface CredentialUseRequest {
  credentialId?: string;
  role?: string;
  label?: string;
  usedFor?: string;
}

export interface WorkerCredentialReferenceContext {
  id: string;
  label: string;
  role: string;
  kind: CredentialReferenceKind;
  allowedUse: string[];
  status: 'active';
  usageHint: string;
}

export class CredentialReferenceService {
  constructor(
    private readonly store: PlatformStore,
    private readonly events?: RunEventService,
  ) {}

  create(input: CreateCredentialReferenceInput): CredentialReference {
    const run = this.store.state.runs[input.runId];
    if (!run) {
      throw new Error(`Run not found: ${input.runId}`);
    }
    const kind = validateKind(input.kind);
    if (run.scopePolicy.credentialRules.allowVaultReferencesOnly && kind !== 'vault_reference') {
      throw new Error('ScopePolicy allows vault references only for this run');
    }
    const label = cleanText(input.label, 'label', 80);
    const role = cleanText(input.role, 'role', 80);
    const placeholder = validatePlaceholder(kind, input.placeholder);
    const allowedUse = normalizeAllowedUse(input.allowedUse);
    const credential: CredentialReference = {
      id: newId('credential'),
      runId: input.runId,
      label,
      role,
      kind,
      placeholder,
      allowedUse,
      status: 'active',
      createdAt: nowIso(),
    };
    this.store.state.credentialReferences[credential.id] = credential;
    this.events?.record({
      runId: input.runId,
      type: 'credential.reference.created',
      title: 'Credential reference created',
      detail: `${label} (${role}) ${kind}`,
      level: 'info',
      entityId: credential.id,
    });
    this.store.commit();
    return credential;
  }

  list(runId: string): CredentialReference[] {
    if (!this.store.state.runs[runId]) {
      throw new Error(`Run not found: ${runId}`);
    }
    return Object.values(this.store.state.credentialReferences)
      .filter((credential) => credential.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  revoke(credentialId: string): CredentialReference {
    const credential = this.store.state.credentialReferences[credentialId];
    if (!credential) {
      throw new Error(`Credential reference not found: ${credentialId}`);
    }
    if (credential.status === 'revoked') {
      return credential;
    }
    credential.status = 'revoked';
    credential.revokedAt = nowIso();
    this.events?.record({
      runId: credential.runId,
      type: 'credential.reference.revoked',
      title: 'Credential reference revoked',
      detail: `${credential.label} (${credential.role})`,
      level: 'warning',
      entityId: credential.id,
    });
    this.store.commit();
    return credential;
  }

  resolveForUse(runId: string, request: CredentialUseRequest): CredentialReference {
    const candidates = this.list(runId).filter((credential) => credential.status === 'active');
    const credential = request.credentialId
      ? candidates.find((item) => item.id === request.credentialId)
      : candidates.find(
          (item) =>
            (!request.role || item.role.toLowerCase() === request.role.toLowerCase()) &&
            (!request.label || item.label.toLowerCase() === request.label.toLowerCase()),
        );
    if (!credential) {
      throw new Error('Active credential reference was not found for this run');
    }
    return credential;
  }

  workerContext(runId: string): WorkerCredentialReferenceContext[] {
    return this.list(runId)
      .filter((credential) => credential.status === 'active')
      .map((credential) => ({
        id: credential.id,
        label: credential.label,
        role: credential.role,
        kind: credential.kind,
        allowedUse: [...credential.allowedUse],
        status: 'active',
        usageHint: `Request credential.use_placeholder with credentialId=${credential.id}; never ask for raw secret material.`,
      }));
  }
}

function validateKind(kind: CredentialReferenceKind): CredentialReferenceKind {
  if (
    kind !== 'vault_reference' &&
    kind !== 'header_placeholder' &&
    kind !== 'cookie_placeholder' &&
    kind !== 'account_note'
  ) {
    throw new Error('Credential reference kind is invalid');
  }
  return kind;
}

function cleanText(value: string, field: string, maxLength: number): string {
  const text = value.trim();
  if (!text) {
    throw new Error(`${field} is required`);
  }
  if (looksLikeRawSecret(text)) {
    throw new Error(`${field} must not contain raw secret material`);
  }
  return text.slice(0, maxLength);
}

function normalizeAllowedUse(values: string[]): string[] {
  const result = [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 12);
  if (result.length === 0) {
    throw new Error('allowedUse must include at least one use case');
  }
  if (result.some(looksLikeRawSecret)) {
    throw new Error('allowedUse must not contain raw secret material');
  }
  return result.map((value) => value.slice(0, 80));
}

function validatePlaceholder(kind: CredentialReferenceKind, value: string): string {
  const placeholder = cleanText(value, 'placeholder', 240);
  if (looksLikeRawSecret(placeholder)) {
    throw new Error('Credential reference must not contain raw secret material');
  }
  if (kind === 'vault_reference' && !/^(vault|op|keychain|aws-sm|gcp-sm|azure-kv):\/\/[^\s]+$/i.test(placeholder)) {
    throw new Error('vault_reference placeholder must use vault://, op://, keychain://, aws-sm://, gcp-sm://, or azure-kv://');
  }
  if ((kind === 'header_placeholder' || kind === 'cookie_placeholder') && !/^\{\{[A-Z0-9_.:-]+\}\}$/i.test(placeholder)) {
    throw new Error(`${kind} must use a named placeholder such as {{VIEWER_TOKEN}}`);
  }
  return placeholder;
}

function looksLikeRawSecret(value: string): boolean {
  if (/bearer\s+[a-z0-9._~+/-]+=*/i.test(value)) {
    return true;
  }
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    return true;
  }
  if (/(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+/i.test(value)) {
    return true;
  }
  if (/^[A-Za-z0-9+/_=-]{48,}$/.test(value) && !/^(vault|op|keychain|aws-sm|gcp-sm|azure-kv):\/\//i.test(value)) {
    return true;
  }
  return false;
}
