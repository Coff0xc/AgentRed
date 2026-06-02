import type { DomainSkill } from '../domain/types.js';

export const DOMAIN_SKILLS: DomainSkill[] = [
  {
    id: 'web.bounty-workspace',
    name: 'Web Bug Bounty Workspace',
    category: 'web',
    status: 'ready',
    description: 'Evidence-first web application assessment for authorized bounty or SRC scope.',
    rigidUseCases: ['HTTP evidence capture', 'safe scanner templates', 'finding proposal and report formatting'],
    excludedUseCases: ['generic pentest playbooks', 'credential attacks', 'destructive exploitation'],
    recommendedTools: ['http.request', 'scanner.run_template', 'finding.propose', 'evidence.add'],
    requiredToolboxProfiles: ['builtin.web'],
    workerHints: [
      'Stay inside the authorized web scope and collect durable HTTP evidence before any finding proposal.',
      'Prefer browser/proxy captures and built-in safe templates before requesting higher-risk validation.',
    ],
    riskNotes: ['R3 validation still requires approval; R4 remains blocked.'],
    references: ['Cairn graph discipline', 'WonderSuite browser/proxy UX', 'Bug bounty report workflow'],
  },
  {
    id: 'mobile.android-apk',
    name: 'Android APK Assessment',
    category: 'mobile',
    status: 'ready',
    description: 'Android package triage and dynamic probe planning for authorized mobile targets.',
    rigidUseCases: ['APK manifest review', 'static package triage', 'Frida probe planning'],
    excludedUseCases: ['device persistence', 'credential extraction', 'unapproved live device actions'],
    recommendedTools: ['android.manifest.import', 'scanner.run_template:mobile.apk.manifest', 'scanner.run_template:mobile.frida.probe'],
    requiredToolboxProfiles: [],
    workerHints: [
      'Start with android.manifest.import for static package, permission, and exported component evidence.',
      'Treat APK paths, package IDs, and device probes as separate evidence-bearing steps.',
      'Use Android-specific templates only when the target is an APK, package, emulator, or approved test device.',
    ],
    riskNotes: ['Dynamic device actions are R3 unless explicitly downgraded by policy.'],
    references: ['DragonJAR Android-Pentesting-Skill'],
  },
  {
    id: 'sast.semgrep-baseline',
    name: 'Source SAST Baseline',
    category: 'sast',
    status: 'external_required',
    description: 'Source-code baseline triage with Semgrep-style evidence and SARIF-friendly output.',
    rigidUseCases: ['source tree triage', 'safe static rules', 'evidence-backed code finding drafts'],
    excludedUseCases: ['secret exfiltration', 'unbounded repository crawling', 'auto-fixing production code'],
    recommendedTools: ['scanner.run_template:sast.semgrep.baseline', 'shell.run_sandboxed'],
    requiredToolboxProfiles: ['local.sast'],
    workerHints: [
      'Use static findings as hypotheses until affected code, route, and impact evidence are linked.',
      'Prefer small targeted scans over broad repository sweeps.',
    ],
    riskNotes: ['Do not include raw secrets in evidence; redact before storing or reporting.'],
    references: ['AutoRedTeam-Orchestrator CI/SARIF surface', 'CAI eval-oriented framework'],
  },
  {
    id: 'cloud.iam-audit',
    name: 'Cloud IAM Audit',
    category: 'cloud',
    status: 'ready',
    description: 'Cloud account and IAM posture review for approved enterprise assessments.',
    rigidUseCases: ['IAM policy JSON review', 'read-only cloud inventory', 'policy-risk evidence'],
    excludedUseCases: ['key harvesting', 'destructive cloud actions', 'privilege escalation execution'],
    recommendedTools: ['cloud.iam.import', 'credential.use_placeholder', 'evidence.add', 'finding.propose'],
    requiredToolboxProfiles: [],
    workerHints: [
      'Use cloud.iam.import first when IAM policy JSON is available.',
      'Use vault references or placeholders only; never ask the operator to paste cloud secrets into prompts.',
      'Keep cloud actions read-only unless a future policy explicitly approves a bounded validation.',
    ],
    riskNotes: ['Credential material must remain local and must not be written into graph hints or reports.'],
    references: ['Enterprise edition private worker node requirement'],
  },
  {
    id: 'identity.ad-paths',
    name: 'AD Identity Path Review',
    category: 'identity',
    status: 'ready',
    description: 'Active Directory and identity-path review for internal authorized environments.',
    rigidUseCases: ['read-only identity graph import', 'privilege path evidence review', 'control validation notes'],
    excludedUseCases: ['lateral movement execution', 'password spraying', 'persistence'],
    recommendedTools: ['identity.graph.import', 'evidence.add', 'finding.propose'],
    requiredToolboxProfiles: [],
    workerHints: [
      'Use identity.graph.import first when BloodHound or identity graph JSON is available.',
      'Separate imported identity graph evidence from any active validation intent.',
      'Treat lateral movement, password attacks, and persistence as prohibited unless future policy changes.',
    ],
    riskNotes: ['Default posture is review-only; active AD validation is R3 or blocked.'],
    references: ['Enterprise internal assessment module'],
  },
  {
    id: 'reporting.commercial-handoff',
    name: 'Commercial Report Handoff',
    category: 'reporting',
    status: 'ready',
    description: 'Submission-ready report and export discipline for Bug Bounty, SRC, and enterprise delivery.',
    rigidUseCases: ['confirmed-only report bundle', 'safe evidence index', 'operator-reviewed submission package'],
    excludedUseCases: ['auto-submit without review', 'marketing-style report prose', 'raw local traffic upload'],
    recommendedTools: ['finding.propose', 'evidence.add'],
    requiredToolboxProfiles: [],
    workerHints: [
      'Treat report output as a delivery gate: confirmed findings must cite same-run evidence.',
      'Do not include raw_local_only evidence or credentials in customer-facing report bundles.',
      'Use platform report formats only after operator validation, not as Worker self-confirmation.',
    ],
    riskNotes: ['External submission remains operator-controlled; cloud sync accepts only redacted or safe evidence.'],
    references: ['pentest-agents submission gate', 'AIDA/CyberStrike reporting workflow', 'ai-engineering-from-scratch Ship It artifact rule'],
  },
  {
    id: 'ctf.flag-submit',
    name: 'CTF Flag Submission',
    category: 'ctf',
    status: 'planned',
    description: 'Competition-specific flag submission adapter inspired by Cairn-style minimal skills.',
    rigidUseCases: ['flag format validation', 'submission gate', 'scoreboard evidence'],
    excludedUseCases: ['general exploit methodology', 'generic CTF playbooks', 'unapproved external submission'],
    recommendedTools: ['evidence.add'],
    requiredToolboxProfiles: [],
    workerHints: [
      'Use this only when the run goal explicitly includes an approved competition flag submission target.',
      'Do not infer exploit steps from the skill; it is a submission gate, not a playbook.',
    ],
    riskNotes: ['External submissions must be operator-approved in a future adapter.'],
    references: ['Cairn flag submission skill'],
  },
];

export function listDomainSkills(): DomainSkill[] {
  return DOMAIN_SKILLS.map((skill) => cloneSkill(skill));
}

export function getDomainSkill(skillId: string): DomainSkill | undefined {
  const skill = DOMAIN_SKILLS.find((item) => item.id === skillId);
  return skill ? cloneSkill(skill) : undefined;
}

function cloneSkill(skill: DomainSkill): DomainSkill {
  return {
    ...skill,
    rigidUseCases: [...skill.rigidUseCases],
    excludedUseCases: [...skill.excludedUseCases],
    recommendedTools: [...skill.recommendedTools],
    requiredToolboxProfiles: [...skill.requiredToolboxProfiles],
    workerHints: [...skill.workerHints],
    riskNotes: [...skill.riskNotes],
    references: [...skill.references],
  };
}
