import type { PocTemplate } from '../domain/types.js';

export const POC_TEMPLATES: PocTemplate[] = [
  {
    id: 'auth.role-diff.idor',
    name: 'Role Differential IDOR Review',
    category: 'auth',
    status: 'ready',
    description: 'Compare same-endpoint evidence across roles before proposing authorization or IDOR findings.',
    vulnerabilityClasses: ['CWE-639', 'CWE-862', 'IDOR', 'Broken Access Control'],
    requiredEvidence: ['http_exchange', 'command_output'],
    recommendedTools: ['credential.use_placeholder', 'browser.navigate', 'access.compare_evidence', 'finding.propose'],
    workerHints: [
      'Use two role-specific evidence items and access.compare_evidence before proposing authorization impact.',
      'Do not claim IDOR solely from different response bodies; explain the unauthorized object or action.',
    ],
    safetyNotes: ['No destructive state changes', 'Cross-role tests that mutate state are R3'],
    references: ['OWASP Broken Access Control', 'Bug bounty IDOR report workflow'],
    tags: ['authz', 'idor', 'role-diff'],
  },
  {
    id: 'oast.ssrffallback',
    name: 'Out-of-Band SSRF Callback Review',
    category: 'oast',
    status: 'ready',
    description: 'Use a local OAST callback as evidence for approved blind SSRF or webhook validation.',
    vulnerabilityClasses: ['CWE-918', 'SSRF', 'Blind callback'],
    requiredEvidence: ['oast_callback', 'http_exchange'],
    recommendedTools: ['oast.start_session', 'oast.record_callback', 'finding.propose'],
    workerHints: [
      'Start OAST inbox first and wait for callback evidence; do not embed OAST payloads in live targets without R3 approval.',
      'A callback proves interaction, not impact; link it with the initiating request evidence.',
    ],
    safetyNotes: ['Live payload injection is R3', 'No data exfiltration payloads'],
    references: ['OAST validation pattern', 'SSRF evidence workflow'],
    tags: ['ssrf', 'oast', 'blind'],
  },
  {
    id: 'web.missing-security-headers',
    name: 'Security Header Evidence Template',
    category: 'web',
    status: 'ready',
    description: 'Turn bounded security-header scan evidence into a low-risk web hardening finding when impact is appropriate.',
    vulnerabilityClasses: ['CWE-693', 'Security Misconfiguration'],
    requiredEvidence: ['command_output', 'http_exchange'],
    recommendedTools: ['scanner.run_template:web.security_headers', 'finding.propose'],
    workerHints: [
      'Use web.security_headers evidence; avoid over-stating severity without exploitability context.',
      'Prefer remediation guidance with exact missing headers from evidence.',
    ],
    safetyNotes: ['Passive HTTP only'],
    references: ['Mozilla Observatory style checks'],
    tags: ['headers', 'hardening', 'web'],
  },
  {
    id: 'web.cookie-flags',
    name: 'Cookie Flag Review Template',
    category: 'web',
    status: 'ready',
    description: 'Review Set-Cookie metadata for Secure, HttpOnly, and SameSite gaps without storing cookie values.',
    vulnerabilityClasses: ['CWE-614', 'CWE-1004', 'Session Hardening'],
    requiredEvidence: ['command_output', 'http_exchange'],
    recommendedTools: ['scanner.run_template:web.cookie_flags', 'finding.propose'],
    workerHints: [
      'Use cookie_flags output and cite cookie names only; never request or store cookie values.',
      'Severity depends on session sensitivity and transport context.',
    ],
    safetyNotes: ['Cookie values are redacted', 'Passive response review only'],
    references: ['OWASP Session Management Cheat Sheet'],
    tags: ['cookies', 'session', 'web'],
  },
  {
    id: 'sast.semgrep-to-finding',
    name: 'SAST Evidence To Finding',
    category: 'sast',
    status: 'ready',
    description: 'Convert local SAST evidence into a finding only after route, sink, and impact evidence are linked.',
    vulnerabilityClasses: ['SAST triage', 'Code evidence'],
    requiredEvidence: ['command_output', 'file_hash'],
    recommendedTools: ['scanner.run_template:sast.semgrep.baseline', 'finding.propose'],
    workerHints: [
      'Treat static alerts as hypotheses; do not report until affected code and impact evidence are linked.',
      'Keep source snippets bounded and redacted.',
    ],
    safetyNotes: ['No source upload by default', 'No automatic code changes'],
    references: ['AutoRedTeam-Orchestrator SARIF surface'],
    tags: ['sast', 'semgrep', 'sarif'],
  },
  {
    id: 'mobile.android-manifest-review',
    name: 'Android Manifest Evidence Template',
    category: 'mobile',
    status: 'external_required',
    description: 'Review APK manifest evidence for exported components, permissions, and debuggable flags.',
    vulnerabilityClasses: ['Mobile misconfiguration', 'Android exported component'],
    requiredEvidence: ['command_output'],
    recommendedTools: ['android.manifest.import', 'scanner.run_template:mobile.apk.manifest', 'finding.propose'],
    workerHints: [
      'Use android.manifest.import first when AndroidManifest.xml content is available.',
      'Use this only with APK evidence or approved mobile artifacts.',
      'Dynamic exploitation or device interaction remains R3.',
    ],
    safetyNotes: ['Static review first', 'No device persistence'],
    references: ['DragonJAR Android-Pentesting-Skill'],
    tags: ['android', 'apk', 'manifest'],
  },
  {
    id: 'cloud.iam-policy-review',
    name: 'Cloud IAM Policy Review Template',
    category: 'cloud',
    status: 'ready',
    description: 'Review imported cloud IAM policy evidence for wildcard admin, PassRole, AssumeRole, and mutation-risk statements.',
    vulnerabilityClasses: ['Cloud IAM misconfiguration', 'Least privilege gap', 'Privilege escalation path'],
    requiredEvidence: ['command_output'],
    recommendedTools: ['cloud.iam.import', 'finding.propose'],
    workerHints: [
      'Use cloud.iam.import evidence before proposing cloud IAM findings.',
      'Do not ask for raw cloud credentials; IAM policy JSON and vault references are the supported inputs.',
      'Treat policy-risk findings as candidates until business context and affected principal/resource scope are reviewed.',
    ],
    safetyNotes: ['Read-only artifact review', 'No cloud API calls or key material required'],
    references: ['AWS IAM least privilege review', 'Enterprise cloud audit workflow'],
    tags: ['cloud', 'iam', 'policy'],
  },
  {
    id: 'identity.graph-path-review',
    name: 'Identity Graph Path Review Template',
    category: 'auth',
    status: 'ready',
    description: 'Review imported identity graph evidence for high-value privilege edges and roastable/delegation-risk identities.',
    vulnerabilityClasses: ['Active Directory privilege path', 'Identity misconfiguration', 'Least privilege gap'],
    requiredEvidence: ['command_output'],
    recommendedTools: ['identity.graph.import', 'finding.propose'],
    workerHints: [
      'Use identity.graph.import evidence before proposing identity-path findings.',
      'Do not request password spraying, credential extraction, or lateral movement execution.',
      'Treat graph signals as candidates until an operator validates context and affected business scope.',
    ],
    safetyNotes: ['Read-only graph import', 'No active lateral movement', 'No credential attacks'],
    references: ['BloodHound-style identity path review', 'Enterprise internal assessment module'],
    tags: ['identity', 'ad', 'bloodhound'],
  },
];

export function listPocTemplates(): PocTemplate[] {
  return POC_TEMPLATES.map(cloneTemplate);
}

export function getPocTemplate(templateId: string): PocTemplate | undefined {
  const template = POC_TEMPLATES.find((item) => item.id === templateId);
  return template ? cloneTemplate(template) : undefined;
}

function cloneTemplate(template: PocTemplate): PocTemplate {
  return {
    ...template,
    vulnerabilityClasses: [...template.vulnerabilityClasses],
    requiredEvidence: [...template.requiredEvidence],
    recommendedTools: [...template.recommendedTools],
    workerHints: [...template.workerHints],
    safetyNotes: [...template.safetyNotes],
    references: [...template.references],
    tags: [...template.tags],
  };
}
