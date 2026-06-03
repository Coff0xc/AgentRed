# Security Model

This platform is for authorized security testing only.

## Fail-Closed Rules

- API routes other than `/` and `/health` require a configured local bearer token. The dev entrypoint fails closed when `PLATFORM_API_TOKEN` is missing; only explicit local test harnesses can opt into unsafe no-auth localhost mode.
- `/app` and its static assets are also unauthenticated, but they are only a local shell; data and mutations still call token-protected API routes.
- Out-of-scope targets are blocked before tool execution.
- Denylist entries override allowlist entries.
- Unsupported HTTP methods are blocked.
- Unsupported high-level tools are blocked.
- Run-level rate limits are enforced before tool execution.
- HTTP exchange captures are scope-checked before evidence storage.
- Browser session navigation is scope-checked before fetch and evidence storage.
- HTTP proxy absolute-form requests are scope-checked before forwarding.
- HTTP proxy forwarding requires an active proxy capture session for the run.
- Proxy authentication uses `X-Platform-Token` or `Proxy-Authorization`, not the target application's `Authorization` header.
- Captured URLs, headers, request previews, and response previews are redacted before hashing and storage.
- Evidence replay supports only in-scope `GET` and `HEAD` `http_exchange` evidence, strips sensitive headers, never replays request bodies, and stores replay results as fresh redacted evidence.
- Local proxy control headers are stripped before forwarding to the target.
- `shell.run_sandboxed` uses a narrow command allowlist, no-shell spawn, timeout kill, and per-invocation working directories.
- Built-in network templates are bounded to passive DNS record lookups and single TLS certificate handshakes. They do not perform zone transfers, port scans, packet capture, TLS interception, or raw socket fuzzing.
- Toolbox Bundles are manifests and readiness views only. Viewing or registering a bundle does not add tool allowlist entries, approve actions, change scope, lower risk levels, or expose raw tools to Agent Workers.
- Custom Toolbox Bundle registration rejects raw commands, command args, payloads, and raw tool lists. Custom ids must live under `bundle.custom.*`, and built-in bundle ids cannot be replaced.
- Connectors are metadata manifests only. Viewing, registering, or enabling a connector does not start MCP servers, call CLI tools, send HTTP API requests, start containers, add allowlist entries, approve actions, change scope, lower risk levels, or expose raw commands to Agent Workers.
- Built-in connector presets for web, network, SAST, mobile, cloud/identity, bug bounty, and evaluation ecosystems are treated the same way as custom connectors: they are metadata and mapping hints only, not execution adapters.
- Custom Connector registration rejects raw commands, command args, payloads, secrets, credentials, tokens, authorization headers, direct endpoints, and raw tool definitions. Custom ids must live under `connector.custom.*`, and built-in connector ids cannot be replaced.
- Connector capability mappings are advisory read models only. A mapped template or Tool Pack id tells the Worker which first-party governed path may represent a connector capability; it does not execute the connector or waive Tool Gateway checks.
- Ecosystem Coverage is read-only. It aggregates connector/toolbox/capability coverage and unmapped tool gaps, but it does not invoke connectors, execute tools, register templates, enable bundles, approve actions, change policy, or grant Worker permissions.
- Tool Integration Backlog is read-only. It converts ecosystem gaps into implementation candidates, but it does not register scanner templates, create Tool Packs, start connectors, execute commands, approve risk, change scope, or grant Worker permissions.
- Tool Ecosystem Workbench is read-only. It aggregates Tool Gateway catalog entries, scanner-template policy, Tool Packs, Connector Coverage, Tool Integration Backlog, Toolbox Doctor, Runtime Activation Plan, Local Execution Node status, tool invocations, evidence metadata, and finding metadata, but it does not run tools, invoke connectors, enable bundles, change allowlists, create approvals, write evidence, or expose raw commands to Workers.
- Desktop Runner Readiness is read-only. It models Tauri, Rust daemon, browser, MITM, vault, toolbox, cloud sync, and remote worker handoff contracts, but it does not scaffold desktop code, install certificates, start sessions, resolve secrets, sync data, execute tools, or grant Worker permissions.
- Runtime Activation Plan is read-only. It translates Toolbox Doctor blockers into operator activation steps, but it does not set environment variables, install tools, pull containers, enable bundles, allowlist templates, execute commands, approve risk, or grant Worker permissions.
- Reference Benchmark is read-only. It compares platform/run capability against selected reference-project design lessons, but it does not browse GitHub, invoke reference projects, register tools, change policy, approve actions, execute commands, or grant Worker permissions.
- Mission Control is read-only. It aggregates progress, Search Plan, Agent Workbench, Tool Ecosystem, Local Runner, Evidence Quality, Delivery Readiness, Agent Harness, and Reference Benchmark state, but it cannot dispatch Workers, execute tools, approve actions, review evidence, validate findings, write evidence, mutate graph state, read raw evidence blobs, or grant Worker permissions.
- Runtime Operations Workbench is read-only. It projects existing run events and trace spans into frontend-safe runtime activity, but it cannot open live streams, dispatch Workers, start sandboxes, run commands, mutate session state, read raw evidence blobs, create subagent jobs, or grant Worker-to-Worker communication. Z3r0-style subagent/delegation concepts are represented only as Dispatcher intents or future first-party background jobs.
- Connector plan is read-only. Connector invoke does not call the connector itself; it only converts mapped templates into `scanner.run_template` requests and sends them through the normal Tool Gateway path.
- External scanner execution requires both `PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1` and membership in `PLATFORM_ALLOWED_SCANNER_TEMPLATES` unless the allowlist is explicitly `*`.
- Scanner Template Policies cap timeout values and restrict acceptable risk levels before a template reaches built-in or external execution.
- External scanner templates are runtime-probed and command-planned, and remain blocked unless policy and profile gates are explicitly enabled. When enabled, execution uses no-shell spawn, timeout kill, an ephemeral `.local/tool-runs/{toolCallId}` directory, redacted stdout/stderr evidence, and normal Tool Gateway audit.
- `POST /runs/{id}/tools/plan` exposes these decisions as a read-only preview. It does not execute tools, write invocations, create approvals, consume rate-limit budget, or add evidence.
- `GET /toolbox-doctor` is read-only and diagnostic. It reports adapter/template readiness from existing policy, profile, bundle, and template metadata; it does not execute tools, start containers, pull images, create approvals, change allowlists, or grant Worker permissions.
- `GET /runs/{id}/execution-node` is read-only and diagnostic. It aggregates Worker health, toolbox readiness, browser/proxy/OAST sessions, bundle/connector context, and fail-closed policy, but it cannot start sessions, execute tools, pull containers, dispatch Workers, approve actions, change environment policy, or grant Worker permissions.
- `GET /runs/{id}/local-runner-workbench` is read-only and operator-facing. It aggregates browser/proxy/OAST sessions, proxy setup hints, capture profiles, capture gates, recent evidence metadata, review coverage, and next actions, but it cannot start sessions, forward traffic, import HAR files, review evidence, validate findings, install certificates, generate PAC files, sync evidence, or grant Worker permissions. Capture profiles are explanations of allowed entrypoints and gates; they are not new execution paths.
- `POST /runs/{id}/local-runner-workbench/prepare` can create run-local browser/proxy session records, but it cannot navigate, forward traffic, execute tools, start OAST by default, import HAR files, review evidence, validate findings, install certificates, generate PAC files, approve actions, sync evidence, or grant Worker permissions.
- `GET /agent-framework` is read-only and product-facing. It reports framework contracts and extension points; it does not dispatch Workers, run tools, read raw evidence, create approvals, or mutate run state.
- `GET /worker-leaderboard` is read-only. It compares Workers from trace, cost, fact, evidence-link, and finding data, but it cannot change scheduling, dispatch Workers, approve actions, read raw prompts, read raw evidence blobs, or accept Worker-written scores.
- `GET /runs/{id}/worker-selection` is read-only. It ranks configured Workers for the next Dispatcher task from runtime health, priority, leaderboard evidence, current-run outcomes, and task fit, but it cannot dispatch Workers, claim intents, approve actions, invoke tools, change priorities, read raw evidence blobs, or accept Worker-written scores. `POST /runs/{id}/dispatch` may consume this ordering, but all Dispatcher, Tool Gateway, approval, scope, evidence, and finding gates still apply.
- `GET /runs/{id}/worker-evaluation-plan` is read-only. It proposes same-scope Worker bakeoffs from trace, cost, fact, evidence-link, and finding data, but it cannot execute Workers, claim intents, change selection policy, invoke tools, read raw evidence blobs, approve actions, or accept Worker-written scores.
- `GET /runs/{id}/agent-harness` and `GET /runs/{id}/agent-harness/plan` are read-only. They score framework engineering readiness and fixture evaluation readiness from existing run state, tool registry, toolbox, trace, eval, workbench, and evidence-delivery signals, but they cannot dispatch Workers, invoke tools, approve actions, change scope, mutate harness cells, activate toolbox profiles, read raw evidence blobs, or grant Worker permissions.
- `GET /runs/{id}/capability-radar` is read-only. It scores run posture and suggests scheduling priorities from existing state, but it cannot dispatch Workers, invoke tools, approve actions, review evidence, validate findings, generate reports, or change Worker/tool permissions.
- `GET /runs/{id}/evidence-quality` is read-only. It scores evidence integrity, review coverage, replayability, redaction readiness, and finding linkage from metadata only; it cannot read raw evidence blobs, replay requests, mark evidence reviewed, validate findings, generate reports, approve actions, or mutate run state.
- Tool Pack previews are also read-only. Tool Pack invocation is not a shortcut around policy: every pack item goes through the normal Tool Gateway path and the pack stores only a summary of item statuses, invocation ids, approval ids, and evidence ids.
- Strategy recommendation previews reuse the same read-only Tool Gateway plan path; a recommendation preview is not an approval, dispatch, or execution grant.
- Attack Surface Map is metadata-only by default. It derives assets, endpoints, technology signals, blockers, and search frontier from existing local state, references evidence by id, and does not return raw evidence blobs.
- Attack Surface frontier preview is read-only and reuses the Tool Gateway preview path.
- Attack Surface frontier intent creation writes only a normal Dispatcher-owned `Intent` plus an optional graph hint; it does not execute tools or give Workers direct permissions.
- Attack Surface frontier invocation can run only mapped high-level Tool Gateway requests and cannot call raw MCP, CLI, HTTP API, or container connectors directly.
- Agent Workbench is read-only. It aggregates progress, graph, flow, strategy, surface, Tool Gateway, evidence review, finding validation, and event state, but it cannot dispatch Workers, execute tools, approve actions, change scope, validate findings, generate reports, or read raw evidence blobs.
- `GET /runs/{id}/search-plan` is read-only. It ranks approvals, active leases, queued intents, evidence review, finding validation, blocked tools, Strategy recommendations, Attack Surface frontier, and reporting readiness, but it cannot dispatch Workers, execute tools, approve actions, mutate graph state, or grant automation authority.
- `POST /runs/{id}/search-plan/advance` can make only one Dispatcher-owned move from the top Search Plan item. It can dispatch an existing intent or queue a Strategy/Surface intent before dispatch; approvals, evidence review, finding validation, blocked tools, report generation, active leases, and unsupported items stop for operator review or waiting state.
- Approval ids are bound to the same run, tool, target, and risk level before they can satisfy an execution request.
- Credential References reject raw bearer tokens, JWTs, passwords, API keys, and long secret-looking values before local storage.
- Run policies with `allowVaultReferencesOnly` accept only vault-style credential references.
- `credential.use_placeholder` records safe placeholder use and never resolves or stores the underlying secret.
- `access.compare_evidence` only compares existing same-run evidence and stores a redacted diff artifact; it does not perform live requests or confirm impact automatically.
- OAST callbacks are token-addressed, redacted, and stored as `oast_callback` evidence. Callback evidence stores a token hash, not the raw callback token. The default inbox is local HTTP. An explicit interactsh-compatible backend can generate public callback URLs, but this code path only creates session URLs and records callbacks that reach the platform; it does not poll or operate a public relay.
- SARIF imports are normalized into redacted evidence and optional candidate Findings. They do not upload source code, do not store unbounded snippets, and do not mark static-analysis results as confirmed impact.
- Android Manifest imports are normalized into redacted evidence and optional candidate Findings. They store an input hash plus bounded package, SDK, permission, component, and risk-signal metadata; the original XML is not stored as raw evidence by the import route.
- `R3` requires explicit approval.
- `R4` is blocked by default. A run can define `scopePolicy.r4AuthorizationToken` for break-glass validation, but execution still requires the target and method to match scope, the caller to submit the matching token, and a human approval bound to the same run, tool, target, and risk level. API run/graph/review responses, Worker envelopes, and run exports redact this token.
- Findings without evidence are rejected.
- `finding.propose` goes through the Tool Gateway and Finding Service; Agent Workers can request a candidate finding, but they cannot bypass evidence validation or human review state.
- Worker Envelope Preview is read-only. It shows the `agent-worker.v1` envelope and context counts without executing a Worker, claiming an intent, writing graph state, embedding raw evidence content, or including raw secrets.
- `POST /runs/{id}/autopilot/tick` is a one-step control loop only: it queues Strategy recommendations as intents or calls the Dispatcher once, and cannot bypass Worker output validation, scope policy, approval gates, tool audit, evidence validation, or finding review.
- Search Plan Advance is also a one-step control loop. It cannot directly invoke tools, approve R3 work, unblock R4 actions, read raw evidence blobs, validate findings, generate reports, or bypass the Tool Gateway.
- Domain Skills are context and constraints, not permissions. Enabling a skill only adds run-local hints and Worker envelope context; it does not add tool allowlist entries, change scope policy, lower risk levels, approve actions, or create findings without evidence.
- Domain Skill Readiness is a read-only workbench. It joins Skill metadata, imports, evidence review state, findings, and report bundles, but it cannot enable Skills, import artifacts, run tools, approve actions, read raw evidence blobs, or create findings.
- PoC templates are evidence requirements and safety constraints, not permissions. Enabling a template only adds run-local hints and Worker envelope context; it does not add tool allowlist entries, change scope policy, lower risk levels, approve actions, inject payloads, or create findings without evidence.
- Tool invocation and approval records store redacted targets and arguments.
- Run timeline event titles and details are redacted before storage.

## Evidence Handling

Evidence has a redaction state:

- `raw_local_only`: never upload by default.
- `redacted`: safe to use in reports and cloud indexes.
- `safe_for_cloud`: explicitly approved for cloud sync by a trusted future redaction workflow; manual API imports cannot self-attest this state.

Every evidence item stores a SHA-256 hash so reports can reference reproducible local artifacts without uploading raw content. Report bundles are also stored as `replay_bundle` evidence. Graph snapshots expose evidence metadata; local blob content is available only through the local Evidence Engine, and the HTTP content API refuses `raw_local_only` blobs.

Run exports are also stored as `replay_bundle` evidence. They include broad run metadata for handoff, but evidence blob content embedding is disabled in HTTP API exports. Exports carry evidence ids, metadata, hashes, reviews, and report references while excluding `raw_local_only` content.

Run events are for operator visibility and workflow reconstruction. They should point to graph entities and evidence IDs, but they must not become a place to store raw HTTP bodies, secrets, credentials, or full command output.

Finding proposal is evidence-gated. Operator Console and API callers can import evidence, but a finding is rejected unless it references at least one evidence item in the same run.

Evidence review is an operator-only triage layer. Marking evidence as `useful`, `needs_more_context`, or `not_relevant` records human review state and an audit event, but it does not bypass finding validation, approval gates, scope checks, or report filtering.

Promoting evidence to a Finding is also gated: only evidence reviewed as `useful` can be promoted, and the resulting Finding remains a candidate with dynamic confirmation required. Rejected, unreviewed, or context-incomplete evidence cannot take the one-click promotion path.

Report generation defaults to confirmed findings only. Operators can explicitly generate a candidate-inclusive triage report, but rejected findings remain excluded in every scope.

Finding confirmation is gated by useful-reviewed evidence. A candidate cannot become `confirmed` unless every referenced evidence item has an operator Evidence Review marked `useful`; confirmation records reviewer, note, and timestamp for auditability.

Delivery readiness is a read-only handoff model. It can warn or block delivery status in the UI, but it cannot approve tool actions, change finding validation, alter report scope, or mutate evidence state.

Evidence Quality Index is also a read-only handoff model. It can flag missing local blobs, raw-local-only evidence, unreviewed evidence, non-replayable HTTP exchanges, and confirmed findings that are not delivery-ready, but it cannot expose blob content or perform the replay itself.

Attack Surface Map is a metadata-only visibility model. It may parse bounded UTF-8 evidence blobs locally to extract URLs, header-derived technology labels, scanner-template summaries, and import risk counts, but the API response contains only redacted labels, evidence ids, aggregate signals, blockers, and next-step recommendations. It must not become a raw traffic browser, a generic RAG index, or a Worker communication channel. Its direct actions are constrained to no-side-effect planning, Dispatcher intent creation, or Tool Gateway invocation.

Program Scope Import is a pre-run normalization step, not an authorization bypass. `POST /program-scopes/import` hashes the submitted JSON, extracts bounded allowed/denied assets and policy defaults, and persists only the normalized `ScopePolicy`, counts, default target, and notes. Raw program text is not stored and Workers never receive the original import payload.

Browser and proxy adapters should use either `browser.navigate` / Browser Session APIs or `POST /runs/{id}/captures/http-exchange` rather than generic evidence import. These routes treat observed requests as browser/HTTP actions for policy purposes and reject out-of-scope targets before any fetch, forwarding, or blob storage.

HAR imports use the same browser/proxy boundary in batch form. `POST /runs/{id}/captures/har` requires a run, clamps imported entries to a small bounded count, evaluates every HAR request URL and method against the run `ScopePolicy`, skips out-of-scope or malformed entries, redacts sensitive URLs, headers, and body previews, and stores only redacted `http_exchange` evidence plus a summary `CaptureImport` record. The original HAR is not stored as raw evidence by this route; only an input hash, counts, skipped reasons, and evidence IDs are persisted.

Browser snapshots use the same boundary for rendered page state. `POST /runs/{id}/captures/browser-snapshot` rejects out-of-scope targets before storage, caps screenshot payloads, stores screenshots as `raw_local_only` evidence, and stores only redacted bounded text/DOM previews as sync-safe metadata. Operators can review and promote the evidence, but cloud sync must not treat screenshots as safe for upload without an explicit future redaction workflow.

Evidence replay is intentionally narrower than a live validation engine. `GET /runs/{id}/replay-plans` is read-only. `POST /evidence/{id}/replay` re-checks the original target against the run `ScopePolicy`, refuses non-idempotent methods, strips authorization/cookie/proxy/control headers, refuses redacted header values, does not send captured bodies, and writes only a new redacted `http_exchange` evidence record. Replay must not be extended into POST replay, brute force, exploit validation, or authenticated state-changing flows without going back through Tool Gateway risk and approval gates.

Built-in Web client-side, modern exposure, API/auth, and active parameter scanner templates are bounded collectors. CORS review sends one synthetic-Origin GET without credentials, CSP analysis stores policy metadata rather than page bodies, JavaScript asset inventory parses one HTML response without executing JavaScript, cookie-scope analysis never stores cookie values, security.txt review never fetches external contact URLs, WebSocket discovery planning never opens a WebSocket handshake or sends messages, source-map exposure planning uses bounded same-origin HEAD metadata and never downloads map bodies, redirect and cache checks store headers/signals only, OpenAPI/OAuth/OIDC discovery checks bounded same-origin metadata paths without API operation execution or token exchange, GraphQL introspection planning probes endpoint hints without sending introspection queries or mutations, and `web.param_probe` mutates only query parameters already present in the target URL with bounded marker/quote/timing probes while storing redacted differential signals.

The explicit HTTP proxy adapter uses the same evidence contract after forwarding. Operators must open a proxy capture session before traffic is accepted and can close that session from the API or console. It currently handles absolute-form HTTP requests only. `CONNECT` and TLS interception are intentionally blocked until the desktop product has local CA lifecycle controls, certificate trust UX, and audit-visible approval gates.

Browser sessions currently use `local_fetch_controller` mode. This is deliberately less powerful than real browser automation, but it gives the platform a stable session, navigation, audit, snapshot, and evidence contract before adding JavaScript execution or TLS MITM.

SARIF imports are treated as local evidence. The import record stores an input hash, result counts, evidence id, and candidate Finding ids. Candidate Findings created from SARIF remain subject to the same human validation and report filtering as dynamic findings.

Android Manifest imports are treated as local mobile artifact evidence. The import record stores an input hash, package metadata, permission/component summaries, evidence id, and candidate Finding ids. Candidate Findings created from manifest risk signals remain subject to the same evidence review, human validation, and report filtering as dynamic findings.

Cloud IAM imports are treated as local cloud artifact evidence. The import record stores an input hash, normalized policy statement counts, risk signals, evidence id, and candidate Finding ids. Raw cloud credentials are not accepted or required, and IAM policy-risk candidates remain subject to evidence review, business-context validation, and report filtering.

Identity Graph imports are treated as local identity artifact evidence. The import record stores an input hash, normalized node/edge counts, high-value path signals, evidence id, and candidate Finding ids. The importer is read-only and must not be confused with live AD validation, password attacks, lateral movement, or credential extraction; all graph-risk candidates remain subject to evidence review and human validation.

## Worker Boundary

Agent Workers are untrusted producers of suggestions.

They cannot:

- write the graph directly
- bypass scope policy
- create findings without evidence
- approve their own actions
- keep an intent claimed after lease expiry
- mutate graph state with non-JSON or schema-invalid output
- communicate directly with other workers

They can:

- return structured bootstrap, reason, or explore results
- request high-level tools during `explore`; the dispatcher, not the Worker, sends those requests through the Tool Gateway
- extend active leases with valid heartbeat lease IDs
- be resumed by adapter-specific session logic in future worker drivers
- be replaced without changing the graph protocol

Worker-requested tools inherit the same scope, risk, approval, rate-limit, audit, redaction, and evidence rules as API-triggered tools. If a requested tool is blocked or requires approval, the dispatcher releases the intent instead of concluding it without evidence.

Enabled Domain Skills are included in the Worker protocol envelope as narrow context. Workers must treat them as constraints for specialized domains, not as a generic workflow, sub-agent assignment, or permission grant.

Domain Skill Readiness is not included in the Worker protocol envelope. It is an operator-facing gate that checks whether a Skill has concrete artifacts and reviewed evidence before the operator chooses to enable or rely on it.

Enabled PoC templates are also included in the Worker protocol envelope as narrow context. Workers must treat them as evidence requirements and safety notes for specific vulnerability classes, not as generic exploit instructions, tool permissions, or approval grants.

Enabled Toolbox Bundles are included in the Worker protocol envelope as capability context only. Workers may use them to choose governed scanner templates, but bundle enablement does not install tools, make profiles ready, add allowlist entries, approve risk, or expose raw commands.

Enabled Connectors are included in the Worker protocol envelope as capability metadata only. Workers may use them to understand which governed external integrations exist and which scanner templates or Tool Packs are mapped, but connector enablement does not call MCP, CLI, HTTP API, or container adapters and does not grant execution permission.

Credential References are included in the Worker protocol envelope as safe ids and role metadata only. Workers can request `credential.use_placeholder` with a `credentialId`, but they must not ask the operator to paste raw secrets or embed secret material in tool arguments.

Access Reviews are also first-party state. Workers can request `access.compare_evidence`, but they cannot mark the result as confirmed impact or bypass the Finding Service. Differential signals must still become evidence-backed candidate findings and go through human validation.

OAST sessions are first-party state. Workers can request a local inbox or, when the platform is configured for it, an interactsh-compatible public callback URL. Embedding OAST payloads in live target traffic remains an approval-gated validation step, and session start events hide callback tokens.

Worker health and Worker selection previews are read-only. `GET /runs/{id}/workers` reports configured worker readiness, command configuration, and healthcheck failures, while `GET /runs/{id}/worker-selection` explains the recommended next Worker. Neither route grants workers any write path into graph, evidence, approvals, or findings.

Worker Evaluation Plan is the same kind of read-only model. It can recommend a low-risk bakeoff or missing task-cell warmup, but the only way to produce new eval data is still the normal Dispatcher and Tool Gateway path.

## Production Hardening Backlog

- Per-tool sandbox profiles
- TLS MITM proxy with local CA generation, trust-store handling, and approval UX
- OS keychain or 1Password-backed credential vault
- Credential application adapters that inject vault material into local browser/proxy requests without exposing it to Workers
- Public OAST DNS/HTTP relay with tenant isolation and retention controls
- Immutable append-only audit ledger
- Signed report bundles
- Full local-only raw traffic vault with explicit export policy
- OIDC/SAML cloud identity
- Tenant-level retention and deletion policy
- SIEM export
- Policy tests for every new tool adapter
