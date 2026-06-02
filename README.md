# AgentRed

AI red team workbench for scoped testing and evidence-driven reporting. / 面向范围授权测试与证据化报告的 AI 红队工作台。

This repository implements the platform kernel from the architecture plan:

- State-space graph: `Run -> Fact -> Intent -> Evidence -> Finding`
- Dispatcher-owned protocol writes
- Agent Worker abstraction for Claude Code, Codex, Gemini, Kimi, and mock workers
- Agent Worker runtime health view for worker-pool observability
- Trace, cost, and run-quality evaluation ledger for model/tool comparison
- Run Scorecard read model for Worker/tool comparison, blocked-call review, and quality recommendations
- Run Capability Radar for run-level safety, evidence, Worker, tool, domain, delivery, and observability posture
- Evidence Quality Index for replayability, redaction, review coverage, finding linkage, and commercial handoff gates
- Worker Leaderboard for cross-run Agent Worker/model comparison using traces, cost ledger, evidence contribution, and finding influence
- Worker Selection Policy Preview for explaining which Agent Worker should receive the next bootstrap/reason/explore task
- Worker Evaluation Plan for CAI/Apex-style same-task Worker bakeoffs, task-cell coverage, and evidence-quality scoring loops
- Worker Comparison cards for CAI-style Agent Worker quality, runtime, evidence, and finding contribution review
- Scope-aware Tool Gateway with R0-R4 risk gates
- Evidence-backed findings
- SQLite-backed local execution state
- Run event timeline and progress summary for desktop workflow views
- Local Operator Console served from the API for run control and timeline inspection
- English/Chinese Operator Console language switcher with local preference memory
- Simple Pentest default console mode for non-expert operators: one current step, one next action, progress checklist, AI reasoning summary, and "Needs You" queue, with the full engineering cockpit hidden behind Show Advanced
- Worker Pool presets and custom JSON in the Operator Console for mock, Codex CLI, Claude Code CLI, and mixed Agent Worker runs
- Program Scope Import for normalizing Bug Bounty/SRC/enterprise scope JSON into reusable `ScopePolicy`
- Worker Envelope Preview for inspecting the exact `agent-worker.v1` protocol context before running Claude/Codex
- Agent Framework read model for Worker adapters, extension points, invariants, and governed framework surfaces
- Agent Harness read model for ai-engineering-from-scratch-style agent loop, tool registry, sandbox, observation budget, eval, workbench handoff, evidence delivery readiness, and fixture-based eval planning
- Desktop Runner Readiness read model for Tauri shell, Rust daemon, MITM proxy, browser control, vault, toolbox, cloud sync, and remote worker productization gaps
- Reference Benchmark read model for comparing current platform capability against Cairn, Z3r0, HexStrike/AutoRedTeam, CAI/Apex, AIDA/WonderSuite, Android Skill, pentest-agents, and ai-engineering-from-scratch design lessons
- Assessment Mission Control read model for the current objective, reasoning priority, progress, blockers, operator actions, acceptance gates, and reference alignment
- Runtime Operations Workbench read model for Z3r0-style runtime event contracts, session/resume posture, interrupt gates, sandbox/local-surface binding, and operator activity feeds without copying Z3r0's role-tree agent team
- Agent Workbench read model for per-run Worker loop, strategy, search frontier, tool gates, evidence review, blockers, and next actions
- Search Plan priority queue and controlled Advance action for ranking and moving one safe Dispatcher/Intent step at a time
- Assessment Flow read model for operator-readable reasoning steps and next actions
- Attack Surface Map read model for observed assets, endpoints, technology signals, blockers, and actionable search frontier
- Controlled Autopilot Tick for one-step autonomous progress through Strategy -> Intent -> Dispatcher
- Strategy Recommendation Preview for checking Tool Gateway gates before running autonomous recommendations
- Domain Skill registry and readiness workbench for narrow expert modules such as Web bounty, Android APK, SAST, Cloud IAM, AD identity paths, commercial report handoff, and CTF flag submission
- PoC Template Library for curated evidence requirements, safety notes, and narrow vulnerability-class guidance without generic RAG or playbook stages
- Tool Catalog for governed high-level tool capabilities and scanner templates
- Tool Packs for one-click governed evidence collection across multiple high-level templates
- Scanner Template Policies for per-template risk, timeout, approval, input, execution, and evidence constraints
- Toolbox Bundle manifests for productized built-in, container, SAST, and Android tool packs without granting execution authority
- Toolbox Doctor for read-only adapter/template readiness across built-in, container, SAST, mobile, and external engines
- Local Execution Node read model for Worker runtime health, toolbox readiness, browser/proxy/OAST sessions, and fail-closed execution policy
- Local Runner Workbench for capture profiles, browser/proxy/OAST readiness, proxy setup, evidence review gates, recent capture evidence, operator next actions, and safe one-click browser/proxy session preparation
- Connector Registry for MCP, CLI, HTTP API, and container connector metadata without granting execution authority
- Ecosystem Coverage map for connector/toolbox/capability coverage, unmapped tool gaps, and governed mapping priorities
- Tool Integration Backlog for converting unmapped external tools into scanner templates, Tool Packs, rigid Domain Skills, services, or runtime-profile work
- Tool Ecosystem Workbench for commercial readiness across Tool Gateway routes, scanner templates, Tool Packs, connectors, runtime activation, backlog, and evidence-producing execution loops
- Tool Plan Preview for operator-visible scope, approval, toolbox, rate-limit, evidence, and audit decisions before execution
- Capability Matrix for operator-visible Web, network, auth, OAST, SAST, mobile, and platform capability coverage
- Runtime-probed Toolbox Profiles for built-in, container, SAST, and mobile execution backends
- Review workspace for approvals, tool audit, evidence, findings, and report bundles
- Human finding validation with candidate, confirmed, and rejected states
- Run Export bundles for hashable commercial handoff without raw local-only evidence content
- HTTP exchange capture contract for future browser/proxy adapters with scope checks and redaction
- HAR import for browser/proxy traffic, turning in-scope entries into redacted `http_exchange` evidence
- Browser Snapshot capture for rendered page screenshots and text/DOM previews, with screenshots kept `raw_local_only`
- Android Manifest import for mobile APK triage, producing normalized evidence and optional candidate findings
- Cloud IAM Policy import for read-only cloud permission review, normalized evidence, and optional candidate findings
- Identity Graph import for BloodHound-style AD path review, normalized evidence, and optional candidate findings
- Local HTTP proxy capture adapter for explicit absolute-form requests
- Proxy capture sessions for desktop/browser-controller handoff and operator control
- Browser sessions with scope-gated `browser.navigate` evidence capture for the future desktop/browser controller
- Run-local Credential References for authenticated role context without storing raw secrets
- `credential.use_placeholder` for audited placeholder use records and future vault-backed request injection
- Access Reviews for comparing two same-run evidence items across roles and generating redacted diff evidence
- Safe Evidence Replay for replaying in-scope GET/HEAD `http_exchange` evidence into fresh redacted evidence
- Local OAST Callback Inbox for out-of-band validation evidence without exposing raw callbacks to Workers
- SARIF import for local SAST/CI results, with evidence hashing and optional candidate Finding creation
- Minimal REST API for desktop, CLI, or cloud-control-plane integration

The code is intentionally not a traditional multi-agent role tree. Workers do not talk to each other, do not claim graph objects, and do not write protocol state. The dispatcher gives them a task and validates structured results.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

The dev server listens on `http://127.0.0.1:4317` by default and stores local state in `.local/platform.db`.

Environment variables:

```bash
PORT=4317
PLATFORM_DB_PATH=.local/platform.db
PLATFORM_API_TOKEN=<local bearer token>
OPENAI_API_KEY=<worker provider key, set in the local API process environment>
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
PLATFORM_ALLOW_EXTERNAL_TOOLBOX=0
PLATFORM_ALLOWED_SCANNER_TEMPLATES=
PLATFORM_ENABLE_CONTAINER_TOOLBOX=0
PLATFORM_CONTAINER_RUNTIME=docker
PLATFORM_WEB_RECON_IMAGE=ghcr.io/coff0xc/ai-pentest-toolbox:web-recon
PLATFORM_NETWORK_RECON_IMAGE=ghcr.io/coff0xc/ai-pentest-toolbox:network-recon
PLATFORM_ENABLE_LOCAL_SAST=0
PLATFORM_ENABLE_ANDROID_TOOLBOX=0
```

If `PLATFORM_API_TOKEN` is not set, the dev server generates a one-time local token and prints it at startup. `/` and `/health` are unauthenticated; all other API routes require `Authorization: Bearer <token>` or `X-Platform-Token: <token>`.

Worker provider secrets such as `OPENAI_API_KEY` must be set in the local API process environment before `npm run dev`. The API rejects secret-looking values in `workerPool[].env` so keys do not become part of run state, SQLite snapshots, run exports, or GitHub uploads.

Before publishing this repository, run the checks in [docs/PUBLISHING.md](docs/PUBLISHING.md) and verify `.local/`, logs, databases, HAR files, browser profiles, and generated output are not staged.

## Implemented Surface

Core modules:

- `src/domain`: public contracts and risk-level types.
- `src/scope`: scope policy matching plus Bug Bounty/SRC/enterprise scope import normalization for hosts, wildcard domains, IPv4 CIDR ranges, HTTP methods, R3 approvals, and R4 blocking.
- `src/graph`: local graph server for runs, facts, hints, intents, and completion.
- `src/events`: run timeline and progress summary service for desktop/CLI visibility.
- `src/observability`: trace spans, local runtime/cost ledger, run-quality evaluations, product-facing scorecards, and Worker comparison read models.
- `GET /worker-leaderboard` provides a cross-run Agent Worker leaderboard for Claude/Codex/Gemini/Kimi/mock/custom runtimes. It scores success rate, timeout/error rate, evidence contribution, finding influence, runtime, and estimated cost without reading raw prompts or letting Workers self-report quality.
- `GET /runs/{id}/worker-selection` previews the same Worker ordering policy consumed by `POST /runs/{id}/dispatch`. It ranks the run worker pool by runtime health, configured command, priority, task fit, cross-run leaderboard score, current-run evidence contribution, timeout/error history, and finding influence without executing a Worker or writing graph state.
- `GET /runs/{id}/worker-evaluation-plan` provides the CAI/Apex-style evaluation harness surface: task-cell coverage for bootstrap/reason/explore, per-Worker readiness, bakeoff experiments, evidence-quality scoring loops, and next actions. It is read-only and does not dispatch Workers.
- `GET /runs/{id}/agent-harness` provides the ai-engineering-from-scratch-style framework engineering surface: agent loop contract, tool registry/schema gates, sandbox runner, observation budget, eval harness, workbench handoff, evidence delivery cells, and embedded fixture eval plan. It is read-only and does not dispatch Workers or grant tool authority.
- `GET /runs/{id}/agent-harness/plan` exposes the standalone no-side-effect Harness Eval Plan: fixture tasks, acceptance criteria, safety gates, expected artifacts, copied ideas, and deliberately avoided patterns from rohitg00/ai-engineering-from-scratch.
- `GET /runs/{id}/capability-radar` exposes a run-level capability posture over safety, evidence, autonomous progress, Worker performance, Tool Gateway usage, rigid domain depth, delivery readiness, and observability. It produces scheduling hints for operators without creating a new dispatcher or tool path.
- `GET /runs/{id}/evidence-quality` exposes a commercial evidence-quality index over blob integrity, human review, replay/reproduction support, redaction readiness, finding linkage, and confirmed-finding delivery gates. It is read-only and never returns raw evidence content.
- `src/flow`: operator-facing assessment flow brief derived from facts, intents, evidence, findings, approvals, and reports.
- `src/mission`: Assessment Mission Control, a run-level command surface that joins progress, Search Plan, Agent Workbench, Tool Ecosystem, Local Runner, Evidence Quality, Delivery Readiness, Agent Harness, and Reference Benchmark into one read-only view of "where are we, why now, what is blocked, and what should the operator do next."
- `src/runtime`: Runtime Operations Workbench, a read-only run surface for normalized runtime events, trace spans, Worker/task activity, session/resume posture, future interrupt/cancellation design, and sandbox/operator-surface readiness. It borrows Z3r0's event-contract and sandbox visibility ideas while keeping Dispatcher intents as the only scheduling protocol.
- `src/surface`: operator-facing attack surface map derived from run graph, evidence metadata, browser/HAR captures, domain imports, connector mappings, approvals, and strategy recommendations. Frontier actions can preview Tool Gateway gates, queue Dispatcher intents, or invoke mapped high-level tools, but they do not expose raw tools or create Worker write paths.
- `src/autopilot`: one-step controlled autopilot loop that queues automatable strategy recommendations and dispatches exactly one worker cycle without bypassing approvals or the Tool Gateway.
- `src/skills`: narrow Domain Skill registry and run-level enablement. Skills add Worker hints and audit-visible context, but do not define generic pentest playbooks or bypass Tool Gateway policy.
- `src/poc`: curated PoC/template registry and run-level enablement. Templates add evidence requirements, safety constraints, and Worker hints for specific vulnerability classes; they do not grant permissions or replace Tool Gateway policy.
- `src/credentials`: run-local credential and role references. The store accepts vault references or named placeholders only, never raw bearer tokens, passwords, API keys, JWTs, or long secret-looking values.
- `src/access`: evidence-backed access review and role-diff comparison. It compares redacted HTTP/tool evidence, stores a diff artifact, and leaves impact confirmation to human review.
- `src/oast`: local OAST sessions and callback capture. Tokenized callback URLs store inbound interactions as redacted `oast_callback` evidence.
- `src/sast`: SARIF import service for local static-analysis or CI results. Imports store a normalized evidence artifact and can create evidence-backed candidate findings for human review.
- `src/mobile`: Android Manifest import service for rigid mobile-domain triage. It hashes the manifest input, stores normalized permission/component evidence, and can create evidence-backed candidate Findings without requiring apktool.
- `src/cloud`: Cloud IAM policy import service for rigid cloud-domain review. It hashes IAM policy JSON, stores normalized statement/risk evidence, and can create evidence-backed candidate Findings without requiring live cloud credentials.
- `src/identity`: Identity graph import service for rigid AD/identity-domain review. It hashes BloodHound-style graph JSON, stores normalized node/edge/risk evidence, and can create evidence-backed candidate Findings without live domain actions.
- `src/dispatcher`: bootstrap/reason/explore scheduling with worker adapters, intent leases, heartbeat support, and timeout release.
- `src/workers`: mock worker and hardened generic CLI worker adapter with timeout kill and JSON result validation.
- `src/workers/protocol.ts`: Agent Worker protocol envelope with hard rules, tool surface, output schema, and examples for Claude Code, Codex, Gemini, Kimi, or custom CLI workers.
- `GET /runs/{id}/worker-envelope/preview` renders the same `agent-worker.v1` envelope without executing a Worker, claiming an intent, or writing state. It exposes task selection, graph counts, context counts, safety flags, and the protocol JSON for operator review.
- Agent Workers can propose `toolRequests` during `explore`; the dispatcher executes those requests through the Tool Gateway and attaches returned evidence IDs to the concluded fact.
- `src/workers/worker-runtime-service.ts`: health/readiness view for configured Agent Workers.
- `src/tools`: Tool Gateway with tool allowlisting, execution previews, rate limits, audit records, blocking, and approval creation.
- `src/tools/tool-pack-service.ts`: governed Tool Packs that preview and run multiple high-level Tool Gateway requests as auditable evidence collection bundles.
- `src/tools/toolbox-registry.ts`: governed scanner template, toolbox profile, and toolbox bundle registry.
- `src/tools/toolbox-runner.ts`: runtime profile probing plus gated external scanner execution for Docker/Podman, local SAST, and Android adapters.
- `src/connectors`: Connector Registry for MCP, CLI, HTTP API, and container manifests. Connectors are capability metadata for operators and Worker context; they do not expose raw commands, payloads, endpoints, or secrets.
- `GET /scanner-template-policies` exposes the policy contract for every scanner template. Policies cap timeouts, restrict allowed risk levels, document input/evidence rules, and keep external templates fail-closed behind environment, allowlist, and profile gates.
- `GET /toolbox-policy` shows the current external toolbox execution policy, including global execution switch, profile probe switches, and the external scanner-template allowlist.
- `GET /toolbox-doctor` shows a read-only readiness report for scanner engines, runtime profiles, runnable templates, blocked templates, and operator actions. It does not execute tools or grant permission.
- `GET /runs/{id}/execution-node` shows the local-first execution node status for a run: Worker health, runtime profiles, toolbox adapters, browser/proxy/OAST sessions, enabled bundles/connectors, fail-closed policy, and operator actions. It is read-only and does not start tools, sessions, containers, or Workers.
- `GET /runs/{id}/local-runner-workbench` turns local browser/proxy/OAST primitives into an operator workbench: capture profiles, proxy header setup, HAR bridge guidance, evidence review gates, recent captured evidence, and next actions.
- `POST /runs/{id}/local-runner-workbench/prepare` safely prepares a run-local browser session and proxy session without network traffic, tool execution, OAST startup, approvals, or Worker permissions.
- `GET /runs/{id}/domain-skill-readiness` turns enabled Skills and imported artifacts into a run-level Skill workbench: per-domain inputs, evidence requirements, excluded behavior, Worker handoff rules, gates, and next actions.
- Toolbox Bundles group profiles, engines, scanner templates, risk levels, safety notes, installation notes, and commercial use cases. They are read models for operators and future package management; registering or viewing a bundle does not grant tool permission or bypass Tool Gateway policy.
- `GET /runs/{id}/runtime-activation-plan` turns Toolbox Doctor output into a governed activation sequence for external execution policy, runtime profiles, scanner-template allowlists, bundle context, validation, and safety invariants.
- `POST /toolbox-bundles` registers local custom Bundle manifests under `bundle.custom.*`. Manifest registration is persisted locally, hashed, and limited to metadata fields; raw commands, args, payloads, and direct tools are rejected.
- Runs can enable specific Toolbox Bundles as Agent Worker context. Enablement writes a graph hint and timeline event, but still does not grant execution permission or bypass Tool Gateway policy.
- `GET /connectors` and `POST /connectors` expose governed MCP/CLI/HTTP/container connector manifests. Custom connector ids must use `connector.custom.*`; registration stores metadata only and rejects raw commands, args, payloads, secrets, credentials, headers, and direct endpoints.
- Built-in connector presets now cover HexStrike-style MCP, AutoRedTeam-style MCP, Nuclei, web recon containers, network recon containers, SAST/supply-chain CLI tools, Android/mobile analysis, cloud/identity audit, bug bounty platform APIs, and CAI/Apex-style evaluation metadata.
- Connector manifests now include a derived capability mapping: mapped high-level tools, scanner templates, tool packs, unmapped tool names, and coverage percentage. This turns external ecosystems into a visible product backlog without exposing raw MCP/CLI/API/container execution.
- `GET /runs/{id}/ecosystem-coverage` aggregates Connector mappings, Toolbox Bundles, scanner templates, Tool Packs, capability areas, and unmapped tool names into a governed ecosystem coverage report. It shows how HexStrike/AutoRedTeam-style breadth becomes Tool Gateway-backed product work without raw tool access.
- `GET /runs/{id}/tool-integration-backlog` turns ecosystem gaps into ranked implementation work for scanner templates, Tool Packs, rigid Domain Skills, first-party services, runtime profiles, or manual mapping review.
- `GET /runs/{id}/tool-ecosystem-workbench` joins Tool Gateway catalog, scanner-template policy, Tool Packs, Connector Coverage, Tool Integration Backlog, Toolbox Doctor, Runtime Activation Plan, Local Execution Node, tool invocations, evidence, and findings into one commercial tool-readiness view. It shows runnable templates, mapped connector tools, recommended packs, blocked gates, operator next actions, and reference-project alignment without running tools or granting Worker authority.
- `GET /runs/{id}/mission-control` exposes the commercial mission view for one run: current objective, selected reasoning priority, progress counters, mission lanes, decision trail, next operator actions, blockers, acceptance gates, safety notes, and reference-project alignment. It is read-only and cannot dispatch Workers, invoke tools, approve actions, validate findings, write evidence, or mutate the graph.
- `GET /runs/{id}/desktop-readiness` turns the AIDA/WonderSuite desktop-app gap into a concrete readiness model for Tauri shell, Rust daemon, MITM proxy, browser controller, vault bridge, toolbox manager, cloud sync, and remote worker nodes.
- `GET /runs/{id}/reference-benchmark` compares the current run and platform surfaces against the reference projects. It turns copied ideas, deliberately avoided patterns, remaining gaps, and commercial blockers into a read-only capability roadmap.
- Runs can enable specific Connectors as Agent Worker context. Enablement writes a graph hint and timeline event, but it still does not grant execution permission, call external MCP/CLI/API/container tools, or bypass Tool Gateway policy.
- `POST /runs/{id}/connectors/{connectorId}/plan` and `/invoke` turn mapped Connector templates into Tool Gateway previews or audited scanner-template runs. They do not invoke the connector itself; they execute only first-party governed templates through normal scope, approval, rate, audit, redaction, and evidence gates.
- `POST /runs/{id}/tools/plan` previews a high-level tool request without writing state, executing tools, creating approvals, or consuming rate-limit budget. It returns the same gate decisions the Tool Gateway will use for execution, including scope, approval binding, toolbox readiness, scanner command preview, evidence policy, and audit side effects.
- `GET /tool-packs`, `POST /runs/{id}/tool-packs/{packId}/plan`, and `POST /runs/{id}/tool-packs/{packId}/invoke` provide governed Web/Network/API/Auth/modern-Web capability packs. Pack preview has no side effects; pack invoke still sends each step through Tool Gateway scope, rate, approval, audit, redaction, and evidence gates.
- `GET /runs/{id}/strategy/recommendations/{recommendationId}/plan` applies the same preview path to Autonomy Plan recommendations, so operators can inspect safety gates before clicking Run or queueing work for an Agent Worker.
- `scanner.run_template` currently includes built-in web checks for security headers, endpoint discovery, technology fingerprinting, cookie flags and scope, link/form mapping, security.txt policy, CORS policy, CSP/browser-policy analysis, JavaScript asset inventory, WebSocket discovery planning, source-map exposure planning, redirect policy, cache policy, OpenAPI discovery, OAuth/OIDC metadata, and GraphQL introspection planning, plus built-in network checks for bounded DNS records and TLS certificate metadata. External nuclei, ffuf, httpx, sqlmap, nmap, tlsx, semgrep, apktool, and Frida templates are registered, runtime-probed, and fail closed unless external execution policy and profile readiness gates are enabled.
- `src/security`: shared redaction helpers for URLs, headers, arguments, event details, and captured previews.
- `http.request` now performs an in-scope low-risk HTTP request and stores a redacted `http_exchange` evidence record.
- `browser.navigate` starts or reuses a local browser-controller session, navigates one in-scope URL, and stores a redacted `http_exchange` evidence record.
- `POST /runs/{id}/captures/har` imports standard HAR entries as redacted evidence, skips out-of-scope entries, and persists a reviewable imported/skipped summary.
- `POST /runs/{id}/captures/browser-snapshot` captures rendered page screenshots as local-only evidence and redacted text/DOM previews as reviewable evidence.
- `POST /runs/{id}/android-manifest-imports` imports AndroidManifest.xml content as normalized mobile evidence and optional candidate Findings.
- `POST /runs/{id}/cloud-iam-imports` imports Cloud IAM policy JSON as normalized permission-risk evidence and optional candidate Findings.
- `POST /runs/{id}/identity-graph-imports` imports BloodHound-style identity graph JSON as normalized identity-path evidence and optional candidate Findings.
- `credential.use_placeholder` records an audited use of a run-local credential reference as redacted evidence, without resolving or storing the underlying secret.
- `access.compare_evidence` compares baseline and comparison evidence for role-visible differences and stores a redacted diff artifact.
- `oast.start_session` creates a local callback inbox; `oast.record_callback` records manual/lab callbacks as evidence.
- `shell.run_sandboxed` runs allowlisted local commands in per-invocation working directories and stores redacted stdout/stderr evidence.
- `finding.propose` creates candidate findings through the Tool Gateway only when referenced evidence exists in the same run.
- `src/evidence`: SHA-256 evidence records with redaction state and local blob content.
- `src/findings`: finding proposal service that rejects evidence-free findings.
- `src/reports`: report generation for HackerOne, Bugcrowd, SRC, and enterprise formats, plus run export bundles for commercial handoff.
- report bundles are stored locally as `replay_bundle` evidence with a SHA-256 hash.
- `src/api`: REST API for runners, UI, or cloud control-plane integration.
- `src/ui`: local Operator Console shell for progress, timeline, run creation, and dispatch controls.
- `src/storage`: in-memory and SQLite state stores.

## API

Open the local console:

```http
GET /app
```

List runs:

```http
GET /runs
```

Create a run:

```http
POST /runs
```

The Operator Console exposes Worker Pool presets for mock, Codex CLI, Claude Code CLI, and Claude+Codex mixed runs. Advanced operators can edit the JSON directly before creating a run; the API still validates worker type, priority, max concurrency, command, args, env, and timeout.

Import and reuse authorized program scope:

```http
POST /program-scopes/import
GET /program-scope-imports
```

Get graph:

```http
GET /runs/{id}/graph
```

Get timeline and progress:

```http
GET /runs/{id}/events
GET /runs/{id}/progress
GET /runs/{id}/mission-control
GET /runs/{id}/runtime-operations-workbench
GET /runs/{id}/workbench
GET /runs/{id}/flow
GET /runs/{id}/strategy
GET /runs/{id}/search-plan
POST /runs/{id}/search-plan/advance
GET /runs/{id}/surface
GET /runs/{id}/surface/frontier/{frontierId}/plan
POST /runs/{id}/surface/frontier/{frontierId}/intent
POST /runs/{id}/surface/frontier/{frontierId}/invoke
GET /runs/{id}/strategy/recommendations/{recommendationId}/plan
GET /runs/{id}/workers
GET /runs/{id}/worker-selection
GET /runs/{id}/worker-evaluation-plan
GET /runs/{id}/agent-harness
GET /runs/{id}/agent-harness/plan
GET /runs/{id}/worker-envelope/preview?task=auto
GET /agent-framework
GET /worker-leaderboard
GET /runs/{id}/execution-node
GET /runs/{id}/desktop-readiness
GET /runs/{id}/local-runner-workbench
POST /runs/{id}/local-runner-workbench/prepare
GET /runs/{id}/observability
GET /runs/{id}/capability-radar
GET /runs/{id}/scorecard
GET /runs/{id}/evidence-quality
GET /capabilities
GET /tool-catalog
GET /tool-packs
GET /scanner-template-policies
GET /toolbox-policy
GET /toolbox-doctor
GET /runs/{id}/runtime-activation-plan
GET /toolbox-bundles
POST /toolbox-bundles
GET /toolbox-profiles
GET /connectors
POST /connectors
GET /runs/{id}/toolbox-bundles
POST /runs/{id}/toolbox-bundles/{bundleId}/enable
GET /runs/{id}/connectors
GET /runs/{id}/ecosystem-coverage
GET /runs/{id}/tool-integration-backlog
GET /runs/{id}/tool-ecosystem-workbench
GET /runs/{id}/reference-benchmark
POST /runs/{id}/connectors/{connectorId}/enable
GET /runs/{id}/connector-runs
POST /runs/{id}/connectors/{connectorId}/plan
POST /runs/{id}/connectors/{connectorId}/invoke
POST /runs/{id}/tools/plan
```

Get the review bundle:

```http
GET /runs/{id}/review
```

Import evidence and propose a finding:

```http
POST /runs/{id}/evidence
POST /runs/{id}/findings
POST /findings/{id}/validation
```

Add a human hint:

```http
POST /runs/{id}/hints
```

Advance the dispatcher once. Worker choice uses the Worker Selection Policy when available and falls back to the original worker-pool order if the policy cannot be computed:

```http
POST /runs/{id}/dispatch
```

Advance the controlled autopilot once:

```http
POST /runs/{id}/autopilot/tick
```

Advance the highest-priority automatable Search Plan item once:

```http
POST /runs/{id}/search-plan/advance
```

List and enable narrow Domain Skills:

```http
GET /skills
GET /runs/{id}/skills
GET /runs/{id}/domain-skill-readiness
POST /runs/{id}/skills/{skillId}/enable
```

List and enable curated PoC templates:

```http
GET /poc-templates
GET /runs/{id}/poc-templates
POST /runs/{id}/poc-templates/{templateId}/enable
```

Manage authenticated role references:

```http
GET /runs/{id}/credentials
POST /runs/{id}/credentials
POST /credentials/{id}/revoke
```

Compare role-visible evidence:

```http
GET /runs/{id}/access-reviews
POST /runs/{id}/access-reviews
POST /runs/{id}/access-reviews/compare
POST /access-reviews/{id}/evidence
```

Import local SAST / CI SARIF:

```http
GET /runs/{id}/sarif-imports
POST /runs/{id}/sarif-imports
```

Import Android Manifest evidence:

```http
GET /runs/{id}/android-manifest-imports
POST /runs/{id}/android-manifest-imports
GET /runs/{id}/cloud-iam-imports
POST /runs/{id}/cloud-iam-imports
GET /runs/{id}/identity-graph-imports
POST /runs/{id}/identity-graph-imports
```

Open and review local OAST callbacks:

```http
POST /runs/{id}/oast-sessions
GET /runs/{id}/oast-sessions
GET|POST /oast/{token}
POST /oast-sessions/{id}/close
```

Heartbeat an active intent lease:

```http
POST /intents/{id}/heartbeat
```

Invoke a policy-gated tool:

```http
POST /runs/{id}/tools
POST /runs/{id}/tool-packs/{packId}/plan
POST /runs/{id}/tool-packs/{packId}/invoke
GET /runs/{id}/tool-pack-runs
```

Capture a browser/proxy HTTP exchange as evidence:

```http
POST /runs/{id}/captures/http-exchange
POST /runs/{id}/captures/har
GET /runs/{id}/capture-imports
POST /runs/{id}/captures/browser-snapshot
GET /runs/{id}/browser-snapshots
```

Start and drive a browser-controller session:

```http
POST /runs/{id}/browser-sessions
GET /runs/{id}/browser-sessions
POST /browser-sessions/{id}/navigate
POST /browser-sessions/{id}/close
```

Capture through the local HTTP proxy adapter:

```http
POST /runs/{id}/proxy-sessions
GET http://target.example/path
X-Capture-Run-Id: run_x
X-Platform-Token: <local token>
POST /proxy-sessions/{id}/close
```

Review pending approvals for a run:

```http
GET /runs/{id}/approvals
```

Review tool audit records for a run:

```http
GET /runs/{id}/tool-invocations
```

Read local evidence content:

```http
GET /evidence/{id}/content
GET /runs/{id}/replay-plans
POST /evidence/{id}/replay
```

Approve or reject a high-risk action:

```http
POST /approvals/{id}/decision
```

List findings:

```http
GET /findings?runId={id}
```

Evaluate a run and generate a report:

```http
POST /runs/{id}/evaluations
POST /reports
POST /runs/{id}/exports
GET /runs/{id}/exports
```

Authenticated request example:

```bash
curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" http://127.0.0.1:4317/findings
```

## Safety Model

Risk levels:

- `R0`: passive read, auto-allowed when in scope.
- `R1`: ordinary HTTP/browser actions, auto-allowed when in scope.
- `R2`: scanning or fuzzing, allowed only when policy and scope match.
- `R3`: exploit validation, OAST, state-changing checks, or cross-role auth tests; requires explicit approval.
- `R4`: destructive, credential theft, persistence, data exfiltration, brute force, or out-of-scope actions; blocked by default.

Commercial boundary:

- Raw evidence stays local by default.
- Cloud control plane should receive only redacted graph summaries and report artifacts.
- Findings must reference evidence.
- Evidence metadata is returned in graph snapshots; evidence blob content is read from the local Evidence Engine.
- Scope violations must fail closed before any tool execution or browser/proxy capture storage.

## Current Limits

This is the platform kernel, not the finished desktop or cloud product.

Implemented now:

- Core contracts
- Local persistence
- Mock Agent Worker loop
- REST API
- Evidence/finding/report pipeline
- Evidence Viewer panel in the Operator Console for local blob preview, hash/size/encoding review, and manual evidence triage
- Evidence Review workflow for operator triage decisions (`useful`, `needs_more_context`, `not_relevant`) before evidence is promoted into findings or reports
- Safe HTTP Evidence Replay button/API for in-scope GET/HEAD evidence reproducibility checks
- One-click promotion from `useful` reviewed evidence to an evidence-backed candidate Finding
- Finding confirmation/rejection loop; rejected findings stay out of generated reports
- Confirmed Finding gate requiring useful-reviewed evidence plus validation metadata
- Report finding-scope selection so commercial reports default to confirmed findings while triage reports can explicitly include candidates
- Scope-gated HTTP capture endpoint and Operator Console form
- Scanner Template panel in the Operator Console for running governed templates
- Tool Packs panel in the Operator Console for previewing and running governed Web/Network/API/Auth/modern-Web evidence packs
- Web Client-Side Surface Pack for CORS, CSP/browser-policy, and JavaScript asset inventory evidence without executing JavaScript or downloading source maps
- Toolbox Policy panel in the Operator Console for external execution and template allowlist visibility
- Toolbox Doctor panel in the Operator Console for adapter and template readiness, blocked reasons, and operator actions
- Runtime Activation Plan panel in the Operator Console for policy/profile/allowlist/bundle/validation activation order without raw tool exposure
- Capability Matrix panel in the Operator Console for current and planned capability coverage
- Agent Framework panel in the Operator Console for framework kernel, extension points, invariants, and next integration steps
- Agent Harness panel in the Operator Console for agent-loop, tool-registry, sandbox, observation-budget, eval, handoff, evidence-delivery readiness, fixture tasks, and acceptance gates
- Desktop Runner Readiness panel in the Operator Console for desktop components, Tauri/Rust/MITM/browser/vault/cloud gaps, handoff contracts, and build actions
- Reference Benchmark panel in the Operator Console for reference-project comparison, including ai-engineering-from-scratch-style agent harness/eval/workbench lessons, copied principles, deliberate non-goals, commercial blockers, and next build actions
- Toolbox Bundle panel in the Operator Console for built-in, container, SAST, and Android tool-pack manifests
- Local Toolbox Bundle manifest registration from the Operator Console
- Run-level Toolbox Bundle enablement in the Operator Console and Agent Worker protocol envelope
- Connector Registry panel in the Operator Console for MCP, CLI, HTTP API, and container connector manifests
- Ecosystem Coverage panel/API for mapped connector tools, enabled bundles/connectors, capability areas, unmapped tool gaps, and governed mapping actions
- Tool Integration Backlog panel/API for ranked external-tool integration work without raw tool exposure
- Tool Ecosystem Workbench panel/API for commercial tool readiness, capability lanes, recommended packs, execution gates, and evidence-loop visibility
- Local Connector manifest registration and run-level Connector enablement in the Operator Console and Agent Worker protocol envelope
- Connector Plan/Run controls in the Operator Console for previewing and executing mapped Connector templates through Tool Gateway
- Runtime-aware Toolbox Profiles panel in the Operator Console for current and planned execution backends
- PoC Library panel in the Operator Console for enabling curated evidence templates on a run
- Android Manifest panel in the Operator Console for mobile APK manifest evidence import and candidate finding creation
- Explicit HTTP proxy capture adapter for local tools and future browser-controller handoff
- Proxy Session panel in the Operator Console
- Agent Workers panel in the Operator Console
- Local Execution Node panel/API for Worker health, toolbox readiness, browser/proxy/OAST sessions, and fail-closed execution policy
- Telemetry and evaluation panel for trace spans, local runtime, estimated cost, and quality checks
- Worker Leaderboard panel/API for cross-run model/Worker comparison and scheduling recommendations
- Worker Evaluation Plan panel/API for per-run Worker bakeoffs, task coverage, reliability, evidence output, and eval experiments
- Run Capability Radar panel/API for run-level safety, evidence, Worker, tool, domain, delivery, and observability posture
- Evidence Quality Index panel/API for evidence integrity, replayability, redaction readiness, useful-review coverage, finding linkage, and confirmed-delivery gates
- Delivery Readiness panel/API for commercial handoff gates across approvals, evidence review, confirmed findings, report scope, and blocked tool calls
- Mission Control panel/API for progress, reasoning priority, blockers, operator actions, acceptance gates, and reference alignment in one run view
- Runtime Operations panel/API for normalized runtime events, event-contract coverage, session/resume posture, sandbox binding readiness, operator actions, and Z3r0-inspired runtime visibility
- Run timeline/progress API for desktop process views
- Agent Workbench panel/API for run-level Worker loop, strategy, blockers, evidence review, and next-action visibility
- Search Plan panel/API for ranked autonomous-search priorities without adding multi-agent roles
- Autonomy Strategy panel/API for recommended high-level tool requests and Worker hints
- Attack Surface panel/API for visible assets, observed endpoints, technology signals, policy blockers, and search-frontier preview/dispatch/run controls
- One-click execution of executable strategy recommendations through the Tool Gateway
- One-click queuing of strategy recommendations as Dispatcher intents for Agent Workers
- Focused behavior tests

Next product layers:

- Tauri + React desktop UI
- TLS MITM proxy, local CA management, and browser controller automation
- Docker/Podman toolbox command execution behind the existing runtime probing, scope, approval, audit, and evidence gates
- Cloud tenant, RBAC, billing, SSO, and audit service
- Private deployment bundle
- Specialized skills for Android, cloud, AD, source code, and report formats
