import { createHash } from 'node:crypto';

import { newId, nowIso } from '../domain/ids.js';
import type { CloudIamImport, CloudIamRiskSignal, CloudProvider, Severity } from '../domain/types.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { FindingService } from '../findings/finding-service.js';
import { redactText } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

export interface CloudIamImportInput {
  runId: string;
  source?: string;
  provider: CloudProvider;
  content: unknown;
  createFindings: boolean;
}

interface IamStatement {
  index: number;
  effect: string;
  actions: string[];
  notActions: string[];
  resources: string[];
  notResources: string[];
  conditions: string[];
}

export class CloudIamImportService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly findings: FindingService,
    private readonly events?: RunEventService,
  ) {}

  list(runId: string): CloudIamImport[] {
    this.assertRun(runId);
    return Object.values(this.store.state.cloudIamImports)
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  import(input: CloudIamImportInput): {
    importRecord: CloudIamImport;
    evidenceId: string;
    findingIds: string[];
  } {
    const run = this.assertRun(input.runId);
    const source = safeText(input.source || 'cloud-iam-policy.json', 200);
    const raw = serialize(input.content);
    const parsed = parseJson(raw);
    const policy = unwrapPolicy(parsed);
    const statements = normalizeStatements(policy);
    const risks = iamRisks(statements);
    const inputSha256 = createHash('sha256').update(raw).digest('hex');
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'cloud.iam.import',
        source,
        provider: input.provider,
        inputSha256,
        policyName: safeText(stringValue(parsed.PolicyName) ?? stringValue(parsed.policyName) ?? stringValue(parsed.name), 200),
        principal: safeText(stringValue(parsed.Principal) ?? stringValue(parsed.principal), 200),
        summary: {
          statements: statements.length,
          allowStatements: statements.filter((statement) => statement.effect === 'Allow').length,
          wildcardActions: statements.filter((statement) => statement.actions.some(isWildcard)).length,
          wildcardResources: statements.filter((statement) => statement.resources.some(isWildcard)).length,
          risks: risks.length,
        },
        statements: statements.slice(0, 100),
        statementTruncated: statements.length > 100,
        risks: risks.slice(0, 100),
        riskTruncated: risks.length > 100,
        importedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    const findingIds = input.createFindings
      ? risks.slice(0, 25).map((risk) =>
          this.findings.proposeFinding({
            runId: input.runId,
            title: risk.title,
            severity: risk.severity,
            confidence: 'needs_dynamic_confirmation',
            affectedAssets: [risk.resources.join(', ') || source || run.target],
            evidenceIds: [evidence.id],
            reproSteps: [`Review IAM statement #${risk.statementIndex} in imported evidence ${evidence.id}.`],
            impact: risk.reason,
            remediation: remediationFor(risk),
          }).id,
        )
      : [];
    const importRecord: CloudIamImport = {
      id: newId('cloud_iam'),
      runId: input.runId,
      source,
      provider: input.provider,
      status: 'imported',
      evidenceId: evidence.id,
      inputSha256,
      policyName: safeText(stringValue(parsed.PolicyName) ?? stringValue(parsed.policyName) ?? stringValue(parsed.name), 200),
      principal: safeText(stringValue(parsed.Principal) ?? stringValue(parsed.principal), 200),
      statementCount: statements.length,
      allowStatementCount: statements.filter((statement) => statement.effect === 'Allow').length,
      wildcardActionCount: statements.filter((statement) => statement.actions.some(isWildcard)).length,
      wildcardResourceCount: statements.filter((statement) => statement.resources.some(isWildcard)).length,
      riskCount: risks.length,
      riskSignals: risks.slice(0, 50),
      importedFindings: findingIds.length,
      findingIds,
      createdAt: nowIso(),
    };
    this.store.state.cloudIamImports[importRecord.id] = importRecord;
    this.events?.record({
      runId: input.runId,
      type: 'cloud.iam.imported',
      title: 'Cloud IAM policy imported',
      detail: `${importRecord.riskCount} risk signal(s), ${importRecord.importedFindings} candidate finding(s)`,
      entityId: importRecord.id,
      level: importRecord.riskCount > 0 ? 'warning' : 'info',
    });
    this.store.commit();
    return { importRecord, evidenceId: evidence.id, findingIds };
  }

  private assertRun(runId: string) {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }
}

function iamRisks(statements: IamStatement[]): CloudIamRiskSignal[] {
  const risks: CloudIamRiskSignal[] = [];
  for (const statement of statements) {
    if (statement.effect !== 'Allow') continue;
    if (statement.actions.some(isWildcard) && statement.resources.some(isWildcard)) {
      risks.push(risk(statement, 'iam.admin', 'Cloud IAM policy grants wildcard administrative access', 'critical', 'Action and Resource both allow wildcard access.'));
    }
    if (statement.notActions.length > 0) {
      risks.push(risk(statement, 'iam.not_action_allow', 'Cloud IAM policy uses Allow with NotAction', 'high', 'Allow with NotAction can grant every action except a small excluded set.'));
    }
    if (statement.notResources.length > 0) {
      risks.push(risk(statement, 'iam.not_resource_allow', 'Cloud IAM policy uses Allow with NotResource', 'high', 'Allow with NotResource can grant broad access to all resources except a small excluded set.'));
    }
    if (matchesAction(statement, 'iam:PassRole') && statement.resources.some(isWildcard)) {
      risks.push(risk(statement, 'iam.passrole_wildcard', 'IAM PassRole is allowed on wildcard resources', 'high', 'PassRole on broad resources can enable privilege escalation through compute or service roles.'));
    }
    if (matchesAction(statement, 'sts:AssumeRole') && statement.resources.some(isWildcard)) {
      risks.push(risk(statement, 'sts.assumerole_wildcard', 'STS AssumeRole is allowed on wildcard resources', 'high', 'AssumeRole on wildcard resources can allow lateral movement across roles or accounts.'));
    }
    if (statement.actions.some((action) => /^iam:(Attach|Put|Create|Update|Set|Add|Pass|Delete|Detach)/i.test(action))) {
      risks.push(risk(statement, 'iam.policy_mutation', 'IAM policy mutation action is allowed', 'high', 'Policy mutation actions can change identities, permissions, or access paths.'));
    }
    if (statement.actions.some((action) => /:\*$/i.test(action)) && statement.resources.some(isWildcard)) {
      risks.push(risk(statement, 'service.wildcard', 'Service-wide wildcard action on wildcard resources', 'medium', 'Service-wide wildcards expand blast radius and should be replaced with specific actions and resources.'));
    }
    if (statement.conditions.length === 0 && statement.resources.some(isWildcard) && statement.actions.length > 0) {
      risks.push(risk(statement, 'iam.no_condition_broad_resource', 'Broad IAM allow statement has no condition', 'medium', 'Broad resource access without conditions makes contextual control and least privilege review harder.'));
    }
  }
  return dedupeRisks(risks);
}

function risk(statement: IamStatement, key: string, title: string, severity: Severity, reason: string): CloudIamRiskSignal {
  return {
    key,
    title,
    severity,
    statementIndex: statement.index,
    effect: statement.effect,
    actions: statement.actions.length > 0 ? statement.actions : statement.notActions.map((action) => `NotAction:${action}`),
    resources: statement.resources.length > 0 ? statement.resources : statement.notResources.map((resource) => `NotResource:${resource}`),
    reason,
  };
}

function remediationFor(risk: CloudIamRiskSignal): string {
  if (risk.key.includes('admin') || risk.key.includes('wildcard')) {
    return 'Replace wildcard actions and resources with least-privilege action/resource pairs and add conditions where appropriate.';
  }
  if (risk.key.includes('PassRole') || risk.key.includes('passrole')) {
    return 'Restrict iam:PassRole to explicit role ARNs and approved services with iam:PassedToService conditions.';
  }
  if (risk.key.includes('AssumeRole') || risk.key.includes('assumerole')) {
    return 'Restrict sts:AssumeRole to explicit role ARNs and enforce external ID, MFA, source account, or organization conditions where applicable.';
  }
  return 'Review the IAM statement for least privilege, explicit resources, bounded actions, and appropriate conditions.';
}

function dedupeRisks(risks: CloudIamRiskSignal[]): CloudIamRiskSignal[] {
  const seen = new Set<string>();
  return risks.filter((item) => {
    const key = `${item.statementIndex}:${item.key}:${item.actions.join(',')}:${item.resources.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeStatements(policy: Record<string, unknown>): IamStatement[] {
  return arrayValue(policy.Statement ?? policy.statement ?? policy.statements).map((statement, index) => {
    const record = recordValue(statement) ?? {};
    return {
      index,
      effect: safeText(stringValue(record.Effect ?? record.effect) ?? 'Unknown', 40),
      actions: stringList(record.Action ?? record.action).map(safeIamValue),
      notActions: stringList(record.NotAction ?? record.notAction).map(safeIamValue),
      resources: stringList(record.Resource ?? record.resource).map(safeIamValue),
      notResources: stringList(record.NotResource ?? record.notResource).map(safeIamValue),
      conditions: Object.keys(recordValue(record.Condition ?? record.condition) ?? {}).map((item) => safeText(item, 160)),
    };
  });
}

function unwrapPolicy(input: Record<string, unknown>): Record<string, unknown> {
  const candidates = [input.PolicyDocument, input.policyDocument, input.document, input.policy, input];
  for (const candidate of candidates) {
    const record = recordValue(candidate);
    if (record && (record.Statement || record.statement || record.statements)) {
      return record;
    }
  }
  return input;
}

function serialize(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function parseJson(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Cloud IAM policy root must be an object');
  }
  return parsed as Record<string, unknown>;
}

function matchesAction(statement: IamStatement, expected: string): boolean {
  const expectedLower = expected.toLowerCase();
  return statement.actions.some((action) => action.toLowerCase() === expectedLower || wildcardMatches(action, expected));
}

function wildcardMatches(pattern: string, value: string): boolean {
  const expression = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
  return new RegExp(expression, 'i').test(value);
}

function isWildcard(value: string): boolean {
  return value === '*' || value.endsWith(':*') || value.includes('*');
}

function safeIamValue(value: string): string {
  return safeText(value, 300);
}

function safeText(value: string | undefined, maxLength: number): string {
  return redactText(value ?? '').slice(0, maxLength);
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value !== undefined) return [value];
  return [];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
