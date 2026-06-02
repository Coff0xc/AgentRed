import { createHash } from 'node:crypto';

import { newId, nowIso } from '../domain/ids.js';
import type { AndroidManifestComponent, AndroidManifestImport, Severity } from '../domain/types.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { FindingService } from '../findings/finding-service.js';
import { redactText } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

export interface AndroidManifestImportInput {
  runId: string;
  source?: string;
  content: string;
  createFindings: boolean;
}

interface ManifestRisk {
  key: string;
  title: string;
  severity: Severity;
  impact: string;
  remediation: string;
  reproStep: string;
}

interface ParsedManifest {
  packageName?: string;
  minSdk?: string;
  targetSdk?: string;
  application: {
    debuggable?: boolean;
    allowBackup?: boolean;
    cleartextTraffic?: boolean;
  };
  permissions: string[];
  riskyPermissions: string[];
  components: AndroidManifestComponent[];
  exportedComponents: AndroidManifestComponent[];
  risks: ManifestRisk[];
}

const RISKY_PERMISSIONS = new Map<string, Severity>([
  ['android.permission.READ_SMS', 'high'],
  ['android.permission.RECEIVE_SMS', 'high'],
  ['android.permission.SEND_SMS', 'high'],
  ['android.permission.READ_CONTACTS', 'medium'],
  ['android.permission.WRITE_CONTACTS', 'medium'],
  ['android.permission.READ_CALL_LOG', 'medium'],
  ['android.permission.WRITE_CALL_LOG', 'medium'],
  ['android.permission.RECORD_AUDIO', 'medium'],
  ['android.permission.CAMERA', 'medium'],
  ['android.permission.ACCESS_FINE_LOCATION', 'medium'],
  ['android.permission.ACCESS_COARSE_LOCATION', 'low'],
  ['android.permission.READ_EXTERNAL_STORAGE', 'low'],
  ['android.permission.WRITE_EXTERNAL_STORAGE', 'low'],
  ['android.permission.MANAGE_EXTERNAL_STORAGE', 'medium'],
  ['android.permission.REQUEST_INSTALL_PACKAGES', 'medium'],
  ['android.permission.SYSTEM_ALERT_WINDOW', 'medium'],
]);

export class AndroidManifestImportService {
  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly findings: FindingService,
    private readonly events?: RunEventService,
  ) {}

  list(runId: string): AndroidManifestImport[] {
    this.assertRun(runId);
    return Object.values(this.store.state.androidManifestImports)
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  import(input: AndroidManifestImportInput): {
    importRecord: AndroidManifestImport;
    evidenceId: string;
    findingIds: string[];
  } {
    const run = this.assertRun(input.runId);
    const source = safeText(input.source || 'AndroidManifest.xml', 200);
    const content = normalizeXml(input.content);
    const inputSha256 = createHash('sha256').update(content).digest('hex');
    const parsed = parseManifest(content);
    const evidence = this.evidence.addEvidence({
      runId: input.runId,
      kind: 'command_output',
      content: JSON.stringify({
        tool: 'android.manifest.import',
        source,
        inputSha256,
        packageName: parsed.packageName,
        sdk: {
          minSdk: parsed.minSdk,
          targetSdk: parsed.targetSdk,
        },
        application: parsed.application,
        permissions: parsed.permissions,
        riskyPermissions: parsed.riskyPermissions,
        exportedComponents: parsed.exportedComponents,
        componentCount: parsed.components.length,
        riskCount: parsed.risks.length,
        risks: parsed.risks.slice(0, 50),
        importedAt: nowIso(),
      }),
      redactionState: 'redacted',
    });
    const findingIds = input.createFindings
      ? parsed.risks.slice(0, 25).map((risk) =>
          this.findings.proposeFinding({
            runId: input.runId,
            title: risk.title,
            severity: risk.severity,
            confidence: 'needs_dynamic_confirmation',
            affectedAssets: [parsed.packageName || source || run.target],
            evidenceIds: [evidence.id],
            reproSteps: [risk.reproStep],
            impact: risk.impact,
            remediation: risk.remediation,
          }).id,
        )
      : [];
    const importRecord: AndroidManifestImport = {
      id: newId('android_manifest'),
      runId: input.runId,
      source,
      status: 'imported',
      evidenceId: evidence.id,
      inputSha256,
      packageName: parsed.packageName,
      minSdk: parsed.minSdk,
      targetSdk: parsed.targetSdk,
      permissions: parsed.permissions,
      riskyPermissions: parsed.riskyPermissions,
      exportedComponents: parsed.exportedComponents,
      riskCount: parsed.risks.length,
      importedFindings: findingIds.length,
      findingIds,
      createdAt: nowIso(),
    };
    this.store.state.androidManifestImports[importRecord.id] = importRecord;
    this.events?.record({
      runId: input.runId,
      type: 'android.manifest.imported',
      title: 'Android Manifest imported',
      detail: `${parsed.risks.length} risk signal(s), ${findingIds.length} candidate finding(s)`,
      entityId: importRecord.id,
      level: parsed.risks.length > 0 ? 'warning' : 'info',
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

function parseManifest(xml: string): ParsedManifest {
  const manifestAttrs = attrsFromFirstTag(xml, 'manifest');
  const applicationAttrs = attrsFromFirstTag(xml, 'application');
  const permissions = unique(
    Array.from(xml.matchAll(/<uses-permission\b([^>]*)>/gi))
      .map((match) => parseAttrs(match[1] ?? '').name)
      .filter((name): name is string => Boolean(name)),
  );
  const components = Array.from(xml.matchAll(/<(activity|activity-alias|service|receiver|provider)\b([^>]*)>/gi))
    .map((match): AndroidManifestComponent => {
      const attrs = parseAttrs(match[2] ?? '');
      return {
        type: match[1] as AndroidManifestComponent['type'],
        name: attrs.name || 'unnamed-component',
        exported: booleanAttr(attrs.exported),
        permission: attrs.permission,
        grantUriPermissions: booleanAttr(attrs.grantUriPermissions),
      };
    });
  const riskyPermissions = permissions.filter((permission) => RISKY_PERMISSIONS.has(permission));
  const exportedComponents = components.filter((component) => component.exported === true);
  const parsed: ParsedManifest = {
    packageName: manifestAttrs.package,
    minSdk: sdkAttr(xml, 'minSdkVersion'),
    targetSdk: sdkAttr(xml, 'targetSdkVersion'),
    application: {
      debuggable: booleanAttr(applicationAttrs.debuggable),
      allowBackup: booleanAttr(applicationAttrs.allowBackup),
      cleartextTraffic: booleanAttr(applicationAttrs.usesCleartextTraffic),
    },
    permissions,
    riskyPermissions,
    components,
    exportedComponents,
    risks: [],
  };
  parsed.risks = manifestRisks(parsed);
  return parsed;
}

function manifestRisks(parsed: ParsedManifest): ManifestRisk[] {
  const risks: ManifestRisk[] = [];
  if (parsed.application.debuggable === true) {
    risks.push({
      key: 'application.debuggable',
      title: 'Android app is debuggable',
      severity: 'high',
      impact: 'A debuggable production build can expose runtime internals and make local tampering or data extraction easier on test devices.',
      remediation: 'Set android:debuggable="false" for release builds and verify build variants before distribution.',
      reproStep: 'Review the imported AndroidManifest evidence for application android:debuggable="true".',
    });
  }
  if (parsed.application.cleartextTraffic === true) {
    risks.push({
      key: 'application.cleartext',
      title: 'Android app allows cleartext traffic',
      severity: 'medium',
      impact: 'Cleartext network traffic can expose sensitive data on untrusted networks when endpoints or libraries use HTTP.',
      remediation: 'Disable cleartext traffic by default and use a Network Security Config only for explicitly approved development endpoints.',
      reproStep: 'Review the imported AndroidManifest evidence for android:usesCleartextTraffic="true".',
    });
  }
  if (parsed.application.allowBackup === true) {
    risks.push({
      key: 'application.backup',
      title: 'Android app allows backup',
      severity: 'medium',
      impact: 'Backup-enabled apps can expose locally stored application data through backup or device-transfer paths in some threat models.',
      remediation: 'Set android:allowBackup="false" unless product requirements explicitly require backup and sensitive data is excluded.',
      reproStep: 'Review the imported AndroidManifest evidence for android:allowBackup="true".',
    });
  }
  for (const component of parsed.exportedComponents.filter((item) => !item.permission)) {
    risks.push({
      key: `component.exported.${component.type}.${component.name}`,
      title: `Exported Android ${component.type} without permission`,
      severity: component.type === 'provider' ? 'high' : 'medium',
      impact: `Exported component ${component.name} is reachable by other apps and does not declare a guarding permission in the manifest evidence.`,
      remediation: 'Set android:exported="false" when external access is not required, or protect the component with an app-defined signature permission.',
      reproStep: `Review component ${component.name} in the imported AndroidManifest evidence.`,
    });
  }
  for (const permission of parsed.riskyPermissions) {
    risks.push({
      key: `permission.${permission}`,
      title: `Risk-sensitive Android permission declared: ${permission}`,
      severity: RISKY_PERMISSIONS.get(permission) ?? 'low',
      impact: `The app requests ${permission}. This may be legitimate, but it expands the privacy or abuse surface and should be justified by product behavior.`,
      remediation: 'Remove unused permissions, gate sensitive permission flows with user-visible purpose, and verify runtime permission handling.',
      reproStep: `Review uses-permission ${permission} in the imported AndroidManifest evidence.`,
    });
  }
  return risks;
}

function attrsFromFirstTag(xml: string, tag: string): Record<string, string> {
  const match = new RegExp(`<${tag}\\b([^>]*)>`, 'i').exec(xml);
  return match ? parseAttrs(match[1] ?? '') : {};
}

function parseAttrs(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of input.matchAll(/([A-Za-z_:.-][\w:.-]*)\s*=\s*(['"])(.*?)\2/g)) {
    const key = (match[1] ?? '').replace(/^android:/, '');
    const value = match[3] ?? '';
    if (key) attrs[key] = safeText(value, 500);
  }
  return attrs;
}

function sdkAttr(xml: string, name: 'minSdkVersion' | 'targetSdkVersion'): string | undefined {
  const usesSdk = attrsFromFirstTag(xml, 'uses-sdk');
  return usesSdk[name];
}

function booleanAttr(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function normalizeXml(input: string): string {
  return input.replace(/\u0000/g, '').slice(0, 1_000_000);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function safeText(value: string, maxLength: number): string {
  return redactText(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
