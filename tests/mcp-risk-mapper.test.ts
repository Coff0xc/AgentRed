import { test } from 'node:test';
import assert from 'node:assert/strict';

import { McpRiskMapper } from '../src/connectors/mcp-risk-mapper.js';

test('McpRiskMapper infers R0 for metadata queries', () => {
  const mapper = new McpRiskMapper();

  assert.strictEqual(mapper.inferRiskLevel('version'), 'R0');
  assert.strictEqual(mapper.inferRiskLevel('status'), 'R0');
  assert.strictEqual(mapper.inferRiskLevel('health'), 'R0');
  assert.strictEqual(mapper.inferRiskLevel('capabilities'), 'R0');
  assert.strictEqual(mapper.inferRiskLevel('ping'), 'R0');
});

test('McpRiskMapper infers R1 for read-only operations', () => {
  const mapper = new McpRiskMapper();

  assert.strictEqual(mapper.inferRiskLevel('scan'), 'R1');
  assert.strictEqual(mapper.inferRiskLevel('probe'), 'R1');
  assert.strictEqual(mapper.inferRiskLevel('discover'), 'R1');
  assert.strictEqual(mapper.inferRiskLevel('list'), 'R1');
  assert.strictEqual(mapper.inferRiskLevel('get'), 'R1');
  assert.strictEqual(mapper.inferRiskLevel('port_scanner'), 'R1');
  assert.strictEqual(mapper.inferRiskLevel('http_probe', 'Probes HTTP endpoints'), 'R1');
});

test('McpRiskMapper infers R2 for active scanning', () => {
  const mapper = new McpRiskMapper();

  assert.strictEqual(mapper.inferRiskLevel('fuzz'), 'R2');
  assert.strictEqual(mapper.inferRiskLevel('brute'), 'R2');
  assert.strictEqual(mapper.inferRiskLevel('fuzzer', 'Fuzzes parameters'), 'R2');
  assert.strictEqual(mapper.inferRiskLevel('password_bruteforce'), 'R2');
});

test('McpRiskMapper infers R3 for exploit/state change operations', () => {
  const mapper = new McpRiskMapper();

  assert.strictEqual(mapper.inferRiskLevel('exploit'), 'R3');
  assert.strictEqual(mapper.inferRiskLevel('inject'), 'R3');
  assert.strictEqual(mapper.inferRiskLevel('execute'), 'R3');
  assert.strictEqual(mapper.inferRiskLevel('sql_injection'), 'R3');
  assert.strictEqual(mapper.inferRiskLevel('xss_test', 'Tests for XSS vulnerabilities'), 'R3');
  assert.strictEqual(mapper.inferRiskLevel('modify'), 'R3');
  assert.strictEqual(mapper.inferRiskLevel('create'), 'R3');
});

test('McpRiskMapper infers R4 for destructive operations', () => {
  const mapper = new McpRiskMapper();

  assert.strictEqual(mapper.inferRiskLevel('delete'), 'R4');
  assert.strictEqual(mapper.inferRiskLevel('drop'), 'R4');
  assert.strictEqual(mapper.inferRiskLevel('destroy'), 'R4');
  assert.strictEqual(mapper.inferRiskLevel('credential_dump'), 'R4');
  assert.strictEqual(mapper.inferRiskLevel('steal_token', 'Steals authentication tokens'), 'R4');
  assert.strictEqual(mapper.inferRiskLevel('backdoor'), 'R4');
});

test('McpRiskMapper defaults to R3 for unknown tools (fail-safe)', () => {
  const mapper = new McpRiskMapper();

  assert.strictEqual(mapper.inferRiskLevel('unknown_tool'), 'R3');
  assert.strictEqual(mapper.inferRiskLevel('custom_action'), 'R3');
  assert.strictEqual(mapper.inferRiskLevel('mysterious_operation'), 'R3');
});

test('McpRiskMapper requiresApproval returns true for R3 and R4', () => {
  const mapper = new McpRiskMapper();

  assert.strictEqual(mapper.requiresApproval('scan'), false); // R1
  assert.strictEqual(mapper.requiresApproval('exploit'), true); // R3
  assert.strictEqual(mapper.requiresApproval('delete'), true); // R4
  assert.strictEqual(mapper.requiresApproval('unknown'), true); // R3 (default)
});

test('McpRiskMapper batch inference works correctly', () => {
  const mapper = new McpRiskMapper();

  const tools = [
    { name: 'version' },
    { name: 'scan' },
    { name: 'exploit' },
    { name: 'delete' },
  ];

  const riskMap = mapper.inferRiskLevels(tools);

  assert.strictEqual(riskMap.get('version'), 'R0');
  assert.strictEqual(riskMap.get('scan'), 'R1');
  assert.strictEqual(riskMap.get('exploit'), 'R3');
  assert.strictEqual(riskMap.get('delete'), 'R4');
});

test('McpRiskMapper explainRiskLevel provides clear explanations', () => {
  const mapper = new McpRiskMapper();

  const r0Explanation = mapper.explainRiskLevel('version');
  assert.match(r0Explanation, /metadata/i);

  const r1Explanation = mapper.explainRiskLevel('scan');
  assert.match(r1Explanation, /read-only/i);

  const r3Explanation = mapper.explainRiskLevel('exploit');
  assert.match(r3Explanation, /requires approval/i);

  const r4Explanation = mapper.explainRiskLevel('delete');
  assert.match(r4Explanation, /destructive/i);

  const unknownExplanation = mapper.explainRiskLevel('unknown');
  assert.match(unknownExplanation, /fail-safe/i);
});

test('McpRiskMapper handles case-insensitive matching', () => {
  const mapper = new McpRiskMapper();

  assert.strictEqual(mapper.inferRiskLevel('SCAN'), 'R1');
  assert.strictEqual(mapper.inferRiskLevel('Exploit'), 'R3');
  assert.strictEqual(mapper.inferRiskLevel('DELETE'), 'R4');
});

test('McpRiskMapper uses description for additional context', () => {
  const mapper = new McpRiskMapper();

  // Tool name is generic, but description contains keyword
  assert.strictEqual(
    mapper.inferRiskLevel('security_test', 'Performs SQL injection testing'),
    'R3'
  );

  assert.strictEqual(
    mapper.inferRiskLevel('admin_tool', 'Deletes user accounts'),
    'R4'
  );

  // Description contains 'scans' which should match R1 pattern
  const result = mapper.inferRiskLevel('network_tool', 'Scans for open ports');
  assert.ok(['R1', 'R2'].includes(result), `Expected R1 or R2, got ${result}`);
});
