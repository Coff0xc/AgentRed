# Knowledge Graph Enhancement with Neo4j

## Overview

The Knowledge Graph Enhancement extends AgentRed with advanced attack path storage and relationship reasoning capabilities using Neo4j. This is an **optional enhancement** - the platform works fully without Neo4j.

## Architecture

### Core Principles

1. **Optional Enhancement**: Platform works without Neo4j
2. **Derived Data**: Neo4j stores relationships and paths, not raw evidence
3. **First-Party Control**: All writes still go through first-party services
4. **Worker Isolation**: Workers never directly access Neo4j
5. **Fail-Closed**: Gracefully degrades when Neo4j is unavailable

### Data Model

The knowledge graph extends the platform's existing graph model with:

#### Node Types

- **Asset**: Target systems and resources (derived from Run target)
- **Vulnerability**: Security weaknesses (mapped from Facts)
- **Technique**: Attack techniques (mapped from Intents)
- **Credential**: Authentication contexts (mapped from CredentialReferences)
- **Evidence**: Proof artifacts (mapped from Evidence)
- **Finding**: Confirmed vulnerabilities (mapped from Findings)

#### Relationship Types

- **LEADS_TO**: One node enables progression to another
- **ENABLES**: One element makes another possible
- **REFERENCES**: Direct reference/citation relationship
- **EXPLOITS**: Exploitation relationship
- **GRANTS_ACCESS**: Access granting relationship
- **SUPPORTS**: Evidence supporting a conclusion
- **DERIVES_FROM**: Derivation relationship (e.g., fact from intent)

### Attack Paths

An **Attack Path** is a sequence of nodes and relationships that represents:
- Logical progression from target to vulnerability
- Evidence chain supporting a finding
- Relationship between assets, techniques, and outcomes

Each path includes:
- Start and end nodes
- Intermediate nodes and edges
- Path length and confidence score
- Risk scoring based on relationship confidence

## Setup

### Prerequisites

1. Neo4j database (Community or Enterprise Edition)
2. Node.js environment with neo4j-driver package

### Installation

```bash
# Install Neo4j driver (optional dependency)
npm install neo4j-driver

# Or if using Docker for Neo4j
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your-password \
  neo4j:latest
```

### Configuration

Set environment variables:

```bash
# Enable knowledge graph
PLATFORM_ENABLE_KNOWLEDGE_GRAPH=1

# Neo4j connection
NEO4J_URI=neo4j://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=neo4j  # Optional, defaults to 'neo4j'
```

### Service Integration

The knowledge graph service integrates with existing platform services:

```typescript
import { KnowledgeGraphService } from './knowledge-graph/knowledge-graph-service.js';

const kgConfig = {
  uri: process.env.NEO4J_URI || 'neo4j://localhost:7687',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  password: process.env.NEO4J_PASSWORD || '',
  database: process.env.NEO4J_DATABASE,
  enabled: process.env.PLATFORM_ENABLE_KNOWLEDGE_GRAPH === '1',
};

const kgService = new KnowledgeGraphService(store, kgConfig);
await kgService.initialize();
```

## Usage

### API Endpoints

#### Check Knowledge Graph Status

```bash
GET /knowledge-graph/status
```

Response:
```json
{
  "available": true,
  "features": {
    "attackPathAnalysis": true,
    "relationshipReasoning": true,
    "graphVisualization": true
  },
  "note": "Neo4j knowledge graph is enabled"
}
```

#### Sync Run to Knowledge Graph

```bash
POST /runs/{runId}/knowledge-graph/sync
```

Automatically creates nodes and relationships for:
- Run target (as asset node)
- All facts and evidence
- All findings with evidence relationships
- All intents (as technique nodes)

#### Get Knowledge Graph for Run

```bash
GET /runs/{runId}/knowledge-graph
```

Returns:
```json
{
  "runId": "run-abc123",
  "graph": {
    "nodes": [...],
    "edges": [...],
    "paths": [],
    "summary": {
      "nodeCount": 42,
      "edgeCount": 67,
      "pathCount": 0
    }
  },
  "visualization": {
    "note": "Use Neo4j Browser or graph visualization tools",
    "cypher": "MATCH (n:AttackNode {runId: \"run-abc123\"})-[r]->(m) RETURN n, r, m"
  }
}
```

#### Analyze Attack Paths

```bash
GET /runs/{runId}/attack-paths
```

Returns:
```json
{
  "runId": "run-abc123",
  "analysis": {
    "totalPaths": 5,
    "highRiskPaths": [...],
    "criticalNodes": [...],
    "keyRelationships": [...],
    "recommendations": [
      "Found 5 high-risk attack paths leading to critical findings",
      "Identified 3 critical nodes referenced by multiple attack paths",
      "Average relationship confidence: 85.4%"
    ]
  }
}
```

#### Infer Attack Paths

```bash
GET /runs/{runId}/attack-paths/infer
```

Automatically traces paths from target to confirmed findings through evidence and facts.

#### Find Paths Between Entities

```bash
GET /runs/{runId}/attack-paths/between/{startId}/{endId}
```

Finds all paths connecting two specific nodes (e.g., target to finding).

#### Get Finding Reasoning

```bash
GET /findings/{findingId}/reasoning
```

Returns:
```json
{
  "findingId": "finding-xyz789",
  "reasoning": {
    "finding": {...},
    "supportingEvidence": [...],
    "derivationPath": {
      "nodes": [...],
      "edges": [...],
      "length": 4,
      "riskScore": 0.87
    },
    "reasoning": [
      "Finding: SQL Injection (high)",
      "Validation state: confirmed",
      "Supported by 3 evidence items",
      "Attack path length: 4 steps",
      "Path confidence: 87.0%"
    ]
  }
}
```

#### Delete Run Knowledge Graph

```bash
DELETE /runs/{runId}/knowledge-graph
```

Removes all knowledge graph data for a run (does not affect primary storage).

#### Get Knowledge Graph Capabilities

```bash
GET /runs/{runId}/knowledge-graph/capabilities
```

Returns available features and setup instructions.

### Automatic Sync

The service can automatically sync state changes to Neo4j:

```typescript
// After adding a fact
await graphServer.addFact({
  runId,
  statement: 'Found SQL injection',
  evidenceIds: [evidenceId],
  createdBy: 'worker',
});

// Sync to knowledge graph
if (kgService.isAvailable()) {
  await kgService.syncFact(fact);
}
```

### Cypher Queries

Direct Cypher queries in Neo4j Browser:

```cypher
// View all nodes for a run
MATCH (n:AttackNode {runId: "run-abc123"})
RETURN n

// View attack paths from target to findings
MATCH path = (target:Asset {runId: "run-abc123"})
             -[*1..10]->(finding:Finding {runId: "run-abc123"})
WHERE finding.properties CONTAINS 'critical'
RETURN path

// Find critical nodes (highly connected)
MATCH (n:AttackNode {runId: "run-abc123"})
WITH n, 
     size((n)<-[]-(m)) as inDegree,
     size((n)-[]->(m)) as outDegree
WHERE inDegree + outDegree > 5
RETURN n, inDegree, outDegree
ORDER BY inDegree + outDegree DESC

// Find shortest path between two nodes
MATCH path = shortestPath(
  (start:AttackNode {id: "node-1"})
  -[*1..15]-
  (end:AttackNode {id: "node-2"})
)
RETURN path
```

## Use Cases

### 1. Attack Path Visualization

Visualize the logical progression from initial target to confirmed vulnerabilities:

```typescript
const analysis = await kgService.analyzeAttackPaths(runId);

for (const path of analysis.highRiskPaths) {
  console.log(`Path: ${path.startNodeId} -> ${path.endNodeId}`);
  console.log(`Length: ${path.length} steps`);
  console.log(`Risk Score: ${(path.riskScore * 100).toFixed(1)}%`);
  
  for (const node of path.nodes) {
    console.log(`  - ${node.type}: ${node.label}`);
  }
}
```

### 2. Evidence Chain Analysis

Trace how evidence supports findings:

```typescript
const reasoning = await kgService.getReasoningForFinding(findingId);

console.log(`Finding: ${reasoning.finding.title}`);
console.log(`Evidence chain:`);
for (const evidence of reasoning.supportingEvidence) {
  console.log(`  - ${evidence.kind} (${evidence.hash.substring(0, 8)}...)`);
}

if (reasoning.derivationPath) {
  console.log(`Derived through ${reasoning.derivationPath.length} steps`);
}
```

### 3. Critical Node Identification

Find nodes that are referenced by multiple attack paths:

```typescript
const analysis = await kgService.analyzeAttackPaths(runId);

console.log('Critical nodes (referenced by multiple paths):');
for (const node of analysis.criticalNodes) {
  console.log(`  - ${node.type}: ${node.label}`);
}
```

### 4. Relationship Reasoning

Understand how different entities relate:

```typescript
const graph = await kgService.getRunKnowledgeGraph(runId);

for (const edge of graph.edges) {
  const source = graph.nodes.find(n => n.id === edge.sourceNodeId);
  const target = graph.nodes.find(n => n.id === edge.targetNodeId);
  
  console.log(
    `${source.label} ${edge.relationshipType} ${target.label} ` +
    `(confidence: ${(edge.confidence * 100).toFixed(1)}%)`
  );
}
```

### 5. Run Comparison

Compare attack surface across runs:

```cypher
// Find common vulnerability patterns across runs
MATCH (f1:Finding)-[:SUPPORTS]->(e:Evidence)<-[:SUPPORTS]-(f2:Finding)
WHERE f1.runId <> f2.runId
AND f1.properties CONTAINS f2.properties
RETURN f1, f2, e
```

## Integration with Platform Services

### Graph Server

The knowledge graph service integrates with the existing GraphServer:

```typescript
// When a fact is added
const fact = await graphServer.addFact({...});

// Sync to knowledge graph
if (kgService.isAvailable()) {
  await kgService.syncFact(fact);
}
```

### Finding Service

When findings are created or validated:

```typescript
const finding = await findingService.createFinding({...});

if (kgService.isAvailable()) {
  await kgService.syncFinding(finding);
}
```

### Evidence Engine

Evidence is automatically linked to facts and findings:

```typescript
const evidence = await evidenceEngine.addEvidence({...});

// Relationships are created when facts reference this evidence
```

### Dispatcher

The dispatcher can trigger knowledge graph sync after explore tasks:

```typescript
// After concluding an intent
const fact = await graphServer.concludeIntent(intentId, {...});

if (kgService.isAvailable()) {
  await kgService.syncFact(fact);
}
```

## Performance Considerations

### Indexing

The service automatically creates indexes for:
- Node IDs (unique constraint)
- Run IDs (for filtering)
- Node types (for queries)
- Relationship confidence (for path scoring)

### Query Optimization

- Path queries are limited to depth 10 by default
- High-risk path queries limit results to top 20
- Critical node queries use degree centrality
- All queries are scoped to a single run

### Batch Operations

For large runs, sync operations can be batched:

```typescript
// Sync entire run at once
await kgService.syncRun(runId);
```

## Security Model

### Data Isolation

- Each run's graph is isolated by `runId`
- No cross-run queries by default
- Knowledge graph data can be deleted independently

### Access Control

- Same authentication as platform API
- Read-only query endpoints
- Sync operations log to run events
- No direct Cypher execution through API

### Privacy

- Raw evidence content stays in primary store
- Only metadata and relationships in Neo4j
- Redaction state preserved in node properties
- Hashes used instead of sensitive content

## Failure Modes and Recovery

### Neo4j Unavailable

When Neo4j is not available:
- Platform continues to work normally
- Knowledge graph operations return empty results
- API endpoints return 503 with explanation
- No errors thrown in sync operations

### Connection Loss

If connection is lost during operation:
- Service marks itself as unavailable
- Subsequent sync operations skip gracefully
- Can reconnect on next initialization

### Data Inconsistency

If Neo4j data becomes inconsistent:
1. Delete run knowledge graph: `DELETE /runs/{runId}/knowledge-graph`
2. Re-sync from primary store: `POST /runs/{runId}/knowledge-graph/sync`

### Schema Changes

Schema is created automatically on initialization. For manual schema updates:

```cypher
// Create additional indexes
CREATE INDEX IF NOT EXISTS FOR (n:AttackNode) ON (n.createdAt)

// Add constraints
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Evidence) REQUIRE n.hash IS UNIQUE
```

## Monitoring and Observability

### Health Checks

```bash
# Check if Neo4j is available
GET /knowledge-graph/status

# Check capabilities for a run
GET /runs/{runId}/knowledge-graph/capabilities
```

### Metrics

Track:
- Number of nodes per run
- Number of relationships per run
- Attack path count and average length
- Query response times
- Sync operation durations

### Logging

Knowledge graph operations log to:
- Platform trace spans
- Run events (for sync operations)
- Neo4j query logs (in Neo4j itself)

## Future Enhancements

Potential improvements (not yet implemented):

1. **Real-time Sync**: WebSocket-based automatic sync
2. **Cross-Run Analysis**: Compare attack patterns across runs
3. **Machine Learning**: Path prediction using graph algorithms
4. **Visual UI**: Browser-based graph visualization
5. **Export Formats**: GraphML, GEXF for external tools
6. **Advanced Queries**: PageRank, betweenness centrality
7. **Temporal Analysis**: Track how attack paths evolve over time
8. **Pattern Library**: Reusable attack pattern templates

## References

- Neo4j Documentation: https://neo4j.com/docs/
- Cypher Query Language: https://neo4j.com/docs/cypher-manual/
- Graph Data Science: https://neo4j.com/docs/graph-data-science/
- Neo4j Driver API: https://neo4j.com/docs/api/javascript-driver/

## Troubleshooting

### Neo4j not connecting

```bash
# Test Neo4j connection
curl http://localhost:7474

# Check Neo4j logs
docker logs neo4j

# Verify credentials
cypher-shell -u neo4j -p your-password
```

### Slow queries

```cypher
// Check query execution plan
EXPLAIN MATCH (n:AttackNode {runId: "run-abc123"}) RETURN n

// Profile actual query
PROFILE MATCH path = (start)-[*1..10]->(end) RETURN path
```

### Memory issues

```bash
# Increase Neo4j memory (in neo4j.conf or Docker)
NEO4J_dbms_memory_heap_initial__size=512m
NEO4J_dbms_memory_heap_max__size=2G
```

### Clear all data

```cypher
// Delete all nodes and relationships
MATCH (n) DETACH DELETE n

// Re-initialize schema
// Restart platform service to recreate constraints/indexes
```
