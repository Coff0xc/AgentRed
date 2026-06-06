import type { RiskLevel } from '../domain/types.js';
import { McpRiskMapper } from '../connectors/mcp-risk-mapper.js';
import { mcpToolRegistry } from './mcp-tool-registry.js';

/**
 * HexStrike tool metadata from their ecosystem
 */
export interface HexStrikeTool {
  /** Tool identifier */
  id: string;
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Tool category (recon, exploit, post-exploit, etc.) */
  category: string;
  /** GitHub repository URL */
  repository?: string;
  /** Star count on GitHub */
  stars?: number;
  /** Tool tags */
  tags?: string[];
}

/**
 * Mapped HexStrike tool with AgentRed governance
 */
export interface MappedHexStrikeTool {
  /** Original HexStrike tool */
  original: HexStrikeTool;
  /** Inferred risk level */
  riskLevel: RiskLevel;
  /** Whether tool is allowed by default */
  allowed: boolean;
  /** Governance reasoning */
  reasoning: string;
  /** Recommended MCP server adapter */
  recommendedAdapter?: string;
  /** Required approvals */
  requiresApproval: boolean;
  /** Maturity assessment */
  maturity: 'experimental' | 'beta' | 'stable';
}

/**
 * HexStrike ecosystem statistics
 */
export interface HexStrikeStats {
  totalTools: number;
  byCategory: Record<string, number>;
  byRiskLevel: Record<RiskLevel, number>;
  allowedTools: number;
  blockedTools: number;
  averageStars: number;
}

/**
 * HexStrikeAdapter provides compatibility bridge between HexStrike (9.2k⭐ MCP ecosystem)
 * and AgentRed's governance model.
 *
 * HexStrike Context:
 * - 150+ MCP tools for security testing
 * - Community-driven tool registry
 * - Varying quality and safety levels
 *
 * Adapter Responsibilities:
 * - Import HexStrike tool catalog
 * - Map tools to AgentRed risk levels
 * - Generate governance policies
 * - Recommend safe tool subsets
 * - Provide maturity assessments
 */
export class HexStrikeAdapter {
  private riskMapper: McpRiskMapper;
  private tools: Map<string, MappedHexStrikeTool> = new Map();

  constructor() {
    this.riskMapper = new McpRiskMapper();
  }

  /**
   * Import HexStrike tool catalog and apply governance mapping.
   *
   * @param tools - Array of HexStrike tools
   * @returns Mapping statistics
   */
  importCatalog(tools: HexStrikeTool[]): HexStrikeStats {
    const stats: HexStrikeStats = {
      totalTools: tools.length,
      byCategory: {},
      byRiskLevel: { R0: 0, R1: 0, R2: 0, R3: 0, R4: 0 },
      allowedTools: 0,
      blockedTools: 0,
      averageStars: 0,
    };

    let totalStars = 0;

    for (const tool of tools) {
      const mapped = this.mapTool(tool);
      this.tools.set(tool.id, mapped);

      // Update statistics
      stats.byCategory[tool.category] = (stats.byCategory[tool.category] || 0) + 1;
      stats.byRiskLevel[mapped.riskLevel]++;
      if (mapped.allowed) {
        stats.allowedTools++;
      } else {
        stats.blockedTools++;
      }

      if (tool.stars) {
        totalStars += tool.stars;
      }
    }

    stats.averageStars = tools.length > 0 ? totalStars / tools.length : 0;

    return stats;
  }

  /**
   * Map a single HexStrike tool to AgentRed governance model.
   *
   * @param tool - HexStrike tool metadata
   * @returns Mapped tool with governance policies
   */
  private mapTool(tool: HexStrikeTool): MappedHexStrikeTool {
    // Infer risk level from tool name, description, and category
    const riskLevel = this.inferRiskLevel(tool);

    // Determine if tool should be allowed by default
    const allowed = this.shouldAllow(tool, riskLevel);

    // Generate reasoning
    const reasoning = this.generateReasoning(tool, riskLevel, allowed);

    // Recommend MCP adapter
    const recommendedAdapter = this.recommendAdapter(tool);

    // Assess maturity
    const maturity = this.assessMaturity(tool);

    return {
      original: tool,
      riskLevel,
      allowed,
      reasoning,
      recommendedAdapter,
      requiresApproval: riskLevel === 'R3' || riskLevel === 'R4',
      maturity,
    };
  }

  /**
   * Infer risk level from tool metadata.
   *
   * @param tool - HexStrike tool
   * @returns Inferred risk level
   */
  private inferRiskLevel(tool: HexStrikeTool): RiskLevel {
    // Use category-based heuristics combined with name/description
    const categoryRiskMap: Record<string, RiskLevel> = {
      recon: 'R1',
      osint: 'R1',
      scanning: 'R2',
      enumeration: 'R1',
      fuzzing: 'R2',
      exploitation: 'R4',
      'post-exploitation': 'R4',
      'privilege-escalation': 'R4',
      persistence: 'R4',
      'credential-dumping': 'R4',
      'lateral-movement': 'R4',
      exfiltration: 'R4',
      reporting: 'R0',
      utility: 'R1',
    };

    const categoryRisk = categoryRiskMap[tool.category.toLowerCase()];
    if (categoryRisk) {
      // Validate with name/description inference
      const inferredRisk = this.riskMapper.inferRiskLevel(tool.name, tool.description);
      // Use the higher risk level (fail-safe)
      return this.higherRiskLevel(categoryRisk, inferredRisk);
    }

    // Fall back to name/description inference
    return this.riskMapper.inferRiskLevel(tool.name, tool.description);
  }

  /**
   * Determine if tool should be allowed by default.
   *
   * @param tool - HexStrike tool
   * @param riskLevel - Inferred risk level
   * @returns true if tool should be allowed
   */
  private shouldAllow(tool: HexStrikeTool, riskLevel: RiskLevel): boolean {
    // Block R4 tools by default
    if (riskLevel === 'R4') {
      return false;
    }

    // Block R3 tools unless they're well-maintained
    if (riskLevel === 'R3') {
      // Allow if highly-starred (community trust signal)
      if (tool.stars && tool.stars >= 1000) {
        return true;
      }
      return false;
    }

    // Allow R0, R1, R2 by default
    return true;
  }

  /**
   * Generate human-readable reasoning for governance decision.
   *
   * @param tool - HexStrike tool
   * @param riskLevel - Inferred risk level
   * @param allowed - Whether tool is allowed
   * @returns Reasoning string
   */
  private generateReasoning(tool: HexStrikeTool, riskLevel: RiskLevel, allowed: boolean): string {
    const parts: string[] = [];

    parts.push(`Category: ${tool.category}`);
    parts.push(`Risk: ${riskLevel}`);

    if (tool.stars) {
      parts.push(`Stars: ${tool.stars}`);
    }

    if (allowed) {
      if (riskLevel === 'R3' && tool.stars && tool.stars >= 1000) {
        parts.push('Allowed due to high community trust');
      } else if (riskLevel === 'R0' || riskLevel === 'R1') {
        parts.push('Allowed for read-only operations');
      } else if (riskLevel === 'R2') {
        parts.push('Allowed for active scanning within scope');
      }
    } else {
      if (riskLevel === 'R4') {
        parts.push('Blocked: destructive/exploit tool requires explicit approval');
      } else if (riskLevel === 'R3') {
        parts.push('Blocked: insufficient community trust or dangerous operation');
      }
    }

    return parts.join(' | ');
  }

  /**
   * Recommend MCP adapter for the tool.
   *
   * @param tool - HexStrike tool
   * @returns Recommended adapter ID
   */
  private recommendAdapter(tool: HexStrikeTool): string | undefined {
    const category = tool.category.toLowerCase();

    // Map categories to existing adapters
    if (['recon', 'osint', 'enumeration'].includes(category)) {
      return 'safe-search';
    }

    if (['scanning', 'fuzzing'].includes(category)) {
      return 'kali-approved';
    }

    if (category === 'reporting') {
      return 'pentest-thinking';
    }

    // Exploitation and post-exploitation tools need custom adapters
    return undefined;
  }

  /**
   * Assess tool maturity based on stars and metadata.
   *
   * @param tool - HexStrike tool
   * @returns Maturity level
   */
  private assessMaturity(tool: HexStrikeTool): 'experimental' | 'beta' | 'stable' {
    if (!tool.stars) {
      return 'experimental';
    }

    if (tool.stars >= 1000) {
      return 'stable';
    }

    if (tool.stars >= 100) {
      return 'beta';
    }

    return 'experimental';
  }

  /**
   * Get mapped tool by ID.
   *
   * @param toolId - HexStrike tool ID
   * @returns Mapped tool or undefined
   */
  getTool(toolId: string): MappedHexStrikeTool | undefined {
    return this.tools.get(toolId);
  }

  /**
   * List all mapped tools.
   *
   * @returns Array of mapped tools
   */
  listTools(): MappedHexStrikeTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Filter tools by risk level.
   *
   * @param riskLevel - Risk level to filter by
   * @returns Filtered tools
   */
  filterByRiskLevel(riskLevel: RiskLevel): MappedHexStrikeTool[] {
    return Array.from(this.tools.values()).filter(tool => tool.riskLevel === riskLevel);
  }

  /**
   * Filter tools by category.
   *
   * @param category - Category to filter by
   * @returns Filtered tools
   */
  filterByCategory(category: string): MappedHexStrikeTool[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.original.category.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Get safe tool recommendations for a specific use case.
   *
   * @param useCase - Use case (recon, scanning, etc.)
   * @returns Recommended safe tools
   */
  getSafeRecommendations(useCase: string): MappedHexStrikeTool[] {
    return Array.from(this.tools.values()).filter(
      tool =>
        tool.allowed &&
        (tool.original.category.toLowerCase() === useCase.toLowerCase() ||
          tool.original.tags?.some(tag => tag.toLowerCase().includes(useCase.toLowerCase())))
    );
  }

  /**
   * Export governance policies to MCP Tool Registry.
   *
   * @param serverId - MCP server ID to assign tools to
   */
  exportToRegistry(serverId: string): void {
    for (const mapped of this.tools.values()) {
      mcpToolRegistry.register({
        serverId,
        toolName: mapped.original.id,
        riskLevel: mapped.riskLevel,
        allowed: mapped.allowed,
        requiresApproval: mapped.requiresApproval,
        policyNotes: mapped.reasoning,
      });
    }
  }

  /**
   * Generate governance policy summary report.
   *
   * @returns Markdown-formatted policy report
   */
  generatePolicyReport(): string {
    const stats = this.getStatistics();
    const lines: string[] = [];

    lines.push('# HexStrike Tool Governance Report\n');
    lines.push(`**Total Tools:** ${stats.totalTools}`);
    lines.push(`**Allowed:** ${stats.allowedTools} | **Blocked:** ${stats.blockedTools}`);
    lines.push(`**Average Stars:** ${stats.averageStars.toFixed(1)}\n`);

    lines.push('## Risk Distribution\n');
    for (const [level, count] of Object.entries(stats.byRiskLevel)) {
      lines.push(`- **${level}:** ${count} tools`);
    }

    lines.push('\n## Category Distribution\n');
    for (const [category, count] of Object.entries(stats.byCategory)) {
      lines.push(`- **${category}:** ${count} tools`);
    }

    lines.push('\n## Safe Tool Recommendations\n');
    const safeTools = Array.from(this.tools.values())
      .filter(t => t.allowed && t.maturity !== 'experimental')
      .slice(0, 20);

    for (const tool of safeTools) {
      lines.push(
        `- **${tool.original.name}** (${tool.riskLevel}) - ${tool.original.description.slice(0, 80)}...`
      );
    }

    return lines.join('\n');
  }

  /**
   * Get statistics about mapped tools.
   *
   * @returns Statistics object
   */
  private getStatistics(): HexStrikeStats {
    const stats: HexStrikeStats = {
      totalTools: this.tools.size,
      byCategory: {},
      byRiskLevel: { R0: 0, R1: 0, R2: 0, R3: 0, R4: 0 },
      allowedTools: 0,
      blockedTools: 0,
      averageStars: 0,
    };

    let totalStars = 0;
    let starCount = 0;

    for (const mapped of this.tools.values()) {
      stats.byCategory[mapped.original.category] =
        (stats.byCategory[mapped.original.category] || 0) + 1;
      stats.byRiskLevel[mapped.riskLevel]++;

      if (mapped.allowed) {
        stats.allowedTools++;
      } else {
        stats.blockedTools++;
      }

      if (mapped.original.stars) {
        totalStars += mapped.original.stars;
        starCount++;
      }
    }

    stats.averageStars = starCount > 0 ? totalStars / starCount : 0;

    return stats;
  }

  /**
   * Helper: Compare risk levels and return the higher one.
   */
  private higherRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
    const order: Record<RiskLevel, number> = { R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 };
    return order[a] >= order[b] ? a : b;
  }
}

/**
 * Singleton instance for easy access throughout the codebase.
 */
export const hexStrikeAdapter = new HexStrikeAdapter();
