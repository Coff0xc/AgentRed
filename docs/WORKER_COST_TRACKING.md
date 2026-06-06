# Worker Cost Tracking and Quality Regression Detection

## Overview

The Worker Cost Tracker service provides detailed cost analysis and quality regression detection for Agent Workers. This is part of P2-7: Cost Optimization and Quality Scoring initiative.

## Features

### 1. Detailed Cost Breakdown

Track comprehensive cost metrics per worker including:
- Token usage and cost
- Runtime cost (milliseconds)
- Request count
- Cost per task
- Cost per token

### 2. Cost Efficiency Ranking

Workers are ranked by cost efficiency score based on:
- Success rate (50% weight)
- Cost per task (penalty)
- Token usage rate (penalty)

Higher scores indicate better cost efficiency.

### 3. Quality Regression Detection

Automatically detect when worker quality degrades by comparing:
- Success rate changes
- Cost increases
- Token usage increases
- Evidence productivity decreases

Regressions are categorized by severity:
- **Minor**: Small degradation, monitor
- **Moderate**: Significant degradation, investigate
- **Severe**: Critical degradation, deprioritize worker

### 4. Cost Comparison Across Time Periods

Compare worker costs between baseline and current periods to identify:
- Cost increase percentage
- Token usage trends
- Runtime efficiency changes

## API Endpoints

### Get Run Cost Report

```
GET /runs/{runId}/worker-costs
```

Returns comprehensive cost report including:
- Total estimated USD cost
- Per-worker breakdowns
- Cost efficiency ranking
- Recommendations

**Response:**
```json
{
  "runId": "run_xyz",
  "generatedAt": "2026-06-06T10:00:00Z",
  "totalEstimatedUsd": 0.125,
  "workerBreakdowns": [
    {
      "worker": "claude-worker",
      "runId": "run_xyz",
      "totalEstimatedUsd": 0.075,
      "tokenCost": 0.070,
      "runtimeCost": 0.005,
      "requestCount": 3,
      "tokenCount": 7000,
      "runtimeMs": 15000,
      "costPerTask": 0.025,
      "costPerToken": 0.00001
    }
  ],
  "costEfficiencyRanking": [
    {
      "worker": "claude-worker",
      "score": 85,
      "reason": "High success rate with low cost per task"
    }
  ],
  "recommendations": [
    "Prefer claude-worker for cost-sensitive work (efficiency score: 85/100)."
  ]
}
```

### Get Worker Cost Breakdown

```
GET /runs/{runId}/workers/{workerName}/cost-breakdown
```

Returns detailed cost breakdown for a specific worker.

**Response:**
```json
{
  "worker": "claude-worker",
  "runId": "run_xyz",
  "totalEstimatedUsd": 0.075,
  "tokenCost": 0.070,
  "runtimeCost": 0.005,
  "requestCount": 3,
  "tokenCount": 7000,
  "runtimeMs": 15000,
  "costPerTask": 0.025,
  "costPerToken": 0.00001,
  "entries": [...]
}
```

## Programmatic Usage

### Detect Quality Regression

```typescript
import { WorkerCostTrackerService } from './observability/worker-cost-tracker-service.js';

const service = new WorkerCostTrackerService(store);

// Compare worker performance across runs
const regression = service.detectWorkerRegression(
  'claude-worker',
  ['run_1', 'run_2', 'run_3'], // baseline runs
  ['run_4', 'run_5', 'run_6']  // current runs
);

if (regression?.isRegressed) {
  console.log(`Regression detected: ${regression.overallSeverity}`);
  console.log(regression.recommendation);
  
  for (const reg of regression.regressions) {
    console.log(`${reg.metric}: ${reg.changePct}% change`);
  }
}
```

### Compare Worker Costs

```typescript
const comparison = service.compareWorkerCosts(
  'claude-worker',
  baselineRunIds,
  currentRunIds
);

if (comparison?.regression.isRegression) {
  console.log(`Cost increased by ${comparison.regression.costIncreasePct}%`);
  console.log(`Severity: ${comparison.regression.severity}`);
}
```

## Regression Thresholds

The service uses the following thresholds for regression detection:

| Metric | Threshold | Severity Levels |
|--------|-----------|----------------|
| Success Rate | -15% | Minor: -15%, Moderate: -20%, Severe: -30% |
| Cost per Task | +25% | Minor: +25%, Moderate: +35%, Severe: +50% |
| Tokens per Task | +30% | Minor: +30%, Moderate: +45%, Severe: +60% |
| Evidence per Task | -20% | Minor: -20%, Moderate: -30%, Severe: -40% |

## Integration with Platform

The Worker Cost Tracker is automatically integrated into the platform:

```typescript
const platform = createPlatform();

// Access via platform
const report = platform.workerCostTracker.getRunCostReport(runId);
const breakdown = platform.workerCostTracker.getWorkerCostBreakdown(runId, workerName);
```

## Recommendations Explained

The service generates actionable recommendations:

1. **Total Cost Warning**: Suggests setting budgets when costs exceed $1
2. **High Cost Worker**: Identifies workers consuming >60% of total costs
3. **Efficiency Preference**: Recommends most efficient worker for cost-sensitive work
4. **High Cost per Task**: Flags workers with >$0.05 per task for prompt review

## Use Cases

### 1. Cost Budget Management

Monitor total worker costs per run and set alerts when budgets are exceeded.

### 2. Worker Selection Optimization

Use cost efficiency rankings to select the most cost-effective worker for specific tasks.

### 3. Quality Regression Alerts

Automatically detect when worker updates or configuration changes degrade performance.

### 4. Cost Trend Analysis

Track cost changes over time to identify optimization opportunities.

### 5. Multi-Worker Comparison

Compare multiple workers in the same run to determine best value for money.

## Implementation Details

### Cost Recording

Costs are recorded by the `ObservabilityService` during dispatcher operations:

```typescript
observability.recordCost({
  runId,
  source: 'worker',
  unit: 'token',
  quantity: tokenCount,
  estimatedUsd: cost,
  worker: workerName,
  model: modelName,
  entityId: spanId
});
```

### Efficiency Scoring Formula

```
score = (successRate * 50) - (costPerTask * 1000) - (tokensPer1000ms * 0.01) + 25
```

Where:
- `successRate`: 0-1 (proportion of successful tasks)
- `costPerTask`: USD cost per task
- `tokensPer1000ms`: Token consumption rate

Score is clamped between 0-100.

## Safety and Fail-Closed Behavior

- Returns `null` when insufficient data is available
- Handles empty runs gracefully
- Does not modify worker state or selection automatically
- Recommendations are advisory only
- All cost calculations use 4 decimal precision for money values

## Future Enhancements

Potential future improvements:
- Cost budget alerts via webhook
- Automatic worker deprioritization on severe regression
- Cost prediction based on task type
- Integration with external cost tracking systems
- Historical cost trend charts
- Cost allocation by task type or intent risk level
