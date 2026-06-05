import assert from 'node:assert/strict';
import test from 'node:test';
import { McpClient, type McpConnectionConfig } from '../src/connectors/mcp-execution-service.js';
import { createPlatform } from '../src/platform.js';

test('McpClient validates stdio transport requires command', async () => {
  const platform = createPlatform();

  const config: McpConnectionConfig = {
    id: 'test-mcp',
    name: 'Test MCP Server',
    transport: 'stdio',
    // Missing command - should fail
  };

  const client = new McpClient(config, platform.store, platform.evidence);

  await assert.rejects(
    async () => await client.connect(),
    /stdio transport requires command to be specified/,
    'Should reject connection without command',
  );
});

test('McpClient initializes with correct state', () => {
  const platform = createPlatform();

  const config: McpConnectionConfig = {
    id: 'test-mcp',
    name: 'Test MCP Server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
  };

  const client = new McpClient(config, platform.store, platform.evidence);
  const state = client.getState();

  assert.strictEqual(state.status, 'disconnected');
  assert.strictEqual(state.tools.length, 0);
  assert.strictEqual(state.retryCount, 0);
  assert.strictEqual(state.config.id, 'test-mcp');
});

test('McpClient rejects tool invocation when not connected', async () => {
  const platform = createPlatform();

  const config: McpConnectionConfig = {
    id: 'test-mcp',
    name: 'Test MCP Server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
  };

  const client = new McpClient(config, platform.store, platform.evidence);

  await assert.rejects(
    async () =>
      await client.invokeTool({
        runId: 'test-run',
        connectionId: 'test-mcp',
        toolName: 'test-tool',
        args: {},
        riskLevel: 'R1',
      }),
    /Cannot invoke tool: connection status is disconnected/,
    'Should reject tool invocation when disconnected',
  );
});

test('McpClient rejects unsupported transport types', async () => {
  const platform = createPlatform();

  const config: McpConnectionConfig = {
    id: 'test-mcp',
    name: 'Test MCP Server',
    transport: 'websocket',
    url: 'ws://localhost:3000',
  };

  const client = new McpClient(config, platform.store, platform.evidence);

  await assert.rejects(
    async () => await client.connect(),
    /Transport type websocket not yet implemented/,
    'Should reject unsupported transport types',
  );
});

test('McpClient handles connection timeout', async () => {
  const platform = createPlatform();

  const config: McpConnectionConfig = {
    id: 'test-mcp',
    name: 'Test MCP Server',
    transport: 'stdio',
    command: 'sleep', // Command that won't respond with MCP protocol
    args: ['10'],
    timeoutMs: 100, // Very short timeout
  };

  const client = new McpClient(config, platform.store, platform.evidence);

  await assert.rejects(
    async () => await client.connect(),
    /timeout/i,
    'Should timeout when server does not respond',
  );

  const state = client.getState();
  assert.strictEqual(state.status, 'error');
  assert.strictEqual(state.retryCount, 1);
});
