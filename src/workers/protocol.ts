import { toolCatalog } from '../tools/toolbox-registry.js';
import { strategyHintsForWorker } from '../strategy/strategy-service.js';
import type { WorkerTask } from './types.js';
import { redactRun } from '../security/redaction.js';

export interface SessionSummary {
  /** Non-system facts confirmed so far (max 10, oldest first). */
  confirmedFacts: string[];
  /** Concluded intent hypotheses with their outcome descriptions (max 8). */
  concludedIntents: Array<{ hypothesis: string; conclusion: string }>;
  /** Titles of findings already proposed in this run (max 8). */
  proposedFindingTitles: string[];
  /** Hypotheses that were released/failed and should not be re-attempted (max 6). */
  failedHypotheses: string[];
  /** Evidence kinds and counts — tells the worker what has already been collected. */
  evidenceKindCounts: Record<string, number>;
}

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
  /** Cross-round session summary derived from the run graph. Helps the worker avoid
   *  repeating already-explored paths and build on confirmed facts across dispatches. */
  sessionSummary: SessionSummary;
  outputSchema: Record<string, unknown>;
  examples: Array<Record<string, unknown>>;
}

export function buildSessionSummary(task: WorkerTask): SessionSummary {
  const { graph } = task;

  const confirmedFacts = graph.facts
    .filter((f) => !f.createdBy.startsWith('system.'))
    .slice(-10)
    .map((f) => f.statement);

  // Conclusion statement lives in the Fact created by concludeIntent (fromIntentId link)
  const factByIntentId = new Map(
    graph.facts.filter((f) => f.fromIntentId).map((f) => [f.fromIntentId as string, f.statement]),
  );
  const concludedIntents = graph.intents
    .filter((i) => i.status === 'concluded')
    .slice(-8)
    .map((i) => ({
      hypothesis: i.hypothesis,
      conclusion: factByIntentId.get(i.id) ?? i.hypothesis,
    }));

  const failedHypotheses = graph.intents
    .filter((i) => i.status === 'released' && i.releaseReason)
    .slice(-6)
    .map((i) => i.releaseReason as string);

  const proposedFindingTitles = graph.findings
    .filter((f) => f.validationState !== 'rejected')
    .slice(-8)
    .map((f) => f.title);

  const evidenceKindCounts: Record<string, number> = {};
  for (const e of graph.evidence) {
    if (e.kind === 'replay_bundle') continue;
    evidenceKindCounts[e.kind] = (evidenceKindCounts[e.kind] ?? 0) + 1;
  }

  return { confirmedFacts, concludedIntents, failedHypotheses, proposedFindingTitles, evidenceKindCounts };
}

export function buildWorkerProtocolEnvelope(task: WorkerTask): WorkerProtocolEnvelope {
  const safeTask = redactWorkerTask(task);
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
        'Use sessionSummary to avoid repeating concluded intents, already-proposed findings, and failed hypotheses.',
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
        'For explore, set data.continueExplore=true to request another round after toolRequests execute; the next task will include producedEvidenceIds with all evidence collected so far.',
        'On uncertainty or refusal, return {"accepted":false,"reason":"..."}',
      ],
    },
    task: safeTask,
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
    strategyRecommendations: workerStrategyRecommendations(safeTask),
    sessionSummary: buildSessionSummary(task),
    outputSchema: workerOutputSchema(),
    examples: workerExamples(),
  };
}

function redactWorkerTask(task: WorkerTask): WorkerTask {
  const graph = { ...task.graph, run: redactRun(task.graph.run) };
  if (task.type === 'explore') {
    return { ...task, graph };
  }
  return { ...task, graph };
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
  const credential = task.credentialReferences?.find((item) => item.status === 'active');
  if (credential && evidence.length >= 2) {
    const [baseline, comparison] = evidence.slice(-2);
    return [
      {
        title: 'Compare existing anonymous and credentialed evidence before proposing auth impact',
        toolRequests: [
          {
            tool: 'access.compare_evidence',
            target,
            method: 'POST',
            riskLevel: 'R2',
            args: {
              baselineEvidenceId: baseline.id,
              comparisonEvidenceId: comparison.id,
              comparisonCredentialId: credential.id,
              title: 'Anonymous versus credentialed access differential',
            },
          },
        ],
      },
    ];
  }
  if (credential) {
    return [
      {
        title: 'Prepare anonymous and credentialed access evidence before auth-impact comparison',
        toolRequests: [
          { tool: 'http.request', target, method: 'GET', riskLevel: 'R1', args: { timeoutMs: 10_000 } },
          {
            tool: 'credential.use_placeholder',
            target,
            method: 'GET',
            riskLevel: 'R1',
            args: { credentialId: credential.id, usedFor: 'authenticated comparison probe' },
          },
        ],
        operatorSteps: [
          'Capture the credentialed HTTP/browser/proxy evidence using the referenced credential outside the Worker prompt.',
          'Run access.compare_evidence only after both anonymous and credentialed response evidence ids exist.',
        ],
        followUpTool: 'access.compare_evidence',
      },
    ];
  }
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
          {
            tool: 'scanner.run_template',
            target,
            method: 'GET',
            riskLevel: 'R2',
            args: { template: 'web.param_probe', timeoutMs: 10_000 },
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
      continueExplore: 'boolean optional; set true to request another explore round after toolRequests execute',
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
    {
      _comment: 'Multi-round explore: round 1 captures baseline, round 2 uses producedEvidenceIds to decide next step',
      round1: {
        accepted: true,
        data: {
          description: 'Captured baseline; continuing to probe parameter reflection.',
          continueExplore: true,
          toolRequests: [
            { tool: 'http.request', target: 'https://app.example.com/search', method: 'GET', riskLevel: 'R1', args: {} },
          ],
        },
      },
      round2_task_includes: { producedEvidenceIds: ['<evidence-id-from-round-1>'] },
      round2: {
        accepted: true,
        data: {
          description: 'Baseline confirmed reflection. Proposed finding backed by both evidence items.',
          toolRequests: [
            {
              tool: 'finding.propose',
              target: 'https://app.example.com/search',
              method: 'POST',
              riskLevel: 'R0',
              args: {
                title: 'Reflected parameter in search endpoint',
                severity: 'medium',
                confidence: 'likely',
                affectedAssets: ['https://app.example.com/search'],
                evidenceIds: ['$produced'],
                reproSteps: ['Replay the captured HTTP exchanges.'],
                impact: 'Parameter value is reflected in the response.',
                remediation: 'Encode output and validate input server-side.',
              },
            },
          ],
        },
      },
    },
  ];
}
