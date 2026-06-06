/**
 * Knowledge Graph API Routes
 *
 * REST endpoints for Neo4j knowledge graph integration.
 * All endpoints are read-only or trigger automated sync operations.
 * Workers never directly access these endpoints.
 */

import type { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph-service.js';

export function registerKnowledgeGraphRoutes(
  app: any,
  kgService: KnowledgeGraphService
): void {
  /**
   * GET /knowledge-graph/status
   * Check if Neo4j knowledge graph is available
   */
  app.get('/knowledge-graph/status', (_req: any, res: any) => {
    res.json({
      available: kgService.isAvailable(),
      features: {
        attackPathAnalysis: kgService.isAvailable(),
        relationshipReasoning: kgService.isAvailable(),
        graphVisualization: kgService.isAvailable(),
      },
      note: kgService.isAvailable()
        ? 'Neo4j knowledge graph is enabled'
        : 'Neo4j knowledge graph is not available - platform works without it',
    });
  });

  /**
   * GET /runs/:runId/knowledge-graph
   * Get the knowledge graph for a run
   */
  app.get('/runs/:runId/knowledge-graph', async (req: any, res: any) => {
    try {
      const { runId } = req.params;

      if (!kgService.isAvailable()) {
        return res.status(503).json({
          error: 'Knowledge graph not available',
          message: 'Neo4j is not configured or not running',
        });
      }

      const graph = await kgService.getRunKnowledgeGraph(runId);

      res.json({
        runId,
        graph,
        visualization: {
          note: 'Use Neo4j Browser or graph visualization tools to explore this data',
          cypher: `MATCH (n:AttackNode {runId: "${runId}"})-[r]->(m) RETURN n, r, m`,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve knowledge graph',
        message: (error as Error).message,
      });
    }
  });

  /**
   * POST /runs/:runId/knowledge-graph/sync
   * Sync a run to the knowledge graph
   */
  app.post('/runs/:runId/knowledge-graph/sync', async (req: any, res: any) => {
    try {
      const { runId } = req.params;

      if (!kgService.isAvailable()) {
        return res.status(503).json({
          error: 'Knowledge graph not available',
          message: 'Neo4j is not configured or not running',
        });
      }

      await kgService.syncRun(runId);

      res.json({
        runId,
        synced: true,
        message: 'Run data synced to knowledge graph',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to sync to knowledge graph',
        message: (error as Error).message,
      });
    }
  });

  /**
   * GET /runs/:runId/attack-paths
   * Get attack path analysis for a run
   */
  app.get('/runs/:runId/attack-paths', async (req: any, res: any) => {
    try {
      const { runId } = req.params;

      if (!kgService.isAvailable()) {
        return res.status(503).json({
          error: 'Knowledge graph not available',
          message: 'Neo4j is not configured or not running',
        });
      }

      const analysis = await kgService.analyzeAttackPaths(runId);

      res.json({
        runId,
        analysis,
        note: 'Attack paths represent the logical progression from target to confirmed findings',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to analyze attack paths',
        message: (error as Error).message,
      });
    }
  });

  /**
   * GET /runs/:runId/attack-paths/infer
   * Infer attack paths from existing data
   */
  app.get('/runs/:runId/attack-paths/infer', async (req: any, res: any) => {
    try {
      const { runId } = req.params;

      if (!kgService.isAvailable()) {
        return res.status(503).json({
          error: 'Knowledge graph not available',
          message: 'Neo4j is not configured or not running',
        });
      }

      const paths = await kgService.inferAttackPaths(runId);

      res.json({
        runId,
        paths,
        count: paths.length,
        note: 'Inferred paths connect the target to confirmed findings through evidence',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to infer attack paths',
        message: (error as Error).message,
      });
    }
  });

  /**
   * GET /runs/:runId/attack-paths/between/:startId/:endId
   * Find attack paths between two entities
   */
  app.get('/runs/:runId/attack-paths/between/:startId/:endId', async (req: any, res: any) => {
    try {
      const { runId, startId, endId } = req.params;

      if (!kgService.isAvailable()) {
        return res.status(503).json({
          error: 'Knowledge graph not available',
          message: 'Neo4j is not configured or not running',
        });
      }

      const paths = await kgService.findPathsBetween(runId, startId, endId);

      res.json({
        runId,
        startId,
        endId,
        paths,
        count: paths.length,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to find attack paths',
        message: (error as Error).message,
      });
    }
  });

  /**
   * GET /findings/:findingId/reasoning
   * Get the reasoning path for a finding
   */
  app.get('/findings/:findingId/reasoning', async (req: any, res: any) => {
    try {
      const { findingId } = req.params;

      const reasoning = await kgService.getReasoningForFinding(findingId);

      res.json({
        findingId,
        reasoning,
        note: 'This explains how the platform arrived at this finding through evidence and attack paths',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get reasoning',
        message: (error as Error).message,
      });
    }
  });

  /**
   * DELETE /runs/:runId/knowledge-graph
   * Delete run data from knowledge graph
   */
  app.delete('/runs/:runId/knowledge-graph', async (req: any, res: any) => {
    try {
      const { runId } = req.params;

      if (!kgService.isAvailable()) {
        return res.status(503).json({
          error: 'Knowledge graph not available',
          message: 'Neo4j is not configured or not running',
        });
      }

      await kgService.deleteRunKnowledgeGraph(runId);

      res.json({
        runId,
        deleted: true,
        message: 'Run data removed from knowledge graph',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to delete from knowledge graph',
        message: (error as Error).message,
      });
    }
  });

  /**
   * GET /runs/:runId/knowledge-graph/capabilities
   * Get knowledge graph capabilities for a run
   */
  app.get('/runs/:runId/knowledge-graph/capabilities', async (req: any, res: any) => {
    try {
      const { runId } = req.params;

      const available = kgService.isAvailable();

      res.json({
        runId,
        available,
        capabilities: [
          {
            name: 'Attack Path Analysis',
            available,
            description: 'Identify paths from target to confirmed findings',
            endpoint: `/runs/${runId}/attack-paths`,
          },
          {
            name: 'Relationship Reasoning',
            available,
            description: 'Explain how findings derive from evidence',
            endpoint: `/findings/{findingId}/reasoning`,
          },
          {
            name: 'Graph Visualization',
            available,
            description: 'Export graph data for visualization tools',
            endpoint: `/runs/${runId}/knowledge-graph`,
          },
          {
            name: 'Path Inference',
            available,
            description: 'Automatically infer attack paths from evidence',
            endpoint: `/runs/${runId}/attack-paths/infer`,
          },
        ],
        setup: available
          ? null
          : {
              required: 'Neo4j database',
              envVars: [
                'NEO4J_URI (e.g., neo4j://localhost:7687)',
                'NEO4J_USERNAME',
                'NEO4J_PASSWORD',
                'PLATFORM_ENABLE_KNOWLEDGE_GRAPH=1',
              ],
              note: 'Platform works without Neo4j - this is an optional enhancement',
            },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get capabilities',
        message: (error as Error).message,
      });
    }
  });
}
