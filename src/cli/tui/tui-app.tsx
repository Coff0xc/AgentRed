import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { RunList } from './components/run-list.js';
import { IntentViewer } from './components/intent-viewer.js';
import { EvidencePanel } from './components/evidence-panel.js';
import { useWebSocket } from './hooks/use-websocket.js';
import type { Run, GraphSnapshot } from '../../domain/types.js';

export interface TuiAppProps {
  apiUrl: string;
  token: string;
}

type ViewMode = 'runs' | 'intents' | 'evidence';

/**
 * AgentRed TUI - Terminal User Interface
 *
 * Provides an htop-like terminal interface for monitoring runs, intents, and evidence.
 *
 * Keyboard shortcuts:
 * - Tab: Switch between views (runs → intents → evidence)
 * - ↑/↓: Navigate runs list
 * - r: Refresh data
 * - q: Quit
 */
export function TuiApp({ apiUrl, token }: TuiAppProps): React.JSX.Element {
  const { exit } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('runs');
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunIndex, setSelectedRunIndex] = useState(0);
  const [graphData, setGraphData] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Get selected run
  const selectedRun = runs[selectedRunIndex];

  // WebSocket connection for real-time updates
  const { connected, lastUpdate, error: wsError } = useWebSocket({
    url: apiUrl,
    runId: selectedRun?.id || '',
    token,
    enabled: !!selectedRun,
    onMessage: useCallback(() => {
      // Trigger data refresh when updates are received
      if (selectedRun) {
        fetchGraphData(selectedRun.id);
      }
    }, [selectedRun]),
  });

  // Fetch runs list
  const fetchRuns = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/runs`, {
        headers: {
          'X-Platform-Token': token,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch runs: ${response.statusText}`);
      }

      const data = await response.json();
      setRuns(data.runs || []);
      setError(null);
    } catch (err) {
      setError(`Failed to fetch runs: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token]);

  // Fetch graph data for selected run
  const fetchGraphData = useCallback(
    async (runId: string) => {
      try {
        const response = await fetch(`${apiUrl}/runs/${runId}/graph`, {
          headers: {
            'X-Platform-Token': token,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch graph: ${response.statusText}`);
        }

        const data = await response.json();
        setGraphData(data);
        setError(null);
      } catch (err) {
        setError(`Failed to fetch graph: ${err}`);
      }
    },
    [apiUrl, token],
  );

  // Initial data fetch
  useEffect(() => {
    fetchRuns();
    const interval = setInterval(() => {
      fetchRuns();
      setLastRefresh(new Date());
    }, 10_000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [fetchRuns]);

  // Fetch graph data when selected run changes
  useEffect(() => {
    if (selectedRun) {
      fetchGraphData(selectedRun.id);
    }
  }, [selectedRun, fetchGraphData]);

  // Keyboard input handler
  useInput((input, key) => {
    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    // Refresh
    if (input === 'r') {
      fetchRuns();
      if (selectedRun) {
        fetchGraphData(selectedRun.id);
      }
      setLastRefresh(new Date());
      return;
    }

    // Switch view mode
    if (key.tab) {
      setViewMode((prev) => {
        if (prev === 'runs') return 'intents';
        if (prev === 'intents') return 'evidence';
        return 'runs';
      });
      return;
    }

    // Navigate runs list (only in runs view)
    if (viewMode === 'runs') {
      if (key.upArrow) {
        setSelectedRunIndex((prev) => Math.max(0, prev - 1));
      }
      if (key.downArrow) {
        setSelectedRunIndex((prev) => Math.min(runs.length - 1, prev + 1));
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Box flexDirection="column" width="100%">
          <Box>
            <Text bold color="cyan">
              AgentRed TUI
            </Text>
            <Text dimColor> - Terminal User Interface</Text>
          </Box>
          <Box justifyContent="space-between">
            <Box>
              <Text dimColor>API: </Text>
              <Text>{apiUrl}</Text>
            </Box>
            <Box>
              <Text dimColor>WS: </Text>
              <Text color={connected ? 'green' : 'red'}>{connected ? '●' : '○'}</Text>
              <Text dimColor> </Text>
              <Text dimColor>Updated: </Text>
              <Text>{lastRefresh.toLocaleTimeString()}</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* View mode tabs */}
      <Box marginBottom={1}>
        <Tab label="Runs" active={viewMode === 'runs'} shortcut="1" />
        <Tab label="Intents" active={viewMode === 'intents'} shortcut="2" />
        <Tab label="Evidence" active={viewMode === 'evidence'} shortcut="3" />
        <Box flexGrow={1} />
        <Text dimColor>Tab: Switch | ↑↓: Navigate | r: Refresh | q: Quit</Text>
      </Box>

      {/* Error display */}
      {(error || wsError) && (
        <Box borderStyle="single" borderColor="red" paddingX={1} marginBottom={1}>
          <Text color="red">{error || wsError}</Text>
        </Box>
      )}

      {/* Loading state */}
      {loading && (
        <Box paddingX={1}>
          <Text>Loading...</Text>
        </Box>
      )}

      {/* Content area */}
      {!loading && (
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray">
          {viewMode === 'runs' && <RunList runs={runs} selectedIndex={selectedRunIndex} />}

          {viewMode === 'intents' && selectedRun && graphData && (
            <Box flexDirection="column" padding={1}>
              <Box marginBottom={1}>
                <Text bold>
                  Intents for run: <Text color="cyan">{selectedRun.id}</Text>
                </Text>
              </Box>
              <IntentViewer intents={graphData.intents} />
            </Box>
          )}

          {viewMode === 'evidence' && selectedRun && graphData && (
            <Box flexDirection="column" padding={1}>
              <Box marginBottom={1}>
                <Text bold>
                  Evidence for run: <Text color="cyan">{selectedRun.id}</Text>
                </Text>
              </Box>
              <EvidencePanel evidence={graphData.evidence} findings={graphData.findings} />
            </Box>
          )}

          {viewMode !== 'runs' && !selectedRun && (
            <Box paddingX={1}>
              <Text dimColor>Select a run first</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Status bar */}
      <Box marginTop={1} paddingX={1}>
        <Text dimColor>
          Runs: <Text color="cyan">{runs.length}</Text>
        </Text>
        {selectedRun && graphData && (
          <>
            <Text dimColor> | Intents: </Text>
            <Text color="yellow">{graphData.intents.length}</Text>
            <Text dimColor> | Evidence: </Text>
            <Text color="green">{graphData.evidence.length}</Text>
            <Text dimColor> | Findings: </Text>
            <Text color="red">{graphData.findings.length}</Text>
          </>
        )}
      </Box>

      {/* WebSocket update indicator */}
      {lastUpdate && (
        <Box paddingX={1}>
          <Text dimColor>
            Last update: <Text color="cyan">{lastUpdate.type}</Text> at {new Date(lastUpdate.timestamp).toLocaleTimeString()}
          </Text>
        </Box>
      )}
    </Box>
  );
}

interface TabProps {
  label: string;
  active: boolean;
  shortcut: string;
}

function Tab({ label, active, shortcut }: TabProps): React.JSX.Element {
  return (
    <Box marginRight={1}>
      <Text color={active ? 'cyan' : 'gray'} bold={active}>
        [{shortcut}] {label}
      </Text>
    </Box>
  );
}
