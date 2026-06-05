import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { newId, nowIso } from '../domain/ids.js';
import type { EvidenceKind, RiskLevel } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { EvidenceEngine } from '../evidence/evidence-engine.js';
import { redactText } from '../security/redaction.js';
import type { PlatformStore } from '../storage/store.js';
import { mcpRiskMapper } from './mcp-risk-mapper.js';

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
 * Integrates with @modelcontextprotocol/sdk to provide:
 * - Transport-specific connection handling (stdio, SSE, WebSocket)
 * - JSON-RPC message framing and protocol compliance
 * - Server capability negotiation
 * - Tool schema validation
 * - Connection lifecycle management
 */
export class McpClient {
  private connectionState: McpConnectionState;
  private client?: Client;
  private transport?: StdioClientTransport;

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
   * Implementation:
   * - Creates transport based on config.transport
   * - Performs MCP handshake (initialize request/response)
   * - Discovers tools via tools/list request
   * - Stores tool metadata in connection state
   */
  async connect(): Promise<McpConnectionState> {
    this.connectionState.status = 'connecting';

    try {
      // Create transport based on config
      if (this.config.transport === 'stdio') {
        if (!this.config.command) {
          throw new Error('stdio transport requires command to be specified');
        }

        this.transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args ?? [],
          env: this.config.env,
        });

        // Note: Do not call transport.start() here - Client.connect() will do it automatically
      } else {
        // SSE and WebSocket transports not yet implemented
        throw new Error(`Transport type ${this.config.transport} not yet implemented`);
      }

      // Create MCP client with transport
      this.client = new Client(
        {
          name: 'agent-red-platform',
          version: '0.1.0',
        },
        {
          capabilities: {
            roots: {
              listChanged: false,
            },
            sampling: {},
          },
        },
      );

      // Set up error and close handlers
      if (this.transport) {
        const originalOnError = this.transport.onerror;
        this.transport.onerror = (error: Error) => {
          this.connectionState.status = 'error';
          this.connectionState.lastError = error.message;
          this.events?.record({
            runId: 'system',
            type: 'run.created',
            title: 'MCP transport error',
            detail: redactText(error.message),
            level: 'error',
          });
          originalOnError?.call(this.transport, error);
        };

        const originalOnClose = this.transport.onclose;
        this.transport.onclose = () => {
          if (this.connectionState.status === 'connected') {
            this.connectionState.status = 'closed';
            this.events?.record({
              runId: 'system',
              type: 'run.created',
              title: 'MCP connection closed',
              detail: `Connection to ${this.config.name} closed unexpectedly`,
              level: 'warning',
            });
          }
          originalOnClose?.call(this.transport);
        };
      }

      // Connect client to transport with timeout
      const timeout = this.config.timeoutMs ?? 30000;
      await Promise.race([
        this.client.connect(this.transport!),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Connection timeout after ${timeout}ms`)), timeout),
        ),
      ]);

      // Discover available tools
      const toolsResult = (await this.client.listTools()) as ListToolsResult;
      this.connectionState.tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
        estimatedRiskLevel: mcpRiskMapper.inferRiskLevel(tool.name, tool.description),
        requiresApproval: mcpRiskMapper.requiresApproval(tool.name, tool.description),
      }));

      this.connectionState.status = 'connected';
      this.connectionState.connectedAt = nowIso();
      this.connectionState.lastError = undefined;

      this.events?.record({
        runId: 'system',
        type: 'run.created',
        title: 'MCP connection established',
        detail: `Connected to ${this.config.name} (${this.config.transport}), discovered ${this.connectionState.tools.length} tools`,
        level: 'info',
      });

      return this.connectionState;
    } catch (error) {
      this.connectionState.status = 'error';
      this.connectionState.lastError = error instanceof Error ? error.message : String(error);
      this.connectionState.retryCount++;

      // Clean up on failure
      await this.cleanup();

      this.events?.record({
        runId: 'system',
        type: 'run.created',
        title: 'MCP connection failed',
        detail: redactText(this.connectionState.lastError),
        level: 'error',
      });

      throw error;
    }
  }

  /**
   * Clean up transport and client resources.
   * @internal
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = undefined;
      }
      if (this.client) {
        await this.client.close();
        this.client = undefined;
      }
    } catch (error) {
      // Best effort cleanup, log but don't throw
      this.events?.record({
        runId: 'system',
        type: 'run.created',
        title: 'MCP cleanup error',
        detail: error instanceof Error ? error.message : String(error),
        level: 'warning',
      });
    }
  }

  /**
   * Disconnect from MCP server and clean up resources.
   *
   * Implementation:
   * - Sends graceful shutdown to client
   * - Closes transport (terminates process for stdio)
   * - Clears tool cache and state
   */
  async disconnect(): Promise<void> {
    try {
      await this.cleanup();

      this.connectionState.status = 'closed';
      this.connectionState.tools = [];

      this.events?.record({
        runId: 'system',
        type: 'run.created',
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
   * Implementation:
   * - Returns cached tools from connection state
   * - Tools are discovered during connect() and cached
   * - Call reconnect() or connect() to refresh tool list
   */
  async listTools(): Promise<McpToolMetadata[]> {
    if (this.connectionState.status !== 'connected') {
      throw new Error(`Cannot list tools: connection status is ${this.connectionState.status}`);
    }

    // Return cached tools - they were fetched during connect()
    return this.connectionState.tools;
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
   * Implementation:
   * - Validates tool exists in discovered tools
   * - Sends tools/call request via MCP client
   * - Captures result/error as evidence
   * - Applies timeout from request
   * - Returns structured result with evidence ID
   */
  async invokeTool(request: McpToolInvokeRequest): Promise<McpToolInvokeResult> {
    if (this.connectionState.status !== 'connected') {
      throw new Error(`Cannot invoke tool: connection status is ${this.connectionState.status}`);
    }

    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    const invocationId = newId('mcp_invocation');
    const startedAt = nowIso();
    const startTime = Date.now();

    try {
      // Validate tool exists
      const toolExists = this.connectionState.tools.some((t) => t.name === request.toolName);
      if (!toolExists) {
        throw new Error(`Tool ${request.toolName} not found in server tool list`);
      }

      // Apply timeout
      const timeout = request.timeoutMs ?? 60000;
      const callPromise = this.client.callTool({
        name: request.toolName,
        arguments: request.args,
      });

      const result = (await Promise.race([
        callPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool invocation timeout after ${timeout}ms`)), timeout),
        ),
      ])) as CallToolResult;

      const endedAt = nowIso();
      const durationMs = Date.now() - startTime;

      // Store evidence of successful invocation
      const evidenceContent = {
        tool: request.toolName,
        args: request.args,
        result: result.content,
        isError: result.isError ?? false,
      };

      const evidence = this.evidence.addEvidence({
        runId: request.runId,
        kind: 'command_output',
        redactionState: 'raw_local_only',
        content: JSON.stringify(evidenceContent, null, 2),
      });
      const evidenceId = evidence.id;

      this.events?.record({
        runId: request.runId,
        type: 'tool.allowed',
        title: 'MCP tool invoked',
        detail: `${request.toolName} via ${this.config.name}`,
        entityId: invocationId,
        level: 'info',
      });

      return {
        invocationId,
        status: result.isError ? 'error' : 'success',
        output: result.content,
        error: result.isError ? JSON.stringify(result.content) : undefined,
        evidenceId,
        durationMs,
        startedAt,
        endedAt,
      };
    } catch (error) {
      const endedAt = nowIso();
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Store evidence of failed invocation
      const evidenceContent = {
        tool: request.toolName,
        args: request.args,
        error: errorMessage,
      };

      const evidence = this.evidence.addEvidence({
        runId: request.runId,
        kind: 'command_output',
        redactionState: 'redacted',
        content: JSON.stringify(evidenceContent, null, 2),
      });
      const evidenceId = evidence.id;

      this.events?.record({
        runId: request.runId,
        type: 'tool.blocked',
        title: 'MCP tool invocation failed',
        detail: `${request.toolName}: ${redactText(errorMessage)}`,
        entityId: invocationId,
        level: 'error',
      });

      return {
        invocationId,
        status: errorMessage.includes('timeout') ? 'timeout' : 'error',
        error: errorMessage,
        evidenceId,
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

  getToolMetadata(connectionId: string, toolName: string): McpToolMetadata | undefined {
    return this.clients.get(connectionId)?.getState().tools.find((tool) => tool.name === toolName);
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
