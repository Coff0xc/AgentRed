import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  ApprovalRequest,
  AccessReview,
  AndroidManifestImport,
  BrowserSession,
  BrowserSnapshot,
  CaptureImport,
  CloudIamImport,
  ConnectorRun,
  CostLedgerEntry,
  CredentialReference,
  OastCallback,
  OastSession,
  ProgramScopeImport,
  RegisteredConnector,
  RegisteredToolboxBundle,
  RunExport,
  RunConnectorBinding,
  RunToolboxBundleBinding,
  RunPocTemplateBinding,
  SarifImport,
  EvidenceReview,
  RunSkillBinding,
  Evidence,
  Fact,
  Finding,
  Hint,
  IdentityGraphImport,
  Intent,
  ProxySession,
  Run,
  RunEvaluation,
  RunEvent,
  TraceSpan,
  ToolPackRun,
  ToolInvocation,
} from '../domain/types.js';

export interface EvidenceBlob {
  encoding: 'utf8' | 'base64';
  content: string;
  sizeBytes: number;
}

export interface PlatformState {
  runs: Record<string, Run>;
  facts: Record<string, Fact>;
  intents: Record<string, Intent>;
  hints: Record<string, Hint>;
  evidence: Record<string, Evidence>;
  evidenceBlobs: Record<string, EvidenceBlob>;
  evidenceReviews: Record<string, EvidenceReview>;
  findings: Record<string, Finding>;
  toolInvocations: Record<string, ToolInvocation>;
  connectorRuns: Record<string, ConnectorRun>;
  toolPackRuns: Record<string, ToolPackRun>;
  runExports: Record<string, RunExport>;
  rateLimitEvents: Record<string, string[]>;
  approvals: Record<string, ApprovalRequest>;
  browserSessions: Record<string, BrowserSession>;
  browserSnapshots: Record<string, BrowserSnapshot>;
  proxySessions: Record<string, ProxySession>;
  oastSessions: Record<string, OastSession>;
  oastCallbacks: Record<string, OastCallback>;
  credentialReferences: Record<string, CredentialReference>;
  accessReviews: Record<string, AccessReview>;
  androidManifestImports: Record<string, AndroidManifestImport>;
  cloudIamImports: Record<string, CloudIamImport>;
  identityGraphImports: Record<string, IdentityGraphImport>;
  captureImports: Record<string, CaptureImport>;
  programScopeImports: Record<string, ProgramScopeImport>;
  sarifImports: Record<string, SarifImport>;
  registeredConnectors: Record<string, RegisteredConnector>;
  runConnectorBindings: Record<string, RunConnectorBinding>;
  registeredToolboxBundles: Record<string, RegisteredToolboxBundle>;
  runToolboxBundleBindings: Record<string, RunToolboxBundleBinding>;
  runPocTemplateBindings: Record<string, RunPocTemplateBinding>;
  runSkillBindings: Record<string, RunSkillBinding>;
  runEvents: Record<string, RunEvent>;
  traceSpans: Record<string, TraceSpan>;
  costLedger: Record<string, CostLedgerEntry>;
  evaluations: Record<string, RunEvaluation>;
}

export interface PlatformStore {
  state: PlatformState;
  commit(): void;
}

export function emptyState(): PlatformState {
  return {
    runs: {},
    facts: {},
    intents: {},
    hints: {},
    evidence: {},
    evidenceBlobs: {},
    evidenceReviews: {},
    findings: {},
    toolInvocations: {},
    connectorRuns: {},
    toolPackRuns: {},
    runExports: {},
    rateLimitEvents: {},
    approvals: {},
    browserSessions: {},
    browserSnapshots: {},
    proxySessions: {},
    oastSessions: {},
    oastCallbacks: {},
    credentialReferences: {},
    accessReviews: {},
    androidManifestImports: {},
    cloudIamImports: {},
    identityGraphImports: {},
    captureImports: {},
    programScopeImports: {},
    sarifImports: {},
    registeredConnectors: {},
    runConnectorBindings: {},
    registeredToolboxBundles: {},
    runToolboxBundleBindings: {},
    runPocTemplateBindings: {},
    runSkillBindings: {},
    runEvents: {},
    traceSpans: {},
    costLedger: {},
    evaluations: {},
  };
}

function normalizeState(state: Partial<PlatformState>): PlatformState {
  return {
    ...emptyState(),
    ...state,
    runs: state.runs ?? {},
    facts: state.facts ?? {},
    intents: state.intents ?? {},
    hints: state.hints ?? {},
    evidence: state.evidence ?? {},
    evidenceBlobs: state.evidenceBlobs ?? {},
    evidenceReviews: state.evidenceReviews ?? {},
    findings: state.findings ?? {},
    toolInvocations: state.toolInvocations ?? {},
    connectorRuns: state.connectorRuns ?? {},
    toolPackRuns: state.toolPackRuns ?? {},
    runExports: state.runExports ?? {},
    rateLimitEvents: state.rateLimitEvents ?? {},
    approvals: state.approvals ?? {},
    browserSessions: state.browserSessions ?? {},
    browserSnapshots: state.browserSnapshots ?? {},
    proxySessions: state.proxySessions ?? {},
    oastSessions: state.oastSessions ?? {},
    oastCallbacks: state.oastCallbacks ?? {},
    credentialReferences: state.credentialReferences ?? {},
    accessReviews: state.accessReviews ?? {},
    androidManifestImports: state.androidManifestImports ?? {},
    cloudIamImports: state.cloudIamImports ?? {},
    identityGraphImports: state.identityGraphImports ?? {},
    captureImports: state.captureImports ?? {},
    programScopeImports: state.programScopeImports ?? {},
    sarifImports: state.sarifImports ?? {},
    registeredConnectors: state.registeredConnectors ?? {},
    runConnectorBindings: state.runConnectorBindings ?? {},
    registeredToolboxBundles: state.registeredToolboxBundles ?? {},
    runToolboxBundleBindings: state.runToolboxBundleBindings ?? {},
    runPocTemplateBindings: state.runPocTemplateBindings ?? {},
    runSkillBindings: state.runSkillBindings ?? {},
    runEvents: state.runEvents ?? {},
    traceSpans: state.traceSpans ?? {},
    costLedger: state.costLedger ?? {},
    evaluations: state.evaluations ?? {},
  };
}

export class InMemoryPlatformStore implements PlatformStore {
  public state: PlatformState;

  constructor(initialState: PlatformState = emptyState()) {
    this.state = normalizeState(initialState);
  }

  commit(): void {
    // Intentionally no-op. The interface lets services stay storage-agnostic.
  }
}

export class SqlitePlatformStore implements PlatformStore {
  public state: PlatformState;
  private readonly databasePath: string;

  constructor(databasePath: string) {
    this.databasePath = databasePath;
    mkdirSync(dirname(databasePath), { recursive: true });
    this.state = this.load();
  }

  commit(): void {
    const db = this.open();
    try {
      db.prepare(
        'insert into platform_state (id, json) values (?, ?) on conflict(id) do update set json = excluded.json',
      ).run('state', JSON.stringify(this.state));
    } finally {
      db.close();
    }
  }

  private load(): PlatformState {
    const db = this.open();
    try {
      const row = db.prepare('select json from platform_state where id = ?').get('state') as
        | { json: string }
        | undefined;
      return row ? normalizeState(JSON.parse(row.json) as Partial<PlatformState>) : emptyState();
    } finally {
      db.close();
    }
  }

  private open(): DatabaseSync {
    const db = new DatabaseSync(this.databasePath);
    db.exec('create table if not exists platform_state (id text primary key, json text not null)');
    return db;
  }
}
