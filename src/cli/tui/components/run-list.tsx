import React from 'react';
import { Box, Text } from 'ink';
import type { Run } from '../../../domain/types.js';

export interface RunListProps {
  runs: Run[];
  selectedIndex: number;
  onSelect?: (index: number) => void;
}

/**
 * Display a list of runs with selection highlighting.
 *
 * Similar to htop process list - shows run status, target, and goal.
 */
export function RunList({ runs, selectedIndex }: RunListProps): React.JSX.Element {
  if (runs.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No runs found. Create a run to get started.</Text>
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
        <Box width={30}>
          <Text bold color="cyan">
            TARGET
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text bold color="cyan">
            GOAL
          </Text>
        </Box>
      </Box>

      {/* Run rows */}
      {runs.map((run, index) => (
        <RunRow key={run.id} run={run} selected={index === selectedIndex} />
      ))}
    </Box>
  );
}

interface RunRowProps {
  run: Run;
  selected: boolean;
}

function RunRow({ run, selected }: RunRowProps): React.JSX.Element {
  const statusColor = getStatusColor(run.status);

  return (
    <Box paddingX={1}>
      <Box width={14}>
        <Text color={selected ? 'cyan' : 'gray'} inverse={selected}>
          {truncate(run.id, 12)}
        </Text>
      </Box>
      <Box width={12}>
        <Text color={selected ? 'cyan' : statusColor} bold={selected} inverse={selected}>
          {run.status.toUpperCase()}
        </Text>
      </Box>
      <Box width={30}>
        <Text color={selected ? 'cyan' : undefined} inverse={selected}>
          {truncate(run.target, 28)}
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={selected ? 'cyan' : 'gray'} inverse={selected}>
          {truncate(run.goal, 50)}
        </Text>
      </Box>
    </Box>
  );
}

function getStatusColor(status: Run['status']): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'completed':
      return 'cyan';
    case 'stopped':
      return 'yellow';
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
