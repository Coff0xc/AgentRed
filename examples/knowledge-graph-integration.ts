/**
 * Knowledge Graph Integration Example
 *
 * Demonstrates how to integrate the Neo4j knowledge graph
 * with the existing platform services.
 */

import { createMemoryStore } from '../src/storage/store.js';
import { GraphServer } from '../src/graph/graph-server.js';
import { KnowledgeGraphService } from '../src/knowledge-graph/knowledge-graph-service.js';
import { RunEventService } from '../src/events/run-event-service.js';
import { EvidenceEngine } from '../src/evidence/evidence-engine.js';
import { FindingService } from '../src/findings/finding-service.js';
import type { Neo4jConfig } from '../src/knowledge-graph/neo4j-adapter.js';

/**
 * Example 1: Basic Setup
 */
async function basicSetup() {
  console.log('=== Example 1: Basic Setup ===\n');

  // Create platform services
  const store = createMemoryStore();
  const events = new RunEventService(store);
  const graphServer = new GraphServer(store, events);

  // Configure Neo4j (read from environment or use defaults)
  const kgConfig: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'neo4j://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE,
    enabled: process.env.PLATFORM_ENABLE_KNOWLEDGE_GRAPH === '1',
  };

  // Initialize knowledge graph service
  const kgService = new KnowledgeGraphService(store, kgConfig);
  const available = await kgService.initialize();

  console.log(`Knowledge Graph Available: ${available}`);

  if (!available) {
    console.log('Platform continues to work without Neo4j\n');
  }

  return { store, graphServer, kgService, events };
}

/**
 * Example 2: Automatic Sync on State Changes
 */
async function automaticSync() {
  console.log('=== Example 2: Automatic Sync ===\n');

  const { store, graphServer, kgService } = await basicSetup();

  // Create a run
  const run = graphServer.createRun({
    target: 'https://example.com',
    goal: 'Find security vulnerabilities',
    scopePolicy: {
      allowedAssets: ['https://example.com'],
      deniedAssets: [],
      allowedMethods: ['GET', 'POST'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: false },
      rateLimits: { requestsPerMinute: 60 },
    },
    workerPool: [],
  });

  console.log(`Created run: ${run.id}`);

  // Sync run target to knowledge graph
  if (kgService.isAvailable()) {
    await kgService.syncRunTarget(run);
    console.log('Synced run target to knowledge graph');
  }

  // Add a fact
  const fact = graphServer.addFact({
    runId: run.id,
    statement: 'Found login endpoint at /api/auth/login',
    evidenceIds: [],
    createdBy: 'worker',
  });

  console.log(`Added fact: ${fact.id}`);

  // Sync fact to knowledge graph
  if (kgService.isAvailable()) {
    await kgService.syncFact(fact);
    console.log('Synced fact to knowledge graph');
  }

  await kgService.close();
}

/**
 * Example 3: Finding with Evidence Chain
 */
async function findingWithEvidenceChain() {
  console.log('=== Example 3: Finding with Evidence Chain ===\n');

  const { store, graphServer, kgService, events } = await basicSetup();

  // Create a run
  const run = graphServer.createRun({
    target: 'https://example.com',
    goal: 'Security assessment',
    scopePolicy: {
      allowedAssets: ['https://example.com'],
      deniedAssets: [],
      allowedMethods: ['GET', 'POST'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: false },
      rateLimits: { requestsPerMinute: 60 },
    },
    workerPool: [],
  });

  // Add evidence
  const evidenceEngine = new EvidenceEngine(store, events);
  const evidence1 = evidenceEngine.addEvidence({
    runId: run.id,
    kind: 'http_exchange',
    redactionState: 'redacted',
    content: 'HTTP request/response showing SQL error',
  });

  const evidence2 = evidenceEngine.addEvidence({
    runId: run.id,
    kind: 'command_output',
    redactionState: 'redacted',
    content: 'sqlmap output confirming injection',
  });

  console.log(`Added evidence: ${evidence1.id}, ${evidence2.id}`);

  // Add a fact referencing the evidence
  const fact = graphServer.addFact({
    runId: run.id,
    statement: 'SQL injection confirmed in login parameter',
    evidenceIds: [evidence1.id, evidence2.id],
    createdBy: 'worker',
  });

  console.log(`Added fact: ${fact.id}`);

  // Create a finding
  const findingService = new FindingService(store, events);
  const finding = findingService.createFinding({
    runId: run.id,
    title: 'SQL Injection in Login Form',
    description: 'The login form is vulnerable to SQL injection',
    severity: 'critical',
    evidenceIds: [evidence1.id, evidence2.id],
  });

  console.log(`Created finding: ${finding.id}`);

  // Sync to knowledge graph
  if (kgService.isAvailable()) {
    await kgService.syncFact(fact);
    await kgService.syncFinding(finding);
    console.log('Synced fact and finding to knowledge graph');

    // Get reasoning for the finding
    const reasoning = await kgService.getReasoningForFinding(finding.id);
    console.log('\nReasoning:');
    for (const line of reasoning.reasoning) {
      console.log(`  ${line}`);
    }
  }

  await kgService.close();
}

/**
 * Example 4: Attack Path Analysis
 */
async function attackPathAnalysis() {
  console.log('=== Example 4: Attack Path Analysis ===\n');

  const { store, graphServer, kgService, events } = await basicSetup();

  // Create a run with multiple findings
  const run = graphServer.createRun({
    target: 'https://example.com',
    goal: 'Comprehensive security test',
    scopePolicy: {
      allowedAssets: ['https://example.com'],
      deniedAssets: [],
      allowedMethods: ['GET', 'POST'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: false },
      rateLimits: { requestsPerMinute: 60 },
    },
    workerPool: [],
  });

  // Create evidence and findings
  const evidenceEngine = new EvidenceEngine(store, events);
  const findingService = new FindingService(store, events);

  // Finding 1: Information disclosure
  const evidence1 = evidenceEngine.addEvidence({
    runId: run.id,
    kind: 'http_exchange',
    redactionState: 'redacted',
    content: 'Server version exposed in headers',
  });

  const finding1 = findingService.createFinding({
    runId: run.id,
    title: 'Information Disclosure',
    description: 'Server version exposed',
    severity: 'low',
    evidenceIds: [evidence1.id],
  });

  // Finding 2: Authentication bypass
  const evidence2 = evidenceEngine.addEvidence({
    runId: run.id,
    kind: 'http_exchange',
    redactionState: 'redacted',
    content: 'Admin panel accessible without auth',
  });

  const finding2 = findingService.createFinding({
    runId: run.id,
    title: 'Authentication Bypass',
    description: 'Admin panel lacks authentication',
    severity: 'critical',
    evidenceIds: [evidence2.id],
  });

  // Validate findings
  findingService.validateFinding(finding1.id, 'confirmed', 'operator', 'Verified manually');
  findingService.validateFinding(finding2.id, 'confirmed', 'operator', 'Verified manually');

  console.log(`Created findings: ${finding1.id}, ${finding2.id}`);

  // Sync entire run to knowledge graph
  if (kgService.isAvailable()) {
    await kgService.syncRun(run.id);
    console.log('Synced entire run to knowledge graph');

    // Analyze attack paths
    const analysis = await kgService.analyzeAttackPaths(run.id);

    console.log('\nAttack Path Analysis:');
    console.log(`  Total paths: ${analysis.totalPaths}`);
    console.log(`  High-risk paths: ${analysis.highRiskPaths.length}`);
    console.log(`  Critical nodes: ${analysis.criticalNodes.length}`);
    console.log(`  Key relationships: ${analysis.keyRelationships.length}`);

    console.log('\nRecommendations:');
    for (const rec of analysis.recommendations) {
      console.log(`  - ${rec}`);
    }

    // Get the full knowledge graph
    const graph = await kgService.getRunKnowledgeGraph(run.id);
    console.log(`\nKnowledge Graph: ${graph.summary.nodeCount} nodes, ${graph.summary.edgeCount} edges`);
  }

  await kgService.close();
}

/**
 * Example 5: Path Finding Between Entities
 */
async function pathFindingExample() {
  console.log('=== Example 5: Path Finding ===\n');

  const { store, graphServer, kgService, events } = await basicSetup();

  const run = graphServer.createRun({
    target: 'https://example.com',
    goal: 'Find paths from target to vulnerabilities',
    scopePolicy: {
      allowedAssets: ['https://example.com'],
      deniedAssets: [],
      allowedMethods: ['GET', 'POST'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: false },
      rateLimits: { requestsPerMinute: 60 },
    },
    workerPool: [],
  });

  // Create a chain: Target -> Intent -> Fact -> Evidence -> Finding
  const intent = graphServer.addIntent({
    runId: run.id,
    description: 'Test login functionality',
    reasoning: 'Check for authentication issues',
    riskLevel: 'R1',
  });

  const evidenceEngine = new EvidenceEngine(store, events);
  const evidence = evidenceEngine.addEvidence({
    runId: run.id,
    kind: 'http_exchange',
    redactionState: 'redacted',
    content: 'Captured authentication bypass',
  });

  const fact = graphServer.addFact({
    runId: run.id,
    fromIntentId: intent.id,
    statement: 'Authentication can be bypassed',
    evidenceIds: [evidence.id],
    createdBy: 'worker',
  });

  const findingService = new FindingService(store, events);
  const finding = findingService.createFinding({
    runId: run.id,
    title: 'Critical Authentication Bypass',
    description: 'Authentication mechanism can be bypassed',
    severity: 'critical',
    evidenceIds: [evidence.id],
  });

  findingService.validateFinding(finding.id, 'confirmed', 'operator', 'Verified');

  console.log('Created entity chain: Target -> Intent -> Fact -> Evidence -> Finding');

  // Sync to knowledge graph
  if (kgService.isAvailable()) {
    await kgService.syncRun(run.id);
    console.log('Synced to knowledge graph');

    // Find paths from target to finding
    const targetNodeId = `asset-${run.id}`;
    const findingNodeId = finding.id;

    const paths = await kgService.findPathsBetween(run.id, targetNodeId, findingNodeId);

    console.log(`\nFound ${paths.length} path(s) from target to finding:`);
    for (const path of paths) {
      console.log(`\nPath ${path.id}:`);
      console.log(`  Length: ${path.length} steps`);
      console.log(`  Risk Score: ${(path.riskScore * 100).toFixed(1)}%`);
      console.log('  Nodes:');
      for (const node of path.nodes) {
        console.log(`    - ${node.type}: ${node.label.substring(0, 50)}`);
      }
    }
  }

  await kgService.close();
}

/**
 * Example 6: Graceful Degradation Without Neo4j
 */
async function gracefulDegradation() {
  console.log('=== Example 6: Graceful Degradation ===\n');

  const { store, graphServer, kgService } = await basicSetup();

  const run = graphServer.createRun({
    target: 'https://example.com',
    goal: 'Test without Neo4j',
    scopePolicy: {
      allowedAssets: ['https://example.com'],
      deniedAssets: [],
      allowedMethods: ['GET'],
      destructiveAllowed: false,
      credentialRules: { allowVaultReferencesOnly: false },
      rateLimits: { requestsPerMinute: 60 },
    },
    workerPool: [],
  });

  console.log(`Created run: ${run.id}`);

  // Try to sync (will gracefully skip if Neo4j is unavailable)
  await kgService.syncRunTarget(run);
  console.log('Sync attempted (gracefully skipped if Neo4j unavailable)');

  // Try to analyze (will return empty results if Neo4j is unavailable)
  const analysis = await kgService.analyzeAttackPaths(run.id);
  console.log(`\nAnalysis returned ${analysis.totalPaths} paths`);
  console.log('Recommendations:');
  for (const rec of analysis.recommendations) {
    console.log(`  - ${rec}`);
  }

  // Platform continues to work normally
  const fact = graphServer.addFact({
    runId: run.id,
    statement: 'Platform works without Neo4j',
    evidenceIds: [],
    createdBy: 'system',
  });

  console.log(`\nAdded fact: ${fact.id}`);
  console.log('Platform continues to function normally without Neo4j');

  await kgService.close();
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    await automaticSync();
    console.log('\n' + '='.repeat(60) + '\n');

    await findingWithEvidenceChain();
    console.log('\n' + '='.repeat(60) + '\n');

    await attackPathAnalysis();
    console.log('\n' + '='.repeat(60) + '\n');

    await pathFindingExample();
    console.log('\n' + '='.repeat(60) + '\n');

    await gracefulDegradation();

    console.log('\n✓ All examples completed');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}

export {
  basicSetup,
  automaticSync,
  findingWithEvidenceChain,
  attackPathAnalysis,
  pathFindingExample,
  gracefulDegradation,
};
