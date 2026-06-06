import type { RiskLevel } from '../../domain/types.js';

/**
 * MCP (Model Context Protocol) Server Security Audit
 *
 * Audits MCP servers for dangerous permissions, schema vulnerabilities, and misconfigurations.
 * Template: ai.mcp_server_audit
 * Risk Level: R1 (passive audit) to R2 (active probing)
 */

export interface McpServerAuditResult {
  target: string;
  serverName?: string;
  version?: string;
  vulnerable: boolean;
  findings: McpSecurityFinding[];
  dangerousPermissions: string[];
  schemaVulnerabilities: string[];
  toolPoisoningRisk: boolean;
  unsafeConfigurations: string[];
  riskScore: number;
  evidenceSummary: Record<string, unknown>;
}

export interface McpSecurityFinding {
  id: string;
  category: McpVulnerabilityCategory;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedTools?: string[];
  remediation: string;
}

export type McpVulnerabilityCategory =
  | 'dangerous_permission'
  | 'schema_vulnerability'
  | 'tool_poisoning'
  | 'unsafe_configuration'
  | 'authentication_bypass'
  | 'command_injection'
  | 'path_traversal';

/**
 * Dangerous MCP permissions that require scrutiny
 */
export const DANGEROUS_MCP_PERMISSIONS = [
  {
    permission: 'filesystem_write',
    severity: 'critical' as const,
    description: 'Allows arbitrary file system writes',
    remediation: 'Restrict to specific directories with allowlist',
  },
  {
    permission: 'filesystem_read',
    severity: 'high' as const,
    description: 'Allows file system reads, potential for sensitive file access',
    remediation: 'Implement strict path validation and deny listing',
  },
  {
    permission: 'network_access',
    severity: 'high' as const,
    description: 'Allows arbitrary network requests',
    remediation: 'Restrict to allowed domains and protocols',
  },
  {
    permission: 'shell_execute',
    severity: 'critical' as const,
    description: 'Allows shell command execution',
    remediation: 'Use sandboxed execution with strict command allowlist',
  },
  {
    permission: 'process_spawn',
    severity: 'critical' as const,
    description: 'Allows spawning arbitrary processes',
    remediation: 'Restrict to specific executables with input validation',
  },
  {
    permission: 'environment_access',
    severity: 'medium' as const,
    description: 'Access to environment variables (may contain secrets)',
    remediation: 'Filter sensitive environment variables',
  },
  {
    permission: 'database_access',
    severity: 'high' as const,
    description: 'Direct database access',
    remediation: 'Use parameterized queries and least privilege accounts',
  },
];

/**
 * MCP Schema vulnerability patterns
 */
export const MCP_SCHEMA_VULNERABILITIES = [
  {
    id: 'missing-input-validation',
    pattern: /"type":\s*"string"(?!.*"pattern"|.*"enum"|.*"maxLength")/,
    severity: 'medium' as const,
    description: 'String input without validation constraints',
    remediation: 'Add pattern, enum, or maxLength constraints',
  },
  {
    id: 'unrestricted-file-path',
    pattern: /"name":\s*"(path|file|directory)".*"type":\s*"string"/,
    severity: 'high' as const,
    description: 'File path parameter without validation',
    remediation: 'Add path traversal protection and allowlist validation',
  },
  {
    id: 'command-injection-risk',
    pattern: /"name":\s*"(command|cmd|exec|shell)".*"type":\s*"string"/,
    severity: 'critical' as const,
    description: 'Command parameter without proper escaping',
    remediation: 'Use command allowlist and proper argument escaping',
  },
  {
    id: 'sql-injection-risk',
    pattern: /"name":\s*"(query|sql|where)".*"type":\s*"string"/,
    severity: 'high' as const,
    description: 'SQL parameter without parameterization',
    remediation: 'Enforce parameterized queries',
  },
  {
    id: 'url-ssrf-risk',
    pattern: /"name":\s*"(url|endpoint|host)".*"type":\s*"string"/,
    severity: 'high' as const,
    description: 'URL parameter without SSRF protection',
    remediation: 'Validate against allowed domains and block internal IPs',
  },
  {
    id: 'missing-required-fields',
    pattern: /"required":\s*\[\s*\]/,
    severity: 'low' as const,
    description: 'No required fields defined',
    remediation: 'Mark critical parameters as required',
  },
];

/**
 * Tool poisoning indicators
 */
export const TOOL_POISONING_INDICATORS = [
  {
    indicator: 'hidden_instruction',
    pattern: /<!--.*?-->|\/\*.*?\*\/|\{%.*?%\}/s,
    description: 'Hidden instructions in tool descriptions',
  },
  {
    indicator: 'prompt_injection',
    pattern: /ignore\s+(all\s+)?(previous|prior)\s+instructions|system\s+override|developer\s+mode/i,
    description: 'Prompt injection patterns in tool metadata',
  },
  {
    indicator: 'misleading_description',
    pattern: /safe|harmless|read-only/i,
    description: 'Misleading safety claims (check against actual permissions)',
  },
  {
    indicator: 'obfuscated_params',
    pattern: /​|‌|‍|[\x00-\x1f]/,
    description: 'Unicode obfuscation or control characters in parameters',
  },
];

/**
 * Unsafe MCP server configurations
 */
export const UNSAFE_MCP_CONFIGS = [
  {
    config: 'allow_all_origins',
    indicator: '"allowOrigins": "*"',
    severity: 'high' as const,
    description: 'CORS allows all origins',
    remediation: 'Restrict to specific trusted origins',
  },
  {
    config: 'no_authentication',
    indicator: '"authentication": false',
    severity: 'critical' as const,
    description: 'Authentication disabled',
    remediation: 'Enable authentication for all MCP endpoints',
  },
  {
    config: 'debug_mode_enabled',
    indicator: '"debug": true',
    severity: 'medium' as const,
    description: 'Debug mode enabled in production',
    remediation: 'Disable debug mode',
  },
  {
    config: 'verbose_errors',
    indicator: '"verboseErrors": true',
    severity: 'medium' as const,
    description: 'Verbose error messages enabled',
    remediation: 'Use generic error messages in production',
  },
  {
    config: 'no_rate_limiting',
    indicator: '"rateLimit": false',
    severity: 'high' as const,
    description: 'Rate limiting disabled',
    remediation: 'Enable rate limiting to prevent abuse',
  },
];

/**
 * Audit MCP server configuration
 */
export function auditMcpServer(
  serverConfig: unknown,
  tools: unknown[],
): McpServerAuditResult {
  const findings: McpSecurityFinding[] = [];
  const dangerousPermissions: string[] = [];
  const schemaVulnerabilities: string[] = [];
  const unsafeConfigurations: string[] = [];

  const configStr = JSON.stringify(serverConfig, null, 2);
  const toolsStr = JSON.stringify(tools, null, 2);

  // Check for dangerous permissions
  for (const perm of DANGEROUS_MCP_PERMISSIONS) {
    if (configStr.includes(perm.permission) || toolsStr.includes(perm.permission)) {
      dangerousPermissions.push(perm.permission);
      findings.push({
        id: `dangerous-perm-${perm.permission}`,
        category: 'dangerous_permission',
        severity: perm.severity,
        title: `Dangerous permission: ${perm.permission}`,
        description: perm.description,
        remediation: perm.remediation,
      });
    }
  }

  // Check for schema vulnerabilities
  for (const vuln of MCP_SCHEMA_VULNERABILITIES) {
    if (vuln.pattern.test(toolsStr)) {
      schemaVulnerabilities.push(vuln.id);
      findings.push({
        id: vuln.id,
        category: 'schema_vulnerability',
        severity: vuln.severity,
        title: vuln.id.replace(/-/g, ' '),
        description: vuln.description,
        remediation: vuln.remediation,
      });
    }
  }

  // Check for tool poisoning
  let toolPoisoningRisk = false;
  for (const indicator of TOOL_POISONING_INDICATORS) {
    if (indicator.pattern.test(toolsStr)) {
      toolPoisoningRisk = true;
      findings.push({
        id: `tool-poisoning-${indicator.indicator}`,
        category: 'tool_poisoning',
        severity: 'high',
        title: `Tool poisoning risk: ${indicator.indicator}`,
        description: indicator.description,
        remediation: 'Review tool descriptions and remove suspicious patterns',
      });
    }
  }

  // Check for unsafe configurations
  for (const config of UNSAFE_MCP_CONFIGS) {
    if (configStr.includes(config.indicator)) {
      unsafeConfigurations.push(config.config);
      findings.push({
        id: `unsafe-config-${config.config}`,
        category: 'unsafe_configuration',
        severity: config.severity,
        title: `Unsafe configuration: ${config.config}`,
        description: config.description,
        remediation: config.remediation,
      });
    }
  }

  // Calculate risk score (0-100)
  const riskScore = calculateMcpRiskScore(findings);

  return {
    target: '',
    vulnerable: findings.length > 0,
    findings,
    dangerousPermissions,
    schemaVulnerabilities,
    toolPoisoningRisk,
    unsafeConfigurations,
    riskScore,
    evidenceSummary: {
      totalFindings: findings.length,
      criticalFindings: findings.filter((f) => f.severity === 'critical').length,
      highFindings: findings.filter((f) => f.severity === 'high').length,
      dangerousPermissionsCount: dangerousPermissions.length,
      schemaVulnerabilitiesCount: schemaVulnerabilities.length,
      toolPoisoningRisk,
    },
  };
}

/**
 * Calculate risk score based on findings
 */
function calculateMcpRiskScore(findings: McpSecurityFinding[]): number {
  let score = 0;

  for (const finding of findings) {
    switch (finding.severity) {
      case 'critical':
        score += 25;
        break;
      case 'high':
        score += 15;
        break;
      case 'medium':
        score += 8;
        break;
      case 'low':
        score += 3;
        break;
    }
  }

  return Math.min(score, 100);
}

/**
 * Audit specific MCP tool for security issues
 */
export function auditMcpTool(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
}): McpSecurityFinding[] {
  const findings: McpSecurityFinding[] = [];
  const toolStr = JSON.stringify(tool, null, 2);

  // Check for command injection risks in tool name
  if (/[;&|`$()]/.test(tool.name)) {
    findings.push({
      id: 'tool-name-injection',
      category: 'command_injection',
      severity: 'high',
      title: 'Command injection risk in tool name',
      description: 'Tool name contains shell metacharacters',
      affectedTools: [tool.name],
      remediation: 'Use alphanumeric characters only in tool names',
    });
  }

  // Check for path traversal in description
  if (tool.description?.includes('../') || tool.description?.includes('..\\')) {
    findings.push({
      id: 'tool-description-traversal',
      category: 'path_traversal',
      severity: 'medium',
      title: 'Path traversal pattern in description',
      description: 'Tool description contains path traversal sequences',
      affectedTools: [tool.name],
      remediation: 'Remove path traversal patterns from descriptions',
    });
  }

  // Check for prompt injection in description
  for (const indicator of TOOL_POISONING_INDICATORS) {
    if (tool.description && indicator.pattern.test(tool.description)) {
      findings.push({
        id: `tool-poisoning-${tool.name}`,
        category: 'tool_poisoning',
        severity: 'high',
        title: `Tool poisoning detected in ${tool.name}`,
        description: indicator.description,
        affectedTools: [tool.name],
        remediation: 'Remove malicious patterns from tool metadata',
      });
    }
  }

  // Check schema vulnerabilities
  for (const vuln of MCP_SCHEMA_VULNERABILITIES) {
    if (vuln.pattern.test(toolStr)) {
      findings.push({
        id: `${vuln.id}-${tool.name}`,
        category: 'schema_vulnerability',
        severity: vuln.severity,
        title: `${vuln.id} in ${tool.name}`,
        description: vuln.description,
        affectedTools: [tool.name],
        remediation: vuln.remediation,
      });
    }
  }

  return findings;
}

/**
 * Generate MCP server audit probes
 */
export interface McpAuditProbe {
  id: string;
  name: string;
  description: string;
  riskLevel: RiskLevel;
  endpoint: string;
  method: 'GET' | 'POST';
  expectedResponses: string[];
}

export const MCP_AUDIT_PROBES: McpAuditProbe[] = [
  {
    id: 'mcp-list-tools',
    name: 'MCP List Tools',
    description: 'Enumerate available MCP tools',
    riskLevel: 'R1',
    endpoint: '/mcp/tools',
    method: 'GET',
    expectedResponses: ['tools', 'name', 'inputSchema'],
  },
  {
    id: 'mcp-server-info',
    name: 'MCP Server Info',
    description: 'Retrieve MCP server information',
    riskLevel: 'R1',
    endpoint: '/mcp/info',
    method: 'GET',
    expectedResponses: ['name', 'version', 'capabilities'],
  },
  {
    id: 'mcp-schema',
    name: 'MCP Schema Definition',
    description: 'Retrieve MCP schema definitions',
    riskLevel: 'R1',
    endpoint: '/mcp/schema',
    method: 'GET',
    expectedResponses: ['$schema', 'definitions', 'properties'],
  },
];

/**
 * Check if MCP server has authentication bypass
 */
export function checkMcpAuthBypass(
  response: {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  },
): boolean {
  // Successful response without authentication header
  if (response.statusCode === 200) {
    const hasAuth =
      response.headers['authorization'] ||
      response.headers['x-api-key'] ||
      response.headers['cookie']?.includes('session');

    return !hasAuth;
  }

  return false;
}
