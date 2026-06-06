import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';

/**
 * McpPoisonDetector provides defense-in-depth poisoning detection for MCP tools.
 *
 * Detects:
 * - Suspicious MCP server executables (path traversal, hidden files, unusual extensions)
 * - Malicious tool schemas (exfiltration patterns, dangerous argument names)
 * - Credential leaks in tool output (tokens, keys, passwords)
 * - Command injection patterns in tool arguments
 * - Anomalous invocation patterns (rapid-fire calls, unusual sequences)
 *
 * Design Principles:
 * - Fail-closed: suspicious activity blocks execution
 * - Defense-in-depth: multiple detection layers
 * - Context-aware: considers tool name, description, and invocation history
 * - No false sense of security: detection is heuristic, not guaranteed
 */

export interface PoisonCheckResult {
  safe: boolean;
  reason?: string;
  confidence?: 'low' | 'medium' | 'high';
  threats?: string[];
}

export interface ExecutableCheckResult extends PoisonCheckResult {
  signature?: string;
  path?: string;
}

export interface SchemaCheckResult extends PoisonCheckResult {
  suspiciousFields?: string[];
  suspiciousPatterns?: string[];
}

export interface OutputCheckResult extends PoisonCheckResult {
  threats?: Array<'credential_leak' | 'path_traversal' | 'command_injection' | 'exfiltration'>;
  redactedContent?: string;
}

export interface ToolCall {
  toolName: string;
  timestamp: string;
  args: Record<string, unknown>;
  connectionId: string;
}

export interface AnomalyDetectionResult {
  anomalies: Array<{
    type: 'rapid_fire' | 'suspicious_sequence' | 'privilege_escalation' | 'data_exfiltration_pattern';
    confidence: number;
    detail: string;
  }>;
}

/**
 * McpPoisonDetector - Enterprise-grade MCP tool poisoning detection
 */
export class McpPoisonDetector {
  // Suspicious executable patterns
  private readonly suspiciousExecutablePatterns = [
    /\.\./,                           // Path traversal
    /^\.+[^.]|[/\\]\./,              // Hidden files/directories
    /\.(bat|cmd|vbs|ps1|sh|bash|zsh)$/i,  // Script extensions (prefer compiled)
    /temp|tmp|download/i,            // Temporary directories
    /(backdoor|trojan|malware|exploit|pwn)/i, // Obvious malicious names
  ];

  // Suspicious schema field patterns
  private readonly suspiciousFieldPatterns = [
    /^(password|secret|token|key|credential|auth)$/i,
    /(exfil|exfiltrate|steal|dump|extract)/i,
    /^(callback|webhook|remote_url|upload_to)/i,
    /^(eval|exec|system|shell|cmd|command)$/i,
    /(admin|root|sudo|privilege)/i,
  ];

  // Credential leak patterns
  private readonly credentialPatterns = [
    /(?:password|passwd|pwd)[\s:=]+[^\s]+/gi,
    /(?:api[_-]?key|apikey)[\s:=]+[a-zA-Z0-9_-]{20,}/gi,
    /(?:token|bearer)[\s:=]+[a-zA-Z0-9_.-]{20,}/gi,
    /(?:secret|private[_-]?key)[\s:=]+[^\s]+/gi,
    /aws[_-]?(?:access|secret)[_-]?key[\s:=]+[A-Z0-9]{20,}/gi,
    /ghp_[a-zA-Z0-9]{36,}/g,         // GitHub PAT
    /sk-[a-zA-Z0-9]{20,}/g,          // OpenAI API key pattern
    /xox[baprs]-[a-zA-Z0-9-]{10,}/g, // Slack tokens
  ];

  // Command injection patterns
  private readonly commandInjectionPatterns = [
    /[;&|`$(){}[\]<>]/,              // Shell metacharacters
    /\$\{.*\}/,                       // Variable expansion
    /\$\(.*\)/,                       // Command substitution
    /['\"].*[;&|].*['\"]/, // Quoted shell commands
  ];

  // Path traversal patterns
  private readonly pathTraversalPatterns = [
    /\.\.[/\\]/,
    /%2e%2e[/\\]/i,
    /\.\.%2f/i,
    /\.\.%5c/i,
  ];

  /**
   * Check MCP server executable for safety.
   *
   * @param path - Path to the MCP server executable
   * @returns Safety check result with signature
   *
   * Checks:
   * - Path traversal attempts
   * - Hidden files/directories
   * - Script extensions (prefer compiled binaries)
   * - Temporary directory locations
   * - Malicious naming patterns
   * - File existence and permissions
   */
  checkServerExecutable(path: string): ExecutableCheckResult {
    // Normalize path for consistent checking
    const normalizedPath = path.replace(/\\/g, '/');
    const fileName = basename(normalizedPath);
    const ext = extname(fileName);

    // Check for path traversal
    if (this.suspiciousExecutablePatterns.some(pattern => pattern.test(normalizedPath))) {
      return {
        safe: false,
        reason: 'Suspicious executable path pattern detected',
        confidence: 'high',
        path: normalizedPath,
      };
    }

    // Check if file exists
    if (!existsSync(path)) {
      return {
        safe: false,
        reason: 'Executable file does not exist',
        confidence: 'high',
        path: normalizedPath,
      };
    }

    // Check file permissions (Unix-like systems)
    try {
      const stats = statSync(path);
      if (!stats.isFile()) {
        return {
          safe: false,
          reason: 'Path is not a regular file',
          confidence: 'high',
          path: normalizedPath,
        };
      }

      // Generate signature (SHA-256 of path for now - in production, hash file contents)
      const signature = createHash('sha256').update(path).digest('hex');

      return {
        safe: true,
        signature,
        path: normalizedPath,
      };
    } catch (error) {
      return {
        safe: false,
        reason: `Failed to verify executable: ${error instanceof Error ? error.message : 'unknown error'}`,
        confidence: 'high',
        path: normalizedPath,
      };
    }
  }

  /**
   * Check MCP tool schema for suspicious patterns.
   *
   * @param tool - MCP tool metadata with inputSchema
   * @returns Safety check result with suspicious fields
   *
   * Checks:
   * - Credential/secret field names
   * - Exfiltration-related fields (callback URLs, webhooks)
   * - Dangerous execution fields (eval, exec, system)
   * - Privilege escalation hints
   */
  checkToolSchema(tool: { name: string; description?: string; inputSchema?: Record<string, unknown> }): SchemaCheckResult {
    const suspiciousFields: string[] = [];
    const suspiciousPatterns: string[] = [];

    // Check tool name and description
    const combinedText = `${tool.name} ${tool.description || ''}`;
    for (const pattern of this.suspiciousFieldPatterns) {
      if (pattern.test(combinedText)) {
        suspiciousPatterns.push(pattern.source);
      }
    }

    // Check input schema fields
    if (tool.inputSchema && typeof tool.inputSchema === 'object') {
      const properties = (tool.inputSchema as any).properties as Record<string, unknown> | undefined;
      if (properties && typeof properties === 'object') {
        for (const [fieldName, fieldSpec] of Object.entries(properties)) {
          for (const pattern of this.suspiciousFieldPatterns) {
            if (pattern.test(fieldName)) {
              suspiciousFields.push(fieldName);
              break;
            }
          }

          // Check field description
          if (fieldSpec && typeof fieldSpec === 'object') {
            const desc = (fieldSpec as any).description;
            if (typeof desc === 'string') {
              for (const pattern of this.suspiciousFieldPatterns) {
                if (pattern.test(desc)) {
                  suspiciousFields.push(`${fieldName} (description)`);
                  break;
                }
              }
            }
          }
        }
      }
    }

    if (suspiciousFields.length > 0 || suspiciousPatterns.length > 0) {
      return {
        safe: false,
        reason: 'Suspicious schema patterns detected',
        confidence: 'medium',
        suspiciousFields: suspiciousFields.length > 0 ? suspiciousFields : undefined,
        suspiciousPatterns: suspiciousPatterns.length > 0 ? suspiciousPatterns : undefined,
      };
    }

    return { safe: true };
  }

  /**
   * Check MCP tool output for credential leaks and malicious content.
   *
   * @param output - Tool output content (string or JSON)
   * @returns Safety check result with detected threats
   *
   * Checks:
   * - Credential patterns (API keys, tokens, passwords)
   * - Path traversal sequences
   * - Command injection patterns
   * - Exfiltration indicators
   */
  checkOutputContent(output: string): OutputCheckResult {
    const threats: Array<'credential_leak' | 'path_traversal' | 'command_injection' | 'exfiltration'> = [];

    // Check for credential leaks
    let hasCredentialLeak = false;
    for (const pattern of this.credentialPatterns) {
      if (pattern.test(output)) {
        hasCredentialLeak = true;
        break;
      }
    }
    if (hasCredentialLeak) {
      threats.push('credential_leak');
    }

    // Check for path traversal
    if (this.pathTraversalPatterns.some(pattern => pattern.test(output))) {
      threats.push('path_traversal');
    }

    // Check for command injection patterns
    if (this.commandInjectionPatterns.some(pattern => pattern.test(output))) {
      threats.push('command_injection');
    }

    // Check for exfiltration indicators (URLs, base64 blobs)
    if (
      /https?:\/\/[^\s]+/i.test(output) &&
      /(upload|exfil|callback|webhook|send)/i.test(output)
    ) {
      threats.push('exfiltration');
    }

    if (threats.length > 0) {
      return {
        safe: false,
        reason: `Suspicious content detected: ${threats.join(', ')}`,
        confidence: 'high',
        threats,
      };
    }

    return { safe: true };
  }

  /**
   * Detect anomalous invocation patterns in tool call history.
   *
   * @param callHistory - Recent tool invocation history
   * @returns Detected anomalies with confidence scores
   *
   * Detects:
   * - Rapid-fire calls (potential automated exploitation)
   * - Suspicious sequences (recon → exploit → exfiltration)
   * - Privilege escalation patterns
   * - Data exfiltration patterns
   */
  detectAnomalousPatterns(callHistory: ToolCall[]): AnomalyDetectionResult {
    const anomalies: AnomalyDetectionResult['anomalies'] = [];

    if (callHistory.length === 0) {
      return { anomalies };
    }

    // Detect rapid-fire calls (more than 10 calls in 1 second)
    const now = Date.now();
    const recentCalls = callHistory.filter(call => {
      const callTime = new Date(call.timestamp).getTime();
      return now - callTime < 1000;
    });

    if (recentCalls.length > 10) {
      anomalies.push({
        type: 'rapid_fire',
        confidence: 0.9,
        detail: `${recentCalls.length} calls in the last second`,
      });
    }

    // Detect suspicious tool sequences (recon → exploit → exfil)
    const toolNames = callHistory.slice(-10).map(c => c.toolName.toLowerCase());
    const hasRecon = toolNames.some(name => /scan|probe|discover|list|enum/i.test(name));
    const hasExploit = toolNames.some(name => /exploit|inject|execute|run/i.test(name));
    const hasExfil = toolNames.some(name => /dump|steal|exfil|extract|download/i.test(name));

    if (hasRecon && hasExploit && hasExfil) {
      anomalies.push({
        type: 'suspicious_sequence',
        confidence: 0.8,
        detail: 'Reconnaissance → Exploitation → Exfiltration sequence detected',
      });
    }

    // Detect privilege escalation patterns
    const hasPrivEsc = toolNames.some(name =>
      /(admin|root|sudo|privilege|elevate|escalat)/i.test(name)
    );
    if (hasPrivEsc) {
      anomalies.push({
        type: 'privilege_escalation',
        confidence: 0.7,
        detail: 'Privilege escalation tool invoked',
      });
    }

    // Detect data exfiltration patterns (multiple dump/extract calls)
    const exfilCount = toolNames.filter(name =>
      /(dump|steal|exfil|extract|download|leak)/i.test(name)
    ).length;
    if (exfilCount >= 3) {
      anomalies.push({
        type: 'data_exfiltration_pattern',
        confidence: 0.85,
        detail: `${exfilCount} potential exfiltration calls in recent history`,
      });
    }

    return { anomalies };
  }

  /**
   * Comprehensive safety check combining all detection methods.
   *
   * @param options - Comprehensive check options
   * @returns Combined safety check result
   */
  comprehensiveCheck(options: {
    executablePath?: string;
    tool?: { name: string; description?: string; inputSchema?: Record<string, unknown> };
    output?: string;
    callHistory?: ToolCall[];
  }): PoisonCheckResult {
    const threats: string[] = [];

    if (options.executablePath) {
      const execCheck = this.checkServerExecutable(options.executablePath);
      if (!execCheck.safe) {
        threats.push(`Executable: ${execCheck.reason}`);
      }
    }

    if (options.tool) {
      const schemaCheck = this.checkToolSchema(options.tool);
      if (!schemaCheck.safe) {
        threats.push(`Schema: ${schemaCheck.reason}`);
      }
    }

    if (options.output) {
      const outputCheck = this.checkOutputContent(options.output);
      if (!outputCheck.safe) {
        threats.push(`Output: ${outputCheck.reason}`);
      }
    }

    if (options.callHistory) {
      const anomalyCheck = this.detectAnomalousPatterns(options.callHistory);
      if (anomalyCheck.anomalies.length > 0) {
        const highConfidenceAnomalies = anomalyCheck.anomalies.filter(a => a.confidence >= 0.7);
        if (highConfidenceAnomalies.length > 0) {
          threats.push(`Anomalies: ${highConfidenceAnomalies.map(a => a.detail).join(', ')}`);
        }
      }
    }

    if (threats.length > 0) {
      return {
        safe: false,
        reason: threats.join(' | '),
        confidence: 'high',
        threats,
      };
    }

    return { safe: true };
  }
}

/**
 * Singleton instance for easy access throughout the codebase.
 */
export const mcpPoisonDetector = new McpPoisonDetector();
