export const OPERATOR_CONSOLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Operator Console</title>
    <link rel="stylesheet" href="/app/styles.css?v=ui-ai-config">
  </head>
  <body>
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">AI</div>
        <div>
          <p class="eyebrow">Authorized AI Pentest Platform</p>
          <h1>Operator Console</h1>
          <p class="topbar-subtitle">Local mission control for scope, evidence, workers, and report gates.</p>
        </div>
      </div>
      <div class="topbar-actions">
        <label class="language-control" for="language-select">Language
          <select id="language-select" name="language">
            <option value="en">English</option>
            <option value="zh-CN">中文</option>
          </select>
        </label>
        <form id="token-form" class="token-form">
          <label for="token-input">Local token</label>
          <input id="token-input" name="token" type="password" autocomplete="off" placeholder="Bearer token">
          <button type="submit">Save</button>
        </form>
      </div>
    </header>
    <nav class="console-nav" aria-label="Operator console sections">
      <a href="#launch-pad">Launch</a>
      <a href="#current-run">Run</a>
      <a href="#simple-console">Simple</a>
      <a href="#mission-control-panel">Mission</a>
      <a href="#agent-workbench-panel">Workbench</a>
      <a href="#tool-ecosystem-panel">Tools</a>
      <a href="#review-workspace">Review</a>
      <a href="#delivery-workspace">Deliver</a>
    </nav>
    <section id="launch-pad" class="panel launch-pad create-run-card" aria-labelledby="launch-pad-title">
      <div class="launch-pad-copy">
        <p class="eyebrow">Automated AI Pentest</p>
        <h2 id="launch-pad-title">Mission Launch Pad</h2>
        <p class="muted">Specify a target, connect an AI worker, choose automation depth, then start the authorized run.</p>
      </div>
      <form id="create-run-form" class="stack launch-pad-form">
        <div class="launch-form-grid">
          <div class="launch-targets">
            <div class="form-row">
              <label>Target <input name="target" required value="https://app.example.com"></label>
              <label>Allowed assets <input name="allowedAssets" required value="app.example.com"></label>
            </div>
            <details class="advanced-field scope-details">
              <summary>Advanced Scope Controls</summary>
              <label>Denied assets <input name="deniedAssets" placeholder="admin.example.com"></label>
              <div class="form-row">
                <label>Allowed methods <input name="allowedMethods" required value="GET, POST"></label>
                <label>Rate limit <input name="requestsPerMinute" type="number" min="1" max="600" value="120"></label>
              </div>
              <label class="checkbox-row"><input name="allowVaultReferencesOnly" type="checkbox" checked> Vault references only</label>
              <label class="checkbox-row"><input name="destructiveAllowed" type="checkbox"> Allow destructive actions</label>
            </details>
          </div>
          <section id="ai-configuration" class="ai-config-strip" aria-label="AI Configuration">
            <div class="panel-header">
              <h3>AI Configuration</h3>
              <span id="ai-config-status" class="status-pill">needs setup</span>
            </div>
            <div class="form-row">
              <label for="ai-base-url">Base URL <input id="ai-base-url" name="aiBaseUrl" required value="https://api.openai.com/v1" placeholder="https://api.openai.com/v1"></label>
              <label for="ai-model">Model <input id="ai-model" name="aiModel" required value="gpt-4.1-mini" placeholder="gpt-4.1-mini"></label>
            </div>
            <label for="ai-api-key">Server API key <input id="ai-api-key" name="aiApiKey" type="password" autocomplete="off" placeholder="Set OPENAI_API_KEY before starting the API"></label>
            <div class="form-row automation-controls">
              <label for="automation-mode">Automation mode
                <select id="automation-mode" name="automationMode">
                  <option value="safe_4" selected>Safe 4 ticks</option>
                  <option value="single">Single tick</option>
                  <option value="until_review">Until review gate</option>
                  <option value="until_evidence">Until evidence appears</option>
                  <option value="until_report">Until report-ready</option>
                </select>
              </label>
              <label for="automation-depth">Depth
                <select id="automation-depth" name="automationDepth">
                  <option value="2">2 ticks</option>
                  <option value="4" selected>4 ticks</option>
                  <option value="8">8 ticks</option>
                  <option value="12">12 ticks</option>
                </select>
              </label>
            </div>
            <div class="inline-actions ai-actions launch-actions">
              <button id="start-automated-pentest" class="primary-start" type="button">Start Automated AI Pentest</button>
              <button id="apply-ai-config" type="button">Apply AI Worker</button>
              <button type="submit">Create Run Only</button>
            </div>
            <label class="launch-goal-field">Goal <textarea name="goal" required rows="3">Use AI to run an authorized, evidence-backed penetration test against the target.</textarea></label>
            <p class="muted runtime-note">Current runtime: Codex CLI worker using OpenAI-compatible env vars. Direct HTTP provider mode is not enabled in this local shell.</p>
            <p id="ai-config-summary" class="muted">Base URL and model are saved locally. API keys are not stored in browser or run state.</p>
            <details id="worker-json-details" class="advanced-field worker-json-details">
              <summary>Advanced Worker JSON</summary>
              <label>Worker preset
                <select id="worker-preset-select" name="workerPreset">
                  <option value="ai" selected>AI Provider</option>
                  <option value="mock">Mock Worker</option>
                  <option value="codex">Codex CLI</option>
                  <option value="claude">Claude Code CLI</option>
                  <option value="claude_codex">Claude + Codex</option>
                  <option value="custom">Custom JSON</option>
                </select>
              </label>
              <label>Worker pool JSON <textarea id="worker-pool-json" name="workerPool" required rows="7"></textarea></label>
            </details>
          </section>
        </div>
      </form>
    </section>
    <main class="shell">
      <aside class="sidebar mission-rail" aria-label="Runs">
        <section id="run-history-panel" class="panel run-switcher">
          <div class="panel-header">
            <div>
              <h2>Run History</h2>
              <p id="run-history-summary" class="muted">0 runs</p>
            </div>
            <div class="run-history-actions">
              <button id="toggle-run-history" type="button" aria-controls="run-history-body" aria-expanded="false">Show History</button>
              <button id="refresh-runs" type="button" title="Refresh runs">Refresh</button>
            </div>
          </div>
          <div id="run-history-body" class="run-history-body">
            <label class="run-search-control" for="run-search">Search runs
              <input id="run-search" type="search" placeholder="target, phase, status, or id" autocomplete="off">
            </label>
            <div id="run-list" class="run-list empty">No runs loaded.</div>
          </div>
        </section>
        <section class="panel advanced-only">
          <div class="panel-header">
            <h2>Program Scope Import</h2>
            <span id="program-scope-count" class="status-pill">0 imports</span>
          </div>
          <form id="program-scope-form" class="stack">
            <div class="form-row">
              <label>Format
                <select name="format">
                  <option value="hackerone">HackerOne</option>
                  <option value="bugcrowd">Bugcrowd</option>
                  <option value="src">SRC</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="generic_json">Generic JSON</option>
                </select>
              </label>
              <label>Source <input name="source" value="program-scope.json"></label>
            </div>
            <label>Program JSON <textarea name="content" rows="8" placeholder="{ &quot;in_scope&quot;: [&quot;app.example.com&quot;], &quot;out_of_scope&quot;: [&quot;admin.example.com&quot;] }"></textarea></label>
            <button id="submit-program-scope" type="submit" disabled>Import Scope</button>
          </form>
          <ul id="program-scope-list" class="compact-list"></ul>
        </section>
      </aside>
      <section class="workspace">
        <div id="message" class="message" role="status" aria-live="polite"></div>
        <section id="current-run" class="panel hero-panel">
          <div class="hero-copy">
            <p class="eyebrow">Current run</p>
            <h2 id="run-title">No run selected</h2>
            <p id="run-goal" class="muted">Create or select a run to inspect progress.</p>
            <div class="hero-safety" aria-label="Run safety posture">
              <span class="status-pill">Scope gated</span>
              <span class="status-pill">Evidence first</span>
              <span class="status-pill">Local token</span>
            </div>
          </div>
          <div class="actions">
            <button id="dispatch-once" type="button" disabled>Dispatch</button>
            <button id="dispatch-auto" type="button" disabled>Auto 4 ticks</button>
            <button id="toggle-advanced" type="button">Show Advanced</button>
          </div>
        </section>
        <section class="metric-grid run-metrics" aria-label="Progress metrics">
          <div class="metric"><span>Phase</span><strong id="metric-phase">-</strong></div>
          <div class="metric"><span>Facts</span><strong id="metric-facts">0</strong></div>
          <div class="metric"><span>Intents</span><strong id="metric-intents">0</strong></div>
          <div class="metric"><span>Evidence</span><strong id="metric-evidence">0</strong></div>
          <div class="metric"><span>Findings</span><strong id="metric-findings">0</strong></div>
          <div class="metric"><span>Approvals</span><strong id="metric-approvals">0</strong></div>
        </section>
        <section id="simple-console" class="panel simple-panel priority-panel">
          <div class="panel-header">
            <h2>Simple Pentest</h2>
            <span id="simple-status" class="status-pill">No run</span>
          </div>
          <p id="simple-summary" class="flow-summary">Create or select a run, then press Continue. The platform will keep scope, evidence, and report gates visible.</p>
          <section class="metric-grid" aria-label="Simple pentest metrics">
            <div class="metric"><span>Current step</span><strong id="simple-current-step">-</strong></div>
            <div class="metric"><span>Next best action</span><strong id="simple-next-action">-</strong></div>
            <div class="metric"><span>Evidence collected</span><strong id="simple-evidence">0</strong></div>
            <div class="metric"><span>Reportable findings</span><strong id="simple-findings">0</strong></div>
          </section>
          <div class="simple-actions">
            <button id="simple-continue" type="button" disabled>Continue</button>
            <button id="simple-auto" type="button" disabled>Auto Progress</button>
            <button id="simple-report" type="button" disabled>Generate Report</button>
          </div>
          <div class="split">
            <div>
              <h3>Progress</h3>
              <ol id="simple-step-list" class="simple-steps"></ol>
            </div>
            <div>
              <h3>AI Reasoning</h3>
              <ul id="simple-thought-list" class="compact-list"></ul>
              <h3 class="stack-heading">Needs You</h3>
              <ul id="simple-action-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section id="mission-control-panel" class="panel mission-panel priority-panel">
          <div class="panel-header">
            <h2>Mission Control</h2>
            <span id="mission-control-status" class="status-pill">Idle</span>
          </div>
          <p id="mission-control-headline" class="flow-summary">Create or select a run to inspect mission progress.</p>
          <section class="metric-grid" aria-label="Mission control metrics">
            <div class="metric"><span>Top priority</span><strong id="mission-top-priority">-</strong></div>
            <div class="metric"><span>Evidence review</span><strong id="mission-evidence-review">0/0</strong></div>
            <div class="metric"><span>Healthy Workers</span><strong id="mission-workers">0</strong></div>
            <div class="metric"><span>Delivery</span><strong id="mission-delivery">-</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Mission Lanes</h3>
              <ul id="mission-lane-list" class="compact-list"></ul>
              <h3 class="stack-heading">Reasoning Trail</h3>
              <ul id="mission-trail-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Why Now</h3>
              <ul id="mission-why-list" class="compact-list"></ul>
              <h3 class="stack-heading">Operator Actions</h3>
              <ul id="mission-action-list" class="compact-list"></ul>
              <h3 class="stack-heading">Acceptance Gates</h3>
              <ul id="mission-gate-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section id="runtime-ops-panel" class="panel">
          <div class="panel-header">
            <h2>Runtime Operations</h2>
            <span id="runtime-ops-status" class="status-pill">Not loaded</span>
          </div>
          <p id="runtime-ops-summary" class="flow-summary">Create or select a run to inspect runtime events, sessions, and sandbox bindings.</p>
          <section class="metric-grid" aria-label="Runtime operations metrics">
            <div class="metric"><span>Runtime events</span><strong id="runtime-ops-events">0</strong></div>
            <div class="metric"><span>Trace spans</span><strong id="runtime-ops-spans">0</strong></div>
            <div class="metric"><span>Active sessions</span><strong id="runtime-ops-sessions">0</strong></div>
            <div class="metric"><span>Healthy Workers</span><strong id="runtime-ops-workers">0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Runtime Lanes</h3>
              <ul id="runtime-ops-lane-list" class="compact-list"></ul>
              <h3 class="stack-heading">Event Contract</h3>
              <ul id="runtime-ops-contract-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Runtime Activity</h3>
              <ul id="runtime-ops-event-list" class="compact-list"></ul>
              <h3 class="stack-heading">Operator Actions</h3>
              <ul id="runtime-ops-action-list" class="compact-list"></ul>
              <h3 class="stack-heading">Safety Notes</h3>
              <ul id="runtime-ops-safety-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section id="agent-workbench-panel" class="panel workbench-panel priority-panel">
          <div class="panel-header">
            <h2>Agent Workbench</h2>
            <span id="workbench-phase" class="status-pill">Idle</span>
          </div>
          <p id="workbench-summary" class="flow-summary">Create or select a run to inspect the Agent Workbench.</p>
          <section class="metric-grid" aria-label="Agent workbench metrics">
            <div class="metric"><span>Queued intents</span><strong id="workbench-queued-metric">0</strong></div>
            <div class="metric"><span>Active intents</span><strong id="workbench-active-metric">0</strong></div>
            <div class="metric"><span>Unreviewed evidence</span><strong id="workbench-evidence-metric">0</strong></div>
            <div class="metric"><span>Blockers</span><strong id="workbench-blocker-metric">0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Workbench Lanes</h3>
              <ul id="workbench-lane-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Next Actions</h3>
              <ul id="workbench-action-list" class="compact-list"></ul>
              <h3 class="stack-heading">Blockers</h3>
              <ul id="workbench-blocker-list" class="compact-list"></ul>
              <h3 class="stack-heading">Recent Events</h3>
              <ul id="workbench-event-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Search Plan</h2>
            <div class="inline-actions">
              <span id="search-plan-count" class="status-pill">0 items</span>
              <button id="advance-search-plan" type="button" disabled>Advance</button>
            </div>
          </div>
          <p id="search-plan-summary" class="muted">Create or select a run to inspect the search plan.</p>
          <ul id="search-plan-list" class="compact-list"></ul>
          <h3 class="stack-heading">Scoring</h3>
          <ul id="search-plan-note-list" class="compact-list"></ul>
        </section>
        <section id="telemetry-panel" class="panel">
          <div class="panel-header">
            <h2>Telemetry & Eval</h2>
            <div class="inline-actions">
              <span id="telemetry-count" class="status-pill">0 spans</span>
              <button id="evaluate-run" type="button" disabled>Evaluate</button>
            </div>
          </div>
          <section class="metric-grid" aria-label="Telemetry metrics">
            <div class="metric"><span>Trace spans</span><strong id="metric-spans">0</strong></div>
            <div class="metric"><span>Runtime</span><strong id="metric-runtime">0ms</strong></div>
            <div class="metric"><span>Est. cost</span><strong id="metric-cost">$0.00</strong></div>
            <div class="metric"><span>Eval score</span><strong id="metric-eval">-</strong></div>
          </section>
          <ul id="eval-check-list" class="compact-list"></ul>
          <div class="panel-header stack-heading">
            <h3>Run Capability Radar</h3>
            <span id="capability-radar-status" class="status-pill">thin</span>
          </div>
          <section class="metric-grid" aria-label="Run capability radar metrics">
            <div class="metric"><span>Overall capability</span><strong id="capability-radar-overall">0</strong></div>
            <div class="metric"><span>Evidence depth</span><strong id="capability-radar-evidence">0</strong></div>
            <div class="metric"><span>Tool ecosystem</span><strong id="capability-radar-tools">0</strong></div>
            <div class="metric"><span>Worker performance</span><strong id="capability-radar-workers">0</strong></div>
          </section>
          <ul id="capability-radar-list" class="compact-list"></ul>
          <ul id="capability-radar-hint-list" class="compact-list"></ul>
          <div class="panel-header stack-heading">
            <h3>Delivery Readiness</h3>
            <span id="delivery-readiness-status" class="status-pill">needs_review</span>
          </div>
          <ul id="delivery-readiness-list" class="compact-list"></ul>
          <ul id="delivery-next-list" class="compact-list"></ul>
          <div class="panel-header stack-heading">
            <h3>Evidence Quality Index</h3>
            <span id="evidence-quality-status" class="status-pill">blocked</span>
          </div>
          <p id="evidence-quality-summary" class="muted">Create or select a run to inspect evidence quality.</p>
          <section class="metric-grid" aria-label="Evidence quality metrics">
            <div class="metric"><span>Evidence score</span><strong id="evidence-quality-score">0</strong></div>
            <div class="metric"><span>Useful evidence</span><strong id="evidence-quality-useful">0/0</strong></div>
            <div class="metric"><span>Replayable evidence</span><strong id="evidence-quality-replayable">0</strong></div>
            <div class="metric"><span>Redaction ready</span><strong id="evidence-quality-redaction">0/0</strong></div>
            <div class="metric"><span>Finding gates</span><strong id="evidence-quality-findings">0/0</strong></div>
            <div class="metric"><span>Missing blobs</span><strong id="evidence-quality-missing">0</strong></div>
          </section>
          <div class="split scorecard-split">
            <div>
              <h3>Quality Dimensions</h3>
              <ul id="evidence-quality-dimension-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Finding Gates</h3>
              <ul id="evidence-quality-finding-list" class="compact-list"></ul>
            </div>
          </div>
          <h3 class="stack-heading">Evidence Actions</h3>
          <ul id="evidence-quality-action-list" class="compact-list"></ul>
          <div class="split scorecard-split">
            <div>
              <h3>Worker Scorecard</h3>
              <ul id="worker-scorecard-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Tool Scorecard</h3>
              <ul id="tool-scorecard-list" class="compact-list"></ul>
            </div>
          </div>
          <h3 class="stack-heading">Worker Comparison</h3>
          <ul id="worker-comparison-list" class="compact-list"></ul>
          <ul id="scorecard-recommendation-list" class="compact-list"></ul>
          <div class="panel-header stack-heading">
            <h3>Worker Leaderboard</h3>
            <span id="worker-leaderboard-count" class="status-pill">0 workers</span>
          </div>
          <section class="metric-grid" aria-label="Worker leaderboard metrics">
            <div class="metric"><span>Worker tasks</span><strong id="leaderboard-worker-tasks">0</strong></div>
            <div class="metric"><span>Exercised Workers</span><strong id="leaderboard-exercised-workers">0/0</strong></div>
            <div class="metric"><span>Evidence contribution</span><strong id="leaderboard-evidence">0</strong></div>
            <div class="metric"><span>Finding influence</span><strong id="leaderboard-findings">0</strong></div>
          </section>
          <ul id="worker-leaderboard-list" class="compact-list"></ul>
          <ul id="worker-leaderboard-type-list" class="compact-list"></ul>
          <ul id="worker-leaderboard-action-list" class="compact-list"></ul>
        </section>
        <section id="workers-panel" class="panel">
          <div class="panel-header">
            <h2>Agent Workers</h2>
            <span id="worker-count" class="status-pill">0 healthy</span>
          </div>
          <ul id="worker-list" class="compact-list"></ul>
          <div class="panel-header stack-heading">
            <h3>Worker Selection Policy</h3>
            <span id="worker-selection-status" class="status-pill">No policy</span>
          </div>
          <p id="worker-selection-summary" class="muted">Create or select a run to inspect Worker selection.</p>
          <section class="metric-grid" aria-label="Worker selection metrics">
            <div class="metric"><span>Recommended Worker</span><strong id="worker-selection-picked">-</strong></div>
            <div class="metric"><span>Next task</span><strong id="worker-selection-task">-</strong></div>
            <div class="metric"><span>Eligible Workers</span><strong id="worker-selection-eligible">0/0</strong></div>
            <div class="metric"><span>Evidence Workers</span><strong id="worker-selection-evidence">0</strong></div>
          </section>
          <ul id="worker-selection-list" class="compact-list"></ul>
          <ul id="worker-selection-action-list" class="compact-list"></ul>
          <div class="panel-header stack-heading">
            <h3>Worker Evaluation Plan</h3>
            <span id="worker-eval-status" class="status-pill">insufficient</span>
          </div>
          <p id="worker-eval-summary" class="muted">Create or select a run to inspect Worker evaluation readiness.</p>
          <section class="metric-grid" aria-label="Worker evaluation metrics">
            <div class="metric"><span>Task coverage</span><strong id="worker-eval-coverage">0/0</strong></div>
            <div class="metric"><span>Comparable Workers</span><strong id="worker-eval-comparable">0</strong></div>
            <div class="metric"><span>Evidence Workers</span><strong id="worker-eval-evidence">0</strong></div>
            <div class="metric"><span>Eval cost</span><strong id="worker-eval-cost">$0.00</strong></div>
          </section>
          <div class="split scorecard-split">
            <div>
              <h3>Worker Eval Cards</h3>
              <ul id="worker-eval-card-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Eval Dimensions</h3>
              <ul id="worker-eval-dimension-list" class="compact-list"></ul>
            </div>
          </div>
          <h3 class="stack-heading">Eval Experiments</h3>
          <ul id="worker-eval-experiment-list" class="compact-list"></ul>
          <h3 class="stack-heading">Eval Actions</h3>
          <ul id="worker-eval-action-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Local Execution Node</h2>
            <span id="execution-node-status" class="status-pill">partial</span>
          </div>
          <p id="execution-node-summary" class="muted">Create or select a run to inspect the local execution node.</p>
          <section class="metric-grid" aria-label="Local execution node metrics">
            <div class="metric"><span>Runtime profiles</span><strong id="execution-node-profiles">0/0</strong></div>
            <div class="metric"><span>Scanner templates</span><strong id="execution-node-templates">0/0</strong></div>
            <div class="metric"><span>Healthy Workers</span><strong id="execution-node-workers">0/0</strong></div>
            <div class="metric"><span>Active local sessions</span><strong id="execution-node-sessions">0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Runtime Surfaces</h3>
              <ul id="execution-node-runtime-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Node Gates</h3>
              <ul id="execution-node-gate-list" class="compact-list"></ul>
              <h3 class="stack-heading">Node Actions</h3>
              <ul id="execution-node-action-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Desktop Runner Readiness</h2>
            <span id="desktop-readiness-status" class="status-pill">planned</span>
          </div>
          <p id="desktop-readiness-summary" class="muted">Create or select a run to inspect desktop runner productization readiness.</p>
          <section class="metric-grid" aria-label="Desktop runner readiness metrics">
            <div class="metric"><span>Ready components</span><strong id="desktop-ready-components">0</strong></div>
            <div class="metric"><span>Partial components</span><strong id="desktop-partial-components">0</strong></div>
            <div class="metric"><span>Planned gaps</span><strong id="desktop-planned-gaps">0</strong></div>
            <div class="metric"><span>Desktop sessions</span><strong id="desktop-local-sessions">0</strong></div>
            <div class="metric"><span>Desktop evidence</span><strong id="desktop-evidence-items">0</strong></div>
            <div class="metric"><span>Runnable templates</span><strong id="desktop-runnable-templates">0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Desktop Components</h3>
              <ul id="desktop-component-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Handoff Contracts</h3>
              <ul id="desktop-contract-list" class="compact-list"></ul>
              <h3 class="stack-heading">Desktop Actions</h3>
              <ul id="desktop-action-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Local Runner Workbench</h2>
            <div class="inline-actions">
              <span id="runner-workbench-status" class="status-pill">partial</span>
              <button id="prepare-runner-workbench" type="button" disabled>Prepare Runner</button>
            </div>
          </div>
          <p id="runner-workbench-summary" class="muted">Create or select a run to inspect local runner capture readiness.</p>
          <section class="metric-grid" aria-label="Local runner workbench metrics">
            <div class="metric"><span>Browser sessions</span><strong id="runner-workbench-browser">0</strong></div>
            <div class="metric"><span>Proxy sessions</span><strong id="runner-workbench-proxy">0</strong></div>
            <div class="metric"><span>HTTP evidence</span><strong id="runner-workbench-http">0</strong></div>
            <div class="metric"><span>Reviewed evidence</span><strong id="runner-workbench-reviewed">0/0</strong></div>
            <div class="metric"><span>Local-only evidence</span><strong id="runner-workbench-local-only">0</strong></div>
            <div class="metric"><span>Credential refs</span><strong id="runner-workbench-credentials">0</strong></div>
          </section>
          <h3 class="stack-heading">Capture Profiles</h3>
          <ul id="runner-workbench-profile-list" class="compact-list"></ul>
          <div class="split">
            <div>
              <h3>Capture Surfaces</h3>
              <ul id="runner-workbench-surface-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Capture Gates</h3>
              <ul id="runner-workbench-gate-list" class="compact-list"></ul>
            </div>
          </div>
          <div class="split scorecard-split">
            <div>
              <h3>Proxy Setup</h3>
              <ul id="runner-workbench-proxy-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Recent Capture Evidence</h3>
              <ul id="runner-workbench-evidence-list" class="compact-list"></ul>
            </div>
          </div>
          <h3 class="stack-heading">Runner Next Actions</h3>
          <ul id="runner-workbench-action-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Agent Framework</h2>
            <span id="agent-framework-status" class="status-pill">Not loaded</span>
          </div>
          <p id="agent-framework-summary" class="muted">Agent framework report has not been loaded.</p>
          <section class="metric-grid" aria-label="Agent framework metrics">
            <div class="metric"><span>Worker adapters</span><strong id="framework-worker-metric">0</strong></div>
            <div class="metric"><span>High-level tools</span><strong id="framework-tool-metric">0</strong></div>
            <div class="metric"><span>Scanner templates</span><strong id="framework-template-metric">0</strong></div>
            <div class="metric"><span>Domain skills</span><strong id="framework-skill-metric">0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Kernel</h3>
              <ul id="agent-framework-kernel-list" class="compact-list"></ul>
              <h3 class="stack-heading">Invariants</h3>
              <ul id="agent-framework-invariant-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Extension Points</h3>
              <ul id="agent-framework-extension-list" class="compact-list"></ul>
              <h3 class="stack-heading">Next Steps</h3>
              <ul id="agent-framework-next-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Agent Harness</h2>
            <span id="agent-harness-status" class="status-pill">Not loaded</span>
          </div>
          <p id="agent-harness-summary" class="muted">Create or select a run to inspect agent harness readiness.</p>
          <section class="metric-grid" aria-label="Agent harness metrics">
            <div class="metric"><span>Harness score</span><strong id="harness-score-metric">0</strong></div>
            <div class="metric"><span>Ready cells</span><strong id="harness-ready-metric">0</strong></div>
            <div class="metric"><span>Partial cells</span><strong id="harness-partial-metric">0</strong></div>
            <div class="metric"><span>Harness gaps</span><strong id="harness-gap-metric">0</strong></div>
            <div class="metric"><span>Fixture tasks</span><strong id="harness-fixture-metric">0</strong></div>
            <div class="metric"><span>Acceptance gates</span><strong id="harness-gate-metric">0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Harness Cells</h3>
              <ul id="agent-harness-cell-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Run Controls</h3>
              <ul id="agent-harness-control-list" class="compact-list"></ul>
              <h3 class="stack-heading">Harness Actions</h3>
              <ul id="agent-harness-action-list" class="compact-list"></ul>
            </div>
          </div>
          <div class="panel-header stack-heading">
            <h3>Harness Eval Plan</h3>
            <span id="agent-harness-plan-status" class="status-pill">Not loaded</span>
          </div>
          <p id="agent-harness-plan-summary" class="muted">Create or select a run to inspect harness fixture tasks.</p>
          <div class="split">
            <div>
              <h3>Fixture Tasks</h3>
              <ul id="agent-harness-fixture-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Acceptance Gates</h3>
              <ul id="agent-harness-gate-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Reference Benchmark</h2>
            <span id="reference-benchmark-status" class="status-pill">Not loaded</span>
          </div>
          <p id="reference-benchmark-summary" class="muted">Create or select a run to compare platform capability against reference projects.</p>
          <section class="metric-grid" aria-label="Reference benchmark metrics">
            <div class="metric"><span>Reference projects</span><strong id="reference-project-metric">0</strong></div>
            <div class="metric"><span>Matched areas</span><strong id="reference-matched-metric">0</strong></div>
            <div class="metric"><span>Partial areas</span><strong id="reference-partial-metric">0</strong></div>
            <div class="metric"><span>Commercial blockers</span><strong id="reference-blocker-metric">0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Capability Comparison</h3>
              <ul id="reference-dimension-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Project Lessons</h3>
              <ul id="reference-project-list" class="compact-list"></ul>
              <h3 class="stack-heading">Benchmark Actions</h3>
              <ul id="reference-action-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Worker Envelope Preview</h2>
            <span id="worker-envelope-status" class="status-pill">No preview</span>
          </div>
          <div class="inline-actions">
            <select id="worker-envelope-task" aria-label="Worker envelope task">
              <option value="auto">Auto</option>
              <option value="bootstrap">Bootstrap</option>
              <option value="reason">Reason</option>
              <option value="explore">Explore</option>
            </select>
            <button id="preview-worker-envelope" type="button" disabled>Preview Envelope</button>
          </div>
          <ul id="worker-envelope-list" class="compact-list stack-heading"></ul>
          <pre id="worker-envelope-json" class="evidence-viewer-content"></pre>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Tool Catalog</h2>
            <span id="tool-catalog-count" class="status-pill">0 tools</span>
          </div>
          <ul id="tool-catalog-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Scanner Template Policies</h2>
            <span id="template-policy-count" class="status-pill">0 templates</span>
          </div>
          <ul id="template-policy-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Toolbox Policy</h2>
            <span id="toolbox-policy-status" class="status-pill">external disabled</span>
          </div>
          <ul id="toolbox-policy-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Toolbox Doctor</h2>
            <span id="toolbox-doctor-count" class="status-pill">0 adapters</span>
          </div>
          <p id="toolbox-doctor-summary" class="muted">Toolbox readiness has not been checked.</p>
          <ul id="toolbox-doctor-action-list" class="compact-list"></ul>
          <ul id="toolbox-doctor-adapter-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Runtime Activation Plan</h2>
            <span id="runtime-activation-status" class="status-pill">0 steps</span>
          </div>
          <p id="runtime-activation-summary" class="muted">Create or select a run to inspect governed runtime activation.</p>
          <section class="metric-grid" aria-label="Runtime activation metrics">
            <div class="metric"><span>Runnable templates</span><strong id="runtime-activation-runnable">0/0</strong></div>
            <div class="metric"><span>Ready adapters</span><strong id="runtime-activation-adapters">0/0</strong></div>
            <div class="metric"><span>Operator actions</span><strong id="runtime-activation-actions">0</strong></div>
            <div class="metric"><span>Blocked steps</span><strong id="runtime-activation-blocked">0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Activation Steps</h3>
              <ul id="runtime-activation-step-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Runtime Profiles</h3>
              <ul id="runtime-activation-profile-list" class="compact-list"></ul>
              <h3 class="stack-heading">Activation Order</h3>
              <ul id="runtime-activation-order-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section id="tool-ecosystem-panel" class="panel">
          <div class="panel-header">
            <h2>Tool Ecosystem Workbench</h2>
            <span id="tool-ecosystem-status" class="status-pill">thin</span>
          </div>
          <p id="tool-ecosystem-summary" class="muted">Create or select a run to inspect commercial tool ecosystem readiness.</p>
          <section class="metric-grid" aria-label="Tool ecosystem workbench metrics">
            <div class="metric"><span>Runnable templates</span><strong id="tool-ecosystem-runnable">0/0</strong></div>
            <div class="metric"><span>Mapped tools</span><strong id="tool-ecosystem-mapped">0/0</strong></div>
            <div class="metric"><span>Recommended packs</span><strong id="tool-ecosystem-packs">0</strong></div>
            <div class="metric"><span>Evidence loop</span><strong id="tool-ecosystem-evidence-loop">0/0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Capability Lanes</h3>
              <ul id="tool-ecosystem-lane-list" class="compact-list"></ul>
              <h3 class="stack-heading">Recommended Packs</h3>
              <ul id="tool-ecosystem-pack-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Ecosystem Gates</h3>
              <ul id="tool-ecosystem-gate-list" class="compact-list"></ul>
              <h3 class="stack-heading">Operator Actions</h3>
              <ul id="tool-ecosystem-action-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Toolbox Bundles</h2>
            <span id="toolbox-bundle-count" class="status-pill">0 bundles</span>
          </div>
          <form id="toolbox-bundle-form" class="stack">
            <label>Bundle manifest JSON <textarea id="toolbox-bundle-json" name="bundle" rows="8"></textarea></label>
            <button type="submit">Register Bundle</button>
          </form>
          <ul id="toolbox-bundle-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Ecosystem Coverage</h2>
            <span id="ecosystem-coverage-status" class="status-pill">0%</span>
          </div>
          <p id="ecosystem-coverage-summary" class="muted">Create or select a run to inspect governed ecosystem coverage.</p>
          <section class="metric-grid" aria-label="Ecosystem coverage metrics">
            <div class="metric"><span>Mapped connector tools</span><strong id="ecosystem-mapped-tools">0/0</strong></div>
            <div class="metric"><span>Enabled connectors</span><strong id="ecosystem-enabled-connectors">0/0</strong></div>
            <div class="metric"><span>Enabled bundles</span><strong id="ecosystem-enabled-bundles">0/0</strong></div>
            <div class="metric"><span>Capability areas</span><strong id="ecosystem-capability-areas">0/0</strong></div>
          </section>
          <h3 class="stack-heading">Coverage Areas</h3>
          <ul id="ecosystem-area-list" class="compact-list"></ul>
          <h3 class="stack-heading">Unmapped Tool Gaps</h3>
          <ul id="ecosystem-gap-list" class="compact-list"></ul>
          <h3 class="stack-heading">Ecosystem Actions</h3>
          <ul id="ecosystem-action-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Tool Integration Backlog</h2>
            <span id="tool-backlog-count" class="status-pill">0 items</span>
          </div>
          <p id="tool-backlog-summary" class="muted">Create or select a run to inspect governed tool integration backlog.</p>
          <section class="metric-grid" aria-label="Tool integration backlog metrics">
            <div class="metric"><span>Scanner candidates</span><strong id="tool-backlog-scanners">0</strong></div>
            <div class="metric"><span>Runtime gaps</span><strong id="tool-backlog-runtimes">0</strong></div>
            <div class="metric"><span>Domain Skill candidates</span><strong id="tool-backlog-skills">0</strong></div>
            <div class="metric"><span>High priority</span><strong id="tool-backlog-priority">0</strong></div>
          </section>
          <ul id="tool-backlog-list" class="compact-list"></ul>
          <ul id="tool-backlog-action-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Connector Registry</h2>
            <span id="connector-count" class="status-pill">0 connectors</span>
          </div>
          <form id="connector-form" class="stack">
            <label>Connector manifest JSON <textarea id="connector-json" name="connector" rows="8"></textarea></label>
            <button type="submit">Register Connector</button>
          </form>
          <ul id="connector-list" class="compact-list"></ul>
          <h3 class="stack-heading">Connector Plan</h3>
          <ul id="connector-plan-list" class="compact-list"></ul>
          <h3 class="stack-heading">Connector Runs</h3>
          <ul id="connector-run-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Toolbox Profiles</h2>
            <span id="toolbox-profile-count" class="status-pill">0 profiles</span>
          </div>
          <ul id="toolbox-profile-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Capability Matrix</h2>
            <span id="capability-count" class="status-pill">0 areas</span>
          </div>
          <ul id="capability-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Domain Skills</h2>
            <span id="domain-skill-count" class="status-pill">0 skills</span>
          </div>
          <ul id="domain-skill-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Domain Skill Readiness</h2>
            <span id="domain-skill-readiness-status" class="status-pill">needs_input</span>
          </div>
          <p id="domain-skill-readiness-summary" class="muted">Create or select a run to inspect rigid domain Skill readiness.</p>
          <section class="metric-grid" aria-label="Domain skill readiness metrics">
            <div class="metric"><span>Ready domains</span><strong id="domain-skill-readiness-ready">0</strong></div>
            <div class="metric"><span>Enabled Skills</span><strong id="domain-skill-readiness-enabled">0/0</strong></div>
            <div class="metric"><span>Domain artifacts</span><strong id="domain-skill-readiness-artifacts">0</strong></div>
            <div class="metric"><span>Reviewed evidence</span><strong id="domain-skill-readiness-reviewed">0/0</strong></div>
          </section>
          <div class="split">
            <div>
              <h3>Domain Readiness Cards</h3>
              <ul id="domain-skill-readiness-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Skill Gates</h3>
              <ul id="domain-skill-gate-list" class="compact-list"></ul>
              <h3 class="stack-heading">Skill Actions</h3>
              <ul id="domain-skill-action-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>PoC Library</h2>
            <span id="poc-template-count" class="status-pill">0 templates</span>
          </div>
          <ul id="poc-template-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Autonomy Plan</h2>
            <div class="inline-actions">
              <span id="strategy-count" class="status-pill">0 recommendations</span>
              <button id="autopilot-tick" type="button" disabled>Autopilot Tick</button>
            </div>
          </div>
          <p id="strategy-summary" class="muted">Create or select a run to inspect autonomous strategy.</p>
          <ul id="strategy-list" class="compact-list"></ul>
          <div class="panel-header stack-heading">
            <h3>Recommendation Preview</h3>
            <span id="strategy-plan-status" class="status-pill">No preview</span>
          </div>
          <ul id="strategy-plan-list" class="compact-list"></ul>
          <ul id="strategy-hints" class="compact-list"></ul>
        </section>
        <section class="panel surface-panel">
          <div class="panel-header">
            <h2>Attack Surface</h2>
            <span id="surface-count" class="status-pill">0 assets</span>
          </div>
          <p id="surface-summary" class="flow-summary">Create or select a run to inspect attack surface.</p>
          <section class="metric-grid" aria-label="Attack surface metrics">
            <div class="metric"><span>Assets</span><strong id="surface-assets-metric">0</strong></div>
            <div class="metric"><span>Endpoints</span><strong id="surface-endpoints-metric">0</strong></div>
            <div class="metric"><span>Technologies</span><strong id="surface-tech-metric">0</strong></div>
            <div class="metric"><span>Blockers</span><strong id="surface-blockers-metric">0</strong></div>
          </section>
          <div class="surface-grid">
            <div>
              <h3>Assets</h3>
              <ul id="surface-asset-list" class="compact-list"></ul>
              <h3 class="stack-heading">Technologies</h3>
              <ul id="surface-tech-list" class="compact-list"></ul>
            </div>
            <div>
              <h3>Observed Endpoints</h3>
              <ul id="surface-endpoint-list" class="compact-list"></ul>
              <h3 class="stack-heading">Search Frontier</h3>
              <ul id="surface-frontier-list" class="compact-list"></ul>
              <div class="panel-header stack-heading">
                <h3>Frontier Preview</h3>
                <span id="surface-frontier-plan-status" class="status-pill">No preview</span>
              </div>
              <ul id="surface-frontier-plan-list" class="compact-list"></ul>
            </div>
          </div>
          <h3 class="stack-heading">Blockers</h3>
          <ul id="surface-blocker-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Tool Packs</h2>
            <span id="tool-pack-status" class="status-pill">No pack preview</span>
          </div>
          <form id="tool-pack-form" class="stack">
            <label>Pack
              <select id="tool-pack-select" name="pack"></select>
            </label>
            <label>Target <input name="target" placeholder="Use current run target"></label>
            <div class="inline-actions">
              <button id="preview-tool-pack" type="button" disabled>Preview Pack</button>
              <button id="invoke-tool-pack" type="submit" disabled>Run Pack</button>
            </div>
          </form>
          <ul id="tool-pack-plan-list" class="compact-list stack-heading"></ul>
          <h3 class="stack-heading">Pack Runs</h3>
          <ul id="tool-pack-run-list" class="compact-list"></ul>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2>Scanner Template</h2>
            <span id="scanner-plan-status" class="status-pill">No plan preview</span>
          </div>
          <form id="scanner-template-form" class="stack">
            <label>Template
              <select id="scanner-template-select" name="template"></select>
            </label>
            <label>Target <input name="target" placeholder="Use current run target"></label>
            <label>Risk level
              <select id="scanner-risk-level" name="riskLevel">
                <option value="R0">R0</option>
                <option value="R1">R1</option>
                <option value="R2">R2</option>
                <option value="R3">R3</option>
                <option value="R4">R4</option>
              </select>
            </label>
            <div class="inline-actions">
              <button id="preview-scanner-template" type="button" disabled>Preview Plan</button>
              <button id="submit-scanner-template" type="submit" disabled>Run Template</button>
            </div>
          </form>
          <ul id="scanner-plan-list" class="compact-list stack-heading"></ul>
        </section>
        <section id="assessment-flow-panel" class="panel flow-panel">
          <div class="panel-header">
            <h2>Assessment Flow</h2>
            <span id="flow-phase" class="status-pill">Idle</span>
          </div>
          <p id="flow-summary" class="flow-summary">Create or select a run to inspect reasoning flow.</p>
          <div class="flow-grid">
            <div>
              <h3>Reasoning Steps</h3>
              <ol id="flow-step-list" class="compact-list flow-list"></ol>
            </div>
            <div>
              <h3>Next actions</h3>
              <ul id="flow-next-list" class="compact-list"></ul>
              <h3 class="stack-heading">Risk notes</h3>
              <ul id="flow-risk-list" class="compact-list"></ul>
            </div>
          </div>
        </section>
        <section id="reasoning-workspace" class="board">
          <div class="panel">
            <div class="panel-header">
              <h2>Reasoning Board</h2>
              <span id="graph-status" class="status-pill">Idle</span>
            </div>
            <div class="split">
              <div>
                <h3>Facts</h3>
                <ul id="facts-list" class="compact-list"></ul>
              </div>
              <div>
                <h3>Intents</h3>
                <ul id="intents-list" class="compact-list"></ul>
              </div>
            </div>
          </div>
          <div class="panel timeline-panel">
            <div class="panel-header">
              <h2>Timeline</h2>
              <span id="event-count" class="status-pill">0 events</span>
            </div>
            <ol id="event-list" class="timeline"></ol>
          </div>
        </section>
        <section id="review-workspace" class="review-grid" aria-label="Review workspace">
          <div class="panel">
            <div class="panel-header">
              <h2>Review Queue</h2>
              <span id="approval-count" class="status-pill">0 pending</span>
            </div>
            <ul id="approval-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Tool Audit</h2>
              <span id="tool-count" class="status-pill">0 calls</span>
            </div>
            <ul id="tool-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Evidence Inbox</h2>
              <span id="evidence-count" class="status-pill">0 items</span>
            </div>
            <ul id="evidence-list" class="compact-list"></ul>
          </div>
          <div class="panel evidence-viewer-panel">
            <div class="panel-header">
              <h2>Evidence Viewer</h2>
              <span class="status-pill">Local only</span>
            </div>
            <strong id="evidence-viewer-title">No evidence selected.</strong>
            <div id="evidence-viewer-meta" class="run-meta">Local Evidence Engine content preview stays on this runner.</div>
            <pre id="evidence-viewer-content" class="evidence-viewer-content" data-no-i18n></pre>
            <div class="stack evidence-review-controls">
              <p id="evidence-review-status" class="muted">No review decision.</p>
              <label>Review note <textarea id="evidence-review-note" rows="3" placeholder="Why this evidence matters or what is missing."></textarea></label>
              <div class="item-actions">
                <button id="mark-evidence-useful" type="button" disabled>Mark useful</button>
                <button id="mark-evidence-needs-context" type="button" disabled>Needs context</button>
                <button id="mark-evidence-not-relevant" type="button" disabled>Not relevant</button>
                <button id="replay-evidence" type="button" disabled>Replay HTTP evidence</button>
                <button id="promote-evidence-finding" type="button" disabled>Promote to Finding</button>
              </div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Browser Session</h2>
              <div class="inline-actions">
                <span id="browser-session-count" class="status-pill">0 active</span>
                <button id="start-browser-session" type="button" disabled>Start</button>
              </div>
            </div>
            <form id="browser-navigate-form" class="stack">
              <label>Target <input name="target" required placeholder="https://app.example.com/profile"></label>
              <button id="submit-browser-navigate" type="submit" disabled>Navigate</button>
            </form>
            <ul id="browser-session-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Browser Snapshots</h2>
              <span id="browser-snapshot-count" class="status-pill">0 snapshots</span>
            </div>
            <form id="browser-snapshot-form" class="stack">
              <div class="form-row">
                <label>Source
                  <select name="source">
                    <option value="browser">Browser</option>
                    <option value="desktop">Desktop</option>
                    <option value="manual">Manual</option>
                  </select>
                </label>
                <label>Title <input name="title" placeholder="Login page rendered"></label>
              </div>
              <label>Target <input name="target" required placeholder="https://app.example.com/profile"></label>
              <label>Screenshot Base64 or data URL <textarea name="screenshotBase64" rows="4" placeholder="data:image/png;base64,..."></textarea></label>
              <label>Text/DOM preview <textarea name="textPreview" rows="5" placeholder="Visible text, DOM excerpt, or browser observation"></textarea></label>
              <button id="submit-browser-snapshot" type="submit" disabled>Capture Snapshot</button>
            </form>
            <ul id="browser-snapshot-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>OAST Inbox</h2>
              <div class="inline-actions">
                <span id="oast-session-count" class="status-pill">0 active</span>
                <button id="start-oast-session" type="button" disabled>Start</button>
              </div>
            </div>
            <ul id="oast-session-list" class="compact-list"></ul>
            <h3 class="stack-heading">Callbacks</h3>
            <ul id="oast-callback-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Proxy Session</h2>
              <div class="inline-actions">
                <span id="proxy-session-count" class="status-pill">0 active</span>
                <button id="start-proxy-session" type="button" disabled>Start</button>
              </div>
            </div>
            <ul id="proxy-session-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Credential References</h2>
              <span id="credential-reference-count" class="status-pill">0 credentials</span>
            </div>
            <form id="credential-reference-form" class="stack">
              <div class="form-row">
                <label>Label <input name="label" required placeholder="Viewer token"></label>
                <label>Role <input name="role" required placeholder="viewer"></label>
              </div>
              <label>Kind
                <select name="kind">
                  <option value="vault_reference">Vault reference</option>
                  <option value="header_placeholder">Header placeholder</option>
                  <option value="cookie_placeholder">Cookie placeholder</option>
                  <option value="account_note">Account note</option>
                </select>
              </label>
              <label>Placeholder <input name="placeholder" required value="vault://bugbounty/viewer-token"></label>
              <label>Allowed use <textarea name="allowedUse" required rows="3">browser.navigate
http.request
role-diff</textarea></label>
              <button id="submit-credential-reference" type="submit" disabled>Add Reference</button>
            </form>
            <ul id="credential-reference-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Access Reviews</h2>
              <span id="access-review-count" class="status-pill">0 reviews</span>
            </div>
            <form id="access-review-form" class="stack">
              <label>Title <input name="title" required value="Role access evidence comparison"></label>
              <label>Target <input name="target" required placeholder="Use current run target"></label>
              <div class="form-row">
                <label>Baseline credential ID <input name="baselineCredentialId" placeholder="credential_viewer"></label>
                <label>Comparison credential ID <input name="comparisonCredentialId" placeholder="credential_admin"></label>
              </div>
              <div class="form-row">
                <label>Baseline evidence ID <input name="baselineEvidenceId" required placeholder="evidence_viewer"></label>
                <label>Comparison evidence ID <input name="comparisonEvidenceId" required placeholder="evidence_admin"></label>
              </div>
              <button id="submit-access-review" type="submit" disabled>Compare Evidence</button>
            </form>
            <ul id="access-review-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>SARIF Imports</h2>
              <span id="sarif-import-count" class="status-pill">0 imports</span>
            </div>
            <form id="sarif-import-form" class="stack">
              <label>Source <input name="source" value="local-sarif.json"></label>
              <label class="checkbox-row"><input name="createFindings" type="checkbox" checked> Create candidate findings</label>
              <label>SARIF JSON <textarea name="content" rows="6" placeholder="{ &quot;version&quot;: &quot;2.1.0&quot;, &quot;runs&quot;: [] }"></textarea></label>
              <button id="submit-sarif-import" type="submit" disabled>Import SARIF</button>
            </form>
            <ul id="sarif-import-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Android Manifest</h2>
              <span id="android-manifest-count" class="status-pill">0 imports</span>
            </div>
            <form id="android-manifest-form" class="stack">
              <label>Source <input name="source" value="AndroidManifest.xml"></label>
              <label class="checkbox-row"><input name="createFindings" type="checkbox" checked> Create candidate findings</label>
              <label>Manifest XML <textarea name="content" rows="8" placeholder="&lt;manifest package=&quot;com.example.app&quot;&gt;...&lt;/manifest&gt;"></textarea></label>
              <button id="submit-android-manifest" type="submit" disabled>Import Manifest</button>
            </form>
            <ul id="android-manifest-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Cloud IAM</h2>
              <span id="cloud-iam-count" class="status-pill">0 imports</span>
            </div>
            <form id="cloud-iam-form" class="stack">
              <div class="form-row">
                <label>Provider
                  <select name="provider">
                    <option value="aws">AWS</option>
                    <option value="generic">Generic</option>
                  </select>
                </label>
                <label>Source <input name="source" value="iam-policy.json"></label>
              </div>
              <label class="checkbox-row"><input name="createFindings" type="checkbox" checked> Create candidate findings</label>
              <label>IAM Policy JSON <textarea name="content" rows="8" placeholder="{ &quot;Version&quot;: &quot;2012-10-17&quot;, &quot;Statement&quot;: [] }"></textarea></label>
              <button id="submit-cloud-iam" type="submit" disabled>Import IAM Policy</button>
            </form>
            <ul id="cloud-iam-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Identity Graph</h2>
              <span id="identity-graph-count" class="status-pill">0 imports</span>
            </div>
            <form id="identity-graph-form" class="stack">
              <div class="form-row">
                <label>Provider
                  <select name="provider">
                    <option value="bloodhound">BloodHound</option>
                    <option value="generic">Generic</option>
                  </select>
                </label>
                <label>Source <input name="source" value="identity-graph.json"></label>
              </div>
              <label class="checkbox-row"><input name="createFindings" type="checkbox" checked> Create candidate findings</label>
              <label>Identity Graph JSON <textarea name="content" rows="8" placeholder="{ &quot;nodes&quot;: [], &quot;edges&quot;: [] }"></textarea></label>
              <button id="submit-identity-graph" type="submit" disabled>Import Identity Graph</button>
            </form>
            <ul id="identity-graph-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>HTTP Capture</h2>
              <span id="capture-import-count" class="status-pill">0 imports</span>
            </div>
            <form id="http-capture-form" class="stack">
              <div class="form-row">
                <label>Source
                  <select name="source">
                    <option value="manual">Manual</option>
                    <option value="browser">Browser</option>
                    <option value="proxy">Proxy</option>
                  </select>
                </label>
                <label>Method
                  <select name="method">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </label>
              </div>
              <label>Target <input name="target" required placeholder="https://app.example.com/profile"></label>
              <label>Request headers <textarea name="requestHeaders" rows="3" placeholder="Authorization: Bearer ..."></textarea></label>
              <label>Request body preview <textarea name="requestBodyPreview" rows="3"></textarea></label>
              <div class="form-row">
                <label>Status <input name="status" type="number" min="100" max="599" value="200"></label>
                <label>Status text <input name="statusText" value="OK"></label>
              </div>
              <label>Response headers <textarea name="responseHeaders" rows="3" placeholder="Content-Type: application/json"></textarea></label>
              <label>Response body preview <textarea name="responseBodyPreview" rows="3"></textarea></label>
              <button id="submit-http-capture" type="submit" disabled>Capture Exchange</button>
            </form>
            <h3 class="stack-heading">HAR Import</h3>
            <form id="har-import-form" class="stack">
              <div class="form-row">
                <label>Source <input name="source" value="browser.har"></label>
                <label>Max entries <input name="maxEntries" type="number" min="1" max="200" value="100"></label>
              </div>
              <label>HAR JSON <textarea name="content" rows="6" placeholder="{ &quot;log&quot;: { &quot;entries&quot;: [] } }"></textarea></label>
              <button id="submit-har-import" type="submit" disabled>Import HAR</button>
            </form>
            <ul id="capture-import-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <h2>New Finding</h2>
            <form id="finding-form" class="stack">
              <label>Title <input name="title" required placeholder="Evidence-backed issue title"></label>
              <label>Evidence IDs <input name="evidenceIds" required placeholder="evidence_x, evidence_y"></label>
              <div class="form-row">
                <label>Severity
                  <select name="severity">
                    <option value="medium">Medium</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="info">Info</option>
                  </select>
                </label>
                <label>Confidence
                  <select name="confidence">
                    <option value="likely">Likely</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="needs_dynamic_confirmation">Needs dynamic confirmation</option>
                  </select>
                </label>
              </div>
              <label>Affected assets <input name="affectedAssets" required placeholder="https://app.example.com/profile"></label>
              <label>Repro steps <textarea name="reproSteps" required rows="3">Replay the referenced evidence.</textarea></label>
              <label>Impact <textarea name="impact" required rows="3"></textarea></label>
              <label>Remediation <textarea name="remediation" required rows="3"></textarea></label>
              <button id="submit-finding" type="submit" disabled>Submit Finding</button>
            </form>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Findings</h2>
              <span id="finding-count" class="status-pill">0 candidates</span>
            </div>
            <ul id="finding-list" class="compact-list"></ul>
          </div>
          <div id="delivery-workspace" class="panel">
            <div class="panel-header">
              <h2>Reports</h2>
              <div class="inline-actions">
                <select id="report-format" aria-label="Report format">
                  <option value="src">SRC</option>
                  <option value="hackerone">HackerOne</option>
                  <option value="bugcrowd">Bugcrowd</option>
                  <option value="enterprise">Enterprise</option>
                </select>
                <select id="report-finding-scope" aria-label="Finding scope">
                  <option value="confirmed_only">Confirmed only</option>
                  <option value="candidate_and_confirmed">Candidate + confirmed</option>
                </select>
                <button id="generate-report" type="button" disabled>Generate</button>
              </div>
            </div>
            <ul id="report-list" class="compact-list"></ul>
          </div>
          <div class="panel">
            <div class="panel-header">
              <h2>Run Exports</h2>
              <div class="inline-actions">
                <label class="checkbox-row"><input id="export-include-content" type="checkbox"> Include redacted evidence</label>
                <button id="generate-run-export" type="button" disabled>Export</button>
              </div>
            </div>
            <ul id="run-export-list" class="compact-list"></ul>
          </div>
        </section>
      </section>
    </main>
    <script src="/app/app.js?v=ui-ai-config" defer></script>
  </body>
</html>`;

export const OPERATOR_CONSOLE_CSS = `:root {
  color-scheme: light;
  /* Tang official rank palette: purple for command, crimson for risk, green for scope, cyan for context. */
  --tang-purple: #4b2a67;
  --tang-purple-strong: #321642;
  --tang-crimson: #a33a32;
  --tang-green: #1f6f50;
  --tang-green-strong: #18543e;
  --tang-cyan: #2f6674;
  --tang-gold: #a8792b;
  --tang-purple-soft: #f0ecf5;
  --tang-crimson-soft: #fbefec;
  --tang-green-soft: #edf6ef;
  --tang-cyan-soft: #e9f1f2;
  --tang-gold-soft: #fbf4e3;
  --bg: #f3f5f0;
  --panel: #fffdf8;
  --text: #1e2530;
  --muted: #65706c;
  --line: #d9ded5;
  --accent: var(--tang-green);
  --accent-strong: var(--tang-green-strong);
  --blue: var(--tang-purple);
  --amber: var(--tang-gold);
  --danger: var(--tang-crimson);
  --shadow: 0 14px 30px rgba(24, 33, 47, 0.08);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button, input, textarea, select {
  font: inherit;
}

button {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #ffffff;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 6px;
  cursor: pointer;
}

button:hover { background: var(--accent-strong); }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid rgba(75, 42, 103, 0.24); outline-offset: 2px; }
button:disabled { cursor: not-allowed; opacity: 0.5; }

input, textarea, select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px 10px;
  color: var(--text);
  background: #ffffff;
}

textarea { resize: vertical; }

.topbar {
  min-height: 78px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.92);
  position: sticky;
  top: 0;
  z-index: 3;
  backdrop-filter: blur(10px);
}

h1, h2, h3, p { margin: 0; }
h1 { font-size: 24px; line-height: 1.2; }
h2 { font-size: 17px; line-height: 1.3; }
h3 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0; margin-bottom: 10px; }

.eyebrow {
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.muted { color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }

.token-form {
  display: grid;
  grid-template-columns: auto minmax(180px, 260px) auto;
  align-items: end;
  gap: 10px;
  min-width: 0;
}

.token-form label { color: var(--muted); font-size: 13px; }

.token-form input {
  min-width: 0;
}

.topbar-actions {
  display: flex;
  align-items: end;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.language-control {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
  min-width: 120px;
}

.shell {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
}

.launch-pad {
  /* Enterprise console layout: dense command header, balanced task inputs, no hero whitespace. */
  max-width: 1600px;
  margin: 14px auto 0;
  width: calc(100% - clamp(24px, 3.6vw, 48px));
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-items: start;
  border-left: 0;
  border-top: 3px solid var(--accent);
  scroll-margin-top: 112px;
}

.launch-pad-copy {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: end;
  gap: 3px 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}

.launch-pad-copy .eyebrow {
  grid-column: 1 / -1;
}

.launch-pad-copy h2 {
  font-size: clamp(20px, 1.8vw, 27px);
  line-height: 1.08;
}

.launch-pad-copy .muted {
  justify-self: end;
  max-width: 720px;
  margin-top: 0;
  text-align: right;
}

.launch-pad-form {
  margin-top: 0;
  min-width: 0;
}

.launch-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-items: start;
}

.launch-targets {
  display: grid;
  gap: 12px;
  min-width: 0;
  align-self: start;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.automation-controls {
  align-items: end;
}

.runtime-note {
  font-size: 13px;
}

.worker-json-details,
.scope-details {
  border: 1px solid rgba(75, 42, 103, 0.2);
  border-radius: 8px;
  background: #ffffff;
  padding: 10px 12px;
}

.worker-json-details summary,
.scope-details summary {
  cursor: pointer;
  color: var(--tang-cyan);
  font-size: 13px;
  font-weight: 800;
}

.worker-json-details label,
.scope-details label {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 13px;
}

.scope-details .form-row {
  margin-top: 10px;
}

.ai-actions.launch-actions {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.82fr) minmax(0, 0.82fr);
}

.launch-actions button {
  min-width: 0;
  white-space: normal;
}

.run-history-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

#run-history-summary {
  margin-top: 4px;
  font-size: 12px;
}

.run-search-control {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 13px;
}

#run-history-panel.is-collapsed .run-history-body {
  display: none;
}

.sidebar, .workspace { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
  padding: 16px;
}

body:not(.show-advanced) .advanced-only,
body:not(.show-advanced) .advanced-field,
body:not(.show-advanced) .workspace > .metric-grid,
body:not(.show-advanced) .workspace > .panel:not(.hero-panel):not(.simple-panel) {
  display: none !important;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.hero-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
}

.simple-panel {
  display: grid;
  gap: 14px;
  border-color: rgba(31, 111, 80, 0.35);
}

.simple-actions {
  display: grid;
  grid-template-columns: minmax(160px, 1.2fr) repeat(2, minmax(120px, 0.8fr));
  gap: 10px;
}

.simple-actions button:first-child {
  min-height: 46px;
  font-weight: 700;
}

.simple-steps {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.simple-steps li {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fbfcfe;
  padding: 10px;
}

.simple-steps strong {
  display: block;
  margin-bottom: 4px;
}

.simple-step-meta {
  color: var(--muted);
  font-size: 12px;
}

.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.inline-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.inline-actions select { width: 140px; min-height: 38px; }
.item-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.item-actions button { min-height: 32px; }
.stack { display: grid; gap: 12px; margin-top: 12px; }
.stack label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; }
.stack .checkbox-row { align-items: center; display: flex; gap: 8px; }
.stack .checkbox-row input { width: auto; }
.form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.icon-button { width: 38px; padding: 0; }

.message {
  display: none;
  border: 1px solid var(--line);
  border-left: 4px solid var(--blue);
  background: #ffffff;
  color: var(--text);
  border-radius: 6px;
  padding: 10px 12px;
}

.message.is-visible { display: block; }
.message.is-error { border-left-color: var(--danger); }

.run-list {
  display: grid;
  gap: 8px;
  max-height: 44vh;
  overflow: auto;
}

.run-item {
  width: 100%;
  text-align: left;
  border: 1px solid var(--line);
  background: #ffffff;
  color: var(--text);
  display: grid;
  gap: 4px;
  padding: 10px;
}

.run-item:hover, .run-item.is-active { border-color: var(--accent); background: var(--tang-green-soft); }
.run-item strong, .compact-list strong { overflow-wrap: anywhere; }
.run-meta { color: var(--muted); font-size: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.empty { color: var(--muted); font-size: 14px; padding: 8px 0; }
.evidence-viewer-panel { min-height: 260px; }
.evidence-viewer-panel > strong { display: block; overflow-wrap: anywhere; }
.evidence-viewer-content {
  min-height: 160px;
  max-height: 420px;
  margin: 12px 0 0;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.evidence-review-controls { margin-top: 12px; }

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.metric {
  min-height: 76px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  padding: 12px;
  display: grid;
  align-content: space-between;
}

.metric span { color: var(--muted); font-size: 12px; }
.metric strong { font-size: 20px; overflow-wrap: anywhere; }

.board {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 16px;
  align-items: start;
}

.review-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.scorecard-split { margin-top: 12px; }

.flow-panel { display: grid; gap: 12px; }
.flow-summary { color: var(--muted); }
.flow-grid,
.surface-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
  gap: 16px;
  align-items: start;
}
.flow-list { counter-reset: flow-step; }
.flow-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
}
.flow-index {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--muted);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
}
.flow-content { min-width: 0; }
.flow-meta {
  color: var(--muted);
  font-size: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 5px;
}
.step-status {
  border-radius: 999px;
  padding: 2px 7px;
  background: var(--tang-cyan-soft);
  color: var(--tang-cyan);
}
.step-status.done { background: var(--tang-green-soft); color: var(--accent-strong); }
.step-status.active { background: var(--tang-purple-soft); color: var(--blue); }
.step-status.blocked { background: var(--tang-crimson-soft); color: var(--danger); }
.step-status.review { background: var(--tang-gold-soft); color: var(--amber); }
.stack-heading { margin-top: 14px; }

.compact-list, .timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.compact-list li {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px;
  background: #fbfcfe;
  overflow-wrap: anywhere;
}

.timeline-panel { max-height: calc(100vh - 226px); overflow: auto; }
.timeline li {
  border-left: 3px solid var(--blue);
  padding: 4px 0 10px 10px;
  overflow-wrap: anywhere;
}
.timeline li.warning { border-left-color: var(--amber); }
.timeline li.error { border-left-color: var(--danger); }
.timeline time { display: block; color: var(--muted); font-size: 12px; margin-top: 4px; }
.timeline p { color: var(--muted); margin-top: 4px; }

.status-pill {
  border: 1px solid var(--line);
  background: var(--surface-2, #f8faf4);
  color: var(--muted);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 980px) {
  .shell, .board, .split, .review-grid, .flow-grid, .surface-grid { grid-template-columns: 1fr; }
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .simple-actions { grid-template-columns: 1fr; }
  .timeline-panel { max-height: none; }
}

@media (max-width: 640px) {
  .topbar { align-items: stretch; flex-direction: column; padding: 14px; }
  .topbar-actions { align-items: stretch; flex-direction: column; }
  .token-form { grid-template-columns: 1fr; }
  .shell { padding: 12px; }
  .hero-panel { align-items: stretch; flex-direction: column; }
  .form-row { grid-template-columns: 1fr; }
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* Operations console redesign */
:root {
  /* Tang official rank palette: purple for command, crimson for risk, green for scope, cyan for context. */
  --tang-purple: #4b2a67;
  --tang-purple-strong: #321642;
  --tang-crimson: #a33a32;
  --tang-green: #1f6f50;
  --tang-green-strong: #18543e;
  --tang-cyan: #2f6674;
  --tang-gold: #a8792b;
  --tang-purple-soft: #f0ecf5;
  --tang-crimson-soft: #fbefec;
  --tang-green-soft: #edf6ef;
  --tang-cyan-soft: #e9f1f2;
  --tang-gold-soft: #fbf4e3;
  --bg: #f3f5f0;
  --panel: #fffdf8;
  --surface-2: #f8faf4;
  --surface-3: #edf3ed;
  --text: #1e2530;
  --muted: #65706c;
  --line: #d9ded5;
  --line-strong: #bfc8bb;
  --accent: var(--tang-green);
  --accent-strong: var(--tang-green-strong);
  --blue: var(--tang-purple);
  --amber: var(--tang-gold);
  --danger: var(--tang-crimson);
  --violet: var(--tang-purple);
  --shadow: 0 18px 38px rgba(30, 37, 48, 0.08);
  --shadow-soft: 0 7px 18px rgba(30, 37, 48, 0.06);
}

html {
  scroll-behavior: smooth;
}

body {
  background: var(--bg);
  line-height: 1.45;
}

button,
input,
textarea,
select {
  min-width: 0;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #ffffff;
  min-height: 40px;
  padding: 0 13px;
  border-radius: 7px;
  font-weight: 700;
  line-height: 1.1;
  white-space: normal;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
}

button:hover {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
}

button:not(:disabled):active {
  transform: translateY(1px);
}

button:disabled {
  background: #d9e2df;
  border-color: #c8d3d0;
  color: #74817d;
  opacity: 1;
}

input,
textarea,
select {
  border-color: var(--line);
  border-radius: 7px;
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(23, 32, 44, 0.03);
}

input:hover,
textarea:hover,
select:hover {
  border-color: var(--line-strong);
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
a:focus-visible {
  outline: 3px solid rgba(75, 42, 103, 0.24);
  outline-offset: 2px;
}

.topbar {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: auto;
  padding: 10px clamp(16px, 3vw, 28px);
  border-bottom: 1px solid var(--line);
  background: rgba(255, 254, 250, 0.96);
  box-shadow: 0 1px 0 rgba(23, 32, 44, 0.04);
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
}

.brand-mark {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(75, 42, 103, 0.26);
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #f1edf4;
  color: var(--blue);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0;
  flex: 0 0 auto;
}

h1 {
  font-size: clamp(21px, 1.8vw, 25px);
  letter-spacing: 0;
}

h2 {
  font-size: 16px;
  letter-spacing: 0;
}

h3 {
  color: #46566a;
  font-size: 12px;
}

.topbar-subtitle {
  color: var(--muted);
  margin-top: 1px;
  max-width: 680px;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.topbar-actions {
  align-items: end;
  gap: 10px;
}

.token-form {
  grid-template-columns: auto minmax(190px, 270px) auto;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 6px;
  background: var(--surface-2);
}

.language-control {
  min-width: 136px;
}

.console-nav {
  position: sticky;
  top: 57px;
  z-index: 2;
  display: flex;
  gap: 4px;
  padding: 6px clamp(16px, 3vw, 28px);
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 253, 248, 0.96);
  backdrop-filter: blur(10px);
}

.console-nav::-webkit-scrollbar {
  display: none;
}

.console-nav a {
  color: #263448;
  text-decoration: none;
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 800;
}

.console-nav a:hover {
  border-color: var(--line);
  color: var(--blue);
  background: var(--tang-purple-soft);
}

.shell {
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 14px;
  max-width: 1600px;
  margin: 0 auto;
  padding: 14px clamp(14px, 2.2vw, 28px) 28px;
}

.mission-rail {
  position: sticky;
  top: 108px;
  max-height: calc(100vh - 124px);
  overflow: auto;
  padding-right: 2px;
  align-self: start;
}

.workspace {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
}

.workspace > * {
  grid-column: 1 / -1;
  min-width: 0;
  scroll-margin-top: 112px;
}

body.show-advanced .workspace > .panel:not(.hero-panel):not(.simple-panel):not(.mission-panel):not(.workbench-panel):not(.flow-panel) {
  grid-column: span 6;
}

body.show-advanced #telemetry-panel,
body.show-advanced #workers-panel,
body.show-advanced #tool-ecosystem-panel,
body.show-advanced #assessment-flow-panel,
body.show-advanced .workspace > .mission-panel,
body.show-advanced .workspace > .workbench-panel,
body.show-advanced .workspace > .flow-panel,
body.show-advanced .board,
body.show-advanced .review-grid {
  grid-column: 1 / -1;
}

.panel {
  border-color: var(--line);
  border-radius: 7px;
  box-shadow: 0 1px 2px rgba(30, 37, 48, 0.05);
  padding: 14px;
  background: var(--panel);
}

.panel:hover {
  border-color: var(--line-strong);
}

.panel-header {
  align-items: flex-start;
  gap: 10px;
}

.panel-header h2,
.panel-header h3 {
  min-width: 0;
  overflow-wrap: anywhere;
}

.run-switcher,
.create-run-card {
  border-left: 3px solid var(--accent);
}

.ai-config-strip {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 12px;
  border: 1px solid rgba(75, 42, 103, 0.2);
  border-left: 4px solid var(--blue);
  border-radius: 7px;
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(75, 42, 103, 0.04);
}

.ai-config-strip .panel-header {
  margin-bottom: 0;
}

.ai-config-strip h3 {
  margin-bottom: 0;
  color: var(--blue);
}

.ai-actions {
  display: grid;
  grid-template-columns: minmax(170px, 1.05fr) repeat(2, minmax(120px, 0.75fr));
  gap: 8px;
}

.mission-rail .ai-config-strip .form-row,
.mission-rail .ai-actions {
  grid-template-columns: 1fr;
}

.primary-start {
  background: var(--blue);
  border-color: var(--blue);
}

.primary-start:hover {
  background: var(--tang-purple-strong);
  border-color: var(--tang-purple-strong);
}

.run-list {
  max-height: min(44vh, 410px);
  padding-right: 2px;
}

.run-item {
  border-color: var(--line);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: none;
}

.run-item:hover,
.run-item.is-active {
  border-color: rgba(31, 111, 80, 0.48);
  background: var(--tang-green-soft);
}

.hero-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, auto);
  align-items: center;
  gap: 14px;
  border-left: 3px solid var(--accent);
  background: var(--panel);
}

.hero-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.hero-panel h2 {
  font-size: clamp(21px, 2.1vw, 31px);
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.hero-safety {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.actions,
.inline-actions,
.item-actions,
.simple-actions {
  min-width: 0;
}

.actions button {
  min-width: 112px;
}

.metric-grid {
  grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
  gap: 10px;
}

.metric {
  min-height: 82px;
  border-radius: 8px;
  background: #ffffff;
  border-left: 3px solid rgba(75, 42, 103, 0.3);
  box-shadow: var(--shadow-soft);
}

.metric span {
  color: #607086;
  font-weight: 700;
}

.metric strong {
  font-size: clamp(18px, 2vw, 25px);
  line-height: 1.1;
}

.priority-panel {
  border-color: rgba(31, 111, 80, 0.32);
  box-shadow: 0 13px 28px rgba(31, 111, 80, 0.08);
}

.simple-panel {
  gap: 15px;
  background: #fbfdf8;
}

.simple-actions {
  grid-template-columns: minmax(170px, 1.15fr) repeat(2, minmax(124px, 0.8fr));
}

.simple-actions button:first-child {
  background: var(--blue);
  border-color: var(--blue);
  min-height: 48px;
}

.simple-actions button:first-child:hover {
  background: var(--tang-purple-strong);
  border-color: var(--tang-purple-strong);
}

.simple-steps li,
.compact-list li {
  border-color: var(--line);
  border-left: 3px solid transparent;
  border-radius: 8px;
  background: var(--surface-2);
}

.compact-list li:hover,
.simple-steps li:hover {
  border-left-color: rgba(75, 42, 103, 0.42);
}

.status-pill {
  border-color: var(--line);
  background: var(--tang-cyan-soft);
  color: #3f5166;
  font-weight: 800;
  white-space: normal;
  text-align: center;
}

.message {
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
}

.board,
.review-grid,
.split,
.flow-grid,
.surface-grid {
  gap: 16px;
}

.board {
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
}

.review-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.timeline-panel {
  max-height: calc(100vh - 235px);
}

.timeline li {
  border-left-color: var(--blue);
}

.timeline li.warning {
  border-left-color: var(--amber);
}

.timeline li.error {
  border-left-color: var(--danger);
}

.evidence-viewer-content {
  border-radius: 8px;
  background: #121826;
}

.stack {
  gap: 11px;
}

.stack label {
  color: #536174;
  font-weight: 700;
}

.form-row {
  gap: 10px;
}

.flow-list li {
  grid-template-columns: auto minmax(0, 1fr);
}

.flow-index {
  background: #ffffff;
}

.step-status.done {
  background: var(--tang-green-soft);
}

.step-status.active {
  background: var(--tang-purple-soft);
}

.step-status.blocked {
  background: var(--tang-crimson-soft);
}

.step-status.review {
  background: var(--tang-gold-soft);
}

@media (max-width: 1240px) {
  body.show-advanced .workspace > .panel:not(.hero-panel):not(.simple-panel):not(.mission-panel):not(.workbench-panel):not(.flow-panel) {
    grid-column: 1 / -1;
  }
}

@media (max-width: 980px) {
  .topbar {
    grid-template-columns: 1fr;
    position: static;
  }

  .console-nav {
    position: static;
    top: auto;
  }

  .shell {
    grid-template-columns: 1fr;
  }

  .launch-pad {
    width: calc(100% - 24px);
    margin-top: 12px;
    scroll-margin-top: 16px;
    grid-template-columns: 1fr;
  }

  .launch-form-grid {
    grid-template-columns: 1fr;
  }

  .mission-rail {
    position: static;
    max-height: none;
    padding-right: 0;
  }

  .workspace {
    grid-template-columns: 1fr;
  }

  .workspace > *,
  body.show-advanced .workspace > .panel:not(.hero-panel):not(.simple-panel):not(.mission-panel):not(.workbench-panel):not(.flow-panel) {
    grid-column: 1 / -1;
  }

  .hero-panel,
  .board,
  .review-grid,
  .split,
  .flow-grid,
  .surface-grid {
    grid-template-columns: 1fr;
  }

  .timeline-panel {
    max-height: none;
  }
}

@media (max-width: 640px) {
  html,
  body {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  .topbar {
    padding: 10px 13px;
    gap: 10px;
    overflow-x: clip;
  }

  .topbar-actions {
    display: grid;
    grid-template-columns: 1fr;
    align-items: end;
    justify-content: stretch;
    width: 100%;
  }

  .topbar-subtitle {
    display: none;
  }

  .language-control,
  .token-form {
    width: min(100%, calc(100vw - 26px));
    max-width: calc(100vw - 26px);
  }

  .token-form {
    display: flex;
    position: static;
    width: calc(100vw - 26px);
    max-width: 100%;
    align-items: center;
  }

  .token-form label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .token-form input {
    width: auto;
    flex: 1 1 auto;
    padding-right: 10px;
  }

  .token-form button {
    position: static;
    flex: 0 0 66px;
    width: 66px;
    min-width: 66px;
    padding: 0;
  }

  .brand-lockup {
    align-items: flex-start;
    max-width: 100%;
  }

  .brand-mark {
    width: 38px;
    height: 38px;
  }

  .console-nav {
    padding: 6px 12px;
    max-width: 100vw;
  }

  .form-row,
  .simple-actions,
  .launch-actions,
  .ai-actions.launch-actions {
    grid-template-columns: 1fr;
  }

  .shell {
    padding: 12px;
  }

  .launch-pad {
    width: calc(100% - 24px);
    margin-top: 8px;
    padding: 13px;
  }

  .launch-pad-copy {
    display: none;
  }

  #ai-configuration .form-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  #ai-configuration label {
    min-width: 0;
  }

  #ai-configuration input,
  #ai-configuration select {
    font-size: 14px;
  }

  .panel {
    padding: 13px;
  }

  .panel-header {
    flex-direction: column;
    align-items: stretch;
  }

  .metric-grid {
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  }

  .actions,
  .inline-actions,
  .item-actions {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .inline-actions select {
    width: 100%;
  }
}

@media (max-width: 360px) {
  #ai-configuration .form-row {
    grid-template-columns: 1fr;
  }
}`;

export const OPERATOR_CONSOLE_JS = `(() => {
  const platformAiConfigStorageKey = 'platformAiConfig';
  const storedPlatformAiConfig = loadPlatformAiConfig();

  const state = {
    token: localStorage.getItem('platformToken') || '',
    language: localStorage.getItem('platformLanguage') || (((navigator.language || '').toLowerCase().startsWith('zh')) ? 'zh-CN' : 'en'),
    activeRunId: localStorage.getItem('activeRunId') || '',
    showAdvanced: localStorage.getItem('showAdvancedConsole') === '1',
    runHistoryCollapsed: localStorage.getItem('runHistoryCollapsed') !== '0',
    runSearch: '',
    aiConfig: {
      baseUrl: storedPlatformAiConfig.baseUrl || 'https://api.openai.com/v1',
      model: storedPlatformAiConfig.model || 'gpt-4.1-mini',
      apiKey: ''
    },
    runs: [],
    missionControl: null,
    runtimeOperationsWorkbench: null,
    workbench: null,
    searchPlan: null,
    flow: null,
    strategy: null,
    surface: null,
    surfaceFrontierPlanPreview: null,
    strategyPlanPreview: null,
    workerEnvelopePreview: null,
    agentFramework: null,
    agentHarness: null,
    referenceBenchmark: null,
    executionNode: null,
    desktopReadiness: null,
    localRunnerWorkbench: null,
    workerLeaderboard: null,
    workerSelection: null,
    workerEvaluationPlan: null,
    toolCatalog: [],
    toolPacks: [],
    toolPackPlanPreview: null,
    scannerTemplatePolicies: [],
    toolboxPolicy: null,
    toolboxDoctor: null,
    runtimeActivationPlan: null,
    toolboxBundles: [],
    connectors: [],
    ecosystemCoverage: null,
    toolIntegrationBacklog: null,
    toolEcosystemWorkbench: null,
    connectorPlanPreview: null,
    toolboxProfiles: [],
    capabilities: [],
    capabilityRadar: null,
    evidenceQuality: null,
    toolPlanPreview: null,
    domainSkills: [],
    domainSkillReadiness: null,
    pocTemplates: [],
    evidenceViewerPayload: null,
    selectedEvidenceId: '',
    evidenceReviews: [],
    busy: false
  };

  const workerPoolPresets = {
    mock: [
      { name: 'mock-worker', type: 'mock', maxRunning: 1, priority: 0 }
    ],
    codex: [
      { name: 'codex-worker', type: 'codex', maxRunning: 1, priority: 0, command: 'codex', timeoutMs: 120000 }
    ],
    claude: [
      { name: 'claude-worker', type: 'claude', maxRunning: 1, priority: 0, command: 'claude', timeoutMs: 120000 }
    ],
    claude_codex: [
      { name: 'claude-worker', type: 'claude', maxRunning: 1, priority: 0, command: 'claude', timeoutMs: 120000 },
      { name: 'codex-worker', type: 'codex', maxRunning: 1, priority: 1, command: 'codex', timeoutMs: 120000 }
    ]
  };

  const defaultToolboxBundleManifest = {
    id: 'bundle.custom.web-recon-lab',
    name: 'Custom Web Recon Lab',
    version: '0.1.0',
    profileIds: ['container.web-recon'],
    engines: ['nuclei', 'httpx'],
    templateIds: ['web.nuclei.safe_templates', 'web.httpx.fingerprint'],
    riskLevels: ['R2'],
    safetyNotes: ['Registered manifest only; execution still requires Tool Gateway policy and profile readiness.'],
    installationNotes: ['Provide the matching local container image and enable container toolbox policy.'],
    commercialUseCases: ['Organization-specific web recon pack']
  };

  const defaultConnectorManifest = {
    id: 'connector.custom.hexstrike-lab',
    name: 'Custom HexStrike Lab Connector',
    version: '0.1.0',
    kind: 'mcp',
    status: 'planned',
    toolNames: ['nuclei', 'httpx', 'ffuf'],
    riskLevels: ['R1', 'R2'],
    inputKinds: ['target_url', 'domain'],
    evidenceKinds: ['command_output', 'http_exchange'],
    requiredEnv: ['PLATFORM_CONNECTOR_HEXSTRIKE_MCP'],
    safetyNotes: ['Connector metadata only; execution must stay behind Tool Gateway requests and approvals.'],
    installationNotes: ['Map external connector capabilities into governed scanner templates before use.'],
    commercialUseCases: ['Governed external tool ecosystem import']
  };

  const translations = {
    'zh-CN': {
      'Authorized AI Pentest Platform': '授权 AI 渗透测试平台',
      'Operator Console': '操作台',
      'Local mission control for scope, evidence, workers, and report gates.': '用于范围、证据、Worker 和报告门禁的本地任务控制台。',
      'Operator console sections': '操作台分区',
      'Launch': '启动',
      'Run': '运行',
      'Simple': '简洁',
      'Mission': '任务',
      'Workbench': '工作台',
      'Tools': '工具',
      'Review': '复核',
      'Deliver': '交付',
      'Language': '语言',
      'Local token': '本地令牌',
      'Bearer token': 'Bearer 令牌',
      'Save': '保存',
      'Runs': '运行',
      'Refresh': '刷新',
      'No runs loaded.': '尚未加载运行。',
      'No runs yet.': '暂无运行。',
      'No matching runs.': '没有匹配的运行。',
      'New Run': '新建运行',
      'Automated AI Pentest': '自动化 AI 渗透',
      'Mission Launch Pad': '任务启动台',
      'Specify a target, connect an AI worker, choose automation depth, then start the authorized run.': '指定目标、连接 AI Worker、选择自动化深度，然后启动授权运行。',
      'Target': '目标',
      'Goal': '目标说明',
      'Use AI to run an authorized, evidence-backed penetration test against the target.': '使用 AI 对目标执行授权、证据驱动的自动化渗透测试。',
      'AI Configuration': 'AI 配置',
      'needs setup': '需要配置',
      'needs key': '需要密钥',
      'ready': '就绪',
      'Base URL': 'Base URL',
      'Model': '模型',
      'Server API key': '服务端 API 密钥',
      'Set OPENAI_API_KEY before starting the API': '启动 API 前设置 OPENAI_API_KEY',
      'Automation mode': '自动化模式',
      'Safe 4 ticks': '安全 4 次',
      'Single tick': '单次调度',
      'Until review gate': '直到复核门禁',
      'Until evidence appears': '直到出现证据',
      'Until report-ready': '直到报告就绪',
      'Depth': '深度',
      '2 ticks': '2 次',
      '4 ticks': '4 次',
      '8 ticks': '8 次',
      '12 ticks': '12 次',
      'Current runtime: Codex CLI worker using OpenAI-compatible env vars. Direct HTTP provider mode is not enabled in this local shell.': '当前运行时：Codex CLI Worker，使用 OpenAI 兼容环境变量。本地界面尚未启用直接 HTTP Provider 模式。',
      'Base URL and model are saved locally. API keys are not stored in browser or run state.': 'Base URL 和模型会保存到本地。API 密钥不会存入浏览器或运行状态。',
      'AI worker routing is ready. Worker secrets must come from the local API process environment.': 'AI Worker 路由已就绪。Worker 密钥必须来自本地 API 进程环境变量。',
      'Apply AI Worker': '应用 AI Worker',
      'AI worker configuration applied.': 'AI Worker 配置已应用。',
      'Start Automated AI Pentest': '启动自动化 AI 渗透',
      'Create Run Only': '仅创建运行',
      'AI Provider': 'AI 提供商',
      'AI base URL and model are required. Set API keys in the server environment.': '需要 AI Base URL 和模型。请在服务端环境变量中设置 API 密钥。',
      'Local token is required before starting automation.': '启动自动化前需要本地令牌。',
      'Automated AI pentest run created.': '自动化 AI 渗透运行已创建。',
      'Allowed assets': '授权资产',
      'Advanced Scope Controls': '高级范围控制',
      'Denied assets': '拒绝资产',
      'Allowed methods': '允许方法',
      'Rate limit': '速率限制',
      'Vault references only': '仅允许 Vault 引用',
      'Allow destructive actions': '允许破坏性动作',
      'Worker preset': 'Worker 预设',
      'Mock Worker': 'Mock Worker',
      'Codex CLI': 'Codex CLI',
      'Claude Code CLI': 'Claude Code CLI',
      'Claude + Codex': 'Claude + Codex',
      'Custom JSON': '自定义 JSON',
      'Advanced Worker JSON': '高级 Worker JSON',
      'Worker pool JSON': 'Worker 池 JSON',
      'Create Run': '创建运行',
      'Run History': '运行历史',
      'Show History': '展开历史',
      'Hide History': '收起历史',
      'Refresh runs': '刷新运行',
      'Search runs': '搜索运行',
      'target, phase, status, or id': '目标、阶段、状态或 ID',
      'Program Scope Import': '项目范围导入',
      'Format': '格式',
      'HackerOne': 'HackerOne',
      'Bugcrowd': 'Bugcrowd',
      'SRC': 'SRC',
      'Enterprise': '企业',
      'Generic JSON': '通用 JSON',
      'Program JSON': '项目 JSON',
      'Import Scope': '导入范围',
      'No program scopes imported.': '暂无项目范围导入。',
      'Program JSON must be valid JSON.': '项目 JSON 必须是有效 JSON。',
      'Program scope imported.': '项目范围已导入。',
      'Program scope applied.': '项目范围已应用到新建运行。',
      'Apply to New Run': '应用到新建运行',
      'Current run': '当前运行',
      'No run selected': '未选择运行',
      'Create or select a run to inspect progress.': '创建或选择一个运行以查看进度。',
      'Scope gated': '范围门禁',
      'Evidence first': '证据优先',
      'Local token': '本地令牌',
      'Dispatch': '调度',
      'Auto 4 ticks': '自动 4 次',
      'Phase': '阶段',
      'Facts': '事实',
      'Intents': '意图',
      'Evidence': '证据',
      'Findings': '发现',
      'Approvals': '审批',
      'Mission Control': '任务控制台',
      'Create or select a run to inspect mission progress.': '创建或选择一个运行以查看任务进度。',
      'Show Advanced': '显示高级细节',
      'Hide Advanced': '隐藏高级细节',
      'Simple Pentest': '傻瓜式渗透',
      'No run': '未选择运行',
      'Create or select a run, then press Continue. The platform will keep scope, evidence, and report gates visible.': '创建或选择一个运行，然后点击继续。平台会持续展示范围、证据和报告门禁。',
      'Press Continue to let the Dispatcher move one safe step. High-risk actions still stop for review.': '点击继续，让调度器推进一个安全步骤。高风险动作仍会停下来等待复核。',
      'Current step': '当前步骤',
      'Next best action': '下一步',
      'Evidence collected': '已收集证据',
      'Reportable findings': '可报告发现',
      'Continue': '继续',
      'Auto Progress': '自动推进',
      'Generate Report': '生成报告',
      'Review Required': '需要复核',
      'Needs you': '需要你处理',
      'Progress': '进度',
      'AI Reasoning': 'AI 思路',
      'Needs You': '需要你处理',
      'No run selected.': '尚未选择运行。',
      'AI reasoning will appear after a run starts.': '运行开始后会显示 AI 思路。',
      'No operator action needed.': '暂时不需要人工处理。',
      'Next': '下一步',
      'Review report': '查看报告',
      'Approve or reject gated action': '批准或拒绝门禁动作',
      'Review evidence': '复核证据',
      'Confirm or reject finding': '确认或驳回发现',
      'Generate report': '生成报告',
      'Continue safe exploration': '继续安全探索',
      'Review pending approval.': '处理待审批动作。',
      'Review new evidence before it becomes a finding.': '先复核新证据，再转成发现。',
      'Confirm real impact or reject candidate findings.': '确认真实影响，或驳回候选发现。',
      'Generate a report bundle.': '生成报告包。',
      '1. Authorized target': '1. 授权目标',
      '2. Understand surface': '2. 理解攻击面',
      '3. Collect evidence': '3. 收集证据',
      '4. Confirm finding': '4. 确认发现',
      '5. Deliver report': '5. 交付报告',
      'Top priority': '最高优先级',
      'Evidence review': '证据复核',
      'Healthy Workers': '健康 Worker',
      'Delivery': '交付',
      'Mission Lanes': '任务泳道',
      'Reasoning Trail': '推理轨迹',
      'Why Now': '当前原因',
      'Operator Actions': '操作员动作',
      'Acceptance Gates': '验收门禁',
      'No mission control data.': '暂无任务控制台数据。',
      'No mission lanes.': '暂无任务泳道。',
      'No mission reasoning trail.': '暂无任务推理轨迹。',
      'No mission reasons.': '暂无当前原因。',
      'No mission actions.': '暂无任务动作。',
      'No mission gates.': '暂无任务门禁。',
      'Runtime Operations': '运行时操作台',
      'Create or select a run to inspect runtime events, sessions, and sandbox bindings.': '创建或选择一个运行以查看运行时事件、会话和沙箱绑定。',
      'Runtime events': '运行时事件',
      'Trace spans': 'Trace 跨度',
      'Active sessions': '活跃会话',
      'Runtime Lanes': '运行时泳道',
      'Event Contract': '事件契约',
      'Runtime Activity': '运行时活动',
      'Safety Notes': '安全说明',
      'No runtime lanes.': '暂无运行时泳道。',
      'No runtime event contract.': '暂无运行时事件契约。',
      'No runtime activity.': '暂无运行时活动。',
      'No runtime operator actions.': '暂无运行时操作动作。',
      'No runtime safety notes.': '暂无运行时安全说明。',
      'Safety boundary': '安全边界',
      'runtime_operations_workbench': '运行时操作台',
      'implemented': '已实现',
      'mapped': '已映射',
      'deliberately_avoided': '明确不采用',
      'run_event': '运行事件',
      'thinking_delta': '思路摘要流',
      'text_delta': '文本流',
      'tool_call': '工具调用',
      'tool_result': '工具结果',
      'worker_task': 'Worker 任务',
      'subagent_task': '子智能体任务',
      'sandbox_event': '沙箱事件',
      'evidence_event': '证据事件',
      'approval_event': '审批事件',
      'trace_span': 'Trace 跨度',
      'Stable runtime event contract': '稳定运行时事件契约',
      'Session lifecycle and resume': '会话生命周期与恢复',
      'Interrupt and cancellation model': '中断与取消模型',
      'Sandbox and local surface binding': '沙箱与本地界面绑定',
      'Background job and delegation model': '后台任务与委托模型',
      'Context projection and compaction': '上下文投影与压缩',
      'Operator shell, files, and GUI': '操作员 Shell、文件和 GUI',
      'Objective': '目标',
      'Current reasoning': '当前推理',
      'Stop conditions': '停止条件',
      'Scope and authorization': '范围与授权',
      'Search and reasoning': '搜索与推理',
      'Worker execution': 'Worker 执行',
      'Tool and runtime': '工具与运行时',
      'Agent framework quality': '智能体框架质量',
      'selected': '已选择',
      'on_track': '正常推进',
      'needs_operator': '需要人工处理',
      'collecting_evidence': '正在收集证据',
      'ready_for_delivery': '可交付',
      'Agent Workbench': '智能体工作台',
      'Create or select a run to inspect the Agent Workbench.': '创建或选择一个运行以查看智能体工作台。',
      'Queued intents': '排队意图',
      'Active intents': '活跃意图',
      'Unreviewed evidence': '待复核证据',
      'Blockers': '阻塞项',
      'Workbench Lanes': '工作台泳道',
      'Next Actions': '下一步动作',
      'Recent Events': '最近事件',
      'No workbench data.': '暂无工作台数据。',
      'No workbench actions.': '暂无工作台动作。',
      'No workbench blockers.': '暂无工作台阻塞项。',
      'No workbench events.': '暂无工作台事件。',
      'Run Context': '运行上下文',
      'Worker Loop': 'Worker 循环',
      'Strategy And Search Frontier': '策略与搜索前沿',
      'Tool Gateway': '工具网关',
      'Evidence And Findings': '证据与发现',
      'Delivery Readiness': '交付就绪度',
      'Search Plan': '搜索计划',
      'Advance': '推进',
      'Search plan advanced.': '搜索计划已推进。',
      'Search plan advance:': '搜索计划推进：',
      'Create or select a run to inspect the search plan.': '创建或选择一个运行以查看搜索计划。',
      'Scoring': '评分规则',
      'No search plan items.': '暂无搜索计划项。',
      'No search plan notes.': '暂无搜索计划说明。',
      'Telemetry & Eval': '遥测与评测',
      'Worker Scorecard': 'Worker 评分卡',
      'Tool Scorecard': '工具评分卡',
      'Worker Comparison': 'Worker 对比',
      'Worker Leaderboard': 'Worker 排行榜',
      'Worker tasks': 'Worker 任务',
      'Exercised Workers': '已实测 Worker',
      'Evidence contribution': '证据贡献',
      'Finding influence': '发现影响',
      'No worker leaderboard yet.': '暂无 Worker 排行榜。',
      'No worker type leaderboard yet.': '暂无 Worker 类型排行。',
      'No worker leaderboard recommendations.': '暂无 Worker 排行建议。',
      'Worker Selection Policy': 'Worker 选择策略',
      'Create or select a run to inspect Worker selection.': '创建或选择一个运行以查看 Worker 选择策略。',
      'Recommended Worker': '推荐 Worker',
      'Next task': '下一任务',
      'Eligible Workers': '可用 Worker',
      'Evidence Workers': '证据 Worker',
      'No policy': '暂无策略',
      'No Worker selection policy yet.': '暂无 Worker 选择策略。',
      'No Worker selection candidates.': '暂无 Worker 选择候选。',
      'No Worker selection actions.': '暂无 Worker 选择动作。',
      'Worker Evaluation Plan': 'Worker 评测计划',
      'Create or select a run to inspect Worker evaluation readiness.': '创建或选择一个运行以查看 Worker 评测就绪度。',
      'Task coverage': '任务覆盖',
      'Comparable Workers': '可对比 Worker',
      'Eval cost': '评测成本',
      'Worker Eval Cards': 'Worker 评测卡',
      'Eval Dimensions': '评测维度',
      'Eval Experiments': '评测实验',
      'Eval Actions': '评测动作',
      'No Worker evaluation plan yet.': '暂无 Worker 评测计划。',
      'No Worker eval cards.': '暂无 Worker 评测卡。',
      'No Worker eval dimensions.': '暂无 Worker 评测维度。',
      'No Worker eval experiments.': '暂无 Worker 评测实验。',
      'No Worker eval actions.': '暂无 Worker 评测动作。',
      'Worker runtime setup': 'Worker 运行时配置',
      'Task cell coverage': '任务单元覆盖',
      'Worker reliability': 'Worker 可靠性',
      'Evidence output': '证据产出',
      'Pairwise comparison readiness': '两两对比就绪度',
      'needs_warmup': '需要预热',
      'insufficient_data': '数据不足',
      'ready': '就绪',
      'recommended': '推荐',
      'eligible': '可用',
      'warm_up': '预热',
      'deprioritize': '降级',
      'blocked': '阻断',
      'policy': '策略',
      'pool_order': '池顺序',
      'bootstrap': '启动',
      'reason': '推理',
      'explore': '探索',
      'Run Capability Radar': '运行能力雷达',
      'Overall capability': '整体能力',
      'Evidence depth': '证据深度',
      'Tool ecosystem': '工具生态',
      'Worker performance': 'Worker 表现',
      'No capability radar yet.': '暂无运行能力雷达。',
      'No capability scheduling hints.': '暂无能力调度建议。',
      'Delivery Readiness': '交付就绪',
      'No delivery readiness yet.': '暂无交付就绪检查。',
      'No delivery next actions.': '暂无交付下一步。',
      'Approval queue cleared': '审批队列已清空',
      'Evidence triage coverage': '证据复核覆盖',
      'Confirmed finding gate': '已确认发现门禁',
      'Commercial report scope': '商业报告范围',
      'Tool audit review': '工具审计复核',
      'Evidence Quality Index': '证据质量指数',
      'Create or select a run to inspect evidence quality.': '创建或选择一个运行以查看证据质量。',
      'Evidence score': '证据评分',
      'Useful evidence': '有用证据',
      'Replayable evidence': '可复放证据',
      'Redaction ready': '脱敏就绪',
      'Finding gates': '发现门禁',
      'Missing blobs': '缺失内容',
      'Quality Dimensions': '质量维度',
      'Finding Gates': '发现门禁',
      'Evidence Actions': '证据动作',
      'No evidence quality index yet.': '暂无证据质量指数。',
      'No evidence quality dimensions.': '暂无证据质量维度。',
      'No finding evidence gates.': '暂无发现证据门禁。',
      'No evidence quality actions.': '暂无证据质量动作。',
      'Evidence integrity': '证据完整性',
      'Human review coverage': '人工复核覆盖',
      'Replay and reproduction': '复放与复现',
      'Redaction readiness': '脱敏就绪度',
      'Finding linkage': '发现引用闭环',
      'Commercial handoff': '商业交付',
      'strong': '强',
      'weak': '薄弱',
      'pass': '通过',
      'warn': '提醒',
      'fail': '失败',
      'Evaluate': '评测',
      'Trace spans': 'Trace 跨度',
      'Runtime': '运行耗时',
      'Execution runtime': '执行运行时',
      'Est. cost': '预估成本',
      'Eval score': '评测分数',
      'No evaluation yet.': '暂无评测。',
      'No worker scorecard yet.': '暂无 Worker 评分卡。',
      'No tool scorecard yet.': '暂无工具评分卡。',
      'No worker comparison yet.': '暂无 Worker 对比。',
      'No scorecard recommendations.': '暂无评分卡建议。',
      'Agent Workers': '智能体 Workers',
      'Local Execution Node': '本地执行节点',
      'Create or select a run to inspect the local execution node.': '创建或选择一个运行以查看本地执行节点。',
      'Runtime profiles': '运行时配置',
      'Healthy Workers': '健康 Worker',
      'Active local sessions': '活跃本地会话',
      'Runtime Surfaces': '运行时能力面',
      'Node Gates': '节点门禁',
      'Node Actions': '节点动作',
      'No local execution node report.': '暂无本地执行节点报告。',
      'No local execution node actions.': '暂无本地执行节点动作。',
      'Desktop Runner Readiness': '桌面 Runner 就绪度',
      'Create or select a run to inspect desktop runner productization readiness.': '创建或选择一个运行以查看桌面 Runner 产品化就绪度。',
      'Ready components': '就绪组件',
      'Partial components': '部分组件',
      'Planned gaps': '规划缺口',
      'Desktop sessions': '桌面会话',
      'Desktop evidence': '桌面证据',
      'Desktop Components': '桌面组件',
      'Handoff Contracts': '交付契约',
      'Desktop Actions': '桌面动作',
      'No desktop readiness report.': '暂无桌面就绪度报告。',
      'No desktop contracts.': '暂无桌面交付契约。',
      'No desktop actions.': '暂无桌面动作。',
      'Local Runner Workbench': '本地 Runner 工作台',
      'Create or select a run to inspect local runner capture readiness.': '创建或选择一个运行以查看本地 Runner 采集就绪度。',
      'Browser sessions': '浏览器会话',
      'Proxy sessions': '代理会话',
      'HTTP evidence': 'HTTP 证据',
      'Reviewed evidence': '已复核证据',
      'Local-only evidence': '仅本地证据',
      'Credential refs': '凭据引用',
      'Prepare Runner': '准备 Runner',
      'Runner prepared.': 'Runner 已准备。',
      'Capture Profiles': '采集模式',
      'No capture profiles.': '暂无采集模式。',
      'Entrypoints': '入口',
      'Setup': '配置步骤',
      'Blocked reasons': '阻断原因',
      'Readiness': '就绪信号',
      'Capture Surfaces': '采集能力面',
      'Capture Gates': '采集门禁',
      'Proxy Setup': '代理配置',
      'Recent Capture Evidence': '最近采集证据',
      'Runner Next Actions': 'Runner 下一步',
      'No local runner workbench.': '暂无本地 Runner 工作台。',
      'No capture surfaces.': '暂无采集能力面。',
      'No capture gates.': '暂无采集门禁。',
      'No proxy setup.': '暂无代理配置。',
      'No recent capture evidence.': '暂无最近采集证据。',
      'No runner actions.': '暂无 Runner 动作。',
      'Controls': '控制项',
      'Limitations': '限制',
      'curl example': 'curl 示例',
      'PAC': 'PAC',
      'Owner': '负责人面',
      'Missing': '缺口',
      'Gates': '门禁',
      'Contract': '契约',
      'Must not do': '禁止事项',
      'planned': '规划中',
      'Agent Framework': '智能体框架',
      'Agent framework report has not been loaded.': '智能体框架报告尚未加载。',
      'Worker adapters': 'Worker 适配器',
      'Scanner templates': '扫描模板',
      'Domain skills': '领域 Skills',
      'Kernel': '内核',
      'Extension Points': '扩展点',
      'Invariants': '不变量',
      'Next Steps': '下一步',
      'Not loaded': '未加载',
      'Framework ready': '框架就绪',
      'No agent framework report.': '暂无智能体框架报告。',
      'No framework invariants.': '暂无框架不变量。',
      'No extension points.': '暂无扩展点。',
      'No framework next steps.': '暂无框架下一步。',
      'Agent Harness': '智能体 Harness',
      'Create or select a run to inspect agent harness readiness.': '创建或选择一个运行以查看智能体 Harness 就绪度。',
      'Harness score': 'Harness 评分',
      'Ready cells': '就绪单元',
      'Partial cells': '部分单元',
      'Harness gaps': 'Harness 缺口',
      'Fixture tasks': '夹具任务',
      'Acceptance gates': '验收门禁',
      'Harness Cells': 'Harness 单元',
      'Run Controls': '运行控制',
      'Harness Actions': 'Harness 动作',
      'Harness Eval Plan': 'Harness 评测计划',
      'Create or select a run to inspect harness fixture tasks.': '创建或选择一个运行以查看 Harness 夹具任务。',
      'Fixture Tasks': '夹具任务',
      'No harness fixtures.': '暂无 Harness 夹具。',
      'No harness acceptance gates.': '暂无 Harness 验收门禁。',
      'No agent harness report.': '暂无智能体 Harness 报告。',
      'No harness controls.': '暂无 Harness 控制。',
      'No harness actions.': '暂无 Harness 动作。',
      'Agent loop contract': '智能体循环契约',
      'Tool registry and schema gates': '工具注册与 Schema 门禁',
      'Sandbox runner and execution boundary': '沙箱运行器与执行边界',
      'Observation budget and guardrails': '观测预算与护栏',
      'Eval harness and comparable traces': '评测 Harness 与可比 Trace',
      'Workbench handoff and resume surface': '工作台交接与恢复界面',
      'Evidence delivery gate': '证据交付门禁',
      'Reference Benchmark': '参考项目对比',
      'Create or select a run to compare platform capability against reference projects.': '创建或选择一个运行以对比参考项目能力。',
      'Reference projects': '参考项目',
      'Matched areas': '已对齐领域',
      'Partial areas': '部分完成领域',
      'Commercial blockers': '商业化阻塞',
      'Capability Comparison': '能力对比',
      'Project Lessons': '项目借鉴',
      'Benchmark Actions': '对比动作',
      'No reference benchmark yet.': '暂无参考项目对比。',
      'No reference project lessons.': '暂无参考项目借鉴。',
      'No benchmark actions.': '暂无对比动作。',
      'matched': '已对齐',
      'usable': '可用',
      'partial': '部分可用',
      'gap': '缺口',
      'Adopted': '已吸收',
      'Still missing': '仍缺',
      'Avoided': '刻意避免',
      'Reference role': '参考角色',
      'Scheduling unit': '调度单位',
      'Orchestration': '编排方式',
      'Protocol': '协议',
      'State model': '状态模型',
      'implemented': '实现',
      'controls': '控制',
      'Worker Envelope Preview': 'Worker 协议预览',
      'No preview': '暂无预览',
      'Worker envelope task': 'Worker 协议任务',
      'Auto': '自动',
      'Bootstrap': '启动',
      'Reason': '推理',
      'Explore': '探索',
      'bootstrap': '启动',
      'reason': '推理',
      'explore': '探索',
      'Preview Envelope': '预览协议',
      'No worker envelope preview yet.': '暂无 Worker 协议预览。',
      'Worker envelope preview ready.': 'Worker 协议预览已生成。',
      'No worker configured.': '未配置 Worker。',
      'Task selection': '任务选择',
      'Selected Worker': '选中的 Worker',
      'Graph context': '图上下文',
      'Run context': '运行上下文',
      'Safety': '安全',
      'Envelope JSON': '协议 JSON',
      'claim would occur': '会认领意图',
      'writes state': '写入状态',
      'executes worker': '执行 Worker',
      'raw secrets': '原始密钥',
      'raw evidence content': '原始证据内容',
      'Tool Catalog': '工具目录',
      'Scanner Template Policies': '扫描模板策略',
      'No scanner template policies loaded.': '尚未加载扫描模板策略。',
      'Allowed risks': '允许风险',
      'Max timeout': '最大超时',
      'Requires approval': '需要审批',
      'External fail closed': '外部执行默认关闭',
      'Input policy': '输入策略',
      'Execution controls': '执行控制',
      'Toolbox Policy': '工具箱策略',
      'Toolbox Doctor': '工具箱诊断',
      'Toolbox readiness has not been checked.': '尚未检查工具箱就绪状态。',
      'No toolbox doctor report.': '暂无工具箱诊断报告。',
      'No toolbox doctor actions.': '暂无工具箱诊断动作。',
      'No toolbox adapter cards.': '暂无工具适配器卡片。',
      'Runnable templates': '可运行模板',
      'Blocked templates': '被阻断模板',
      'Operator actions': '操作建议',
      'Runtime Activation Plan': '运行时激活计划',
      'Create or select a run to inspect governed runtime activation.': '创建或选择一个运行以查看受控运行时激活计划。',
      'Ready adapters': '就绪适配器',
      'Blocked steps': '阻塞步骤',
      'Activation Steps': '激活步骤',
      'Runtime Profiles': '运行时配置',
      'Activation Order': '激活顺序',
      'No runtime activation plan.': '暂无运行时激活计划。',
      'No runtime activation profiles.': '暂无运行时配置。',
      'No runtime activation order.': '暂无运行时激活顺序。',
      'operator_action': '需要操作',
      'optional': '可选',
      'blocked': '已阻断',
      'ready': '就绪',
      'policy': '策略',
      'profile': '配置',
      'allowlist': '允许列表',
      'bundle': '工具包',
      'validation': '验证',
      'safety': '安全',
      'Environment': '环境变量',
      'Acceptance': '验收条件',
      'Affects': '影响',
      'Next action': '下一步动作',
      'External execution': '外部执行',
      'Template allowlist': '模板 allowlist',
      'Profile probes': '配置探测',
      'No toolbox policy loaded.': '尚未加载工具箱策略。',
      'Allows all templates': '允许所有模板',
      'Container profile probe': '容器配置探测',
      'Local SAST probe': '本地 SAST 探测',
      'Android toolbox probe': 'Android 工具箱探测',
      'Tool Ecosystem Workbench': '工具生态工作台',
      'Create or select a run to inspect commercial tool ecosystem readiness.': '创建或选择一个运行以查看商业化工具生态就绪度。',
      'Mapped tools': '已映射工具',
      'Recommended packs': '推荐能力包',
      'Evidence loop': '证据闭环',
      'Capability Lanes': '能力泳道',
      'Ecosystem Gates': '生态门禁',
      'Operator Actions': '操作动作',
      'No tool ecosystem workbench yet.': '暂无工具生态工作台。',
      'No tool ecosystem lanes.': '暂无工具生态泳道。',
      'No recommended tool packs.': '暂无推荐工具能力包。',
      'No ecosystem gates.': '暂无生态门禁。',
      'No tool ecosystem actions.': '暂无工具生态动作。',
      'Signals': '信号',
      'Gaps': '缺口',
      'Entrypoint': '入口',
      'Gates': '门禁',
      'ready': '就绪',
      'usable': '可用',
      'thin': '薄弱',
      'needs_mapping': '需要映射',
      'approval_required': '需要审批',
      'Toolbox Bundles': '工具包清单',
      'Bundle manifest JSON': '工具包 Manifest JSON',
      'Register Bundle': '注册工具包',
      'Enable Bundle': '启用工具包',
      'Toolbox bundle registered.': '工具包已注册。',
      'Toolbox bundle enabled.': '工具包已启用。',
      'Invalid bundle manifest JSON.': '工具包 Manifest JSON 无效。',
      'Ecosystem Coverage': '生态覆盖图',
      'Create or select a run to inspect governed ecosystem coverage.': '创建或选择一个运行以查看受控生态覆盖。',
      'Mapped connector tools': '已映射连接器工具',
      'Enabled connectors': '已启用连接器',
      'Enabled bundles': '已启用工具包',
      'Capability areas': '能力领域',
      'Coverage Areas': '覆盖领域',
      'Unmapped Tool Gaps': '未映射工具缺口',
      'Ecosystem Actions': '生态动作',
      'No ecosystem coverage yet.': '暂无生态覆盖数据。',
      'No ecosystem gaps.': '暂无生态缺口。',
      'No ecosystem actions.': '暂无生态动作。',
      'Tool Integration Backlog': '工具接入待办',
      'Create or select a run to inspect governed tool integration backlog.': '创建或选择一个运行以查看受控工具接入待办。',
      'Scanner candidates': '扫描模板候选',
      'Runtime gaps': '运行时缺口',
      'Domain Skill candidates': '领域 Skill 候选',
      'High priority': '高优先级',
      'No tool integration backlog yet.': '暂无工具接入待办。',
      'No tool integration actions.': '暂无工具接入动作。',
      'critical': '关键',
      'high': '高',
      'medium': '中',
      'low': '低',
      'ready_to_map': '可映射',
      'needs_runtime': '需要运行时',
      'needs_design': '需要设计',
      'operator_review': '人工复核',
      'scanner_template': '扫描模板',
      'tool_pack': '工具包',
      'domain_skill': '领域 Skill',
      'first_party_service': '一方服务',
      'runtime_profile': '运行时配置',
      'manual_review': '人工复核',
      'connector_gap': '连接器缺口',
      'runtime_gap': '运行时缺口',
      'capability_gap': '能力缺口',
      'Acceptance': '验收条件',
      'Blocked by': '阻塞原因',
      'Connector Registry': '连接器注册中心',
      'Connector manifest JSON': '连接器 Manifest JSON',
      'Register Connector': '注册连接器',
      'Enable Connector': '启用连接器',
      'Preview Connector': '预览连接器',
      'Run Connector': '运行连接器',
      'Connector Plan': '连接器计划',
      'Connector Runs': '连接器运行记录',
      'Connector plan ready.': '连接器计划已生成。',
      'Connector run completed.': '连接器运行完成。',
      'No connector plan yet.': '暂无连接器计划。',
      'No connector runs.': '暂无连接器运行记录。',
      'Connector registered.': '连接器已注册。',
      'Connector enabled.': '连接器已启用。',
      'Invalid connector manifest JSON.': '连接器 Manifest JSON 无效。',
      'No connectors loaded.': '尚未加载连接器。',
      'Connector kind': '连接器类型',
      'Connector source': '连接器来源',
      'Required env': '所需环境变量',
      'Connector coverage': '连接器覆盖率',
      'Mapped high-level tools': '已映射高层工具',
      'Mapped templates': '已映射模板',
      'Mapped tool packs': '已映射能力包',
      'Unmapped tools': '未映射工具',
      'Mapping notes': '映射说明',
      'Toolbox Profiles': '工具箱配置',
      'Capability Matrix': '能力矩阵',
      'No capabilities loaded.': '尚未加载能力矩阵。',
      'High-level tools': '高层工具',
      'Tools': '工具',
      'Scanner templates': '扫描模板',
      'Profiles': '配置',
      'Engines': '引擎',
      'Evidence kinds': '证据类型',
      'Risk levels': '风险等级',
      'Safety controls': '安全控制',
      'Gaps': '缺口',
      'Domain Skills': '领域 Skills',
      'No domain skills loaded.': '尚未加载领域 Skill。',
      'Enable Skill': '启用 Skill',
      'Enabled': '已启用',
      'Domain Skill enabled.': '领域 Skill 已启用。',
      'Domain Skill Readiness': '领域 Skill 就绪度',
      'Create or select a run to inspect rigid domain Skill readiness.': '创建或选择一个运行以查看刚性领域 Skill 就绪度。',
      'Ready domains': '可用领域',
      'Enabled Skills': '已启用 Skill',
      'Domain artifacts': '领域输入物',
      'Reviewed evidence': '已复核证据',
      'Domain Readiness Cards': '领域就绪卡片',
      'Skill Gates': 'Skill 门禁',
      'Skill Actions': 'Skill 动作',
      'No Domain Skill readiness report.': '暂无领域 Skill 就绪报告。',
      'No Skill gates.': '暂无 Skill 门禁。',
      'No Skill actions.': '暂无 Skill 动作。',
      'Category': '类别',
      'Skill status': 'Skill 状态',
      'Inputs': '输入',
      'Evidence requirements': '证据要求',
      'Worker handoff': 'Worker 交接',
      'needs_input': '需要输入',
      'present': '已具备',
      'missing': '缺失',
      'PoC Library': 'PoC 模板库',
      'No PoC templates loaded.': '尚未加载 PoC 模板。',
      'Enable Template': '启用模板',
      'PoC template enabled.': 'PoC 模板已启用。',
      'Vuln classes': '漏洞类别',
      'Required evidence': '所需证据',
      'Safety notes': '安全提示',
      'Recommended tools': '推荐工具',
      'References': '参考',
      'Tags': '标签',
      'Use cases': '适用场景',
      'Not for': '不用于',
      'Requires': '依赖',
      'No external profile': '无外部配置依赖',
      'Autonomy Plan': '自主计划',
      'Autopilot Tick': '自动驾驶一步',
      'Create or select a run to inspect autonomous strategy.': '创建或选择一个运行以查看自主策略。',
      'No recommendations yet.': '暂无建议。',
      'No worker hints.': '暂无 Worker 提示。',
      'recommendations': '建议',
      'Recommendation Preview': '建议预览',
      'Preview recommendation': '预览建议',
      'No recommendation preview yet.': '暂无建议预览。',
      'Recommendation preview ready.': '建议预览已生成。',
      'Run recommendation': '运行建议',
      'Queue for Worker': '派发给 Worker',
      'Recommendation executed.': '建议已执行。',
      'Recommendation queued for Worker.': '建议已派发给 Worker。',
      'Autopilot tick:': '自动驾驶一步：',
      'queued_and_dispatched': '已排队并调度',
      'waiting_approval': '等待审批',
      'waiting_worker': '等待 Worker',
      'operator_review_required': '需要人工复核',
      'dispatched': '已调度',
      'skipped': '已跳过',
      'Attack Surface': '攻击面',
      'Create or select a run to inspect attack surface.': '创建或选择一个运行以查看攻击面。',
      'Assets': '资产',
      'Endpoints': '端点',
      'Technologies': '技术',
      'Blockers': '阻断点',
      'Observed Endpoints': '已观察端点',
      'Search Frontier': '搜索前沿',
      'Frontier Preview': '前沿预览',
      'Preview frontier': '预览前沿',
      'Run frontier': '运行前沿',
      'Queue frontier': '派发前沿',
      'No frontier preview yet.': '暂无前沿预览。',
      'Frontier preview ready.': '前沿预览已生成。',
      'Frontier executed.': '前沿已执行。',
      'Frontier queued for Worker.': '前沿已派发给 Worker。',
      'No assets mapped.': '暂无资产映射。',
      'No endpoints observed.': '暂无已观察端点。',
      'No technology signals.': '暂无技术信号。',
      'No blockers.': '暂无阻断点。',
      'No frontier items.': '暂无搜索前沿。',
      'Evidence': '证据',
      'Signals': '信号',
      'Suggested': '建议',
      'target': '目标',
      'host': '主机',
      'url': 'URL',
      'cloud_principal': '云身份',
      'identity_node': '身份节点',
      'mobile_package': '移动包',
      'source_artifact': '源码产物',
      'run_target': '运行目标',
      'http_exchange': 'HTTP 交换',
      'browser_snapshot': '浏览器快照',
      'har': 'HAR',
      'scanner_template': '扫描模板',
      'intent': '意图',
      'strategy': '策略',
      'evidence_gap': '证据缺口',
      'connector_gap': '连接器缺口',
      'domain_signal': '领域信号',
      'Tool Packs': '工具能力包',
      'No pack preview': '暂无能力包预览',
      'No tool packs loaded.': '尚未加载工具能力包。',
      'No tool pack preview yet.': '暂无工具能力包预览。',
      'Pack': '能力包',
      'Preview Pack': '预览能力包',
      'Run Pack': '运行能力包',
      'Pack Runs': '能力包运行记录',
      'No tool pack runs.': '暂无能力包运行记录。',
      'Tool pack preview ready.': '工具能力包预览已生成。',
      'Tool pack completed.': '工具能力包运行完成。',
      'Executable': '可执行',
      'Blocked': '已阻断',
      'Approval required': '需要审批',
      'Commercial use': '商业用途',
      'Scanner Template': '扫描模板',
      'Template': '模板',
      'Use current run target': '使用当前运行目标',
      'Risk level': '风险等级',
      'Preview Plan': '预览计划',
      'No plan preview': '暂无计划预览',
      'No plan preview yet.': '暂无计划预览。',
      'Plan preview ready.': '计划预览已生成。',
      'Plan status': '计划状态',
      'Gate': '门禁',
      'Command preview': '命令预览',
      'Audit preview': '审计预览',
      'Evidence policy': '证据策略',
      'Preview writes state': '预览写入状态',
      'Would record invocation': '会记录调用',
      'Would create approval': '会创建审批',
      'Would consume rate limit': '会消耗速率额度',
      'Would execute external process': '会执行外部进程',
      'Would invoke connector': '会调用连接器',
      'Would invoke tools': '会调用工具',
      'Would write evidence': '会写入证据',
      'executable': '可执行',
      'blocked': '已阻断',
      'approval_required': '需要审批',
      'pass': '通过',
      'info': '信息',
      'Run Template': '运行模板',
      'No tools loaded.': '尚未加载工具。',
      'Yes': '是',
      'No': '否',
      'No toolbox bundles loaded.': '尚未加载工具包清单。',
      'No toolbox profiles loaded.': '尚未加载工具箱配置。',
      'Source': '来源',
      'Bundle profiles': '工具包配置',
      'Runnable templates': '可运行模板',
      'Commercial use cases': '商业适用场景',
      'Installation notes': '安装说明',
      'Blocked reasons': '阻断原因',
      'templates': '模板',
      'bundles': '工具包',
      'connectors': '连接器',
      'imports': '导入',
      'profiles': '配置',
      'Available': '可用',
      'Unavailable': '不可用',
      'Ready': '就绪',
      'Image': '镜像',
      'Reason': '原因',
      'produces evidence': '产出证据',
      'approval gated': '需要审批',
      'Start': '启动',
      'Idle': '空闲',
      'Reasoning Board': '推理看板',
      'Assessment Flow': '评估流程',
      'Create or select a run to inspect reasoning flow.': '创建或选择一个运行以查看推理流程。',
      'Reasoning Steps': '推理步骤',
      'Next actions': '下一步动作',
      'Risk notes': '风险提示',
      'No assessment flow yet.': '暂无评估流程。',
      'No next actions.': '暂无下一步动作。',
      'No risk notes.': '暂无风险提示。',
      'Timeline': '时间线',
      'Review Queue': '复核队列',
      'Tool Audit': '工具审计',
      'Evidence Inbox': '证据箱',
      'Evidence Viewer': '证据查看器',
      'Local only': '仅本地',
      'No evidence selected.': '尚未选择证据。',
      'Local Evidence Engine content preview stays on this runner.': '本地 Evidence Engine 内容预览只保留在当前 Runner。',
      'View content': '查看内容',
      'Evidence content loaded.': '证据内容已加载。',
      'Review note': '复核备注',
      'Why this evidence matters or what is missing.': '说明这条证据为什么有用，或还缺什么上下文。',
      'No review decision.': '暂无复核结论。',
      'Review': '复核',
      'Mark useful': '标记有用',
      'Needs context': '需要上下文',
      'Not relevant': '无关',
      'Replay HTTP evidence': '重放 HTTP 证据',
      'HTTP evidence replayed.': 'HTTP 证据已重放。',
      'Promote to Finding': '提升为候选发现',
      'Evidence review saved.': '证据复核已保存。',
      'Candidate finding created from reviewed evidence.': '已从复核证据创建候选发现。',
      'Useful evidence for finding or report.': '可用于发现或报告的有效证据。',
      'More context required before using this evidence.': '使用这条证据前还需要更多上下文。',
      'Evidence is not relevant to the current assessment.': '这条证据与当前评估无关。',
      'Encoding': '编码',
      'Size': '大小',
      'Hash': '哈希',
      'Redaction': '脱敏状态',
      'Preview truncated.': '预览已截断。',
      'No preview available.': '暂无可预览内容。',
      'Binary or base64 evidence content': '二进制或 Base64 证据内容',
      'Browser Session': '浏览器会话',
      'Navigate': '导航',
      'Browser Snapshots': '浏览器快照',
      'Desktop': '桌面端',
      'Login page rendered': '登录页已渲染',
      'Screenshot Base64 or data URL': '截图 Base64 或 data URL',
      'Text/DOM preview': '文本/DOM 预览',
      'Visible text, DOM excerpt, or browser observation': '可见文本、DOM 片段或浏览器观察',
      'Capture Snapshot': '捕获快照',
      'No browser snapshots.': '暂无浏览器快照。',
      'Snapshot target is required.': '快照目标必填。',
      'Snapshot needs screenshot or text preview.': '快照需要截图或文本预览。',
      'Browser snapshot captured.': '浏览器快照已捕获。',
      'Screenshot evidence': '截图证据',
      'Text evidence': '文本证据',
      'OAST Inbox': 'OAST 回调箱',
      'Callbacks': '回调',
      'Proxy Session': '代理会话',
      'Credential References': '凭据引用',
      'Label': '标签',
      'Role': '角色',
      'Kind': '类型',
      'Placeholder': '占位引用',
      'Allowed use': '允许用途',
      'Viewer token': '查看者令牌',
      'Vault reference': 'Vault 引用',
      'Header placeholder': '请求头占位符',
      'Cookie placeholder': 'Cookie 占位符',
      'Account note': '账号备注',
      'Add Reference': '添加引用',
      'Record use': '记录使用',
      'Revoke': '撤销',
      'Access Reviews': '访问差异复核',
      'Baseline credential ID': '基线凭据 ID',
      'Comparison credential ID': '对比凭据 ID',
      'Baseline evidence ID': '基线证据 ID',
      'Comparison evidence ID': '对比证据 ID',
      'Compare Evidence': '比较证据',
      'Role access evidence comparison': '角色访问证据比较',
      'Use as baseline': '设为基线',
      'Use as comparison': '设为对比',
      'SARIF Imports': 'SARIF 导入',
      'Create candidate findings': '创建候选发现',
      'SARIF JSON': 'SARIF JSON',
      'Import SARIF': '导入 SARIF',
      'No SARIF imports.': '暂无 SARIF 导入。',
      'SARIF imported.': 'SARIF 已导入。',
      'SARIF content must be valid JSON.': 'SARIF 内容必须是有效 JSON。',
      'Imported findings': '已导入发现',
      'Android Manifest': 'Android Manifest',
      'Manifest XML': 'Manifest XML',
      'Import Manifest': '导入 Manifest',
      'No Android Manifest imports.': '暂无 Android Manifest 导入。',
      'Android Manifest imported.': 'Android Manifest 已导入。',
      'Manifest XML is required.': 'Manifest XML 必填。',
      'Package': '包名',
      'Risk signals': '风险信号',
      'Risky permissions': '敏感权限',
      'Exported components': '导出组件',
      'Cloud IAM': '云 IAM',
      'Provider': '云厂商',
      'AWS': 'AWS',
      'Generic': '通用',
      'IAM Policy JSON': 'IAM Policy JSON',
      'Import IAM Policy': '导入 IAM Policy',
      'No Cloud IAM imports.': '暂无云 IAM 导入。',
      'Cloud IAM policy imported.': '云 IAM Policy 已导入。',
      'IAM Policy JSON must be valid JSON.': 'IAM Policy JSON 必须是有效 JSON。',
      'Statements': '语句',
      'Allow statements': '允许语句',
      'Wildcard actions': '通配动作',
      'Wildcard resources': '通配资源',
      'Identity Graph': '身份图',
      'BloodHound': 'BloodHound',
      'Identity Graph JSON': '身份图 JSON',
      'Import Identity Graph': '导入身份图',
      'No Identity Graph imports.': '暂无身份图导入。',
      'Identity graph imported.': '身份图已导入。',
      'Identity Graph JSON must be valid JSON.': '身份图 JSON 必须是有效 JSON。',
      'Nodes': '节点',
      'Edges': '边',
      'High-value nodes': '高价值节点',
      'Risky edges': '风险边',
      'HTTP Capture': 'HTTP 捕获',
      'HAR Import': 'HAR 导入',
      'Max entries': '最大条目数',
      'HAR JSON': 'HAR JSON',
      'Import HAR': '导入 HAR',
      'HAR imported:': 'HAR 已导入：',
      'HAR content must be valid JSON.': 'HAR 内容必须是有效 JSON。',
      'No capture imports.': '暂无捕获导入。',
      'Processed entries': '已处理条目',
      'Imported entries': '已导入条目',
      'Skipped entries': '已跳过条目',
      'Truncated entries': '超出限制条目',
      'Skipped reasons': '跳过原因',
      'har': 'HAR',
      'browser': '浏览器',
      'desktop': '桌面端',
      'manual': '手动',
      'hackerone': 'HackerOne',
      'bugcrowd': 'Bugcrowd',
      'src': 'SRC',
      'enterprise': '企业',
      'generic_json': '通用 JSON',
      'aws': 'AWS',
      'generic': '通用',
      'bloodhound': 'BloodHound',
      'imported': '已导入',
      'New Finding': '新增发现',
      'Reports': '报告',
      'Run Exports': '运行导出',
      'Include redacted evidence': '包含已脱敏证据内容',
      'Export': '导出',
      'No run exports generated.': '暂无运行导出。',
      'Run export generated.': '运行导出已生成。',
      'Included evidence content': '已包含证据内容',
      'Omitted local-only evidence': '已跳过仅本地证据',
      'Source': '来源',
      'Manual': '手动',
      'Browser': '浏览器',
      'Proxy': '代理',
      'Method': '方法',
      'Request headers': '请求头',
      'Request body preview': '请求体预览',
      'Status': '状态码',
      'Status text': '状态文本',
      'Response headers': '响应头',
      'Response body preview': '响应体预览',
      'Capture Exchange': '捕获交换',
      'Title': '标题',
      'Evidence IDs': '证据 ID',
      'Severity': '严重性',
      'Critical': '严重',
      'High': '高',
      'Medium': '中',
      'Low': '低',
      'Info': '信息',
      'Confidence': '置信度',
      'Likely': '可能',
      'Confirmed': '已确认',
      'Needs dynamic confirmation': '需要动态确认',
      'Affected assets': '受影响资产',
      'Repro steps': '复现步骤',
      'Impact': '影响',
      'Remediation': '修复建议',
      'Submit Finding': '提交发现',
      'Generate': '生成',
      'No workers configured.': '未配置 Worker。',
      'No facts recorded.': '暂无事实。',
      'No intents proposed.': '暂无意图。',
      'No timeline events.': '暂无时间线事件。',
      'No approvals waiting.': '暂无待审批项。',
      'No tool calls recorded.': '暂无工具调用。',
      'No evidence imported.': '暂无导入证据。',
      'No browser sessions.': '暂无浏览器会话。',
      'No OAST sessions.': '暂无 OAST 会话。',
      'No OAST callbacks.': '暂无 OAST 回调。',
      'No proxy sessions.': '暂无代理会话。',
      'No credential references.': '暂无凭据引用。',
      'No access reviews.': '暂无访问复核。',
      'No findings proposed.': '暂无候选发现。',
      'No reports generated.': '暂无报告。',
      'Refresh runs': '刷新运行',
      'Report format': '报告格式',
      'Finding scope': '发现范围',
      'Confirmed only': '仅已确认',
      'Candidate + confirmed': '候选 + 已确认',
      'Evidence-backed issue title': '有证据支撑的问题标题',
      'evidence_x, evidence_y': 'evidence_x, evidence_y',
      'https://app.example.com/profile': 'https://app.example.com/profile',
      'Content-Type: application/json': 'Content-Type: application/json',
      'Use as evidence': '用作证据',
      'Approve': '批准',
      'Reject': '拒绝',
      'Confirm finding': '确认发现',
      'Reject finding': '驳回发现',
      'Validated by': '验证人',
      'Validation note': '验证备注',
      'Operator confirmed impact after useful evidence review.': '操作者在 useful 证据复核后确认影响成立。',
      'Operator rejected candidate during human review.': '操作者在人工复核中驳回候选发现。',
      'Close': '关闭',
      'Report bundle': '报告包',
      'Target anchored': '目标已锚定',
      'Goal anchored': '目标说明已锚定',
      'Fact recorded': '事实已记录',
      'Human hint added': '人工提示已加入',
      'Intent proposed': '意图已提出',
      'Report bundle generated': '报告包已生成',
      'Current phase': '当前阶段',
      'Step': '步骤',
      'fact': '事实',
      'hint': '提示',
      'intent': '意图',
      'evidence': '证据',
      'finding': '发现',
      'critical': '严重',
      'high': '高',
      'medium': '中',
      'low': '低',
      'info': '信息',
      'candidate': '候选',
      'confirmed': '已确认',
      'rejected': '已驳回',
      'generated': '已生成',
      'approval': '审批',
      'report': '报告',
      'http_exchange': 'HTTP 交换',
      'command_output': '命令输出',
      'screenshot': '截图',
      'oast_callback': 'OAST 回调',
      'file_hash': '文件哈希',
      'replay_bundle': '重放包',
      'raw_local_only': '仅本地原始证据',
      'redacted': '已脱敏',
      'safe_for_cloud': '可安全同步',
      'useful': '有用',
      'not_relevant': '无关',
      'needs_more_context': '需要更多上下文',
      'confirmed_only': '仅已确认',
      'candidate_and_confirmed': '候选 + 已确认',
      'done': '完成',
      'pass': '通过',
      'warn': '提醒',
      'fail': '失败',
      'queued': '排队',
      'active': '进行中',
      'not_started': '未启动',
      'unreviewed': '未复核',
      'prepare_required': '需要准备',
      'approval_required': '需要审批',
      'revoked': '已撤销',
      'blocked': '阻断',
      'review': '复核',
      'draft': '草稿',
      'evidence_ready': '证据就绪',
      'differential_observed': '观察到差异',
      'no_difference': '无明显差异',
      'needs_review': '需要复核',
      'bootstrapping': '启动中',
      'reasoning': '推理中',
      'exploring': '探索中',
      'awaiting_approval': '等待审批',
      'completed': '已完成',
      'stopped': '已停止',
      'available': '可用',
      'unavailable': '不可用',
      'partial': '部分可用',
      'planned': '规划中',
      'policy_blocked': '策略阻断',
      'profile_blocked': '运行时阻断',
      'ready': '就绪',
      'external_required': '需要外部工具',
      'builtin': '内置',
      'built_in': '内置',
      'container_image': '容器镜像',
      'local_runtime': '本地运行时',
      'local_manifest': '本地 Manifest',
      'mobile_lab': '移动实验室',
      'web': 'Web',
      'auth': '认证授权',
      'oast': 'OAST',
      'cloud': '云',
      'identity': '身份',
      'ctf': 'CTF',
      'docker': 'Docker',
      'podman': 'Podman',
      'local': '本地',
      'none': '无',
      'process': '进程',
      'container': '容器',
      'device': '设备',
      'sast': '源码审计',
      'mobile': '移动',
      'network': '网络',
      'platform': '平台',
      'Review evidence inbox and propose an evidence-backed finding if impact is real.': '复核证据箱；如果影响成立，提交有证据支撑的发现。',
      'Generate a report bundle for the candidate findings.': '为候选发现生成报告包。',
      'Dispatch the next reasoning tick or add a human hint to steer exploration.': '调度下一次推理，或加入人工提示来引导探索。',
      'Review completed findings, evidence, and generated reports.': '复核已完成的发现、证据和报告。',
      'Token saved. Refreshing runs.': '令牌已保存，正在刷新运行。',
      'Target, goal, and allowed assets are required.': '目标、目标说明和授权资产必填。',
      'Worker pool JSON must be a non-empty array.': 'Worker 池 JSON 必须是非空数组。',
      'Run created.': '运行已创建。',
      'Report generated.': '报告已生成。',
      'Proxy session started.': '代理会话已启动。',
      'Proxy session closed.': '代理会话已关闭。',
      'Credential reference added.': '凭据引用已添加。',
      'Credential reference revoked.': '凭据引用已撤销。',
      'Credential placeholder recorded.': '凭据占位使用已记录。',
      'Access review compared.': '访问差异复核已完成。',
      'Both baseline and comparison evidence IDs are required.': '基线和对比证据 ID 都是必填。',
      'Browser session started.': '浏览器会话已启动。',
      'Browser navigation captured.': '浏览器导航已捕获。',
      'Browser session closed.': '浏览器会话已关闭。',
      'OAST session started.': 'OAST 会话已启动。',
      'OAST session closed.': 'OAST 会话已关闭。',
      'HTTP capture target is required.': 'HTTP 捕获目标必填。',
      'HTTP exchange captured.': 'HTTP 交换已捕获。',
      'At least one evidence ID is required.': '至少需要一个证据 ID。',
      'Finding submitted.': '发现已提交。',
      'Scanner template is required.': '扫描模板必填。',
      'Scanner template completed.': '扫描模板已完成。',
      'Approval approved.': '审批已批准。',
      'Approval rejected.': '审批已拒绝。',
      'Finding confirmed.': '发现已确认。',
      'Finding rejected.': '发现已驳回。',
      'Run evaluation completed.': '运行评测已完成。',
      'Dispatch paused:': '调度已暂停：',
      'Scope and destructive-action controls': '范围和破坏性动作门禁',
      'Findings have reproducible evidence': '发现具备可复现证据',
      'Human validation coverage': '人工复核覆盖',
      'Report safety and redaction': '报告安全与脱敏',
      'Trace and cost observability': 'Trace 与成本可观测性'
    }
  };

  const countTranslations = {
    'zh-CN': {
      healthy: '健康',
      events: '事件',
      pending: '待处理',
      calls: '调用',
      items: '项',
      active: '活跃',
      runs: '运行',
      facts: '事实',
      evidence: '证据',
      findings: '发现',
      reports: '报告',
      candidates: '候选',
      tools: '工具',
      skills: 'Skill',
      spans: '跨度',
      profiles: '配置',
      areas: '领域',
      imports: '导入',
      recommendations: '建议',
      credentials: '凭据',
      reviews: '复核',
      templates: '模板',
      snapshots: '快照',
      workers: 'Worker'
    }
  };

  const textSources = new WeakMap();

  const els = {
    languageSelect: document.getElementById('language-select'),
    tokenForm: document.getElementById('token-form'),
    tokenInput: document.getElementById('token-input'),
    createRunForm: document.getElementById('create-run-form'),
    aiBaseUrl: document.getElementById('ai-base-url'),
    aiApiKey: document.getElementById('ai-api-key'),
    aiModel: document.getElementById('ai-model'),
    aiConfigStatus: document.getElementById('ai-config-status'),
    aiConfigSummary: document.getElementById('ai-config-summary'),
    applyAiConfig: document.getElementById('apply-ai-config'),
    startAutomatedPentest: document.getElementById('start-automated-pentest'),
    automationMode: document.getElementById('automation-mode'),
    automationDepth: document.getElementById('automation-depth'),
    programScopeForm: document.getElementById('program-scope-form'),
    programScopeCount: document.getElementById('program-scope-count'),
    programScopeList: document.getElementById('program-scope-list'),
    workerPresetSelect: document.getElementById('worker-preset-select'),
    workerPoolJson: document.getElementById('worker-pool-json'),
    runHistoryPanel: document.getElementById('run-history-panel'),
    runHistorySummary: document.getElementById('run-history-summary'),
    toggleRunHistory: document.getElementById('toggle-run-history'),
    runSearch: document.getElementById('run-search'),
    refreshRuns: document.getElementById('refresh-runs'),
    runList: document.getElementById('run-list'),
    message: document.getElementById('message'),
    runTitle: document.getElementById('run-title'),
    runGoal: document.getElementById('run-goal'),
    dispatchOnce: document.getElementById('dispatch-once'),
    dispatchAuto: document.getElementById('dispatch-auto'),
    toggleAdvanced: document.getElementById('toggle-advanced'),
    metricPhase: document.getElementById('metric-phase'),
    metricFacts: document.getElementById('metric-facts'),
    metricIntents: document.getElementById('metric-intents'),
    metricEvidence: document.getElementById('metric-evidence'),
    metricFindings: document.getElementById('metric-findings'),
    metricApprovals: document.getElementById('metric-approvals'),
    simpleStatus: document.getElementById('simple-status'),
    simpleSummary: document.getElementById('simple-summary'),
    simpleCurrentStep: document.getElementById('simple-current-step'),
    simpleNextAction: document.getElementById('simple-next-action'),
    simpleEvidence: document.getElementById('simple-evidence'),
    simpleFindings: document.getElementById('simple-findings'),
    simpleContinue: document.getElementById('simple-continue'),
    simpleAuto: document.getElementById('simple-auto'),
    simpleReport: document.getElementById('simple-report'),
    simpleStepList: document.getElementById('simple-step-list'),
    simpleThoughtList: document.getElementById('simple-thought-list'),
    simpleActionList: document.getElementById('simple-action-list'),
    missionControlStatus: document.getElementById('mission-control-status'),
    missionControlHeadline: document.getElementById('mission-control-headline'),
    missionTopPriority: document.getElementById('mission-top-priority'),
    missionEvidenceReview: document.getElementById('mission-evidence-review'),
    missionWorkers: document.getElementById('mission-workers'),
    missionDelivery: document.getElementById('mission-delivery'),
    missionLaneList: document.getElementById('mission-lane-list'),
    missionTrailList: document.getElementById('mission-trail-list'),
    missionWhyList: document.getElementById('mission-why-list'),
    missionActionList: document.getElementById('mission-action-list'),
    missionGateList: document.getElementById('mission-gate-list'),
    runtimeOpsStatus: document.getElementById('runtime-ops-status'),
    runtimeOpsSummary: document.getElementById('runtime-ops-summary'),
    runtimeOpsEvents: document.getElementById('runtime-ops-events'),
    runtimeOpsSpans: document.getElementById('runtime-ops-spans'),
    runtimeOpsSessions: document.getElementById('runtime-ops-sessions'),
    runtimeOpsWorkers: document.getElementById('runtime-ops-workers'),
    runtimeOpsLaneList: document.getElementById('runtime-ops-lane-list'),
    runtimeOpsContractList: document.getElementById('runtime-ops-contract-list'),
    runtimeOpsEventList: document.getElementById('runtime-ops-event-list'),
    runtimeOpsActionList: document.getElementById('runtime-ops-action-list'),
    runtimeOpsSafetyList: document.getElementById('runtime-ops-safety-list'),
    workbenchPhase: document.getElementById('workbench-phase'),
    workbenchSummary: document.getElementById('workbench-summary'),
    workbenchQueuedMetric: document.getElementById('workbench-queued-metric'),
    workbenchActiveMetric: document.getElementById('workbench-active-metric'),
    workbenchEvidenceMetric: document.getElementById('workbench-evidence-metric'),
    workbenchBlockerMetric: document.getElementById('workbench-blocker-metric'),
    workbenchLaneList: document.getElementById('workbench-lane-list'),
    workbenchActionList: document.getElementById('workbench-action-list'),
    workbenchBlockerList: document.getElementById('workbench-blocker-list'),
    workbenchEventList: document.getElementById('workbench-event-list'),
    searchPlanCount: document.getElementById('search-plan-count'),
    advanceSearchPlan: document.getElementById('advance-search-plan'),
    searchPlanSummary: document.getElementById('search-plan-summary'),
    searchPlanList: document.getElementById('search-plan-list'),
    searchPlanNoteList: document.getElementById('search-plan-note-list'),
    telemetryCount: document.getElementById('telemetry-count'),
    metricSpans: document.getElementById('metric-spans'),
    metricRuntime: document.getElementById('metric-runtime'),
    metricCost: document.getElementById('metric-cost'),
    metricEval: document.getElementById('metric-eval'),
    evaluateRun: document.getElementById('evaluate-run'),
    evalCheckList: document.getElementById('eval-check-list'),
    capabilityRadarStatus: document.getElementById('capability-radar-status'),
    capabilityRadarOverall: document.getElementById('capability-radar-overall'),
    capabilityRadarEvidence: document.getElementById('capability-radar-evidence'),
    capabilityRadarTools: document.getElementById('capability-radar-tools'),
    capabilityRadarWorkers: document.getElementById('capability-radar-workers'),
    capabilityRadarList: document.getElementById('capability-radar-list'),
    capabilityRadarHintList: document.getElementById('capability-radar-hint-list'),
    deliveryReadinessStatus: document.getElementById('delivery-readiness-status'),
    deliveryReadinessList: document.getElementById('delivery-readiness-list'),
    deliveryNextList: document.getElementById('delivery-next-list'),
    evidenceQualityStatus: document.getElementById('evidence-quality-status'),
    evidenceQualitySummary: document.getElementById('evidence-quality-summary'),
    evidenceQualityScore: document.getElementById('evidence-quality-score'),
    evidenceQualityUseful: document.getElementById('evidence-quality-useful'),
    evidenceQualityReplayable: document.getElementById('evidence-quality-replayable'),
    evidenceQualityRedaction: document.getElementById('evidence-quality-redaction'),
    evidenceQualityFindings: document.getElementById('evidence-quality-findings'),
    evidenceQualityMissing: document.getElementById('evidence-quality-missing'),
    evidenceQualityDimensionList: document.getElementById('evidence-quality-dimension-list'),
    evidenceQualityFindingList: document.getElementById('evidence-quality-finding-list'),
    evidenceQualityActionList: document.getElementById('evidence-quality-action-list'),
    workerScorecardList: document.getElementById('worker-scorecard-list'),
    toolScorecardList: document.getElementById('tool-scorecard-list'),
    workerComparisonList: document.getElementById('worker-comparison-list'),
    scorecardRecommendationList: document.getElementById('scorecard-recommendation-list'),
    workerLeaderboardCount: document.getElementById('worker-leaderboard-count'),
    leaderboardWorkerTasks: document.getElementById('leaderboard-worker-tasks'),
    leaderboardExercisedWorkers: document.getElementById('leaderboard-exercised-workers'),
    leaderboardEvidence: document.getElementById('leaderboard-evidence'),
    leaderboardFindings: document.getElementById('leaderboard-findings'),
    workerLeaderboardList: document.getElementById('worker-leaderboard-list'),
    workerLeaderboardTypeList: document.getElementById('worker-leaderboard-type-list'),
    workerLeaderboardActionList: document.getElementById('worker-leaderboard-action-list'),
    workerCount: document.getElementById('worker-count'),
    workerList: document.getElementById('worker-list'),
    workerSelectionStatus: document.getElementById('worker-selection-status'),
    workerSelectionSummary: document.getElementById('worker-selection-summary'),
    workerSelectionPicked: document.getElementById('worker-selection-picked'),
    workerSelectionTask: document.getElementById('worker-selection-task'),
    workerSelectionEligible: document.getElementById('worker-selection-eligible'),
    workerSelectionEvidence: document.getElementById('worker-selection-evidence'),
    workerSelectionList: document.getElementById('worker-selection-list'),
    workerSelectionActionList: document.getElementById('worker-selection-action-list'),
    workerEvalStatus: document.getElementById('worker-eval-status'),
    workerEvalSummary: document.getElementById('worker-eval-summary'),
    workerEvalCoverage: document.getElementById('worker-eval-coverage'),
    workerEvalComparable: document.getElementById('worker-eval-comparable'),
    workerEvalEvidence: document.getElementById('worker-eval-evidence'),
    workerEvalCost: document.getElementById('worker-eval-cost'),
    workerEvalCardList: document.getElementById('worker-eval-card-list'),
    workerEvalDimensionList: document.getElementById('worker-eval-dimension-list'),
    workerEvalExperimentList: document.getElementById('worker-eval-experiment-list'),
    workerEvalActionList: document.getElementById('worker-eval-action-list'),
    executionNodeStatus: document.getElementById('execution-node-status'),
    executionNodeSummary: document.getElementById('execution-node-summary'),
    executionNodeProfiles: document.getElementById('execution-node-profiles'),
    executionNodeTemplates: document.getElementById('execution-node-templates'),
    executionNodeWorkers: document.getElementById('execution-node-workers'),
    executionNodeSessions: document.getElementById('execution-node-sessions'),
    executionNodeRuntimeList: document.getElementById('execution-node-runtime-list'),
    executionNodeGateList: document.getElementById('execution-node-gate-list'),
    executionNodeActionList: document.getElementById('execution-node-action-list'),
    desktopReadinessStatus: document.getElementById('desktop-readiness-status'),
    desktopReadinessSummary: document.getElementById('desktop-readiness-summary'),
    desktopReadyComponents: document.getElementById('desktop-ready-components'),
    desktopPartialComponents: document.getElementById('desktop-partial-components'),
    desktopPlannedGaps: document.getElementById('desktop-planned-gaps'),
    desktopLocalSessions: document.getElementById('desktop-local-sessions'),
    desktopEvidenceItems: document.getElementById('desktop-evidence-items'),
    desktopRunnableTemplates: document.getElementById('desktop-runnable-templates'),
    desktopComponentList: document.getElementById('desktop-component-list'),
    desktopContractList: document.getElementById('desktop-contract-list'),
    desktopActionList: document.getElementById('desktop-action-list'),
    runnerWorkbenchStatus: document.getElementById('runner-workbench-status'),
    prepareRunnerWorkbench: document.getElementById('prepare-runner-workbench'),
    runnerWorkbenchSummary: document.getElementById('runner-workbench-summary'),
    runnerWorkbenchBrowser: document.getElementById('runner-workbench-browser'),
    runnerWorkbenchProxy: document.getElementById('runner-workbench-proxy'),
    runnerWorkbenchHttp: document.getElementById('runner-workbench-http'),
    runnerWorkbenchReviewed: document.getElementById('runner-workbench-reviewed'),
    runnerWorkbenchLocalOnly: document.getElementById('runner-workbench-local-only'),
    runnerWorkbenchCredentials: document.getElementById('runner-workbench-credentials'),
    runnerWorkbenchProfileList: document.getElementById('runner-workbench-profile-list'),
    runnerWorkbenchSurfaceList: document.getElementById('runner-workbench-surface-list'),
    runnerWorkbenchGateList: document.getElementById('runner-workbench-gate-list'),
    runnerWorkbenchProxyList: document.getElementById('runner-workbench-proxy-list'),
    runnerWorkbenchEvidenceList: document.getElementById('runner-workbench-evidence-list'),
    runnerWorkbenchActionList: document.getElementById('runner-workbench-action-list'),
    agentFrameworkStatus: document.getElementById('agent-framework-status'),
    agentFrameworkSummary: document.getElementById('agent-framework-summary'),
    frameworkWorkerMetric: document.getElementById('framework-worker-metric'),
    frameworkToolMetric: document.getElementById('framework-tool-metric'),
    frameworkTemplateMetric: document.getElementById('framework-template-metric'),
    frameworkSkillMetric: document.getElementById('framework-skill-metric'),
    agentFrameworkKernelList: document.getElementById('agent-framework-kernel-list'),
    agentFrameworkInvariantList: document.getElementById('agent-framework-invariant-list'),
    agentFrameworkExtensionList: document.getElementById('agent-framework-extension-list'),
    agentFrameworkNextList: document.getElementById('agent-framework-next-list'),
    agentHarnessStatus: document.getElementById('agent-harness-status'),
    agentHarnessSummary: document.getElementById('agent-harness-summary'),
    harnessScoreMetric: document.getElementById('harness-score-metric'),
    harnessReadyMetric: document.getElementById('harness-ready-metric'),
    harnessPartialMetric: document.getElementById('harness-partial-metric'),
    harnessGapMetric: document.getElementById('harness-gap-metric'),
    harnessFixtureMetric: document.getElementById('harness-fixture-metric'),
    harnessGateMetric: document.getElementById('harness-gate-metric'),
    agentHarnessCellList: document.getElementById('agent-harness-cell-list'),
    agentHarnessControlList: document.getElementById('agent-harness-control-list'),
    agentHarnessActionList: document.getElementById('agent-harness-action-list'),
    agentHarnessPlanStatus: document.getElementById('agent-harness-plan-status'),
    agentHarnessPlanSummary: document.getElementById('agent-harness-plan-summary'),
    agentHarnessFixtureList: document.getElementById('agent-harness-fixture-list'),
    agentHarnessGateList: document.getElementById('agent-harness-gate-list'),
    referenceBenchmarkStatus: document.getElementById('reference-benchmark-status'),
    referenceBenchmarkSummary: document.getElementById('reference-benchmark-summary'),
    referenceProjectMetric: document.getElementById('reference-project-metric'),
    referenceMatchedMetric: document.getElementById('reference-matched-metric'),
    referencePartialMetric: document.getElementById('reference-partial-metric'),
    referenceBlockerMetric: document.getElementById('reference-blocker-metric'),
    referenceDimensionList: document.getElementById('reference-dimension-list'),
    referenceProjectList: document.getElementById('reference-project-list'),
    referenceActionList: document.getElementById('reference-action-list'),
    workerEnvelopeStatus: document.getElementById('worker-envelope-status'),
    workerEnvelopeTask: document.getElementById('worker-envelope-task'),
    previewWorkerEnvelope: document.getElementById('preview-worker-envelope'),
    workerEnvelopeList: document.getElementById('worker-envelope-list'),
    workerEnvelopeJson: document.getElementById('worker-envelope-json'),
    toolCatalogCount: document.getElementById('tool-catalog-count'),
    toolCatalogList: document.getElementById('tool-catalog-list'),
    templatePolicyCount: document.getElementById('template-policy-count'),
    templatePolicyList: document.getElementById('template-policy-list'),
    toolboxPolicyStatus: document.getElementById('toolbox-policy-status'),
    toolboxPolicyList: document.getElementById('toolbox-policy-list'),
    toolboxDoctorCount: document.getElementById('toolbox-doctor-count'),
    toolboxDoctorSummary: document.getElementById('toolbox-doctor-summary'),
    toolboxDoctorActionList: document.getElementById('toolbox-doctor-action-list'),
    toolboxDoctorAdapterList: document.getElementById('toolbox-doctor-adapter-list'),
    runtimeActivationStatus: document.getElementById('runtime-activation-status'),
    runtimeActivationSummary: document.getElementById('runtime-activation-summary'),
    runtimeActivationRunnable: document.getElementById('runtime-activation-runnable'),
    runtimeActivationAdapters: document.getElementById('runtime-activation-adapters'),
    runtimeActivationActions: document.getElementById('runtime-activation-actions'),
    runtimeActivationBlocked: document.getElementById('runtime-activation-blocked'),
    runtimeActivationStepList: document.getElementById('runtime-activation-step-list'),
    runtimeActivationProfileList: document.getElementById('runtime-activation-profile-list'),
    runtimeActivationOrderList: document.getElementById('runtime-activation-order-list'),
    toolEcosystemStatus: document.getElementById('tool-ecosystem-status'),
    toolEcosystemSummary: document.getElementById('tool-ecosystem-summary'),
    toolEcosystemRunnable: document.getElementById('tool-ecosystem-runnable'),
    toolEcosystemMapped: document.getElementById('tool-ecosystem-mapped'),
    toolEcosystemPacks: document.getElementById('tool-ecosystem-packs'),
    toolEcosystemEvidenceLoop: document.getElementById('tool-ecosystem-evidence-loop'),
    toolEcosystemLaneList: document.getElementById('tool-ecosystem-lane-list'),
    toolEcosystemPackList: document.getElementById('tool-ecosystem-pack-list'),
    toolEcosystemGateList: document.getElementById('tool-ecosystem-gate-list'),
    toolEcosystemActionList: document.getElementById('tool-ecosystem-action-list'),
    toolboxBundleCount: document.getElementById('toolbox-bundle-count'),
    toolboxBundleList: document.getElementById('toolbox-bundle-list'),
    toolboxBundleForm: document.getElementById('toolbox-bundle-form'),
    toolboxBundleJson: document.getElementById('toolbox-bundle-json'),
    ecosystemCoverageStatus: document.getElementById('ecosystem-coverage-status'),
    ecosystemCoverageSummary: document.getElementById('ecosystem-coverage-summary'),
    ecosystemMappedTools: document.getElementById('ecosystem-mapped-tools'),
    ecosystemEnabledConnectors: document.getElementById('ecosystem-enabled-connectors'),
    ecosystemEnabledBundles: document.getElementById('ecosystem-enabled-bundles'),
    ecosystemCapabilityAreas: document.getElementById('ecosystem-capability-areas'),
    ecosystemAreaList: document.getElementById('ecosystem-area-list'),
    ecosystemGapList: document.getElementById('ecosystem-gap-list'),
    ecosystemActionList: document.getElementById('ecosystem-action-list'),
    toolBacklogCount: document.getElementById('tool-backlog-count'),
    toolBacklogSummary: document.getElementById('tool-backlog-summary'),
    toolBacklogScanners: document.getElementById('tool-backlog-scanners'),
    toolBacklogRuntimes: document.getElementById('tool-backlog-runtimes'),
    toolBacklogSkills: document.getElementById('tool-backlog-skills'),
    toolBacklogPriority: document.getElementById('tool-backlog-priority'),
    toolBacklogList: document.getElementById('tool-backlog-list'),
    toolBacklogActionList: document.getElementById('tool-backlog-action-list'),
    connectorCount: document.getElementById('connector-count'),
    connectorList: document.getElementById('connector-list'),
    connectorForm: document.getElementById('connector-form'),
    connectorJson: document.getElementById('connector-json'),
    connectorPlanList: document.getElementById('connector-plan-list'),
    connectorRunList: document.getElementById('connector-run-list'),
    toolboxProfileCount: document.getElementById('toolbox-profile-count'),
    toolboxProfileList: document.getElementById('toolbox-profile-list'),
    capabilityCount: document.getElementById('capability-count'),
    capabilityList: document.getElementById('capability-list'),
    domainSkillCount: document.getElementById('domain-skill-count'),
    domainSkillList: document.getElementById('domain-skill-list'),
    domainSkillReadinessStatus: document.getElementById('domain-skill-readiness-status'),
    domainSkillReadinessSummary: document.getElementById('domain-skill-readiness-summary'),
    domainSkillReadinessReady: document.getElementById('domain-skill-readiness-ready'),
    domainSkillReadinessEnabled: document.getElementById('domain-skill-readiness-enabled'),
    domainSkillReadinessArtifacts: document.getElementById('domain-skill-readiness-artifacts'),
    domainSkillReadinessReviewed: document.getElementById('domain-skill-readiness-reviewed'),
    domainSkillReadinessList: document.getElementById('domain-skill-readiness-list'),
    domainSkillGateList: document.getElementById('domain-skill-gate-list'),
    domainSkillActionList: document.getElementById('domain-skill-action-list'),
    pocTemplateCount: document.getElementById('poc-template-count'),
    pocTemplateList: document.getElementById('poc-template-list'),
    strategyCount: document.getElementById('strategy-count'),
    autopilotTick: document.getElementById('autopilot-tick'),
    strategySummary: document.getElementById('strategy-summary'),
    strategyList: document.getElementById('strategy-list'),
    strategyPlanStatus: document.getElementById('strategy-plan-status'),
    strategyPlanList: document.getElementById('strategy-plan-list'),
    strategyHints: document.getElementById('strategy-hints'),
    surfaceCount: document.getElementById('surface-count'),
    surfaceSummary: document.getElementById('surface-summary'),
    surfaceAssetsMetric: document.getElementById('surface-assets-metric'),
    surfaceEndpointsMetric: document.getElementById('surface-endpoints-metric'),
    surfaceTechMetric: document.getElementById('surface-tech-metric'),
    surfaceBlockersMetric: document.getElementById('surface-blockers-metric'),
    surfaceAssetList: document.getElementById('surface-asset-list'),
    surfaceEndpointList: document.getElementById('surface-endpoint-list'),
    surfaceTechList: document.getElementById('surface-tech-list'),
    surfaceFrontierList: document.getElementById('surface-frontier-list'),
    surfaceFrontierPlanStatus: document.getElementById('surface-frontier-plan-status'),
    surfaceFrontierPlanList: document.getElementById('surface-frontier-plan-list'),
    surfaceBlockerList: document.getElementById('surface-blocker-list'),
    toolPackStatus: document.getElementById('tool-pack-status'),
    toolPackForm: document.getElementById('tool-pack-form'),
    toolPackSelect: document.getElementById('tool-pack-select'),
    previewToolPack: document.getElementById('preview-tool-pack'),
    invokeToolPack: document.getElementById('invoke-tool-pack'),
    toolPackPlanList: document.getElementById('tool-pack-plan-list'),
    toolPackRunList: document.getElementById('tool-pack-run-list'),
    scannerTemplateForm: document.getElementById('scanner-template-form'),
    scannerTemplateSelect: document.getElementById('scanner-template-select'),
    scannerRiskLevel: document.getElementById('scanner-risk-level'),
    previewScannerTemplate: document.getElementById('preview-scanner-template'),
    scannerPlanStatus: document.getElementById('scanner-plan-status'),
    scannerPlanList: document.getElementById('scanner-plan-list'),
    flowPhase: document.getElementById('flow-phase'),
    flowSummary: document.getElementById('flow-summary'),
    flowStepList: document.getElementById('flow-step-list'),
    flowNextList: document.getElementById('flow-next-list'),
    flowRiskList: document.getElementById('flow-risk-list'),
    graphStatus: document.getElementById('graph-status'),
    factsList: document.getElementById('facts-list'),
    intentsList: document.getElementById('intents-list'),
    eventList: document.getElementById('event-list'),
    eventCount: document.getElementById('event-count'),
    approvalCount: document.getElementById('approval-count'),
    approvalList: document.getElementById('approval-list'),
    toolCount: document.getElementById('tool-count'),
    toolList: document.getElementById('tool-list'),
    evidenceCount: document.getElementById('evidence-count'),
    evidenceList: document.getElementById('evidence-list'),
    evidenceViewerTitle: document.getElementById('evidence-viewer-title'),
    evidenceViewerMeta: document.getElementById('evidence-viewer-meta'),
    evidenceViewerContent: document.getElementById('evidence-viewer-content'),
    evidenceReviewStatus: document.getElementById('evidence-review-status'),
    evidenceReviewNote: document.getElementById('evidence-review-note'),
    markEvidenceUseful: document.getElementById('mark-evidence-useful'),
    markEvidenceNeedsContext: document.getElementById('mark-evidence-needs-context'),
    markEvidenceNotRelevant: document.getElementById('mark-evidence-not-relevant'),
    replayEvidence: document.getElementById('replay-evidence'),
    promoteEvidenceFinding: document.getElementById('promote-evidence-finding'),
    browserSessionCount: document.getElementById('browser-session-count'),
    browserSessionList: document.getElementById('browser-session-list'),
    startBrowserSession: document.getElementById('start-browser-session'),
    browserNavigateForm: document.getElementById('browser-navigate-form'),
    browserSnapshotCount: document.getElementById('browser-snapshot-count'),
    browserSnapshotList: document.getElementById('browser-snapshot-list'),
    browserSnapshotForm: document.getElementById('browser-snapshot-form'),
    oastSessionCount: document.getElementById('oast-session-count'),
    oastSessionList: document.getElementById('oast-session-list'),
    oastCallbackList: document.getElementById('oast-callback-list'),
    startOastSession: document.getElementById('start-oast-session'),
    proxySessionCount: document.getElementById('proxy-session-count'),
    proxySessionList: document.getElementById('proxy-session-list'),
    startProxySession: document.getElementById('start-proxy-session'),
    credentialReferenceCount: document.getElementById('credential-reference-count'),
    credentialReferenceList: document.getElementById('credential-reference-list'),
    credentialReferenceForm: document.getElementById('credential-reference-form'),
    accessReviewCount: document.getElementById('access-review-count'),
    accessReviewList: document.getElementById('access-review-list'),
    accessReviewForm: document.getElementById('access-review-form'),
    sarifImportCount: document.getElementById('sarif-import-count'),
    sarifImportList: document.getElementById('sarif-import-list'),
    sarifImportForm: document.getElementById('sarif-import-form'),
    androidManifestCount: document.getElementById('android-manifest-count'),
    androidManifestList: document.getElementById('android-manifest-list'),
    androidManifestForm: document.getElementById('android-manifest-form'),
    cloudIamCount: document.getElementById('cloud-iam-count'),
    cloudIamList: document.getElementById('cloud-iam-list'),
    cloudIamForm: document.getElementById('cloud-iam-form'),
    identityGraphCount: document.getElementById('identity-graph-count'),
    identityGraphList: document.getElementById('identity-graph-list'),
    identityGraphForm: document.getElementById('identity-graph-form'),
    captureImportCount: document.getElementById('capture-import-count'),
    captureImportList: document.getElementById('capture-import-list'),
    httpCaptureForm: document.getElementById('http-capture-form'),
    harImportForm: document.getElementById('har-import-form'),
    findingForm: document.getElementById('finding-form'),
    findingCount: document.getElementById('finding-count'),
    findingList: document.getElementById('finding-list'),
    reportFormat: document.getElementById('report-format'),
    reportFindingScope: document.getElementById('report-finding-scope'),
    generateReport: document.getElementById('generate-report'),
    reportList: document.getElementById('report-list'),
    exportIncludeContent: document.getElementById('export-include-content'),
    generateRunExport: document.getElementById('generate-run-export'),
    runExportList: document.getElementById('run-export-list')
  };

  els.tokenInput.value = state.token;
  els.languageSelect.value = state.language;
  els.aiBaseUrl.value = state.aiConfig.baseUrl;
  els.aiModel.value = state.aiConfig.model;
  els.aiApiKey.value = state.aiConfig.apiKey;
  els.automationMode.value = localStorage.getItem('automationMode') || 'safe_4';
  els.automationDepth.value = localStorage.getItem('automationDepth') || '4';
  els.runSearch.value = state.runSearch;
  applyAiConfigToWorkerPool({ silent: true });
  els.toolboxBundleJson.value = JSON.stringify(defaultToolboxBundleManifest, null, 2);
  els.connectorJson.value = JSON.stringify(defaultConnectorManifest, null, 2);
  applyAdvancedMode();
  setRunHistoryCollapsed(state.runHistoryCollapsed, { persist: false });
  bindEvents();
  renderStrategyPlanPreview(null);
  renderAgentFramework(null);
  renderWorkerEnvelopePreview(null);
  renderConnectorPlanPreview(null);
  renderToolPackPlanPreview(null);
  renderToolPlanPreview(null);
  renderAttackSurface(null);
  renderSurfaceFrontierPlanPreview(null);
  renderAgentHarness(null);
  applyLanguage();
  refreshAgentFramework();
  refreshWorkerLeaderboard();
  refreshToolCatalog();
  refreshToolPacks();
  refreshScannerTemplatePolicies();
  refreshToolboxPolicy();
  refreshToolboxDoctor();
  refreshToolboxBundles();
  refreshConnectors();
  refreshToolboxProfiles();
  refreshCapabilities();
  refreshProgramScopeImports();
  refreshDomainSkills();
  refreshPocTemplates();
  refreshRuns();
  window.setInterval(() => {
    if (state.activeRunId && !state.busy) {
      refreshProgress();
    }
  }, 4000);

  function bindEvents() {
    els.languageSelect.addEventListener('change', () => {
      state.language = els.languageSelect.value;
      localStorage.setItem('platformLanguage', state.language);
      if (state.flow) {
        renderFlow(state.flow);
      }
      if (state.strategy) {
        renderStrategy(state.strategy);
      }
      if (state.surface) {
        renderAttackSurface(state.surface);
      }
      renderWorkbench(state.workbench);
      renderSearchPlan(state.searchPlan);
      renderSurfaceFrontierPlanPreview(state.surfaceFrontierPlanPreview);
      renderStrategyPlanPreview(state.strategyPlanPreview);
      renderAgentFramework(state.agentFramework);
      renderAgentHarness(state.agentHarness);
      renderWorkerLeaderboard(state.workerLeaderboard);
      renderWorkerEnvelopePreview(state.workerEnvelopePreview);
      renderConnectorPlanPreview(state.connectorPlanPreview);
      renderToolCatalog(state.toolCatalog);
      renderToolPacks(state.toolPacks);
      renderToolPackPlanPreview(state.toolPackPlanPreview);
      renderScannerTemplatePolicies(state.scannerTemplatePolicies);
      renderToolboxPolicy(state.toolboxPolicy);
      renderToolboxDoctor(state.toolboxDoctor);
      renderToolboxBundles(state.toolboxBundles);
      renderConnectors(state.connectors);
      renderToolboxProfiles(state.toolboxProfiles);
      renderCapabilities(state.capabilities);
      renderDomainSkills(state.domainSkills);
      renderPocTemplates(state.pocTemplates);
      renderToolPlanPreview(state.toolPlanPreview);
      renderEvidenceViewer(state.evidenceViewerPayload);
      applyLanguage();
      setRunHistoryCollapsed(state.runHistoryCollapsed, { persist: false });
      renderRunHistorySummary();
    });

    els.tokenForm.addEventListener('submit', (event) => {
      event.preventDefault();
      state.token = els.tokenInput.value.trim();
      localStorage.setItem('platformToken', state.token);
      showMessage('Token saved. Refreshing runs.');
      refreshAgentFramework();
      refreshWorkerLeaderboard();
      refreshToolCatalog();
      refreshToolPacks();
      refreshScannerTemplatePolicies();
      refreshToolboxPolicy();
      refreshToolboxDoctor();
      refreshToolboxBundles();
      refreshConnectors();
      refreshToolboxProfiles();
      refreshCapabilities();
      refreshProgramScopeImports();
      refreshDomainSkills();
      refreshPocTemplates();
      refreshRuns();
    });

    els.refreshRuns.addEventListener('click', refreshRuns);
    els.workerPresetSelect.addEventListener('change', () => {
      if (els.workerPresetSelect.value === 'ai') {
        applyAiConfigToWorkerPool({ silent: true });
      } else if (els.workerPresetSelect.value !== 'custom') {
        els.workerPoolJson.value = workerPoolPresetJson(els.workerPresetSelect.value);
      }
    });
    els.applyAiConfig.addEventListener('click', () => applyAiConfigToWorkerPool());
    els.startAutomatedPentest.addEventListener('click', startAutomatedPentest);
    els.automationMode.addEventListener('change', () => {
      localStorage.setItem('automationMode', els.automationMode.value);
    });
    els.automationDepth.addEventListener('change', () => {
      localStorage.setItem('automationDepth', els.automationDepth.value);
    });
    els.toggleRunHistory.addEventListener('click', () => {
      setRunHistoryCollapsed(!state.runHistoryCollapsed);
    });
    els.runSearch.addEventListener('input', () => {
      state.runSearch = els.runSearch.value.trim().toLowerCase();
      renderRunList();
    });
    [els.aiBaseUrl, els.aiModel].forEach((input) => {
      input.addEventListener('input', () => {
        const config = collectAiConfig();
        persistPlatformAiConfig(config);
        renderAiConfigStatus(config);
        if (els.workerPresetSelect.value === 'ai') {
          applyAiConfigToWorkerPool({ silent: true });
        }
      });
    });
    els.aiApiKey.addEventListener('input', () => {
      state.aiConfig.apiKey = els.aiApiKey.value.trim();
      renderAiConfigStatus(collectAiConfig());
    });
    els.dispatchOnce.addEventListener('click', () => dispatchTicks(1));
    els.dispatchAuto.addEventListener('click', () => dispatchTicks(automationTicksForMode('safe_4')));
    els.simpleContinue.addEventListener('click', () => dispatchTicks(1));
    els.simpleAuto.addEventListener('click', () => dispatchTicks(automationTicksForMode('safe_4')));
    els.simpleReport.addEventListener('click', generateReport);
    els.toggleAdvanced.addEventListener('click', toggleAdvancedMode);
    els.autopilotTick.addEventListener('click', autopilotTick);
    els.advanceSearchPlan.addEventListener('click', advanceSearchPlan);
    els.evaluateRun.addEventListener('click', evaluateRun);
    els.previewWorkerEnvelope.addEventListener('click', previewWorkerEnvelope);
    els.workerEnvelopeTask.addEventListener('change', () => renderWorkerEnvelopePreview(null));
    els.prepareRunnerWorkbench.addEventListener('click', prepareRunnerWorkbench);
    els.generateReport.addEventListener('click', generateReport);
    els.generateRunExport.addEventListener('click', generateRunExport);
    els.programScopeForm.addEventListener('submit', submitProgramScopeImport);
    els.toolboxBundleForm.addEventListener('submit', submitToolboxBundle);
    els.connectorForm.addEventListener('submit', submitConnector);
    els.startBrowserSession.addEventListener('click', startBrowserSession);
    els.browserNavigateForm.addEventListener('submit', submitBrowserNavigate);
    els.browserSnapshotForm.addEventListener('submit', submitBrowserSnapshot);
    els.startOastSession.addEventListener('click', startOastSession);
    els.startProxySession.addEventListener('click', startProxySession);
    els.markEvidenceUseful.addEventListener('click', () => submitEvidenceReview('useful'));
    els.markEvidenceNeedsContext.addEventListener('click', () => submitEvidenceReview('needs_more_context'));
    els.markEvidenceNotRelevant.addEventListener('click', () => submitEvidenceReview('not_relevant'));
    els.replayEvidence.addEventListener('click', replaySelectedEvidence);
    els.promoteEvidenceFinding.addEventListener('click', promoteEvidenceToFinding);
    els.credentialReferenceForm.addEventListener('submit', submitCredentialReference);
    els.accessReviewForm.addEventListener('submit', submitAccessReview);
    els.sarifImportForm.addEventListener('submit', submitSarifImport);
    els.androidManifestForm.addEventListener('submit', submitAndroidManifest);
    els.cloudIamForm.addEventListener('submit', submitCloudIamImport);
    els.identityGraphForm.addEventListener('submit', submitIdentityGraphImport);
    els.httpCaptureForm.addEventListener('submit', submitHttpCapture);
    els.harImportForm.addEventListener('submit', submitHarImport);
    els.toolPackSelect.addEventListener('change', () => renderToolPackPlanPreview(null));
    els.previewToolPack.addEventListener('click', previewToolPack);
    els.toolPackForm.addEventListener('submit', invokeToolPack);
    els.scannerTemplateSelect.addEventListener('change', () => {
      syncScannerRiskFromTemplate();
      renderToolPlanPreview(null);
    });
    els.previewScannerTemplate.addEventListener('click', previewScannerTemplate);
    els.scannerTemplateForm.addEventListener('submit', submitScannerTemplate);
    els.findingForm.addEventListener('submit', submitFinding);

    els.createRunForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await createRunFromForm({ useAiWorker: els.workerPresetSelect.value === 'ai' });
    });
  }

  async function createRunFromForm(options = {}) {
    const form = new FormData(els.createRunForm);
    const target = String(form.get('target') || '').trim();
    const goal = String(form.get('goal') || '').trim();
    const allowedAssets = splitAssets(String(form.get('allowedAssets') || ''));
    const deniedAssets = splitAssets(String(form.get('deniedAssets') || ''));
    const allowedMethods = splitAssets(String(form.get('allowedMethods') || 'GET, POST')).map((item) => item.toUpperCase());
    const requestsPerMinute = Number(String(form.get('requestsPerMinute') || '120'));
    const workerPool = options.useAiWorker
      ? workerPoolFromAiConfig({ includeSecret: true })
      : parseWorkerPoolJson(String(form.get('workerPool') || ''));
    if (!target || !goal || allowedAssets.length === 0) {
      showMessage('Target, goal, and allowed assets are required.', true);
      return null;
    }
    if (!workerPool) {
      showMessage(options.useAiWorker ? 'AI base URL and model are required. Set API keys in the server environment.' : 'Worker pool JSON must be a non-empty array.', true);
      return null;
    }
    let createdRun = null;
    await withBusy(async () => {
      const run = await api('/runs', {
        method: 'POST',
        body: {
          target,
          goal,
          scopePolicy: {
            allowedAssets,
            deniedAssets,
            allowedMethods: allowedMethods.length > 0 ? allowedMethods : ['GET', 'POST'],
            destructiveAllowed: form.get('destructiveAllowed') === 'on',
            credentialRules: { allowVaultReferencesOnly: form.get('allowVaultReferencesOnly') === 'on' },
            rateLimits: { requestsPerMinute: Number.isFinite(requestsPerMinute) && requestsPerMinute > 0 ? requestsPerMinute : 120 }
          },
          workerPool
        }
      });
      createdRun = run;
      state.activeRunId = run.id;
      localStorage.setItem('activeRunId', run.id);
      showMessage(options.useAiWorker ? 'Automated AI pentest run created.' : 'Run created.');
      await refreshRuns();
    });
    return createdRun;
  }

  async function startAutomatedPentest() {
    if (!state.token) {
      showMessage('Local token is required before starting automation.', true);
      return;
    }
    const run = await createRunFromForm({ useAiWorker: true });
    if (run) {
      await startAutomationForMode();
    }
  }

  async function startAutomationForMode() {
    const mode = els.automationMode.value || 'safe_4';
    localStorage.setItem('automationMode', mode);
    localStorage.setItem('automationDepth', els.automationDepth.value || '4');
    await dispatchTicks(automationTicksForMode(mode));
  }

  function automationTicksForMode(mode) {
    const depth = Math.max(1, Math.min(12, Number(els.automationDepth.value || 4) || 4));
    if (mode === 'single') return 1;
    if (mode === 'safe_4') return 4;
    return depth;
  }

  function toggleAdvancedMode() {
    state.showAdvanced = !state.showAdvanced;
    localStorage.setItem('showAdvancedConsole', state.showAdvanced ? '1' : '0');
    applyAdvancedMode();
  }

  function applyAdvancedMode() {
    document.body.classList.toggle('show-advanced', state.showAdvanced);
    els.toggleAdvanced.textContent = state.showAdvanced ? 'Hide Advanced' : 'Show Advanced';
    els.createRunForm.classList.toggle('is-simple', !state.showAdvanced);
    applyLanguage();
  }

  function t(text) {
    const countMatch = String(text).match(/^(\\d+) (healthy|events|pending|calls|items|active|runs|facts|evidence|findings|reports|candidates|tools|skills|spans|profiles|areas|imports|recommendations|credentials|reviews|templates|bundles|connectors|snapshots|workers)$/);
    if (countMatch && countTranslations[state.language] && countTranslations[state.language][countMatch[2]]) {
      return countMatch[1] + ' ' + countTranslations[state.language][countMatch[2]];
    }
    return translations[state.language] && translations[state.language][text] ? translations[state.language][text] : text;
  }

  function applyLanguage(root = document.body) {
    document.documentElement.lang = state.language;
    document.title = t('Operator Console');
    if (els.languageSelect.value !== state.language) {
      els.languageSelect.value = state.language;
    }
    translateTextNodes(root);
    translateAttributes(root);
  }

  function translateTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style')) return NodeFilter.FILTER_REJECT;
        if (parent.closest('[data-no-i18n]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!textSources.has(node)) {
        textSources.set(node, node.nodeValue);
      }
      const source = textSources.get(node);
      const trimmed = source.trim();
      node.nodeValue = source.replace(trimmed, t(trimmed));
    }
  }

  function translateAttributes(root) {
    const attrNames = ['placeholder', 'title', 'aria-label'];
    const elements = [root, ...root.querySelectorAll('*')].filter((item) => item && item.getAttribute);
    for (const element of elements) {
      for (const attr of attrNames) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        const key = 'i18n' + attr.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase());
        if (!element.dataset[key]) {
          element.dataset[key] = value;
        }
        element.setAttribute(attr, t(element.dataset[key]));
      }
    }
  }

  async function refreshAgentFramework() {
    if (!state.token) {
      renderAgentFramework(null);
      return;
    }
    try {
      renderAgentFramework(await api('/agent-framework'));
    } catch {
      renderAgentFramework(null);
    }
  }

  async function refreshWorkerLeaderboard() {
    if (!state.token) {
      renderWorkerLeaderboard(null);
      return;
    }
    try {
      renderWorkerLeaderboard(await api('/worker-leaderboard'));
    } catch {
      renderWorkerLeaderboard(null);
    }
  }

  async function refreshToolCatalog() {
    if (!state.token) {
      renderToolCatalog([]);
      return;
    }
    try {
      renderToolCatalog(await api('/tool-catalog'));
    } catch {
      renderToolCatalog([]);
    }
  }

  async function refreshToolPacks() {
    if (!state.token) {
      renderToolPacks([]);
      return;
    }
    try {
      renderToolPacks(await api('/tool-packs'));
    } catch {
      renderToolPacks([]);
    }
  }

  async function refreshScannerTemplatePolicies() {
    if (!state.token) {
      renderScannerTemplatePolicies([]);
      return;
    }
    try {
      renderScannerTemplatePolicies(await api('/scanner-template-policies'));
    } catch {
      renderScannerTemplatePolicies([]);
    }
  }

  async function refreshToolboxPolicy() {
    if (!state.token) {
      renderToolboxPolicy(null);
      return;
    }
    try {
      renderToolboxPolicy(await api('/toolbox-policy'));
    } catch {
      renderToolboxPolicy(null);
    }
  }

  async function refreshToolboxDoctor() {
    if (!state.token) {
      renderToolboxDoctor(null);
      return;
    }
    try {
      renderToolboxDoctor(await api('/toolbox-doctor'));
    } catch {
      renderToolboxDoctor(null);
    }
  }

  async function refreshToolboxBundles() {
    if (!state.token) {
      renderToolboxBundles([]);
      return;
    }
    try {
      if (state.activeRunId) {
        renderToolboxBundles(await api('/runs/' + encodeURIComponent(state.activeRunId) + '/toolbox-bundles'));
      } else {
        renderToolboxBundles(await api('/toolbox-bundles'));
      }
    } catch {
      renderToolboxBundles([]);
    }
  }

  async function refreshConnectors() {
    if (!state.token) {
      renderConnectors([]);
      return;
    }
    try {
      if (state.activeRunId) {
        renderConnectors(await api('/runs/' + encodeURIComponent(state.activeRunId) + '/connectors'));
      } else {
        renderConnectors(await api('/connectors'));
      }
    } catch {
      renderConnectors([]);
    }
  }

  async function refreshEcosystemCoverage() {
    if (!state.token || !state.activeRunId) {
      renderEcosystemCoverage(null);
      renderToolIntegrationBacklog(null);
      renderToolEcosystemWorkbench(null);
      return;
    }
    try {
      renderEcosystemCoverage(await api('/runs/' + encodeURIComponent(state.activeRunId) + '/ecosystem-coverage'));
      renderToolIntegrationBacklog(await api('/runs/' + encodeURIComponent(state.activeRunId) + '/tool-integration-backlog'));
      renderToolEcosystemWorkbench(await api('/runs/' + encodeURIComponent(state.activeRunId) + '/tool-ecosystem-workbench'));
    } catch {
      renderEcosystemCoverage(null);
      renderToolIntegrationBacklog(null);
      renderToolEcosystemWorkbench(null);
    }
  }

  async function refreshToolboxProfiles() {
    if (!state.token) {
      renderToolboxProfiles([]);
      return;
    }
    try {
      renderToolboxProfiles(await api('/toolbox-profiles'));
    } catch {
      renderToolboxProfiles([]);
    }
  }

  async function refreshCapabilities() {
    if (!state.token) {
      renderCapabilities([]);
      return;
    }
    try {
      renderCapabilities(await api('/capabilities'));
    } catch {
      renderCapabilities([]);
    }
  }

  async function refreshProgramScopeImports() {
    if (!state.token) {
      renderProgramScopeImports([]);
      return;
    }
    try {
      renderProgramScopeImports(await api('/program-scope-imports'));
    } catch {
      renderProgramScopeImports([]);
    }
  }

  async function refreshDomainSkills() {
    if (!state.token) {
      renderDomainSkills([]);
      return;
    }
    try {
      if (state.activeRunId) {
        renderDomainSkills(await api('/runs/' + encodeURIComponent(state.activeRunId) + '/skills'));
      } else {
        renderDomainSkills(await api('/skills'));
      }
    } catch {
      renderDomainSkills([]);
    }
  }

  async function refreshPocTemplates() {
    if (!state.token) {
      renderPocTemplates([]);
      return;
    }
    try {
      if (state.activeRunId) {
        renderPocTemplates(await api('/runs/' + encodeURIComponent(state.activeRunId) + '/poc-templates'));
      } else {
        renderPocTemplates(await api('/poc-templates'));
      }
    } catch {
      renderPocTemplates([]);
    }
  }

  async function refreshRuns() {
    const task = async () => {
      const runs = await api('/runs');
      state.runs = runs;
      if (!state.activeRunId && runs[0]) {
        state.activeRunId = runs[0].id;
        localStorage.setItem('activeRunId', state.activeRunId);
      }
      if (state.activeRunId && !runs.some((run) => run.id === state.activeRunId)) {
        state.activeRunId = runs[0] ? runs[0].id : '';
      }
      renderRunList();
      await refreshProgress();
    };
    if (state.busy) {
      await task();
      return;
    }
    await withBusy(task);
  }

  async function refreshProgress() {
    if (!state.activeRunId) {
      renderEmptyRun();
      return;
    }
    const runId = state.activeRunId;
    const results = await Promise.all([
      api('/runs/' + encodeURIComponent(runId) + '/progress'),
      api('/runs/' + encodeURIComponent(runId) + '/mission-control'),
      api('/runs/' + encodeURIComponent(runId) + '/workbench'),
      api('/runs/' + encodeURIComponent(runId) + '/events'),
      api('/runs/' + encodeURIComponent(runId) + '/graph'),
      api('/runs/' + encodeURIComponent(runId) + '/flow'),
      api('/runs/' + encodeURIComponent(runId) + '/strategy'),
      api('/runs/' + encodeURIComponent(runId) + '/search-plan'),
      api('/runs/' + encodeURIComponent(runId) + '/surface'),
      api('/runs/' + encodeURIComponent(runId) + '/skills'),
      api('/runs/' + encodeURIComponent(runId) + '/domain-skill-readiness'),
      api('/runs/' + encodeURIComponent(runId) + '/poc-templates'),
      api('/runs/' + encodeURIComponent(runId) + '/toolbox-bundles'),
      api('/runs/' + encodeURIComponent(runId) + '/connectors'),
      api('/runs/' + encodeURIComponent(runId) + '/ecosystem-coverage'),
      api('/runs/' + encodeURIComponent(runId) + '/tool-integration-backlog'),
      api('/runs/' + encodeURIComponent(runId) + '/tool-ecosystem-workbench'),
      api('/runs/' + encodeURIComponent(runId) + '/runtime-activation-plan'),
      api('/runs/' + encodeURIComponent(runId) + '/review'),
      api('/runs/' + encodeURIComponent(runId) + '/workers'),
      api('/runs/' + encodeURIComponent(runId) + '/execution-node'),
      api('/runs/' + encodeURIComponent(runId) + '/desktop-readiness'),
      api('/runs/' + encodeURIComponent(runId) + '/local-runner-workbench'),
      api('/runs/' + encodeURIComponent(runId) + '/observability'),
      api('/runs/' + encodeURIComponent(runId) + '/capability-radar'),
      api('/runs/' + encodeURIComponent(runId) + '/scorecard'),
      api('/runs/' + encodeURIComponent(runId) + '/evidence-quality'),
      api('/runs/' + encodeURIComponent(runId) + '/delivery-readiness'),
      api('/runs/' + encodeURIComponent(runId) + '/agent-harness'),
      api('/runs/' + encodeURIComponent(runId) + '/reference-benchmark'),
      api('/worker-leaderboard'),
      api('/runs/' + encodeURIComponent(runId) + '/worker-selection'),
      api('/runs/' + encodeURIComponent(runId) + '/worker-evaluation-plan'),
      api('/runs/' + encodeURIComponent(runId) + '/runtime-operations-workbench')
    ]);
    renderRunDetails(results[0], results[1], results[2], results[3], results[4], results[5], results[6], results[7], results[8], results[9], results[10], results[11], results[12], results[13], results[14], results[15], results[16], results[17], results[18], results[19], results[20], results[21], results[22], results[23], results[24], results[25], results[26], results[27], results[28], results[29], results[30], results[31], results[32], results[33]);
  }

  async function refreshReview() {
    if (!state.activeRunId) {
      renderReview({ approvals: [], toolInvocations: [], evidence: [], evidenceReviews: [], findings: [], reports: [], runExports: [], browserSessions: [], browserSnapshots: [], oastSessions: [], oastCallbacks: [], proxySessions: [], credentialReferences: [], accessReviews: [], androidManifestImports: [], cloudIamImports: [], identityGraphImports: [], sarifImports: [], captureImports: [], toolPackRuns: [], connectorRuns: [] });
      applyLanguage();
      return;
    }
    renderReview(await api('/runs/' + encodeURIComponent(state.activeRunId) + '/review'));
    applyLanguage();
  }

  async function dispatchTicks(ticks) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      for (let index = 0; index < ticks; index += 1) {
        const result = await api('/runs/' + encodeURIComponent(state.activeRunId) + '/dispatch', { method: 'POST' });
        if (result.status !== 'dispatched') {
          if (result.reason) {
            showMessage(t('Dispatch paused:') + ' ' + result.reason, result.status === 'failed');
          }
          break;
        }
      }
      await refreshRuns();
    });
  }

  async function autopilotTick() {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      const result = await api('/runs/' + encodeURIComponent(state.activeRunId) + '/autopilot/tick', { method: 'POST' });
      showMessage(
        autopilotResultMessage(result),
        result.status === 'stopped' || result.status === 'operator_review_required' || (result.dispatch && result.dispatch.status === 'failed')
      );
      await refreshRuns();
    });
  }

  async function advanceSearchPlan() {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      const result = await api('/runs/' + encodeURIComponent(state.activeRunId) + '/search-plan/advance', { method: 'POST' });
      showMessage(
        searchPlanAdvanceMessage(result),
        result.status === 'stopped' ||
          result.status === 'operator_review_required' ||
          result.status === 'waiting_worker' ||
          (result.dispatch && result.dispatch.status === 'failed')
      );
      await refreshRuns();
    });
  }

  function autopilotResultMessage(result) {
    const parts = [t('Autopilot tick:'), label(result.status)];
    if (result.recommendationTitle) {
      parts.push(result.recommendationTitle);
    } else if (result.reason) {
      parts.push(result.reason);
    }
    if (result.dispatch && result.dispatch.status && result.dispatch.status !== 'dispatched') {
      parts.push(label(result.dispatch.status));
    }
    return parts.join(' ');
  }

  function searchPlanAdvanceMessage(result) {
    const parts = [t('Search plan advance:'), label(result.status)];
    if (result.item && result.item.title) {
      parts.push(result.item.title);
    } else if (result.reason) {
      parts.push(result.reason);
    }
    if (result.dispatch && result.dispatch.status && result.dispatch.status !== 'dispatched') {
      parts.push(label(result.dispatch.status));
    }
    return parts.join(' ');
  }

  async function evaluateRun() {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/evaluations', { method: 'POST' });
      showMessage('Run evaluation completed.');
      await refreshRuns();
    });
  }

  async function previewWorkerEnvelope() {
    if (!state.activeRunId) return;
    const task = els.workerEnvelopeTask.value || 'auto';
    await withBusy(async () => {
      const preview = await api('/runs/' + encodeURIComponent(state.activeRunId) + '/worker-envelope/preview?task=' + encodeURIComponent(task));
      renderWorkerEnvelopePreview(preview);
      showMessage('Worker envelope preview ready.');
    });
  }

  async function generateReport() {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/reports', {
        method: 'POST',
        body: {
          runId: state.activeRunId,
          format: els.reportFormat.value,
          findingScope: els.reportFindingScope.value
        }
      });
      showMessage('Report generated.');
      await refreshRuns();
    });
  }

  async function generateRunExport() {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/exports', {
        method: 'POST',
        body: {
          findingScope: els.reportFindingScope.value,
          includeEvidenceContent: Boolean(els.exportIncludeContent.checked)
        }
      });
      showMessage('Run export generated.');
      await refreshRuns();
    });
  }

  async function startBrowserSession() {
    if (!state.activeRunId) return;
    const active = state.runs.find((run) => run.id === state.activeRunId);
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/browser-sessions', {
        method: 'POST',
        body: { startUrl: active ? active.target : undefined }
      });
      showMessage('Browser session started.');
      await refreshRuns();
    });
  }

  async function submitProgramScopeImport(event) {
    event.preventDefault();
    const form = new FormData(els.programScopeForm);
    const content = String(form.get('content') || '').trim();
    if (!content) {
      showMessage('Program JSON must be valid JSON.', true);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      showMessage('Program JSON must be valid JSON.', true);
      return;
    }
    await withBusy(async () => {
      const imported = await api('/program-scopes/import', {
        method: 'POST',
        body: {
          source: String(form.get('source') || 'program-scope.json').trim(),
          format: String(form.get('format') || 'generic_json'),
          content: parsed
        }
      });
      applyProgramScopeToRunForm(imported);
      els.programScopeForm.elements.content.value = '';
      showMessage('Program scope imported.');
      await refreshProgramScopeImports();
    });
  }

  function applyProgramScopeToRunForm(imported) {
    if (!imported || !imported.scopePolicy) return;
    const policy = imported.scopePolicy;
    if (imported.defaultTarget) {
      els.createRunForm.elements.target.value = imported.defaultTarget;
    }
    els.createRunForm.elements.allowedAssets.value = (policy.allowedAssets || []).join(', ');
    els.createRunForm.elements.deniedAssets.value = (policy.deniedAssets || []).join(', ');
    els.createRunForm.elements.allowedMethods.value = (policy.allowedMethods || ['GET', 'POST']).join(', ');
    els.createRunForm.elements.requestsPerMinute.value =
      policy.rateLimits && policy.rateLimits.requestsPerMinute ? String(policy.rateLimits.requestsPerMinute) : '120';
    els.createRunForm.elements.allowVaultReferencesOnly.checked = Boolean(
      policy.credentialRules && policy.credentialRules.allowVaultReferencesOnly
    );
    els.createRunForm.elements.destructiveAllowed.checked = Boolean(policy.destructiveAllowed);
  }

  async function submitToolboxBundle(event) {
    event.preventDefault();
    let manifest;
    try {
      manifest = JSON.parse(els.toolboxBundleJson.value);
    } catch {
      showMessage('Invalid bundle manifest JSON.', true);
      return;
    }
    await withBusy(async () => {
      await api('/toolbox-bundles', {
        method: 'POST',
        body: { ...manifest, registeredBy: manifest.registeredBy || 'operator' }
      });
      showMessage('Toolbox bundle registered.');
      await refreshToolboxBundles();
      await refreshEcosystemCoverage();
    });
  }

  async function submitConnector(event) {
    event.preventDefault();
    let manifest;
    try {
      manifest = JSON.parse(els.connectorJson.value);
    } catch {
      showMessage('Invalid connector manifest JSON.', true);
      return;
    }
    await withBusy(async () => {
      await api('/connectors', {
        method: 'POST',
        body: { ...manifest, registeredBy: manifest.registeredBy || 'operator' }
      });
      showMessage('Connector registered.');
      await refreshConnectors();
      await refreshEcosystemCoverage();
    });
  }

  async function submitBrowserNavigate(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.browserNavigateForm);
    const target = String(form.get('target') || '').trim();
    if (!target) {
      showMessage('HTTP capture target is required.', true);
      return;
    }
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/tools', {
        method: 'POST',
        body: {
          tool: 'browser.navigate',
          target,
          method: 'GET',
          riskLevel: 'R1',
          args: { timeoutMs: 10000 }
        }
      });
      els.browserNavigateForm.reset();
      showMessage('Browser navigation captured.');
      await refreshRuns();
    });
  }

  async function submitBrowserSnapshot(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.browserSnapshotForm);
    const target = String(form.get('target') || '').trim();
    const screenshotBase64 = String(form.get('screenshotBase64') || '').trim();
    const textPreview = String(form.get('textPreview') || '').trim();
    const title = String(form.get('title') || '').trim();
    if (!target) {
      showMessage('Snapshot target is required.', true);
      return;
    }
    if (!screenshotBase64 && !textPreview) {
      showMessage('Snapshot needs screenshot or text preview.', true);
      return;
    }
    await withBusy(async () => {
      const body = {
        source: String(form.get('source') || 'manual'),
        target
      };
      if (title) body.title = title;
      if (screenshotBase64) body.screenshotBase64 = screenshotBase64;
      if (textPreview) body.textPreview = textPreview;
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/captures/browser-snapshot', {
        method: 'POST',
        body
      });
      els.browserSnapshotForm.reset();
      els.browserSnapshotForm.elements.source.value = 'browser';
      showMessage('Browser snapshot captured.');
      await refreshRuns();
    });
  }

  async function startProxySession() {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/proxy-sessions', { method: 'POST' });
      showMessage('Proxy session started.');
      await refreshRuns();
    });
  }

  async function closeProxySession(sessionId) {
    await withBusy(async () => {
      await api('/proxy-sessions/' + encodeURIComponent(sessionId) + '/close', { method: 'POST' });
      showMessage('Proxy session closed.');
      await refreshRuns();
    });
  }

  async function submitCredentialReference(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.credentialReferenceForm);
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/credentials', {
        method: 'POST',
        body: {
          label: String(form.get('label') || '').trim(),
          role: String(form.get('role') || '').trim(),
          kind: String(form.get('kind') || 'vault_reference'),
          placeholder: String(form.get('placeholder') || '').trim(),
          allowedUse: splitLines(String(form.get('allowedUse') || ''))
        }
      });
      els.credentialReferenceForm.reset();
      els.credentialReferenceForm.elements.kind.value = 'vault_reference';
      els.credentialReferenceForm.elements.placeholder.value = 'vault://bugbounty/viewer-token';
      els.credentialReferenceForm.elements.allowedUse.value = 'browser.navigate\\nhttp.request\\nrole-diff';
      showMessage('Credential reference added.');
      await refreshRuns();
    });
  }

  async function useCredentialReference(credentialId) {
    if (!state.activeRunId) return;
    const active = state.runs.find((run) => run.id === state.activeRunId);
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/tools', {
        method: 'POST',
        body: {
          tool: 'credential.use_placeholder',
          target: active ? active.target : 'about:blank',
          method: 'POST',
          riskLevel: 'R0',
          args: { credentialId, usedFor: 'operator-review' }
        }
      });
      showMessage('Credential placeholder recorded.');
      await refreshRuns();
    });
  }

  async function revokeCredentialReference(credentialId) {
    await withBusy(async () => {
      await api('/credentials/' + encodeURIComponent(credentialId) + '/revoke', { method: 'POST' });
      showMessage('Credential reference revoked.');
      await refreshRuns();
    });
  }

  async function submitAccessReview(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.accessReviewForm);
    const active = state.runs.find((run) => run.id === state.activeRunId);
    const baselineEvidenceId = String(form.get('baselineEvidenceId') || '').trim();
    const comparisonEvidenceId = String(form.get('comparisonEvidenceId') || '').trim();
    if (!baselineEvidenceId || !comparisonEvidenceId) {
      showMessage('Both baseline and comparison evidence IDs are required.', true);
      return;
    }
    const body = {
      title: String(form.get('title') || 'Role access evidence comparison').trim(),
      target: String(form.get('target') || '').trim() || (active ? active.target : ''),
      method: 'GET',
      baselineEvidenceId,
      comparisonEvidenceId
    };
    const baselineCredentialId = String(form.get('baselineCredentialId') || '').trim();
    const comparisonCredentialId = String(form.get('comparisonCredentialId') || '').trim();
    if (baselineCredentialId) body.baselineCredentialId = baselineCredentialId;
    if (comparisonCredentialId) body.comparisonCredentialId = comparisonCredentialId;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/access-reviews/compare', {
        method: 'POST',
        body
      });
      els.accessReviewForm.elements.baselineEvidenceId.value = '';
      els.accessReviewForm.elements.comparisonEvidenceId.value = '';
      showMessage('Access review compared.');
      await refreshRuns();
    });
  }

  async function submitSarifImport(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.sarifImportForm);
    const content = String(form.get('content') || '').trim();
    if (!content) {
      showMessage('SARIF content must be valid JSON.', true);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      showMessage('SARIF content must be valid JSON.', true);
      return;
    }
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/sarif-imports', {
        method: 'POST',
        body: {
          source: String(form.get('source') || 'local-sarif.json').trim(),
          createFindings: form.get('createFindings') === 'on',
          content: parsed
        }
      });
      els.sarifImportForm.elements.content.value = '';
      showMessage('SARIF imported.');
      await refreshRuns();
    });
  }

  async function submitAndroidManifest(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.androidManifestForm);
    const content = String(form.get('content') || '').trim();
    if (!content) {
      showMessage('Manifest XML is required.', true);
      return;
    }
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/android-manifest-imports', {
        method: 'POST',
        body: {
          source: String(form.get('source') || 'AndroidManifest.xml').trim(),
          createFindings: form.get('createFindings') === 'on',
          content
        }
      });
      els.androidManifestForm.elements.content.value = '';
      showMessage('Android Manifest imported.');
      await refreshRuns();
    });
  }

  async function submitCloudIamImport(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.cloudIamForm);
    const content = String(form.get('content') || '').trim();
    if (!content) {
      showMessage('IAM Policy JSON must be valid JSON.', true);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      showMessage('IAM Policy JSON must be valid JSON.', true);
      return;
    }
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/cloud-iam-imports', {
        method: 'POST',
        body: {
          source: String(form.get('source') || 'iam-policy.json').trim(),
          provider: String(form.get('provider') || 'aws'),
          createFindings: form.get('createFindings') === 'on',
          content: parsed
        }
      });
      els.cloudIamForm.elements.content.value = '';
      showMessage('Cloud IAM policy imported.');
      await refreshRuns();
    });
  }

  async function submitIdentityGraphImport(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.identityGraphForm);
    const content = String(form.get('content') || '').trim();
    if (!content) {
      showMessage('Identity Graph JSON must be valid JSON.', true);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      showMessage('Identity Graph JSON must be valid JSON.', true);
      return;
    }
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/identity-graph-imports', {
        method: 'POST',
        body: {
          source: String(form.get('source') || 'identity-graph.json').trim(),
          provider: String(form.get('provider') || 'bloodhound'),
          createFindings: form.get('createFindings') === 'on',
          content: parsed
        }
      });
      els.identityGraphForm.elements.content.value = '';
      showMessage('Identity graph imported.');
      await refreshRuns();
    });
  }

  async function submitHttpCapture(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.httpCaptureForm);
    const target = String(form.get('target') || '').trim();
    const method = String(form.get('method') || 'GET').trim().toUpperCase();
    const statusText = String(form.get('statusText') || '').trim();
    const statusValue = Number(String(form.get('status') || '').trim());
    const requestBodyPreview = String(form.get('requestBodyPreview') || '').trim();
    const responseBodyPreview = String(form.get('responseBodyPreview') || '').trim();
    if (!target) {
      showMessage('HTTP capture target is required.', true);
      return;
    }
    await withBusy(async () => {
      const response = {
        headers: parseHeaderLines(String(form.get('responseHeaders') || ''))
      };
      if (Number.isInteger(statusValue)) response.status = statusValue;
      if (statusText) response.statusText = statusText;
      if (responseBodyPreview) response.bodyPreview = responseBodyPreview;
      const request = {
        method,
        target,
        headers: parseHeaderLines(String(form.get('requestHeaders') || ''))
      };
      if (requestBodyPreview) request.bodyPreview = requestBodyPreview;
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/captures/http-exchange', {
        method: 'POST',
        body: {
          source: String(form.get('source') || 'manual'),
          request,
          response
        }
      });
      els.httpCaptureForm.reset();
      els.httpCaptureForm.elements.status.value = '200';
      els.httpCaptureForm.elements.statusText.value = 'OK';
      showMessage('HTTP exchange captured.');
      await refreshRuns();
    });
  }

  async function submitHarImport(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.harImportForm);
    const content = String(form.get('content') || '').trim();
    if (!content) {
      showMessage('HAR content must be valid JSON.', true);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      showMessage('HAR content must be valid JSON.', true);
      return;
    }
    await withBusy(async () => {
      const result = await api('/runs/' + encodeURIComponent(state.activeRunId) + '/captures/har', {
        method: 'POST',
        body: {
          source: String(form.get('source') || 'browser.har').trim(),
          maxEntries: Number(String(form.get('maxEntries') || '100')),
          content: parsed
        }
      });
      els.harImportForm.elements.content.value = '';
      showMessage(
        t('HAR imported:') +
          ' ' +
          result.imported +
          '/' +
          result.processedEntries +
          ' evidence, skipped ' +
          result.skipped +
          ', truncated ' +
          result.truncatedEntries
      );
      await refreshRuns();
    });
  }

  async function previewToolPack() {
    if (!state.activeRunId) return;
    const request = toolPackRequestFromForm();
    if (!request.packId) {
      showMessage('Pack is required.', true);
      return;
    }
    await withBusy(async () => {
      const preview = await api(
        '/runs/' + encodeURIComponent(state.activeRunId) + '/tool-packs/' + encodeURIComponent(request.packId) + '/plan',
        {
          method: 'POST',
          body: { target: request.target }
        }
      );
      renderToolPackPlanPreview(preview);
      showMessage('Tool pack preview ready.');
    });
  }

  async function invokeToolPack(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const request = toolPackRequestFromForm();
    if (!request.packId) {
      showMessage('Pack is required.', true);
      return;
    }
    await withBusy(async () => {
      await api(
        '/runs/' + encodeURIComponent(state.activeRunId) + '/tool-packs/' + encodeURIComponent(request.packId) + '/invoke',
        {
          method: 'POST',
          body: { target: request.target }
        }
      );
      els.toolPackForm.elements.target.value = '';
      renderToolPackPlanPreview(null);
      showMessage('Tool pack completed.');
      await refreshRuns();
    });
  }

  function toolPackRequestFromForm() {
    const form = new FormData(els.toolPackForm);
    return {
      packId: String(form.get('pack') || '').trim(),
      target: String(form.get('target') || '').trim()
    };
  }

  async function submitScannerTemplate(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const request = scannerTemplateRequestFromForm();
    const template = request ? request.args.template : '';
    if (!template) {
      showMessage('Scanner template is required.', true);
      return;
    }
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/tools', {
        method: 'POST',
        body: request
      });
      els.scannerTemplateForm.elements.target.value = '';
      renderToolPlanPreview(null);
      showMessage('Scanner template completed.');
      await refreshRuns();
    });
  }

  async function previewScannerTemplate() {
    if (!state.activeRunId) return;
    const request = scannerTemplateRequestFromForm();
    if (!request || !request.args.template) {
      showMessage('Scanner template is required.', true);
      return;
    }
    await withBusy(async () => {
      const preview = await api('/runs/' + encodeURIComponent(state.activeRunId) + '/tools/plan', {
        method: 'POST',
        body: request
      });
      renderToolPlanPreview(preview);
      showMessage('Plan preview ready.');
    });
  }

  function scannerTemplateRequestFromForm() {
    const form = new FormData(els.scannerTemplateForm);
    const template = String(form.get('template') || '').trim();
    const active = state.runs.find((run) => run.id === state.activeRunId);
    const target = String(form.get('target') || '').trim() || (active ? active.target : '');
    return {
      tool: 'scanner.run_template',
      target,
      method: 'GET',
      riskLevel: String(form.get('riskLevel') || selectedScannerTemplateRisk() || 'R2'),
      args: { template }
    };
  }

  async function submitFinding(event) {
    event.preventDefault();
    if (!state.activeRunId) return;
    const form = new FormData(els.findingForm);
    const evidenceIds = splitAssets(String(form.get('evidenceIds') || ''));
    if (evidenceIds.length === 0) {
      showMessage('At least one evidence ID is required.', true);
      return;
    }
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/findings', {
        method: 'POST',
        body: {
          title: String(form.get('title') || '').trim(),
          severity: String(form.get('severity') || 'medium'),
          confidence: String(form.get('confidence') || 'likely'),
          affectedAssets: splitAssets(String(form.get('affectedAssets') || '')),
          evidenceIds,
          reproSteps: splitLines(String(form.get('reproSteps') || '')),
          impact: String(form.get('impact') || '').trim(),
          remediation: String(form.get('remediation') || '').trim()
        }
      });
      els.findingForm.reset();
      showMessage('Finding submitted.');
      await refreshRuns();
    });
  }

  async function api(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    if (state.token) headers.authorization = 'Bearer ' + state.token;
    let body = options.body;
    if (body && typeof body !== 'string') {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await fetch(path, Object.assign({}, options, { headers, body }));
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const reason = payload && payload.error ? payload.error : 'Request failed with ' + response.status;
      throw new Error(reason);
    }
    return payload;
  }

  async function withBusy(task) {
    if (state.busy) return;
    state.busy = true;
    setButtonsDisabled(true);
    try {
      await task();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      setButtonsDisabled(false);
    }
  }

  function renderRunList() {
    renderRunHistorySummary();
    if (state.runs.length === 0) {
      els.runList.className = 'run-list empty';
      els.runList.textContent = 'No runs yet.';
      return;
    }
    const query = state.runSearch;
    const matchingRuns = query
      ? state.runs.filter((run) => runSearchText(run).includes(query))
      : state.runs;
    if (matchingRuns.length === 0) {
      els.runList.className = 'run-list empty';
      els.runList.textContent = 'No matching runs.';
      return;
    }
    const visibleRuns = matchingRuns.slice(0, 10);
    els.runList.className = 'run-list';
    const nodes = visibleRuns.map((run) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'run-item' + (run.id === state.activeRunId ? ' is-active' : '');
      button.addEventListener('click', () => {
        state.activeRunId = run.id;
        state.strategyPlanPreview = null;
        state.surfaceFrontierPlanPreview = null;
        state.workerEnvelopePreview = null;
        state.connectorPlanPreview = null;
        state.toolPackPlanPreview = null;
        state.toolPlanPreview = null;
        localStorage.setItem('activeRunId', run.id);
        renderRunList();
        renderStrategyPlanPreview(null);
        renderSurfaceFrontierPlanPreview(null);
        renderWorkerEnvelopePreview(null);
        renderConnectorPlanPreview(null);
        renderToolPackPlanPreview(null);
        renderToolPlanPreview(null);
        refreshProgress().catch((error) => showMessage(error.message, true));
      });
      const title = document.createElement('strong');
      title.textContent = run.target;
      const meta = document.createElement('span');
      meta.className = 'run-meta';
      meta.textContent = run.progress.phase + ' - ' + run.status + ' - ' + run.id;
      button.append(title, meta);
      return button;
    });
    if (matchingRuns.length > visibleRuns.length) {
      const more = document.createElement('p');
      more.className = 'muted run-list-more';
      more.textContent = (matchingRuns.length - visibleRuns.length) + ' more runs hidden. Use search to narrow history.';
      nodes.push(more);
    }
    els.runList.replaceChildren(...nodes);
  }

  function runSearchText(run) {
    return [
      run.id,
      run.target,
      run.goal,
      run.status,
      run.progress && run.progress.phase
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function renderRunHistorySummary() {
    const active = state.runs.find((run) => run.id === state.activeRunId);
    const countLabel = state.runs.length === 1 ? '1 run' : state.runs.length + ' runs';
    els.runHistorySummary.textContent = active ? countLabel + ' - active: ' + active.target : countLabel;
  }

  function setRunHistoryCollapsed(collapsed, options = {}) {
    state.runHistoryCollapsed = collapsed;
    els.runHistoryPanel.classList.toggle('is-collapsed', collapsed);
    els.toggleRunHistory.setAttribute('aria-expanded', String(!collapsed));
    els.toggleRunHistory.textContent = t(collapsed ? 'Show History' : 'Hide History');
    if (options.persist !== false) {
      localStorage.setItem('runHistoryCollapsed', collapsed ? '1' : '0');
    }
  }

  function renderRunDetails(progress, missionControl, workbench, events, graph, flow, strategy, searchPlan, surface, domainSkills, domainSkillReadiness, pocTemplates, toolboxBundles, connectors, ecosystemCoverage, toolIntegrationBacklog, toolEcosystemWorkbench, runtimeActivationPlan, review, workers, executionNode, desktopReadiness, localRunnerWorkbench, observability, capabilityRadar, scorecard, evidenceQuality, deliveryReadiness, agentHarness, referenceBenchmark, workerLeaderboard, workerSelection, workerEvaluationPlan, runtimeOperationsWorkbench) {
    els.runTitle.textContent = graph.run.target;
    els.runGoal.textContent = graph.run.goal;
    els.metricPhase.textContent = progress.phase;
    els.metricFacts.textContent = String(progress.counts.facts);
    els.metricIntents.textContent = String(progress.counts.intents.total);
    els.metricEvidence.textContent = String(progress.counts.evidence);
    els.metricFindings.textContent = String(progress.counts.findings);
    els.metricApprovals.textContent = String(progress.counts.approvals.pending);
    els.graphStatus.textContent = graph.run.status;
    els.dispatchOnce.disabled = graph.run.status !== 'active' || state.busy;
    els.dispatchAuto.disabled = graph.run.status !== 'active' || state.busy;
    els.simpleContinue.disabled = graph.run.status !== 'active' || state.busy;
    els.simpleAuto.disabled = graph.run.status !== 'active' || state.busy;
    els.autopilotTick.disabled = graph.run.status !== 'active' || state.busy;
    els.previewToolPack.disabled =
      graph.run.status !== 'active' || state.busy || state.toolPacks.length === 0 || !els.toolPackSelect.value;
    els.invokeToolPack.disabled =
      graph.run.status !== 'active' || state.busy || state.toolPacks.length === 0 || !els.toolPackSelect.value;
    els.scannerTemplateForm.querySelector('button[type="submit"]').disabled =
      graph.run.status !== 'active' || state.busy || els.scannerTemplateSelect.options.length === 0 || !els.scannerTemplateSelect.value;
    els.previewScannerTemplate.disabled =
      graph.run.status !== 'active' || state.busy || els.scannerTemplateSelect.options.length === 0 || !els.scannerTemplateSelect.value;
    renderFacts(graph.facts);
    renderIntents(graph.intents);
    renderObservability(observability || review.observability);
    renderCapabilityRadar(capabilityRadar);
    renderScorecard(scorecard);
    renderWorkerLeaderboard(workerLeaderboard);
    renderEvidenceQuality(evidenceQuality);
    renderDeliveryReadiness(deliveryReadiness);
    renderSimpleConsole(progress, missionControl, graph, review);
    renderMissionControl(missionControl);
    renderRuntimeOperationsWorkbench(runtimeOperationsWorkbench);
    renderWorkbench(workbench);
    renderSearchPlan(searchPlan);
    renderWorkers(workers || []);
    renderWorkerSelection(workerSelection);
    renderWorkerEvaluationPlan(workerEvaluationPlan);
    renderExecutionNode(executionNode);
    renderDesktopReadiness(desktopReadiness);
    renderLocalRunnerWorkbench(localRunnerWorkbench);
    renderAgentHarness(agentHarness);
    renderReferenceBenchmark(referenceBenchmark);
    els.previewWorkerEnvelope.disabled = graph.run.status !== 'active' || state.busy;
    renderFlow(flow);
    renderAttackSurface(surface);
    renderDomainSkills(domainSkills || []);
    renderDomainSkillReadiness(domainSkillReadiness);
    renderPocTemplates(pocTemplates || []);
    renderToolboxBundles(toolboxBundles || []);
    renderConnectors(connectors || []);
    renderEcosystemCoverage(ecosystemCoverage);
    renderToolIntegrationBacklog(toolIntegrationBacklog);
    renderToolEcosystemWorkbench(toolEcosystemWorkbench);
    renderRuntimeActivationPlan(runtimeActivationPlan);
    renderStrategy(strategy);
    renderEvents(events);
    renderReview(review);
    applyLanguage();
  }

  function renderObservability(observability) {
    const summary = observability || { counts: { spans: 0 }, duration: { totalMs: 0 }, cost: { totalEstimatedUsd: 0 }, latestEvaluation: null };
    const spans = summary.counts ? summary.counts.spans || 0 : 0;
    els.telemetryCount.textContent = spans + ' spans';
    els.metricSpans.textContent = String(spans);
    els.metricRuntime.textContent = formatDuration(summary.duration ? summary.duration.totalMs || 0 : 0);
    els.metricCost.textContent = '$' + Number(summary.cost ? summary.cost.totalEstimatedUsd || 0 : 0).toFixed(4);
    const evaluation = summary.latestEvaluation;
    els.metricEval.textContent = evaluation ? evaluation.score + ' / ' + evaluation.grade : '-';
    els.evaluateRun.disabled = state.busy || !state.activeRunId;
    if (!evaluation) {
      els.evalCheckList.replaceChildren(emptyItem('No evaluation yet.'));
      return;
    }
    els.evalCheckList.replaceChildren(...evaluation.checks.map((check) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = check.title + ' - ' + check.status;
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = check.detail;
      item.append(title, detail);
      return item;
    }));
  }

  function renderCapabilityRadar(radar) {
    state.capabilityRadar = radar;
    if (!radar) {
      els.capabilityRadarStatus.textContent = 'thin';
      els.capabilityRadarOverall.textContent = '0';
      els.capabilityRadarEvidence.textContent = '0';
      els.capabilityRadarTools.textContent = '0';
      els.capabilityRadarWorkers.textContent = '0';
      els.capabilityRadarList.replaceChildren(emptyItem('No capability radar yet.'));
      els.capabilityRadarHintList.replaceChildren(emptyItem('No capability scheduling hints.'));
      return;
    }
    els.capabilityRadarStatus.textContent = label(radar.posture);
    els.capabilityRadarOverall.textContent = String(radar.overallScore);
    els.capabilityRadarEvidence.textContent = String(radarDimensionScore(radar, 'evidence_depth'));
    els.capabilityRadarTools.textContent = String(radarDimensionScore(radar, 'tool_ecosystem'));
    els.capabilityRadarWorkers.textContent = String(radarDimensionScore(radar, 'worker_performance'));
    const dimensions = radar.dimensions || [];
    if (dimensions.length === 0) {
      els.capabilityRadarList.replaceChildren(emptyItem('No capability radar yet.'));
    } else {
      els.capabilityRadarList.replaceChildren(...dimensions.map((dimension) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = t(dimension.title) + ' - ' + dimension.score + ' - ' + label(dimension.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = dimension.detail;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = (dimension.signals || []).join(' - ');
        item.append(title, detail, meta);
        if (dimension.gaps && dimension.gaps.length > 0) {
          const gap = document.createElement('p');
          gap.className = 'muted';
          gap.textContent = dimension.gaps.slice(0, 2).join(' | ');
          item.append(gap);
        }
        return item;
      }));
    }
    els.capabilityRadarHintList.replaceChildren(...listItems(radar.schedulingHints || [], 'No capability scheduling hints.'));
  }

  function radarDimensionScore(radar, id) {
    const dimension = (radar.dimensions || []).find((item) => item.id === id);
    return dimension ? dimension.score : 0;
  }

  function renderScorecard(scorecard) {
    if (!scorecard) {
      els.workerScorecardList.replaceChildren(emptyItem('No worker scorecard yet.'));
      els.toolScorecardList.replaceChildren(emptyItem('No tool scorecard yet.'));
      els.workerComparisonList.replaceChildren(emptyItem('No worker comparison yet.'));
      els.scorecardRecommendationList.replaceChildren(emptyItem('No scorecard recommendations.'));
      return;
    }
    if (!scorecard.workerCards || scorecard.workerCards.length === 0) {
      els.workerScorecardList.replaceChildren(emptyItem('No worker scorecard yet.'));
    } else {
      els.workerScorecardList.replaceChildren(...scorecard.workerCards.slice(0, 6).map((worker) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = worker.worker + ' - ' + worker.tasks + ' tasks';
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = 'ok=' + worker.ok + ' errors=' + worker.errors + ' timeouts=' + worker.timeouts + ' avg=' + formatDuration(worker.avgRuntimeMs);
        item.append(title, detail);
        return item;
      }));
    }
    if (!scorecard.toolCards || scorecard.toolCards.length === 0) {
      els.toolScorecardList.replaceChildren(emptyItem('No tool scorecard yet.'));
    } else {
      els.toolScorecardList.replaceChildren(...scorecard.toolCards.slice(0, 6).map((tool) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = tool.tool + ' - ' + tool.calls + ' calls';
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = 'allowed=' + tool.allowed + ' blocked=' + tool.blocked + ' evidence=' + tool.evidenceProduced + ' avg=' + formatDuration(tool.avgRuntimeMs);
        item.append(title, detail);
        return item;
      }));
    }
    if (!scorecard.workerComparisons || scorecard.workerComparisons.length === 0) {
      els.workerComparisonList.replaceChildren(emptyItem('No worker comparison yet.'));
    } else {
      els.workerComparisonList.replaceChildren(...scorecard.workerComparisons.map((worker) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = worker.worker + ' - ' + worker.type + ' - success ' + worker.successRate + '%';
        const metrics = document.createElement('div');
        metrics.className = 'run-meta';
        metrics.textContent =
          'tasks=' + worker.tasks +
          ' evidence=' + worker.evidenceContributed +
          ' findings=' + worker.findingsInfluenced +
          ' avg=' + formatDuration(worker.avgRuntimeMs) +
          ' timeout=' + worker.timeoutRate + '%';
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = worker.recommendation;
        item.append(title, metrics, detail);
        return item;
      }));
    }
    els.scorecardRecommendationList.replaceChildren(...listItems(scorecard.recommendations || [], 'No scorecard recommendations.'));
  }

  function renderWorkerLeaderboard(leaderboard) {
    state.workerLeaderboard = leaderboard;
    if (!leaderboard) {
      els.workerLeaderboardCount.textContent = '0 workers';
      els.leaderboardWorkerTasks.textContent = '0';
      els.leaderboardExercisedWorkers.textContent = '0/0';
      els.leaderboardEvidence.textContent = '0';
      els.leaderboardFindings.textContent = '0';
      els.workerLeaderboardList.replaceChildren(emptyItem('No worker leaderboard yet.'));
      els.workerLeaderboardTypeList.replaceChildren(emptyItem('No worker type leaderboard yet.'));
      els.workerLeaderboardActionList.replaceChildren(emptyItem('No worker leaderboard recommendations.'));
      return;
    }
    const counts = leaderboard.counts || {};
    const workers = leaderboard.workers || [];
    els.workerLeaderboardCount.textContent = workers.length + ' workers';
    els.leaderboardWorkerTasks.textContent = String(counts.workerTasks || 0);
    els.leaderboardExercisedWorkers.textContent = (counts.exercisedWorkers || 0) + '/' + (counts.configuredWorkers || 0);
    els.leaderboardEvidence.textContent = String(counts.evidenceContributed || 0);
    els.leaderboardFindings.textContent = String(counts.findingsInfluenced || 0);
    if (workers.length === 0) {
      els.workerLeaderboardList.replaceChildren(emptyItem('No worker leaderboard yet.'));
    } else {
      els.workerLeaderboardList.replaceChildren(...workers.slice(0, 8).map((worker) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = worker.worker + ' - ' + label(worker.type) + ' - score ' + worker.score;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent =
          'tasks=' + worker.tasks +
          ' success=' + worker.successRate + '%' +
          ' timeout=' + worker.timeoutRate + '%' +
          ' evidence=' + worker.evidenceContributed +
          ' findings=' + worker.findingsInfluenced +
          ' cost=$' + Number(worker.estimatedUsd || 0).toFixed(4);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = label(worker.recommendation) + ' - ' + worker.rationale;
        item.append(title, meta, detail);
        return item;
      }));
    }
    const types = leaderboard.types || [];
    if (types.length === 0) {
      els.workerLeaderboardTypeList.replaceChildren(emptyItem('No worker type leaderboard yet.'));
    } else {
      els.workerLeaderboardTypeList.replaceChildren(...types.map((type) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = label(type.type) + ' - score ' + type.score;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent =
          'workers=' + type.workers +
          ' tasks=' + type.tasks +
          ' success=' + type.successRate + '%' +
          ' evidence=' + type.evidenceContributed +
          ' findings=' + type.findingsInfluenced;
        item.append(title, meta);
        return item;
      }));
    }
    els.workerLeaderboardActionList.replaceChildren(...listItems(leaderboard.recommendations || [], 'No worker leaderboard recommendations.'));
  }

  function renderEvidenceQuality(report) {
    state.evidenceQuality = report;
    if (!report) {
      els.evidenceQualityStatus.textContent = 'Not loaded';
      els.evidenceQualitySummary.textContent = 'Create or select a run to inspect evidence quality.';
      els.evidenceQualityScore.textContent = '0';
      els.evidenceQualityUseful.textContent = '0/0';
      els.evidenceQualityReplayable.textContent = '0';
      els.evidenceQualityRedaction.textContent = '0/0';
      els.evidenceQualityFindings.textContent = '0/0';
      els.evidenceQualityMissing.textContent = '0';
      els.evidenceQualityDimensionList.replaceChildren(emptyItem('No evidence quality dimensions.'));
      els.evidenceQualityFindingList.replaceChildren(emptyItem('No finding evidence gates.'));
      els.evidenceQualityActionList.replaceChildren(emptyItem('No evidence quality actions.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.evidenceQualityStatus.textContent = label(report.posture || 'blocked');
    els.evidenceQualitySummary.textContent = report.summary || '';
    els.evidenceQualityScore.textContent = String(report.score || 0);
    els.evidenceQualityUseful.textContent = (counts.usefulEvidence || 0) + '/' + (counts.evidence || 0);
    els.evidenceQualityReplayable.textContent = String(counts.replayableEvidence || 0);
    els.evidenceQualityRedaction.textContent = (counts.redactionReadyEvidence || 0) + '/' + (counts.evidence || 0);
    els.evidenceQualityFindings.textContent = (counts.confirmedDeliveryReadyFindings || 0) + '/' + (counts.confirmedFindings || 0);
    els.evidenceQualityMissing.textContent = String(counts.missingBlobs || 0);

    const dimensions = report.dimensions || [];
    if (dimensions.length === 0) {
      els.evidenceQualityDimensionList.replaceChildren(emptyItem('No evidence quality dimensions.'));
    } else {
      els.evidenceQualityDimensionList.replaceChildren(...dimensions.map((dimension) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = t(dimension.title) + ' - ' + dimension.score + ' - ' + label(dimension.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = dimension.detail || '';
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = (dimension.signals || []).join(' - ');
        item.append(title, detail, meta);
        return item;
      }));
    }

    const gates = report.findingGates || [];
    if (gates.length === 0) {
      els.evidenceQualityFindingList.replaceChildren(emptyItem('No finding evidence gates.'));
    } else {
      els.evidenceQualityFindingList.replaceChildren(...gates.slice(0, 6).map((gate) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = gate.title + ' - ' + label(gate.validationState) + ' - ' + label(gate.posture);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent =
          'score=' + gate.score +
          ' useful=' + gate.usefulEvidence + '/' + gate.evidenceIds.length +
          ' reproduction=' + gate.reproductionEvidence +
          ' redaction=' + gate.redactionReadyEvidence + '/' + gate.evidenceIds.length;
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = gate.deliveryReady ? 'Ready for confirmed-only report delivery.' : ((gate.gaps || [])[0] || 'Evidence gate incomplete.');
        item.append(title, meta, detail);
        return item;
      }));
    }
    els.evidenceQualityActionList.replaceChildren(...listItems(report.nextActions || [], 'No evidence quality actions.'));
    applyLanguage();
  }

  function renderDeliveryReadiness(readiness) {
    if (!readiness) {
      els.deliveryReadinessStatus.textContent = 'needs_review';
      els.deliveryReadinessList.replaceChildren(emptyItem('No delivery readiness yet.'));
      els.deliveryNextList.replaceChildren(emptyItem('No delivery next actions.'));
      return;
    }
    els.deliveryReadinessStatus.textContent = label(readiness.status);
    els.deliveryReadinessList.replaceChildren(...(readiness.gates || []).map((gate) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = t(gate.title) + ' - ' + label(gate.status);
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = gate.detail;
      item.append(title, detail);
      return item;
    }));
    els.deliveryNextList.replaceChildren(...listItems(readiness.nextActions || [], 'No delivery next actions.'));
  }

  function renderSimpleConsole(progress, missionControl, graph, review) {
    if (!progress || !graph || !graph.run) {
      els.simpleStatus.textContent = 'No run';
      els.simpleSummary.textContent = 'Create or select a run, then press Continue. The platform will keep scope, evidence, and report gates visible.';
      els.simpleCurrentStep.textContent = '-';
      els.simpleNextAction.textContent = '-';
      els.simpleEvidence.textContent = '0';
      els.simpleFindings.textContent = '0';
      els.simpleContinue.disabled = true;
      els.simpleAuto.disabled = true;
      els.simpleReport.disabled = true;
      els.simpleStepList.replaceChildren(emptyItem('No run selected.'));
      els.simpleThoughtList.replaceChildren(emptyItem('AI reasoning will appear after a run starts.'));
      els.simpleActionList.replaceChildren(emptyItem('No operator action needed.'));
      applyLanguage();
      return;
    }

    const counts = progress.counts || {};
    const reviewData = review || {};
    const findings = reviewData.findings || [];
    const reports = reviewData.reports || [];
    const approvals = reviewData.approvals || [];
    const evidence = reviewData.evidence || [];
    const evidenceReviews = reviewData.evidenceReviews || [];
    const reviewedIds = new Set(evidenceReviews.map((item) => item.evidenceId));
    const unreviewedEvidence = evidence.filter((item) => item.kind !== 'replay_bundle' && !reviewedIds.has(item.id)).length;
    const confirmedFindings = findings.filter((item) => item.validationState === 'confirmed').length;
    const active = graph.run.status === 'active';
    const waitingForHuman = (counts.approvals && counts.approvals.pending > 0) || progress.phase === 'awaiting_approval';
    const nextAction = simpleNextAction(progress, missionControl, {
      unreviewedEvidence,
      findings: findings.length,
      confirmedFindings,
      reports: reports.length
    });

    els.simpleStatus.textContent = waitingForHuman ? 'Needs you' : label(progress.phase || graph.run.status);
    els.simpleSummary.textContent = simpleSummaryText(progress, nextAction, {
      unreviewedEvidence,
      pendingApprovals: counts.approvals ? counts.approvals.pending || 0 : 0,
      findings: findings.length,
      confirmedFindings
    });
    els.simpleCurrentStep.textContent = label(progress.phase || graph.run.status);
    els.simpleNextAction.textContent = nextAction;
    els.simpleEvidence.textContent = String(counts.evidence || 0);
    els.simpleFindings.textContent = confirmedFindings + '/' + findings.length;
    els.simpleContinue.textContent = waitingForHuman ? 'Review Required' : (progress.phase === 'completed' ? 'Completed' : 'Continue');
    els.simpleAuto.textContent = 'Auto Progress';
    els.simpleReport.textContent = 'Generate Report';
    els.simpleContinue.disabled = state.busy || !active || waitingForHuman || progress.phase === 'completed';
    els.simpleAuto.disabled = state.busy || !active || waitingForHuman || progress.phase === 'completed';
    els.simpleReport.disabled = state.busy || !active || findings.length === 0;

    els.simpleStepList.replaceChildren(
      simpleStepItem('1. Authorized target', graph.run.target, 'done'),
      simpleStepItem('2. Understand surface', (counts.facts || 0) + ' facts', counts.facts > 0 ? 'done' : 'active'),
      simpleStepItem('3. Collect evidence', (counts.evidence || 0) + ' evidence', counts.evidence > 0 ? 'done' : 'active'),
      simpleStepItem('4. Confirm finding', findings.length + ' candidates', confirmedFindings > 0 ? 'done' : findings.length > 0 ? 'active' : 'queued'),
      simpleStepItem('5. Deliver report', reports.length + ' reports', reports.length > 0 ? 'done' : confirmedFindings > 0 ? 'active' : 'queued')
    );

    const reasoning = missionControl && missionControl.currentReasoning ? missionControl.currentReasoning : {};
    const thoughts = [
      reasoning.selectedNextAction ? t('Next') + ': ' + reasoning.selectedNextAction : '',
      ...(reasoning.whyNow || []).slice(0, 3)
    ].filter(Boolean);
    els.simpleThoughtList.replaceChildren(...listItems(thoughts, 'AI reasoning will appear after a run starts.'));

    const actions = simpleOperatorActions(progress, missionControl, {
      approvals,
      unreviewedEvidence,
      findings: findings.length,
      confirmedFindings,
      reports: reports.length
    });
    els.simpleActionList.replaceChildren(...listItems(actions, 'No operator action needed.'));
    applyLanguage();
  }

  function simpleNextAction(progress, missionControl, facts) {
    if (progress.phase === 'completed') return 'Review report';
    if (progress.phase === 'awaiting_approval' || (progress.counts.approvals && progress.counts.approvals.pending > 0)) return 'Approve or reject gated action';
    if (facts.unreviewedEvidence > 0) return 'Review evidence';
    if (facts.findings > 0 && facts.confirmedFindings === 0) return 'Confirm or reject finding';
    if (facts.confirmedFindings > 0 && facts.reports === 0) return 'Generate report';
    const action = missionControl && missionControl.operatorNextActions && missionControl.operatorNextActions[0];
    return action && action.label ? action.label : 'Continue safe exploration';
  }

  function simpleSummaryText(progress, nextAction, facts) {
    if (state.language === 'zh-CN') {
      if (progress.phase === 'completed') return '本次运行已经结束。现在重点是复核报告和证据链。';
      if (facts.pendingApprovals > 0) return '当前卡在人工审批。先处理审批，平台才会继续高风险验证。';
      if (facts.unreviewedEvidence > 0) return '已经有新证据进入证据箱。先复核证据，确认它是否能支撑发现。';
      if (facts.findings > 0 && facts.confirmedFindings === 0) return '已经形成候选发现。请确认真实影响，或驳回误报。';
      if (facts.confirmedFindings > 0) return '已经有确认发现。下一步可以生成报告包。';
      return '点击继续，平台会在授权范围内推进一个安全步骤。下一步：' + nextAction;
    }
    if (progress.phase === 'completed') return 'This run has ended. Review the report and evidence chain.';
    if (facts.pendingApprovals > 0) return 'A human approval is blocking progress. Decide it before more validation runs.';
    if (facts.unreviewedEvidence > 0) return 'New evidence is waiting. Review it before turning it into a finding.';
    if (facts.findings > 0 && facts.confirmedFindings === 0) return 'Candidate findings exist. Confirm real impact or reject false positives.';
    if (facts.confirmedFindings > 0) return 'Confirmed findings are ready for report generation.';
    return 'Press Continue to move one safe step inside the authorized scope. Next: ' + nextAction;
  }

  function simpleOperatorActions(progress, missionControl, facts) {
    const actions = [];
    if (facts.approvals && facts.approvals.length > 0) actions.push('Review pending approval.');
    if (facts.unreviewedEvidence > 0) actions.push('Review new evidence before it becomes a finding.');
    if (facts.findings > 0 && facts.confirmedFindings === 0) actions.push('Confirm real impact or reject candidate findings.');
    if (facts.confirmedFindings > 0 && facts.reports === 0) actions.push('Generate a report bundle.');
    if (actions.length === 0 && missionControl && missionControl.operatorNextActions) {
      actions.push(...missionControl.operatorNextActions.slice(0, 3).map((item) => item.label || String(item)));
    }
    return actions;
  }

  function simpleStepItem(titleText, detailText, status) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = t(titleText) + ' - ' + label(status);
    const meta = document.createElement('div');
    meta.className = 'simple-step-meta';
    meta.textContent = detailText;
    item.append(title, meta);
    return item;
  }

  function renderMissionControl(report) {
    state.missionControl = report;
    if (!report) {
      els.missionControlStatus.textContent = 'Idle';
      els.missionControlHeadline.textContent = 'Create or select a run to inspect mission progress.';
      els.missionTopPriority.textContent = '-';
      els.missionEvidenceReview.textContent = '0/0';
      els.missionWorkers.textContent = '0';
      els.missionDelivery.textContent = '-';
      els.missionLaneList.replaceChildren(emptyItem('No mission lanes.'));
      els.missionTrailList.replaceChildren(emptyItem('No mission reasoning trail.'));
      els.missionWhyList.replaceChildren(emptyItem('No mission reasons.'));
      els.missionActionList.replaceChildren(emptyItem('No mission actions.'));
      els.missionGateList.replaceChildren(emptyItem('No mission gates.'));
      applyLanguage();
      return;
    }
    const progress = report.progress || {};
    const reasoning = report.currentReasoning || {};
    const top = reasoning.topSearchItem || null;
    els.missionControlStatus.textContent = label(report.posture || 'Idle');
    els.missionControlHeadline.textContent = report.headline || '';
    els.missionTopPriority.textContent = top ? top.title : (reasoning.selectedNextAction || '-');
    els.missionEvidenceReview.textContent = (progress.reviewedEvidence || 0) + '/' + (progress.evidence || 0);
    els.missionWorkers.textContent = String(progress.healthyWorkers || 0);
    els.missionDelivery.textContent = label(progress.deliveryStatus || '-');

    const lanes = report.lanes || [];
    if (lanes.length === 0) {
      els.missionLaneList.replaceChildren(emptyItem('No mission lanes.'));
    } else {
      els.missionLaneList.replaceChildren(...lanes.map((lane) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = t(lane.title) + ' - ' + label(lane.status);
        const summary = document.createElement('p');
        summary.className = 'muted';
        summary.textContent = lane.summary || '';
        const signals = document.createElement('div');
        signals.className = 'run-meta';
        signals.textContent = t('Signals') + ': ' + listSummary(lane.signals || []);
        item.append(title, summary, signals);
        if (lane.nextActions && lane.nextActions.length > 0) {
          const next = document.createElement('p');
          next.className = 'muted';
          next.textContent = t('Next action') + ': ' + listSummary(lane.nextActions);
          item.append(next);
        }
        return item;
      }));
    }

    const trail = report.decisionTrail || [];
    if (trail.length === 0) {
      els.missionTrailList.replaceChildren(emptyItem('No mission reasoning trail.'));
    } else {
      els.missionTrailList.replaceChildren(...trail.slice(-8).map((entry) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = entry.title + ' - ' + label(entry.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = entry.detail || '';
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = listSummary(entry.sourceRefs || []);
        item.append(title, detail, meta);
        if (entry.evidenceIds && entry.evidenceIds.length > 0) {
          const evidence = document.createElement('p');
          evidence.className = 'muted';
          evidence.textContent = t('Evidence IDs') + ': ' + listSummary(entry.evidenceIds);
          item.append(evidence);
        }
        return item;
      }));
    }

    els.missionWhyList.replaceChildren(...listItems(reasoning.whyNow || [], 'No mission reasons.'));

    const actions = report.operatorNextActions || [];
    if (actions.length === 0) {
      els.missionActionList.replaceChildren(emptyItem('No mission actions.'));
    } else {
      els.missionActionList.replaceChildren(...actions.map((action) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = action.label;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [label(action.actionKind), action.riskLevel, action.endpoint].filter(Boolean).join(' - ');
        const reason = document.createElement('p');
        reason.className = 'muted';
        reason.textContent = action.reason || '';
        item.append(title, meta, reason);
        if (action.blockedBy && action.blockedBy.length > 0) {
          const blocked = document.createElement('p');
          blocked.className = 'muted';
          blocked.textContent = t('Blockers') + ': ' + listSummary(action.blockedBy);
          item.append(blocked);
        }
        return item;
      }));
    }

    const gates = report.acceptanceGates || [];
    if (gates.length === 0) {
      els.missionGateList.replaceChildren(emptyItem('No mission gates.'));
    } else {
      els.missionGateList.replaceChildren(...gates.map((gate) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = gate.title + ' - ' + label(gate.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = gate.detail || '';
        item.append(title, detail);
        return item;
      }));
    }
    applyLanguage();
  }

  function renderRuntimeOperationsWorkbench(report) {
    state.runtimeOperationsWorkbench = report;
    if (!report) {
      els.runtimeOpsStatus.textContent = 'Not loaded';
      els.runtimeOpsSummary.textContent = 'Create or select a run to inspect runtime events, sessions, and sandbox bindings.';
      els.runtimeOpsEvents.textContent = '0';
      els.runtimeOpsSpans.textContent = '0';
      els.runtimeOpsSessions.textContent = '0';
      els.runtimeOpsWorkers.textContent = '0';
      els.runtimeOpsLaneList.replaceChildren(emptyItem('No runtime lanes.'));
      els.runtimeOpsContractList.replaceChildren(emptyItem('No runtime event contract.'));
      els.runtimeOpsEventList.replaceChildren(emptyItem('No runtime activity.'));
      els.runtimeOpsActionList.replaceChildren(emptyItem('No runtime operator actions.'));
      els.runtimeOpsSafetyList.replaceChildren(emptyItem('No runtime safety notes.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    const activeSessions =
      (counts.activeBrowserSessions || 0) +
      (counts.activeProxySessions || 0) +
      (counts.activeOastSessions || 0);
    els.runtimeOpsStatus.textContent = label(report.posture || 'partial');
    els.runtimeOpsSummary.textContent = report.summary || '';
    els.runtimeOpsEvents.textContent = String(counts.normalizedEvents || 0);
    els.runtimeOpsSpans.textContent = String(counts.traceSpans || 0);
    els.runtimeOpsSessions.textContent = String(activeSessions);
    els.runtimeOpsWorkers.textContent = String(counts.healthyWorkers || 0);

    const lanes = report.lanes || [];
    if (lanes.length === 0) {
      els.runtimeOpsLaneList.replaceChildren(emptyItem('No runtime lanes.'));
    } else {
      els.runtimeOpsLaneList.replaceChildren(...lanes.map((lane) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = lane.title + ' - ' + label(lane.status);
        const summary = document.createElement('p');
        summary.className = 'muted';
        summary.textContent = lane.summary || '';
        const signals = document.createElement('div');
        signals.className = 'run-meta';
        signals.textContent = t('Signals') + ': ' + listSummary(lane.signals || []);
        item.append(title, summary, signals);
        if (lane.gaps && lane.gaps.length > 0) {
          const gaps = document.createElement('p');
          gaps.className = 'muted';
          gaps.textContent = t('Gaps') + ': ' + listSummary(lane.gaps);
          item.append(gaps);
        }
        if (lane.nextActions && lane.nextActions.length > 0) {
          const next = document.createElement('p');
          next.className = 'muted';
          next.textContent = t('Next action') + ': ' + listSummary(lane.nextActions);
          item.append(next);
        }
        return item;
      }));
    }

    const contract = report.eventContract || [];
    if (contract.length === 0) {
      els.runtimeOpsContractList.replaceChildren(emptyItem('No runtime event contract.'));
    } else {
      els.runtimeOpsContractList.replaceChildren(...contract.map((entry) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = label(entry.kind) + ' - ' + label(entry.status);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = entry.source + ' - ' + listSummary(entry.payloadShape || []);
        const use = document.createElement('p');
        use.className = 'muted';
        use.textContent = entry.frontendUse || '';
        const boundary = document.createElement('p');
        boundary.className = 'muted';
        boundary.textContent = t('Safety boundary') + ': ' + (entry.safetyBoundary || '');
        item.append(title, meta, use, boundary);
        return item;
      }));
    }

    const events = report.normalizedEvents || [];
    if (events.length === 0) {
      els.runtimeOpsEventList.replaceChildren(emptyItem('No runtime activity.'));
    } else {
      els.runtimeOpsEventList.replaceChildren(...events.slice(-10).map((event) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = event.title + ' - ' + label(event.kind);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [label(event.level), event.source, event.entityId, event.createdAt].filter(Boolean).join(' - ');
        item.append(title, meta);
        if (event.detail) {
          const detail = document.createElement('p');
          detail.className = 'muted';
          detail.textContent = event.detail;
          item.append(detail);
        }
        return item;
      }));
    }
    els.runtimeOpsActionList.replaceChildren(...listItems(report.operatorNextActions || [], 'No runtime operator actions.'));
    els.runtimeOpsSafetyList.replaceChildren(...listItems(report.safetyNotes || [], 'No runtime safety notes.'));
    applyLanguage();
  }

  function renderWorkbench(workbench) {
    state.workbench = workbench;
    if (!workbench) {
      els.workbenchPhase.textContent = 'Idle';
      els.workbenchSummary.textContent = 'Create or select a run to inspect the Agent Workbench.';
      els.workbenchQueuedMetric.textContent = '0';
      els.workbenchActiveMetric.textContent = '0';
      els.workbenchEvidenceMetric.textContent = '0';
      els.workbenchBlockerMetric.textContent = '0';
      els.workbenchLaneList.replaceChildren(emptyItem('No workbench data.'));
      els.workbenchActionList.replaceChildren(emptyItem('No workbench actions.'));
      els.workbenchBlockerList.replaceChildren(emptyItem('No workbench blockers.'));
      els.workbenchEventList.replaceChildren(emptyItem('No workbench events.'));
      applyLanguage();
      return;
    }
    const counts = workbench.counts || {};
    const blockers = workbench.blockers || [];
    els.workbenchPhase.textContent = label(workbench.phase || 'Idle');
    els.workbenchSummary.textContent = workbench.summary || '';
    els.workbenchQueuedMetric.textContent = String((counts.openIntents || 0) + (counts.releasedIntents || 0));
    els.workbenchActiveMetric.textContent = String(counts.claimedIntents || 0);
    els.workbenchEvidenceMetric.textContent = String(counts.unreviewedEvidence || 0);
    els.workbenchBlockerMetric.textContent = String(blockers.length);
    const lanes = workbench.lanes || [];
    if (lanes.length === 0) {
      els.workbenchLaneList.replaceChildren(emptyItem('No workbench data.'));
    } else {
      els.workbenchLaneList.replaceChildren(...lanes.map(workbenchLaneItem));
    }
    els.workbenchActionList.replaceChildren(...workbenchActionItems(workbench.nextActions || []));
    els.workbenchBlockerList.replaceChildren(...listItems(blockers, 'No workbench blockers.'));
    const events = workbench.recentEvents || [];
    if (events.length === 0) {
      els.workbenchEventList.replaceChildren(emptyItem('No workbench events.'));
    } else {
      els.workbenchEventList.replaceChildren(...events.slice(-6).map((event) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = event.title;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [event.type, event.level, event.createdAt].filter(Boolean).join(' - ');
        if (event.detail) {
          const detail = document.createElement('p');
          detail.className = 'muted';
          detail.textContent = event.detail;
          item.append(title, meta, detail);
        } else {
          item.append(title, meta);
        }
        return item;
      }));
    }
    applyLanguage();
  }

  function workbenchLaneItem(lane) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = t(lane.title) + ' - ' + label(lane.status);
    const detail = document.createElement('p');
    detail.className = 'muted';
    const laneItems = lane.items || [];
    detail.textContent = laneItems.length === 0
      ? 'No workbench data.'
      : laneItems.slice(0, 4).map((entry) => label(entry.status) + ': ' + entry.title).join(' | ');
    const meta = document.createElement('div');
    meta.className = 'run-meta';
    meta.textContent = laneItems.length + ' items';
    item.append(title, detail, meta);
    return item;
  }

  function workbenchActionItems(actions) {
    if (!actions || actions.length === 0) {
      return [emptyItem('No workbench actions.')];
    }
    return actions.map((action) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = action.label;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = [action.kind, action.entityId, action.endpoint].filter(Boolean).join(' - ');
      item.append(title, meta);
      return item;
    });
  }

  function renderSearchPlan(plan) {
    state.searchPlan = plan;
    if (!plan) {
      els.searchPlanCount.textContent = '0 items';
      els.searchPlanSummary.textContent = 'Create or select a run to inspect the search plan.';
      els.searchPlanList.replaceChildren(emptyItem('No search plan items.'));
      els.searchPlanNoteList.replaceChildren(emptyItem('No search plan notes.'));
      updateSearchPlanAdvanceState(null);
      applyLanguage();
      return;
    }
    const counts = plan.counts || {};
    els.searchPlanCount.textContent = (counts.total || 0) + ' items';
    els.searchPlanSummary.textContent = plan.summary || '';
    const items = plan.items || [];
    if (items.length === 0) {
      els.searchPlanList.replaceChildren(emptyItem('No search plan items.'));
    } else {
      els.searchPlanList.replaceChildren(...items.slice(0, 8).map((entry) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = '#' + entry.score + ' ' + entry.title + ' - ' + label(entry.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = entry.rationale;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [
          entry.source,
          entry.automation,
          entry.riskLevel,
          entry.suggestedTool,
          entry.suggestedTemplate
        ].filter(Boolean).join(' - ');
        item.append(title, detail, meta);
        if (entry.blockers && entry.blockers.length > 0) {
          const blocker = document.createElement('p');
          blocker.className = 'muted';
          blocker.textContent = entry.blockers.join(' | ');
          item.append(blocker);
        }
        return item;
      }));
    }
    els.searchPlanNoteList.replaceChildren(...listItems(plan.scoringNotes || [], 'No search plan notes.'));
    updateSearchPlanAdvanceState(plan);
    applyLanguage();
  }

  function updateSearchPlanAdvanceState(plan) {
    const active = state.runs.find((run) => run.id === state.activeRunId);
    const topItem = plan && plan.topItem;
    const blockedAutomation =
      !topItem ||
      topItem.automation === 'operator_review' ||
      topItem.automation === 'none' ||
      topItem.automation === 'report';
    els.advanceSearchPlan.disabled = state.busy || !active || active.status !== 'active' || blockedAutomation;
  }

  function formatDuration(ms) {
    if (ms < 1000) {
      return String(ms) + 'ms';
    }
    return (ms / 1000).toFixed(1) + 's';
  }

  function renderWorkers(workers) {
    const healthy = workers.filter((worker) => worker.healthy);
    els.workerCount.textContent = healthy.length + ' healthy';
    if (workers.length === 0) {
      els.workerList.replaceChildren(emptyItem('No workers configured.'));
      return;
    }
    els.workerList.replaceChildren(...workers.map((worker) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = worker.name + ' - ' + worker.status;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = worker.type + ' - priority ' + worker.priority + ' - max ' + worker.maxRunning;
      item.append(title, meta);
      if (worker.reason) {
        const reason = document.createElement('p');
        reason.className = 'muted';
        reason.textContent = worker.reason;
        item.append(reason);
      }
      return item;
    }));
  }

  function renderWorkerSelection(report) {
    state.workerSelection = report;
    if (!report) {
      els.workerSelectionStatus.textContent = 'No policy';
      els.workerSelectionSummary.textContent = 'Create or select a run to inspect Worker selection.';
      els.workerSelectionPicked.textContent = '-';
      els.workerSelectionTask.textContent = '-';
      els.workerSelectionEligible.textContent = '0/0';
      els.workerSelectionEvidence.textContent = '0';
      els.workerSelectionList.replaceChildren(emptyItem('No Worker selection policy yet.'));
      els.workerSelectionActionList.replaceChildren(emptyItem('No Worker selection actions.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    const selected = report.selectedWorker;
    els.workerSelectionStatus.textContent = label(report.task || 'policy');
    els.workerSelectionSummary.textContent = report.summary || '';
    els.workerSelectionPicked.textContent = selected ? selected.worker : '-';
    els.workerSelectionTask.textContent = label(report.task || '-');
    els.workerSelectionEligible.textContent = (counts.eligibleWorkers || 0) + '/' + (counts.configuredWorkers || 0);
    els.workerSelectionEvidence.textContent = String(counts.evidenceProducingWorkers || 0);
    const candidates = report.candidates || [];
    if (candidates.length === 0) {
      els.workerSelectionList.replaceChildren(emptyItem('No Worker selection candidates.'));
    } else {
      els.workerSelectionList.replaceChildren(...candidates.slice(0, 8).map((candidate, index) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent =
          '#' + (index + 1) + ' ' + candidate.worker +
          ' - ' + label(candidate.decision) +
          ' - score ' + candidate.selectionScore;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [
          candidate.type,
          'priority=' + candidate.priority,
          'healthy=' + yesNo(candidate.healthy),
          'history=' + candidate.tasks,
          'success=' + candidate.successRate + '%',
          'evidence=' + candidate.evidenceContributed,
          'findings=' + candidate.findingsInfluenced
        ].join(' - ');
        const detail = document.createElement('p');
        detail.className = 'muted';
        const notes = (candidate.blockers && candidate.blockers.length > 0)
          ? candidate.blockers
          : (candidate.reasons || []);
        detail.textContent = notes.slice(0, 3).join(' | ');
        item.append(title, meta, detail);
        return item;
      }));
    }
    els.workerSelectionActionList.replaceChildren(...listItems(report.nextActions || [], 'No Worker selection actions.'));
    applyLanguage();
  }

  function renderWorkerEvaluationPlan(report) {
    state.workerEvaluationPlan = report;
    if (!report) {
      els.workerEvalStatus.textContent = 'insufficient_data';
      els.workerEvalSummary.textContent = 'Create or select a run to inspect Worker evaluation readiness.';
      els.workerEvalCoverage.textContent = '0/0';
      els.workerEvalComparable.textContent = '0';
      els.workerEvalEvidence.textContent = '0';
      els.workerEvalCost.textContent = '$0.00';
      els.workerEvalCardList.replaceChildren(emptyItem('No Worker eval cards.'));
      els.workerEvalDimensionList.replaceChildren(emptyItem('No Worker eval dimensions.'));
      els.workerEvalExperimentList.replaceChildren(emptyItem('No Worker eval experiments.'));
      els.workerEvalActionList.replaceChildren(emptyItem('No Worker eval actions.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.workerEvalStatus.textContent = label(report.readiness || 'insufficient_data');
    els.workerEvalSummary.textContent = report.summary || '';
    els.workerEvalCoverage.textContent = (counts.coveredTaskCells || 0) + '/' + (counts.totalTaskCells || 0);
    els.workerEvalComparable.textContent = String(counts.comparableWorkers || 0);
    els.workerEvalEvidence.textContent = String(counts.evidenceProducingWorkers || 0);
    els.workerEvalCost.textContent = '$' + Number(counts.estimatedUsd || 0).toFixed(4);
    const workers = report.workers || [];
    if (workers.length === 0) {
      els.workerEvalCardList.replaceChildren(emptyItem('No Worker eval cards.'));
    } else {
      els.workerEvalCardList.replaceChildren(...workers.slice(0, 8).map((worker) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = worker.worker + ' - ' + label(worker.readiness) + ' - score ' + worker.score;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [
          worker.type,
          'tasks=' + worker.tasks,
          'bootstrap=' + worker.tasksByKind.bootstrap,
          'reason=' + worker.tasksByKind.reason,
          'explore=' + worker.tasksByKind.explore,
          'success=' + worker.successRate + '%',
          'evidence=' + worker.evidenceContributed
        ].join(' - ');
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = (worker.gaps && worker.gaps.length > 0) ? worker.gaps.slice(0, 2).join(' | ') : (worker.strengths || []).slice(0, 2).join(' | ');
        item.append(title, meta, detail);
        return item;
      }));
    }
    const dimensions = report.dimensions || [];
    if (dimensions.length === 0) {
      els.workerEvalDimensionList.replaceChildren(emptyItem('No Worker eval dimensions.'));
    } else {
      els.workerEvalDimensionList.replaceChildren(...dimensions.map((dimension) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = t(dimension.title) + ' - ' + dimension.score + ' - ' + label(dimension.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = dimension.detail || '';
        item.append(title, detail);
        return item;
      }));
    }
    const experiments = report.experiments || [];
    if (experiments.length === 0) {
      els.workerEvalExperimentList.replaceChildren(emptyItem('No Worker eval experiments.'));
    } else {
      els.workerEvalExperimentList.replaceChildren(...experiments.map((experiment) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = experiment.title + ' - ' + label(experiment.status);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [experiment.task, (experiment.workerNames || []).join(', ')].filter(Boolean).join(' - ');
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = experiment.objective;
        item.append(title, meta, detail);
        return item;
      }));
    }
    els.workerEvalActionList.replaceChildren(...listItems(report.nextActions || [], 'No Worker eval actions.'));
    applyLanguage();
  }

  function renderExecutionNode(report) {
    state.executionNode = report;
    if (!report) {
      els.executionNodeStatus.textContent = 'partial';
      els.executionNodeSummary.textContent = 'Create or select a run to inspect the local execution node.';
      els.executionNodeProfiles.textContent = '0/0';
      els.executionNodeTemplates.textContent = '0/0';
      els.executionNodeWorkers.textContent = '0/0';
      els.executionNodeSessions.textContent = '0';
      els.executionNodeRuntimeList.replaceChildren(emptyItem('No local execution node report.'));
      els.executionNodeGateList.replaceChildren(emptyItem('No local execution node report.'));
      els.executionNodeActionList.replaceChildren(emptyItem('No local execution node actions.'));
      return;
    }
    const counts = report.counts || {};
    els.executionNodeStatus.textContent = label(report.status);
    els.executionNodeSummary.textContent = report.summary || '';
    els.executionNodeProfiles.textContent = (counts.availableProfiles || 0) + '/' + (counts.profiles || 0);
    els.executionNodeTemplates.textContent = (counts.runnableScannerTemplates || 0) + '/' + (counts.scannerTemplates || 0);
    els.executionNodeWorkers.textContent = (counts.healthyWorkers || 0) + '/' + (counts.workers || 0);
    els.executionNodeSessions.textContent = String((counts.activeBrowserSessions || 0) + (counts.activeProxySessions || 0) + (counts.activeOastSessions || 0));
    const runtimes = report.runtimes || [];
    if (runtimes.length === 0) {
      els.executionNodeRuntimeList.replaceChildren(emptyItem('No local execution node report.'));
    } else {
      els.executionNodeRuntimeList.replaceChildren(...runtimes.map((runtime) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = t(runtime.title) + ' - ' + label(runtime.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = runtime.detail;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = (runtime.signals || []).join(' - ');
        item.append(title, detail, meta);
        if (runtime.gaps && runtime.gaps.length > 0) {
          const gap = document.createElement('p');
          gap.className = 'muted';
          gap.textContent = runtime.gaps.slice(0, 2).join(' | ');
          item.append(gap);
        }
        return item;
      }));
    }
    const gates = report.gates || [];
    if (gates.length === 0) {
      els.executionNodeGateList.replaceChildren(emptyItem('No local execution node report.'));
    } else {
      els.executionNodeGateList.replaceChildren(...gates.map((gate) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = t(gate.title) + ' - ' + label(gate.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = gate.detail;
        item.append(title, detail);
        return item;
      }));
    }
    els.executionNodeActionList.replaceChildren(...listItems(report.recommendedActions || [], 'No local execution node actions.'));
  }

  function renderDesktopReadiness(report) {
    state.desktopReadiness = report;
    if (!report) {
      els.desktopReadinessStatus.textContent = 'planned';
      els.desktopReadinessSummary.textContent = 'Create or select a run to inspect desktop runner productization readiness.';
      els.desktopReadyComponents.textContent = '0';
      els.desktopPartialComponents.textContent = '0';
      els.desktopPlannedGaps.textContent = '0';
      els.desktopLocalSessions.textContent = '0';
      els.desktopEvidenceItems.textContent = '0';
      els.desktopRunnableTemplates.textContent = '0';
      els.desktopComponentList.replaceChildren(emptyItem('No desktop readiness report.'));
      els.desktopContractList.replaceChildren(emptyItem('No desktop contracts.'));
      els.desktopActionList.replaceChildren(emptyItem('No desktop actions.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.desktopReadinessStatus.textContent = label(report.status || 'planned');
    els.desktopReadinessSummary.textContent = report.summary || '';
    els.desktopReadyComponents.textContent = String(counts.ready || 0);
    els.desktopPartialComponents.textContent = String(counts.partial || 0);
    els.desktopPlannedGaps.textContent = String((counts.planned || 0) + (counts.blocked || 0));
    els.desktopLocalSessions.textContent = String(counts.activeLocalSessions || 0);
    els.desktopEvidenceItems.textContent = String(counts.evidenceItems || 0);
    els.desktopRunnableTemplates.textContent = String(counts.runnableScannerTemplates || 0);
    const components = report.components || [];
    if (components.length === 0) {
      els.desktopComponentList.replaceChildren(emptyItem('No desktop readiness report.'));
    } else {
      els.desktopComponentList.replaceChildren(...components.map((component) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = component.name + ' - ' + label(component.status);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = t('Owner') + ': ' + component.ownerSurface;
        const current = document.createElement('p');
        current.className = 'muted';
        current.textContent = component.currentState;
        const signals = document.createElement('p');
        signals.className = 'muted';
        signals.textContent = t('Signals') + ': ' + listSummary(component.implementedSignals || []);
        item.append(title, meta, current, signals);
        if (component.missingPieces && component.missingPieces.length > 0) {
          const missing = document.createElement('p');
          missing.className = 'muted';
          missing.textContent = t('Missing') + ': ' + listSummary(component.missingPieces);
          item.append(missing);
        }
        const gates = document.createElement('p');
        gates.className = 'muted';
        gates.textContent = t('Gates') + ': ' + listSummary(component.securityGates || []);
        item.append(gates);
        return item;
      }));
    }
    const contracts = report.handoffContracts || [];
    if (contracts.length === 0) {
      els.desktopContractList.replaceChildren(emptyItem('No desktop contracts.'));
    } else {
      els.desktopContractList.replaceChildren(...contracts.map((contract) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = contract.name + ' - ' + label(contract.status);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = contract.producer + ' -> ' + contract.consumer;
        const body = document.createElement('p');
        body.className = 'muted';
        body.textContent = t('Contract') + ': ' + listSummary(contract.contract || []);
        const avoid = document.createElement('p');
        avoid.className = 'muted';
        avoid.textContent = t('Must not do') + ': ' + listSummary(contract.mustNotDo || []);
        item.append(title, meta, body, avoid);
        return item;
      }));
    }
    els.desktopActionList.replaceChildren(...listItems(report.nextActions || [], 'No desktop actions.'));
    applyLanguage();
  }

  function renderLocalRunnerWorkbench(report) {
    state.localRunnerWorkbench = report;
    if (!report) {
      els.runnerWorkbenchStatus.textContent = 'partial';
      els.runnerWorkbenchSummary.textContent = 'Create or select a run to inspect local runner capture readiness.';
      els.runnerWorkbenchBrowser.textContent = '0';
      els.runnerWorkbenchProxy.textContent = '0';
      els.runnerWorkbenchHttp.textContent = '0';
      els.runnerWorkbenchReviewed.textContent = '0/0';
      els.runnerWorkbenchLocalOnly.textContent = '0';
      els.runnerWorkbenchCredentials.textContent = '0';
      els.prepareRunnerWorkbench.disabled = true;
      els.runnerWorkbenchProfileList.replaceChildren(emptyItem('No capture profiles.'));
      els.runnerWorkbenchSurfaceList.replaceChildren(emptyItem('No local runner workbench.'));
      els.runnerWorkbenchGateList.replaceChildren(emptyItem('No capture gates.'));
      els.runnerWorkbenchProxyList.replaceChildren(emptyItem('No proxy setup.'));
      els.runnerWorkbenchEvidenceList.replaceChildren(emptyItem('No recent capture evidence.'));
      els.runnerWorkbenchActionList.replaceChildren(emptyItem('No runner actions.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.runnerWorkbenchStatus.textContent = label(report.status || 'partial');
    els.runnerWorkbenchSummary.textContent = report.summary || '';
    els.runnerWorkbenchBrowser.textContent = String(counts.activeBrowserSessions || 0);
    els.runnerWorkbenchProxy.textContent = String(counts.activeProxySessions || 0);
    els.runnerWorkbenchHttp.textContent = String(counts.httpExchangeEvidence || 0);
    els.runnerWorkbenchReviewed.textContent = (counts.reviewedEvidence || 0) + '/' + (counts.totalEvidence || 0);
    els.runnerWorkbenchLocalOnly.textContent = String(counts.rawLocalOnlyEvidence || 0);
    els.runnerWorkbenchCredentials.textContent = String(counts.activeCredentialReferences || 0);
    els.prepareRunnerWorkbench.disabled = state.busy || !state.activeRunId;
    renderRunnerCaptureProfiles(report.captureProfiles || []);
    const surfaces = report.surfaces || [];
    if (surfaces.length === 0) {
      els.runnerWorkbenchSurfaceList.replaceChildren(emptyItem('No capture surfaces.'));
    } else {
      els.runnerWorkbenchSurfaceList.replaceChildren(...surfaces.map((surface) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = t(surface.title) + ' - ' + label(surface.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = surface.detail;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = (surface.signals || []).join(' - ');
        const controls = document.createElement('p');
        controls.className = 'muted';
        controls.textContent = t('Controls') + ': ' + listSummary(surface.operatorControls || []);
        item.append(title, detail, meta, controls);
        if (surface.limitations && surface.limitations.length > 0) {
          const limits = document.createElement('p');
          limits.className = 'muted';
          limits.textContent = t('Limitations') + ': ' + listSummary(surface.limitations);
          item.append(limits);
        }
        if (surface.nextActions && surface.nextActions.length > 0) {
          const next = document.createElement('p');
          next.className = 'muted';
          next.textContent = t('Next action') + ': ' + listSummary(surface.nextActions);
          item.append(next);
        }
        return item;
      }));
    }
    const gates = report.captureGates || [];
    if (gates.length === 0) {
      els.runnerWorkbenchGateList.replaceChildren(emptyItem('No capture gates.'));
    } else {
      els.runnerWorkbenchGateList.replaceChildren(...gates.map((gate) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = t(gate.title) + ' - ' + label(gate.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = gate.detail;
        item.append(title, detail);
        return item;
      }));
    }
    renderRunnerProxySetup(report.proxySetup);
    const evidence = report.recentEvidence || [];
    if (evidence.length === 0) {
      els.runnerWorkbenchEvidenceList.replaceChildren(emptyItem('No recent capture evidence.'));
    } else {
      els.runnerWorkbenchEvidenceList.replaceChildren(...evidence.map((item) => {
        const row = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = label(item.kind) + ' - ' + label(item.reviewStatus);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = item.id + ' - ' + label(item.redactionState);
        const source = document.createElement('p');
        source.className = 'muted';
        source.textContent = [item.source, item.target].filter(Boolean).join(' - ');
        const time = document.createElement('time');
        time.dateTime = item.createdAt;
        time.textContent = new Date(item.createdAt).toLocaleString();
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        const useButton = document.createElement('button');
        useButton.type = 'button';
        useButton.textContent = 'Use as evidence';
        useButton.addEventListener('click', () => appendEvidenceId(item.id));
        actions.append(useButton);
        row.append(title, meta, source, time, actions);
        return row;
      }));
    }
    els.runnerWorkbenchActionList.replaceChildren(...listItems(report.operatorNextActions || [], 'No runner actions.'));
    applyLanguage();
  }

  function renderRunnerCaptureProfiles(profiles) {
    if (!profiles || profiles.length === 0) {
      els.runnerWorkbenchProfileList.replaceChildren(emptyItem('No capture profiles.'));
      return;
    }
    els.runnerWorkbenchProfileList.replaceChildren(...profiles.map((profile) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = profile.title + ' - ' + label(profile.status) + ' - ' + profile.riskLevel;
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = profile.summary;
      const readiness = document.createElement('div');
      readiness.className = 'run-meta';
      readiness.textContent = t('Readiness') + ': ' + listSummary(profile.readinessSignals || []);
      const entrypoints = document.createElement('p');
      entrypoints.className = 'muted';
      entrypoints.textContent = t('Entrypoints') + ': ' + listSummary(profile.entrypoints || []);
      const setup = document.createElement('p');
      setup.className = 'muted';
      setup.textContent = t('Setup') + ': ' + listSummary(profile.setupSteps || []);
      const gates = document.createElement('p');
      gates.className = 'muted';
      gates.textContent = t('Gates') + ': ' + listSummary(profile.safetyGates || []);
      item.append(title, detail, readiness, entrypoints, setup, gates);
      if (profile.blockedReasons && profile.blockedReasons.length > 0) {
        const blocked = document.createElement('p');
        blocked.className = 'muted';
        blocked.textContent = t('Blocked reasons') + ': ' + listSummary(profile.blockedReasons);
        item.append(blocked);
      }
      if (profile.nextActions && profile.nextActions.length > 0) {
        const next = document.createElement('p');
        next.className = 'muted';
        next.textContent = t('Next action') + ': ' + listSummary(profile.nextActions);
        item.append(next);
      }
      return item;
    }));
  }

  function renderRunnerProxySetup(proxySetup) {
    if (!proxySetup) {
      els.runnerWorkbenchProxyList.replaceChildren(emptyItem('No proxy setup.'));
      return;
    }
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = label(proxySetup.status) + ' - ' + proxySetup.proxyUrl;
    const headers = document.createElement('div');
    headers.className = 'run-meta';
    headers.textContent = Object.entries(proxySetup.requiredHeaders || {})
      .map(([key, value]) => key + '=' + value)
      .join(' - ');
    const curl = document.createElement('p');
    curl.className = 'muted';
    curl.textContent = t('curl example') + ': ' + proxySetup.curlExample;
    const pac = document.createElement('p');
    pac.className = 'muted';
    pac.textContent = t('PAC') + ': ' + (proxySetup.pac ? proxySetup.pac.detail : '-');
    const notes = document.createElement('p');
    notes.className = 'muted';
    notes.textContent = listSummary(proxySetup.browserSetupNotes || []);
    const limits = document.createElement('p');
    limits.className = 'muted';
    limits.textContent = t('Limitations') + ': ' + listSummary(proxySetup.limitations || []);
    item.append(title, headers, curl, pac, notes, limits);
    els.runnerWorkbenchProxyList.replaceChildren(item);
  }

  function renderAgentFramework(report) {
    state.agentFramework = report;
    if (!report) {
      els.agentFrameworkStatus.textContent = 'Not loaded';
      els.agentFrameworkSummary.textContent = 'Agent framework report has not been loaded.';
      els.frameworkWorkerMetric.textContent = '0';
      els.frameworkToolMetric.textContent = '0';
      els.frameworkTemplateMetric.textContent = '0';
      els.frameworkSkillMetric.textContent = '0';
      els.agentFrameworkKernelList.replaceChildren(emptyItem('No agent framework report.'));
      els.agentFrameworkInvariantList.replaceChildren(emptyItem('No framework invariants.'));
      els.agentFrameworkExtensionList.replaceChildren(emptyItem('No extension points.'));
      els.agentFrameworkNextList.replaceChildren(emptyItem('No framework next steps.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.agentFrameworkStatus.textContent = 'Framework ready';
    els.agentFrameworkSummary.textContent = report.summary || '';
    els.frameworkWorkerMetric.textContent = String(counts.workerAdapters || 0);
    els.frameworkToolMetric.textContent = String(counts.highLevelTools || 0);
    els.frameworkTemplateMetric.textContent = String(counts.scannerTemplates || 0);
    els.frameworkSkillMetric.textContent = String(counts.domainSkills || 0);
    const kernel = report.kernel || {};
    const kernelRows = [
      t('Scheduling unit') + ': ' + (kernel.schedulingUnit || '-'),
      t('Orchestration') + ': ' + (kernel.orchestration || '-'),
      t('Protocol') + ': ' + (kernel.protocolVersion || '-'),
      t('State model') + ': ' + listSummary(kernel.stateModel || [])
    ];
    els.agentFrameworkKernelList.replaceChildren(...listItems(kernelRows, 'No agent framework report.'));
    els.agentFrameworkInvariantList.replaceChildren(...listItems(report.invariants || [], 'No framework invariants.'));
    const extensions = report.extensionPoints || [];
    if (extensions.length === 0) {
      els.agentFrameworkExtensionList.replaceChildren(emptyItem('No extension points.'));
    } else {
      els.agentFrameworkExtensionList.replaceChildren(...extensions.map((extension) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = extension.name + ' - ' + label(extension.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = extension.purpose;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [
          'id=' + extension.id,
          t('implemented') + '=' + listSummary(extension.implementedBy || []),
          t('controls') + '=' + listSummary(extension.operatorControls || [])
        ].join(' - ');
        const authority = document.createElement('p');
        authority.className = 'muted';
        authority.textContent = extension.executionAuthority;
        item.append(title, detail, meta, authority);
        return item;
      }));
    }
    els.agentFrameworkNextList.replaceChildren(...listItems(report.recommendedNextSteps || [], 'No framework next steps.'));
    applyLanguage();
  }

  function renderAgentHarness(report) {
    state.agentHarness = report;
    if (!report) {
      els.agentHarnessStatus.textContent = 'Not loaded';
      els.agentHarnessSummary.textContent = 'Create or select a run to inspect agent harness readiness.';
      els.harnessScoreMetric.textContent = '0';
      els.harnessReadyMetric.textContent = '0';
      els.harnessPartialMetric.textContent = '0';
      els.harnessGapMetric.textContent = '0';
      els.harnessFixtureMetric.textContent = '0';
      els.harnessGateMetric.textContent = '0';
      els.agentHarnessCellList.replaceChildren(emptyItem('No agent harness report.'));
      els.agentHarnessControlList.replaceChildren(emptyItem('No harness controls.'));
      els.agentHarnessActionList.replaceChildren(emptyItem('No harness actions.'));
      els.agentHarnessPlanStatus.textContent = 'Not loaded';
      els.agentHarnessPlanSummary.textContent = 'Create or select a run to inspect harness fixture tasks.';
      els.agentHarnessFixtureList.replaceChildren(emptyItem('No harness fixtures.'));
      els.agentHarnessGateList.replaceChildren(emptyItem('No harness acceptance gates.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    const evalPlan = report.evalPlan || null;
    const evalCounts = (evalPlan && evalPlan.counts) || {};
    els.agentHarnessStatus.textContent = label(report.posture || 'partial');
    els.agentHarnessSummary.textContent = report.summary || '';
    els.harnessScoreMetric.textContent = String(report.score || 0);
    els.harnessReadyMetric.textContent = String((counts.ready || 0) + (counts.usable || 0));
    els.harnessPartialMetric.textContent = String(counts.partial || 0);
    els.harnessGapMetric.textContent = String(counts.gaps || 0);
    els.harnessFixtureMetric.textContent = String(evalCounts.fixtures || 0);
    els.harnessGateMetric.textContent = String((evalCounts.acceptanceCriteria || 0) + (evalCounts.safetyGates || 0));
    const cells = report.cells || [];
    if (cells.length === 0) {
      els.agentHarnessCellList.replaceChildren(emptyItem('No agent harness report.'));
    } else {
      els.agentHarnessCellList.replaceChildren(...cells.map((cell) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = cell.title + ' - ' + cell.score + ' - ' + label(cell.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = cell.ours;
        const principle = document.createElement('p');
        principle.className = 'muted';
        principle.textContent = cell.referencePrinciple;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = listSummary(cell.evidence || []);
        item.append(title, detail, principle, meta);
        if (cell.gaps && cell.gaps.length > 0) {
          const gap = document.createElement('p');
          gap.className = 'muted';
          gap.textContent = cell.gaps.slice(0, 2).join(' | ');
          item.append(gap);
        }
        return item;
      }));
    }
    els.agentHarnessControlList.replaceChildren(...listItems(report.runControls || [], 'No harness controls.'));
    els.agentHarnessActionList.replaceChildren(...listItems(report.nextActions || [], 'No harness actions.'));
    if (!evalPlan) {
      els.agentHarnessPlanStatus.textContent = 'Not loaded';
      els.agentHarnessPlanSummary.textContent = 'Create or select a run to inspect harness fixture tasks.';
      els.agentHarnessFixtureList.replaceChildren(emptyItem('No harness fixtures.'));
      els.agentHarnessGateList.replaceChildren(emptyItem('No harness acceptance gates.'));
      applyLanguage();
      return;
    }
    els.agentHarnessPlanStatus.textContent = label(evalPlan.posture || 'partial');
    els.agentHarnessPlanSummary.textContent = evalPlan.summary || '';
    const fixtures = evalPlan.fixtures || [];
    if (fixtures.length === 0) {
      els.agentHarnessFixtureList.replaceChildren(emptyItem('No harness fixtures.'));
    } else {
      els.agentHarnessFixtureList.replaceChildren(...fixtures.map((fixture) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = fixture.title + ' - ' + label(fixture.status) + ' - ' + fixture.riskLevel;
        const objective = document.createElement('p');
        objective.className = 'muted';
        objective.textContent = fixture.objective;
        const fit = document.createElement('div');
        fit.className = 'run-meta';
        fit.textContent = fixture.phaseReference + ' - ' + fixture.runFit;
        const criteria = document.createElement('p');
        criteria.className = 'muted';
        criteria.textContent = listSummary(fixture.acceptanceCriteria || []);
        item.append(title, objective, fit, criteria);
        if (fixture.blockers && fixture.blockers.length > 0) {
          const blockers = document.createElement('p');
          blockers.className = 'muted';
          blockers.textContent = fixture.blockers.slice(0, 2).join(' | ');
          item.append(blockers);
        }
        return item;
      }));
    }
    els.agentHarnessGateList.replaceChildren(...listItems([
      ...(evalPlan.acceptanceGates || []),
      ...(evalPlan.readOnlyGuarantees || []),
      ...((evalPlan.referenceSource && evalPlan.referenceSource.deliberatelyNotCopied) || []).slice(0, 3)
    ], 'No harness acceptance gates.'));
    applyLanguage();
  }

  function renderReferenceBenchmark(report) {
    state.referenceBenchmark = report;
    if (!report) {
      els.referenceBenchmarkStatus.textContent = 'Not loaded';
      els.referenceBenchmarkSummary.textContent = 'Create or select a run to compare platform capability against reference projects.';
      els.referenceProjectMetric.textContent = '0';
      els.referenceMatchedMetric.textContent = '0';
      els.referencePartialMetric.textContent = '0';
      els.referenceBlockerMetric.textContent = '0';
      els.referenceDimensionList.replaceChildren(emptyItem('No reference benchmark yet.'));
      els.referenceProjectList.replaceChildren(emptyItem('No reference project lessons.'));
      els.referenceActionList.replaceChildren(emptyItem('No benchmark actions.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.referenceBenchmarkStatus.textContent = label(counts.gaps > 0 ? 'gap' : counts.partial > 0 ? 'partial' : 'matched');
    els.referenceBenchmarkSummary.textContent = report.summary || '';
    els.referenceProjectMetric.textContent = String(counts.referenceProjects || 0);
    els.referenceMatchedMetric.textContent = String((counts.matched || 0) + (counts.usable || 0));
    els.referencePartialMetric.textContent = String(counts.partial || 0);
    els.referenceBlockerMetric.textContent = String(counts.commercialBlockers || 0);
    const dimensions = report.dimensions || [];
    if (dimensions.length === 0) {
      els.referenceDimensionList.replaceChildren(emptyItem('No reference benchmark yet.'));
    } else {
      els.referenceDimensionList.replaceChildren(...dimensions.map((entry) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = entry.title + ' - ' + label(entry.status) + ' - ' + entry.score;
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = listSummary(entry.referenceProjects || []);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = entry.ours;
        const adopted = document.createElement('p');
        adopted.className = 'muted';
        adopted.textContent = t('Adopted') + ': ' + listSummary(entry.adopted || []);
        item.append(title, meta, detail, adopted);
        if (entry.gaps && entry.gaps.length > 0) {
          const gaps = document.createElement('p');
          gaps.className = 'muted';
          gaps.textContent = t('Gaps') + ': ' + listSummary(entry.gaps);
          item.append(gaps);
        }
        return item;
      }));
    }
    const projects = report.projects || [];
    if (projects.length === 0) {
      els.referenceProjectList.replaceChildren(emptyItem('No reference project lessons.'));
    } else {
      els.referenceProjectList.replaceChildren(...projects.map((project) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = project.name + ' - ' + label(project.currentFit);
        const role = document.createElement('p');
        role.className = 'muted';
        role.textContent = t('Reference role') + ': ' + project.referenceRole;
        const copied = document.createElement('p');
        copied.className = 'muted';
        copied.textContent = t('Adopted') + ': ' + listSummary(project.copiedPrinciples || []);
        const avoided = document.createElement('p');
        avoided.className = 'muted';
        avoided.textContent = t('Avoided') + ': ' + listSummary(project.deliberatelyAvoided || []);
        const gap = document.createElement('p');
        gap.className = 'muted';
        gap.textContent = t('Still missing') + ': ' + project.remainingGap;
        item.append(title, role, copied, avoided, gap);
        return item;
      }));
    }
    els.referenceActionList.replaceChildren(...listItems(report.nextActions || [], 'No benchmark actions.'));
    applyLanguage();
  }

  function renderWorkerEnvelopePreview(preview) {
    state.workerEnvelopePreview = preview;
    if (!preview) {
      els.workerEnvelopeStatus.textContent = 'No preview';
      els.workerEnvelopeList.replaceChildren(emptyItem('No worker envelope preview yet.'));
      els.workerEnvelopeJson.textContent = '';
      applyLanguage();
      return;
    }
    els.workerEnvelopeStatus.textContent = label(preview.task);
    const worker = preview.selectedWorker;
    const items = [
      planPreviewRow(
        'Task selection',
        preview.requestedTask + ' -> ' + preview.task + (preview.intentId ? ' - ' + preview.intentId : ''),
        t('claim would occur') + '=' + yesNo(preview.claimWouldOccur) +
          ' - selectedBy=' + preview.selectedBy +
          ' - selection=' + label(preview.selectionSource || 'pool_order')
      ),
      planPreviewRow(
        'Selected Worker',
        worker ? worker.name + ' - ' + worker.type : 'No worker configured.',
        worker ? 'priority=' + worker.priority + ' - max=' + worker.maxRunning + ' - command=' + yesNo(worker.commandConfigured) : '-'
      ),
      planPreviewRow(
        'Graph context',
        'facts=' + preview.graphCounts.facts + ', intents=' + preview.graphCounts.intents + ', evidence=' + preview.graphCounts.evidence + ', findings=' + preview.graphCounts.findings,
        'runId=' + preview.runId
      ),
      planPreviewRow(
        'Run context',
        'skills=' + preview.contextCounts.domainSkills + ', credentials=' + preview.contextCounts.credentialReferences + ', pocs=' + preview.contextCounts.pocTemplates + ', bundles=' + preview.contextCounts.toolboxBundles + ', connectors=' + (preview.contextCounts.connectors || 0),
        'tools=' + preview.contextCounts.toolSurface + ', hints=' + preview.contextCounts.strategyHints + ', recommendations=' + preview.contextCounts.strategyRecommendations
      ),
      planPreviewRow(
        'Safety',
        [
          t('writes state') + '=' + yesNo(preview.safety.writesState),
          t('executes worker') + '=' + yesNo(preview.safety.executesWorker),
          t('raw secrets') + '=' + yesNo(preview.safety.rawSecretsIncluded),
          t('raw evidence content') + '=' + yesNo(preview.safety.rawEvidenceContentIncluded)
        ].join(', '),
        preview.generatedAt
      )
    ];
    els.workerEnvelopeList.replaceChildren(...items);
    els.workerEnvelopeJson.textContent = JSON.stringify(preview.envelope, null, 2);
    applyLanguage();
  }

  function selectedScannerTemplateRisk() {
    const scanner = state.toolCatalog.find((tool) => tool.name === 'scanner.run_template');
    const template = scanner && scanner.templates
      ? scanner.templates.find((item) => item.id === els.scannerTemplateSelect.value)
      : null;
    return template ? template.defaultRiskLevel : 'R2';
  }

  function syncScannerRiskFromTemplate() {
    const risk = selectedScannerTemplateRisk();
    if (risk && els.scannerRiskLevel.querySelector('option[value="' + risk + '"]')) {
      els.scannerRiskLevel.value = risk;
    }
  }

  function renderToolCatalog(tools) {
    state.toolCatalog = tools || [];
    const selectedTemplate = els.scannerTemplateSelect.value;
    const scanner = state.toolCatalog.find((tool) => tool.name === 'scanner.run_template');
    const options = scanner && scanner.templates ? scanner.templates : [];
    if (options.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No tools loaded.';
      els.scannerTemplateSelect.replaceChildren(option);
    } else {
      els.scannerTemplateSelect.replaceChildren(...options.map((template) => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.id;
        return option;
      }));
      if (selectedTemplate && options.some((template) => template.id === selectedTemplate)) {
        els.scannerTemplateSelect.value = selectedTemplate;
      }
    }
    syncScannerRiskFromTemplate();
    els.scannerTemplateForm.querySelector('button[type="submit"]').disabled =
      state.busy || !state.activeRunId || options.length === 0;
    els.previewScannerTemplate.disabled =
      state.busy || !state.activeRunId || options.length === 0;
    els.toolCatalogCount.textContent = state.toolCatalog.length + ' tools';
    if (state.toolCatalog.length === 0) {
      els.toolCatalogList.replaceChildren(emptyItem('No tools loaded.'));
      return;
    }
    els.toolCatalogList.replaceChildren(...state.toolCatalog.map((tool) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = tool.name;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      const templateCount = tool.templates ? tool.templates.length : 0;
      meta.textContent = tool.category + ' - ' + tool.defaultRiskLevel + ' - ' + templateCount + ' templates' + (tool.producesEvidence ? ' - produces evidence' : '') + (tool.requiresApproval ? ' - approval gated' : '');
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = tool.description;
      item.append(title, meta, detail);
      if (tool.templates && tool.templates.length > 0) {
        const templates = document.createElement('p');
        templates.className = 'muted';
        templates.textContent = tool.templates.map((template) => template.id).join(', ');
        item.append(templates);
      }
      return item;
    }));
  }

  function renderToolPacks(packs) {
    state.toolPacks = packs || [];
    const selectedPack = els.toolPackSelect.value;
    if (state.toolPacks.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No tool packs loaded.';
      els.toolPackSelect.replaceChildren(option);
    } else {
      els.toolPackSelect.replaceChildren(...state.toolPacks.map((pack) => {
        const option = document.createElement('option');
        option.value = pack.id;
        option.textContent = pack.name;
        return option;
      }));
      if (selectedPack && state.toolPacks.some((pack) => pack.id === selectedPack)) {
        els.toolPackSelect.value = selectedPack;
      }
    }
    els.previewToolPack.disabled = state.busy || !state.activeRunId || state.toolPacks.length === 0;
    els.invokeToolPack.disabled = state.busy || !state.activeRunId || state.toolPacks.length === 0;
  }

  function renderToolPackPlanPreview(preview) {
    state.toolPackPlanPreview = preview;
    if (!preview) {
      els.toolPackStatus.textContent = 'No pack preview';
      els.toolPackPlanList.replaceChildren(emptyItem('No tool pack preview yet.'));
      applyLanguage();
      return;
    }
    els.toolPackStatus.textContent = preview.summary.executable + '/' + preview.summary.total + ' executable';
    const rows = [
      planPreviewRow(
        preview.pack.name,
        preview.pack.description,
        t('Commercial use') + ': ' + listSummary(preview.pack.commercialUseCases || [])
      ),
      planPreviewRow(
        'Summary',
        [
          t('Executable') + '=' + preview.summary.executable,
          t('Blocked') + '=' + preview.summary.blocked,
          t('Approval required') + '=' + preview.summary.approvalRequired
        ].join(' - '),
        preview.generatedAt
      ),
      planPreviewRow(
        'Audit preview',
        [
          t('Preview writes state') + '=' + yesNo(preview.audit.previewWritesState),
          t('Would execute external process') + '=' + yesNo(false),
          t('Would write evidence') + '=' + yesNo(preview.audit.writesEvidence)
        ].join(' - '),
        preview.target
      )
    ];
    for (const item of preview.items || []) {
      rows.push(planPreviewRow(
        item.request.title,
        item.preview.tool + ' ' + item.preview.riskLevel + ' - ' + label(item.preview.status) + (item.preview.reason ? ' - ' + item.preview.reason : ''),
        item.request.evidenceGoal
      ));
    }
    els.toolPackPlanList.replaceChildren(...rows);
    applyLanguage();
  }

  function renderToolPackRuns(runs) {
    if (!runs || runs.length === 0) {
      els.toolPackRunList.replaceChildren(emptyItem('No tool pack runs.'));
      return;
    }
    els.toolPackRunList.replaceChildren(...runs.map((run) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = run.packId + ' - ' + label(run.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = [
        'allowed=' + run.allowed + '/' + run.total,
        'blocked=' + run.blocked,
        'approval=' + run.approvalRequired,
        new Date(run.endedAt).toLocaleString()
      ].join(' - ');
      const evidence = document.createElement('p');
      evidence.className = 'muted';
      evidence.textContent = run.evidenceIds && run.evidenceIds.length > 0
        ? run.evidenceIds.slice(0, 6).join(', ') + (run.evidenceIds.length > 6 ? ' +' + (run.evidenceIds.length - 6) : '')
        : 'No evidence imported.';
      item.append(title, meta, evidence);
      if (run.items && run.items.length > 0) {
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = run.items.map((entry) => entry.title + '=' + label(entry.status)).join(' | ');
        item.append(detail);
      }
      return item;
    }));
  }

  function renderScannerTemplatePolicies(policies) {
    state.scannerTemplatePolicies = policies || [];
    els.templatePolicyCount.textContent = state.scannerTemplatePolicies.length + ' templates';
    if (state.scannerTemplatePolicies.length === 0) {
      els.templatePolicyList.replaceChildren(emptyItem('No scanner template policies loaded.'));
      return;
    }
    els.templatePolicyList.replaceChildren(...state.scannerTemplatePolicies.map((policy) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = policy.templateId + ' - ' + policy.defaultRiskLevel + ' - ' + policy.engine;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent =
        t('Allowed risks') + ': ' + (policy.allowedRiskLevels || []).join(', ') +
        ' - ' + t('Max timeout') + ': ' + policy.maxTimeoutMs + 'ms' +
        ' - ' + t('Requires approval') + ': ' + yesNo(policy.requiresApproval) +
        ' - ' + t('External fail closed') + ': ' + yesNo(policy.externalExecutionFailClosed);
      const input = document.createElement('p');
      input.className = 'muted';
      input.textContent = t('Input policy') + ': ' + listSummary(policy.inputPolicy || []);
      const controls = document.createElement('p');
      controls.className = 'muted';
      controls.textContent = t('Execution controls') + ': ' + listSummary(policy.executionControls || []);
      const evidence = document.createElement('div');
      evidence.className = 'run-meta';
      evidence.textContent = t('Evidence policy') + ': ' + listSummary(policy.evidencePolicy || []);
      item.append(title, meta, input, controls, evidence);
      return item;
    }));
  }

  function renderToolboxPolicy(policy) {
    state.toolboxPolicy = policy;
    if (!policy) {
      els.toolboxPolicyStatus.textContent = 'external disabled';
      els.toolboxPolicyList.replaceChildren(emptyItem('No toolbox policy loaded.'));
      return;
    }
    els.toolboxPolicyStatus.textContent = policy.externalExecutionEnabled ? 'external enabled' : 'external disabled';
    const rows = [
      t('External execution') + ': ' + yesNo(policy.externalExecutionEnabled),
      t('Template allowlist') + ': ' + (policy.allowAllExternalTemplates ? t('Allows all templates') : listSummary(policy.allowedExternalTemplates)),
      t('Profile probes') + ': ' + [
        t('Container profile probe') + '=' + yesNo(policy.containerProfileProbeEnabled),
        t('Local SAST probe') + '=' + yesNo(policy.localSastProbeEnabled),
        t('Android toolbox probe') + '=' + yesNo(policy.androidToolboxProbeEnabled)
      ].join(', ')
    ];
    els.toolboxPolicyList.replaceChildren(...rows.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }), ...listItems(policy.safetyControls || [], 'No toolbox policy loaded.'));
  }

  function renderToolboxDoctor(report) {
    state.toolboxDoctor = report;
    if (!report) {
      els.toolboxDoctorCount.textContent = '0 adapters';
      els.toolboxDoctorSummary.textContent = 'Toolbox readiness has not been checked.';
      els.toolboxDoctorActionList.replaceChildren(emptyItem('No toolbox doctor actions.'));
      els.toolboxDoctorAdapterList.replaceChildren(emptyItem('No toolbox adapter cards.'));
      return;
    }
    const counts = report.counts || {};
    els.toolboxDoctorCount.textContent = (counts.adapters || 0) + ' adapters';
    els.toolboxDoctorSummary.textContent = report.summary || '';
    els.toolboxDoctorActionList.replaceChildren(...listItems(report.recommendedActions || [], 'No toolbox doctor actions.'));
    const adapters = report.adapters || [];
    if (adapters.length === 0) {
      els.toolboxDoctorAdapterList.replaceChildren(emptyItem('No toolbox adapter cards.'));
      return;
    }
    els.toolboxDoctorAdapterList.replaceChildren(...adapters.map((adapter) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = adapter.engine + ' - ' + label(adapter.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = [
        (adapter.domains || []).map(label).join(', '),
        t('Risk levels') + ': ' + (adapter.riskLevels || []).join(', '),
        t('Profiles') + ': ' + listSummary(adapter.profileIds || [])
      ].filter(Boolean).join(' - ');
      const runnable = document.createElement('p');
      runnable.className = 'muted';
      runnable.textContent =
        t('Runnable templates') + ': ' + listSummary(adapter.runnableTemplateIds || []) +
        ' / ' + t('Blocked templates') + ': ' + listSummary(adapter.blockedTemplateIds || []);
      const reasons = document.createElement('p');
      reasons.className = 'muted';
      reasons.textContent = t('Blocked reasons') + ': ' + listSummary(adapter.blockedReasons || []);
      const actions = document.createElement('p');
      actions.className = 'muted';
      actions.textContent = t('Operator actions') + ': ' + listSummary(adapter.operatorActions || []);
      item.append(title, meta, runnable, reasons, actions);
      return item;
    }));
  }

  function renderRuntimeActivationPlan(report) {
    state.runtimeActivationPlan = report;
    if (!report) {
      els.runtimeActivationStatus.textContent = '0 steps';
      els.runtimeActivationSummary.textContent = 'Create or select a run to inspect governed runtime activation.';
      els.runtimeActivationRunnable.textContent = '0/0';
      els.runtimeActivationAdapters.textContent = '0/0';
      els.runtimeActivationActions.textContent = '0';
      els.runtimeActivationBlocked.textContent = '0';
      els.runtimeActivationStepList.replaceChildren(emptyItem('No runtime activation plan.'));
      els.runtimeActivationProfileList.replaceChildren(emptyItem('No runtime activation profiles.'));
      els.runtimeActivationOrderList.replaceChildren(emptyItem('No runtime activation order.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.runtimeActivationStatus.textContent = (counts.activationSteps || 0) + ' steps';
    els.runtimeActivationSummary.textContent = report.summary || '';
    els.runtimeActivationRunnable.textContent = (counts.runnableTemplates || 0) + '/' + (counts.templates || 0);
    els.runtimeActivationAdapters.textContent = (counts.readyAdapters || 0) + '/' + (counts.adapters || 0);
    els.runtimeActivationActions.textContent = String(counts.operatorActions || 0);
    els.runtimeActivationBlocked.textContent = String(counts.blockedSteps || 0);
    const steps = report.steps || [];
    if (steps.length === 0) {
      els.runtimeActivationStepList.replaceChildren(emptyItem('No runtime activation plan.'));
    } else {
      els.runtimeActivationStepList.replaceChildren(...steps.map((step) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = label(step.kind) + ' - ' + step.title + ' - ' + label(step.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = step.detail;
        const affects = document.createElement('div');
        affects.className = 'run-meta';
        affects.textContent = [
          t('Affects') + ': ' + listSummary([...(step.affectsEngines || []), ...(step.affectsProfiles || [])]),
          t('Blocked templates') + ': ' + listSummary(step.affectsTemplates || [])
        ].join(' - ');
        item.append(title, detail, affects);
        const envEntries = Object.entries(step.environment || {});
        if (envEntries.length > 0) {
          const env = document.createElement('p');
          env.className = 'muted';
          env.textContent = t('Environment') + ': ' + envEntries.map(([key, value]) => key + '=' + value).join(' | ');
          item.append(env);
        }
        const acceptance = document.createElement('p');
        acceptance.className = 'muted';
        acceptance.textContent = t('Acceptance') + ': ' + listSummary(step.acceptanceCriteria || []);
        const gates = document.createElement('p');
        gates.className = 'muted';
        gates.textContent = t('Gates') + ': ' + listSummary(step.safetyControls || []);
        item.append(acceptance, gates);
        return item;
      }));
    }
    const profiles = report.profiles || [];
    if (profiles.length === 0) {
      els.runtimeActivationProfileList.replaceChildren(emptyItem('No runtime activation profiles.'));
    } else {
      els.runtimeActivationProfileList.replaceChildren(...profiles.map((profile) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = profile.name + ' - ' + label(profile.status);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [
          profile.id,
          'runner=' + profile.runner,
          'available=' + yesNo(profile.available),
          t('Runnable templates') + '=' + (profile.runnableTemplates || []).length,
          t('Blocked templates') + '=' + (profile.blockedTemplates || []).length
        ].join(' - ');
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = t('Next action') + ': ' + profile.nextAction;
        item.append(title, meta, detail);
        return item;
      }));
    }
    els.runtimeActivationOrderList.replaceChildren(...listItems(report.recommendedOrder || [], 'No runtime activation order.'));
    applyLanguage();
  }

  function renderToolPlanPreview(preview) {
    state.toolPlanPreview = preview;
    if (!preview) {
      els.scannerPlanStatus.textContent = 'No plan preview';
      els.scannerPlanList.replaceChildren(emptyItem('No plan preview yet.'));
      applyLanguage();
      return;
    }
    els.scannerPlanStatus.textContent = label(preview.status);
    const items = [];
    items.push(planPreviewRow(
      'Plan status',
      preview.tool + ' ' + preview.method + ' ' + preview.target,
      preview.riskLevel + ' - ' + label(preview.status) + (preview.reason ? ' - ' + preview.reason : '')
    ));
    for (const gate of preview.gates || []) {
      items.push(planPreviewRow(
        'Gate',
        gate.gate + ' - ' + label(gate.status),
        gate.reason + (gate.detail ? ' - ' + Object.entries(gate.detail).map(([key, value]) => key + '=' + value).join(', ') : '')
      ));
    }
    if (preview.scanner && preview.scanner.plan) {
      const plan = preview.scanner.plan;
      items.push(planPreviewRow(
        'Command preview',
        plan.command + ' ' + listSummary(plan.args),
        plan.engine + ' - ' + plan.profileId + ' - ' + plan.runner + ' - timeout=' + plan.timeoutMs + 'ms'
      ));
    }
    items.push(planPreviewRow(
      'Evidence policy',
      preview.evidence.policy,
      'wouldProduce=' + yesNo(preview.evidence.wouldProduce) + (preview.evidence.kind ? ' - kind=' + preview.evidence.kind : '')
    ));
    items.push(planPreviewRow(
      'Audit preview',
      [
        t('Preview writes state') + '=' + yesNo(preview.audit.previewWritesState),
        t('Would record invocation') + '=' + yesNo(preview.audit.wouldRecordInvocation),
        t('Would create approval') + '=' + yesNo(preview.audit.wouldCreateApprovalRequest),
        t('Would consume rate limit') + '=' + yesNo(preview.audit.wouldConsumeRateLimit),
        t('Would execute external process') + '=' + yesNo(preview.audit.wouldExecuteExternalProcess),
        t('Would write evidence') + '=' + yesNo(preview.audit.wouldWriteEvidence)
      ].join(', '),
      preview.generatedAt
    ));
    els.scannerPlanList.replaceChildren(...items);
    applyLanguage();
  }

  function planPreviewRow(titleText, detailText, metaText) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = t(titleText);
    const detail = document.createElement('p');
    detail.className = 'muted';
    detail.textContent = detailText;
    const meta = document.createElement('div');
    meta.className = 'run-meta';
    meta.textContent = metaText;
    item.append(title, detail, meta);
    return item;
  }

  function renderToolboxBundles(bundles) {
    state.toolboxBundles = bundles || [];
    els.toolboxBundleCount.textContent = state.toolboxBundles.length + ' bundles';
    if (state.toolboxBundles.length === 0) {
      els.toolboxBundleList.replaceChildren(emptyItem('No toolbox bundles loaded.'));
      return;
    }
    els.toolboxBundleList.replaceChildren(...state.toolboxBundles.map((bundle) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = bundle.name + ' - ' + label(bundle.runtimeStatus || bundle.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = bundle.id + ' - v' + bundle.version + ' - ' + t('Source') + ': ' + label(bundle.source);
      const runtime = document.createElement('div');
      runtime.className = 'run-meta';
      runtime.textContent =
        t('Runnable templates') + ': ' + (bundle.runnableTemplateCount || 0) + '/' + (bundle.templateCount || 0);
      const profiles = document.createElement('div');
      profiles.className = 'run-meta';
      profiles.textContent = t('Bundle profiles') + ': ' + listSummary(bundle.profileIds);
      const engines = document.createElement('div');
      engines.className = 'run-meta';
      engines.textContent = t('Engines') + ': ' + listSummary(bundle.engines);
      const risks = document.createElement('div');
      risks.className = 'run-meta';
      risks.textContent = t('Risk levels') + ': ' + listSummary(bundle.riskLevels);
      const useCases = document.createElement('p');
      useCases.className = 'muted';
      useCases.textContent = t('Commercial use cases') + ': ' + listSummary(bundle.commercialUseCases);
      const safety = document.createElement('p');
      safety.className = 'muted';
      safety.textContent = t('Safety notes') + ': ' + listSummary(bundle.safetyNotes);
      const install = document.createElement('p');
      install.className = 'muted';
      install.textContent = t('Installation notes') + ': ' + listSummary(bundle.installationNotes);
      item.append(title, meta, runtime, profiles, engines, risks, useCases, safety, install);
      if (bundle.blockedReasons && bundle.blockedReasons.length > 0) {
        const blocked = document.createElement('p');
        blocked.className = 'muted';
        blocked.textContent = t('Blocked reasons') + ': ' + listSummary(bundle.blockedReasons);
        item.append(blocked);
      }
      if (state.activeRunId) {
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        if (bundle.enabled) {
          const enabled = document.createElement('span');
          enabled.className = 'status-pill';
          enabled.textContent = 'Enabled';
          actions.append(enabled);
        } else {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Enable Bundle';
          button.disabled = state.busy;
          button.addEventListener('click', () => enableToolboxBundle(bundle.id));
          actions.append(button);
        }
        item.append(actions);
      }
      return item;
    }));
  }

  async function enableToolboxBundle(bundleId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/toolbox-bundles/' + encodeURIComponent(bundleId) + '/enable', {
        method: 'POST'
      });
      showMessage('Toolbox bundle enabled.');
      await refreshToolboxBundles();
      await refreshEcosystemCoverage();
    });
  }

  function renderEcosystemCoverage(report) {
    state.ecosystemCoverage = report;
    if (!report) {
      els.ecosystemCoverageStatus.textContent = '0%';
      els.ecosystemCoverageSummary.textContent = 'Create or select a run to inspect governed ecosystem coverage.';
      els.ecosystemMappedTools.textContent = '0/0';
      els.ecosystemEnabledConnectors.textContent = '0/0';
      els.ecosystemEnabledBundles.textContent = '0/0';
      els.ecosystemCapabilityAreas.textContent = '0/0';
      els.ecosystemAreaList.replaceChildren(emptyItem('No ecosystem coverage yet.'));
      els.ecosystemGapList.replaceChildren(emptyItem('No ecosystem gaps.'));
      els.ecosystemActionList.replaceChildren(emptyItem('No ecosystem actions.'));
      return;
    }
    const counts = report.counts || {};
    els.ecosystemCoverageStatus.textContent = (counts.averageConnectorCoverage || 0) + '%';
    els.ecosystemCoverageSummary.textContent = report.summary || '';
    els.ecosystemMappedTools.textContent = (counts.mappedConnectorTools || 0) + '/' + (counts.connectorTools || 0);
    els.ecosystemEnabledConnectors.textContent = (counts.enabledConnectors || 0) + '/' + (counts.connectors || 0);
    els.ecosystemEnabledBundles.textContent = (counts.enabledToolboxBundles || 0) + '/' + (counts.toolboxBundles || 0);
    els.ecosystemCapabilityAreas.textContent = (counts.availableCapabilityAreas || 0) + '/' + (counts.capabilityAreas || 0);
    const areas = report.areas || [];
    if (areas.length === 0) {
      els.ecosystemAreaList.replaceChildren(emptyItem('No ecosystem coverage yet.'));
    } else {
      els.ecosystemAreaList.replaceChildren(...areas.map((area) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = area.name + ' - ' + label(area.status);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent =
          'tools=' + area.highLevelTools +
          ' templates=' + area.scannerTemplates +
          ' connectorTools=' + area.connectorTools +
          ' unmapped=' + area.unmappedTools;
        item.append(title, meta);
        if (area.gaps && area.gaps.length > 0) {
          const gap = document.createElement('p');
          gap.className = 'muted';
          gap.textContent = area.gaps.slice(0, 2).join(' | ');
          item.append(gap);
        }
        return item;
      }));
    }
    const gaps = report.gaps || [];
    if (gaps.length === 0) {
      els.ecosystemGapList.replaceChildren(emptyItem('No ecosystem gaps.'));
    } else {
      els.ecosystemGapList.replaceChildren(...gaps.slice(0, 8).map((gap) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = gap.toolName + ' - ' + label(gap.proposedTarget);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = gap.occurrences + ' connector(s) - ' + listSummary(gap.connectorIds);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = gap.rationale;
        item.append(title, meta, detail);
        return item;
      }));
    }
    els.ecosystemActionList.replaceChildren(...listItems(report.recommendedActions || [], 'No ecosystem actions.'));
  }

  function renderToolIntegrationBacklog(report) {
    state.toolIntegrationBacklog = report;
    if (!report) {
      els.toolBacklogCount.textContent = '0 items';
      els.toolBacklogSummary.textContent = 'Create or select a run to inspect governed tool integration backlog.';
      els.toolBacklogScanners.textContent = '0';
      els.toolBacklogRuntimes.textContent = '0';
      els.toolBacklogSkills.textContent = '0';
      els.toolBacklogPriority.textContent = '0';
      els.toolBacklogList.replaceChildren(emptyItem('No tool integration backlog yet.'));
      els.toolBacklogActionList.replaceChildren(emptyItem('No tool integration actions.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.toolBacklogCount.textContent = (counts.items || 0) + ' items';
    els.toolBacklogSummary.textContent = report.summary || '';
    els.toolBacklogScanners.textContent = String(counts.scannerTemplateCandidates || 0);
    els.toolBacklogRuntimes.textContent = String(counts.runtimeProfileCandidates || 0);
    els.toolBacklogSkills.textContent = String(counts.domainSkillCandidates || 0);
    els.toolBacklogPriority.textContent = String((counts.critical || 0) + (counts.high || 0));
    const items = report.items || [];
    if (items.length === 0) {
      els.toolBacklogList.replaceChildren(emptyItem('No tool integration backlog yet.'));
    } else {
      els.toolBacklogList.replaceChildren(...items.slice(0, 10).map((entry) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = label(entry.priority) + ' - ' + entry.title + ' - ' + label(entry.status);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [
          label(entry.source),
          label(entry.proposedArtifact.type),
          entry.proposedArtifact.id,
          entry.suggestedRiskLevel
        ].join(' - ');
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = entry.rationale;
        const criteria = document.createElement('p');
        criteria.className = 'muted';
        criteria.textContent = t('Acceptance') + ': ' + listSummary(entry.acceptanceCriteria || []);
        item.append(title, meta, detail, criteria);
        if (entry.blockedBy && entry.blockedBy.length > 0) {
          const blocked = document.createElement('p');
          blocked.className = 'muted';
          blocked.textContent = t('Blocked by') + ': ' + listSummary(entry.blockedBy);
          item.append(blocked);
        }
        return item;
      }));
    }
    els.toolBacklogActionList.replaceChildren(...listItems(report.nextActions || [], 'No tool integration actions.'));
    applyLanguage();
  }

  function renderToolEcosystemWorkbench(report) {
    state.toolEcosystemWorkbench = report;
    if (!report) {
      els.toolEcosystemStatus.textContent = 'thin';
      els.toolEcosystemSummary.textContent = 'Create or select a run to inspect commercial tool ecosystem readiness.';
      els.toolEcosystemRunnable.textContent = '0/0';
      els.toolEcosystemMapped.textContent = '0/0';
      els.toolEcosystemPacks.textContent = '0';
      els.toolEcosystemEvidenceLoop.textContent = '0/0';
      els.toolEcosystemLaneList.replaceChildren(emptyItem('No tool ecosystem lanes.'));
      els.toolEcosystemPackList.replaceChildren(emptyItem('No recommended tool packs.'));
      els.toolEcosystemGateList.replaceChildren(emptyItem('No ecosystem gates.'));
      els.toolEcosystemActionList.replaceChildren(emptyItem('No tool ecosystem actions.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.toolEcosystemStatus.textContent = label(report.posture);
    els.toolEcosystemSummary.textContent = report.summary || '';
    els.toolEcosystemRunnable.textContent = (counts.runnableTemplates || 0) + '/' + (counts.scannerTemplates || 0);
    els.toolEcosystemMapped.textContent = (counts.mappedConnectorTools || 0) + '/' + (counts.connectorTools || 0);
    els.toolEcosystemPacks.textContent = String((report.recommendedPacks || []).length);
    els.toolEcosystemEvidenceLoop.textContent = (counts.evidenceProducingInvocations || 0) + '/' + (counts.toolInvocations || 0);

    const lanes = report.lanes || [];
    if (lanes.length === 0) {
      els.toolEcosystemLaneList.replaceChildren(emptyItem('No tool ecosystem lanes.'));
    } else {
      els.toolEcosystemLaneList.replaceChildren(...lanes.map((lane) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = lane.title + ' - ' + label(lane.status);
        const summary = document.createElement('p');
        summary.className = 'muted';
        summary.textContent = lane.summary || '';
        item.append(title, summary);
        if (lane.signals && lane.signals.length > 0) {
          const signals = document.createElement('div');
          signals.className = 'run-meta';
          signals.textContent = t('Signals') + ': ' + listSummary(lane.signals);
          item.append(signals);
        }
        if (lane.gaps && lane.gaps.length > 0) {
          const gaps = document.createElement('p');
          gaps.className = 'muted';
          gaps.textContent = t('Gaps') + ': ' + listSummary(lane.gaps);
          item.append(gaps);
        }
        if (lane.nextActions && lane.nextActions.length > 0) {
          const actions = document.createElement('p');
          actions.className = 'muted';
          actions.textContent = t('Next action') + ': ' + listSummary(lane.nextActions);
          item.append(actions);
        }
        return item;
      }));
    }

    const packs = report.recommendedPacks || [];
    if (packs.length === 0) {
      els.toolEcosystemPackList.replaceChildren(emptyItem('No recommended tool packs.'));
    } else {
      els.toolEcosystemPackList.replaceChildren(...packs.slice(0, 6).map((pack) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = pack.name + ' - ' + label(pack.status);
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [
          label(pack.category),
          t('Executable') + '=' + pack.executable + '/' + pack.total,
          t('Blocked') + '=' + pack.blocked,
          t('Approval required') + '=' + pack.approvalRequired
        ].join(' - ');
        const why = document.createElement('p');
        why.className = 'muted';
        why.textContent = pack.why || '';
        const entrypoint = document.createElement('p');
        entrypoint.className = 'muted';
        entrypoint.textContent = t('Entrypoint') + ': ' + pack.entrypoint;
        item.append(title, meta, why, entrypoint);
        if (pack.commercialUseCases && pack.commercialUseCases.length > 0) {
          const useCases = document.createElement('p');
          useCases.className = 'muted';
          useCases.textContent = t('Commercial use cases') + ': ' + listSummary(pack.commercialUseCases);
          item.append(useCases);
        }
        return item;
      }));
    }

    const gates = report.ecosystemGates || [];
    if (gates.length === 0) {
      els.toolEcosystemGateList.replaceChildren(emptyItem('No ecosystem gates.'));
    } else {
      els.toolEcosystemGateList.replaceChildren(...gates.map((gate) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = gate.title + ' - ' + label(gate.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = gate.detail || '';
        item.append(title, detail);
        return item;
      }));
    }
    els.toolEcosystemActionList.replaceChildren(...listItems(report.operatorNextActions || [], 'No tool ecosystem actions.'));
    applyLanguage();
  }

  function renderConnectors(connectors) {
    state.connectors = connectors || [];
    els.connectorCount.textContent = state.connectors.length + ' connectors';
    if (state.connectors.length === 0) {
      els.connectorList.replaceChildren(emptyItem('No connectors loaded.'));
      return;
    }
    els.connectorList.replaceChildren(...state.connectors.map((connector) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = connector.name + ' - ' + label(connector.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent =
        connector.id + ' - v' + connector.version + ' - ' + t('Connector kind') + ': ' + label(connector.kind);
      const source = document.createElement('div');
      source.className = 'run-meta';
      source.textContent = t('Connector source') + ': ' + label(connector.source);
      const tools = document.createElement('div');
      tools.className = 'run-meta';
      tools.textContent = t('Tools') + ': ' + listSummary(connector.toolNames);
      const risks = document.createElement('div');
      risks.className = 'run-meta';
      risks.textContent = t('Risk levels') + ': ' + listSummary(connector.riskLevels);
      const mapping = connector.capabilityMapping || {};
      const coverage = document.createElement('div');
      coverage.className = 'run-meta';
      coverage.textContent = t('Connector coverage') + ': ' + (mapping.coveragePercent || 0) + '%';
      const highLevelTools = document.createElement('p');
      highLevelTools.className = 'muted';
      highLevelTools.textContent = t('Mapped high-level tools') + ': ' + listSummary(mapping.highLevelTools);
      const templates = document.createElement('p');
      templates.className = 'muted';
      templates.textContent = t('Mapped templates') + ': ' + listSummary(mapping.templateIds);
      const packs = document.createElement('p');
      packs.className = 'muted';
      packs.textContent = t('Mapped tool packs') + ': ' + listSummary(mapping.toolPackIds);
      const unmapped = document.createElement('p');
      unmapped.className = 'muted';
      unmapped.textContent = t('Unmapped tools') + ': ' + listSummary(mapping.unmappedToolNames);
      const inputs = document.createElement('p');
      inputs.className = 'muted';
      inputs.textContent = t('Input policy') + ': ' + listSummary(connector.inputKinds);
      const evidence = document.createElement('p');
      evidence.className = 'muted';
      evidence.textContent = t('Evidence kinds') + ': ' + listSummary((connector.evidenceKinds || []).map(label));
      const env = document.createElement('p');
      env.className = 'muted';
      env.textContent = t('Required env') + ': ' + listSummary(connector.requiredEnv);
      const useCases = document.createElement('p');
      useCases.className = 'muted';
      useCases.textContent = t('Commercial use cases') + ': ' + listSummary(connector.commercialUseCases);
      const safety = document.createElement('p');
      safety.className = 'muted';
      safety.textContent = t('Safety notes') + ': ' + listSummary(connector.safetyNotes);
      const install = document.createElement('p');
      install.className = 'muted';
      install.textContent = t('Installation notes') + ': ' + listSummary(connector.installationNotes);
      item.append(title, meta, source, tools, risks, coverage, highLevelTools, templates, packs, unmapped, inputs, evidence, env, useCases, safety, install);
      if (mapping.notes && mapping.notes.length > 0) {
        const notes = document.createElement('p');
        notes.className = 'muted';
        notes.textContent = t('Mapping notes') + ': ' + listSummary(mapping.notes);
        item.append(notes);
      }
      if (state.activeRunId) {
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        if (connector.enabled) {
          const enabled = document.createElement('span');
          enabled.className = 'status-pill';
          enabled.textContent = 'Enabled';
          actions.append(enabled);
        } else {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Enable Connector';
          button.disabled = state.busy;
          button.addEventListener('click', () => enableConnector(connector.id));
          actions.append(button);
        }
        const previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.textContent = 'Preview Connector';
        previewButton.disabled = state.busy || !mapping.templateIds || mapping.templateIds.length === 0;
        previewButton.addEventListener('click', () => previewConnector(connector.id));
        const runButton = document.createElement('button');
        runButton.type = 'button';
        runButton.textContent = 'Run Connector';
        runButton.disabled = state.busy || !mapping.templateIds || mapping.templateIds.length === 0;
        runButton.addEventListener('click', () => invokeConnector(connector.id));
        actions.append(previewButton, runButton);
        item.append(actions);
      }
      return item;
    }));
  }

  async function enableConnector(connectorId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/connectors/' + encodeURIComponent(connectorId) + '/enable', {
        method: 'POST'
      });
      showMessage('Connector enabled.');
      await refreshConnectors();
      await refreshEcosystemCoverage();
    });
  }

  async function previewConnector(connectorId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      const preview = await api('/runs/' + encodeURIComponent(state.activeRunId) + '/connectors/' + encodeURIComponent(connectorId) + '/plan', {
        method: 'POST',
        body: {}
      });
      renderConnectorPlanPreview(preview);
      showMessage('Connector plan ready.');
    });
  }

  async function invokeConnector(connectorId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/connectors/' + encodeURIComponent(connectorId) + '/invoke', {
        method: 'POST',
        body: {}
      });
      renderConnectorPlanPreview(null);
      showMessage('Connector run completed.');
      await refreshRuns();
    });
  }

  function renderConnectorPlanPreview(preview) {
    state.connectorPlanPreview = preview;
    if (!preview) {
      els.connectorPlanList.replaceChildren(emptyItem('No connector plan yet.'));
      applyLanguage();
      return;
    }
    const rows = [
      planPreviewRow(
        preview.connector.name,
        preview.connector.kind + ' - ' + preview.connector.id,
        t('Connector coverage') + ': ' + (preview.connector.capabilityMapping ? preview.connector.capabilityMapping.coveragePercent : 0) + '%'
      ),
      planPreviewRow(
        'Plan status',
        [
          t('Executable') + '=' + preview.summary.executable,
          t('Blocked') + '=' + preview.summary.blocked,
          t('Approval required') + '=' + preview.summary.approvalRequired
        ].join(' - '),
        preview.generatedAt
      ),
      planPreviewRow(
        'Audit preview',
        [
          t('Preview writes state') + '=' + yesNo(preview.audit.previewWritesState),
          t('Would invoke connector') + '=' + yesNo(preview.audit.invokesConnector),
          t('Would invoke tools') + '=' + yesNo(preview.audit.invokesTools),
          t('Would write evidence') + '=' + yesNo(preview.audit.writesEvidence)
        ].join(', '),
        preview.target
      )
    ];
    for (const item of preview.items || []) {
      rows.push(planPreviewRow(
        item.template.name,
        item.preview.tool + ' ' + item.preview.riskLevel + ' - ' + label(item.preview.status) + (item.preview.reason ? ' - ' + item.preview.reason : ''),
        item.template.id + ' - ' + item.template.engine + ' - ' + item.template.profileId
      ));
    }
    els.connectorPlanList.replaceChildren(...rows);
    applyLanguage();
  }

  function renderConnectorRuns(runs) {
    const items = runs || [];
    if (items.length === 0) {
      els.connectorRunList.replaceChildren(emptyItem('No connector runs.'));
      return;
    }
    els.connectorRunList.replaceChildren(...items.map((run) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = run.connectorId + ' - ' + label(run.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent =
        run.allowed + '/' + run.total + ' allowed - blocked=' + run.blocked + ' - approvals=' + run.approvalRequired;
      const evidence = document.createElement('p');
      evidence.className = 'muted';
      evidence.textContent = t('Evidence') + ': ' + listSummary(run.evidenceIds);
      item.append(title, meta, evidence);
      if (run.items && run.items.length > 0) {
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = run.items
          .slice(0, 6)
          .map((entry) => entry.templateId + ':' + entry.status)
          .join(' | ');
        item.append(detail);
      }
      return item;
    }));
  }

  function renderToolboxProfiles(profiles) {
    state.toolboxProfiles = profiles || [];
    els.toolboxProfileCount.textContent = state.toolboxProfiles.length + ' profiles';
    if (state.toolboxProfiles.length === 0) {
      els.toolboxProfileList.replaceChildren(emptyItem('No toolbox profiles loaded.'));
      return;
    }
    els.toolboxProfileList.replaceChildren(...state.toolboxProfiles.map((profile) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = profile.name + ' - ' + label(profile.runtimeStatus || profile.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = label(profile.kind) + ' - ' + label(profile.isolation) + ' - ' + profile.id;
      const runtime = document.createElement('div');
      runtime.className = 'run-meta';
      runtime.textContent = t('Execution runtime') + ': ' + label(profile.runner || 'none') + ' - ' + (profile.available ? t('Ready') : t('Unavailable'));
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = profile.description;
      item.append(title, meta, runtime, detail);
      if (profile.image) {
        const image = document.createElement('p');
        image.className = 'muted';
        image.textContent = t('Image') + ': ' + profile.image;
        item.append(image);
      }
      if (profile.reason) {
        const reason = document.createElement('p');
        reason.className = 'muted';
        reason.textContent = t('Reason') + ': ' + profile.reason;
        item.append(reason);
      }
      if (profile.commands && profile.commands.length > 0) {
        const commands = document.createElement('p');
        commands.className = 'muted';
        commands.textContent = profile.commands.join(', ');
        item.append(commands);
      }
      return item;
    }));
  }

  function renderCapabilities(capabilities) {
    state.capabilities = capabilities || [];
    els.capabilityCount.textContent = state.capabilities.length + ' areas';
    if (state.capabilities.length === 0) {
      els.capabilityList.replaceChildren(emptyItem('No capabilities loaded.'));
      return;
    }
    els.capabilityList.replaceChildren(...state.capabilities.map((capability) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = capability.name + ' - ' + label(capability.area) + ' - ' + label(capability.status);
      const tools = document.createElement('div');
      tools.className = 'run-meta';
      tools.textContent = t('High-level tools') + ': ' + listSummary(capability.highLevelTools);
      const templates = document.createElement('div');
      templates.className = 'run-meta';
      templates.textContent = t('Scanner templates') + ': ' + listSummary(capability.scannerTemplates);
      const profiles = document.createElement('div');
      profiles.className = 'run-meta';
      profiles.textContent = t('Profiles') + ': ' + listSummary(capability.profiles);
      const engines = document.createElement('div');
      engines.className = 'run-meta';
      engines.textContent = t('Engines') + ': ' + listSummary(capability.engines);
      const evidence = document.createElement('div');
      evidence.className = 'run-meta';
      evidence.textContent = t('Evidence kinds') + ': ' + listSummary((capability.evidenceKinds || []).map(label));
      const risks = document.createElement('div');
      risks.className = 'run-meta';
      risks.textContent = t('Risk levels') + ': ' + listSummary(capability.riskLevels);
      const controls = document.createElement('p');
      controls.className = 'muted';
      controls.textContent = t('Safety controls') + ': ' + listSummary(capability.safetyControls);
      const gaps = document.createElement('p');
      gaps.className = 'muted';
      gaps.textContent = t('Gaps') + ': ' + listSummary(capability.gaps);
      item.append(title, tools, templates, profiles, engines, evidence, risks, controls, gaps);
      return item;
    }));
  }

  function renderProgramScopeImports(imports) {
    els.programScopeForm.querySelector('button[type="submit"]').disabled = state.busy || !state.token;
    els.programScopeCount.textContent = imports.length + ' imports';
    if (!imports || imports.length === 0) {
      els.programScopeList.replaceChildren(emptyItem('No program scopes imported.'));
      return;
    }
    els.programScopeList.replaceChildren(...imports.slice(0, 6).map((item) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = item.source + ' - ' + label(item.format);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = [
        t('Allowed assets') + '=' + item.allowedAssetCount,
        t('Denied assets') + '=' + item.deniedAssetCount,
        t('Rate limit') + '=' + item.requestsPerMinute + '/min'
      ].join(' - ');
      const defaultTarget = document.createElement('p');
      defaultTarget.className = 'muted';
      defaultTarget.textContent = item.defaultTarget || '';
      row.append(title, meta, defaultTarget);
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const applyButton = document.createElement('button');
      applyButton.type = 'button';
      applyButton.textContent = 'Apply to New Run';
      applyButton.addEventListener('click', () => {
        applyProgramScopeToRunForm(item);
        showMessage('Program scope applied.');
      });
      actions.append(applyButton);
      row.append(actions);
      return row;
    }));
  }

  function renderDomainSkills(skills) {
    state.domainSkills = skills || [];
    els.domainSkillCount.textContent = state.domainSkills.length + ' skills';
    if (state.domainSkills.length === 0) {
      els.domainSkillList.replaceChildren(emptyItem('No domain skills loaded.'));
      return;
    }
    els.domainSkillList.replaceChildren(...state.domainSkills.map((skill) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = skill.name + ' - ' + label(skill.category) + ' - ' + label(skill.status);
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = skill.description;
      const useCases = document.createElement('div');
      useCases.className = 'run-meta';
      useCases.textContent = t('Use cases') + ': ' + (skill.rigidUseCases || []).join(', ');
      const notFor = document.createElement('div');
      notFor.className = 'run-meta';
      notFor.textContent = t('Not for') + ': ' + (skill.excludedUseCases || []).join(', ');
      const requires = document.createElement('div');
      requires.className = 'run-meta';
      const profiles = skill.requiredToolboxProfiles && skill.requiredToolboxProfiles.length > 0 ? skill.requiredToolboxProfiles.join(', ') : t('No external profile');
      requires.textContent = t('Requires') + ': ' + profiles;
      item.append(title, detail, useCases, notFor, requires);
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = skill.enabled ? 'Enabled' : 'Enable Skill';
      button.disabled = state.busy || !state.activeRunId || skill.enabled;
      button.addEventListener('click', () => enableDomainSkill(skill.id));
      actions.append(button);
      item.append(actions);
      return item;
    }));
  }

  function renderDomainSkillReadiness(report) {
    state.domainSkillReadiness = report;
    if (!report) {
      els.domainSkillReadinessStatus.textContent = 'needs_input';
      els.domainSkillReadinessSummary.textContent = 'Create or select a run to inspect rigid domain Skill readiness.';
      els.domainSkillReadinessReady.textContent = '0';
      els.domainSkillReadinessEnabled.textContent = '0/0';
      els.domainSkillReadinessArtifacts.textContent = '0';
      els.domainSkillReadinessReviewed.textContent = '0/0';
      els.domainSkillReadinessList.replaceChildren(emptyItem('No Domain Skill readiness report.'));
      els.domainSkillGateList.replaceChildren(emptyItem('No Skill gates.'));
      els.domainSkillActionList.replaceChildren(emptyItem('No Skill actions.'));
      applyLanguage();
      return;
    }
    const counts = report.counts || {};
    els.domainSkillReadinessStatus.textContent = label(report.posture || 'needs_input');
    els.domainSkillReadinessSummary.textContent = report.summary || '';
    els.domainSkillReadinessReady.textContent = String((counts.ready || 0) + (counts.usable || 0));
    els.domainSkillReadinessEnabled.textContent = (counts.enabledSkills || 0) + '/' + (counts.skills || 0);
    els.domainSkillReadinessArtifacts.textContent = String(counts.domainArtifacts || 0);
    els.domainSkillReadinessReviewed.textContent = (counts.reviewedEvidence || 0) + '/' + (counts.domainEvidence || 0);

    const domains = report.domains || [];
    if (domains.length === 0) {
      els.domainSkillReadinessList.replaceChildren(emptyItem('No Domain Skill readiness report.'));
    } else {
      els.domainSkillReadinessList.replaceChildren(...domains.map((domain) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = domain.title + ' - ' + label(domain.posture) + (domain.enabled ? ' - ' + t('Enabled') : '');
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = [
          domain.skillId,
          t('Category') + '=' + label(domain.category),
          t('Skill status') + '=' + label(domain.skillStatus)
        ].join(' - ');
        const summary = document.createElement('p');
        summary.className = 'muted';
        summary.textContent = domain.summary || '';
        item.append(title, meta, summary);

        const inputs = domain.inputs || [];
        if (inputs.length > 0) {
          const inputLine = document.createElement('p');
          inputLine.className = 'muted';
          inputLine.textContent = t('Inputs') + ': ' + inputs
            .map((entry) => entry.title + '=' + entry.count + '/' + label(entry.status))
            .join(' | ');
          item.append(inputLine);
        }
        if (domain.evidenceRequirements && domain.evidenceRequirements.length > 0) {
          const reqs = document.createElement('p');
          reqs.className = 'muted';
          reqs.textContent = t('Evidence requirements') + ': ' + listSummary(domain.evidenceRequirements);
          item.append(reqs);
        }
        if (domain.nextActions && domain.nextActions.length > 0) {
          const actionsLine = document.createElement('p');
          actionsLine.className = 'muted';
          actionsLine.textContent = t('Next action') + ': ' + listSummary(domain.nextActions);
          item.append(actionsLine);
        }
        const handoff = document.createElement('p');
        handoff.className = 'muted';
        handoff.textContent = t('Worker handoff') + ': ' + listSummary(domain.workerHandoff || []);
        item.append(handoff);

        const actions = document.createElement('div');
        actions.className = 'item-actions';
        if (!domain.enabled) {
          const enableButton = document.createElement('button');
          enableButton.type = 'button';
          enableButton.textContent = 'Enable Skill';
          enableButton.disabled = state.busy || !state.activeRunId || domain.skillStatus === 'planned';
          enableButton.addEventListener('click', () => enableDomainSkill(domain.skillId));
          actions.append(enableButton);
        }
        if (actions.childNodes.length > 0) {
          item.append(actions);
        }
        return item;
      }));
    }

    const gates = report.gates || [];
    if (gates.length === 0) {
      els.domainSkillGateList.replaceChildren(emptyItem('No Skill gates.'));
    } else {
      els.domainSkillGateList.replaceChildren(...gates.map((gate) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = gate.title + ' - ' + label(gate.status);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = gate.detail || '';
        item.append(title, detail);
        return item;
      }));
    }
    els.domainSkillActionList.replaceChildren(...listItems(report.operatorNextActions || [], 'No Skill actions.'));
    applyLanguage();
  }

  async function enableDomainSkill(skillId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/skills/' + encodeURIComponent(skillId) + '/enable', {
        method: 'POST'
      });
      showMessage('Domain Skill enabled.');
      await refreshRuns();
    });
  }

  function renderPocTemplates(templates) {
    state.pocTemplates = templates || [];
    els.pocTemplateCount.textContent = state.pocTemplates.length + ' templates';
    if (state.pocTemplates.length === 0) {
      els.pocTemplateList.replaceChildren(emptyItem('No PoC templates loaded.'));
      return;
    }
    els.pocTemplateList.replaceChildren(...state.pocTemplates.map((template) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = template.name + ' - ' + label(template.category) + ' - ' + label(template.status);
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = template.description;
      const classes = document.createElement('div');
      classes.className = 'run-meta';
      classes.textContent = t('Vuln classes') + ': ' + (template.vulnerabilityClasses || []).join(', ');
      const evidence = document.createElement('div');
      evidence.className = 'run-meta';
      evidence.textContent = t('Required evidence') + ': ' + (template.requiredEvidence || []).map(label).join(', ');
      const tools = document.createElement('div');
      tools.className = 'run-meta';
      tools.textContent = t('Recommended tools') + ': ' + (template.recommendedTools || []).join(', ');
      const safety = document.createElement('div');
      safety.className = 'run-meta';
      safety.textContent = t('Safety notes') + ': ' + (template.safetyNotes || []).join(', ');
      item.append(title, detail, classes, evidence, tools, safety);
      if (template.references && template.references.length > 0) {
        const references = document.createElement('p');
        references.className = 'muted';
        references.textContent = t('References') + ': ' + template.references.join(', ');
        item.append(references);
      }
      if (template.tags && template.tags.length > 0) {
        const tags = document.createElement('div');
        tags.className = 'run-meta';
        tags.textContent = t('Tags') + ': ' + template.tags.join(', ');
        item.append(tags);
      }
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = template.enabled ? 'Enabled' : 'Enable Template';
      button.disabled = state.busy || !state.activeRunId || template.enabled;
      button.addEventListener('click', () => enablePocTemplate(template.id));
      actions.append(button);
      item.append(actions);
      return item;
    }));
  }

  async function enablePocTemplate(templateId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/poc-templates/' + encodeURIComponent(templateId) + '/enable', {
        method: 'POST'
      });
      showMessage('PoC template enabled.');
      await refreshRuns();
    });
  }

  function renderStrategy(strategy) {
    state.strategy = strategy;
    if (!strategy) {
      els.strategyCount.textContent = '0 recommendations';
      els.strategySummary.textContent = 'Create or select a run to inspect autonomous strategy.';
      els.strategyList.replaceChildren(emptyItem('No recommendations yet.'));
      renderStrategyPlanPreview(null);
      els.strategyHints.replaceChildren(emptyItem('No worker hints.'));
      return;
    }
    const recommendations = strategy.recommendations || [];
    els.strategyCount.textContent = recommendations.length + ' recommendations';
    els.strategySummary.textContent = strategy.summary || '';
    if (recommendations.length === 0) {
      els.strategyList.replaceChildren(emptyItem('No recommendations yet.'));
    } else {
      els.strategyList.replaceChildren(...recommendations.map((recommendation) => {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = recommendation.title + ' - ' + label(recommendation.riskLevel);
        const detail = document.createElement('p');
        detail.className = 'muted';
        detail.textContent = recommendation.rationale;
        item.append(title, detail);
        if (recommendation.toolRequest) {
          const tool = document.createElement('div');
          tool.className = 'run-meta';
          const args = recommendation.toolRequest.args || {};
          const template = args.template ? ' - ' + args.template : '';
          tool.textContent = recommendation.toolRequest.tool + template + ' - ' + recommendation.toolRequest.target;
          item.append(tool);
          const actions = document.createElement('div');
          actions.className = 'inline-actions';
          const previewButton = document.createElement('button');
          previewButton.type = 'button';
          previewButton.textContent = 'Preview recommendation';
          previewButton.disabled = state.busy || !state.activeRunId;
          previewButton.addEventListener('click', () => previewStrategyRecommendation(recommendation.id));
          actions.append(previewButton);
          const queueButton = document.createElement('button');
          queueButton.type = 'button';
          queueButton.textContent = 'Queue for Worker';
          queueButton.disabled = state.busy || !state.activeRunId;
          queueButton.addEventListener('click', () => queueStrategyRecommendation(recommendation.id));
          actions.append(queueButton);
          const runButton = document.createElement('button');
          runButton.type = 'button';
          runButton.textContent = 'Run recommendation';
          runButton.disabled = state.busy || !state.activeRunId;
          runButton.addEventListener('click', () => invokeStrategyRecommendation(recommendation.id));
          actions.append(runButton);
          item.append(actions);
        } else {
          const actions = document.createElement('div');
          actions.className = 'inline-actions';
          const queueButton = document.createElement('button');
          queueButton.type = 'button';
          queueButton.textContent = 'Queue for Worker';
          queueButton.disabled = state.busy || !state.activeRunId;
          queueButton.addEventListener('click', () => queueStrategyRecommendation(recommendation.id));
          actions.append(queueButton);
          item.append(actions);
        }
        return item;
      }));
    }
    els.strategyHints.replaceChildren(...listItems(strategy.workerHints || [], 'No worker hints.'));
  }

  async function previewStrategyRecommendation(recommendationId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      const preview = await api('/runs/' + encodeURIComponent(state.activeRunId) + '/strategy/recommendations/' + encodeURIComponent(recommendationId) + '/plan');
      renderStrategyPlanPreview(preview);
      showMessage('Recommendation preview ready.');
    });
  }

  function renderStrategyPlanPreview(preview) {
    state.strategyPlanPreview = preview;
    if (!preview) {
      els.strategyPlanStatus.textContent = 'No preview';
      els.strategyPlanList.replaceChildren(emptyItem('No recommendation preview yet.'));
      applyLanguage();
      return;
    }
    els.strategyPlanStatus.textContent = label(preview.status);
    const items = [];
    items.push(planPreviewRow(
      'Plan status',
      preview.tool + ' ' + preview.method + ' ' + preview.target,
      preview.riskLevel + ' - ' + label(preview.status) + (preview.reason ? ' - ' + preview.reason : '')
    ));
    for (const gate of preview.gates || []) {
      items.push(planPreviewRow(
        'Gate',
        gate.gate + ' - ' + label(gate.status),
        gate.reason + (gate.detail ? ' - ' + Object.entries(gate.detail).map(([key, value]) => key + '=' + value).join(', ') : '')
      ));
    }
    if (preview.scanner && preview.scanner.plan) {
      const plan = preview.scanner.plan;
      items.push(planPreviewRow(
        'Command preview',
        plan.command + ' ' + listSummary(plan.args),
        plan.engine + ' - ' + plan.profileId + ' - ' + plan.runner + ' - timeout=' + plan.timeoutMs + 'ms'
      ));
    }
    items.push(planPreviewRow(
      'Evidence policy',
      preview.evidence.policy,
      'wouldProduce=' + yesNo(preview.evidence.wouldProduce) + (preview.evidence.kind ? ' - kind=' + preview.evidence.kind : '')
    ));
    items.push(planPreviewRow(
      'Audit preview',
      [
        t('Preview writes state') + '=' + yesNo(preview.audit.previewWritesState),
        t('Would create approval') + '=' + yesNo(preview.audit.wouldCreateApprovalRequest),
        t('Would consume rate limit') + '=' + yesNo(preview.audit.wouldConsumeRateLimit),
        t('Would execute external process') + '=' + yesNo(preview.audit.wouldExecuteExternalProcess),
        t('Would write evidence') + '=' + yesNo(preview.audit.wouldWriteEvidence)
      ].join(', '),
      preview.generatedAt
    ));
    els.strategyPlanList.replaceChildren(...items);
    applyLanguage();
  }

  async function invokeStrategyRecommendation(recommendationId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/strategy/recommendations/' + encodeURIComponent(recommendationId) + '/invoke', {
        method: 'POST'
      });
      showMessage('Recommendation executed.');
      await refreshRuns();
    });
  }

  async function queueStrategyRecommendation(recommendationId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/strategy/recommendations/' + encodeURIComponent(recommendationId) + '/intent', {
        method: 'POST'
      });
      showMessage('Recommendation queued for Worker.');
      await refreshRuns();
    });
  }

  function renderFlow(flow) {
    state.flow = flow;
    if (!flow) {
      els.flowPhase.textContent = 'Idle';
      els.flowSummary.textContent = 'Create or select a run to inspect reasoning flow.';
      els.flowStepList.replaceChildren(emptyItem('No assessment flow yet.'));
      els.flowNextList.replaceChildren(emptyItem('No next actions.'));
      els.flowRiskList.replaceChildren(emptyItem('No risk notes.'));
      return;
    }
    els.flowPhase.textContent = label(flow.phase);
    els.flowSummary.textContent = flowSummary(flow);
    if (!flow.steps || flow.steps.length === 0) {
      els.flowStepList.replaceChildren(emptyItem('No assessment flow yet.'));
    } else {
      els.flowStepList.replaceChildren(...flow.steps.slice(-12).map((step, index) => flowStepItem(step, index + 1)));
    }
    els.flowNextList.replaceChildren(...listItems(flow.nextActions || [], 'No next actions.'));
    els.flowRiskList.replaceChildren(...listItems(flow.riskNotes || [], 'No risk notes.'));
  }

  function renderAttackSurface(surface) {
    state.surface = surface;
    if (!surface) {
      els.surfaceCount.textContent = '0 assets';
      els.surfaceSummary.textContent = 'Create or select a run to inspect attack surface.';
      els.surfaceAssetsMetric.textContent = '0';
      els.surfaceEndpointsMetric.textContent = '0';
      els.surfaceTechMetric.textContent = '0';
      els.surfaceBlockersMetric.textContent = '0';
      els.surfaceAssetList.replaceChildren(emptyItem('No assets mapped.'));
      els.surfaceEndpointList.replaceChildren(emptyItem('No endpoints observed.'));
      els.surfaceTechList.replaceChildren(emptyItem('No technology signals.'));
      els.surfaceFrontierList.replaceChildren(emptyItem('No frontier items.'));
      renderSurfaceFrontierPlanPreview(null);
      els.surfaceBlockerList.replaceChildren(emptyItem('No blockers.'));
      return;
    }
    const counts = surface.counts || {};
    els.surfaceCount.textContent = (counts.assets || 0) + ' assets';
    els.surfaceSummary.textContent = surface.summary || '';
    els.surfaceAssetsMetric.textContent = String(counts.assets || 0);
    els.surfaceEndpointsMetric.textContent = String(counts.endpoints || 0);
    els.surfaceTechMetric.textContent = String((surface.technologies || []).length);
    els.surfaceBlockersMetric.textContent = String(counts.blockers || 0);
    els.surfaceAssetList.replaceChildren(...surfaceItems(surface.assets || [], 'No assets mapped.', surfaceAssetItem));
    els.surfaceEndpointList.replaceChildren(...surfaceItems(surface.endpoints || [], 'No endpoints observed.', surfaceEndpointItem));
    els.surfaceTechList.replaceChildren(...listItems(surface.technologies || [], 'No technology signals.'));
    els.surfaceFrontierList.replaceChildren(...surfaceItems(surface.frontier || [], 'No frontier items.', surfaceFrontierItem));
    els.surfaceBlockerList.replaceChildren(...listItems(surface.blockers || [], 'No blockers.'));
  }

  function renderSurfaceFrontierPlanPreview(preview) {
    state.surfaceFrontierPlanPreview = preview;
    if (!preview) {
      els.surfaceFrontierPlanStatus.textContent = 'No preview';
      els.surfaceFrontierPlanList.replaceChildren(emptyItem('No frontier preview yet.'));
      applyLanguage();
      return;
    }
    els.surfaceFrontierPlanStatus.textContent = label(preview.status);
    const items = [];
    items.push(planPreviewRow(
      'Plan status',
      preview.tool + ' ' + preview.method + ' ' + preview.target,
      preview.riskLevel + ' - ' + label(preview.status) + (preview.reason ? ' - ' + preview.reason : '')
    ));
    for (const gate of preview.gates || []) {
      items.push(planPreviewRow(
        'Gate',
        gate.gate + ' - ' + label(gate.status),
        gate.reason + (gate.detail ? ' - ' + Object.entries(gate.detail).map(([key, value]) => key + '=' + value).join(', ') : '')
      ));
    }
    if (preview.scanner && preview.scanner.plan) {
      const plan = preview.scanner.plan;
      items.push(planPreviewRow(
        'Command preview',
        plan.command + ' ' + listSummary(plan.args),
        plan.engine + ' - ' + plan.profileId + ' - ' + plan.runner + ' - timeout=' + plan.timeoutMs + 'ms'
      ));
    }
    items.push(planPreviewRow(
      'Evidence policy',
      preview.evidence.policy,
      'wouldProduce=' + yesNo(preview.evidence.wouldProduce) + (preview.evidence.kind ? ' - kind=' + preview.evidence.kind : '')
    ));
    items.push(planPreviewRow(
      'Audit preview',
      [
        t('Preview writes state') + '=' + yesNo(preview.audit.previewWritesState),
        t('Would create approval') + '=' + yesNo(preview.audit.wouldCreateApprovalRequest),
        t('Would consume rate limit') + '=' + yesNo(preview.audit.wouldConsumeRateLimit),
        t('Would execute external process') + '=' + yesNo(preview.audit.wouldExecuteExternalProcess),
        t('Would write evidence') + '=' + yesNo(preview.audit.wouldWriteEvidence)
      ].join(', '),
      preview.generatedAt
    ));
    els.surfaceFrontierPlanList.replaceChildren(...items);
    applyLanguage();
  }

  async function previewSurfaceFrontier(frontierId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      const preview = await api('/runs/' + encodeURIComponent(state.activeRunId) + '/surface/frontier/' + encodeURIComponent(frontierId) + '/plan');
      renderSurfaceFrontierPlanPreview(preview);
      showMessage('Frontier preview ready.');
    });
  }

  async function invokeSurfaceFrontier(frontierId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/surface/frontier/' + encodeURIComponent(frontierId) + '/invoke', {
        method: 'POST'
      });
      showMessage('Frontier executed.');
      await refreshRuns();
    });
  }

  async function queueSurfaceFrontier(frontierId) {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/surface/frontier/' + encodeURIComponent(frontierId) + '/intent', {
        method: 'POST'
      });
      showMessage('Frontier queued for Worker.');
      await refreshRuns();
    });
  }

  function surfaceItems(items, emptyText, renderer) {
    if (!items || items.length === 0) {
      return [emptyItem(emptyText)];
    }
    return items.slice(0, 12).map(renderer);
  }

  function surfaceAssetItem(asset) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = asset.label;
    const meta = document.createElement('div');
    meta.className = 'run-meta';
    meta.textContent = [label(asset.kind), asset.riskLevel, evidenceCountText(asset.evidenceIds)].filter(Boolean).join(' - ');
    const detail = document.createElement('p');
    detail.className = 'muted';
    detail.textContent = (asset.signals || []).slice(0, 3).join(' · ') || t('Signals') + ': -';
    item.append(title, meta, detail);
    return item;
  }

  function surfaceEndpointItem(endpoint) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = [(endpoint.method || 'GET').toUpperCase(), endpoint.url].join(' ');
    const meta = document.createElement('div');
    meta.className = 'run-meta';
    meta.textContent = [label(endpoint.source), evidenceCountText(endpoint.evidenceIds)].filter(Boolean).join(' - ');
    item.append(title, meta);
    return item;
  }

  function surfaceFrontierItem(frontier) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = frontier.title;
    const meta = document.createElement('div');
    meta.className = 'run-meta';
    meta.textContent = [label(frontier.priority), frontier.riskLevel, label(frontier.source), evidenceCountText(frontier.relatedEvidenceIds)].filter(Boolean).join(' - ');
    const detail = document.createElement('p');
    detail.className = 'muted';
    detail.textContent = frontier.rationale;
    item.append(title, meta, detail);
    if (frontier.suggestedTool || frontier.suggestedTemplate) {
      const suggested = document.createElement('p');
      suggested.className = 'muted';
      suggested.textContent = t('Suggested') + ': ' + [frontier.suggestedTool, frontier.suggestedTemplate].filter(Boolean).join(' / ');
      item.append(suggested);
    }
    const actions = document.createElement('div');
    actions.className = 'inline-actions';
    const queueButton = document.createElement('button');
    queueButton.type = 'button';
    queueButton.textContent = 'Queue frontier';
    queueButton.disabled = state.busy || !state.activeRunId;
    queueButton.addEventListener('click', () => queueSurfaceFrontier(frontier.id));
    actions.append(queueButton);
    if (isExecutableFrontier(frontier)) {
      const previewButton = document.createElement('button');
      previewButton.type = 'button';
      previewButton.textContent = 'Preview frontier';
      previewButton.disabled = state.busy || !state.activeRunId;
      previewButton.addEventListener('click', () => previewSurfaceFrontier(frontier.id));
      actions.append(previewButton);
      const runButton = document.createElement('button');
      runButton.type = 'button';
      runButton.textContent = 'Run frontier';
      runButton.disabled = state.busy || !state.activeRunId;
      runButton.addEventListener('click', () => invokeSurfaceFrontier(frontier.id));
      actions.append(runButton);
    }
    item.append(actions);
    return item;
  }

  function isExecutableFrontier(frontier) {
    if (frontier.suggestedTool === 'scanner.run_template') {
      return Boolean(frontier.suggestedTemplate);
    }
    if (frontier.suggestedTool === 'http.request') {
      return true;
    }
    if (frontier.suggestedTool === 'finding.propose') {
      return Boolean(frontier.relatedEvidenceIds && frontier.relatedEvidenceIds.length > 0);
    }
    return false;
  }

  function evidenceCountText(ids) {
    const count = ids && ids.length ? ids.length : 0;
    return count ? count + ' ' + t('Evidence') : '';
  }

  function flowStepItem(step, index) {
    const item = document.createElement('li');
    const marker = document.createElement('span');
    marker.className = 'flow-index';
    marker.textContent = String(index);
    const content = document.createElement('div');
    content.className = 'flow-content';
    const title = document.createElement('strong');
    title.textContent = step.title;
    const detail = document.createElement('p');
    detail.className = 'muted';
    detail.textContent = step.detail;
    const meta = document.createElement('div');
    meta.className = 'flow-meta';
    const status = document.createElement('span');
    status.className = 'step-status ' + step.status;
    status.textContent = label(step.status);
    const kind = document.createElement('span');
    kind.textContent = label(step.kind);
    meta.append(status, kind);
    if (step.riskLevel) {
      const risk = document.createElement('span');
      risk.textContent = step.riskLevel;
      meta.append(risk);
    }
    content.append(title, detail, meta);
    item.append(marker, content);
    return item;
  }

  function listItems(items, emptyText) {
    if (!items || items.length === 0) {
      return [emptyItem(emptyText)];
    }
    return items.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    });
  }

  function listSummary(items) {
    if (!items || items.length === 0) {
      return '-';
    }
    return items.slice(0, 8).join(', ') + (items.length > 8 ? ' +' + (items.length - 8) : '');
  }

  function flowSummary(flow) {
    if (state.language === 'zh-CN') {
      return '目标：' + flow.goal + '。' + t('Current phase') + '：' + label(flow.phase) + '。';
    }
    return flow.summary;
  }

  function label(value) {
    return t(String(value));
  }

  function yesNo(value) {
    return value ? t('Yes') : t('No');
  }

  function renderFacts(facts) {
    if (facts.length === 0) {
      els.factsList.replaceChildren(emptyItem('No facts recorded.'));
      return;
    }
    els.factsList.replaceChildren(...facts.slice().reverse().map((fact) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = fact.statement;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = fact.confidence + ' - ' + fact.createdBy;
      item.append(title, meta);
      return item;
    }));
  }

  function renderIntents(intents) {
    if (intents.length === 0) {
      els.intentsList.replaceChildren(emptyItem('No intents proposed.'));
      return;
    }
    els.intentsList.replaceChildren(...intents.slice().reverse().map((intent) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = intent.hypothesis;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = intent.status + ' - ' + intent.riskLevel + (intent.claimedBy ? ' - ' + intent.claimedBy : '');
      item.append(title, meta);
      return item;
    }));
  }

  function renderEvents(events) {
    els.eventCount.textContent = events.length + ' events';
    if (events.length === 0) {
      els.eventList.replaceChildren(emptyItem('No timeline events.'));
      return;
    }
    els.eventList.replaceChildren(...events.slice().reverse().map((event) => {
      const item = document.createElement('li');
      item.className = event.level;
      const title = document.createElement('strong');
      title.textContent = event.title + ' - ' + event.type;
      const detail = document.createElement('p');
      detail.textContent = event.detail || event.entityId || '';
      const time = document.createElement('time');
      time.dateTime = event.createdAt;
      time.textContent = new Date(event.createdAt).toLocaleString();
      item.append(title, detail, time);
      return item;
    }));
  }

  function renderReview(review) {
    state.evidenceReviews = review.evidenceReviews || [];
    renderApprovals(review.approvals || []);
    renderToolAudit(review.toolInvocations || []);
    renderEvidence(review.evidence || [], state.evidenceReviews);
    renderBrowserSessions(review.browserSessions || []);
    renderBrowserSnapshots(review.browserSnapshots || []);
    renderOastSessions(review.oastSessions || [], review.oastCallbacks || []);
    renderProxySessions(review.proxySessions || []);
    renderCredentialReferences(review.credentialReferences || []);
    renderAccessReviews(review.accessReviews || []);
    renderAndroidManifestImports(review.androidManifestImports || []);
    renderCloudIamImports(review.cloudIamImports || []);
    renderIdentityGraphImports(review.identityGraphImports || []);
    renderSarifImports(review.sarifImports || []);
    renderCaptureImports(review.captureImports || []);
    renderToolPackRuns(review.toolPackRuns || []);
    renderConnectorRuns(review.connectorRuns || []);
    renderFindings(review.findings || []);
    renderReports(review.reports || []);
    renderRunExports(review.runExports || []);
    els.generateReport.disabled = state.busy || !state.activeRunId || !review.findings || review.findings.length === 0;
    els.simpleReport.disabled = state.busy || !state.activeRunId || !review.findings || review.findings.length === 0;
    els.generateRunExport.disabled = state.busy || !state.activeRunId;
    els.startBrowserSession.disabled = state.busy || !state.activeRunId;
    els.browserNavigateForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.browserSnapshotForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.startOastSession.disabled = state.busy || !state.activeRunId;
    els.startProxySession.disabled = state.busy || !state.activeRunId;
    els.credentialReferenceForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.accessReviewForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.sarifImportForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.androidManifestForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.cloudIamForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.identityGraphForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.httpCaptureForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.harImportForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId;
    els.findingForm.querySelector('button[type="submit"]').disabled = state.busy || !state.activeRunId || !review.evidence || review.evidence.length === 0;
    updateEvidenceReviewControls();
  }

  function renderApprovals(approvals) {
    const pending = approvals.filter((approval) => approval.status === 'pending');
    els.approvalCount.textContent = pending.length + ' pending';
    if (approvals.length === 0) {
      els.approvalList.replaceChildren(emptyItem('No approvals waiting.'));
      return;
    }
    els.approvalList.replaceChildren(...approvals.map((approval) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = approval.tool + ' - ' + approval.status;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = approval.riskLevel + ' - ' + approval.target;
      const reason = document.createElement('p');
      reason.className = 'muted';
      reason.textContent = approval.reason;
      item.append(title, meta, reason);
      if (approval.status === 'pending') {
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        actions.append(decisionButton(approval.id, 'approved'), decisionButton(approval.id, 'rejected'));
        item.append(actions);
      }
      return item;
    }));
  }

  function decisionButton(approvalId, status) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = status === 'approved' ? 'Approve' : 'Reject';
    button.addEventListener('click', () => decideApproval(approvalId, status));
    return button;
  }

  async function decideApproval(approvalId, status) {
    await withBusy(async () => {
      await api('/approvals/' + encodeURIComponent(approvalId) + '/decision', {
        method: 'POST',
        body: { status }
      });
      showMessage('Approval ' + status + '.');
      await refreshRuns();
    });
  }

  async function decideFinding(findingId, validationState) {
    await withBusy(async () => {
      await api('/findings/' + encodeURIComponent(findingId) + '/validation', {
        method: 'POST',
        body: {
          validationState,
          reviewer: 'operator',
          note:
            validationState === 'confirmed'
              ? 'Operator confirmed impact after useful evidence review.'
              : 'Operator rejected candidate during human review.'
        }
      });
      showMessage(validationState === 'confirmed' ? 'Finding confirmed.' : 'Finding rejected.');
      await refreshRuns();
    });
  }

  function renderToolAudit(toolInvocations) {
    els.toolCount.textContent = toolInvocations.length + ' calls';
    if (toolInvocations.length === 0) {
      els.toolList.replaceChildren(emptyItem('No tool calls recorded.'));
      return;
    }
    els.toolList.replaceChildren(...toolInvocations.slice(0, 12).map((tool) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = tool.tool + ' - ' + tool.status;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = tool.riskLevel + ' - ' + tool.method + ' - ' + tool.target;
      item.append(title, meta);
      if (tool.exitCode !== undefined || tool.timedOut !== undefined) {
        const execution = document.createElement('div');
        execution.className = 'run-meta';
        execution.textContent = 'exit=' + (tool.exitCode === undefined || tool.exitCode === null ? 'n/a' : tool.exitCode) + ' - timedOut=' + Boolean(tool.timedOut);
        item.append(execution);
      }
      if (tool.reason) {
        const reason = document.createElement('p');
        reason.className = 'muted';
        reason.textContent = tool.reason;
        item.append(reason);
      }
      return item;
    }));
  }

  function renderEvidence(evidence, evidenceReviews = []) {
    els.evidenceCount.textContent = evidence.length + ' items';
    if (evidence.length === 0) {
      els.evidenceList.replaceChildren(emptyItem('No evidence imported.'));
      renderEvidenceViewer(null);
      return;
    }
    const reviewsByEvidence = new Map(evidenceReviews.map((review) => [review.evidenceId, review]));
    els.evidenceList.replaceChildren(...evidence.slice().reverse().map((item) => {
      const review = reviewsByEvidence.get(item.id);
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = label(item.kind) + ' - ' + label(item.redactionState);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = item.id + ' - ' + item.sha256;
      const reviewMeta = document.createElement('div');
      reviewMeta.className = 'run-meta';
      reviewMeta.textContent = t('Review') + ': ' + (review ? label(review.status) : t('No review decision.'));
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const viewButton = document.createElement('button');
      viewButton.type = 'button';
      viewButton.textContent = 'View content';
      viewButton.addEventListener('click', () => viewEvidenceContent(item.id));
      const useButton = document.createElement('button');
      useButton.type = 'button';
      useButton.textContent = 'Use as evidence';
      useButton.addEventListener('click', () => appendEvidenceId(item.id));
      const baselineButton = document.createElement('button');
      baselineButton.type = 'button';
      baselineButton.textContent = 'Use as baseline';
      baselineButton.addEventListener('click', () => appendAccessEvidenceId('baseline', item.id));
      const comparisonButton = document.createElement('button');
      comparisonButton.type = 'button';
      comparisonButton.textContent = 'Use as comparison';
      comparisonButton.addEventListener('click', () => appendAccessEvidenceId('comparison', item.id));
      actions.append(viewButton, useButton, baselineButton, comparisonButton);
      row.append(title, meta, reviewMeta, actions);
      return row;
    }));
  }

  async function viewEvidenceContent(evidenceId) {
    await withBusy(async () => {
      const payload = await api('/evidence/' + encodeURIComponent(evidenceId) + '/content');
      renderEvidenceViewer(payload);
      showMessage('Evidence content loaded.');
    });
  }

  function renderEvidenceViewer(payload) {
    state.evidenceViewerPayload = payload || null;
    if (!payload || !payload.evidence) {
      state.selectedEvidenceId = '';
      els.evidenceViewerTitle.textContent = 'No evidence selected.';
      els.evidenceViewerMeta.textContent = 'Local Evidence Engine content preview stays on this runner.';
      els.evidenceViewerContent.textContent = '';
      updateEvidenceReviewControls();
      applyLanguage(els.evidenceViewerTitle.closest('.panel'));
      return;
    }
    const evidence = payload.evidence;
    state.selectedEvidenceId = evidence.id;
    els.evidenceViewerTitle.textContent = label(evidence.kind) + ' - ' + evidence.id;
    els.evidenceViewerMeta.textContent = [
      t('Encoding') + ': ' + (payload.encoding || 'unknown'),
      t('Size') + ': ' + formatBytes(payload.sizeBytes || 0),
      t('Redaction') + ': ' + label(evidence.redactionState),
      t('Hash') + ': ' + evidence.sha256
    ].join(' - ');
    els.evidenceViewerContent.textContent = formatEvidenceContent(payload);
    updateEvidenceReviewControls();
    applyLanguage(els.evidenceViewerTitle.closest('.panel'));
  }

  async function submitEvidenceReview(status) {
    if (!state.selectedEvidenceId) return;
    const note = els.evidenceReviewNote.value.trim() || evidenceReviewDefaultNote(status);
    await withBusy(async () => {
      await api('/evidence/' + encodeURIComponent(state.selectedEvidenceId) + '/review', {
        method: 'POST',
        body: { status, note, reviewer: 'operator' }
      });
      showMessage('Evidence review saved.');
      await refreshReview();
    });
  }

  async function replaySelectedEvidence() {
    if (!state.selectedEvidenceId) return;
    await withBusy(async () => {
      await api('/evidence/' + encodeURIComponent(state.selectedEvidenceId) + '/replay', {
        method: 'POST',
        body: { timeoutMs: 10000 }
      });
      showMessage('HTTP evidence replayed.');
      await refreshProgress();
    });
  }

  async function promoteEvidenceToFinding() {
    if (!state.selectedEvidenceId) return;
    await withBusy(async () => {
      await api('/evidence/' + encodeURIComponent(state.selectedEvidenceId) + '/promote-finding', {
        method: 'POST',
        body: {}
      });
      showMessage('Candidate finding created from reviewed evidence.');
      await refreshReview();
    });
  }

  function updateEvidenceReviewControls() {
    const selected = Boolean(state.selectedEvidenceId);
    const review = selected ? state.evidenceReviews.find((item) => item.evidenceId === state.selectedEvidenceId) : null;
    els.evidenceReviewStatus.textContent = review
      ? t('Review') + ': ' + label(review.status) + (review.reviewer ? ' - ' + review.reviewer : '')
      : 'No review decision.';
    if (document.activeElement !== els.evidenceReviewNote) {
      els.evidenceReviewNote.value = review && review.note ? review.note : '';
    }
    const disabled = state.busy || !selected;
    const selectedEvidence = state.evidenceViewerPayload && state.evidenceViewerPayload.evidence ? state.evidenceViewerPayload.evidence : null;
    els.evidenceReviewNote.disabled = disabled;
    els.markEvidenceUseful.disabled = disabled;
    els.markEvidenceNeedsContext.disabled = disabled;
    els.markEvidenceNotRelevant.disabled = disabled;
    els.replayEvidence.disabled = disabled || !selectedEvidence || selectedEvidence.kind !== 'http_exchange';
    els.promoteEvidenceFinding.disabled = disabled || !review || review.status !== 'useful';
  }

  function evidenceReviewDefaultNote(status) {
    if (status === 'useful') return 'Useful evidence for finding or report.';
    if (status === 'needs_more_context') return 'More context required before using this evidence.';
    return 'Evidence is not relevant to the current assessment.';
  }

  function formatEvidenceContent(payload) {
    const previewLimit = 20000;
    if (payload.encoding !== 'utf8') {
      return '[' + t('Binary or base64 evidence content') + ' - ' + formatBytes(payload.sizeBytes || 0) + ']';
    }
    let content = typeof payload.content === 'string' ? payload.content : '';
    if (!content) {
      return '[' + t('No preview available.') + ']';
    }
    const trimmed = content.trim();
    if (trimmed) {
      try {
        content = JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        content = typeof payload.content === 'string' ? payload.content : String(payload.content || '');
      }
    }
    if (content.length > previewLimit) {
      return content.slice(0, previewLimit) + '\\n\\n[' + t('Preview truncated.') + ']';
    }
    return content;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderBrowserSessions(browserSessions) {
    const active = browserSessions.filter((session) => session.status === 'active');
    els.browserSessionCount.textContent = active.length + ' active';
    if (browserSessions.length === 0) {
      els.browserSessionList.replaceChildren(emptyItem('No browser sessions.'));
      return;
    }
    els.browserSessionList.replaceChildren(...browserSessions.map((session) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = session.status + ' - ' + (session.currentUrl || session.mode);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = session.id + ' - ' + session.mode;
      const limits = document.createElement('p');
      limits.className = 'muted';
      limits.textContent = (session.limitations || []).join(' - ');
      row.append(title, meta, limits);
      if (session.status === 'active') {
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => closeBrowserSession(session.id));
        actions.append(closeButton);
        row.append(actions);
      }
      return row;
    }));
  }

  function renderBrowserSnapshots(snapshots) {
    els.browserSnapshotCount.textContent = snapshots.length + ' snapshots';
    if (snapshots.length === 0) {
      els.browserSnapshotList.replaceChildren(emptyItem('No browser snapshots.'));
      return;
    }
    els.browserSnapshotList.replaceChildren(...snapshots.map((snapshot) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = (snapshot.title || snapshot.target) + ' - ' + label(snapshot.source);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = snapshot.id + ' - ' + new Date(snapshot.createdAt).toLocaleString();
      const target = document.createElement('p');
      target.className = 'muted';
      target.textContent = snapshot.target;
      const summary = document.createElement('div');
      summary.className = 'run-meta';
      summary.textContent = [
        snapshot.screenshotEvidenceId ? t('Screenshot evidence') + '=' + snapshot.screenshotEvidenceId : '',
        snapshot.textEvidenceId ? t('Text evidence') + '=' + snapshot.textEvidenceId : '',
        snapshot.screenshotBytes ? t('Size') + '=' + formatBytes(snapshot.screenshotBytes) : ''
      ].filter(Boolean).join(' - ');
      row.append(title, meta, target, summary);
      if (snapshot.evidenceIds && snapshot.evidenceIds.length > 0) {
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        snapshot.evidenceIds.slice(0, 2).forEach((evidenceId) => {
          const useButton = document.createElement('button');
          useButton.type = 'button';
          useButton.textContent = 'Use as evidence';
          useButton.addEventListener('click', () => appendEvidenceId(evidenceId));
          actions.append(useButton);
        });
        row.append(actions);
      }
      return row;
    }));
  }

  function renderOastSessions(oastSessions, oastCallbacks) {
    const active = oastSessions.filter((session) => session.status === 'active');
    els.oastSessionCount.textContent = active.length + ' active';
    if (oastSessions.length === 0) {
      els.oastSessionList.replaceChildren(emptyItem('No OAST sessions.'));
    } else {
      els.oastSessionList.replaceChildren(...oastSessions.map((session) => {
        const row = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = session.status + ' - ' + session.interactionCount + ' callbacks';
        const meta = document.createElement('div');
        meta.className = 'run-meta';
        meta.textContent = session.id + ' - ' + session.token;
        const url = document.createElement('p');
        url.className = 'muted';
        url.textContent = session.callbackUrl;
        const limits = document.createElement('p');
        limits.className = 'muted';
        limits.textContent = (session.limitations || []).join(' - ');
        row.append(title, meta, url, limits);
        if (session.status === 'active') {
          const actions = document.createElement('div');
          actions.className = 'item-actions';
          const closeButton = document.createElement('button');
          closeButton.type = 'button';
          closeButton.textContent = 'Close';
          closeButton.addEventListener('click', () => closeOastSession(session.id));
          actions.append(closeButton);
          row.append(actions);
        }
        return row;
      }));
    }
    if (!oastCallbacks || oastCallbacks.length === 0) {
      els.oastCallbackList.replaceChildren(emptyItem('No OAST callbacks.'));
      return;
    }
    els.oastCallbackList.replaceChildren(...oastCallbacks.slice(0, 12).map((callback) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = callback.method + ' - ' + callback.protocol;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = callback.evidenceId + ' - ' + callback.path;
      const source = document.createElement('p');
      source.className = 'muted';
      source.textContent = callback.source + (callback.remoteAddress ? ' - ' + callback.remoteAddress : '');
      row.append(title, meta, source);
      return row;
    }));
  }

  async function closeBrowserSession(sessionId) {
    await withBusy(async () => {
      await api('/browser-sessions/' + encodeURIComponent(sessionId) + '/close', { method: 'POST' });
      showMessage('Browser session closed.');
      await refreshRuns();
    });
  }

  async function startOastSession() {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/oast-sessions', { method: 'POST' });
      showMessage('OAST session started.');
      await refreshRuns();
    });
  }

  async function closeOastSession(sessionId) {
    await withBusy(async () => {
      await api('/oast-sessions/' + encodeURIComponent(sessionId) + '/close', { method: 'POST' });
      showMessage('OAST session closed.');
      await refreshRuns();
    });
  }

  async function prepareRunnerWorkbench() {
    if (!state.activeRunId) return;
    await withBusy(async () => {
      await api('/runs/' + encodeURIComponent(state.activeRunId) + '/local-runner-workbench/prepare', {
        method: 'POST',
        body: { includeBrowser: true, includeProxy: true, includeOast: false }
      });
      showMessage('Runner prepared.');
      await refreshRuns();
    });
  }

  function renderProxySessions(proxySessions) {
    const active = proxySessions.filter((session) => session.status === 'active');
    els.proxySessionCount.textContent = active.length + ' active';
    if (proxySessions.length === 0) {
      els.proxySessionList.replaceChildren(emptyItem('No proxy sessions.'));
      return;
    }
    els.proxySessionList.replaceChildren(...proxySessions.map((session) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = session.status + ' - ' + session.proxyUrl;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = session.id + ' - ' + session.requiredHeaders['X-Capture-Run-Id'];
      const limits = document.createElement('p');
      limits.className = 'muted';
      limits.textContent = (session.limitations || []).join(' - ');
      row.append(title, meta, limits);
      if (session.status === 'active') {
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => closeProxySession(session.id));
        actions.append(closeButton);
        row.append(actions);
      }
      return row;
    }));
  }

  function renderCredentialReferences(credentials) {
    const active = credentials.filter((credential) => credential.status === 'active');
    els.credentialReferenceCount.textContent = active.length + ' credentials';
    if (credentials.length === 0) {
      els.credentialReferenceList.replaceChildren(emptyItem('No credential references.'));
      return;
    }
    els.credentialReferenceList.replaceChildren(...credentials.map((credential) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = credential.label + ' - ' + credential.role + ' - ' + label(credential.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = credential.kind + ' - ' + credential.id;
      const placeholder = document.createElement('p');
      placeholder.className = 'muted';
      placeholder.textContent = credential.placeholder;
      const allowedUse = document.createElement('div');
      allowedUse.className = 'run-meta';
      allowedUse.textContent = t('Allowed use') + ': ' + (credential.allowedUse || []).join(', ');
      row.append(title, meta, placeholder, allowedUse);
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const useButton = document.createElement('button');
      useButton.type = 'button';
      useButton.textContent = 'Record use';
      useButton.disabled = state.busy || credential.status !== 'active';
      useButton.addEventListener('click', () => useCredentialReference(credential.id));
      actions.append(useButton);
      if (credential.status === 'active') {
        const revokeButton = document.createElement('button');
        revokeButton.type = 'button';
        revokeButton.textContent = 'Revoke';
        revokeButton.addEventListener('click', () => revokeCredentialReference(credential.id));
        actions.append(revokeButton);
      }
      row.append(actions);
      return row;
    }));
  }

  function renderAccessReviews(reviews) {
    els.accessReviewCount.textContent = reviews.length + ' reviews';
    if (reviews.length === 0) {
      els.accessReviewList.replaceChildren(emptyItem('No access reviews.'));
      return;
    }
    els.accessReviewList.replaceChildren(...reviews.map((review) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = review.title + ' - ' + label(review.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = review.method + ' - ' + review.target;
      const summary = document.createElement('p');
      summary.className = 'muted';
      summary.textContent = review.summary || '';
      row.append(title, meta, summary);
      if (review.signals && review.signals.length > 0) {
        const signals = document.createElement('ul');
        signals.className = 'compact-list';
        signals.append(...review.signals.slice(0, 4).map((signal) => {
          const item = document.createElement('li');
          item.textContent = signal;
          return item;
        }));
        row.append(signals);
      }
      const ids = document.createElement('div');
      ids.className = 'run-meta';
      ids.textContent = [review.baselineEvidenceId, review.comparisonEvidenceId, review.diffEvidenceId]
        .filter(Boolean)
        .join(' - ');
      row.append(ids);
      if (review.diffEvidenceId) {
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        const useButton = document.createElement('button');
        useButton.type = 'button';
        useButton.textContent = 'Use as evidence';
        useButton.addEventListener('click', () => appendEvidenceId(review.diffEvidenceId));
        actions.append(useButton);
        row.append(actions);
      }
      return row;
    }));
  }

  function renderSarifImports(imports) {
    els.sarifImportCount.textContent = imports.length + ' imports';
    if (imports.length === 0) {
      els.sarifImportList.replaceChildren(emptyItem('No SARIF imports.'));
      return;
    }
    els.sarifImportList.replaceChildren(...imports.map((item) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = item.source + ' - ' + label(item.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = item.id + ' - evidence ' + item.evidenceId;
      const summary = document.createElement('div');
      summary.className = 'run-meta';
      summary.textContent =
        'results=' + item.results + ' - rules=' + item.rules + ' - ' + t('Imported findings') + '=' + item.importedFindings;
      const hash = document.createElement('p');
      hash.className = 'muted';
      hash.textContent = item.inputSha256;
      row.append(title, meta, summary, hash);
      if (item.findingIds && item.findingIds.length > 0) {
        const findings = document.createElement('p');
        findings.className = 'muted';
        findings.textContent = item.findingIds.slice(0, 6).join(', ') + (item.findingIds.length > 6 ? ' +' + (item.findingIds.length - 6) : '');
        row.append(findings);
      }
      return row;
    }));
  }

  function renderAndroidManifestImports(imports) {
    els.androidManifestCount.textContent = imports.length + ' imports';
    if (imports.length === 0) {
      els.androidManifestList.replaceChildren(emptyItem('No Android Manifest imports.'));
      return;
    }
    els.androidManifestList.replaceChildren(...imports.map((item) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = (item.packageName || item.source) + ' - ' + label(item.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = item.id + ' - evidence ' + item.evidenceId;
      const summary = document.createElement('div');
      summary.className = 'run-meta';
      summary.textContent = [
        t('Package') + '=' + (item.packageName || '-'),
        'targetSdk=' + (item.targetSdk || '-'),
        t('Risk signals') + '=' + item.riskCount,
        t('Imported findings') + '=' + item.importedFindings
      ].join(' - ');
      const signals = document.createElement('p');
      signals.className = 'muted';
      signals.textContent = [
        t('Risky permissions') + ': ' + listSummary(item.riskyPermissions || []),
        t('Exported components') + ': ' + listSummary((item.exportedComponents || []).map((component) => component.type + ':' + component.name))
      ].join(' | ');
      row.append(title, meta, summary, signals);
      if (item.findingIds && item.findingIds.length > 0) {
        const findings = document.createElement('p');
        findings.className = 'muted';
        findings.textContent = item.findingIds.slice(0, 6).join(', ') + (item.findingIds.length > 6 ? ' +' + (item.findingIds.length - 6) : '');
        row.append(findings);
      }
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const useButton = document.createElement('button');
      useButton.type = 'button';
      useButton.textContent = 'Use as evidence';
      useButton.addEventListener('click', () => appendEvidenceId(item.evidenceId));
      actions.append(useButton);
      row.append(actions);
      return row;
    }));
  }

  function renderCloudIamImports(imports) {
    els.cloudIamCount.textContent = imports.length + ' imports';
    if (imports.length === 0) {
      els.cloudIamList.replaceChildren(emptyItem('No Cloud IAM imports.'));
      return;
    }
    els.cloudIamList.replaceChildren(...imports.map((item) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = (item.policyName || item.source) + ' - ' + label(item.provider) + ' - ' + label(item.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = item.id + ' - evidence ' + item.evidenceId;
      const summary = document.createElement('div');
      summary.className = 'run-meta';
      summary.textContent = [
        t('Statements') + '=' + item.statementCount,
        t('Allow statements') + '=' + item.allowStatementCount,
        t('Wildcard actions') + '=' + item.wildcardActionCount,
        t('Wildcard resources') + '=' + item.wildcardResourceCount,
        t('Risk signals') + '=' + item.riskCount,
        t('Imported findings') + '=' + item.importedFindings
      ].join(' - ');
      row.append(title, meta, summary);
      if (item.riskSignals && item.riskSignals.length > 0) {
        const risks = document.createElement('p');
        risks.className = 'muted';
        risks.textContent = item.riskSignals.slice(0, 3).map((risk) => risk.severity + ':' + risk.title).join(' | ');
        row.append(risks);
      }
      if (item.findingIds && item.findingIds.length > 0) {
        const findings = document.createElement('p');
        findings.className = 'muted';
        findings.textContent = item.findingIds.slice(0, 6).join(', ') + (item.findingIds.length > 6 ? ' +' + (item.findingIds.length - 6) : '');
        row.append(findings);
      }
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const useButton = document.createElement('button');
      useButton.type = 'button';
      useButton.textContent = 'Use as evidence';
      useButton.addEventListener('click', () => appendEvidenceId(item.evidenceId));
      actions.append(useButton);
      row.append(actions);
      return row;
    }));
  }

  function renderIdentityGraphImports(imports) {
    els.identityGraphCount.textContent = imports.length + ' imports';
    if (imports.length === 0) {
      els.identityGraphList.replaceChildren(emptyItem('No Identity Graph imports.'));
      return;
    }
    els.identityGraphList.replaceChildren(...imports.map((item) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = item.source + ' - ' + label(item.provider) + ' - ' + label(item.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = item.id + ' - evidence ' + item.evidenceId;
      const summary = document.createElement('div');
      summary.className = 'run-meta';
      summary.textContent = [
        t('Nodes') + '=' + item.nodeCount,
        t('Edges') + '=' + item.edgeCount,
        t('High-value nodes') + '=' + item.highValueNodeCount,
        t('Risky edges') + '=' + item.riskyEdgeCount,
        t('Risk signals') + '=' + item.riskCount,
        t('Imported findings') + '=' + item.importedFindings
      ].join(' - ');
      row.append(title, meta, summary);
      if (item.riskSignals && item.riskSignals.length > 0) {
        const risks = document.createElement('p');
        risks.className = 'muted';
        risks.textContent = item.riskSignals.slice(0, 3).map((risk) => risk.severity + ':' + risk.title).join(' | ');
        row.append(risks);
      }
      if (item.findingIds && item.findingIds.length > 0) {
        const findings = document.createElement('p');
        findings.className = 'muted';
        findings.textContent = item.findingIds.slice(0, 6).join(', ') + (item.findingIds.length > 6 ? ' +' + (item.findingIds.length - 6) : '');
        row.append(findings);
      }
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const useButton = document.createElement('button');
      useButton.type = 'button';
      useButton.textContent = 'Use as evidence';
      useButton.addEventListener('click', () => appendEvidenceId(item.evidenceId));
      actions.append(useButton);
      row.append(actions);
      return row;
    }));
  }

  function renderCaptureImports(imports) {
    els.captureImportCount.textContent = imports.length + ' imports';
    if (imports.length === 0) {
      els.captureImportList.replaceChildren(emptyItem('No capture imports.'));
      return;
    }
    els.captureImportList.replaceChildren(...imports.map((item) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = item.source + ' - ' + label(item.kind) + ' - ' + label(item.status);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = item.id + ' - ' + new Date(item.createdAt).toLocaleString();
      const summary = document.createElement('div');
      summary.className = 'run-meta';
      summary.textContent = [
        t('Processed entries') + '=' + item.processedEntries + '/' + item.totalEntries,
        t('Imported entries') + '=' + item.imported,
        t('Skipped entries') + '=' + item.skipped,
        t('Truncated entries') + '=' + item.truncatedEntries
      ].join(' - ');
      const hash = document.createElement('p');
      hash.className = 'muted';
      hash.textContent = item.inputSha256;
      row.append(title, meta, summary, hash);
      if (item.evidenceIds && item.evidenceIds.length > 0) {
        const evidence = document.createElement('p');
        evidence.className = 'muted';
        evidence.textContent = item.evidenceIds.slice(0, 6).join(', ') + (item.evidenceIds.length > 6 ? ' +' + (item.evidenceIds.length - 6) : '');
        row.append(evidence);
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        const useButton = document.createElement('button');
        useButton.type = 'button';
        useButton.textContent = 'Use as evidence';
        useButton.addEventListener('click', () => appendEvidenceId(item.evidenceIds[0]));
        actions.append(useButton);
        row.append(actions);
      }
      if (item.skippedEntries && item.skippedEntries.length > 0) {
        const skipped = document.createElement('p');
        skipped.className = 'muted';
        skipped.textContent = t('Skipped reasons') + ': ' + item.skippedEntries
          .slice(0, 3)
          .map((entry) => '#' + entry.index + ' ' + entry.reason)
          .join(' | ');
        row.append(skipped);
      }
      return row;
    }));
  }

  function appendEvidenceId(evidenceId) {
    const input = els.findingForm.elements.evidenceIds;
    const current = splitAssets(input.value);
    if (!current.includes(evidenceId)) {
      current.push(evidenceId);
    }
    input.value = current.join(', ');
  }

  function appendAccessEvidenceId(side, evidenceId) {
    const field = side === 'baseline' ? 'baselineEvidenceId' : 'comparisonEvidenceId';
    els.accessReviewForm.elements[field].value = evidenceId;
  }

  function renderFindings(findings) {
    els.findingCount.textContent = findings.length + ' candidates';
    if (findings.length === 0) {
      els.findingList.replaceChildren(emptyItem('No findings proposed.'));
      return;
    }
    els.findingList.replaceChildren(...findings.map((finding) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = finding.title;
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = finding.severity + ' - ' + finding.confidence + ' - ' + finding.validationState;
      const impact = document.createElement('p');
      impact.className = 'muted';
      impact.textContent = finding.impact;
      const validation = document.createElement('p');
      validation.className = 'muted';
      validation.textContent = [
        finding.validatedBy ? t('Validated by') + ': ' + finding.validatedBy : '',
        finding.validatedAt ? new Date(finding.validatedAt).toLocaleString() : '',
        finding.validationNote ? t('Validation note') + ': ' + finding.validationNote : ''
      ].filter(Boolean).join(' - ');
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      if (finding.validationState !== 'confirmed') {
        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.textContent = 'Confirm finding';
        confirmButton.addEventListener('click', () => decideFinding(finding.id, 'confirmed'));
        actions.append(confirmButton);
      }
      if (finding.validationState !== 'rejected') {
        const rejectButton = document.createElement('button');
        rejectButton.type = 'button';
        rejectButton.textContent = 'Reject finding';
        rejectButton.addEventListener('click', () => decideFinding(finding.id, 'rejected'));
        actions.append(rejectButton);
      }
      item.append(title, meta, impact);
      if (validation.textContent) {
        item.append(validation);
      }
      if (actions.childNodes.length > 0) {
        item.append(actions);
      }
      return item;
    }));
  }

  function renderReports(reports) {
    if (reports.length === 0) {
      els.reportList.replaceChildren(emptyItem('No reports generated.'));
      return;
    }
    els.reportList.replaceChildren(...reports.map((report) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = 'Report bundle';
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = report.id + ' - ' + report.sha256;
      item.append(title, meta);
      return item;
    }));
  }

  function renderRunExports(exports) {
    if (!exports || exports.length === 0) {
      els.runExportList.replaceChildren(emptyItem('No run exports generated.'));
      return;
    }
    els.runExportList.replaceChildren(...exports.map((runExport) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = label(runExport.status) + ' - ' + label(runExport.findingScope);
      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = runExport.evidenceId + ' - ' + runExport.sha256;
      const summary = document.createElement('p');
      summary.className = 'muted';
      summary.textContent = [
        t('Findings') + '=' + runExport.counts.findings,
        t('Evidence') + '=' + runExport.counts.evidence,
        t('Included evidence content') + '=' + runExport.includedEvidenceContent,
        t('Omitted local-only evidence') + '=' + runExport.omittedRawLocalOnly
      ].join(' - ');
      item.append(title, meta, summary);
      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const viewButton = document.createElement('button');
      viewButton.type = 'button';
      viewButton.textContent = 'View content';
      viewButton.addEventListener('click', () => viewEvidenceContent(runExport.evidenceId));
      actions.append(viewButton);
      item.append(actions);
      return item;
    }));
  }

  function renderEmptyRun() {
    els.runTitle.textContent = 'No run selected';
    els.runGoal.textContent = 'Create or select a run to inspect progress.';
    els.metricPhase.textContent = '-';
    els.metricFacts.textContent = '0';
    els.metricIntents.textContent = '0';
    els.metricEvidence.textContent = '0';
    els.metricFindings.textContent = '0';
    els.metricApprovals.textContent = '0';
    renderObservability(null);
    renderCapabilityRadar(null);
    renderScorecard(null);
    renderWorkerLeaderboard(state.workerLeaderboard);
    renderEvidenceQuality(null);
    renderDeliveryReadiness(null);
    renderSimpleConsole(null, null, null, null);
    renderMissionControl(null);
    renderRuntimeOperationsWorkbench(null);
    renderWorkbench(null);
    renderSearchPlan(null);
    els.graphStatus.textContent = 'Idle';
    renderWorkers([]);
    renderWorkerSelection(null);
    renderWorkerEvaluationPlan(null);
    renderExecutionNode(null);
    renderDesktopReadiness(null);
    renderLocalRunnerWorkbench(null);
    renderReferenceBenchmark(null);
    renderWorkerEnvelopePreview(null);
    renderFlow(null);
    renderAttackSurface(null);
    renderSurfaceFrontierPlanPreview(null);
    renderToolboxBundles(state.toolboxBundles);
    renderConnectors(state.connectors);
    renderEcosystemCoverage(null);
    renderToolIntegrationBacklog(null);
    renderToolEcosystemWorkbench(null);
    renderRuntimeActivationPlan(null);
    renderConnectorPlanPreview(null);
    renderDomainSkills(state.domainSkills);
    renderDomainSkillReadiness(null);
    renderPocTemplates(state.pocTemplates);
    renderStrategy(null);
    els.factsList.replaceChildren(emptyItem('No facts recorded.'));
    els.intentsList.replaceChildren(emptyItem('No intents proposed.'));
    els.eventList.replaceChildren(emptyItem('No timeline events.'));
    els.eventCount.textContent = '0 events';
    renderReview({ approvals: [], toolInvocations: [], evidence: [], evidenceReviews: [], findings: [], reports: [], runExports: [], browserSessions: [], browserSnapshots: [], oastSessions: [], oastCallbacks: [], proxySessions: [], credentialReferences: [], accessReviews: [], androidManifestImports: [], cloudIamImports: [], identityGraphImports: [], sarifImports: [], captureImports: [], toolPackRuns: [], connectorRuns: [] });
    els.dispatchOnce.disabled = true;
    els.dispatchAuto.disabled = true;
    els.simpleContinue.disabled = true;
    els.simpleAuto.disabled = true;
    els.simpleReport.disabled = true;
    els.autopilotTick.disabled = true;
    els.advanceSearchPlan.disabled = true;
    els.evaluateRun.disabled = true;
    els.previewWorkerEnvelope.disabled = true;
    els.previewToolPack.disabled = true;
    els.invokeToolPack.disabled = true;
    els.scannerTemplateForm.querySelector('button[type="submit"]').disabled = true;
    els.previewScannerTemplate.disabled = true;
    els.harImportForm.querySelector('button[type="submit"]').disabled = true;
    els.androidManifestForm.querySelector('button[type="submit"]').disabled = true;
    els.cloudIamForm.querySelector('button[type="submit"]').disabled = true;
    els.identityGraphForm.querySelector('button[type="submit"]').disabled = true;
    renderToolPlanPreview(null);
    applyLanguage();
  }

  function emptyItem(text) {
    const item = document.createElement('li');
    item.className = 'empty';
    item.textContent = text;
    return item;
  }

  function showMessage(text, isError = false) {
    els.message.textContent = t(text);
    els.message.className = 'message is-visible' + (isError ? ' is-error' : '');
    window.clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => {
      els.message.className = 'message';
    }, 4500);
  }

  function loadPlatformAiConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(platformAiConfigStorageKey) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function collectAiConfig() {
    const config = {
      baseUrl: els.aiBaseUrl.value.trim(),
      apiKey: els.aiApiKey.value.trim(),
      model: els.aiModel.value.trim()
    };
    state.aiConfig = config;
    return config;
  }

  function persistPlatformAiConfig(config) {
    localStorage.setItem(platformAiConfigStorageKey, JSON.stringify({
      baseUrl: config.baseUrl,
      model: config.model
    }));
  }

  function aiConfigReady(config) {
    return Boolean(config.baseUrl && config.model);
  }

  function renderAiConfigStatus(config = collectAiConfig()) {
    const hasRouting = Boolean(config.baseUrl && config.model);
    els.aiConfigStatus.textContent = t(aiConfigReady(config) ? 'ready' : hasRouting ? 'needs key' : 'needs setup');
    els.aiConfigSummary.textContent = t(aiConfigReady(config)
      ? 'AI worker routing is ready. Worker secrets must come from the local API process environment.'
      : 'Base URL and model are saved locally. API keys are not stored in browser or run state.');
  }

  function applyAiConfigToWorkerPool(options = {}) {
    const config = collectAiConfig();
    persistPlatformAiConfig(config);
    els.workerPresetSelect.value = 'ai';
    els.workerPoolJson.value = JSON.stringify(buildAiWorkerPoolConfig(config, false), null, 2);
    renderAiConfigStatus(config);
    if (!options.silent) {
      showMessage('AI worker configuration applied.');
    }
  }

  function workerPoolFromAiConfig(options = {}) {
    const config = collectAiConfig();
    persistPlatformAiConfig(config);
    renderAiConfigStatus(config);
    if (!aiConfigReady(config)) {
      return null;
    }
    return buildAiWorkerPoolConfig(config, Boolean(options.includeSecret));
  }

  function buildAiWorkerPoolConfig(config, includeSecret) {
    return [{
      name: 'ai-pentest-worker',
      type: 'codex',
      maxRunning: 1,
      priority: 0,
      command: 'codex',
      env: {
        OPENAI_BASE_URL: config.baseUrl || 'https://api.openai.com/v1',
        OPENAI_MODEL: config.model || 'gpt-4.1-mini',
        MODEL: config.model || 'gpt-4.1-mini'
      },
      timeoutMs: 180000
    }];
  }

  function workerPoolPresetJson(preset) {
    if (preset === 'ai') {
      return JSON.stringify(buildAiWorkerPoolConfig(state.aiConfig, false), null, 2);
    }
    return JSON.stringify(workerPoolPresets[preset] || workerPoolPresets.mock, null, 2);
  }

  function parseWorkerPoolJson(value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  function setButtonsDisabled(disabled) {
    els.refreshRuns.disabled = disabled;
    els.programScopeForm.querySelector('button[type="submit"]').disabled = disabled || !state.token;
    els.toolboxBundleForm.querySelector('button[type="submit"]').disabled = disabled || !state.token;
    els.connectorForm.querySelector('button[type="submit"]').disabled = disabled || !state.token;
    const active = state.runs.find((run) => run.id === state.activeRunId);
    const canDispatch = active && active.status === 'active' && !disabled;
    els.dispatchOnce.disabled = !canDispatch;
    els.dispatchAuto.disabled = !canDispatch;
    els.simpleContinue.disabled = !canDispatch;
    els.simpleAuto.disabled = !canDispatch;
    els.autopilotTick.disabled = !canDispatch;
    updateSearchPlanAdvanceState(state.searchPlan);
    els.evaluateRun.disabled = disabled || !active;
    els.previewWorkerEnvelope.disabled = disabled || !active;
    els.prepareRunnerWorkbench.disabled = disabled || !active;
    els.previewToolPack.disabled = disabled || !active || state.toolPacks.length === 0 || !els.toolPackSelect.value;
    els.invokeToolPack.disabled = disabled || !active || state.toolPacks.length === 0 || !els.toolPackSelect.value;
    els.generateReport.disabled = disabled || !active || Number(els.metricFindings.textContent || '0') === 0;
    els.simpleReport.disabled = disabled || !active || Number(els.metricFindings.textContent || '0') === 0;
    els.generateRunExport.disabled = disabled || !active;
    els.startBrowserSession.disabled = disabled || !active;
    els.browserNavigateForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.browserSnapshotForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.startOastSession.disabled = disabled || !active;
    els.startProxySession.disabled = disabled || !active;
    els.credentialReferenceForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.accessReviewForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.sarifImportForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.androidManifestForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.cloudIamForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.identityGraphForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.scannerTemplateForm.querySelector('button[type="submit"]').disabled =
      disabled || !active || els.scannerTemplateSelect.options.length === 0 || !els.scannerTemplateSelect.value;
    els.previewScannerTemplate.disabled =
      disabled || !active || els.scannerTemplateSelect.options.length === 0 || !els.scannerTemplateSelect.value;
    els.httpCaptureForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.harImportForm.querySelector('button[type="submit"]').disabled = disabled || !active;
    els.findingForm.querySelector('button[type="submit"]').disabled =
      disabled || !active || Number(els.metricEvidence.textContent || '0') === 0;
    updateEvidenceReviewControls();
  }

  function splitAssets(value) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  function splitLines(value) {
    return value.split(/\\r?\\n/).map((item) => item.trim()).filter(Boolean);
  }

  function parseHeaderLines(value) {
    const headers = {};
    for (const line of splitLines(value)) {
      const separator = line.indexOf(':');
      if (separator > 0) {
        const key = line.slice(0, separator).trim();
        const headerValue = line.slice(separator + 1).trim();
        if (key && headerValue) headers[key] = headerValue;
      }
    }
    return headers;
  }
})();`;
