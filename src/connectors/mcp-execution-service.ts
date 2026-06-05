import { newId, nowIso } from '../domain/ids.js';
import type { EvidenceKind, RiskLevel } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import { redactText } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';

/**
 * MCP (Model Context Protocol) connection configuration
 */
export interface McpConnectionConfig {
  /** Unique identifier for this MCP server connection */
  id: string;
  /** Human-readable name for this MCP server */
  name: string;
  /** Connection transport type */
  transport: 'stdio' | 'sse' | 'websocket';
  /** Command to execute for stdio transport */
  command?: string;
  /** Arguments for stdio command */
  args?: string[];
  /** Environment variables for stdio process */
  env?: Record<string, string>;
  /** URL for SSE/WebSocket transport */
  url?: string;
  /** Authentication headers for HTTP-based transports */
  headers?: Record<string, string>;
  /** Connection timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum retry attempts for failed connections */
  maxRetries?: number;
}

/**
 * MCP connection status
 */
export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'closed';

/**
 * MCP tool metadata from server
 */
export interface McpToolMetadata {
  /** Tool name as exposed by MCP server */
  name: string;
  /** Tool description from MCP server */
  description?: string;
  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, unknown>;
  /** Whether this tool requires approval before execution */
  requiresApproval?: boolean;
  /** Estimated risk level for this tool */
  estimatedRiskLevel?: RiskLevel;
}

/**
 * MCP tool invocation request
 */
export interface McpToolInvokeRequest {
  /** Run ID for audit trail */
  runId: string;
  /** MCP connection ID */
  connectionId: string;
  /** Tool name to invoke */
  toolName: string;
  /** Tool arguments (JSON-serializable) */
  args: Record<string, unknown>;
  /** Risk level for governance */
  riskLevel: RiskLevel;
  /** Optional approval ID if pre-approved */
  approvalId?: string;
  /** Timeout for tool execution */
  timeoutMs?: number;
}

/**
 * MCP tool invocation result
 */
export interface McpToolInvokeResult {
  /** Unique invocation ID for audit trail */
  invocationId: string;
  /** Execution status */
  status: 'success' | 'error' | 'timeout' | 'blocked';
  /** Tool output (JSON-serializable) */
  output?: unknown;
  /** Error message if failed */
  error?: string;
  /** Evidence ID if evidence was captured */
  evidenceId?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Timestamp when invocation started */
  startedAt: string;
  /** Timestamp when invocation completed */
  endedAt: string;
}

/**
 * MCP connection state
 */
export interface McpConnectionState {
  /** Connection configuration */
  config: McpConnectionConfig;
  /** Current connection status */
  status: McpConnectionStatus;
  /** Available tools discovered from server */
  tools: McpToolMetadata[];
  /** Connection establishment timestamp */
  connectedAt?: string;
  /** Last error message */
  lastError?: string;
  /** Retry attempt count */
  retryCount: number;
}

/**
 * McpClient manages connection lifecycle and tool invocation for a single MCP server.
 *
 * IMPORTANT: This is a stub implementation. Actual MCP protocol integration requires:
 * - @modelcontextprotocol/sdk client library
 * - Transport-specific connection handling (stdio, SSE, WebSocket)
 * - Message framing and protocol compliance
 * - Server capability negotiation
 * - Tool schema validation
 *
 * Current implementation provides the interface contract only.
 */
export class McpClient {
  private connectionState: McpConnectionState;

  constructor(
    private readonly config: McpConnectionConfig,
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly events?: RunEventService,
  ) {
    this.connectionState = {
      config,
      status: 'disconnected',
      tools: [],
      retryCount: 0,
    };
  }

  /**
   * Establish connection to MCP server and discover available tools.
   *
   * @returns Connection state after initialization
   *
   * Stub: Actual implementation would:
   * - Create transport (child process for stdio, HTTP client for SSE/WebSocket)
   * - Send initialize handshake
   * - Negotiate protocol version and capabilities
   * - Discover available tools via tools/list
   * - Handle connection lifecycle events
   */
  async connect(): Promise<McpConnectionState> {
    this.connectionState.status = 'connecting';

    try {
      // TODO: Implement actual MCP connection logic
      // - Create transport based on config.transport
      // - Perform MCP handshake (initialize request/response)
      // - Discover tools (tools/list request)
      // - Store tool metadata

      // Stub: simulate connection
      this.connectionState.status = 'connected';
      this.connectionState.connectedAt = nowIso();
      this.connectionState.tools = [];
      this.connectionState.lastError = undefined;

      this.events?.record({
        runId: 'system',
        type: 'run.created', // TODO: Add mcp.connected event type
        title: 'MCP connection established',
        detail: `Connected to ${this.config.name} (${this.config.transport})`,
        level: 'info',
      });

      return this.connectionState;
    } catch (error) {
      this.connectionState.status = 'error';
      this.connectionState.lastError = error instanceof Error ? error.message : String(error);
      this.connectionState.retryCount++;

      this.events?.record({
        runId: 'system',
        type: 'run.created', // TODO: Add mcp.connection_failed event type
        title: 'MCP connection failed',
        detail: redactText(this.connectionState.lastError),
        level: 'error',
      });

      throw error;
    }
  }

  /**
   * Disconnect from MCP server and clean up resources.
   *
   * Stub: Actual implementation would:
   * - Send graceful shutdown notification to server
   * - Close transport (terminate process, close HTTP connection)
   * - Clear tool cache
   * - Release any held resources
   */
  async disconnect(): Promise<void> {
    try {
      // TODO: Implement graceful MCP disconnect
      // - Send shutdown notification if protocol supports it
      // - Close transport
      // - Clear state

      this.connectionState.status = 'closed';
      this.connectionState.tools = [];

      this.events?.record({
        runId: 'system',
        type: 'run.created', // TODO: Add mcp.disconnected event type
        title: 'MCP connection closed',
        detail: `Disconnected from ${this.config.name}`,
        level: 'info',
      });
    } catch (error) {
      this.connectionState.status = 'error';
      this.connectionState.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * List available tools from connected MCP server.
   *
   * @returns Array of tool metadata
   *
   * Stub: Actual implementation would:
   * - Send tools/list request to MCP server
   * - Parse tool schemas and metadata
   * - Map to internal tool representation
   * - Cache results with TTL
   */
  async listTools(): Promise<McpToolMetadata[]> {
    if (this.connectionState.status !== 'connected') {
      throw new Error(`Cannot list tools: connection status is ${this.connectionState.status}`);
    }

    try {
      // TODO: Implement MCP tools/list request
      // - Send tools/list via transport
      // - Parse response
      // - Validate tool schemas
      // - Update connectionState.tools cache

      return this.connectionState.tools;
    } catch (error) {
      this.events?.record({
        runId: 'system',
        type: 'run.created', // TODO: Add mcp.tool_list_failed event type
        title: 'MCP tool listing failed',
        detail: error instanceof Error ? error.message : String(error),
        level: 'error',
      });
      throw error;
    }
  }

  /**
   * Invoke a tool on the connected MCP server.
   *
   * CRITICAL SAFETY: This method MUST NOT bypass platform governance:
   * - Caller is responsible for scope checks (via ScopePolicy)
   * - Caller is responsible for approval checks (via ApprovalService)
   * - Caller is responsible for rate limiting
   * - This method ONLY handles MCP protocol communication
   *
   * @param request Tool invocation request
   * @returns Invocation result with evidence
   *
   * Stub: Actual implementation would:
   * - Validate tool exists and schema matches
   * - Send tools/call request to MCP server
   * - Handle streaming responses if supported
   * - Capture stdout/stderr/result as evidence
   * - Apply timeout and error handling
   * - Return structured result
   */
  async invokeTool(request: McpToolInvokeRequest): Promise<McpToolInvokeResult> {
    if (this.connectionState.status !== 'connected') {
      throw new Error(`Cannot invoke tool: connection status is ${this.connectionState.status}`);
    }

    const invocationId = newId('mcp_invocation');
    const startedAt = nowIso();
    const startTime = Date.now();

    try {
      // TODO: Implement MCP tools/call request
      // - Validate tool exists in discovered tools
      // - Validate args against tool.inputSchema
      // - Send tools/call request via transport
      // - Handle response or streaming content
      // - Apply timeout from request.timeoutMs
      // - Capture result as evidence

      // Stub: simulate tool execution
      const output = {
        stub: true,
        message: 'MCP tool invocation not yet implemented',
        toolName: request.toolName,
        args: request.args,
      };

      const endedAt = nowIso();
      const durationMs = Date.now() - startTime;

      // Store evidence of invocation attempt
      const evidence = this.evidence.addEvidence({
        runId: request.runId,
        kind: 'command_output',
        redactionState: 'redacted',
        content: JSON.stringify(output, null, 2),
      });
      const evidenceId = evidence.id;

      this.events?.record({
        runId: request.runId,
        type: 'tool.allowed', // TODO: Add mcp.tool.invoked event type
        title: 'MCP tool invoked (stub)',
        detail: `${request.toolName} via ${this.config.name}`,
        entityId: invocationId,
        level: 'info',
      });

      return {
        invocationId,
        status: 'success',
        output,
        evidenceId,
        durationMs,
        startedAt,
        endedAt,
      };
    } catch (error) {
      const endedAt = nowIso();
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.events?.record({
        runId: request.runId,
        type: 'tool.blocked', // TODO: Add mcp.tool.failed event type
        title: 'MCP tool invocation failed',
        detail: `${request.toolName}: ${redactText(errorMessage)}`,
        entityId: invocationId,
        level: 'error',
      });

      return {
        invocationId,
        status: 'error',
        error: errorMessage,
        durationMs,
        startedAt,
        endedAt,
      };
    }
  }

  /**
   * Get current connection state.
   *
   * @returns Current connection state snapshot
   */
  getState(): McpConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Check if connection is healthy and ready for tool invocation.
   *
   * @returns true if connected and ready
   */
  isReady(): boolean {
    return this.connectionState.status === 'connected';
  }

  /**
   * Reconnect to MCP server after connection loss.
   *
   * Stub: Actual implementation would:
   * - Implement exponential backoff
   * - Respect maxRetries from config
   * - Preserve tool cache if possible
   * - Emit reconnection events
   */
  async reconnect(): Promise<McpConnectionState> {
    const maxRetries = this.config.maxRetries ?? 3;

    if (this.connectionState.retryCount >= maxRetries) {
      throw new Error(`Max reconnection attempts (${maxRetries}) exceeded`);
    }

    // TODO: Implement exponential backoff
    // - Calculate delay based on retry count
    // - Wait before attempting reconnection
    // - Reset retry count on success

    return this.connect();
  }
}

/**
 * McpExecutionService manages multiple MCP client connections and provides
 * a unified interface for MCP tool execution across the platform.
 *
 * IMPORTANT: This service is a capability registry only. It MUST NOT:
 * - Execute tools directly without governance
 * - Bypass Tool Gateway for scope/approval checks
 * - Cache or reuse approval decisions
 * - Implement its own risk assessment
 *
 * All tool execution MUST flow through Tool Gateway with proper governance.
 */
export class McpExecutionService {
  private clients: Map<string, McpClient> = new Map();

  constructor(
    private readonly store: PlatformStore,
    private readonly evidence: EvidenceEngine,
    private readonly events?: RunEventService,
  ) {}

  /**
   * Register a new MCP server connection.
   *
   * @param config Connection configuration
   * @returns Created MCP client instance
   */
  registerConnection(config: McpConnectionConfig): McpClient {
    if (this.clients.has(config.id)) {
      throw new Error(`MCP connection ${config.id} already registered`);
    }

    const client = new McpClient(config, this.store, this.evidence, this.events);
    this.clients.set(config.id, client);

    return client;
  }

  /**
   * Get an existing MCP client by connection ID.
   *
   * @param connectionId Connection ID
   * @returns MCP client instance or undefined if not found
   */
  getConnection(connectionId: string): McpClient | undefined {
    return this.clients.get(connectionId);
  }

  /**
   * List all registered MCP connections.
   *
   * @returns Array of connection states
   */
  listConnections(): McpConnectionState[] {
    return Array.from(this.clients.values()).map((client) => client.getState());
  }

  /**
   * Remove and disconnect an MCP connection.
   *
   * @param connectionId Connection ID to remove
   */
  async removeConnection(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client) {
      return;
    }

    await client.disconnect();
    this.clients.delete(connectionId);
  }

  /**
   * Disconnect all MCP connections and clean up resources.
   */
  async shutdown(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.values()).map((client) => client.disconnect());
    await Promise.allSettled(disconnectPromises);
    this.clients.clear();
  }

  /**
   * Get aggregated tool catalog from all connected MCP servers.
   *
   * @returns Map of connection ID to available tools
   */
  async getAggregatedToolCatalog(): Promise<Map<string, McpToolMetadata[]>> {
    const catalog = new Map<string, McpToolMetadata[]>();

    for (const [connectionId, client] of this.clients.entries()) {
      if (client.isReady()) {
        try {
          const tools = await client.listTools();
          catalog.set(connectionId, tools);
        } catch (error) {
          // Log error but continue with other connections
          this.events?.record({
            runId: 'system',
            type: 'run.created', // TODO: Add mcp.catalog_error event type
            title: 'Failed to fetch MCP tool catalog',
            detail: `Connection ${connectionId}: ${error instanceof Error ? error.message : String(error)}`,
            level: 'error',
          });
        }
      }
    }

    return catalog;
  }

  /**
   * Health check for all MCP connections.
   *
   * @returns Map of connection ID to readiness status
   */
  getHealthStatus(): Map<string, boolean> {
    const status = new Map<string, boolean>();

    for (const [connectionId, client] of this.clients.entries()) {
      status.set(connectionId, client.isReady());
    }

    return status;
  }
}
