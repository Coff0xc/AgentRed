# Multi-Agent Collaboration Mode

AgentRed supports parallel multi-agent collaboration with specialized worker roles, enabling Scout, Exploit, and Credential workers to operate concurrently on different exploration paths within the same run.

## Overview

Traditional single-agent workflows process one intent at a time sequentially. Multi-agent collaboration allows multiple specialized workers to claim and explore different intents in parallel, significantly improving throughput and enabling domain-specific expertise.

## Worker Roles

### Scout
**Purpose**: Reconnaissance and surface mapping  
**Typical Tasks**:
- Enumerate endpoints and assets
- Fingerprint technologies
- Map attack surface
- Discover hidden functionality
- Passive information gathering

**Example Intent**:
```json
{
  "description": "Map all API endpoints exposed by the application",
  "riskLevel": "R1",
  "role": "scout"
}
```

### Exploit
**Purpose**: Vulnerability validation and proof-of-concept development  
**Typical Tasks**:
- Test injection vulnerabilities
- Verify XSS and CSRF
- Validate business logic flaws
- Execute OAST callbacks
- Confirm exploitability

**Example Intent**:
```json
{
  "description": "Verify SQL injection in /api/users search parameter",
  "riskLevel": "R3",
  "role": "exploit"
}
```

### Credential
**Purpose**: Authentication and authorization testing  
**Typical Tasks**:
- Compare anonymous vs authenticated access
- Test privilege escalation
- Validate RBAC controls
- Assess credential handling
- Compare role-based access differences

**Example Intent**:
```json
{
  "description": "Compare user vs admin access to /admin endpoints",
  "riskLevel": "R2",
  "role": "credential"
}
```

### Generalist
**Purpose**: General-purpose worker that can handle any intent type  
**Behavior**: Acts as a fallback when no specialized worker is available

## Configuration

### Worker Pool Setup

Configure workers with roles in the run's worker pool:

```typescript
const run = graph.createRun({
  target: 'https://app.example.com',
  goal: 'Multi-agent security assessment',
  scopePolicy: { /* ... */ },
  workerPool: [
    {
      name: 'scout-worker',
      type: 'claude',
      role: 'scout',
      maxRunning: 2,
      priority: 0,
    },
    {
      name: 'exploit-worker',
      type: 'claude',
      role: 'exploit',
      maxRunning: 1,
      priority: 0,
    },
    {
      name: 'credential-worker',
      type: 'claude',
      role: 'credential',
      maxRunning: 1,
      priority: 0,
    },
    {
      name: 'generalist-worker',
      type: 'claude',
      role: 'generalist',
      maxRunning: 1,
      priority: 1,
    },
  ],
});
```

### Creating Role-Tagged Intents

Workers can propose intents with role tags during the `reason` phase:

```json
{
  "accepted": true,
  "data": {
    "intent": {
      "from": ["fact_baseline"],
      "description": "Enumerate all form endpoints for parameter analysis",
      "riskLevel": "R1",
      "role": "scout"
    }
  }
}
```

## Worker Selection Algorithm

The worker selection policy uses the following priority order:

1. **Exact Role Match (+20 score)**: When intent.role matches worker.role
2. **Generalist Fallback**: When no exact match is available
3. **Role Mismatch Penalty (-8 score)**: When specialized worker handles mismatched intent
4. **Unspecified Worker**: Workers without a role can handle any intent

### Selection Examples

#### Case 1: Perfect Match
- Intent: `role: "scout"`
- Available: scout-worker (role: scout), generalist-worker
- **Selected**: scout-worker (exact match)

#### Case 2: Generalist Fallback
- Intent: `role: "exploit"`
- Available: scout-worker, generalist-worker
- **Selected**: generalist-worker (no exploit worker available)

#### Case 3: No Role Specified
- Intent: no role field
- Available: scout-worker, generalist-worker
- **Selected**: generalist-worker (prefers generalist for unspecified intents)

## Parallel Dispatch Service

### API

```typescript
import { ParallelDispatchService } from './scheduling/parallel-dispatch-service.js';

const parallelDispatch = new ParallelDispatchService(graph, dispatcher);

// Preview how intents would be assigned
const preview = await parallelDispatch.previewParallelDispatch(runId, {
  maxParallel: 3,
  requireRoleMatch: true,
  allowGeneralistFallback: true,
});

console.log(preview.assignments);
// [
//   { intent: { id: 'intent_1', role: 'scout' }, worker: { name: 'scout-1', role: 'scout' }, reason: 'Exact role match' },
//   { intent: { id: 'intent_2', role: 'exploit' }, worker: { name: 'exploit-1', role: 'exploit' }, reason: 'Exact role match' },
//   { intent: { id: 'intent_3', role: 'credential' }, worker: { name: 'cred-1', role: 'credential' }, reason: 'Exact role match' }
// ]
```

### Strategy Options

```typescript
interface ParallelDispatchStrategy {
  /** Maximum number of intents to dispatch in parallel. Default: 3 */
  maxParallel?: number;
  
  /** Whether to require role matching for parallel dispatch. Default: true */
  requireRoleMatch?: boolean;
  
  /** Whether to allow generalist workers to claim specialized intents. Default: true */
  allowGeneralistFallback?: boolean;
}
```

## Benefits

### Throughput
- Multiple exploration paths execute concurrently
- Reduce overall assessment time
- Better utilization of available workers

### Specialization
- Workers can be optimized for specific task types
- Domain expertise encoded in prompts/configs
- Better quality results per role

### Isolation
- Failures in one exploration path don't block others
- Each worker operates within its own intent lease
- Clear separation of concerns

## Safety Boundaries

All multi-agent workers still operate under the same security model:

- **Tool Gateway**: All tool calls must pass through the gateway
- **Scope Policy**: All targets must be within authorized scope
- **Approval Gates**: R3/R4 actions still require human approval
- **Evidence Requirements**: All findings must reference evidence
- **Audit Trail**: All actions are logged and traceable

Workers **cannot**:
- Execute tools directly
- Write facts, evidence, or findings directly
- Communicate with other workers
- Bypass approval or scope checks

## Usage Patterns

### Pattern 1: Phased Exploration

```typescript
// Phase 1: Scout discovers attack surface
graph.createIntent({
  runId,
  fromFactIds: [],
  hypothesis: 'Enumerate all exposed endpoints',
  riskLevel: 'R1',
  role: 'scout',
  createdBy: 'bootstrap',
});

// Phase 2: Exploit validates vulnerabilities (created after scout completes)
// Phase 3: Credential tests authorization (created after exploit confirms findings)
```

### Pattern 2: Parallel Independent Paths

```typescript
// All three can run simultaneously on independent targets
graph.createIntent({
  runId,
  hypothesis: 'Map /api/* endpoints',
  riskLevel: 'R1',
  role: 'scout',
  createdBy: 'reason',
});

graph.createIntent({
  runId,
  hypothesis: 'Test XSS in /search?q= parameter',
  riskLevel: 'R2',
  role: 'exploit',
  createdBy: 'reason',
});

graph.createIntent({
  runId,
  hypothesis: 'Compare anonymous vs user access to /dashboard',
  riskLevel: 'R2',
  role: 'credential',
  createdBy: 'reason',
});
```

### Pattern 3: Specialized Worker Pools

```typescript
// Lightweight scout pool for broad coverage
const scoutPool = [
  { name: 'scout-1', role: 'scout', maxRunning: 3 },
  { name: 'scout-2', role: 'scout', maxRunning: 3 },
];

// Careful exploit pool for high-risk validation
const exploitPool = [
  { name: 'exploit-1', role: 'exploit', maxRunning: 1 },
];

// Dedicated credential testing
const credentialPool = [
  { name: 'credential-1', role: 'credential', maxRunning: 1 },
];
```

## Migration Guide

### From Single-Agent to Multi-Agent

1. **Add role field to worker configs**:
   ```typescript
   // Before
   { name: 'worker-1', type: 'claude', maxRunning: 1, priority: 0 }
   
   // After
   { name: 'scout-1', type: 'claude', role: 'scout', maxRunning: 2, priority: 0 }
   ```

2. **Update worker prompts to emit role in intents**:
   ```json
   {
     "intent": {
       "description": "...",
       "role": "scout"  // Add this field
     }
   }
   ```

3. **Use ParallelDispatchService for preview**:
   ```typescript
   const preview = await parallelDispatch.previewParallelDispatch(runId);
   // Review assignments before actual dispatch
   ```

### Backward Compatibility

- Workers without `role` field are treated as unspecified (can handle any intent)
- Intents without `role` field can be claimed by any available worker
- Single-worker pools continue to work as before
- Existing `Dispatcher.dispatchOnce()` remains unchanged

## Performance Considerations

### Worker Concurrency

Each worker's `maxRunning` limit controls parallelism:

```typescript
{
  name: 'scout-1',
  role: 'scout',
  maxRunning: 3,  // Can handle 3 intents simultaneously
}
```

### Intent Lease Management

- Each claimed intent has a lease timeout (default: 5 minutes)
- Expired leases are automatically released and become claimable again
- Workers must heartbeat to extend active leases
- Failed workers don't block indefinitely

### Resource Usage

- More parallel workers = higher API costs
- More parallel workers = higher memory usage
- Monitor token consumption per worker role
- Use `maxParallel` to limit concurrent exploration

## Observability

### Worker Selection Reports

```typescript
const report = await workerSelectionPolicy.preview(runId);

console.log(report.selectedWorker);
// {
//   worker: 'scout-1',
//   role: 'scout',
//   selectionScore: 85,
//   reasons: ['role match: scout worker for scout intent', 'evidence contribution 5 global / 2 current']
// }
```

### Monitoring Metrics

- Worker selection scores by role
- Intent throughput per role
- Role match vs. fallback ratio
- Average time-to-claim per intent role
- Evidence contribution per worker role

## Future Enhancements

### Planned (P3)
- Worker role specialization via fine-tuned prompts
- Cross-worker coordination through shared facts (read-only)
- Role-based cost budgets and rate limiting
- Dynamic worker pool scaling based on intent backlog

### Under Consideration
- Worker role chains (scout → exploit → report)
- Intent priority queues per role
- Role-specific tool allowlists
- Cross-role handoff protocols

## References

- [Worker Selection Policy Service](../src/scheduling/worker-selection-policy-service.ts)
- [Parallel Dispatch Service](../src/scheduling/parallel-dispatch-service.ts)
- [Worker Protocol](../src/workers/protocol.ts)
- [Dispatcher Implementation](../src/dispatcher/dispatcher.ts)
