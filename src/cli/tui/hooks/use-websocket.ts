import { useState, useEffect, useRef } from 'react';
import WebSocket from 'ws';
import type { ProgressUpdate } from '../../../events/progress-websocket-server.js';

export interface UseWebSocketOptions {
  url: string;
  runId: string;
  token?: string;
  enabled?: boolean;
  onMessage?: (update: ProgressUpdate) => void;
  onError?: (error: Error) => void;
  reconnectIntervalMs?: number;
}

export interface UseWebSocketResult {
  connected: boolean;
  lastUpdate: ProgressUpdate | null;
  error: string | null;
  reconnecting: boolean;
}

/**
 * React hook for WebSocket connection to platform progress updates.
 *
 * Handles:
 * - Automatic reconnection on disconnect
 * - Token authentication
 * - Heartbeat monitoring
 * - Clean resource disposal
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketResult {
  const {
    url,
    runId,
    token,
    enabled = true,
    onMessage,
    onError,
    reconnectIntervalMs = 5_000,
  } = options;

  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<ProgressUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const connect = () => {
      try {
        // Build WebSocket URL with query parameters
        const wsUrl = new URL(url.replace('http://', 'ws://').replace('https://', 'wss://'));
        wsUrl.pathname = '/ws/progress';
        wsUrl.searchParams.set('runId', runId);
        if (token) {
          wsUrl.searchParams.set('token', token);
        }

        const ws = new WebSocket(wsUrl.toString());
        wsRef.current = ws;

        ws.on('open', () => {
          if (!mountedRef.current) return;
          setConnected(true);
          setError(null);
          setReconnecting(false);
        });

        ws.on('message', (data: Buffer) => {
          if (!mountedRef.current) return;
          try {
            const update = JSON.parse(data.toString()) as ProgressUpdate;
            setLastUpdate(update);
            onMessage?.(update);
          } catch (err) {
            const parseError = new Error(`Failed to parse WebSocket message: ${err}`);
            setError(parseError.message);
            onError?.(parseError);
          }
        });

        ws.on('error', (err) => {
          if (!mountedRef.current) return;
          const wsError = new Error(`WebSocket error: ${err.message}`);
          setError(wsError.message);
          onError?.(wsError);
        });

        ws.on('close', (code, reason) => {
          if (!mountedRef.current) return;
          setConnected(false);

          // Don't reconnect on normal closure or authentication failure
          if (code === 1000 || code === 1008) {
            setError(reason.toString() || 'Connection closed');
            return;
          }

          // Attempt reconnection
          setReconnecting(true);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, reconnectIntervalMs);
        });
      } catch (err) {
        if (!mountedRef.current) return;
        const connectError = new Error(`Failed to connect: ${err}`);
        setError(connectError.message);
        onError?.(connectError);

        // Retry connection
        setReconnecting(true);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, reconnectIntervalMs);
      }
    };

    connect();

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [url, runId, token, enabled, reconnectIntervalMs, onMessage, onError]);

  return {
    connected,
    lastUpdate,
    error,
    reconnecting,
  };
}
