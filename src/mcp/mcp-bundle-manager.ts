import type { RiskLevel } from '../domain/types.js';
import type { McpConnectionConfig } from '../connectors/mcp-execution-service.js';

/**
 * MCP Bundle - Predefined safe configuration for a specific MCP server
 */
export interface McpBundle {
  /** Bundle identifier */
  id: string;
  /** Human-readable bundle name */
  name: string;
  /** Bundle description and purpose */
  description: string;
  /** MCP connection configuration */
  connection: McpConnectionConfig;
  /** Tool-specific governance policies */
  toolPolicies: Map<string, McpToolPolicy>;
  /** Output sanitization rules */
  outputSanitization: OutputSanitizationRule[];
  /** Whether this bundle is enabled by default */
  enabledByDefault: boolean;
  /** Bundle maturity level */
  maturity: 'experimental' | 'beta' | 'stable';
  /** Required platform capabilities */
  requiredCapabilities?: string[];
}

/**
 * Tool-specific policy within a bundle
 */
export interface McpToolPolicy {
  /** Tool name in the MCP server */
  toolName: string;
  /** Assigned risk level */
  riskLevel: RiskLevel;
  /** Whether this tool is allowed */
  allowed: boolean;
  /** Allowlist of specific argument values (optional) */
  allowedArgs?: Record<string, unknown[]>;
  /** Denylist of specific argument values (optional) */
  deniedArgs?: Record<string, unknown[]>;
  /** Maximum invocation rate per minute */
  maxInvocationsPerMinute?: number;
  /** Human-readable policy explanation */
  reasoning?: string;
}

/**
 * Output sanitization rule for MCP tool responses
 */
export interface OutputSanitizationRule {
  /** Rule identifier */
  id: string;
  /** Pattern to match (regex or keyword) */
  pattern: string | RegExp;
  /** Sanitization action */
  action: 'redact' | 'block' | 'warn';
  /** Replacement text (for redact action) */
  replacement?: string;
  /** Human-readable rule description */
  description: string;
}

/**
 * McpBundleManager manages predefined safe MCP tool bundles.
 *
 * Bundles provide:
 * - Pre-vetted MCP server configurations
 * - Tool-level allowlists and risk assignments
 * - Output sanitization rules
 * - Maturity and stability signals
 *
 * Design Principles:
 * - Fail-closed: unknown tools are blocked by default
 * - Defense-in-depth: multiple governance layers
 * - Auditable: all policy decisions are logged
 * - Composable: bundles can be combined and extended
 */
export class McpBundleManager {
  private bundles: Map<string, McpBundle> = new Map();

  constructor() {
    // Register built-in safe bundles
    this.registerBuiltInBundles();
  }

  /**
   * Register a new MCP bundle.
   *
   * @param bundle - Bundle configuration
   */
  registerBundle(bundle: McpBundle): void {
    this.bundles.set(bundle.id, bundle);
  }

  /**
   * Get a registered bundle by ID.
   *
   * @param bundleId - Bundle identifier
   * @returns Bundle configuration or undefined
   */
  getBundle(bundleId: string): McpBundle | undefined {
    return this.bundles.get(bundleId);
  }

  /**
   * List all registered bundles.
   *
   * @returns Array of bundle configurations
   */
  listBundles(): McpBundle[] {
    return Array.from(this.bundles.values());
  }

  /**
   * List bundles filtered by maturity level.
   *
   * @param maturity - Minimum maturity level
   * @returns Filtered bundle list
   */
  listBundlesByMaturity(maturity: 'experimental' | 'beta' | 'stable'): McpBundle[] {
    const maturityOrder = { experimental: 0, beta: 1, stable: 2 };
    const minLevel = maturityOrder[maturity];

    return Array.from(this.bundles.values()).filter(
      bundle => maturityOrder[bundle.maturity] >= minLevel
    );
  }

  /**
   * Get tool policy for a specific tool in a bundle.
   *
   * @param bundleId - Bundle identifier
   * @param toolName - MCP tool name
   * @returns Tool policy or undefined
   */
  getToolPolicy(bundleId: string, toolName: string): McpToolPolicy | undefined {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      return undefined;
    }

    return bundle.toolPolicies.get(toolName);
  }

  /**
   * Check if a tool is allowed in a specific bundle.
   *
   * @param bundleId - Bundle identifier
   * @param toolName - MCP tool name
   * @returns true if tool is allowed
   */
  isToolAllowed(bundleId: string, toolName: string): boolean {
    const policy = this.getToolPolicy(bundleId, toolName);
    return policy?.allowed ?? false;
  }

  /**
   * Apply output sanitization rules from a bundle.
   *
   * @param bundleId - Bundle identifier
   * @param output - Raw tool output
   * @returns Sanitized output and applied rules
   */
  sanitizeOutput(bundleId: string, output: string): { sanitized: string; appliedRules: string[] } {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      return { sanitized: output, appliedRules: [] };
    }

    let sanitized = output;
    const appliedRules: string[] = [];

    for (const rule of bundle.outputSanitization) {
      const pattern = typeof rule.pattern === 'string' ? new RegExp(rule.pattern, 'gi') : rule.pattern;

      if (rule.action === 'redact' && pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, rule.replacement ?? '[REDACTED]');
        appliedRules.push(rule.id);
      } else if (rule.action === 'block' && pattern.test(output)) {
        throw new Error(`Output blocked by sanitization rule: ${rule.description}`);
      }
    }

    return { sanitized, appliedRules };
  }

  /**
   * Register built-in safe MCP bundles.
   * @private
   */
  private registerBuiltInBundles(): void {
    // Bundle 1: safe-web-testing (playwright-mcp with limited operations)
    this.registerBundle({
      id: 'safe-web-testing',
      name: 'Safe Web Testing',
      description: 'Playwright MCP with navigation and screenshot only (no script execution)',
      connection: {
        id: 'playwright-mcp',
        name: 'Playwright MCP',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-playwright'],
        timeoutMs: 30000,
      },
      toolPolicies: new Map<string, McpToolPolicy>([
        ['playwright_navigate', {
          toolName: 'playwright_navigate',
          riskLevel: 'R1',
          allowed: true,
          maxInvocationsPerMinute: 20,
          reasoning: 'Navigation is read-only and safe within authorized scope',
        }],
        ['playwright_screenshot', {
          toolName: 'playwright_screenshot',
          riskLevel: 'R1',
          allowed: true,
          maxInvocationsPerMinute: 10,
          reasoning: 'Screenshots are read-only captures',
        }],
        ['playwright_click', {
          toolName: 'playwright_click',
          riskLevel: 'R2',
          allowed: true,
          maxInvocationsPerMinute: 15,
          reasoning: 'Clicking may trigger state changes',
        }],
        ['playwright_fill', {
          toolName: 'playwright_fill',
          riskLevel: 'R2',
          allowed: true,
          maxInvocationsPerMinute: 10,
          reasoning: 'Form filling may submit data',
        }],
        ['playwright_evaluate', {
          toolName: 'playwright_evaluate',
          riskLevel: 'R4',
          allowed: false,
          reasoning: 'JavaScript execution in browser context is dangerous',
        }],
      ]),
      outputSanitization: [
        {
          id: 'redact_cookies',
          pattern: /cookie[s]?[:=]\s*[^\s;]+/gi,
          action: 'redact',
          replacement: 'cookie=[REDACTED]',
          description: 'Redact cookie values from output',
        },
        {
          id: 'redact_tokens',
          pattern: /(?:token|bearer|authorization)[:=]\s*[^\s]+/gi,
          action: 'redact',
          replacement: 'token=[REDACTED]',
          description: 'Redact authentication tokens',
        },
      ],
      enabledByDefault: true,
      maturity: 'stable',
    });

    // Bundle 2: safe-file-ops (filesystem-mcp with read-only)
    this.registerBundle({
      id: 'safe-file-ops',
      name: 'Safe File Operations',
      description: 'Filesystem MCP with read-only operations (no write/delete)',
      connection: {
        id: 'filesystem-mcp',
        name: 'Filesystem MCP',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        timeoutMs: 30000,
      },
      toolPolicies: new Map<string, McpToolPolicy>([
        ['read_file', {
          toolName: 'read_file',
          riskLevel: 'R1',
          allowed: true,
          maxInvocationsPerMinute: 30,
          reasoning: 'Read-only file access',
        }],
        ['list_directory', {
          toolName: 'list_directory',
          riskLevel: 'R1',
          allowed: true,
          maxInvocationsPerMinute: 20,
          reasoning: 'Directory listing is read-only',
        }],
        ['write_file', {
          toolName: 'write_file',
          riskLevel: 'R4',
          allowed: false,
          reasoning: 'File writing can modify system state',
        }],
        ['delete_file', {
          toolName: 'delete_file',
          riskLevel: 'R4',
          allowed: false,
          reasoning: 'File deletion is destructive',
        }],
      ]),
      outputSanitization: [
        {
          id: 'redact_file_secrets',
          pattern: /(?:password|api[_-]?key|secret|token)[:=]\s*[^\s\n]+/gi,
          action: 'redact',
          replacement: '[REDACTED]',
          description: 'Redact secrets from file contents',
        },
      ],
      enabledByDefault: true,
      maturity: 'stable',
    });

    // Bundle 3: safe-search (google-search-mcp)
    this.registerBundle({
      id: 'safe-search',
      name: 'Safe Search',
      description: 'Google Search MCP for OSINT and reconnaissance',
      connection: {
        id: 'google-search-mcp',
        name: 'Google Search MCP',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-google-search'],
        env: {
          // User must provide GOOGLE_API_KEY and GOOGLE_CSE_ID
        },
        timeoutMs: 30000,
      },
      toolPolicies: new Map<string, McpToolPolicy>([
        ['google_search', {
          toolName: 'google_search',
          riskLevel: 'R1',
          allowed: true,
          maxInvocationsPerMinute: 10,
          reasoning: 'Search is read-only OSINT',
        }],
      ]),
      outputSanitization: [],
      enabledByDefault: true,
      maturity: 'stable',
    });

    // Bundle 4: kali-approved (zebbern-kali-mcp with allowlist)
    this.registerBundle({
      id: 'kali-approved',
      name: 'Kali Linux Tools (Approved)',
      description: 'Zebbern Kali MCP with allowlisted safe tools only',
      connection: {
        id: 'zebbern-kali-mcp',
        name: 'Zebbern Kali MCP',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'zebbern-kali-mcp'],
        timeoutMs: 60000,
      },
      toolPolicies: new Map<string, McpToolPolicy>([
        ['network_tool', {
          toolName: 'network_tool',
          riskLevel: 'R1',
          allowed: true,
          allowedArgs: {
            tool: ['nmap', 'dig', 'host', 'nslookup', 'whois'],
          },
          maxInvocationsPerMinute: 5,
          reasoning: 'Passive network reconnaissance tools',
        }],
        ['web_scanner', {
          toolName: 'web_scanner',
          riskLevel: 'R2',
          allowed: true,
          allowedArgs: {
            tool: ['nikto', 'dirb', 'gobuster'],
          },
          maxInvocationsPerMinute: 3,
          reasoning: 'Active web scanning with limited impact',
        }],
        ['exploit_tool', {
          toolName: 'exploit_tool',
          riskLevel: 'R4',
          allowed: false,
          reasoning: 'Exploitation tools require explicit approval',
        }],
      ]),
      outputSanitization: [
        {
          id: 'redact_credentials',
          pattern: /(?:password|hash)[:=]\s*[^\s\n]+/gi,
          action: 'redact',
          replacement: '[REDACTED]',
          description: 'Redact discovered credentials',
        },
      ],
      enabledByDefault: false,
      maturity: 'beta',
      requiredCapabilities: ['external-toolbox'],
    });

    // Bundle 5: pentest-thinking (PentestThinkingMCP)
    this.registerBundle({
      id: 'pentest-thinking',
      name: 'Pentest Thinking',
      description: 'PentestThinkingMCP for strategic planning and methodology',
      connection: {
        id: 'pentest-thinking-mcp',
        name: 'Pentest Thinking MCP',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'pentest-thinking-mcp'],
        timeoutMs: 30000,
      },
      toolPolicies: new Map<string, McpToolPolicy>([
        ['suggest_methodology', {
          toolName: 'suggest_methodology',
          riskLevel: 'R0',
          allowed: true,
          maxInvocationsPerMinute: 20,
          reasoning: 'Methodology suggestions are metadata only',
        }],
        ['explain_technique', {
          toolName: 'explain_technique',
          riskLevel: 'R0',
          allowed: true,
          maxInvocationsPerMinute: 20,
          reasoning: 'Educational content is safe',
        }],
      ]),
      outputSanitization: [],
      enabledByDefault: true,
      maturity: 'stable',
    });
  }

  /**
   * Validate bundle configuration for safety.
   *
   * @param bundle - Bundle to validate
   * @returns Validation result with warnings
   */
  validateBundle(bundle: McpBundle): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Check for missing output sanitization on bundles with R3/R4 tools
    const hasHighRiskTools = Array.from(bundle.toolPolicies.values()).some(
      policy => policy.allowed && (policy.riskLevel === 'R3' || policy.riskLevel === 'R4')
    );

    if (hasHighRiskTools && bundle.outputSanitization.length === 0) {
      warnings.push('Bundle contains high-risk tools but has no output sanitization rules');
    }

    // Check for overly permissive rate limits
    for (const [toolName, policy] of bundle.toolPolicies.entries()) {
      if (policy.allowed && (!policy.maxInvocationsPerMinute || policy.maxInvocationsPerMinute > 100)) {
        warnings.push(`Tool ${toolName} has no rate limit or limit is too high`);
      }
    }

    // Check for dangerous tool names without denial
    const dangerousPatterns = ['delete', 'drop', 'destroy', 'exec', 'eval', 'backdoor'];
    for (const [toolName, policy] of bundle.toolPolicies.entries()) {
      if (policy.allowed && dangerousPatterns.some(pattern => toolName.toLowerCase().includes(pattern))) {
        warnings.push(`Tool ${toolName} has dangerous name but is marked as allowed`);
      }
    }

    return { valid: warnings.length === 0, warnings };
  }
}

/**
 * Singleton instance for easy access throughout the codebase.
 */
export const mcpBundleManager = new McpBundleManager();
