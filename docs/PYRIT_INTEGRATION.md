# PyRIT Scenario Library Integration

## Overview

AgentRed integrates Microsoft PyRIT (Python Risk Identification Toolkit) GenAI red-team scenarios as fixture-driven Worker evaluation tasks. This allows systematic testing of Agent Worker behavior against known AI security patterns.

## Architecture Alignment

| PyRIT Concept | AgentRed Mapping |
|---------------|------------------|
| PyRIT Targets | Worker envelope inputs |
| PyRIT Orchestrators | Dispatcher + Tool Gateway |
| PyRIT Scorers | Evidence quality + Finding validation |
| PyRIT Datasets | Scenario fixtures |

## Safety Model

**Critical: PyRIT scenarios test defensive capabilities, not offensive automation.**

- Scenarios do NOT auto-execute; they define evaluation fixtures
- Workers remain untrusted suggestion producers
- Tool Gateway remains the only execution path
- Scoring is read-only and does not grant permissions or bypass approvals
- All tool requests go through scope policy, risk gates, and approval workflows

## Scenario Categories

1. **Prompt Injection** - Tests if Worker detects and refuses prompt injection attempts
2. **Jailbreak** - Tests if Worker resists role-play and multi-turn jailbreak patterns
3. **Harmful Content** - Tests if Worker refuses harmful content generation requests
4. **Privacy Leak** - Tests if Worker protects PII and training data from extraction
5. **Code Execution** - Tests if Worker properly gates command execution through Tool Gateway
6. **Security Misconfiguration** - Tests scope policy and approval gate enforcement
7. **Bias and Fairness** - Tests if Worker avoids bias in decision-making

## Risk Levels

Scenarios are tagged with AgentRed risk levels:

- **R0** - Metadata and passive reading tests
- **R1** - Basic safety boundary tests
- **R2** - Scanner-like behavior tests
- **R3** - High-risk action tests (requires approval)
- **R4** - Destructive action tests (default blocked)

## API Endpoints

### Library Management

```bash
# Get library summary
GET /pyrit/scenarios/library/summary

# List all scenarios (with optional filters)
GET /pyrit/scenarios?category=prompt_injection&riskLevel=R2&status=imported

# Get specific scenario
GET /pyrit/scenarios/{scenarioId}

# List by category
GET /pyrit/scenarios/categories/{category}

# List by risk level
GET /pyrit/scenarios/risk-levels/{riskLevel}

# Get dataset metadata
GET /pyrit/dataset-metadata
```

### Import Scenarios

```bash
# Import default PyRIT scenario dataset
POST /pyrit/scenarios/import-defaults

# Import custom scenarios
POST /pyrit/scenarios/import
Content-Type: application/json

{
  "source": "custom-dataset",
  "scenarios": [
    {
      "name": "Custom Test Scenario",
      "category": "prompt_injection",
      "description": "...",
      "objective": "...",
      "riskLevel": "R2",
      "targetType": "ai_agent",
      "fixture": { ... },
      "successCriteria": { ... },
      "scorers": [ ... ],
      "safetyNotes": [ ... ],
      "sourceDataset": "custom",
      "license": "MIT"
    }
  ]
}
```

### Run Scenarios

```bash
# Create scenario evaluation task
POST /pyrit/scenarios/{scenarioId}/run
Content-Type: application/json

{
  "runId": "run-123",
  "workerName": "claude-worker"
}

# Get evaluation report for a run
GET /runs/{runId}/pyrit/evaluation
```

### Update Scenarios

```bash
# Update scenario status
POST /pyrit/scenarios/{scenarioId}/status
Content-Type: application/json

{
  "status": "tested"
}
```

## Usage Example

### 1. Import Default Scenarios

```bash
curl -X POST http://localhost:4317/pyrit/scenarios/import-defaults \
  -H "Authorization: Bearer $PLATFORM_API_TOKEN"
```

Response:
```json
{
  "message": "Default PyRIT scenarios imported successfully",
  "metadata": {
    "source": "AgentRed PyRIT Integration",
    "version": "1.0.0",
    "scenarioCount": 13
  },
  "import": {
    "id": "pyrit-import-1234567890",
    "status": "completed",
    "scenarioCount": 13,
    "scenarioIds": ["pyrit-scenario-1", "..."],
    "errors": []
  }
}
```

### 2. List Imported Scenarios

```bash
curl http://localhost:4317/pyrit/scenarios?category=prompt_injection \
  -H "Authorization: Bearer $PLATFORM_API_TOKEN"
```

### 3. Create a Run and Execute Scenario

```bash
# Create a run
curl -X POST http://localhost:4317/runs \
  -H "Authorization: Bearer $PLATFORM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://ai-app.example.com",
    "goal": "Evaluate Worker GenAI security awareness",
    "scopePolicy": {
      "allowedAssets": ["https://ai-app.example.com"],
      "deniedAssets": [],
      "allowedMethods": ["GET", "POST"],
      "destructiveAllowed": false
    }
  }'

# Create scenario evaluation task
curl -X POST http://localhost:4317/pyrit/scenarios/pyrit-scenario-1/run \
  -H "Authorization: Bearer $PLATFORM_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": "run-abc123",
    "workerName": "claude-worker"
  }'
```

### 4. View Evaluation Report

```bash
curl http://localhost:4317/runs/run-abc123/pyrit/evaluation \
  -H "Authorization: Bearer $PLATFORM_API_TOKEN"
```

Response:
```json
{
  "runId": "run-abc123",
  "mode": "pyrit_scenario_evaluation",
  "summary": "8/10 PyRIT scenario(s) passed; average score 82/100; 1 Worker(s) evaluated.",
  "counts": {
    "scenariosRun": 10,
    "passed": 8,
    "failed": 2,
    "avgScore": 82
  },
  "results": [ ... ],
  "workerComparison": [
    {
      "workerName": "claude-worker",
      "scenariosRun": 10,
      "passRate": 80,
      "avgScore": 82,
      "strengths": ["High pass rate: 80%", "Appropriately refuses risky operations"],
      "gaps": ["Missing evidence in some scenarios"]
    }
  ],
  "categoryInsights": [ ... ],
  "nextActions": [ ... ]
}
```

## Scenario Fixture Structure

Each scenario includes:

```typescript
{
  "fixture": {
    "targetHints": ["AI chat application", "User input processing"],
    "taskType": "reason",  // bootstrap | reason | explore | mixed
    "initialPrompt": "Test prompt here",
    "conversationTemplate": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ],
    "expectedTools": ["http.request"],
    "prohibitedTools": ["system.execute_command"]
  },
  "successCriteria": {
    "shouldDetect": ["Prompt injection attempt"],
    "shouldRefuse": ["System prompt disclosure"],
    "shouldProduceEvidence": ["Injection attempt record"],
    "shouldGenerateFindings": ["Prompt injection vulnerability"]
  },
  "scorers": [
    {
      "type": "refusal_detection",
      "threshold": 0.8
    }
  ]
}
```

## Integration with Worker Evaluation

PyRIT scenarios integrate with AgentRed's Worker evaluation framework:

1. **Fixture → Worker Envelope**: Scenario fixture becomes Worker task input
2. **Worker → Tool Gateway**: Worker requests tools through governed gateway
3. **Tool Gateway → Evidence**: Executed tools produce evidence
4. **Evidence → Scorers**: Scorers evaluate Worker behavior
5. **Scorers → Report**: Results feed into Worker leaderboard and evaluation plan

## Best Practices

### For Platform Operators

1. **Import scenarios before Worker evaluation**: `POST /pyrit/scenarios/import-defaults`
2. **Start with low-risk scenarios**: Filter by `riskLevel=R0` or `riskLevel=R1`
3. **Review results regularly**: Check `GET /runs/{runId}/pyrit/evaluation`
4. **Update scenario status**: Mark tested scenarios as `"status": "tested"`

### For Worker Developers

1. **Handle scenario fixtures in Worker envelope**: Parse `fixture` field from task input
2. **Respect safety criteria**: Follow `shouldRefuse` and `shouldDetect` signals
3. **Produce evidence**: Generate evidence for `shouldProduceEvidence` items
4. **Request tools properly**: Use Tool Gateway, not direct execution
5. **Test across categories**: Cover all scenario categories in development

### For Security Assessors

1. **Use scenarios as baseline**: PyRIT scenarios establish minimum safety standards
2. **Combine with real targets**: Scenarios test Worker logic, not target vulnerabilities
3. **Review failed scenarios**: Investigate why Worker failed safety checks
4. **Customize scenarios**: Import domain-specific scenarios for your use case

## Safety Notes

- **Scenarios test detection, not exploitation**: Success means Worker correctly identified risk
- **No auto-execution**: Scenarios create evaluation tasks, not automatic attacks
- **Tool Gateway enforced**: All tool requests go through scope, risk, and approval gates
- **Evidence required**: Findings must reference evidence, not just scenario results
- **Human approval required**: R3+ actions still need operator approval during scenario execution

## Metrics and Scoring

### Scenario-Level Metrics

- **Pass/Fail**: Overall scenario success
- **Score**: 0-100 based on scorer results
- **Task Results**: Tool requests, evidence produced, refusals
- **Scorer Results**: Individual scorer outputs and thresholds

### Worker-Level Metrics

- **Pass Rate**: Percentage of scenarios passed
- **Average Score**: Mean score across scenarios
- **Strengths**: Common positive behaviors
- **Gaps**: Common failure patterns

### Category-Level Insights

- **Pass Rate by Category**: Performance across scenario types
- **Common Gaps**: Frequent issues within category

## Reference

- Microsoft PyRIT: https://github.com/microsoft/PyRIT
- AgentRed Architecture: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- AI Red Team Reference: [docs/AI_RED_TEAM_AGENT_REFERENCE_ANALYSIS.md](../docs/AI_RED_TEAM_AGENT_REFERENCE_ANALYSIS.md)

## License

PyRIT scenario adaptations are provided under MIT license, following Microsoft PyRIT's licensing model.
