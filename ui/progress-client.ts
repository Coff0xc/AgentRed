/**
 * AgentRed WebSocket Client for Real-time Progress Updates
 *
 * Automatically connects to /ws/progress and falls back to polling on connection failure.
 *
 * Usage:
 * ```javascript
 * const client = new AgentRedProgressClient({
 *   runId: 'run_abc123',
 *   token: 'your-api-token',
 *   onEvent: (event) => console.log('Event:', event),
 *   onStateChange: (state) => console.log('State:', state),
 * });
 *
 * client.connect();
 * // ... later
 * client.disconnect();
 * ```
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'polling' | 'error';

export interface ProgressEvent {
  type: string;
  runId: string;
  timestamp: string;
  data: any;
}

export interface AgentRedProgressClientConfig {
  runId: string;
  token: string;
  baseUrl?: string;
  onEvent: (event: ProgressEvent) => void;
  onStateChange?: (state: ConnectionState) => void;
  pollingIntervalMs?: number;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
}

export class AgentRedProgressClient {
  private readonly runId: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly onEvent: (event: ProgressEvent) => void;
  private readonly onStateChange?: (state: ConnectionState) => void;
  private readonly pollingIntervalMs: number;
  private readonly reconnectIntervalMs: number;
  private readonly maxReconnectAttempts: number;

  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimeout: number | null = null;
  private pollingInterval: number | null = null;
  private lastEventTimestamp: string | null = null;

  constructor(config: AgentRedProgressClientConfig) {
    this.runId = config.runId;
    this.token = config.token;
    this.baseUrl = config.baseUrl || window.location.origin;
    this.onEvent = config.onEvent;
    this.onStateChange = config.onStateChange;
    this.pollingIntervalMs = config.pollingIntervalMs || 5000;
    this.reconnectIntervalMs = config.reconnectIntervalMs || 3000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
  }

  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') {
      console.warn('[AgentRedProgressClient] Already connected or connecting');
      return;
    }

    this.setState('connecting');
    this.connectWebSocket();
  }

  disconnect(): void {
    this.stopReconnecting();
    this.stopPolling();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }

    this.setState('disconnected');
  }

  private connectWebSocket(): void {
    try {
      const wsUrl = this.buildWebSocketUrl();
      console.log('[AgentRedProgressClient] Connecting to WebSocket:', wsUrl);

      this.ws = new WebSocket(wsUrl, this.buildWebSocketProtocols());

      this.ws.onopen = () => {
        console.log('[AgentRedProgressClient] WebSocket connected');
        this.setState('connected');
        this.reconnectAttempts = 0;
        this.stopPolling();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ProgressEvent;

          // Track last event timestamp
          this.lastEventTimestamp = message.timestamp;

          // Skip connection.established messages (internal)
          if (message.type === 'connection.established') {
            console.log('[AgentRedProgressClient] Connection established, heartbeat interval:', message.data.heartbeatIntervalMs);
            return;
          }

          // Dispatch to handler
          this.onEvent(message);
        } catch (error) {
          console.error('[AgentRedProgressClient] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[AgentRedProgressClient] WebSocket error:', error);
        this.setState('error');
      };

      this.ws.onclose = (event) => {
        console.log('[AgentRedProgressClient] WebSocket closed:', event.code, event.reason);
        this.ws = null;

        if (this.state !== 'disconnected') {
          // Connection lost, attempt reconnect or fall back to polling
          this.handleConnectionLoss();
        }
      };
    } catch (error) {
      console.error('[AgentRedProgressClient] Failed to create WebSocket:', error);
      this.handleConnectionLoss();
    }
  }

  private handleConnectionLoss(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Attempt WebSocket reconnection
      this.reconnectAttempts++;
      console.log(`[AgentRedProgressClient] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

      this.setState('connecting');
      this.reconnectTimeout = window.setTimeout(() => {
        this.connectWebSocket();
      }, this.reconnectIntervalMs);
    } else {
      // Fall back to polling
      console.log('[AgentRedProgressClient] Max reconnect attempts reached, falling back to polling');
      this.startPolling();
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.setState('polling');

    console.log(`[AgentRedProgressClient] Starting polling (interval: ${this.pollingIntervalMs}ms)`);

    // Initial poll
    this.pollEvents();

    // Set up interval
    this.pollingInterval = window.setInterval(() => {
      this.pollEvents();
    }, this.pollingIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private stopReconnecting(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;
  }

  private async pollEvents(): Promise<void> {
    try {
      const url = `${this.baseUrl}/runs/${this.runId}/events`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        console.error('[AgentRedProgressClient] Polling failed:', response.status);
        return;
      }

      const data = await response.json();
      const events = Array.isArray(data) ? data : data.events || [];

      // Filter events newer than last received
      const newEvents = this.lastEventTimestamp
        ? events.filter((e: any) => e.createdAt > this.lastEventTimestamp)
        : events;

      // Dispatch new events
      for (const event of newEvents) {
        this.onEvent({
          type: event.type,
          runId: this.runId,
          timestamp: event.createdAt,
          data: {
            id: event.id,
            title: event.title,
            detail: event.detail,
            level: event.level,
            entityId: event.entityId,
          },
        });
      }

      // Update last timestamp
      if (newEvents.length > 0) {
        this.lastEventTimestamp = newEvents[newEvents.length - 1].createdAt;
      }
    } catch (error) {
      console.error('[AgentRedProgressClient] Polling error:', error);
    }
  }

  private buildWebSocketUrl(): string {
    const base = this.baseUrl.replace(/^http/, 'ws');
    const params = new URLSearchParams({
      runId: this.runId,
    });
    return `${base}/ws/progress?${params}`;
  }

  private buildWebSocketProtocols(): string[] {
    return ['agentred-progress', `agentred-token.${base64UrlEncode(this.token)}`];
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      if (this.onStateChange) {
        this.onStateChange(newState);
      }
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected' || this.state === 'polling';
  }
}

function base64UrlEncode(value: string): string {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Simple console logger for progress events (for testing/debugging)
 */
export function createConsoleLogger(runId: string, token: string): AgentRedProgressClient {
  return new AgentRedProgressClient({
    runId,
    token,
    onEvent: (event) => {
      const style = event.data.level === 'error' ? 'color: red' : 'color: blue';
      console.log(`%c[${event.type}]`, style, event.data.title, event.data);
    },
    onStateChange: (state) => {
      console.log(`%c[State: ${state}]`, 'color: orange; font-weight: bold');
    },
  });
}

/**
 * DOM integration helper - updates a status indicator
 */
export function createStatusIndicator(elementId: string): (state: ConnectionState) => void {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`[AgentRedProgressClient] Element not found: ${elementId}`);
    return () => {};
  }

  const stateColors: Record<ConnectionState, string> = {
    disconnected: '#999',
    connecting: '#ff9800',
    connected: '#4caf50',
    polling: '#2196f3',
    error: '#f44336',
  };

  return (state: ConnectionState) => {
    element.textContent = state;
    element.style.color = stateColors[state];
  };
}
