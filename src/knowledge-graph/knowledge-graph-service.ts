/**
 * Knowledge Graph Service
 *
 * Integrates Neo4j knowledge graph with the platform's existing graph model.
 * This service automatically derives attack paths and relationships from
 * platform state without requiring Workers to understand graph structure.
 *
 * Core principles:
 * - Automatically sync relevant state changes to Neo4j
 * - Workers never directly access Neo4j
 * - All writes still go through first-party services
 * - Graph analysis results are exposed through read-only APIs
 * - Falls back gracefully when Neo4j is unavailable
 */

import { newId, nowIso } from '../domain/ids.js';
import type { Evidence, Fact, Finding, Intent, Run } from '../domain/types.js';
import type { PlatformStore } from '../storage/store.js';
import {
  Neo4jKnowledgeGraphAdapter,
  type AttackPathNode,
  type AttackPathEdge,
  type AttackPath,
  type GraphQueryResult,
  type Neo4jConfig,
} from './neo4j-adapter.js';

export interface KnowledgeGraphSyncEvent {
  type: 'fact_added' | 'evidence_added' | 'finding_added' | 'intent_concluded';
  runId: string;
  entityId: string;
  timestamp: string;
}

export interface AttackPathAnalysis {
  runId: string;
  totalPaths: number;
  highRiskPaths: AttackPath[];
  criticalNodes: AttackPathNode[];
  keyRelationships: AttackPathEdge[];
  recommendations: string[];
}

/**
 * Knowledge Graph Service
 *
 * Bridges platform state with Neo4j for advanced attack path analysis.
 * Optional - platform works without Neo4j.
 */
export class KnowledgeGraphService {
  private adapter: Neo4jKnowledgeGraphAdapter;
  private syncEnabled: boolean = false;

  constructor(
    private readonly store: PlatformStore,
    config: Neo4jConfig
  ) {
    this.adapter = new Neo4jKnowledgeGraphAdapter(config);
  }

  /**
   * Initialize Neo4j connection and schema
   */
  async initialize(): Promise<boolean> {
    const available = await this.adapter.initialize();
    if (available) {
      await this.adapter.setupSchema();
      this.syncEnabled = true;
    }
    return available;
  }

  /**
   * Check if knowledge graph is available
   */
  isAvailable(): boolean {
    return this.adapter.isAvailable();
  }

  /**
   * Close Neo4j connection
   */
  async close(): Promise<void> {
    await this.adapter.close();
    this.syncEnabled = false;
  }

  /**
   * Sync a fact to the knowledge graph
   * Creates nodes and relationships based on fact content
   */
  async syncFact(fact: Fact): Promise<void> {
    if (!this.syncEnabled) {
      return;
    }

    // Create a node for the fact
    const factNode: AttackPathNode = {
      id: fact.id,
      type: 'evidence',
      label: fact.statement.substring(0, 100),
      runId: fact.runId,
      properties: {
        statement: fact.statement,
        confidence: fact.confidence,
        createdBy: fact.createdBy,
        evidenceIds: fact.evidenceIds,
      },
      createdAt: fact.createdAt,
    };

    await this.adapter.addNode(factNode);

    // If the fact references evidence, create relationships
    for (const evidenceId of fact.evidenceIds || []) {
      const evidence = this.store.state.evidence[evidenceId];
      if (evidence) {
        await this.syncEvidence(evidence);

        // Create REFERENCES relationship
        const edge: AttackPathEdge = {
          id: newId('edge'),
          sourceNodeId: fact.id,
          targetNodeId: evidence.id,
          relationshipType: 'REFERENCES',
          runId: fact.runId,
          properties: {},
          confidence: 1.0,
          createdAt: nowIso(),
        };

        await this.adapter.addEdge(edge);
      }
    }

    // If the fact came from an intent, create relationship
    if (fact.fromIntentId) {
      const intent = this.store.state.intents[fact.fromIntentId];
      if (intent) {
        await this.syncIntent(intent);

        const edge: AttackPathEdge = {
          id: newId('edge'),
          sourceNodeId: intent.id,
          targetNodeId: fact.id,
          relationshipType: 'DERIVES_FROM',
          runId: fact.runId,
          properties: {},
          confidence: 1.0,
          createdAt: nowIso(),
        };

        await this.adapter.addEdge(edge);
      }
    }
  }

  /**
   * Sync evidence to the knowledge graph
   */
  async syncEvidence(evidence: Evidence): Promise<void> {
    if (!this.syncEnabled) {
      return;
    }

    const evidenceNode: AttackPathNode = {
      id: evidence.id,
      type: 'evidence',
      label: `${evidence.kind} evidence`,
      runId: evidence.runId,
      properties: {
        kind: evidence.kind,
        redactionState: evidence.redactionState,
        sha256: evidence.sha256,
        toolCallId: evidence.toolCallId,
      },
      createdAt: evidence.createdAt,
    };

    await this.adapter.addNode(evidenceNode);
  }

  /**
   * Sync a finding to the knowledge graph
   */
  async syncFinding(finding: Finding): Promise<void> {
    if (!this.syncEnabled) {
      return;
    }

    const findingNode: AttackPathNode = {
      id: finding.id,
      type: 'finding',
      label: finding.title,
      runId: finding.runId,
      properties: {
        title: finding.title,
        impact: finding.impact,
        severity: finding.severity,
        validationState: finding.validationState,
      },
      createdAt: finding.createdAt,
    };

    await this.adapter.addNode(findingNode);

    // Create relationships to evidence
    for (const evidenceId of finding.evidenceIds) {
      const evidence = this.store.state.evidence[evidenceId];
      if (evidence) {
        await this.syncEvidence(evidence);

        const edge: AttackPathEdge = {
          id: newId('edge'),
          sourceNodeId: finding.id,
          targetNodeId: evidence.id,
          relationshipType: 'SUPPORTS',
          runId: finding.runId,
          properties: {},
          confidence: 1.0,
          createdAt: nowIso(),
        };

        await this.adapter.addEdge(edge);
      }
    }
  }

  /**
   * Sync an intent to the knowledge graph
   */
  async syncIntent(intent: Intent): Promise<void> {
    if (!this.syncEnabled) {
      return;
    }

    const intentNode: AttackPathNode = {
      id: intent.id,
      type: 'technique',
      label: intent.hypothesis.substring(0, 100),
      runId: intent.runId,
      properties: {
        hypothesis: intent.hypothesis,
        status: intent.status,
        riskLevel: intent.riskLevel,
      },
      createdAt: intent.createdAt,
    };

    await this.adapter.addNode(intentNode);
  }

  /**
   * Sync a run's target as an asset node
   */
  async syncRunTarget(run: Run): Promise<void> {
    if (!this.syncEnabled) {
      return;
    }

    const targetNode: AttackPathNode = {
      id: `asset-${run.id}`,
      type: 'asset',
      label: run.target,
      runId: run.id,
      properties: {
        target: run.target,
        goal: run.goal,
      },
      createdAt: run.createdAt,
    };

    await this.adapter.addNode(targetNode);
  }

  /**
   * Infer and create attack path relationships from existing data
   */
  async inferAttackPaths(runId: string): Promise<AttackPath[]> {
    if (!this.syncEnabled) {
      return [];
    }

    // Get all facts and findings for the run
    const facts = Object.values(this.store.state.facts).filter(f => f.runId === runId);
    const findings = Object.values(this.store.state.findings).filter(f => f.runId === runId);

    const inferredPaths: AttackPath[] = [];

    // For each finding, trace back to the target through evidence and facts
    for (const finding of findings) {
      if (finding.validationState === 'confirmed') {
        const run = this.store.state.runs[runId];
        if (run) {
          const targetNodeId = `asset-${run.id}`;
          const findingNodeId = finding.id;

          const paths = await this.adapter.findAttackPaths(
            runId,
            targetNodeId,
            findingNodeId,
            10
          );

          inferredPaths.push(...paths);
        }
      }
    }

    return inferredPaths;
  }

  /**
   * Analyze attack paths and provide insights
   */
  async analyzeAttackPaths(runId: string): Promise<AttackPathAnalysis> {
    if (!this.syncEnabled) {
      return {
        runId,
        totalPaths: 0,
        highRiskPaths: [],
        criticalNodes: [],
        keyRelationships: [],
        recommendations: ['Neo4j knowledge graph not available'],
      };
    }

    // Find high-risk paths
    const highRiskPaths = await this.adapter.findHighRiskPaths(runId, 0.7);

    // Get the full subgraph
    const subgraph = await this.adapter.getRunSubgraph(runId);

    // Find critical nodes (nodes with many incoming relationships)
    const nodeDegrees = new Map<string, number>();
    for (const edge of subgraph.edges) {
      nodeDegrees.set(edge.targetNodeId, (nodeDegrees.get(edge.targetNodeId) || 0) + 1);
    }

    const criticalNodes = subgraph.nodes
      .filter(n => (nodeDegrees.get(n.id) || 0) >= 3)
      .sort((a, b) => (nodeDegrees.get(b.id) || 0) - (nodeDegrees.get(a.id) || 0))
      .slice(0, 10);

    // Find key relationships (high confidence edges)
    const keyRelationships = subgraph.edges
      .filter(e => e.confidence >= 0.8)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    // Generate recommendations
    const recommendations: string[] = [];

    if (highRiskPaths.length > 0) {
      recommendations.push(
        `Found ${highRiskPaths.length} high-risk attack paths leading to critical findings`
      );
    }

    if (criticalNodes.length > 0) {
      recommendations.push(
        `Identified ${criticalNodes.length} critical nodes that are referenced by multiple attack paths`
      );
    }

    if (subgraph.edges.length > 0) {
      const avgConfidence = subgraph.edges.reduce((sum, e) => sum + e.confidence, 0) / subgraph.edges.length;
      recommendations.push(
        `Average relationship confidence: ${(avgConfidence * 100).toFixed(1)}%`
      );
    }

    if (highRiskPaths.length === 0 && subgraph.nodes.length > 5) {
      recommendations.push(
        'Consider exploring relationships between existing evidence and findings'
      );
    }

    return {
      runId,
      totalPaths: highRiskPaths.length,
      highRiskPaths,
      criticalNodes,
      keyRelationships,
      recommendations,
    };
  }

  /**
   * Sync entire run to knowledge graph
   */
  async syncRun(runId: string): Promise<void> {
    const run = this.store.state.runs[runId];
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (!this.syncEnabled) {
      return;
    }

    // Sync target
    await this.syncRunTarget(run);

    // Sync all facts
    const facts = Object.values(this.store.state.facts).filter(f => f.runId === runId);
    for (const fact of facts) {
      await this.syncFact(fact);
    }

    // Sync all findings
    const findings = Object.values(this.store.state.findings).filter(f => f.runId === runId);
    for (const finding of findings) {
      await this.syncFinding(finding);
    }

    // Sync all intents
    const intents = Object.values(this.store.state.intents).filter(i => i.runId === runId);
    for (const intent of intents) {
      await this.syncIntent(intent);
    }
  }

  /**
   * Get knowledge graph subgraph for a run
   */
  async getRunKnowledgeGraph(runId: string): Promise<GraphQueryResult> {
    if (!this.syncEnabled) {
      return {
        nodes: [],
        edges: [],
        paths: [],
        summary: { nodeCount: 0, edgeCount: 0, pathCount: 0 },
      };
    }

    return await this.adapter.getRunSubgraph(runId);
  }

  /**
   * Find attack paths between two entities
   */
  async findPathsBetween(
    runId: string,
    startEntityId: string,
    endEntityId: string
  ): Promise<AttackPath[]> {
    if (!this.syncEnabled) {
      return [];
    }

    return await this.adapter.findAttackPaths(runId, startEntityId, endEntityId, 10);
  }

  /**
   * Delete run data from knowledge graph
   */
  async deleteRunKnowledgeGraph(runId: string): Promise<void> {
    if (!this.syncEnabled) {
      return;
    }

    await this.adapter.deleteRunData(runId);
  }

  /**
   * Get relationship reasoning for a finding
   * Explains how the platform arrived at this finding through the graph
   */
  async getReasoningForFinding(findingId: string): Promise<{
    finding: Finding | null;
    supportingEvidence: Evidence[];
    derivationPath: AttackPath | null;
    reasoning: string[];
  }> {
    const finding = this.store.state.findings[findingId];
    if (!finding) {
      return {
        finding: null,
        supportingEvidence: [],
        derivationPath: null,
        reasoning: ['Finding not found'],
      };
    }

    const supportingEvidence = finding.evidenceIds
      .map(id => this.store.state.evidence[id])
      .filter(e => e !== undefined);

    const reasoning: string[] = [];

    reasoning.push(`Finding: ${finding.title} (${finding.severity})`);
    reasoning.push(`Validation state: ${finding.validationState}`);
    reasoning.push(`Supported by ${supportingEvidence.length} evidence items`);

    if (this.syncEnabled) {
      // Try to find the attack path from target to this finding
      const run = this.store.state.runs[finding.runId];
      if (run) {
        const targetNodeId = `asset-${run.id}`;
        const path = await this.adapter.findShortestAttackPath(
          finding.runId,
          targetNodeId,
          finding.id
        );

        if (path) {
          reasoning.push(`Attack path length: ${path.length} steps`);
          reasoning.push(`Path confidence: ${(path.riskScore * 100).toFixed(1)}%`);

          return {
            finding,
            supportingEvidence,
            derivationPath: path,
            reasoning,
          };
        }
      }
    }

    reasoning.push('Attack path analysis not available (Neo4j not enabled)');

    return {
      finding,
      supportingEvidence,
      derivationPath: null,
      reasoning,
    };
  }
}
