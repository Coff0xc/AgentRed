import type { RiskLevel } from '../domain/types.js';

/**
 * McpRiskMapper provides intelligent risk level inference for MCP tools.
 *
 * Uses pattern matching on tool names and descriptions to assign appropriate
 * risk levels, following fail-safe principles (unknown tools default to R3).
 *
 * Risk Level Guidelines:
 * - R0: Pure metadata queries (version, status, capabilities)
 * - R1: Read-only operations (scan, probe, discover, list, get, fetch)
 * - R2: Active scanning with limited impact (fuzzing, brute-force attempts)
 * - R3: Exploit validation, state changes, OAST (exploit, inject, execute, modify)
 * - R4: Destructive operations, credential theft (delete, drop, destroy, dump, steal)
 */
export class McpRiskMapper {
  private readonly r0Patterns = [
    /^(version|status|health|ping|echo|capabilities|info|about)$/i,
  ];

  private readonly r1Patterns = [
    /^(scan|probe|discover|list|get|fetch|read|query|search|find|check|detect|identify|network_tool)$/i,
    /(scan|probe|discover|list|scanner|discovery|reconnaissance|enumeration|scans)/i,
  ];

  private readonly r2Patterns = [
    /^(fuzz|brute|guess|attempt|try|test)$/i,
    /(fuzzer|bruteforce|wordlist)/i,
  ];

  private readonly r3Patterns = [
    /^(exploit|inject|execute|run|invoke|call|trigger|modify|update|create|write|post|put|patch)$/i,
    /(exploitation|injection|rce|xss|sqli|xxe|ssrf|oast)/i,
  ];

  private readonly r4Patterns = [
    /^(delete|drop|destroy|remove|purge|wipe|clear|dump|steal|exfiltrate|admin_tool)$/i,
    /_(dump|steal|exfiltrate)$/i,
    /^(credential_dump|backdoor|steal_token)/i,
    /(backdoor|persistence|privesc)/i,
  ];

  /**
   * Infer risk level from MCP tool name and optional description.
   *
   * @param toolName - The MCP tool name (e.g., "nuclei_scan", "sql_injection_test")
   * @param toolDescription - Optional tool description for additional context
   * @returns Inferred risk level (defaults to R3 for fail-safe)
   *
   * @example
   * inferRiskLevel('port_scanner') // => 'R1'
   * inferRiskLevel('sql_injection') // => 'R3'
   * inferRiskLevel('delete_user') // => 'R4'
   * inferRiskLevel('unknown_tool') // => 'R3' (fail-safe default)
   */
  inferRiskLevel(toolName: string, toolDescription?: string): RiskLevel {
    const lowerName = toolName.toLowerCase();
    const lowerDesc = (toolDescription || '').toLowerCase();
    const combinedText = `${lowerName} ${lowerDesc}`;

    // Check R0 (metadata) first - most specific patterns
    if (this.matchesAnyPattern(lowerName, this.r0Patterns)) {
      return 'R0';
    }

    // Check R4 (destructive) - check name first for exact matches
    if (this.matchesAnyPattern(lowerName, this.r4Patterns)) {
      return 'R4';
    }

    // Check R2 (active scanning) before R1 to catch fuzzing/brute force
    if (this.matchesAnyPattern(lowerName, this.r2Patterns)) {
      return 'R2';
    }

    // Check R3 (exploit/state change)
    if (this.matchesAnyPattern(lowerName, this.r3Patterns)) {
      return 'R3';
    }

    // Check R1 (read-only)
    if (this.matchesAnyPattern(lowerName, this.r1Patterns)) {
      return 'R1';
    }

    // Now check description for additional context (only if name didn't match)
    if (this.matchesAnyPattern(combinedText, this.r4Patterns)) {
      return 'R4';
    }

    if (this.matchesAnyPattern(combinedText, this.r3Patterns)) {
      return 'R3';
    }

    if (this.matchesAnyPattern(combinedText, this.r2Patterns)) {
      return 'R2';
    }

    if (this.matchesAnyPattern(combinedText, this.r1Patterns)) {
      return 'R1';
    }

    // Default to R3 for fail-safe (unknown tools require approval)
    return 'R3';
  }

  /**
   * Batch infer risk levels for multiple tools.
   *
   * @param tools - Array of tools with name and optional description
   * @returns Map of tool names to risk levels
   */
  inferRiskLevels(
    tools: Array<{ name: string; description?: string }>
  ): Map<string, RiskLevel> {
    const riskMap = new Map<string, RiskLevel>();
    for (const tool of tools) {
      riskMap.set(tool.name, this.inferRiskLevel(tool.name, tool.description));
    }
    return riskMap;
  }

  /**
   * Check if a tool requires approval based on inferred risk level.
   *
   * @param toolName - The MCP tool name
   * @param toolDescription - Optional tool description
   * @returns True if tool requires human approval (R3 or higher)
   */
  requiresApproval(toolName: string, toolDescription?: string): boolean {
    const riskLevel = this.inferRiskLevel(toolName, toolDescription);
    return riskLevel === 'R3' || riskLevel === 'R4';
  }

  /**
   * Get a human-readable explanation of why a risk level was assigned.
   *
   * @param toolName - The MCP tool name
   * @param toolDescription - Optional tool description
   * @returns Explanation string
   */
  explainRiskLevel(toolName: string, toolDescription?: string): string {
    const riskLevel = this.inferRiskLevel(toolName, toolDescription);
    const combinedText = `${toolName} ${toolDescription || ''}`.toLowerCase();

    switch (riskLevel) {
      case 'R0':
        return 'Metadata query - safe for unrestricted use';
      case 'R1':
        return 'Read-only operation - safe within authorized scope';
      case 'R2':
        return 'Active scanning - limited impact within scope';
      case 'R3':
        if (this.matchesAnyPattern(combinedText, this.r3Patterns)) {
          return 'Exploit/state change detected - requires approval';
        }
        return 'Unknown tool behavior - requires approval (fail-safe default)';
      case 'R4':
        return 'Destructive operation detected - requires approval and break-glass token';
      default:
        return 'Risk level could not be determined';
    }
  }

  private matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
  }
}

/**
 * Singleton instance for easy access throughout the codebase.
 */
export const mcpRiskMapper = new McpRiskMapper();
