import React from 'react';
import { Box, Text } from 'ink';
import type { Intent } from '../../../domain/types.js';

export interface IntentViewerProps {
  intents: Intent[];
  showAll?: boolean;
}

/**
 * Display active intents with status and risk level.
 *
 * Shows current exploration state similar to process activity view.
 */
export function IntentViewer({ intents, showAll = false }: IntentViewerProps): React.JSX.Element {
  // Filter intents based on showAll flag
  const displayIntents = showAll
    ? intents
    : intents.filter((intent) => intent.status === 'open' || intent.status === 'claimed');

  if (displayIntents.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No active intents.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box paddingX={1}>
        <Box width={14}>
          <Text bold color="cyan">
            ID
          </Text>
        </Box>
        <Box width={12}>
          <Text bold color="cyan">
            STATUS
          </Text>
        </Box>
        <Box width={8}>
          <Text bold color="cyan">
            RISK
          </Text>
        </Box>
        <Box width={16}>
          <Text bold color="cyan">
            CLAIMED BY
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text bold color="cyan">
            HYPOTHESIS
          </Text>
        </Box>
      </Box>

      {/* Intent rows */}
      {displayIntents.map((intent) => (
        <IntentRow key={intent.id} intent={intent} />
      ))}
    </Box>
  );
}

interface IntentRowProps {
  intent: Intent;
}

function IntentRow({ intent }: IntentRowProps): React.JSX.Element {
  const statusColor = getStatusColor(intent.status);
  const riskColor = getRiskColor(intent.riskLevel);

  return (
    <Box paddingX={1}>
      <Box width={14}>
        <Text color="gray">{truncate(intent.id, 12)}</Text>
      </Box>
      <Box width={12}>
        <Text color={statusColor}>{intent.status.toUpperCase()}</Text>
      </Box>
      <Box width={8}>
        <Text color={riskColor} bold>
          {intent.riskLevel}
        </Text>
      </Box>
      <Box width={16}>
        <Text color="gray">{truncate(intent.claimedBy || '-', 14)}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text>{truncate(intent.hypothesis, 60)}</Text>
      </Box>
    </Box>
  );
}

function getStatusColor(status: Intent['status']): string {
  switch (status) {
    case 'open':
      return 'yellow';
    case 'claimed':
      return 'blue';
    case 'concluded':
      return 'green';
    case 'released':
      return 'magenta';
    default:
      return 'white';
  }
}

function getRiskColor(risk: Intent['riskLevel']): string {
  switch (risk) {
    case 'R0':
      return 'green';
    case 'R1':
      return 'cyan';
    case 'R2':
      return 'yellow';
    case 'R3':
      return 'red';
    case 'R4':
      return 'magenta';
    default:
      return 'white';
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1) + '…';
}
