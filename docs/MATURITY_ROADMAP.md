# AgentRed Maturity Roadmap

AgentRed should mature by copying durable product and engineering patterns from established security and agent platforms, not by exposing more raw tools to Agent Workers. Every imported idea must become a first-party API, UI panel, policy gate, parser, evidence contract, or report lifecycle record.

This roadmap is deliberately scoped to authorized security work. It does not add bypass playbooks, direct exploit authority, or uncontrolled scanner access.

## Reference Stack

| Capability | Mature references | What to copy | What to avoid |
| --- | --- | --- | --- |
| Browser, proxy, and DAST workflow | OWASP ZAP, Burp Suite, Playwright | Proxy sessions, browser contexts, authenticated flows, HAR/trace capture, scan progress, alert models | Hidden active scanning, implicit TLS interception, or out-of-scope traffic capture |
| Scanner and rule ecosystem | ProjectDiscovery Nuclei, Semgrep, Prowler, MobSF | Template metadata, typed result parsers, fixture-driven adapters, CI-friendly output, domain imports | Letting raw scanner output become findings without evidence and review |
| Vulnerability lifecycle | OWASP DefectDojo, Faraday, Dradis | Product/engagement/test/finding records, deduplication, retest state, SLA, report templates | Treating every tool observation as a customer-facing vulnerability |
| Agent runtime and eval | LangGraph, OpenAI Agents SDK, Microsoft PyRIT | Durable runs, tool-call guardrails, traces, scorers, scenario datasets, human gates | Letting an Agent runtime bypass Tool Gateway, approval, or evidence gates |
| Data model and collaboration | DefectDojo, Dependency-Track, Faraday | Relational storage, migrations, RBAC, project/team boundaries, SBOM/component risk views | Cloud sync of raw local evidence or secrets |

For a deeper project-by-project comparison of high-star AI red-team agents, LLM red-team frameworks, MCP tool ecosystems, and mature AgentOps patterns, see [AI Red Team Agent Reference Analysis](AI_RED_TEAM_AGENT_REFERENCE_ANALYSIS.md). For the enterprise penetration-testing skill workflow, high-risk vulnerability taxonomy, and the Z3r0-inspired control-plane target, see [Enterprise Pentest Agent Workflows](ENTERPRISE_PENTEST_AGENT_WORKFLOWS.md).

## Build Order

### 1. Browser And Proxy Runner

Goal: turn the current `local_fetch_controller`, HAR import, browser snapshots, and explicit HTTP proxy capture into a real local runner workflow.

Concrete work:

- Add a Playwright-backed browser controller behind the existing browser session API.
- Persist browser contexts as run-local session metadata, not raw cookies in graph state.
- Add trace/screenshot/video evidence with `raw_local_only` defaults.
- Keep navigation, capture, and replay behind `ScopePolicy`.
- Design TLS MITM as a separate approval-gated desktop capability with local CA lifecycle controls.

Acceptance:

- A run can open a browser context, navigate an in-scope target with JavaScript execution, capture bounded evidence, and close the session.
- Out-of-scope navigation is blocked before storage.
- Tests cover scope blocking, redaction, and raw-local-only screenshot handling.

### 2. One Mature Scanner Adapter At A Time

Goal: stop treating external tools as only roadmap metadata and promote high-value adapters through typed parsers.

Suggested order:

1. Nuclei JSONL result parser for a small allowlisted safe template set.
2. Semgrep SARIF ingestion hardening beyond the current generic SARIF import.
3. Prowler output import for cloud posture findings.
4. MobSF report import for mobile evidence and candidate findings.

Acceptance:

- Each adapter has sample fixtures, typed parser output, evidence mapping, and failure tests.
- Scanner execution remains fail-closed unless profile and allowlist gates are enabled.
- Findings remain candidate until evidence is reviewed and validation confirms impact.

### 3. Vulnerability Lifecycle Model

Goal: evolve findings and reports from a local review loop into a commercial delivery lifecycle.

Concrete work:

- Add Product, Engagement, Test, FindingInstance, Retest, and ReportTemplate records.
- Add finding deduplication keys and duplicate/merged states.
- Add retest status and reviewer notes.
- Add report templates for HackerOne, Bugcrowd, SRC, enterprise, and internal audit.
- Add import/export compatibility with DefectDojo-style workflows.

Acceptance:

- A repeated scanner observation maps to one finding with evidence instances, not duplicate report rows.
- Retest evidence can update a finding without destroying the original proof chain.
- Reports can be regenerated from templates without embedding raw local-only evidence.

### 4. Agent Runtime Eval Harness

Goal: make Agent quality measurable before increasing autonomy.

Concrete work:

- Add scenario fixtures for bootstrap, reason, explore, blocked tool, evidence review, and report-ready tasks.
- Add scorers for scope safety, tool-call validity, evidence usefulness, finding quality, and refusal behavior.
- Store eval results in the existing evaluation and scorecard surfaces.
- Add regression tests for Worker JSON repair, timeout behavior, and unsafe tool requests.

Acceptance:

- A Worker can be compared across a fixed scenario set without live targets.
- Worker selection can use eval outcomes without letting Workers self-score.
- Failed scenarios become actionable benchmark gaps in `/runs/{id}/reference-benchmark`.

### 5. Production Storage And Collaboration

Goal: prepare for desktop/cloud sync without weakening the local evidence boundary.

Concrete work:

- Split the SQLite JSON snapshot into relational tables with migrations.
- Add indexes for runs, evidence, findings, tool invocations, events, evaluations, and exports.
- Define retention policy for raw local evidence blobs.
- Add project/team/RBAC records before cloud sync.
- Add SBOM/component risk records if source and dependency review becomes a first-class domain.

Acceptance:

- Concurrent local runner writes do not overwrite unrelated state.
- Migrations are tested from at least one prior schema version.
- Cloud-safe export remains redacted and hash-verifiable.

## Roadmap Gate

Before adding any large capability, update the Reference Benchmark model and answer:

- Which mature project pattern is being copied?
- What first-party API or data contract will own it?
- What evidence, approval, and redaction gates apply?
- What fixtures prove parser and workflow behavior?
- What remains deliberately out of scope?

If those answers are unclear, keep the feature in the integration backlog instead of exposing it to Agent Workers.
