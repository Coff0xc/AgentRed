/**
 * Neo4j Knowledge Graph Adapter
 *
 * Provides graph database storage for attack paths, relationships, and reasoning.
 * This is an optional enhancement layer - the platform works without Neo4j.
 *
 * Core principles:
 * - Neo4j stores derived relationships and attack paths, not raw evidence
 * - Evidence and findings remain in the primary store with provenance
 * - Graph queries support path analysis and relationship inference
 * - All writes still go through first-party services
 * - Workers never directly access Neo4j
 */

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
  enabled: boolean;
}

export interface AttackPathNode {
  id: string;
  type: 'asset' | 'vulnerability' | 'technique' | 'credential' | 'evidence' | 'finding';
  label: string;
  runId: string;
  properties: Record<string, unknown>;
  createdAt: string;
}

export interface AttackPathEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: 'LEADS_TO' | 'ENABLES' | 'REFERENCES' | 'EXPLOITS' | 'GRANTS_ACCESS' | 'SUPPORTS' | 'DERIVES_FROM';
  runId: string;
  properties: Record<string, unknown>;
  confidence: number; // 0.0 to 1.0
  createdAt: string;
}

export interface AttackPath {
  id: string;
  runId: string;
  nodes: AttackPathNode[];
  edges: AttackPathEdge[];
  startNodeId: string;
  endNodeId: string;
  length: number;
  riskScore: number;
  createdAt: string;
}

export interface GraphQueryResult {
  nodes: AttackPathNode[];
  edges: AttackPathEdge[];
  paths: AttackPath[];
  summary: {
    nodeCount: number;
    edgeCount: number;
    pathCount: number;
  };
}

/**
 * Neo4j Knowledge Graph Service
 *
 * Optional graph database integration for attack path analysis.
 * Falls back gracefully when Neo4j is not available.
 */
export class Neo4jKnowledgeGraphAdapter {
  private driver: unknown | null = null;
  private config: Neo4jConfig;

  constructor(config: Neo4jConfig) {
    this.config = config;
  }

  /**
   * Initialize Neo4j driver connection
   * Returns false if neo4j npm package is not installed
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      // Dynamic import - neo4j is optional
      // @ts-ignore - neo4j-driver is an optional dependency
      const neo4j = await import('neo4j-driver');

      this.driver = neo4j.default.driver(
        this.config.uri,
        neo4j.default.auth.basic(this.config.username, this.config.password)
      );

      // Test connection
      const session = (this.driver as any).session({
        database: this.config.database || 'neo4j'
      });

      try {
        await session.run('RETURN 1');
        return true;
      } finally {
        await session.close();
      }
    } catch (error) {
      console.warn('Neo4j not available:', (error as Error).message);
      this.driver = null;
      return false;
    }
  }

  /**
   * Check if Neo4j is available and connected
   */
  isAvailable(): boolean {
    return this.driver !== null;
  }

  /**
   * Close Neo4j connection
   */
  async close(): Promise<void> {
    if (this.driver) {
      await (this.driver as any).close();
      this.driver = null;
    }
  }

  /**
   * Create constraints and indexes for optimal performance
   */
  async setupSchema(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      // Create uniqueness constraints
      await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (n:AttackNode) REQUIRE n.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (n:Asset) REQUIRE n.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (n:Vulnerability) REQUIRE n.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (n:Evidence) REQUIRE n.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT IF NOT EXISTS FOR (n:Finding) REQUIRE n.id IS UNIQUE
      `);

      // Create indexes for common queries
      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:AttackNode) ON (n.runId)
      `);

      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR (n:AttackNode) ON (n.type)
      `);

      await session.run(`
        CREATE INDEX IF NOT EXISTS FOR ()-[r:LEADS_TO]-() ON (r.confidence)
      `);
    } finally {
      await session.close();
    }
  }

  /**
   * Add a node to the knowledge graph
   */
  async addNode(node: AttackPathNode): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      await session.run(
        `
        MERGE (n:AttackNode {id: $id})
        SET n.type = $type,
            n.label = $label,
            n.runId = $runId,
            n.properties = $properties,
            n.createdAt = $createdAt
        WITH n
        CALL apoc.create.addLabels(n, [$type]) YIELD node
        RETURN node
        `,
        {
          id: node.id,
          type: node.type,
          label: node.label,
          runId: node.runId,
          properties: JSON.stringify(node.properties),
          createdAt: node.createdAt,
        }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Add an edge (relationship) to the knowledge graph
   */
  async addEdge(edge: AttackPathEdge): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      await session.run(
        `
        MATCH (source:AttackNode {id: $sourceNodeId})
        MATCH (target:AttackNode {id: $targetNodeId})
        MERGE (source)-[r:${edge.relationshipType} {id: $id}]->(target)
        SET r.runId = $runId,
            r.properties = $properties,
            r.confidence = $confidence,
            r.createdAt = $createdAt
        RETURN r
        `,
        {
          id: edge.id,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          runId: edge.runId,
          properties: JSON.stringify(edge.properties),
          confidence: edge.confidence,
          createdAt: edge.createdAt,
        }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Find all attack paths from a start node to an end node
   */
  async findAttackPaths(
    runId: string,
    startNodeId: string,
    endNodeId: string,
    maxDepth: number = 10
  ): Promise<AttackPath[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      const result = await session.run(
        `
        MATCH path = (start:AttackNode {id: $startNodeId, runId: $runId})
                     -[*1..${maxDepth}]->(end:AttackNode {id: $endNodeId, runId: $runId})
        WITH path,
             nodes(path) as pathNodes,
             relationships(path) as pathEdges,
             reduce(score = 0, r in relationships(path) | score + r.confidence) as totalConfidence
        RETURN
          pathNodes,
          pathEdges,
          length(path) as pathLength,
          totalConfidence / length(path) as avgConfidence
        ORDER BY pathLength ASC, avgConfidence DESC
        LIMIT 10
        `,
        {
          startNodeId,
          endNodeId,
          runId,
        }
      );

      const paths: AttackPath[] = [];
      for (const record of result.records) {
        const pathNodes = record.get('pathNodes');
        const pathEdges = record.get('pathEdges');
        const pathLength = record.get('pathLength');
        const avgConfidence = record.get('avgConfidence');

        const nodes: AttackPathNode[] = pathNodes.map((n: any) => ({
          id: n.properties.id,
          type: n.properties.type,
          label: n.properties.label,
          runId: n.properties.runId,
          properties: JSON.parse(n.properties.properties || '{}'),
          createdAt: n.properties.createdAt,
        }));

        const edges: AttackPathEdge[] = pathEdges.map((e: any) => ({
          id: e.properties.id,
          sourceNodeId: e.start.properties.id,
          targetNodeId: e.end.properties.id,
          relationshipType: e.type,
          runId: e.properties.runId,
          properties: JSON.parse(e.properties.properties || '{}'),
          confidence: e.properties.confidence,
          createdAt: e.properties.createdAt,
        }));

        paths.push({
          id: `path-${startNodeId}-${endNodeId}-${paths.length}`,
          runId,
          nodes,
          edges,
          startNodeId,
          endNodeId,
          length: pathLength,
          riskScore: avgConfidence,
          createdAt: new Date().toISOString(),
        });
      }

      return paths;
    } finally {
      await session.close();
    }
  }

  /**
   * Find shortest attack path between two nodes
   */
  async findShortestAttackPath(
    runId: string,
    startNodeId: string,
    endNodeId: string
  ): Promise<AttackPath | null> {
    const paths = await this.findAttackPaths(runId, startNodeId, endNodeId, 10);
    return paths.length > 0 ? paths[0] : null;
  }

  /**
   * Find all nodes of a specific type in a run
   */
  async findNodesByType(
    runId: string,
    nodeType: AttackPathNode['type']
  ): Promise<AttackPathNode[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      const result = await session.run(
        `
        MATCH (n:AttackNode {runId: $runId, type: $nodeType})
        RETURN n
        ORDER BY n.createdAt DESC
        `,
        {
          runId,
          nodeType,
        }
      );

      return result.records.map((record: any) => {
        const n = record.get('n');
        return {
          id: n.properties.id,
          type: n.properties.type,
          label: n.properties.label,
          runId: n.properties.runId,
          properties: JSON.parse(n.properties.properties || '{}'),
          createdAt: n.properties.createdAt,
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Find all relationships pointing to a node
   */
  async findIncomingRelationships(nodeId: string): Promise<AttackPathEdge[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      const result = await session.run(
        `
        MATCH (source:AttackNode)-[r]->(target:AttackNode {id: $nodeId})
        RETURN source, r, target
        ORDER BY r.confidence DESC
        `,
        {
          nodeId,
        }
      );

      return result.records.map((record: any) => {
        const source = record.get('source');
        const r = record.get('r');
        const target = record.get('target');

        return {
          id: r.properties.id,
          sourceNodeId: source.properties.id,
          targetNodeId: target.properties.id,
          relationshipType: r.type,
          runId: r.properties.runId,
          properties: JSON.parse(r.properties.properties || '{}'),
          confidence: r.properties.confidence,
          createdAt: r.properties.createdAt,
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Find all relationships pointing from a node
   */
  async findOutgoingRelationships(nodeId: string): Promise<AttackPathEdge[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      const result = await session.run(
        `
        MATCH (source:AttackNode {id: $nodeId})-[r]->(target:AttackNode)
        RETURN source, r, target
        ORDER BY r.confidence DESC
        `,
        {
          nodeId,
        }
      );

      return result.records.map((record: any) => {
        const source = record.get('source');
        const r = record.get('r');
        const target = record.get('target');

        return {
          id: r.properties.id,
          sourceNodeId: source.properties.id,
          targetNodeId: target.properties.id,
          relationshipType: r.type,
          runId: r.properties.runId,
          properties: JSON.parse(r.properties.properties || '{}'),
          confidence: r.properties.confidence,
          createdAt: r.properties.createdAt,
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get the full subgraph for a run
   */
  async getRunSubgraph(runId: string): Promise<GraphQueryResult> {
    if (!this.isAvailable()) {
      return {
        nodes: [],
        edges: [],
        paths: [],
        summary: { nodeCount: 0, edgeCount: 0, pathCount: 0 },
      };
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      const result = await session.run(
        `
        MATCH (n:AttackNode {runId: $runId})
        OPTIONAL MATCH (n)-[r]->(m:AttackNode {runId: $runId})
        RETURN collect(DISTINCT n) as nodes, collect(DISTINCT r) as edges
        `,
        {
          runId,
        }
      );

      const record = result.records[0];
      const nodesData = record.get('nodes');
      const edgesData = record.get('edges').filter((e: any) => e !== null);

      const nodes: AttackPathNode[] = nodesData.map((n: any) => ({
        id: n.properties.id,
        type: n.properties.type,
        label: n.properties.label,
        runId: n.properties.runId,
        properties: JSON.parse(n.properties.properties || '{}'),
        createdAt: n.properties.createdAt,
      }));

      const edges: AttackPathEdge[] = edgesData.map((e: any) => ({
        id: e.properties.id,
        sourceNodeId: e.start.properties.id,
        targetNodeId: e.end.properties.id,
        relationshipType: e.type,
        runId: e.properties.runId,
        properties: JSON.parse(e.properties.properties || '{}'),
        confidence: e.properties.confidence,
        createdAt: e.properties.createdAt,
      }));

      return {
        nodes,
        edges,
        paths: [],
        summary: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          pathCount: 0,
        },
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Delete all data for a run
   */
  async deleteRunData(runId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      await session.run(
        `
        MATCH (n:AttackNode {runId: $runId})
        DETACH DELETE n
        `,
        {
          runId,
        }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Find high-risk attack paths (paths that lead to critical findings)
   */
  async findHighRiskPaths(runId: string, minConfidence: number = 0.7): Promise<AttackPath[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const session = (this.driver as any).session({
      database: this.config.database || 'neo4j'
    });

    try {
      const result = await session.run(
        `
        MATCH path = (start:AttackNode {runId: $runId})
                     -[*1..10]->(finding:Finding {runId: $runId})
        WHERE finding.properties CONTAINS 'critical' OR finding.properties CONTAINS 'high'
        WITH path,
             nodes(path) as pathNodes,
             relationships(path) as pathEdges,
             reduce(score = 1.0, r in relationships(path) | score * r.confidence) as pathConfidence
        WHERE pathConfidence >= $minConfidence
        RETURN
          pathNodes,
          pathEdges,
          length(path) as pathLength,
          pathConfidence
        ORDER BY pathConfidence DESC, pathLength ASC
        LIMIT 20
        `,
        {
          runId,
          minConfidence,
        }
      );

      const paths: AttackPath[] = [];
      for (const record of result.records) {
        const pathNodes = record.get('pathNodes');
        const pathEdges = record.get('pathEdges');
        const pathLength = record.get('pathLength');
        const pathConfidence = record.get('pathConfidence');

        const nodes: AttackPathNode[] = pathNodes.map((n: any) => ({
          id: n.properties.id,
          type: n.properties.type,
          label: n.properties.label,
          runId: n.properties.runId,
          properties: JSON.parse(n.properties.properties || '{}'),
          createdAt: n.properties.createdAt,
        }));

        const edges: AttackPathEdge[] = pathEdges.map((e: any) => ({
          id: e.properties.id,
          sourceNodeId: e.start.properties.id,
          targetNodeId: e.end.properties.id,
          relationshipType: e.type,
          runId: e.properties.runId,
          properties: JSON.parse(e.properties.properties || '{}'),
          confidence: e.properties.confidence,
          createdAt: e.properties.createdAt,
        }));

        paths.push({
          id: `high-risk-path-${paths.length}`,
          runId,
          nodes,
          edges,
          startNodeId: nodes[0].id,
          endNodeId: nodes[nodes.length - 1].id,
          length: pathLength,
          riskScore: pathConfidence,
          createdAt: new Date().toISOString(),
        });
      }

      return paths;
    } finally {
      await session.close();
    }
  }
}
