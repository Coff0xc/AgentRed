import { toolCatalog } from '../tools/toolbox-registry.js';
import { strategyHintsForWorker } from '../strategy/strategy-service.js';
import type { WorkerTask } from './types.js';

export interface WorkerProtocolEnvelope {
  protocolVersion: 'agent-worker.v1';
  role: 'agentred-worker';
  contract: {
    objective: string;
    hardRules: string[];
    toolUse: string[];
    output: string[];
  };
  task: WorkerTask;
  toolSurface: ReturnType<typeof toolCatalog>;
  domainSkills: NonNullable<WorkerTask['domainSkills']>;
  credentialReferences: NonNullable<WorkerTask['credentialReferences']>;
  pocTemplates: NonNullable<WorkerTask['pocTemplates']>;
  toolboxBundles: NonNullable<WorkerTask['toolboxBundles']>;
  connectors: NonNullable<WorkerTask['connectors']>;
  strategyHints: string[];
  strategyRecommendations: Array<Record<string, unknown>>;
  outputSchema: Record<string, unknown>;
  examples: Array<Record<string, unknown>>;
}

export function buildWorkerProtocolEnvelope(task: WorkerTask): WorkerProtocolEnvelope {
  return {
    protocolVersion: 'agent-worker.v1',
    role: 'agentred-worker',
    contract: {
      objective:
        'Explore only the authorized run graph and return one structured JSON result for the dispatcher to validate.',
      hardRules: [
        'Do not execute tools directly.',
        'Do not write facts, evidence, findings, approvals, files, or database state directly.',
        'Do not communicate with other workers.',
        'Do not request out-of-scope targets or destructive actions.',
        'Use the smallest useful number of high-signal toolRequests.',
        'Use enabled domainSkills only as narrow domain constraints; do not invent a generic pentest workflow.',
        'Use enabled pocTemplates only as evidence requirements and safety constraints; they are not generic exploit playbooks.',
        'Use enabled toolboxBundles only as capability context; bundle enablement is not permission to execute raw tools.',
        'Use enabled connectors only as governed capability metadata; connector enablement is not permission to call external MCP, CLI, HTTP API, or container adapters.',
        'Credentials are represented only as credentialReferences; never ask for or emit raw secret material.',
        'Every candidate finding must reference evidence through finding.propose.',
      ],
      toolUse: [
        'Request high-level tools only through data.toolRequests.',
        'Prefer http.request and low-risk scanner.run_template before higher-risk actions.',
        'Use credential.use_placeholder with a credentialId when authenticated context is needed; do not place secrets in args.',
        'Use access.compare_evidence to compare two same-run evidence items for role or authorization differences.',
        'Use oast.start_session only for authorized out-of-band validation; never embed OAST payloads in live targets without R3 approval.',
        'Use riskLevel R3 only when human approval is genuinely required.',
        'Use evidenceIds ["$produced"] in a later finding.propose request to reference evidence produced earlier in the same explore result.',
      ],
      output: [
        'Return JSON only.',
        'For bootstrap, return data.fact.description or data.complete.description.',
        'For reason, return data.intent or data.complete.',
        'For explore, return data.description and optional data.toolRequests.',
        'On uncertainty or refusal, return {"accepted":false,"reason":"..."}',
      ],
    },
    task,
    toolSurface: toolCatalog(),
    domainSkills: task.domainSkills ?? [],
    credentialReferences: task.credentialReferences ?? [],
    pocTemplates: task.pocTemplates ?? [],
    toolboxBundles: task.toolboxBundles ?? [],
    connectors: task.connectors ?? [],
    strategyHints: [
      ...strategyHintsForWorker(),
      ...domainSkillHints(task),
      ...pocTemplateHints(task),
      ...toolboxBundleHints(task),
      ...connectorHints(task),
    ],
    strategyRecommendations: workerStrategyRecommendations(task),
    outputSchema: workerOutputSchema(),
    examples: workerExamples(),
  };
}

function toolboxBundleHints(task: WorkerTask): string[] {
  return (task.toolboxBundles ?? []).map(
    (bundle) =>
      `[${bundle.id}] Toolbox Bundle enabled with templates ${bundle.templateIds.join(', ')}. Prefer these governed templates when useful; never assume profile readiness or bypass Tool Gateway policy.`,
  );
}

function connectorHints(task: WorkerTask): string[] {
  return (task.connectors ?? []).map(
    (connector) =>
      `[${connector.id}] Connector enabled for ${connector.kind} metadata (${connector.toolNames.join(', ')}). Mapped templates: ${connector.templateIds.join(', ') || 'none'}; mapped packs: ${connector.toolPackIds.join(', ') || 'none'}; unmapped tools: ${connector.unmappedToolNames.join(', ') || 'none'}. Request governed Tool Gateway tools only; do not invoke external connector tools directly.`,
  );
}

function domainSkillHints(task: WorkerTask): string[] {
  return (task.domainSkills ?? []).flatMap((skill) => skill.workerHints.map((hint) => `[${skill.id}] ${hint}`));
}

function pocTemplateHints(task: WorkerTask): string[] {
  return (task.pocTemplates ?? []).flatMap((template) =>
    template.workerHints.map((hint) => `[${template.id}] ${hint}`),
  );
}

function workerStrategyRecommendations(task: WorkerTask): Array<Record<string, unknown>> {
  if (task.type !== 'explore') {
    return [];
  }
  const target = task.graph.run.target;
  const evidence = task.graph.evidence.filter((item) => item.kind !== 'replay_bundle');
  if (evidence.length === 0) {
    return [
      {
        title: 'Capture baseline and map visible surface',
        toolRequests: [
          { tool: 'http.request', target, method: 'GET', riskLevel: 'R1', args: { timeoutMs: 10_000 } },
          {
            tool: 'scanner.run_template',
            target,
            method: 'GET',
            riskLevel: 'R1',
            args: { template: 'web.technology_fingerprint', timeoutMs: 10_000 },
          },
          {
            tool: 'scanner.run_template',
            target,
            method: 'GET',
            riskLevel: 'R1',
            args: { template: 'web.link_form_map', timeoutMs: 10_000 },
          },
        ],
      },
    ];
  }
  return [
    {
      title: 'Turn existing evidence into candidate finding when impact is real',
      toolRequests: [
        {
          tool: 'finding.propose',
          target,
          method: 'POST',
          riskLevel: 'R0',
          args: {
            title: 'Evidence-backed candidate finding',
            severity: 'info',
            confidence: 'needs_dynamic_confirmation',
            affectedAssets: [target],
            evidenceIds: evidence.slice(-3).map((item) => item.id),
            reproSteps: ['Review and replay the referenced evidence.'],
            impact: 'Impact requires operator review before confirmation.',
            remediation: 'Document remediation after validation.',
          },
        },
      ],
    },
  ];
}

function workerOutputSchema(): Record<string, unknown> {
  return {
    accepted: 'boolean',
    reason: 'string when accepted=false',
    data: {
      fact: { description: 'string optional for bootstrap' },
      complete: { description: 'string optional', from: 'string[] optional' },
      intent: {
        description: 'string optional for reason',
        from: 'string[]',
        riskLevel: 'R0|R1|R2|R3|R4 optional',
      },
      description: 'string optional for explore conclusion',
      toolRequests: [
        {
          tool: 'http.request|scanner.run_template|credential.use_placeholder|access.compare_evidence|oast.start_session|oast.record_callback|finding.propose|...',
          target: 'in-scope target URL or asset',
          method: 'HTTP method, default GET',
          riskLevel: 'R0|R1|R2|R3|R4 optional; defaults to active intent risk',
          args: 'tool-specific JSON object',
          purpose: 'short operator-readable reason optional',
        },
      ],
    },
  };
}

function workerExamples(): Array<Record<string, unknown>> {
  return [
    {
      accepted: true,
      data: {
        intent: {
          from: ['fact_origin'],
          description: 'Fingerprint the login surface with bounded passive HTTP checks',
          riskLevel: 'R1',
        },
      },
    },
    {
      accepted: true,
      data: {
        description: 'Captured the profile endpoint response and proposed a candidate finding for review.',
        toolRequests: [
          {
            tool: 'http.request',
            target: 'https://app.example.com/profile',
            method: 'GET',
            riskLevel: 'R1',
            args: {},
            purpose: 'Capture a redacted baseline response as evidence.',
          },
          {
            tool: 'finding.propose',
            target: 'https://app.example.com/profile',
            method: 'POST',
            riskLevel: 'R0',
            args: {
              title: 'Profile metadata exposure',
              severity: 'medium',
              confidence: 'likely',
              affectedAssets: ['https://app.example.com/profile'],
              evidenceIds: ['$produced'],
              reproSteps: ['Replay the referenced HTTP exchange.'],
              impact: 'Profile metadata can be reviewed from captured evidence.',
              remediation: 'Limit profile metadata by role and reduce exposed fields.',
            },
            purpose: 'Create an evidence-backed candidate finding for human review.',
          },
        ],
      },
    },
  ];
}
