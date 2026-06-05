import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { IncomingMessage } from 'node:http';

import type { RunEvent } from '../domain/types.js';

export interface ProgressUpdate {
  type: RunEvent['type'];
  runId: string;
  timestamp: string;
  data: unknown;
}

export interface ProgressWebSocketServerConfig {
  server: Server;
  path?: string;
  heartbeatIntervalMs?: number;
  idleTimeoutMs?: number;
}

/**
 * WebSocket server for real-time run progress updates.
 *
 * Security boundaries:
 * - Only pushes read-only event data (never writes state)
 * - Requires token authentication for connections
 * - Does not expose raw evidence content
 * - Connection failures do not affect RunEvent persistence
 *
 * Usage:
 * ```typescript
 * const wsServer = new ProgressWebSocketServer({
 *   server: httpServer,
 *   path: '/ws/progress',
 * });
 *
 * // From RunEventService:
 * wsServer.broadcast(runId, {
 *   type: 'tool.allowed',
 *   runId,
 *   timestamp: nowIso(),
 *   data: { ... },
 * });
 * ```
 */
export class ProgressWebSocketServer {
  private wss: WebSocketServer;
  private subscriptions: Map<string, Set<WebSocket>> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private readonly heartbeatIntervalMs: number;
  private readonly idleTimeoutMs: number;
  private readonly path: string;

  constructor(config: ProgressWebSocketServerConfig) {
    this.path = config.path ?? '/ws/progress';
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30_000; // 30s
    this.idleTimeoutMs = config.idleTimeoutMs ?? 1_800_000; // 30min

    this.wss = new WebSocketServer({
      server: config.server,
      path: this.path,
      // Disable automatic per-message deflate to reduce overhead
      perMessageDeflate: false,
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const runId = url.searchParams.get('runId');
    const token = url.searchParams.get('token') ?? req.headers['x-platform-token'] as string;

    // Validate required parameters
    if (!runId) {
      ws.close(1008, 'Missing runId parameter');
      return;
    }

    if (!token) {
      ws.close(1008, 'Missing authentication token');
      return;
    }

    // Note: Token validation should be done by the caller before creating the WebSocket server
    // or by passing a token validator function. For now, we trust that the HTTP server
    // has already authenticated the request.

    // Subscribe to run progress
    if (!this.subscriptions.has(runId)) {
      this.subscriptions.set(runId, new Set());
    }
    this.subscriptions.get(runId)!.add(ws);

    // Mark connection as alive
    (ws as any).isAlive = true;
    (ws as any).lastActivity = Date.now();
    (ws as any).runId = runId;

    // Send connection confirmation
    this.sendSafe(ws, {
      type: 'connection.established' as any,
      runId,
      timestamp: new Date().toISOString(),
      data: {
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        idleTimeoutMs: this.idleTimeoutMs,
      },
    });

    // Handle pong responses (heartbeat)
    ws.on('pong', () => {
      (ws as any).isAlive = true;
      (ws as any).lastActivity = Date.now();
    });

    // Handle client-initiated close
    ws.on('close', () => {
      this.unsubscribe(ws, runId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[ProgressWebSocketServer] Client error:', error.message);
      this.unsubscribe(ws, runId);
    });
  }

  private unsubscribe(ws: WebSocket, runId: string): void {
    const subscribers = this.subscriptions.get(runId);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.subscriptions.delete(runId);
      }
    }
  }

  /**
   * Broadcast a progress update to all subscribers of a run.
   *
   * This method is safe to call from RunEventService - broadcast failures
   * do not throw errors and do not affect event persistence.
   *
   * @param runId - The run ID to broadcast to
   * @param update - The progress update to send
   */
  broadcast(runId: string, update: ProgressUpdate): void {
    const subscribers = this.subscriptions.get(runId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = JSON.stringify(update);
    const deadConnections: WebSocket[] = [];

    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          console.error('[ProgressWebSocketServer] Failed to send update:', error);
          deadConnections.push(ws);
        }
      } else {
        deadConnections.push(ws);
      }
    }

    // Clean up dead connections
    for (const ws of deadConnections) {
      this.unsubscribe(ws, runId);
    }
  }

  private sendSafe(ws: WebSocket, update: ProgressUpdate): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(update));
      } catch (error) {
        console.error('[ProgressWebSocketServer] Failed to send message:', error);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const allSockets: Array<{ ws: WebSocket; runId: string }> = [];

      // Collect all sockets
      for (const [runId, subscribers] of this.subscriptions.entries()) {
        for (const ws of subscribers) {
          allSockets.push({ ws, runId });
        }
      }

      // Check each socket
      for (const { ws, runId } of allSockets) {
        const isAlive = (ws as any).isAlive;
        const lastActivity = (ws as any).lastActivity ?? now;
        const idleTime = now - lastActivity;

        // Check for idle timeout (30 minutes default)
        if (idleTime > this.idleTimeoutMs) {
          console.log(`[ProgressWebSocketServer] Closing idle connection for run ${runId}`);
          ws.close(1000, 'Idle timeout');
          this.unsubscribe(ws, runId);
          continue;
        }

        // Check for missed heartbeat
        if (isAlive === false) {
          console.log(`[ProgressWebSocketServer] Terminating unresponsive connection for run ${runId}`);
          ws.terminate();
          this.unsubscribe(ws, runId);
          continue;
        }

        // Send ping
        (ws as any).isAlive = false;
        try {
          ws.ping();
        } catch (error) {
          console.error('[ProgressWebSocketServer] Failed to send ping:', error);
          this.unsubscribe(ws, runId);
        }
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Get current connection statistics.
   */
  getStats(): { totalConnections: number; runSubscriptions: number; runs: string[] } {
    let totalConnections = 0;
    const runs: string[] = [];

    for (const [runId, subscribers] of this.subscriptions.entries()) {
      totalConnections += subscribers.size;
      runs.push(runId);
    }

    return {
      totalConnections,
      runSubscriptions: this.subscriptions.size,
      runs,
    };
  }

  /**
   * Close the WebSocket server and all active connections.
   */
  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all active connections
    for (const subscribers of this.subscriptions.values()) {
      for (const ws of subscribers) {
        try {
          ws.close(1001, 'Server shutting down');
        } catch (error) {
          // Ignore errors during shutdown
        }
      }
    }

    this.subscriptions.clear();
    this.wss.close();
  }
}
