# API Reference

All routes except `GET /` and `GET /health` require one of:

```http
Authorization: Bearer <token>
```

or:

```http
X-Platform-Token: <token>
```

Set the token with `PLATFORM_API_TOKEN`. The dev server generates and prints a one-time token when the variable is not set.

Errors are returned as JSON:

```json
{ "error": "Invalid JSON request body" }
```

## GET /

Unauthenticated API index for quick browser checks.

## GET /health

Unauthenticated health check.

```json
{ "status": "ok" }
```

## GET /app

Unauthenticated local Operator Console shell. The static shell loads without a token, but run data and mutations still require the local API token.

## GET /runs

Lists local runs with their current progress summaries. This is the run picker contract for desktop and local web UI clients.

## POST /runs

Creates an authorized run and initializes origin and goal facts.

```json
{
  "target": "https://app.example.com",
  "goal": "Produce an evidence-backed report",
  "scopePolicy": {
    "allowedAssets": ["example.com", "*.example.com"],
    "deniedAssets": ["admin.example.com"],
    "allowedMethods": ["GET", "POST"],
    "destructiveAllowed": false,
    "credentialRules": { "allowVaultReferencesOnly": true },
    "rateLimits": { "requestsPerMinute": 120 }
  },
  "workerPool": [
    { "name": "mock-worker", "type": "mock", "maxRunning": 1, "priority": 0, "timeoutMs": 60000 }
  ]
}
```

The local Operator Console has Worker Pool presets for:

- `mock`: deterministic local mock worker
- `codex`: Codex CLI Agent Worker
- `claude`: Claude Code CLI Agent Worker
- `claude_codex`: mixed Claude + Codex worker pool
- `custom`: operator-edited JSON

The server remains the authority. It validates `workerPool[].type`, `maxRunning`, `priority`, optional `command`, `args`, `env`, and `timeoutMs` before creating the run. Secret-looking worker environment variables such as API keys, tokens, passwords, cookies, JWTs, and credentials are rejected; provide worker secrets through the local API process environment instead.

## POST /program-scopes/import

Imports a Bug Bounty, SRC, or enterprise authorization scope JSON and normalizes it into the platform `ScopePolicy` shape used by `POST /runs`.

```json
{
  "format": "hackerone",
  "source": "program-scope.json",
  "content": {
    "in_scope": ["app.example.com", "*.example.com"],
    "out_of_scope": ["admin.example.com"],
    "allowedMethods": ["GET", "POST"],
    "requestsPerMinute": 120
  }
}
```

Supported `format` values are `hackerone`, `bugcrowd`, `src`, `enterprise`, and `generic_json`. The parser accepts common fields such as `in_scope`, `out_of_scope`, `allowedAssets`, `deniedAssets`, `targets`, `assets`, and `structured_scopes` with `asset_identifier`-style entries.

Behavior:

- raw program JSON is not persisted
- the import record stores input SHA-256, counts, normalized `ScopePolicy`, default target, and notes
- imported methods default to `GET, POST`
- rate limit defaults to 120 requests/minute and clamps to `1..600`
- `destructiveAllowed` defaults to `false`
- vault-only credential references default to `true`

Response:

```json
{
  "id": "program_scope_x",
  "format": "hackerone",
  "source": "program-scope.json",
  "allowedAssetCount": 2,
  "deniedAssetCount": 1,
  "defaultTarget": "https://app.example.com",
  "scopePolicy": {
    "allowedAssets": ["*.example.com", "app.example.com"],
    "deniedAssets": ["admin.example.com"],
    "allowedMethods": ["GET", "POST"],
    "destructiveAllowed": false,
    "credentialRules": { "allowVaultReferencesOnly": true },
    "rateLimits": { "requestsPerMinute": 120 }
  }
}
```

## GET /program-scope-imports

Lists the local scope imports, newest first. The Operator Console can apply any import back into the New Run form without re-uploading the original program content.

## GET /runs/{id}/graph

Returns the run, facts, intents, hints, evidence, and findings.

## GET /runs/{id}/events

Returns the ordered run timeline. Desktop clients use this to show what the dispatcher, worker loop, tool gateway, evidence engine, and report generator have done.

Event details are redacted before storage and are intended for workflow visibility, not raw evidence storage.

## GET /runs/{id}/progress

Returns a compact progress summary for UI status bars and run dashboards.

```json
{
  "runId": "run_x",
  "status": "active",
  "phase": "queued",
  "counts": {
    "facts": 3,
    "hints": 1,
    "intents": { "total": 1, "open": 1, "claimed": 0, "released": 0, "concluded": 0 },
    "evidence": 0,
    "findings": 0,
    "approvals": { "total": 0, "pending": 0, "approved": 0, "rejected": 0 },
    "tools": { "total": 0, "allowed": 0, "blocked": 0, "approvalRequired": 0 },
    "reports": 0
  },
  "lastEvent": { "type": "intent.created", "title": "Intent created" }
}
```

Current phases are `bootstrapping`, `reasoning`, `queued`, `exploring`, `awaiting_approval`, `completed`, and `stopped`.

## GET /runs/{id}/mission-control

Returns the run-level Mission Control read model. It is the commercial operator surface for "what is happening, why is this the next move, what is blocked, and what has to pass before delivery." It joins progress, Search Plan, Agent Workbench, Tool Ecosystem Workbench, Local Execution Node, Local Runner Workbench, Evidence Quality, Delivery Readiness, Agent Harness, and Reference Benchmark signals.

This endpoint is read-only. It does not dispatch Workers, invoke tools, approve actions, review evidence, validate findings, write evidence, mutate graph state, or grant permissions. Its actions point back to existing APIs such as Search Plan Advance, evidence review, finding validation, Tool Gateway previews, and report generation.

```json
{
  "mode": "assessment_mission_control",
  "posture": "collecting_evidence",
  "headline": "The run is still building its first evidence-backed branch.",
  "currentReasoning": {
    "phase": "queued",
    "selectedNextAction": "Dispatch Worker for: Capture baseline HTTP response",
    "topSearchItem": {
      "title": "Dispatch queued intent",
      "automation": "dispatch",
      "riskLevel": "R1",
      "score": 90
    }
  },
  "progress": {
    "facts": 2,
    "intents": 1,
    "evidence": 0,
    "pendingApprovals": 0,
    "healthyWorkers": 1,
    "deliveryStatus": "needs_review"
  },
  "lanes": [{ "id": "search_and_reasoning", "status": "queued" }],
  "operatorNextActions": [{ "label": "Dispatch Worker for: Capture baseline HTTP response", "actionKind": "dispatch" }],
  "acceptanceGates": [{ "id": "scope_policy", "status": "pass" }]
}
```

## GET /runs/{id}/supervisor

Returns a run-level stuck-loop supervisor report. It detects expired Worker leases, pending approvals, repeated blocked tool patterns, Worker timeout/error loops, and runs with no evidence and no queued work.

This endpoint is read-only. It does not dispatch Workers, invoke tools, approve actions, mutate the graph, or release leases.

```json
{
  "mode": "run_supervisor",
  "posture": "stuck",
  "summary": "1 expired lease(s), 0 pending approval(s), 1 timeout(s), 1 worker error(s), 2 repeated blocked tool call(s).",
  "counts": {
    "expiredClaimedIntents": 1,
    "pendingApprovals": 0,
    "repeatedBlockedTools": 2,
    "workerTimeouts": 1,
    "workerErrors": 1
  },
  "signals": [{ "id": "expired_leases", "severity": "critical" }],
  "actions": [
    {
      "kind": "release_expired_leases",
      "endpoint": "/runs/{id}/supervisor/tick",
      "safeToAutomate": true
    }
  ],
  "audit": {
    "readOnly": true,
    "dispatchesWorkers": false,
    "invokesTools": false,
    "releasesExpiredLeases": false
  }
}
```

## POST /runs/{id}/supervisor/tick

Runs one safe supervisor recovery tick. It only releases expired claimed intent leases by calling the graph lease recovery path, then returns the before/after supervisor counts. It does not dispatch the released work, run tools, approve actions, or mutate anything else.

```json
{
  "mode": "run_supervisor_tick",
  "releasedExpiredIntents": [{ "id": "intent_x", "releaseReason": "Lease expired for worker" }],
  "audit": {
    "dispatchesWorkers": false,
    "invokesTools": false,
    "approvesActions": false,
    "releasesExpiredLeases": true
  }
}
```

## GET /runs/{id}/runtime-operations-workbench

Returns the run-level Runtime Operations Workbench. This is the Z3r0-inspired operator surface for runtime event projection, session/resume posture, interrupt-safe gates, sandbox/local-surface binding, background-job readiness, and frontend-safe activity feeds.

This endpoint is read-only. It does not open live streams, dispatch Workers, start sandboxes, run shell commands, mutate session state, write graph objects, or read raw evidence blobs. It maps Z3r0's event-contract/runtime visibility ideas onto this platform's Dispatcher-owned intent model and deliberately does not introduce Worker-to-Worker subagent messaging.

```json
{
  "mode": "runtime_operations_workbench",
  "posture": "usable",
  "summary": "12 normalized runtime event(s), 4 trace span(s), 1 healthy Worker(s), 2 active local session(s).",
  "counts": {
    "runEvents": 8,
    "normalizedEvents": 12,
    "traceSpans": 4,
    "workerSpans": 2,
    "toolSpans": 2,
    "activeIntents": 0,
    "releasedIntents": 1,
    "openIntents": 1,
    "pendingApprovals": 0,
    "activeBrowserSessions": 1,
    "activeProxySessions": 1,
    "activeOastSessions": 0,
    "healthyWorkers": 1,
    "evidence": 3
  },
  "lanes": [
    {
      "id": "runtime.event_contract",
      "title": "Stable runtime event contract",
      "status": "active",
      "signals": ["normalized=12", "traceSpans=4"]
    }
  ],
  "eventContract": [
    {
      "kind": "run_event",
      "status": "implemented",
      "source": "RunEventService",
      "payloadShape": ["id", "type", "title", "detail", "level", "entityId", "createdAt"]
    },
    {
      "kind": "subagent_task",
      "status": "deliberately_avoided",
      "source": "Dispatcher intents / future background jobs"
    }
  ],
  "normalizedEvents": [
    { "kind": "worker_task", "title": "Intent claimed", "level": "info", "source": "intent.claimed" }
  ],
  "operatorNextActions": ["Use normalized events as the future WebSocket/SSE contract for live operator progress."],
  "audit": {
    "readOnly": true,
    "opensStreams": false,
    "dispatchesWorkers": false,
    "startsSandbox": false,
    "runsCommands": false,
    "mutatesSessionState": false,
    "readsRawEvidence": false
  }
}
```

## GET /runs/{id}/workbench

Returns the Agent Workbench read model for one run. It combines progress, graph state, assessment flow, strategy recommendations, attack-surface frontier, Tool Gateway blockers, evidence review state, finding validation state, and recent events into one operator-facing view.

This endpoint is read-only. It does not dispatch Workers, execute tools, approve actions, change scope, validate findings, generate reports, or read raw evidence blobs. Its `nextActions` point back to existing Dispatcher, Autopilot, Tool Gateway, evidence review, finding validation, and report APIs.

```json
{
  "runId": "run_x",
  "phase": "queued",
  "summary": "Phase: queued. 1 queued intent(s), 0 active intent(s). 2 evidence item(s), 1 awaiting review.",
  "counts": {
    "workers": 2,
    "openIntents": 1,
    "claimedIntents": 0,
    "unreviewedEvidence": 1,
    "pendingApprovals": 0,
    "blockedTools": 0,
    "strategyRecommendations": 3,
    "surfaceFrontier": 4
  },
  "lanes": [
    {
      "id": "worker_loop",
      "title": "Worker Loop",
      "status": "queued",
      "items": [{ "kind": "intent", "title": "Intent: open", "status": "queued" }]
    }
  ],
  "nextActions": [{ "label": "Review http_exchange evidence", "kind": "evidence_review" }],
  "blockers": []
}
```

## GET /runs/{id}/flow

Returns an operator-facing assessment flow brief. This is a read model over the graph and audit state; it does not create stages, assign workers, or allow workers to write protocol state.

```json
{
  "runId": "run_x",
  "target": "https://app.example.com",
  "goal": "Produce an evidence-backed report",
  "phase": "reasoning",
  "summary": "Goal: Produce an evidence-backed report Current phase: reasoning 4 facts, 1 intents, 1 evidence items, 1 findings.",
  "steps": [
    {
      "kind": "intent",
      "title": "Intent proposed",
      "detail": "Check profile endpoint for evidence-backed exposure",
      "status": "done",
      "riskLevel": "R1",
      "evidenceIds": ["evidence_x"]
    }
  ],
  "nextActions": ["Generate a report bundle for the candidate findings."],
  "riskNotes": []
}
```

The Operator Console uses this endpoint for the Assessment Flow panel so a human can see the current reasoning path without reading raw evidence blobs.

## GET /runs/{id}/strategy

Returns an autonomy strategy brief for the current run. It gives the operator and future Agent Workers a small set of recommended high-level tool requests, rationale, risk levels, and Worker hints.

```json
{
  "runId": "run_x",
  "mode": "dispatcher_controlled_agent_worker",
  "summary": "0 evidence item(s), 0 active finding(s), 0 pending approval(s), 0 blocked tool call(s).",
  "recommendations": [
    {
      "id": "web.baseline_http",
      "title": "Capture baseline HTTP response",
      "riskLevel": "R1",
      "toolRequest": {
        "tool": "http.request",
        "target": "https://app.example.com",
        "method": "GET",
        "riskLevel": "R1"
      }
    }
  ],
  "workerHints": ["Prefer low-risk evidence capture before proposing findings."]
}
```

## GET /runs/{id}/search-plan

Returns a ranked state-space search plan for the current run. The plan merges pending approvals, active/queued Worker intents, evidence review needs, candidate finding validation, blocked tool calls, Strategy recommendations, Attack Surface frontier items, and report readiness into one priority queue.

This endpoint is read-only. `automation` describes which existing path could handle the item, such as Dispatcher, Strategy queueing, Tool Gateway, operator review, or reporting. It does not grant permission, dispatch Workers, invoke tools, approve actions, or create findings.

```json
{
  "mode": "dispatcher_state_space_search",
  "summary": "6 search item(s): 0 blocked, 0 active, 4 ready/queued, 2 review item(s).",
  "topItem": {
    "source": "worker_intent",
    "title": "Dispatch queued intent",
    "status": "queued",
    "automation": "dispatch",
    "score": 89,
    "riskLevel": "R1"
  },
  "counts": {
    "total": 6,
    "blocked": 0,
    "active": 0,
    "ready": 4,
    "review": 2,
    "automatable": 4
  }
}
```

## POST /runs/{id}/search-plan/advance

Advances the current Search Plan by one controlled step for an active run.

The endpoint reads the highest-priority item from `GET /runs/{id}/search-plan` and only automates items mapped to Dispatcher-owned paths:

- queued Worker intents are dispatched once through the Dispatcher
- Strategy recommendations and Attack Surface frontier items are queued as normal intents, then dispatched once
- active Worker leases return `waiting_worker`
- approvals, evidence review, finding validation, blocked tool calls, and reporting return `operator_review_required`

It never invokes raw tools directly, approves actions, validates findings, generates reports, or lets Workers write graph state.

```json
{
  "runId": "run_x",
  "status": "queued_and_dispatched",
  "item": {
    "source": "surface_frontier",
    "title": "Map links and forms",
    "automation": "tool_gateway",
    "riskLevel": "R1"
  },
  "intentId": "intent_x",
  "dispatch": {
    "status": "dispatched",
    "intentId": "intent_x",
    "worker": "mock-worker"
  }
}
```

## GET /runs/{id}/surface

Returns a read-only attack surface map for the current run. It is derived from graph state, evidence metadata, browser/HAR captures, scanner-template outputs, Android/SARIF/Cloud IAM/Identity imports, connector mappings, approvals, and strategy recommendations.

It does not execute tools, read raw evidence content into the response, create approvals, create findings, queue intents, or allow Agent Workers to write state. Evidence is referenced by id only.

```json
{
  "runId": "run_x",
  "target": "https://app.example.com/",
  "summary": "https://app.example.com/ has 3 asset(s) and 6 observed endpoint(s).",
  "assets": [
    {
      "kind": "url",
      "label": "https://app.example.com/login",
      "riskLevel": "R1",
      "evidenceIds": ["evidence_x"],
      "signals": ["Observed via scanner_template"]
    }
  ],
  "endpoints": [
    {
      "method": "GET",
      "url": "https://app.example.com/login",
      "source": "scanner_template",
      "evidenceIds": ["evidence_x"]
    }
  ],
  "technologies": ["server: nginx"],
  "blockers": ["Pending approval for oast.record_callback R3 on https://app.example.com/."],
  "frontier": [
    {
      "title": "Map links and forms",
      "rationale": "Only the target entrypoint is visible; collect a bounded link/form map before deeper validation.",
      "priority": "high",
      "riskLevel": "R1",
      "source": "evidence_gap",
      "suggestedTool": "scanner.run_template",
      "suggestedTemplate": "web.link_form_map"
    }
  ]
}
```

## GET /runs/{id}/surface/frontier/{frontierId}/plan

Previews the Tool Gateway decision for an executable Attack Surface frontier item. This is read-only and has the same no-side-effect guarantees as `POST /runs/{id}/tools/plan`: no tool execution, no approvals, no rate-limit consumption, no evidence writes.

Only frontier items with a mapped high-level suggestion are executable, such as:

- `scanner.run_template` with a suggested template
- `http.request`
- `finding.propose` with related evidence ids

Frontier items without a mapped tool should be queued as Worker intent instead.

## POST /runs/{id}/surface/frontier/{frontierId}/intent

Queues a Search Frontier item as a normal open `Intent` created by the first-party Surface service.

The Worker still receives the task through the Dispatcher, and any tool requests it returns still pass through the Tool Gateway. If the frontier contains a mapped high-level tool request, the platform records it as an operator hint for the run; the Worker still does not get direct execution authority.

## POST /runs/{id}/surface/frontier/{frontierId}/invoke

Invokes an executable Search Frontier item through the Tool Gateway.

This is the direct operator action from the Attack Surface panel. It is not a shortcut around scope, approval, rate limit, audit, redaction, evidence, or finding validation. Unsupported frontier tool mappings return `400`.

## GET /runs/{id}/strategy/recommendations/{recommendationId}/plan

Previews the Tool Gateway decision for an executable strategy recommendation. This uses the same read-only response shape as `POST /runs/{id}/tools/plan`, but derives the tool request from the selected Autonomy Plan recommendation.

```http
GET /runs/run_x/strategy/recommendations/scanner.web.security_headers/plan
```

Use this before `invoke` when an operator wants to see whether a recommendation would be executable, approval-gated, rate-limited, or blocked by toolbox policy. Non-executable recommendations return `400`.

## POST /runs/{id}/strategy/recommendations/{recommendationId}/invoke

Invokes an executable strategy recommendation through the Tool Gateway. This is the one-click path from the Operator Console's Autonomy Plan panel. The request still enforces scope, risk, approval, rate-limit, audit, redaction, and evidence rules.

Non-executable recommendations return `400`.

## POST /runs/{id}/strategy/recommendations/{recommendationId}/intent

Queues a strategy recommendation as an open intent for the Dispatcher/Agent Worker loop. If the recommendation contains a tool request, the platform also records a human-readable hint with that request so the Worker can see the operator-selected direction in the graph.

## POST /runs/{id}/autopilot/tick

Runs one controlled autopilot step for an active run.

The endpoint never executes raw tools directly. It first stops for pending approvals or an active Worker lease. If a claimable intent exists, it dispatches one Dispatcher cycle. If no claimable intent exists, it selects the next automatable Strategy recommendation, queues it as an intent, and then dispatches one cycle. Non-automatable recommendations, such as human finding validation or report review, return `operator_review_required`.

```json
{
  "runId": "run_x",
  "status": "queued_and_dispatched",
  "recommendationId": "web.baseline_http",
  "recommendationTitle": "Capture baseline HTTP response",
  "intentId": "intent_x",
  "dispatch": { "status": "dispatched", "task": "explore", "worker": "mock-worker" }
}
```

## GET /skills

Returns the static Domain Skill registry. These are narrow expert modules, not generic pentest flow stages. The registry now includes aggressive enterprise assessment modules for high-risk web triage, browser/proxy runner workflow, API authorization, GraphQL/OAuth, cloud/Kubernetes/container posture, supply chain/secrets, external surface baseline, AI-agent infrastructure security, mobile, SAST, identity, and reporting.

```json
[
  {
    "id": "web.high-risk-triage",
    "name": "Aggressive Web High-Risk Triage",
    "category": "web",
    "status": "ready",
    "recommendedTools": ["http.request", "browser.navigate", "scanner.run_template", "access.compare_evidence"],
    "requiredToolboxProfiles": ["builtin.web"]
  }
]
```

## GET /runs/{id}/skills

Returns the registry with run-specific enablement state.

## GET /runs/{id}/domain-skill-readiness

Returns the read-only Domain Skill Workbench for a run. It joins enabled Skills, imported artifacts, evidence review state, candidate/confirmed findings, report bundles, and credential placeholders into per-domain readiness cards.

This endpoint does not enable Skills, import artifacts, run tools, approve actions, read raw evidence blobs, or create findings. It exists so the operator can see whether a rigid Skill has real inputs before exposing it to Agent Workers.

```json
{
  "mode": "domain_skill_readiness",
  "posture": "usable",
  "counts": {
    "skills": 15,
    "enabledSkills": 1,
    "domainArtifacts": 2,
    "domainEvidence": 3,
    "reviewedEvidence": 1
  },
  "domains": [
    {
      "skillId": "mobile.android-apk",
      "posture": "ready",
      "enabled": true,
      "inputs": [
        { "id": "android.manifest", "status": "present", "count": 1 }
      ],
      "workerHandoff": ["Included in future Agent Worker envelopes as narrow domain context."]
    }
  ]
}
```

## POST /runs/{id}/skills/{skillId}/enable

Enables a Domain Skill for a run. The platform records a run skill binding, writes an operator-visible hint, emits a `skill.enabled` event, and includes the enabled skill context in future Agent Worker protocol envelopes.

Enabling a skill does not grant new tool permissions. Worker requests still pass through scope policy, risk gates, approval checks, rate limits, audit logging, evidence handling, and finding validation.

## GET /poc-templates

Returns the curated PoC/template registry. Templates describe vulnerability classes, required evidence, recommended high-level tools, Worker hints, safety notes, references, and tags.

These templates are not a generic pentest knowledge base and they are not RAG. They are a bounded library of evidence requirements and safety constraints for specific checks such as multi-tenant authorization bypass, GraphQL field authorization, OAuth/OIDC flow review, SSRF impact triage, RCE/deserialization triage, injection impact triage, file upload/path traversal, secrets exposure, cloud storage exposure, Kubernetes/container risk, SBOM vulnerable components, exposed services, AI prompt/tool injection, role-diff IDOR review, OAST callback validation, SAST triage, and Android manifest review.

```json
[
  {
    "id": "auth.role-diff.idor",
    "name": "Role Differential IDOR Review",
    "category": "auth",
    "status": "ready",
    "vulnerabilityClasses": ["CWE-639", "CWE-862", "IDOR", "Broken Access Control"],
    "requiredEvidence": ["http_exchange", "command_output"],
    "recommendedTools": ["credential.use_placeholder", "browser.navigate", "access.compare_evidence", "finding.propose"]
  }
]
```

## GET /runs/{id}/poc-templates

Returns the registry with run-specific `enabled` state and binding metadata.

## POST /runs/{id}/poc-templates/{templateId}/enable

Enables a PoC template for a run. The platform records a run binding, writes a graph hint, emits a `poc.template.enabled` event, includes the template in future Agent Worker protocol envelopes, and surfaces the hints through `GET /runs/{id}/strategy`.

Enabling a template does not grant new tool permissions, approve risky actions, add new tools, or let Workers bypass evidence requirements. It only narrows what evidence should be collected and what safety constraints should be followed.

When a template is enabled, `GET /runs/{id}/strategy` may also return template-driven recommendations. Examples:

- role-diff templates recommend adding role credential references, collecting comparable evidence, and then using `access.compare_evidence`
- OAST templates recommend starting a local callback inbox before any approval-gated live payload validation
- scanner-backed templates recommend `scanner.run_template` requests while still relying on Tool Gateway scope, profile readiness, and approval gates

## GET /runs/{id}/workers

Returns the configured Agent Worker pool with runtime health. Desktop clients use this to show whether Claude Code, Codex, Gemini, Kimi, mock, or custom CLI workers are ready before dispatch.

```json
[
  {
    "name": "mock-worker",
    "type": "mock",
    "maxRunning": 1,
    "priority": 0,
    "commandConfigured": true,
    "healthy": true,
    "status": "healthy",
    "checkedAt": "2026-05-30T00:00:00.000Z"
  },
  {
    "name": "codex-worker",
    "type": "codex",
    "maxRunning": 1,
    "priority": 1,
    "commandConfigured": false,
    "healthy": false,
    "status": "unhealthy",
    "reason": "command is not configured"
  }
]
```

This endpoint is an observability/readiness view. It does not let workers write graph state or claim intents.

## GET /runs/{id}/worker-selection

Returns a read-only Worker selection policy preview for the run. The report infers the next Dispatcher task (`bootstrap`, `reason`, or `explore`), identifies the claimable intent when applicable, ranks the configured Worker pool, and explains why one Worker is recommended. The Dispatcher consumes the same policy for Worker ordering during `POST /runs/{id}/dispatch`; if the policy cannot be computed, it falls back to the original worker-pool order.

The rank uses runtime health, command configuration, run priority, cross-run Worker Leaderboard score, current-run task outcomes, evidence contribution, finding influence, timeout/error rate, and task/risk fit. It does not execute a Worker, claim an intent, invoke tools, approve actions, read raw evidence, or let Workers self-score.

```json
{
  "mode": "dispatcher_worker_selection_preview",
  "task": "explore",
  "intent": {
    "id": "intent_x",
    "riskLevel": "R2",
    "status": "open"
  },
  "selectedWorker": {
    "worker": "codex-worker",
    "type": "codex",
    "decision": "recommended",
    "selectionScore": 73,
    "leaderboardScore": 64,
    "successRate": 80,
    "evidenceContributed": 3,
    "findingsInfluenced": 1
  },
  "counts": {
    "configuredWorkers": 2,
    "healthyWorkers": 2,
    "eligibleWorkers": 2,
    "blockedWorkers": 0,
    "evidenceProducingWorkers": 1
  },
  "policy": {
    "safetyNotes": [
      "Read-only preview: no Worker execution, no intent claim, no graph write, no approval decision, and no tool invocation."
    ]
  }
}
```

## GET /runs/{id}/worker-evaluation-plan

Returns a read-only CAI/Apex-style Agent Worker evaluation plan for the current run. It measures whether configured Workers have comparable `bootstrap`, `reason`, and `explore` trace cells, whether they produce evidence-linked facts, whether they influence findings, and what same-scope bakeoff experiments should be run next.

The endpoint does not execute Workers, claim intents, call tools, approve actions, read raw evidence blobs, or let Workers self-score.

```json
{
  "mode": "agent_worker_evaluation_plan",
  "readiness": "needs_warmup",
  "counts": {
    "configuredWorkers": 2,
    "coveredTaskCells": 3,
    "totalTaskCells": 6,
    "evidenceProducingWorkers": 1
  },
  "workers": [
    {
      "worker": "codex-worker",
      "readiness": "needs_warmup",
      "score": 62,
      "tasksByKind": { "bootstrap": 1, "reason": 1, "explore": 0 }
    }
  ],
  "experiments": [
    {
      "id": "same_scope_low_risk_bakeoff",
      "status": "ready",
      "task": "mixed"
    }
  ]
}
```

## GET /runs/{id}/execution-node

Returns the local-first execution node readiness view for a run. It aggregates Worker runtime health, Toolbox profiles, Toolbox Doctor adapter status, browser/proxy/OAST sessions, enabled bundles/connectors, fail-closed external execution policy, safety gates, and operator actions.

This endpoint is read-only. It does not start sessions, execute tools, pull containers, change environment policy, approve actions, dispatch Workers, or grant any new Worker permissions.

```json
{
  "nodeId": "local.execution.node",
  "mode": "local_first_control_plane",
  "status": "partial",
  "summary": "1/1 Worker runtime(s), 19/28 runnable scanner template(s), 2 active local session(s).",
  "counts": {
    "profiles": 5,
    "availableProfiles": 2,
    "adapters": 9,
    "readyAdapters": 1,
    "scannerTemplates": 28,
    "runnableScannerTemplates": 10,
    "workers": 1,
    "healthyWorkers": 1,
    "activeBrowserSessions": 1,
    "activeProxySessions": 1,
    "activeOastSessions": 0
  },
  "gates": [
    {
      "id": "tool_gateway_only",
      "status": "pass",
      "detail": "Workers can request high-level tools, but all execution still goes through scope, approval, audit, redaction, and evidence gates."
    }
  ],
  "recommendedActions": [
    "Start an OAST inbox only for approved out-of-band validation scenarios."
  ]
}
```

## GET /runs/{id}/desktop-readiness

Returns the desktop productization readiness view for a run. It turns the AIDA/WonderSuite-style app gap into concrete components: Web Console, Tauri shell, Rust local daemon, browser controller, MITM proxy/local CA, credential vault bridge, toolbox runtime manager, evidence viewer/replay, redacted cloud sync, and remote worker nodes.

This endpoint is read-only. It does not scaffold Tauri, install certificates, start browsers, start proxies, execute tools, resolve secrets, sync evidence, dispatch Workers, or grant permissions.

```json
{
  "mode": "desktop_runner_readiness",
  "status": "partial",
  "summary": "2 ready, 3 partial, 5 planned desktop component(s). 1 active local session(s), 19 runnable scanner template(s), 4 evidence item(s).",
  "counts": {
    "components": 10,
    "ready": 2,
    "partial": 3,
    "planned": 5,
    "activeLocalSessions": 1,
    "evidenceItems": 4,
    "credentialReferences": 2,
    "runnableScannerTemplates": 0,
    "healthyWorkers": 1,
    "commercialDesktopGaps": 5
  },
  "components": [
    {
      "id": "desktop.mitm_proxy",
      "name": "MITM Proxy and Local CA",
      "status": "planned",
      "ownerSurface": "Proxy Session Service / Rust Daemon",
      "missingPieces": ["local CA generation", "certificate trust workflow", "TLS interception"],
      "securityGates": ["operator approval before CA install", "scope match before storing traffic", "raw traffic local-only by default"]
    }
  ],
  "handoffContracts": [
    {
      "id": "contract.proxy_evidence",
      "name": "MITM proxy -> Evidence Engine",
      "producer": "Scoped Proxy",
      "consumer": "Evidence Engine",
      "contract": ["request/response metadata", "redaction state", "scope decision"],
      "mustNotDo": ["capture denied assets", "install a CA without operator consent", "sync raw traffic by default"]
    }
  ]
}
```

## GET /runs/{id}/local-runner-workbench

Returns the run-scoped local Runner workbench. It is the operator-facing layer over capture profiles, browser sessions, proxy sessions, OAST inboxes, capture imports, evidence review, credential references, and proxy setup guidance. It is designed for the commercial desktop/web console flow: the operator can see which capture mode is usable, which headers/proxy settings are required, which evidence still needs review, and what action should happen next.

This endpoint is read-only. It does not start sessions, execute tools, forward proxy traffic, import HAR files, review evidence, validate findings, install certificates, generate PAC files, sync evidence, or grant Worker permissions. Use `POST /runs/{id}/local-runner-workbench/prepare` when the operator wants to create the low-risk local browser/proxy session records from the same panel.

```json
{
  "mode": "local_runner_workbench",
  "status": "partial",
  "summary": "1 active browser session(s), 1 active proxy session(s), 4 evidence item(s), 2/4 reviewed.",
  "counts": {
    "activeBrowserSessions": 1,
    "activeProxySessions": 1,
    "activeOastSessions": 0,
    "browserSnapshots": 1,
    "captureImports": 1,
    "httpExchangeEvidence": 3,
    "screenshotEvidence": 1,
    "totalEvidence": 4,
    "reviewedEvidence": 2,
    "usefulEvidence": 1,
    "rawLocalOnlyEvidence": 1,
    "cloudSafeEvidence": 3,
    "activeCredentialReferences": 2
  },
  "proxySetup": {
    "status": "active",
    "proxyUrl": "http://127.0.0.1:4317",
    "requiredHeaders": {
      "X-Capture-Run-Id": "run_x",
      "X-Platform-Token": "<local token>"
    },
    "pac": {
      "status": "planned",
      "detail": "PAC generation and automatic browser proxy profile switching are planned for the desktop shell."
    }
  },
  "captureProfiles": [
    {
      "id": "capture.header_proxy_http",
      "title": "Header-capable HTTP proxy capture",
      "status": "ready",
      "riskLevel": "R1",
      "entrypoints": [
        "POST /runs/{id}/local-runner-workbench/prepare",
        "HTTP proxy absolute-form request with X-Capture-Run-Id"
      ],
      "safetyGates": ["active proxy session", "ScopePolicy target check before forwarding"]
    }
  ],
  "captureGates": [
    {
      "id": "gate.evidence_review",
      "title": "Human evidence review",
      "status": "pass",
      "detail": "2/4 evidence item(s) reviewed; 1 useful."
    }
  ],
  "recentEvidence": [
    {
      "id": "evidence_x",
      "kind": "http_exchange",
      "reviewStatus": "useful",
      "source": "proxy",
      "target": "https://app.example.com/profile"
    }
  ]
}
```

## POST /runs/{id}/local-runner-workbench/prepare

Prepares the run-local capture workspace by creating a browser session and proxy session when they are missing. By default it does not start OAST, does not navigate the browser, does not forward traffic, does not execute tools, and does not grant Worker permissions. It is meant to make the AIDA/WonderSuite-style workbench usable while keeping active testing behind the existing capture and Tool Gateway APIs.

Optional request body:

```json
{
  "includeBrowser": true,
  "includeProxy": true,
  "includeOast": false
}
```

Example response:

```json
{
  "status": "prepared",
  "runId": "run_x",
  "created": {
    "browserSessionId": "browsersession_x",
    "proxySessionId": "proxysession_x"
  },
  "skipped": [
    "OAST session not started by Prepare Runner; use it only for approved out-of-band validation."
  ],
  "workbench": {
    "mode": "local_runner_workbench",
    "counts": {
      "activeBrowserSessions": 1,
      "activeProxySessions": 1
    }
  }
}
```

## GET /runs/{id}/worker-envelope/preview

Returns the exact `agent-worker.v1` protocol envelope that would be sent to an Agent Worker for a run. The optional `task` query parameter accepts `auto`, `bootstrap`, `reason`, or `explore`; `auto` follows the Dispatcher task-selection shape without performing a healthcheck, claiming an intent, executing a Worker, or writing state.

```http
GET /runs/run_x/worker-envelope/preview?task=auto
```

Example response:

```json
{
  "task": "explore",
  "selectedBy": "auto",
  "selectionSource": "policy",
  "selectedWorker": {
    "name": "codex-worker",
    "type": "codex",
    "commandConfigured": true
  },
  "intentId": "intent_x",
  "claimWouldOccur": true,
  "contextCounts": {
    "domainSkills": 1,
    "credentialReferences": 2,
    "pocTemplates": 1,
    "toolboxBundles": 1,
    "connectors": 1,
    "toolSurface": 9,
    "strategyHints": 12,
    "strategyRecommendations": 1
  },
  "safety": {
    "rawSecretsIncluded": false,
    "rawEvidenceContentIncluded": false,
    "writesState": false,
    "executesWorker": false
  },
  "envelope": {
    "protocolVersion": "agent-worker.v1",
    "role": "agentred-worker"
  }
}
```

Use this endpoint for framework debugging, desktop explainability, Worker runtime comparison, and operator review of the actual tool/Skill/PoC/Bundle context before a dispatch.

## GET /agent-framework

Returns the read-only framework capability model used by the Operator Console. It describes the kernel, Worker adapter contract, extension points, safety invariants, and operator views that make the platform an extensible Agent Worker framework rather than a fixed multi-agent script.

It does not dispatch workers, execute tools, create approvals, read raw evidence, or mutate run state.

```json
{
  "kernel": {
    "schedulingUnit": "Agent Worker",
    "orchestration": "Dispatcher-controlled state-space search; no worker-to-worker protocol.",
    "protocolVersion": "agent-worker.v1",
    "stateModel": ["Run", "Fact", "Intent", "Evidence", "Finding"]
  },
  "counts": {
    "workerAdapters": 5,
    "highLevelTools": 9,
    "scannerTemplates": 28,
    "domainSkills": 7,
    "pocTemplates": 7
  },
  "extensionPoints": [
    {
      "id": "worker.adapter",
      "name": "Agent Worker Adapter",
      "status": "ready",
      "executionAuthority": "No direct graph writes; Dispatcher owns claims, conclusions, and validation."
    }
  ]
}
```

## GET /runs/{id}/agent-harness

Returns a run-scoped Agent Harness readiness report inspired by ai-engineering-from-scratch-style agent engineering. It scores the platform as an agent framework over agent loop contract, tool registry/schema gates, sandbox runner, observation budget, eval harness, workbench handoff, and evidence delivery.

This endpoint is read-only. It does not dispatch Workers, invoke tools, approve actions, change scope, read raw evidence, or grant runtime authority.

```json
{
  "mode": "agent_harness_readiness",
  "posture": "usable",
  "score": 68,
  "counts": {
    "cells": 7,
    "highLevelTools": 9,
    "scannerTemplates": 28,
    "toolPacks": 4,
    "workerSpans": 3,
    "evidence": 2,
    "evaluations": 1
  },
  "cells": [
    {
      "id": "tool_registry_schema",
      "title": "Tool registry and schema gates",
      "status": "ready",
      "score": 90,
      "referencePrinciple": "Tools should be registered, schema-shaped, and observable instead of passed as ad hoc functions.",
      "nextAction": "Convert top external ecosystem gaps into scanner templates or Tool Packs with explicit policy records."
    }
  ],
  "evalPlan": {
    "mode": "agent_harness_eval_plan",
    "summary": "4/7 harness fixture(s) are ready; 2 waiting for run data, 1 need setup, 0 blocked.",
    "counts": {
      "fixtures": 7,
      "ready": 4,
      "acceptanceCriteria": 21,
      "safetyGates": 15
    }
  }
}
```

## GET /runs/{id}/agent-harness/plan

Returns the no-side-effect Agent Harness evaluation plan. This converts the rohitg00/ai-engineering-from-scratch lessons into platform fixture tasks: agent loop trace, tool registry schema validation, sandbox fail-closed boundary, observation budget, Worker evaluation, workbench handoff/resume, and evidence delivery.

The plan is read-only. It does not dispatch Workers, invoke tools, create approvals, mutate scope, activate toolbox profiles, or read raw evidence content.

```json
{
  "mode": "agent_harness_eval_plan",
  "posture": "usable",
  "counts": {
    "fixtures": 7,
    "ready": 4,
    "waitingForData": 2,
    "needsSetup": 1,
    "blocked": 0
  },
  "observationBudget": {
    "maxAutomaticRisk": "R2",
    "manualApprovalRisk": "R3",
    "forbiddenRisk": "R4",
    "requestsPerMinute": 120
  },
  "fixtures": [
    {
      "id": "agent_loop_low_risk_trace",
      "title": "Low-risk agent loop trace",
      "riskLevel": "R1",
      "status": "waiting_for_data",
      "expectedArtifacts": ["worker trace spans", "run events", "fact/intent graph updates"]
    }
  ],
  "acceptanceGates": [
    "Scope violation must remain zero.",
    "Finding creation requires same-run evidence."
  ],
  "readOnlyGuarantees": [
    "GET /runs/{id}/agent-harness/plan does not dispatch Workers."
  ]
}
```

## GET /worker-leaderboard

Returns a cross-run Agent Worker leaderboard. The report compares configured Worker runtimes by platform evidence: worker trace spans, cost ledger entries, graph facts, evidence ids attached to those facts, and findings influenced by that evidence.

This endpoint is read-only. It does not dispatch Workers, change priorities, approve actions, read raw prompts, read raw evidence blobs, or let Workers self-report quality.

```json
{
  "mode": "cross_run_agent_worker_eval",
  "summary": "2/3 configured Worker slot(s) have runtime evidence across 4 run(s). 12 worker task(s), 5 evidence link(s), 1 influenced finding(s).",
  "counts": {
    "runs": 4,
    "configuredWorkers": 3,
    "exercisedWorkers": 2,
    "workerTasks": 12,
    "evidenceContributed": 5,
    "findingsInfluenced": 1
  },
  "workers": [
    {
      "worker": "codex-worker",
      "type": "codex",
      "successRate": 83,
      "timeoutRate": 0,
      "evidenceContributed": 4,
      "findingsInfluenced": 1,
      "score": 76,
      "recommendation": "promote"
    }
  ],
  "safetyNotes": [
    "Leaderboard recommendations do not bypass Dispatcher selection, scope policy, approvals, Tool Gateway checks, or evidence requirements."
  ]
}
```

## GET /runs/{id}/observability

Returns trace spans, local runtime/cost ledger entries, and the latest run-quality evaluation.

```json
{
  "runId": "run_x",
  "counts": { "spans": 4, "errors": 0, "blocked": 0, "approvalRequired": 0 },
  "duration": { "totalMs": 1240 },
  "cost": { "totalEstimatedUsd": 0, "localRuntimeMs": 1240 },
  "latestEvaluation": {
    "score": 100,
    "grade": "A"
  }
}
```

The first commercial version uses local runtime and request counts as a cost ledger. Real model token/cost adapters can extend this without changing the worker protocol.

## GET /runs/{id}/capability-radar

Returns a run-level capability posture for commercial operation and Worker scheduling decisions. The radar merges current run state across scope safety, evidence depth, autonomous progress, Worker performance, Tool Gateway usage, rigid domain depth, delivery readiness, and trace/cost observability.

This endpoint is read-only. It does not queue intents, dispatch Workers, invoke tools, approve actions, review evidence, validate findings, or generate reports.

```json
{
  "runId": "run_x",
  "overallScore": 64,
  "posture": "usable",
  "summary": {
    "workersConfigured": 2,
    "workerTasks": 4,
    "toolCalls": 6,
    "blockedToolCalls": 1,
    "evidence": 5,
    "findings": 1,
    "confirmedFindings": 0,
    "pendingApprovals": 0,
    "enabledDomainSkills": 1,
    "enabledPocTemplates": 2,
    "traceSpans": 11
  },
  "dimensions": [
    {
      "id": "evidence_depth",
      "title": "Evidence depth",
      "score": 72,
      "status": "usable",
      "detail": "5 evidence item(s), 4 reviewed, 3 marked useful."
    }
  ],
  "schedulingHints": [
    "Next capability investment: Delivery readiness."
  ]
}
```

## GET /runs/{id}/scorecard

Returns a product-facing scorecard derived from the observability ledger, tool audit, evidence, findings, approvals, and latest evaluation. This is the API for CAI-style model/tool comparison without exposing raw prompts or tool output.

## GET /runs/{id}/evidence-quality

Returns a read-only commercial evidence-quality index. It scores local evidence metadata across blob integrity, operator review, safe replay/reproduction support, redaction readiness, finding linkage, and confirmed-finding delivery gates.

This endpoint does not read or return raw evidence content, replay traffic, mark reviews, validate findings, generate reports, or mutate run state.

```json
{
  "runId": "run_x",
  "mode": "evidence_quality_index",
  "score": 76,
  "posture": "usable",
  "counts": {
    "evidence": 5,
    "usefulEvidence": 3,
    "replayableEvidence": 2,
    "redactionReadyEvidence": 4,
    "confirmedFindings": 1,
    "confirmedDeliveryReadyFindings": 1
  },
  "dimensions": [
    {
      "id": "reproduction",
      "title": "Replay and reproduction",
      "score": 80,
      "status": "pass"
    }
  ],
  "findingGates": [
    {
      "findingId": "finding_x",
      "deliveryReady": true,
      "usefulEvidence": 2,
      "reproductionEvidence": 1
    }
  ]
}
```

## GET /runs/{id}/delivery-readiness

Returns a commercial handoff readiness view derived from existing local state. It checks whether approvals are cleared, evidence has been triaged, confirmed findings satisfy the useful-evidence gate, the latest report uses a customer-safe scope, and blocked tool calls have been reviewed.

The response is a read model only. It does not create findings, approve actions, change report scope, or mutate Worker state.

```json
{
  "runId": "run_x",
  "quality": { "score": 75, "grade": "B", "source": "latest_evaluation" },
  "summary": {
    "evidence": 3,
    "findings": 1,
    "toolCalls": 5,
    "blockedToolCalls": 1,
    "totalRuntimeMs": 1200
  },
  "workerCards": [{ "worker": "mock-worker", "tasks": 3, "ok": 3, "avgRuntimeMs": 24 }],
  "workerComparisons": [
    {
      "worker": "codex-worker",
      "type": "codex",
      "configured": true,
      "tasks": 4,
      "successRate": 75,
      "evidenceContributed": 2,
      "findingsInfluenced": 1,
      "recommendation": "Keep in the active pool for evidence-producing work."
    }
  ],
  "toolCards": [{ "tool": "browser.navigate", "calls": 1, "allowed": 1, "evidenceProduced": 1 }],
  "recommendations": ["Inspect blocked tool calls to tune scope, profile readiness, or approval policy."]
}
```

`workerComparisons` are derived from worker trace spans, local cost ledger entries, graph facts, evidence links, and findings. They let the operator compare Agent Worker usefulness without reading raw prompts or letting workers self-report quality.

## GET /runs/{id}/enterprise-scorer

Returns a read-only fixed-scenario scorer for aggressive enterprise pentest readiness. It evaluates whether a run is prepared to identify high-risk vulnerabilities across scope safety, high-risk template bias, typed tool governance, browser/proxy runner readiness, evidence quality, authorization depth, OAST readiness, external scanner adapter governance, vulnerability lifecycle, AI-agent security, and stuck-loop supervision.

The scorer does not invoke tools, dispatch Workers, approve actions, mutate run state, or read raw evidence blobs. Blocked raw-tool attempts are counted as governance evidence; confirmed high/critical findings still require useful-reviewed same-run evidence.

```json
{
  "mode": "enterprise_pentest_scorer",
  "posture": "usable",
  "score": 72,
  "summary": "6/11 enterprise pentest scenario(s) pass; 6 high-risk template(s), 8 high-risk recommendation(s), 1 confirmed high/critical finding(s).",
  "counts": {
    "enabledHighRiskTemplates": 6,
    "highRiskRecommendations": 8,
    "usefulEvidence": 4,
    "confirmedHighOrCriticalFindings": 1,
    "blockedUnsafeTools": 1
  },
  "scenarios": [
    {
      "id": "authz_depth",
      "status": "pass",
      "objective": "Verify enterprise-critical broken access control with at least two role contexts and comparable evidence.",
      "gaps": []
    }
  ],
  "audit": {
    "readOnly": true,
    "invokesTools": false,
    "createsApprovals": false,
    "mutatesRunState": false,
    "readsRawEvidence": false
  }
}
```

## GET /runs/{id}/vulnerability-lifecycle

Returns a read-only vulnerability lifecycle view for enterprise pentest delivery. It joins findings, evidence-quality gates, duplicate detection, report bundles, and run exports so operators can see whether high/critical issues have moved from candidate intake to validation, confirmed-only delivery, and retest readiness.

The lifecycle view does not confirm findings, reject findings, read raw evidence blobs, invoke tools, generate reports, or generate exports. It only reports what the existing evidence, finding, report, and export records already prove.

```json
{
  "mode": "vulnerability_lifecycle",
  "posture": "triage",
  "score": 72,
  "summary": "1/2 high/critical finding(s) confirmed; 1 high/critical finding(s) delivery-ready; 1 report bundle(s), 0 export(s), 1 duplicate group(s).",
  "counts": {
    "findings": 3,
    "candidate": 1,
    "confirmed": 1,
    "highOrCritical": 2,
    "confirmedHighOrCritical": 1,
    "confirmedHighOrCriticalDeliveryReady": 1,
    "duplicateGroups": 1,
    "reportBundles": 1,
    "confirmedOnlyExports": 0
  },
  "lanes": [
    {
      "id": "delivery",
      "title": "Report and export delivery",
      "status": "warn",
      "detail": "1/1 confirmed finding(s) delivery-ready; 1 report bundle(s), 0 confirmed-only export(s)."
    }
  ],
  "findings": [
    {
      "findingId": "finding_x",
      "severity": "critical",
      "phase": "delivery",
      "deliveryReady": true,
      "usefulEvidence": 1,
      "reproductionEvidence": 1
    }
  ],
  "audit": {
    "readOnly": true,
    "mutatesFindings": false,
    "validatesFindings": false,
    "generatesReports": false,
    "invokesTools": false,
    "readsRawEvidence": false
  }
}
```

## GET /runs/{id}/reference-benchmark

Returns a read-only benchmark view that compares the current platform/run capability against the reference projects used for product direction: Cairn, HexStrike/AutoRedTeam, ZAP/Burp/Playwright, Nuclei/Semgrep/Prowler/MobSF, CAI/Apex, LangGraph/OpenAI Agents SDK/PyRIT, AIDA/CyberStrike/WonderSuite, DefectDojo/Faraday/Dradis, DragonJAR Android Skill, pentest-agents, and rohitg00/ai-engineering-from-scratch.

The response is a product roadmap gate, not an execution path. It shows copied principles, deliberately avoided patterns, remaining gaps, commercial blockers, and next build actions.

```json
{
  "mode": "reference_project_benchmark",
  "summary": "8/14 benchmark dimension(s) are commercially usable or better; 5 partial and 1 gap dimension(s) remain against the reference projects.",
  "counts": {
    "referenceProjects": 11,
    "dimensions": 14,
    "matched": 2,
    "usable": 6,
    "partial": 5,
    "gaps": 1,
    "commercialBlockers": 6
  },
  "dimensions": [
    {
      "id": "browser_proxy_dast",
      "title": "Browser, proxy, and DAST workflow",
      "status": "partial",
      "score": 48,
      "referenceProjects": ["OWASP ZAP", "Burp Suite", "Playwright"],
      "ours": "1 browser session(s), 1 proxy session(s), 2 HTTP exchange evidence item(s), 1 browser snapshot(s).",
      "adopted": ["Scope-gated HTTP capture", "HAR import boundary", "Proxy session records", "Browser snapshot evidence"],
      "gaps": ["No true browser DOM/JavaScript automation, authenticated context manager, active spider, or TLS MITM local CA lifecycle yet."],
      "nextActions": ["Promote browser/proxy capture into a Playwright-backed local runner with ZAP/Burp-style session and proxy controls."]
    }
  ],
  "projects": [
    {
      "id": "defectdojo_faraday_dradis",
      "name": "OWASP DefectDojo / Faraday / Dradis",
      "referenceRole": "Vulnerability management, collaboration, retest, and customer reporting lifecycle.",
      "copiedPrinciples": ["Findings need evidence and validation state", "Reports are delivery artifacts, not raw logs"],
      "deliberatelyAvoided": ["Treating every scanner observation as a customer-facing vulnerability"],
      "currentFit": "partial",
      "remainingGap": "No mature deduplication, retest workflow, SLA tracking, customer engagement model, or editable report template library yet."
    }
  ],
  "nextActions": ["Split the snapshot store into explicit relational tables and migrations before introducing multi-user collaboration or cloud sync."]
}
```

This endpoint does not browse GitHub, invoke reference projects, execute tools, register templates, change policy, or grant Worker permissions.

## GET /tool-catalog

Returns the governed high-level tool surface exposed by the local kernel. This is intentionally smaller than a raw MCP tool dump; Agent Workers and UI clients see categories, risk level, evidence behavior, and scanner templates, while concrete engines stay behind the Tool Gateway.

```json
[
  {
    "name": "scanner.run_template",
    "category": "scanner",
    "defaultRiskLevel": "R2",
    "producesEvidence": true,
    "templates": [
      {
        "id": "web.security_headers",
        "name": "Web Security Headers",
        "defaultRiskLevel": "R2",
        "evidenceKind": "command_output"
      },
      {
        "id": "web.endpoint_discovery",
        "name": "Web Endpoint Discovery",
        "defaultRiskLevel": "R2",
        "evidenceKind": "command_output"
      },
      {
        "id": "web.technology_fingerprint",
        "name": "Web Technology Fingerprint",
        "engine": "builtin",
        "profileId": "builtin.web",
        "adapterStatus": "available",
        "defaultRiskLevel": "R1",
        "evidenceKind": "command_output"
      },
      {
        "id": "web.nuclei.safe_templates",
        "name": "Nuclei Safe Templates",
        "engine": "nuclei",
        "profileId": "container.web-recon",
        "adapterStatus": "planned",
        "defaultRiskLevel": "R2",
        "evidenceKind": "command_output"
      }
    ]
  }
]
```

## GET /tool-packs

Returns governed evidence collection packs. A pack is not a new Agent role and not a raw tool dump; it is a small ordered set of high-level Tool Gateway requests with operator-facing safety notes and commercial use cases.

Built-in packs:

- `pack.web.baseline`: technology fingerprint, cookie flags, link/form map, security headers, and well-known endpoint discovery
- `pack.web.client-surface`: CORS policy, CSP/browser-policy analysis, and JavaScript asset inventory without executing JavaScript or downloading source maps
- `pack.web.modern-surface`: security.txt policy, cookie scope analysis, WebSocket discovery planning, and source-map exposure planning without WebSocket connections or source-map body downloads
- `pack.web.api-auth-surface`: OpenAPI discovery, OAuth/OIDC metadata, GraphQL introspection planning, redirect policy, and cache policy without API operation execution, token exchange, or GraphQL introspection queries
- `pack.network.baseline`: passive DNS records and one TLS certificate metadata handshake

```json
[
  {
    "id": "pack.web.baseline",
    "name": "Web Baseline Evidence Pack",
    "category": "web",
    "requests": [
      {
        "id": "web.technology_fingerprint",
        "tool": "scanner.run_template",
        "riskLevel": "R1",
        "args": { "template": "web.technology_fingerprint", "timeoutMs": 10000 }
      }
    ],
    "safetyNotes": ["Every step is a high-level Tool Gateway request."]
  }
]
```

## POST /runs/{id}/tool-packs/{packId}/plan

Previews every step in a Tool Pack by calling the same `ToolGateway.preview` path used by individual tool previews. This route has no side effects: it does not create invocations, approvals, rate-limit entries, or evidence.

```json
{
  "target": "https://app.example.com"
}
```

Response:

```json
{
  "runId": "run_x",
  "pack": { "id": "pack.web.baseline", "name": "Web Baseline Evidence Pack" },
  "summary": { "total": 5, "executable": 5, "blocked": 0, "approvalRequired": 0 },
  "audit": { "previewWritesState": false, "invokesTools": false, "writesEvidence": false },
  "items": [
    {
      "request": { "id": "web.security_headers", "riskLevel": "R2" },
      "preview": { "status": "executable", "gates": [] }
    }
  ]
}
```

## POST /runs/{id}/tool-packs/{packId}/invoke

Runs every step in the pack through `ToolGateway.invoke`. Each step is still independently scope-checked, rate-limited, approval-gated, audited, redacted, and evidence-gated. A pack run stores a `ToolPackRun` summary for review.

```json
{
  "target": "https://app.example.com"
}
```

Response:

```json
{
  "pack": { "id": "pack.web.baseline" },
  "runRecord": {
    "id": "toolpack_run_x",
    "status": "completed",
    "total": 5,
    "allowed": 5,
    "blocked": 0,
    "approvalRequired": 0,
    "evidenceIds": ["evidence_x"],
    "items": [
      { "requestId": "web.security_headers", "status": "allowed", "evidenceId": "evidence_x" }
    ]
  }
}
```

## GET /runs/{id}/tool-pack-runs

Lists persisted Tool Pack runs for the run, newest first. The same records are included in `GET /runs/{id}/review` for the Operator Console.

## GET /scanner-template-policies

Returns the governance policy for every scanner template. This is the contract used by the Tool Gateway and Toolbox Runner to keep template execution bounded.

```json
[
  {
    "templateId": "web.security_headers",
    "defaultRiskLevel": "R2",
    "allowedRiskLevels": ["R2", "R3"],
    "requiresApproval": false,
    "maxTimeoutMs": 10000,
    "executionMode": "builtin",
    "profileId": "builtin.web",
    "engine": "builtin",
    "externalExecutionFailClosed": false,
    "inputPolicy": ["Target URL host must match ScopePolicy."],
    "executionControls": ["Tool Gateway enforces scope, method, risk, approval, rate-limit, audit, redaction, and evidence gates."],
    "evidencePolicy": ["Evidence kind: command_output."]
  }
]
```

If a request uses a risk level outside `allowedRiskLevels`, `scanner.run_template` is blocked before execution. Requested timeouts are capped to `maxTimeoutMs` in the execution plan.

## GET /toolbox-policy

Returns the local external-tool execution policy. This is the operator-visible gate between registered tool ecosystems and actual execution.

```json
{
  "externalExecutionEnabled": false,
  "allowAllExternalTemplates": false,
  "allowedExternalTemplates": [],
  "containerProfileProbeEnabled": false,
  "localSastProbeEnabled": false,
  "androidToolboxProbeEnabled": false,
  "safetyControls": [
    "External execution requires PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1.",
    "External scanner templates require PLATFORM_ALLOWED_SCANNER_TEMPLATES allowlist membership."
  ]
}
```

External scanner templates require both:

- `PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1`
- `PLATFORM_ALLOWED_SCANNER_TEMPLATES=<template ids>` or `*`

Example:

```bash
PLATFORM_ALLOWED_SCANNER_TEMPLATES=web.nuclei.safe_templates,web.httpx.fingerprint
```

## GET /toolbox-doctor

Returns a read-only readiness report for the governed toolbox ecosystem. It groups scanner templates by engine, shows runnable and blocked template ids, maps policy/profile blockers, summarizes bundle readiness, and suggests operator actions.

This is a diagnostic view only. It does not execute commands, start containers, pull images, create approvals, change allowlists, grant Worker permissions, or bypass scope and evidence gates.

```json
{
  "summary": "2 ready adapter(s), 1 partial, 7 blocked/planned. 19/28 scanner template(s) are currently runnable.",
  "counts": {
    "adapters": 10,
    "ready": 2,
    "partial": 1,
    "policyBlocked": 6,
    "profileBlocked": 1,
    "planned": 0,
    "templates": 18,
    "runnableTemplates": 8,
    "blockedTemplates": 10
  },
  "adapters": [
    {
      "engine": "nuclei",
      "status": "policy_blocked",
      "templateIds": ["web.nuclei.safe_templates"],
      "runnableTemplateIds": [],
      "blockedReasons": ["External toolbox execution is disabled by policy."]
    }
  ],
  "safetyNotes": ["Toolbox Doctor is a read-only diagnostic view."]
}
```

## GET /runs/{id}/runtime-activation-plan

Returns a read-only activation sequence for making governed external tool runtimes usable. It converts Toolbox Doctor policy/profile blockers into operator-facing steps for external execution policy, runtime profiles, scanner-template allowlists, run-level Toolbox Bundle context, validation, and safety invariants.

The endpoint does not set environment variables, install tools, pull containers, enable bundles, allowlist templates, execute tools, approve risk, or grant Worker permissions.

```json
{
  "mode": "governed_runtime_activation_plan",
  "summary": "19/28 scanner template(s) runnable. 2/10 adapter(s) ready; 5 operator action(s), 1 blocked step(s).",
  "counts": {
    "profiles": 6,
    "availableProfiles": 2,
    "adapters": 10,
    "readyAdapters": 2,
    "policyBlockedAdapters": 6,
    "profileBlockedAdapters": 1,
    "templates": 18,
    "runnableTemplates": 7,
    "blockedTemplates": 11,
    "activationSteps": 9,
    "operatorActions": 5,
    "blockedSteps": 1,
    "enabledBundles": 0
  },
  "steps": [
    {
      "kind": "policy",
      "status": "operator_action",
      "title": "Decide external toolbox execution policy",
      "environment": { "PLATFORM_ALLOW_EXTERNAL_TOOLBOX": "0 -> 1 on trusted local runners only" },
      "acceptanceCriteria": ["Operator explicitly decides whether this local runner is allowed to execute external tools."],
      "safetyControls": ["trusted local runner only", "Tool Gateway remains mandatory"]
    }
  ],
  "recommendedOrder": [
    "Decide external toolbox execution policy",
    "Make runtime profile container.web-recon available",
    "Allowlist nuclei scanner templates"
  ]
}
```

## GET /toolbox-bundles

Returns productized toolbox manifests. A bundle groups profiles, engines, scanner templates, risk levels, safety notes, installation notes, and commercial use cases. This is the HexStrike/AutoRedTeam-style tool-pack layer, but it remains a read model: it does not grant execution permission, approve risk, change scope, or expose raw executables to Agent Workers.

```json
[
  {
    "id": "bundle.container-web-recon",
    "name": "Container Web Recon Bundle",
    "version": "0.1.0",
    "source": "container_image",
    "status": "planned",
    "runtimeStatus": "planned",
    "available": false,
    "profileIds": ["container.web-recon"],
    "engines": ["nuclei", "httpx", "ffuf", "sqlmap"],
    "templateIds": [
      "web.nuclei.safe_templates",
      "web.httpx.fingerprint",
      "web.ffuf.content_discovery",
      "web.sqlmap.verify"
    ],
    "riskLevels": ["R2", "R3"],
    "templateCount": 4,
    "runnableTemplateCount": 0,
    "blockedReasons": ["External toolbox execution is disabled by policy."]
  }
]
```

Current built-in bundles:

- `bundle.builtin-web-kernel`
- `bundle.builtin-network-kernel`
- `bundle.container-web-recon`
- `bundle.container-network-recon`
- `bundle.local-sast`
- `bundle.android-analysis`

Bundle runtime status is derived from profile readiness, external-execution policy, and template availability. Execution still happens only through `POST /runs/{id}/tools` and `scanner.run_template`.

## POST /toolbox-bundles

Registers or updates a local custom toolbox manifest. Custom bundle ids must start with `bundle.custom.`. The manifest is persisted in local state and returned by future `GET /toolbox-bundles` calls with a manifest SHA-256 in its safety notes.

```json
{
  "id": "bundle.custom.web-recon-lab",
  "name": "Custom Web Recon Lab",
  "version": "0.1.0",
  "profileIds": ["container.web-recon"],
  "engines": ["nuclei", "httpx"],
  "templateIds": ["web.nuclei.safe_templates", "web.httpx.fingerprint"],
  "riskLevels": ["R2"],
  "safetyNotes": ["Registered manifest only; execution still requires Tool Gateway policy and profile readiness."],
  "installationNotes": ["Provide the matching local container image and enable container toolbox policy."],
  "commercialUseCases": ["Organization-specific web recon pack"]
}
```

Forbidden fields are rejected:

- `command`
- `commands`
- `args`
- `payload`
- `payloads`
- `rawTools`

Registration does not make templates executable. Execution still depends on Tool Gateway allowlisting, scope, rate limits, risk approval, external toolbox policy, profile readiness, and evidence handling.

## GET /runs/{id}/toolbox-bundles

Returns toolbox bundles with run-specific enablement state.

```json
[
  {
    "id": "bundle.container-web-recon",
    "name": "Container Web Recon Bundle",
    "enabled": true,
    "binding": {
      "id": "run_bundle_x",
      "runId": "run_x",
      "bundleId": "bundle.container-web-recon",
      "enabledBy": "operator"
    }
  }
]
```

## POST /runs/{id}/toolbox-bundles/{bundleId}/enable

Enables a toolbox bundle as run-local Agent Worker context. The platform writes a graph hint, emits a `toolbox.bundle.enabled` timeline event, and includes the bundle in future `agent-worker.v1` envelopes.

Enablement does not grant execution permission. Workers can use it to prefer relevant governed scanner templates, but every tool request still goes through Tool Gateway scope checks, risk gates, profile readiness, approval, audit, redaction, and evidence rules.

## GET /connectors

Returns governed external connector manifests for MCP, CLI, HTTP API, and container integrations. This is the bridge for HexStrike/AutoRedTeam-style ecosystems, but it is only a metadata registry. Listing a connector does not start an MCP server, call a CLI, send an HTTP request, start a container, or grant execution permission.

Built-in presets cover broad ecosystem lanes without exposing raw tools: HexStrike-style MCP, AutoRedTeam-style MCP, Nuclei CLI, web recon containers, network recon containers, SAST/supply-chain CLI tools, Android/mobile analysis, cloud/identity audit, bug bounty platform APIs, and CAI/Apex-style evaluation metadata.

```json
[
  {
    "id": "connector.mcp.hexstrike-compatible",
    "name": "HexStrike-style MCP Connector",
    "version": "0.1.0",
    "source": "built_in",
    "kind": "mcp",
    "status": "planned",
    "toolNames": ["nuclei", "httpx", "ffuf"],
    "riskLevels": ["R1", "R2", "R3"],
    "inputKinds": ["target_url", "domain"],
    "evidenceKinds": ["command_output", "http_exchange"],
    "requiredEnv": ["PLATFORM_CONNECTOR_HEXSTRIKE_MCP"],
    "capabilityMapping": {
      "highLevelTools": ["http.request", "scanner.run_template"],
      "templateIds": ["web.nuclei.safe_templates", "web.httpx.fingerprint"],
      "toolPackIds": ["pack.web.baseline"],
      "mappedToolNames": ["httpx", "nuclei"],
      "unmappedToolNames": ["katana"],
      "coveragePercent": 67,
      "notes": ["Mapped capabilities are suggestions for governed Tool Gateway requests, not connector execution grants."]
    }
  }
]
```

## POST /connectors

Registers or updates a local custom connector manifest. Custom connector ids must start with `connector.custom.`. The manifest is persisted locally and hashed, but only metadata is accepted.

```json
{
  "id": "connector.custom.hexstrike-lab",
  "name": "Custom HexStrike Lab Connector",
  "version": "0.1.0",
  "kind": "mcp",
  "status": "planned",
  "toolNames": ["nuclei", "httpx", "ffuf"],
  "riskLevels": ["R1", "R2"],
  "inputKinds": ["target_url", "domain"],
  "evidenceKinds": ["command_output", "http_exchange"],
  "requiredEnv": ["PLATFORM_CONNECTOR_HEXSTRIKE_MCP"],
  "safetyNotes": ["Connector metadata only; execution must stay behind Tool Gateway requests and approvals."],
  "installationNotes": ["Map external connector capabilities into governed scanner templates before use."],
  "commercialUseCases": ["Governed external tool ecosystem import"]
}
```

Forbidden manifest fields include raw commands, args, payloads, direct credentials, tokens, headers, endpoints, and raw tool definitions. Registration does not make any external connector executable.

The response includes a derived `capabilityMapping` block. It shows which connector tool names can already be represented as governed high-level tools, scanner templates, or Tool Packs, and which names remain unmapped product gaps.

## GET /runs/{id}/connectors

Returns connector manifests with run-specific enablement state.

## GET /runs/{id}/ecosystem-coverage

Returns a governed ecosystem coverage map for a run. It aggregates Connector mappings, Toolbox Bundles, scanner templates, Tool Packs, capability areas, and unmapped connector tool names into one product planning view.

This endpoint is read-only. It does not invoke MCP/CLI/HTTP/container connectors, execute tools, register templates, enable bundles, approve actions, or change Worker permissions.

```json
{
  "mode": "governed_tool_ecosystem_mapping",
  "summary": "Mapped connector tools are governed capability hints; unmapped tools become scanner templates, Tool Packs, Domain Skills, services, or runtime-profile work.",
  "counts": {
    "connectors": 10,
    "enabledConnectors": 1,
    "connectorTools": 44,
    "mappedConnectorTools": 24,
    "unmappedConnectorTools": 20,
    "averageConnectorCoverage": 55,
    "scannerTemplates": 28,
    "toolPacks": 4
  },
  "gaps": [
    {
      "toolName": "sqlmap",
      "proposedTarget": "scanner_template",
      "rationale": "sqlmap should be represented as one or more governed scanner templates with risk, timeout, profile, approval, and evidence policy."
    }
  ],
  "safetyNotes": [
    "Connector tool names are metadata, not executable tool grants."
  ]
}
```

## GET /runs/{id}/tool-integration-backlog

Returns a ranked governed integration backlog for external tool ecosystems. It turns unmapped connector tools, blocked external scanner profiles, and capability-matrix gaps into concrete platform work: scanner templates, Tool Packs, rigid Domain Skills, first-party services, runtime profiles, or manual mapping review.

This endpoint is read-only. It does not register templates, create bundles, start connectors, execute commands, approve risk, change scope, or grant Worker permissions.

```json
{
  "mode": "governed_tool_integration_backlog",
  "summary": "12 governed integration backlog item(s): 4 scanner template, 1 tool pack, 2 domain skill, 3 runtime profile, 2 manual review.",
  "counts": {
    "items": 12,
    "high": 4,
    "scannerTemplateCandidates": 4,
    "runtimeProfileCandidates": 3,
    "domainSkillCandidates": 2
  },
  "items": [
    {
      "title": "Map sqlmap into governed scanner_template",
      "priority": "high",
      "status": "ready_to_map",
      "proposedArtifact": {
        "type": "scanner_template",
        "id": "scanner.custom.sqlmap.safe",
        "ownerSurface": "Tool Gateway / Toolbox Runner"
      },
      "suggestedRiskLevel": "R2",
      "acceptanceCriteria": [
        "Template has explicit risk level, timeout, input policy, profile id, evidence policy, and approval behavior."
      ]
    }
  ],
  "safetyNotes": [
    "Backlog items are product planning records only; they do not register tools, execute commands, start connectors, or grant Worker permissions."
  ]
}
```

## GET /runs/{id}/tool-ecosystem-workbench

Returns the commercial tool ecosystem workbench for a run. It joins Tool Gateway catalog entries, scanner-template policies, Tool Packs, Connector Coverage, Tool Integration Backlog, Toolbox Doctor, Runtime Activation Plan, Local Execution Node status, tool invocation records, evidence metadata, and finding metadata into one readiness view.

This endpoint is read-only. It does not run tools, invoke connectors, enable bundles, change allowlists, create approvals, write evidence, or expose raw commands to Agent Workers. Recommended packs are based on Tool Gateway preview decisions and still require normal operator execution.

```json
{
  "mode": "commercial_tool_ecosystem_workbench",
  "posture": "usable",
  "counts": {
    "highLevelTools": 10,
    "scannerTemplates": 28,
    "runnableTemplates": 16,
    "toolPacks": 5,
    "connectors": 10,
    "enabledConnectors": 1,
    "mappedConnectorTools": 24,
    "connectorTools": 44,
    "runtimeProfiles": 5,
    "availableRuntimeProfiles": 2,
    "toolInvocations": 3,
    "evidenceProducingInvocations": 2
  },
  "lanes": [
    {
      "title": "Scanner template library",
      "status": "usable",
      "summary": "16/28 template(s) runnable; 12 blocked by policy/profile/planned adapters."
    }
  ],
  "recommendedPacks": [
    {
      "id": "pack.web.baseline",
      "status": "ready",
      "entrypoint": "POST /runs/{id}/tool-packs/pack.web.baseline/invoke",
      "executable": 5,
      "total": 5
    }
  ],
  "ecosystemGates": [
    {
      "id": "tool_gateway_only",
      "status": "pass",
      "detail": "All executable capability is represented as high-level Tool Gateway routes or scanner templates."
    }
  ],
  "audit": {
    "readOnly": true,
    "invokesTools": false,
    "invokesConnectors": false,
    "writesEvidence": false
  }
}
```

## POST /runs/{id}/connectors/{connectorId}/enable

Enables a connector as run-local Agent Worker context. The platform writes a graph hint, emits a `connector.enabled` timeline event, and includes safe connector metadata in future `agent-worker.v1` envelopes.

Enablement does not grant execution permission. Workers can use connector metadata to understand what governed integration exists, but they must still request high-level Tool Gateway tools. External MCP, CLI, HTTP API, and container calls remain fail-closed; even mapped capabilities execute only through explicit governed templates, tools, or Tool Packs.

## GET /runs/{id}/connector-runs

Returns prior Connector-backed template runs for a run. These are audit records over first-party Tool Gateway requests, not raw connector execution logs.

## POST /runs/{id}/connectors/{connectorId}/plan

Previews every mapped scanner template for a connector against the run target or an optional request body target. The preview is read-only: it does not invoke the connector, does not execute tools, does not write evidence, and does not consume rate-limit budget.

```json
{
  "target": "https://app.example.com"
}
```

The response includes the connector, the template preview items, executable/blocked/approval counts, and audit flags:

```json
{
  "connector": { "id": "connector.mcp.hexstrike-compatible" },
  "summary": { "total": 8, "executable": 5, "blocked": 3, "approvalRequired": 0 },
  "audit": {
    "previewWritesState": false,
    "invokesConnector": false,
    "invokesTools": false,
    "writesEvidence": false
  }
}
```

## POST /runs/{id}/connectors/{connectorId}/invoke

Runs every mapped scanner template for a connector through `scanner.run_template` and the normal Tool Gateway path. The connector itself is not called. Each item still passes through scope, risk, approval, rate-limit, toolbox profile, audit, redaction, and evidence gates.

## GET /capabilities

Returns an operator-facing capability matrix. This is the product view over the Tool Catalog, scanner templates, toolbox profiles, evidence kinds, risk levels, safety controls, and known gaps.

It is meant for platform visibility and commercial planning, not for giving Agent Workers a raw exploit menu.

```json
[
  {
    "area": "network",
    "name": "Network and protocol reconnaissance",
    "status": "partial",
    "highLevelTools": ["scanner.run_template"],
    "scannerTemplates": ["network.dns_records", "network.tls_certificate", "network.nmap.safe_top_ports"],
    "profiles": ["builtin.network", "container.network-recon"],
    "engines": ["builtin", "nmap", "tlsx"],
    "evidenceKinds": ["command_output"],
    "riskLevels": ["R0", "R1", "R2"],
    "safetyControls": ["scope policy", "R2 scan gate"],
    "gaps": ["containerized nmap/naabu/httpx execution"]
  }
]
```

## GET /toolbox-profiles

Returns the governed execution backends used by scanner templates, including runtime readiness.

```json
[
  {
    "id": "builtin.web",
    "name": "Built-in Web Checks",
    "kind": "builtin",
    "status": "available",
    "available": true,
    "runtimeStatus": "available",
    "runner": "builtin",
    "isolation": "process",
    "commands": []
  },
  {
    "id": "container.web-recon",
    "name": "Container Web Recon Toolbox",
    "kind": "container",
    "status": "planned",
    "available": false,
    "runtimeStatus": "planned",
    "runner": "none",
    "reason": "Set PLATFORM_ENABLE_CONTAINER_TOOLBOX=1 to enable Docker/Podman profile probing.",
    "image": "ghcr.io/coff0xc/ai-pentest-toolbox:web-recon",
    "commands": ["nuclei", "ffuf", "httpx", "sqlmap"]
  }
]
```

Templates whose profile is `planned` or unavailable are visible for roadmap and prompt-shaping, but execution is blocked with an audit record instead of falling through to a raw command.

External toolbox probing and planning is controlled by:

```bash
PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1
PLATFORM_ALLOWED_SCANNER_TEMPLATES=web.nuclei.safe_templates,web.httpx.fingerprint
PLATFORM_ENABLE_CONTAINER_TOOLBOX=1
PLATFORM_CONTAINER_RUNTIME=docker|podman
PLATFORM_WEB_RECON_IMAGE=ghcr.io/coff0xc/ai-pentest-toolbox:web-recon
PLATFORM_NETWORK_RECON_IMAGE=ghcr.io/coff0xc/ai-pentest-toolbox:network-recon
PLATFORM_ENABLE_LOCAL_SAST=1
PLATFORM_ENABLE_ANDROID_TOOLBOX=1
```

When `PLATFORM_ALLOW_EXTERNAL_TOOLBOX=1`, the selected template is allowlisted, and the selected profile is available, `scanner.run_template` executes the planned command without a shell in `.local/tool-runs/{toolCallId}`. Stdout and stderr are redacted, bounded, and stored as `command_output` evidence. Exit code and timeout are written back to the tool invocation for review.

## GET /runs/{id}/review

Returns the desktop review bundle for one run:

- `progress`
- `approvals`
- `toolInvocations`
- `evidence`
- `findings`
- `reports`
- `runExports`
- `browserSessions`
- `proxySessions`
- `oastSessions`
- `oastCallbacks`
- `credentialReferences`
- `accessReviews`
- `captureImports`, `browserSnapshots`, `sarifImports`, `androidManifestImports`, `cloudIamImports`, `identityGraphImports`, `toolPackRuns`, and `connectorRuns`
- `observability`

This endpoint is a read model for the Operator Console and future Tauri desktop shell. It keeps review screens from making many separate calls.

## Credential References

Credential References are run-local role and vault placeholders. They let an operator model authenticated testing context without storing raw secrets in the graph, audit log, Worker prompt, or cloud-ready evidence.

```http
GET /runs/{id}/credentials
POST /runs/{id}/credentials
POST /credentials/{id}/revoke
```

Create a reference:

```json
{
  "label": "Viewer token",
  "role": "viewer",
  "kind": "vault_reference",
  "placeholder": "vault://bugbounty/viewer-token",
  "allowedUse": ["browser.navigate", "http.request", "role-diff"]
}
```

Supported `kind` values:

- `vault_reference`: must use `vault://`, `op://`, `keychain://`, `aws-sm://`, `gcp-sm://`, or `azure-kv://`.
- `header_placeholder`: must use a named placeholder such as `{{VIEWER_TOKEN}}`.
- `cookie_placeholder`: must use a named placeholder such as `{{VIEWER_COOKIE}}`.
- `account_note`: a short non-secret account marker.

If the run `ScopePolicy.credentialRules.allowVaultReferencesOnly` flag is true, only `vault_reference` is accepted. Inputs that look like bearer tokens, JWTs, passwords, API keys, or long raw secret strings are rejected.

## Access Reviews

Access Reviews compare two same-run evidence items, usually captured with different authenticated roles, and generate a redacted diff artifact. They are designed for IDOR, role-difference, and authorization review without giving Workers direct access to credentials.

```http
GET /runs/{id}/access-reviews
POST /runs/{id}/access-reviews
POST /runs/{id}/access-reviews/compare
POST /access-reviews/{id}/evidence
```

Create and compare in one call:

```json
{
  "title": "Viewer versus admin profile response",
  "target": "https://app.example.com/profile",
  "method": "GET",
  "baselineCredentialId": "credential_viewer",
  "comparisonCredentialId": "credential_admin",
  "baselineEvidenceId": "evidence_viewer",
  "comparisonEvidenceId": "evidence_admin"
}
```

Response:

```json
{
  "review": {
    "id": "access_review_x",
    "status": "differential_observed",
    "summary": "Observed 2 access difference signal(s). Human review should confirm authorization impact.",
    "diffEvidenceId": "evidence_diff"
  },
  "diffEvidenceId": "evidence_diff"
}
```

The diff evidence stores response status, redacted body-preview hash, preview length, header-key differences, and a `requiresHumanReview` decision. It does not confirm impact by itself; a reportable issue still needs an evidence-backed Finding and human validation.

## SARIF Imports

SARIF Imports let the platform ingest local SAST or CI results without turning static alerts into confirmed vulnerabilities.

```http
GET /runs/{id}/sarif-imports
POST /runs/{id}/sarif-imports
```

Import request:

```json
{
  "source": "ci-semgrep.sarif",
  "createFindings": true,
  "content": {
    "version": "2.1.0",
    "runs": []
  }
}
```

The import service:

- hashes the raw SARIF input
- stores a normalized `command_output` evidence artifact
- extracts bounded rule, message, location, severity, and remediation metadata
- optionally creates up to 25 evidence-backed candidate Findings
- leaves validation to human review before reporting

This is the first AutoRedTeam-style CI/SARIF ingestion path. It does not upload source code and it does not treat static-analysis results as confirmed impact.

## Android Manifest Imports

Android Manifest Imports give the `mobile.android-apk` Domain Skill a concrete static-analysis input without requiring apktool or a lab device. The route accepts AndroidManifest.xml text, hashes the raw input, stores normalized mobile evidence, and can create evidence-backed candidate Findings for human validation.

```http
GET /runs/{id}/android-manifest-imports
POST /runs/{id}/android-manifest-imports
```

Import request:

```json
{
  "source": "release/AndroidManifest.xml",
  "createFindings": true,
  "content": "<manifest package=\"com.example.app\">...</manifest>"
}
```

The import service extracts:

- package name, `minSdkVersion`, and `targetSdkVersion`
- application flags such as `debuggable`, `allowBackup`, and `usesCleartextTraffic`
- declared permissions and risk-sensitive permission signals
- exported activities, services, receivers, and providers
- up to 25 candidate Findings backed by the normalized manifest evidence

The original XML is not stored as raw evidence by this route. The evidence record stores the input SHA-256, bounded normalized fields, risk signals, and candidate Finding links. This keeps Android support as a rigid domain Skill rather than a generic mobile pentest playbook.

## POST /runs/{id}/evidence

Imports local evidence into the Evidence Engine. This is the adapter point for future browser, proxy, OAST, and toolbox captures.

```json
{
  "kind": "http_exchange",
  "redactionState": "redacted",
  "content": {
    "request": { "method": "GET", "target": "https://app.example.com/profile" },
    "response": { "status": 200, "bodyPreview": "redacted response preview" }
  }
}
```

`content` can be a string or structured JSON. Structured content is serialized before hashing and storage.

## POST /runs/{id}/captures/http-exchange

Captures one browser, proxy, or manual HTTP exchange as redacted `http_exchange` evidence. This is the stricter adapter contract for future MITM proxy and browser-controller integrations.

The server checks the request target and method against the run `ScopePolicy` before storage. Out-of-scope captures return `403` and do not create evidence.

```json
{
  "source": "proxy",
  "request": {
    "method": "GET",
    "target": "https://app.example.com/profile?token=secret",
    "headers": {
      "authorization": "Bearer secret"
    },
    "bodyPreview": "access_token=secret"
  },
  "response": {
    "status": 200,
    "statusText": "OK",
    "headers": {
      "content-type": "application/json"
    },
    "bodyPreview": "{\"ok\":true,\"secret\":\"secret\"}"
  }
}
```

Response:

```json
{
  "id": "evidence_x",
  "kind": "http_exchange",
  "redactionState": "redacted",
  "sha256": "..."
}
```

Sensitive headers, query parameters, bearer tokens, and common token/password/secret fields are redacted before hashing and storage. Body previews are bounded and are still only previews; full raw traffic remains a future local-only evidence path.

## POST /runs/{id}/captures/har

Imports a standard HAR file as browser/proxy capture evidence. This is the batch adapter for Burp, browser DevTools, Playwright, or a future desktop MITM proxy export.

```json
{
  "source": "browser.har",
  "maxEntries": 100,
  "content": {
    "log": {
      "entries": [
        {
          "request": {
            "method": "GET",
            "url": "https://app.example.com/profile?token=secret",
            "headers": [{ "name": "Authorization", "value": "Bearer secret" }]
          },
          "response": {
            "status": 200,
            "headers": [{ "name": "Content-Type", "value": "application/json" }],
            "content": { "mimeType": "application/json", "text": "{\"access_token\":\"secret\"}" }
          }
        }
      ]
    }
  }
}
```

Behavior:

- each entry is checked against the run `ScopePolicy` as an `R1` browser/HTTP action
- out-of-scope or malformed entries are skipped, not stored
- request URLs, headers, request bodies, response headers, and response bodies are redacted before storage
- request and response body previews are bounded to 4096 characters per entry
- `maxEntries` is clamped to `1..200`; entries over the limit are counted as truncated
- each imported entry becomes one redacted `http_exchange` evidence item
- the import itself is persisted as a `CaptureImport` record for review, audit, skipped-entry analysis, and evidence reuse

Response:

```json
{
  "runId": "run_x",
  "source": "browser.har",
  "totalEntries": 2,
  "processedEntries": 2,
  "imported": 1,
  "skipped": 1,
  "truncatedEntries": 0,
  "evidenceIds": ["evidence_x"],
  "skippedEntries": [
    { "index": 1, "target": "https://out.example/", "reason": "Target is not in allowed scope" }
  ],
  "importRecord": {
    "id": "capture_import_x",
    "kind": "har",
    "status": "imported",
    "inputSha256": "..."
  }
}
```

## GET /runs/{id}/capture-imports

Lists persisted capture import records for the run, newest first. The same records are included in `GET /runs/{id}/review` so the Operator Console can show browser/proxy import progress beside the Evidence Inbox.

## POST /runs/{id}/cloud-iam-imports

Imports AWS or generic cloud IAM policy JSON as normalized `command_output` evidence and optional candidate Findings. This is a rigid Cloud IAM domain Skill path, not a generic cloud exploitation workflow.

```json
{
  "provider": "aws",
  "source": "iam-policy.json",
  "createFindings": true,
  "content": {
    "Version": "2012-10-17",
    "Statement": [
      { "Effect": "Allow", "Action": "*", "Resource": "*" }
    ]
  }
}
```

Behavior:

- raw policy input is hashed but not stored as raw evidence
- normalized statements, counts, and risk signals are stored as redacted `command_output` evidence
- risk signals include wildcard admin, `Allow` with `NotAction` / `NotResource`, wildcard `iam:PassRole`, wildcard `sts:AssumeRole`, IAM policy mutation actions, and broad wildcard resources without conditions
- at most 25 candidate Findings are created when `createFindings` is true
- Findings remain candidates until human evidence review and validation

## GET /runs/{id}/cloud-iam-imports

Lists Cloud IAM import records for the run, newest first. The same records are included in `GET /runs/{id}/review`.

## POST /runs/{id}/identity-graph-imports

Imports BloodHound-style or generic identity graph JSON as normalized `command_output` evidence and optional candidate Findings. This is a rigid Identity/AD domain Skill path for read-only graph review; it does not execute lateral movement, credential attacks, or live AD actions.

```json
{
  "provider": "bloodhound",
  "source": "identity-graph.json",
  "createFindings": true,
  "content": {
    "nodes": [
      { "id": "u1", "name": "svc-web", "type": "User", "properties": { "hasspn": true } },
      { "id": "g1", "name": "Domain Admins", "type": "Group", "highvalue": true }
    ],
    "edges": [
      { "source": "u1", "target": "g1", "type": "GenericAll" }
    ]
  }
}
```

Behavior:

- raw graph input is hashed but not stored as raw evidence
- normalized node/edge summaries and risk signals are stored as redacted `command_output` evidence
- risk signals include high-value privilege edges, DCSync-like privileges, admin-group control edges, Kerberoastable identities, AS-REP roastable identities, unconstrained delegation, and AdminCount review signals
- at most 25 candidate Findings are created when `createFindings` is true
- Findings remain candidates until human evidence review and validation

## GET /runs/{id}/identity-graph-imports

Lists identity graph import records for the run, newest first. The same records are included in `GET /runs/{id}/review`.

## POST /runs/{id}/captures/browser-snapshot

Captures a browser, desktop, or manual page snapshot as reviewable evidence. This endpoint is the adapter boundary for a future Tauri/Playwright browser controller: it validates scope before storing anything, keeps screenshots local-only, and stores bounded redacted text/DOM previews separately.

```json
{
  "source": "browser",
  "target": "https://app.example.com/profile?token=secret",
  "title": "Profile page rendered",
  "screenshotBase64": "data:image/png;base64,iVBORw0KGgo...",
  "textPreview": "Visible page text with access_token=secret"
}
```

Behavior:

- `target` is checked against the run `ScopePolicy` as an `R1` browser action before any evidence is stored
- `source` must be `browser`, `desktop`, or `manual`
- screenshots accept base64 or image data URLs and are capped at 2 MB
- screenshot evidence is stored as `screenshot` with `redactionState: "raw_local_only"`
- `textPreview`, `domText`, or `domPreview` is redacted and bounded to 20000 characters as `command_output` evidence
- at least one screenshot or text preview is required
- a persisted `BrowserSnapshot` record links the produced evidence IDs for review and report reuse

Response:

```json
{
  "id": "browser_snapshot_x",
  "source": "browser",
  "target": "https://app.example.com/profile?token=%5Bredacted%5D",
  "screenshotEvidenceId": "evidence_screen",
  "textEvidenceId": "evidence_text",
  "evidenceIds": ["evidence_screen", "evidence_text"],
  "textPreviewTruncated": false
}
```

## GET /runs/{id}/browser-snapshots

Lists persisted page snapshot records for the run, newest first. The same records are included in `GET /runs/{id}/review` for the Operator Console Browser Snapshots panel.

## Browser Sessions

Browser sessions are the local browser-controller contract for the current Web Console and a future Tauri/Playwright/MITM desktop shell. The current implementation is `local_fetch_controller`: it captures navigation as an in-scope HTTP exchange, but does not execute JavaScript, manage a real DOM, or install a TLS interception certificate yet.

```http
POST /runs/{id}/browser-sessions
GET /runs/{id}/browser-sessions
POST /browser-sessions/{id}/navigate
POST /browser-sessions/{id}/close
```

`POST /browser-sessions/{id}/navigate` accepts:

```json
{
  "target": "https://app.example.com/profile",
  "method": "GET",
  "headers": {},
  "timeoutMs": 10000
}
```

Navigation is scope-checked as an `R1` browser action and stores a redacted `http_exchange` evidence item.

The same capability is available through the Tool Gateway as `browser.navigate`:

```json
{
  "tool": "browser.navigate",
  "target": "https://app.example.com/profile",
  "method": "GET",
  "riskLevel": "R1",
  "args": { "timeoutMs": 10000 }
}
```

## OAST Callback Inbox

The local OAST inbox is the contract for out-of-band validation evidence. It is local HTTP only today; public DNS canary domains and tunnel integrations belong to the later desktop/cloud execution layer.

```http
POST /runs/{id}/oast-sessions
GET /runs/{id}/oast-sessions
POST /oast-sessions/{id}/close
GET|POST /oast/{token}
```

When `/oast/{token}` receives a callback, the platform stores a redacted `oast_callback` evidence item and adds the callback to the run review bundle. Callback routes are token-addressed and intentionally do not require the local API token, because real target systems cannot know the operator token.

The same capability is available through the Tool Gateway as `oast.start_session` and `oast.record_callback`. Creating OAST payloads for live targets should still be treated as approval-gated validation work.

## HTTP Proxy Absolute-Form Capture

The API process can also accept explicit HTTP proxy requests where the request line contains an absolute target URL. This is the first local proxy adapter layer for tools and future browser-controller handoff.

Start a proxy capture session first:

```http
POST /runs/{id}/proxy-sessions
```

Response:

```json
{
  "id": "proxysession_x",
  "runId": "run_x",
  "status": "active",
  "proxyUrl": "http://127.0.0.1:4317",
  "requiredHeaders": {
    "X-Capture-Run-Id": "run_x",
    "X-Platform-Token": "<local token>"
  },
  "limitations": ["HTTP absolute-form only", "CONNECT/TLS interception is not implemented"]
}
```

List sessions:

```http
GET /runs/{id}/proxy-sessions
```

Close a session:

```http
POST /proxy-sessions/{id}/close
```

Required headers:

```http
X-Capture-Run-Id: run_x
X-Platform-Token: <local token>
```

`Proxy-Authorization: Bearer <local token>` is also accepted. The target application's own `Authorization` header is forwarded to the target and is not used for platform authentication.

Example with curl:

```bash
curl -x http://127.0.0.1:4317 \
  -H "X-Capture-Run-Id: run_x" \
  -H "X-Platform-Token: $PLATFORM_API_TOKEN" \
  http://127.0.0.1:8080/profile
```

Behavior:

- requires an active proxy capture session for the run
- checks `ScopePolicy` before forwarding
- strips local proxy control headers before the target request
- forwards the target response to the client
- stores a redacted `http_exchange` evidence item
- returns `407` when proxy authentication is missing
- returns `403` for out-of-scope targets

`CONNECT` is intentionally not implemented in the kernel. TLS interception, local CA management, and browser certificate trust belong to the later desktop proxy layer.

## POST /runs/{id}/findings

Proposes an evidence-backed finding for human review. The API rejects findings that do not reference evidence.

```json
{
  "title": "Profile metadata exposure",
  "severity": "medium",
  "confidence": "likely",
  "affectedAssets": ["https://app.example.com/profile"],
  "evidenceIds": ["evidence_x"],
  "reproSteps": ["Replay the referenced HTTP exchange"],
  "impact": "Low privilege users can observe profile metadata.",
  "remediation": "Filter the response by caller role."
}
```

## POST /findings/{id}/validation

Updates the human review state for an evidence-backed finding.

```json
{
  "validationState": "confirmed",
  "reviewer": "operator",
  "note": "Impact confirmed after replaying reviewed evidence."
}
```

Supported states:

- `candidate`
- `confirmed`
- `rejected`

Rejected findings remain in the local review bundle for auditability, but report generation excludes them.

Confirming a finding requires every referenced evidence item to have an operator Evidence Review with status `useful`. This keeps `confirmed` findings tied to human-reviewed, reproducible evidence instead of raw Worker output.

## POST /runs/{id}/hints

Adds human judgment to the graph.

```json
{ "text": "Focus authenticated profile traffic first" }
```

## POST /runs/{id}/dispatch

Runs exactly one dispatcher tick. This is useful for desktop buttons, CLI loops, tests, and future job queues.

Worker selection is policy-aware. The dispatcher first asks the Worker Selection Policy to rank the run pool using runtime health, configured command, priority, cross-run Worker Leaderboard score, current-run outcomes, evidence contribution, finding influence, and timeout/error pressure. If that read model is unavailable, the dispatcher falls back to the run's original worker-pool order.

Agent Workers may return `toolRequests` during `explore`. The dispatcher executes those requests through the Tool Gateway, not directly from the Worker process. Evidence-producing tool results are attached to the fact created when the intent is concluded. If a requested tool is blocked or requires approval, the intent is released with an audit-visible reason.

CLI-backed Workers receive an `agent-worker.v1` protocol envelope, not a bare graph dump. The envelope includes hard rules, the governed tool surface, output schema, and examples for `toolRequests` and `$produced` evidence references.

When a Worker-requested tool is blocked or needs approval, the response can be:

```json
{
  "status": "blocked",
  "task": "explore",
  "worker": "codex-worker",
  "selection": {
    "source": "policy",
    "worker": "codex-worker",
    "score": 74,
    "decision": "recommended"
  },
  "reason": "Worker tool request requires approval: R3 action requires approval",
  "approvalId": "approval_x",
  "invocationId": "toolcall_x"
}
```

## POST /intents/{id}/heartbeat

Extends an active intent lease. Worker runners use this for long-running sessions.

```json
{
  "leaseId": "lease_x",
  "leaseMs": 300000
}
```

`leaseMs` is optional and capped at 30 minutes.

## POST /runs/{id}/tools/plan

Previews a high-level tool request through the same Tool Gateway gates used by execution. This endpoint is read-only: it does not execute tools, write tool invocations, create approvals, consume rate-limit budget, or add evidence.

```json
{
  "tool": "scanner.run_template",
  "target": "https://app.example.com",
  "method": "GET",
  "riskLevel": "R2",
  "args": {
    "template": "web.nuclei.safe_templates",
    "timeoutMs": 10000
  }
}
```

Example response:

```json
{
  "status": "blocked",
  "executable": false,
  "reason": "External toolbox execution is disabled by policy for profile container.web-recon",
  "gates": [
    { "gate": "tool.support", "status": "pass", "reason": "High-level tool is registered in the Tool Gateway" },
    { "gate": "scope.policy", "status": "pass", "reason": "Allowed by scope policy" },
    { "gate": "scanner.template", "status": "pass", "reason": "Scanner template is registered: web.nuclei.safe_templates" },
    { "gate": "toolbox.plan", "status": "blocked", "reason": "External toolbox execution is disabled by policy for profile container.web-recon" }
  ],
  "scanner": {
    "toolboxDecision": { "allowed": false },
    "plan": {
      "engine": "nuclei",
      "runner": "none",
      "command": "nuclei",
      "args": ["https://app.example.com/"]
    }
  },
  "audit": {
    "previewWritesState": false,
    "wouldCreateApprovalRequest": false,
    "wouldExecuteExternalProcess": false,
    "wouldWriteEvidence": false
  }
}
```

Use this endpoint for desktop approval panels, strategy recommendation previews, and operator explainability. A preview is not a permission grant; execution still requires `POST /runs/{id}/tools`.

## POST /runs/{id}/tools

Invokes a high-level tool through the Tool Gateway. The gateway enforces scope, method policy, risk gates, rate limits, and tool allowlisting before execution.

```json
{
  "tool": "http.request",
  "target": "https://app.example.com/profile",
  "method": "GET",
  "riskLevel": "R1",
  "args": {
    "headers": {
      "authorization": "Bearer vault-placeholder"
    },
    "timeoutMs": 10000
  }
}
```

Successful low-risk `http.request` calls return an `evidenceId` for the generated redacted HTTP exchange.

Scanner template invocation:

```json
{
  "tool": "scanner.run_template",
  "target": "https://app.example.com",
  "method": "GET",
  "riskLevel": "R2",
  "args": {
    "template": "web.security_headers",
    "timeoutMs": 10000
  }
}
```

Current built-in templates:

- `web.security_headers`: fetches the target, checks common browser security headers, and stores a redacted `command_output` evidence item.
- `web.endpoint_discovery`: checks `robots.txt`, `security.txt`, and `sitemap.xml` on the target origin and stores bounded previews.
- `web.technology_fingerprint`: collects response headers and bounded HTML signals for framework/platform hints.
- `web.cookie_flags`: inspects cookie metadata for Secure, HttpOnly, and SameSite coverage without storing cookie values.
- `web.link_form_map`: extracts bounded same-origin links and form actions from one HTML response without submitting forms.
- `web.cors_policy`: sends one in-scope GET with a synthetic Origin header and records CORS policy signals without sending credentials.
- `web.csp_analysis`: summarizes CSP, frame, MIME, referrer, and permissions-policy hardening signals from one response.
- `web.js_asset_inventory`: extracts bounded script asset URLs, inline script counts, and source-map hints from one HTML response without fetching JavaScript files.
- `web.cookie_scope_analysis`: inspects cookie domain, path, prefix, lifetime, SameSite, Secure, HttpOnly, and partitioning metadata without storing cookie values.
- `web.security_txt_policy`: checks `/.well-known/security.txt` and `/security.txt` and summarizes contact, policy, encryption, acknowledgments, and expiry metadata without fetching external contact URLs.
- `web.websocket_discovery_plan`: extracts WebSocket and realtime endpoint hints from one HTML response and produces a safe validation plan without opening WebSocket handshakes or sending messages.
- `web.sourcemap_exposure_plan`: checks bounded source-map candidates with same-origin `HEAD` requests and produces a review plan without downloading map bodies or fetching JavaScript files.
- `web.redirect_policy`: fetches one target with redirects disabled and records redacted Location, HSTS, and canonical redirect signals.
- `web.cache_policy`: summarizes cache-control, validator, Vary, CDN cache, and sensitive-response caching signals without storing the body.
- `web.openapi_discovery`: checks bounded same-origin OpenAPI/Swagger metadata paths and stores redacted spec previews without executing API operations.
- `web.oauth_oidc_metadata`: checks OAuth/OIDC well-known metadata without credential material, authorization flows, token requests, refresh, or revocation calls.
- `web.graphql_introspection_plan`: probes bounded GraphQL endpoint hints and produces an approval-aware plan without sending introspection queries or mutations.
- `network.dns_records`: resolves bounded public DNS record types for the in-scope host without zone transfer.
- `network.tls_certificate`: performs one TLS handshake and stores certificate metadata without sending HTTP data or intercepting TLS.

Planned external templates are already registered for nuclei, ffuf, httpx, sqlmap, nmap, tlsx, semgrep, apktool, and Frida. They remain blocked until the matching toolbox profile is implemented and policy-enabled.

Sandboxed shell invocation:

```json
{
  "tool": "shell.run_sandboxed",
  "target": "https://app.example.com",
  "method": "POST",
  "riskLevel": "R2",
  "args": {
    "command": "node",
    "args": ["-e", "console.log('tool output')"],
    "timeoutMs": 10000
  }
}
```

Allowed shell commands are intentionally narrow in the kernel: Node/npm/npx and Python command names. Containerized toolbox profiles should replace this local guard for production toolchains.

Finding proposal invocation:

```json
{
  "tool": "finding.propose",
  "target": "https://app.example.com/profile",
  "method": "POST",
  "riskLevel": "R0",
  "args": {
    "title": "Profile metadata exposure",
    "severity": "medium",
    "confidence": "likely",
    "affectedAssets": ["https://app.example.com/profile"],
    "evidenceIds": ["evidence_x"],
    "reproSteps": ["Replay the referenced HTTP exchange"],
    "impact": "Profile metadata can be reviewed from evidence.",
    "remediation": "Limit profile metadata by role."
  }
}
```

`finding.propose` returns a `findingId` only after the Finding Service confirms the referenced evidence exists in the same run.

Credential placeholder invocation:

```json
{
  "tool": "credential.use_placeholder",
  "target": "https://app.example.com",
  "method": "POST",
  "riskLevel": "R0",
  "args": {
    "credentialId": "credential_x",
    "usedFor": "browser.navigate"
  }
}
```

`credential.use_placeholder` produces a redacted `command_output` evidence record containing the credential reference id, role, placeholder reference, allowed use list, and `secretMaterialStored: false`. It does not resolve the real secret or inject it into HTTP requests yet. Future vault-backed request injection should build on this contract.

Access evidence comparison invocation:

```json
{
  "tool": "access.compare_evidence",
  "target": "https://app.example.com/profile",
  "method": "GET",
  "riskLevel": "R0",
  "args": {
    "title": "Viewer versus admin profile response",
    "baselineCredentialId": "credential_viewer",
    "comparisonCredentialId": "credential_admin",
    "baselineEvidenceId": "evidence_viewer",
    "comparisonEvidenceId": "evidence_admin"
  }
}
```

`access.compare_evidence` returns an `evidenceId` for the generated diff artifact. The Strategy service recommends this tool when a run has at least two active Credential References and at least two evidence items.

For Worker-originated `toolRequests`, `finding.propose` can reference evidence produced earlier in the same explore result with:

```json
"evidenceIds": ["$produced"]
```

The dispatcher expands `$produced` before invoking the Tool Gateway.

## GET /runs/{id}/approvals

Lists approval requests for a run. Desktop and CLI runners use this to render the human review queue.

## GET /runs/{id}/tool-invocations

Lists allowed, blocked, and approval-required tool audit records for a run.

## GET /evidence/{id}/content

Reads local evidence blob content. This endpoint is local-runner only and requires the API token.

The Operator Console uses this endpoint in the Evidence Viewer panel so a human reviewer can inspect a bounded local preview, encoding, size, SHA-256 hash, and redaction state before attaching evidence to a Finding or Access Review.

## GET /runs/{id}/replay-plans

Lists evidence replay readiness for every evidence item in a run.

Only `http_exchange` evidence with an in-scope `GET` or `HEAD` request is marked replayable. Non-HTTP evidence, malformed exchange JSON, out-of-scope URLs, and non-idempotent methods are marked blocked with a reason.

```json
[
  {
    "evidenceId": "evidence_x",
    "replayable": true,
    "status": "ready",
    "method": "GET",
    "target": "https://app.example.com/profile",
    "originalStatus": 200,
    "reason": "Safe HTTP evidence replay is available."
  }
]
```

## POST /evidence/{id}/replay

Replays one safe `http_exchange` evidence item and stores the new response as fresh redacted `http_exchange` evidence.

This route is deliberately narrow: it supports only `GET` and `HEAD`, strips sensitive replay headers, reruns scope checks as `R1`, caps timeout to 30 seconds, and never replays request bodies. State-changing methods must go through explicit Tool Gateway paths and approval policy instead.

```json
{ "timeoutMs": 10000 }
```

Response:

```json
{
  "status": "replayed",
  "sourceEvidenceId": "evidence_x",
  "replayEvidenceId": "evidence_y",
  "method": "GET",
  "replayStatus": 200,
  "statusChanged": false,
  "sha256": "..."
}
```

## GET /runs/{id}/evidence-reviews

Lists operator triage decisions for evidence in a run.

## POST /evidence/{id}/review

Records or updates the current operator review state for one evidence item.

```json
{
  "status": "useful",
  "note": "Supports the candidate finding.",
  "reviewer": "operator"
}
```

Allowed `status` values are `useful`, `needs_more_context`, and `not_relevant`. This does not confirm a vulnerability by itself; it only records human evidence triage before a Finding or Access Review consumes that evidence.

## POST /evidence/{id}/promote-finding

Creates an evidence-backed candidate Finding from one evidence item, but only after that evidence has been reviewed as `useful`.

```json
{
  "severity": "medium",
  "title": "Human-reviewed evidence requires validation"
}
```

All fields are optional. Defaults keep the Finding in `candidate` validation state with `needs_dynamic_confirmation` confidence. This is the Operator Console path from reviewed evidence to a reportable candidate without letting Agent Workers directly bypass human triage.

## POST /approvals/{id}/decision

Approves or rejects an R3 action.

```json
{ "status": "approved" }
```

## GET /findings?runId={id}

Lists evidence-backed findings. If `runId` is omitted, lists all findings in local state.

## POST /runs/{id}/evaluations

Runs the built-in quality evaluation for a run and stores the result.

Current checks:

- scope and destructive-action controls
- evidence-backed findings
- human validation coverage
- report safety and redaction
- trace and cost observability

## POST /reports

Generates a Markdown report.

```json
{ "runId": "run_x", "format": "hackerone", "findingScope": "confirmed_only" }
```

The response includes the rendered markdown plus a replay-bundle `evidenceId` and `sha256` for the stored report artifact.

`findingScope` defaults to `confirmed_only` for conservative commercial reporting. Use `candidate_and_confirmed` when exporting a triage report that intentionally includes unconfirmed candidate findings. Findings marked `rejected` are always excluded so reviewed false positives do not leak into customer-facing deliverables.

Supported formats:

- `hackerone`
- `bugcrowd`
- `src`
- `enterprise`

Supported finding scopes:

- `confirmed_only`
- `candidate_and_confirmed`

## POST /runs/{id}/exports

Generates a local run export bundle for team handoff, customer evidence review, or cloud-control-plane sync. The export is stored as redacted `replay_bundle` evidence and a separate `RunExport` review record.

```json
{
  "findingScope": "candidate_and_confirmed",
  "includeEvidenceContent": false
}
```

Behavior:

- includes run metadata, scope, facts, intents, hints, findings, evidence metadata, evidence reviews, reports, approvals, tool audit, sessions, imports, access reviews, and tool-pack runs
- `findingScope` defaults to `confirmed_only`; rejected findings are always excluded
- evidence content is omitted by default
- when `includeEvidenceContent` is true, only UTF-8 evidence that is not `raw_local_only` and is no larger than 200 KB is embedded
- `raw_local_only` evidence content is never included; the export records how many such items were omitted
- the generated bundle itself is hashable evidence with a returned `evidenceId` and `sha256`

Response:

```json
{
  "id": "run_export_x",
  "status": "generated",
  "evidenceId": "evidence_export",
  "sha256": "...",
  "findingScope": "candidate_and_confirmed",
  "includeEvidenceContent": false,
  "includedEvidenceContent": 0,
  "omittedRawLocalOnly": 1
}
```

## GET /runs/{id}/exports

Lists generated run export records for the run, newest first. The same records are included in `GET /runs/{id}/review`.
