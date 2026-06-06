import type { RiskLevel } from '../domain/types.js';

/**
 * MCP tool registry entry
 */
export interface McpToolRegistryEntry {
  /** MCP server/connection identifier */
  serverId: string;
  /** Tool name as exposed by MCP server */
  toolName: string;
  /** Assigned risk level */
  riskLevel: RiskLevel;
  /** Whether this tool is allowed */
  allowed: boolean;
  /** Output sanitization rules for this tool */
  outputSanitization?: string[];
  /** Maximum invocations per minute */
  maxInvocationsPerMinute?: number;
  /** Required approval level */
  requiresApproval: boolean;
  /** Human-readable policy notes */
  policyNotes?: string;
}

/**
 * McpToolRegistry manages tool-level allowlist and governance policies.
 *
 * Registry Structure:
 * - serverId → toolName → policy
 * - Fail-closed: unlisted tools are blocked
 * - Immutable: policies are read-only after registration
 * - Auditable: all lookups are logged
 *
 * Integration Points:
 * - Tool Gateway: enforces allowlist before invocation
 * - MCP Bundle Manager: loads policies from bundles
 * - MCP Risk Mapper: provides default risk inference
 */
export class McpToolRegistry {
  private registry: Map<string, Map<string, McpToolRegistryEntry>> = new Map();

  /**
   * Register a tool policy in the registry.
   *
   * @param entry - Tool registry entry
   */
  register(entry: McpToolRegistryEntry): void {
    let serverMap = this.registry.get(entry.serverId);
    if (!serverMap) {
      serverMap = new Map();
      this.registry.set(entry.serverId, serverMap);
    }

    serverMap.set(entry.toolName, entry);
  }

  /**
   * Bulk register tools from a server.
   *
   * @param serverId - MCP server identifier
   * @param entries - Array of tool entries
   */
  registerServer(serverId: string, entries: Omit<McpToolRegistryEntry, 'serverId'>[]): void {
    for (const entry of entries) {
      this.register({ ...entry, serverId });
    }
  }

  /**
   * Look up a tool policy in the registry.
   *
   * @param serverId - MCP server identifier
   * @param toolName - Tool name
   * @returns Tool policy or undefined if not registered
   */
  lookup(serverId: string, toolName: string): McpToolRegistryEntry | undefined {
    const serverMap = this.registry.get(serverId);
    if (!serverMap) {
      return undefined;
    }

    return serverMap.get(toolName);
  }

  /**
   * Check if a tool is allowed.
   *
   * @param serverId - MCP server identifier
   * @param toolName - Tool name
   * @returns true if tool is registered and allowed
   */
  isAllowed(serverId: string, toolName: string): boolean {
    const entry = this.lookup(serverId, toolName);
    return entry?.allowed ?? false;
  }

  /**
   * Get risk level for a tool.
   *
   * @param serverId - MCP server identifier
   * @param toolName - Tool name
   * @returns Risk level or undefined if not registered
   */
  getRiskLevel(serverId: string, toolName: string): RiskLevel | undefined {
    const entry = this.lookup(serverId, toolName);
    return entry?.riskLevel;
  }

  /**
   * List all registered tools for a server.
   *
   * @param serverId - MCP server identifier
   * @returns Array of tool entries
   */
  listTools(serverId: string): McpToolRegistryEntry[] {
    const serverMap = this.registry.get(serverId);
    if (!serverMap) {
      return [];
    }

    return Array.from(serverMap.values());
  }

  /**
   * List all registered servers.
   *
   * @returns Array of server identifiers
   */
  listServers(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Get registry statistics.
   *
   * @returns Registry statistics
   */
  getStatistics(): {
    totalServers: number;
    totalTools: number;
    allowedTools: number;
    blockedTools: number;
    toolsByRiskLevel: Record<RiskLevel, number>;
  } {
    let totalTools = 0;
    let allowedTools = 0;
    let blockedTools = 0;
    const toolsByRiskLevel: Record<RiskLevel, number> = {
      R0: 0,
      R1: 0,
      R2: 0,
      R3: 0,
      R4: 0,
    };

    for (const serverMap of this.registry.values()) {
      for (const entry of serverMap.values()) {
        totalTools++;
        if (entry.allowed) {
          allowedTools++;
        } else {
          blockedTools++;
        }
        toolsByRiskLevel[entry.riskLevel]++;
      }
    }

    return {
      totalServers: this.registry.size,
      totalTools,
      allowedTools,
      blockedTools,
      toolsByRiskLevel,
    };
  }

  /**
   * Export registry to JSON for persistence.
   *
   * @returns JSON-serializable registry data
   */
  exportToJson(): Record<string, McpToolRegistryEntry[]> {
    const exported: Record<string, McpToolRegistryEntry[]> = {};

    for (const [serverId, serverMap] of this.registry.entries()) {
      exported[serverId] = Array.from(serverMap.values());
    }

    return exported;
  }

  /**
   * Import registry from JSON.
   *
   * @param data - JSON-serializable registry data
   */
  importFromJson(data: Record<string, McpToolRegistryEntry[]>): void {
    for (const [serverId, entries] of Object.entries(data)) {
      for (const entry of entries) {
        this.register({ ...entry, serverId });
      }
    }
  }

  /**
   * Clear all registered tools (use with caution).
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Remove a server and all its tools from the registry.
   *
   * @param serverId - MCP server identifier
   */
  removeServer(serverId: string): void {
    this.registry.delete(serverId);
  }
}

/**
 * Singleton instance for easy access throughout the codebase.
 */
export const mcpToolRegistry = new McpToolRegistry();

/**
 * Load default registry from built-in configuration.
 * This is called during platform initialization.
 */
export function loadDefaultRegistry(): void {
  // Playwright MCP
  mcpToolRegistry.registerServer('playwright-mcp', [
    {
      toolName: 'playwright_navigate',
      riskLevel: 'R1',
      allowed: true,
      outputSanitization: ['redact_cookies', 'redact_tokens'],
      maxInvocationsPerMinute: 20,
      requiresApproval: false,
      policyNotes: 'Navigation is read-only',
    },
    {
      toolName: 'playwright_screenshot',
      riskLevel: 'R1',
      allowed: true,
      outputSanitization: ['redact_cookies', 'redact_tokens'],
      maxInvocationsPerMinute: 10,
      requiresApproval: false,
      policyNotes: 'Screenshots are read-only captures',
    },
    {
      toolName: 'playwright_click',
      riskLevel: 'R2',
      allowed: true,
      outputSanitization: ['redact_cookies', 'redact_tokens'],
      maxInvocationsPerMinute: 15,
      requiresApproval: false,
      policyNotes: 'Clicking may trigger state changes',
    },
    {
      toolName: 'playwright_fill',
      riskLevel: 'R2',
      allowed: true,
      outputSanitization: ['redact_cookies', 'redact_tokens'],
      maxInvocationsPerMinute: 10,
      requiresApproval: false,
      policyNotes: 'Form filling may submit data',
    },
    {
      toolName: 'playwright_evaluate',
      riskLevel: 'R4',
      allowed: false,
      requiresApproval: true,
      policyNotes: 'JavaScript execution in browser context is dangerous',
    },
    {
      toolName: 'playwright_console',
      riskLevel: 'R1',
      allowed: true,
      outputSanitization: ['redact_cookies', 'redact_tokens'],
      maxInvocationsPerMinute: 30,
      requiresApproval: false,
      policyNotes: 'Console logs are read-only',
    },
  ]);

  // Filesystem MCP
  mcpToolRegistry.registerServer('filesystem-mcp', [
    {
      toolName: 'read_file',
      riskLevel: 'R1',
      allowed: true,
      outputSanitization: ['redact_file_secrets'],
      maxInvocationsPerMinute: 30,
      requiresApproval: false,
      policyNotes: 'Read-only file access',
    },
    {
      toolName: 'list_directory',
      riskLevel: 'R1',
      allowed: true,
      maxInvocationsPerMinute: 20,
      requiresApproval: false,
      policyNotes: 'Directory listing is read-only',
    },
    {
      toolName: 'search_files',
      riskLevel: 'R1',
      allowed: true,
      maxInvocationsPerMinute: 15,
      requiresApproval: false,
      policyNotes: 'File search is read-only',
    },
    {
      toolName: 'write_file',
      riskLevel: 'R4',
      allowed: false,
      requiresApproval: true,
      policyNotes: 'File writing can modify system state',
    },
    {
      toolName: 'delete_file',
      riskLevel: 'R4',
      allowed: false,
      requiresApproval: true,
      policyNotes: 'File deletion is destructive',
    },
    {
      toolName: 'move_file',
      riskLevel: 'R3',
      allowed: false,
      requiresApproval: true,
      policyNotes: 'Moving files can affect system state',
    },
  ]);

  // Google Search MCP
  mcpToolRegistry.registerServer('google-search-mcp', [
    {
      toolName: 'google_search',
      riskLevel: 'R1',
      allowed: true,
      maxInvocationsPerMinute: 10,
      requiresApproval: false,
      policyNotes: 'Search is read-only OSINT',
    },
  ]);

  // Zebbern Kali MCP
  mcpToolRegistry.registerServer('zebbern-kali-mcp', [
    {
      toolName: 'network_tool',
      riskLevel: 'R1',
      allowed: true,
      outputSanitization: ['redact_credentials'],
      maxInvocationsPerMinute: 5,
      requiresApproval: false,
      policyNotes: 'Passive network reconnaissance tools only (nmap, dig, host, nslookup, whois)',
    },
    {
      toolName: 'web_scanner',
      riskLevel: 'R2',
      allowed: true,
      outputSanitization: ['redact_credentials'],
      maxInvocationsPerMinute: 3,
      requiresApproval: false,
      policyNotes: 'Active web scanning with limited impact (nikto, dirb, gobuster)',
    },
    {
      toolName: 'exploit_tool',
      riskLevel: 'R4',
      allowed: false,
      requiresApproval: true,
      policyNotes: 'Exploitation tools require explicit approval',
    },
    {
      toolName: 'password_tool',
      riskLevel: 'R3',
      allowed: false,
      requiresApproval: true,
      policyNotes: 'Password cracking requires approval',
    },
  ]);

  // Pentest Thinking MCP
  mcpToolRegistry.registerServer('pentest-thinking-mcp', [
    {
      toolName: 'suggest_methodology',
      riskLevel: 'R0',
      allowed: true,
      maxInvocationsPerMinute: 20,
      requiresApproval: false,
      policyNotes: 'Methodology suggestions are metadata only',
    },
    {
      toolName: 'explain_technique',
      riskLevel: 'R0',
      allowed: true,
      maxInvocationsPerMinute: 20,
      requiresApproval: false,
      policyNotes: 'Educational content is safe',
    },
    {
      toolName: 'recommend_tools',
      riskLevel: 'R0',
      allowed: true,
      maxInvocationsPerMinute: 20,
      requiresApproval: false,
      policyNotes: 'Tool recommendations are metadata',
    },
  ]);
}
