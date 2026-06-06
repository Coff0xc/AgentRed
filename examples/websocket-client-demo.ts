#!/usr/bin/env tsx
/**
 * WebSocket Client Demo - Real-time Evidence & Finding Notifications
 *
 * This example demonstrates how to subscribe to real-time updates for a run,
 * including evidence creation and finding proposals/validations.
 *
 * Usage:
 *   npm install ws
 *   PLATFORM_API_TOKEN=your-token tsx examples/websocket-client-demo.ts <runId>
 *
 * Example:
 *   PLATFORM_API_TOKEN=local-dev-token tsx examples/websocket-client-demo.ts run_abc123
 */

import WebSocket from 'ws';

interface ProgressUpdate {
  type: string;
  runId: string;
  timestamp: string;
  data: {
    id?: string;
    title?: string;
    detail?: string;
    level?: string;
    entityId?: string;
    [key: string]: any;
  };
}

// Configuration from environment
const API_HOST = process.env.PLATFORM_API_HOST || '127.0.0.1';
const API_PORT = process.env.PLATFORM_API_PORT || '4317';
const API_TOKEN = process.env.PLATFORM_API_TOKEN;

// Parse command line arguments
const runId = process.argv[2];

if (!runId) {
  console.error('Usage: tsx websocket-client-demo.ts <runId>');
  console.error('Example: tsx websocket-client-demo.ts run_abc123');
  process.exit(1);
}

if (!API_TOKEN) {
  console.error('Error: PLATFORM_API_TOKEN environment variable is required');
  process.exit(1);
}

// Statistics tracking
const stats = {
  connected: false,
  startTime: Date.now(),
  messagesReceived: 0,
  evidenceCount: 0,
  findingProposed: 0,
  findingConfirmed: 0,
  findingRejected: 0,
  eventsByType: new Map<string, number>(),
};

// Update statistics
function updateStats(message: ProgressUpdate): void {
  stats.messagesReceived++;

  const count = stats.eventsByType.get(message.type) || 0;
  stats.eventsByType.set(message.type, count + 1);

  switch (message.type) {
    case 'evidence.added':
      stats.evidenceCount++;
      break;
    case 'finding.proposed':
      stats.findingProposed++;
      break;
    case 'finding.validated':
      if (message.data.detail?.includes('confirmed')) {
        stats.findingConfirmed++;
      } else if (message.data.detail?.includes('rejected')) {
        stats.findingRejected++;
      }
      break;
  }
}

// Print statistics summary
function printStats(): void {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  console.log('\n--- Statistics ---');
  console.log(`Uptime: ${uptime}s`);
  console.log(`Messages received: ${stats.messagesReceived}`);
  console.log(`Evidence added: ${stats.evidenceCount}`);
  console.log(`Findings proposed: ${stats.findingProposed}`);
  console.log(`Findings confirmed: ${stats.findingConfirmed}`);
  console.log(`Findings rejected: ${stats.findingRejected}`);

  if (stats.eventsByType.size > 0) {
    console.log('\nEvents by type:');
    const sorted = Array.from(stats.eventsByType.entries()).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  }
  console.log('------------------\n');
}

// Format message for display
function formatMessage(message: ProgressUpdate): string {
  const time = new Date(message.timestamp).toLocaleTimeString();
  const type = message.type.padEnd(30);

  if (message.type === 'connection.established') {
    return `[${time}] ${type} | Heartbeat: ${message.data.heartbeatIntervalMs}ms, Timeout: ${message.data.idleTimeoutMs}ms`;
  }

  if (message.type === 'evidence.added') {
    return `[${time}] ${type} | ${message.data.detail} | ID: ${message.data.entityId}`;
  }

  if (message.type === 'finding.proposed') {
    return `[${time}] ${type} | ${message.data.detail} | ID: ${message.data.entityId}`;
  }

  if (message.type === 'finding.validated') {
    return `[${time}] ${type} | ${message.data.detail} | ID: ${message.data.entityId}`;
  }

  return `[${time}] ${type} | ${message.data.title || message.data.detail || '(no detail)'}`;
}

// Color coding for different event types
function getColorCode(type: string): string {
  if (type === 'evidence.added') return '\x1b[36m'; // Cyan
  if (type === 'finding.proposed') return '\x1b[33m'; // Yellow
  if (type === 'finding.validated') return '\x1b[32m'; // Green
  if (type.includes('error') || type.includes('failed')) return '\x1b[31m'; // Red
  return '\x1b[37m'; // White
}

// Main WebSocket connection
function connect(): WebSocket {
  const wsUrl = `ws://${API_HOST}:${API_PORT}/ws/progress?runId=${runId}&token=${API_TOKEN}`;

  console.log(`\n🔌 Connecting to WebSocket...`);
  console.log(`   Run ID: ${runId}`);
  console.log(`   Endpoint: ws://${API_HOST}:${API_PORT}/ws/progress`);
  console.log(`   Token: ${API_TOKEN.slice(0, 8)}...`);
  console.log('');

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    stats.connected = true;
    console.log('✅ WebSocket connected\n');
    console.log('📡 Listening for real-time events...\n');
  });

  ws.on('message', (data: Buffer) => {
    try {
      const message: ProgressUpdate = JSON.parse(data.toString());
      updateStats(message);

      const colorCode = getColorCode(message.type);
      const resetCode = '\x1b[0m';
      const formatted = formatMessage(message);

      console.log(`${colorCode}${formatted}${resetCode}`);

      // Print stats periodically (every 10 messages)
      if (stats.messagesReceived % 10 === 0 && stats.messagesReceived > 0) {
        printStats();
      }
    } catch (error) {
      console.error('❌ Failed to parse message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error(`\n❌ WebSocket error: ${error.message}`);
  });

  ws.on('close', (code, reason) => {
    stats.connected = false;
    console.log(`\n🔌 WebSocket closed: ${code} ${reason.toString()}`);

    if (code === 1008) {
      console.error('Authentication or parameter error - not retrying');
      printStats();
      process.exit(1);
    }

    // Auto-reconnect with exponential backoff
    const delay = Math.min(5000, 1000 * Math.pow(2, Math.min(5, stats.messagesReceived % 6)));
    console.log(`⏳ Reconnecting in ${delay}ms...`);
    setTimeout(() => {
      connect();
    }, delay);
  });

  // Handle ping/pong for keepalive
  ws.on('ping', () => {
    ws.pong();
  });

  return ws;
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  printStats();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down...');
  printStats();
  process.exit(0);
});

// Start connection
console.log('='.repeat(80));
console.log('WebSocket Client Demo - Real-time Evidence & Finding Notifications');
console.log('='.repeat(80));

const ws = connect();

// Print stats every 30 seconds if connected
setInterval(() => {
  if (stats.connected && stats.messagesReceived > 0) {
    printStats();
  }
}, 30000);
