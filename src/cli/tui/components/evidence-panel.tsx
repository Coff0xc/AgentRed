import React from 'react';
import { Box, Text } from 'ink';
import type { Evidence, Finding } from '../../../domain/types.js';

export interface EvidencePanelProps {
  evidence: Evidence[];
  findings: Finding[];
  maxItems?: number;
}

/**
 * Display recent evidence and findings.
 *
 * Shows evidence collection activity and discovered vulnerabilities.
 */
export function EvidencePanel({ evidence, findings, maxItems = 10 }: EvidencePanelProps): React.JSX.Element {
  // Sort by creation time (most recent first)
  const recentEvidence = [...evidence]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, maxItems);

  const recentFindings = [...findings]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, maxItems);

  return (
    <Box flexDirection="column">
      {/* Evidence Section */}
      <Box flexDirection="column" marginBottom={1}>
        <Box paddingX={1} marginBottom={0}>
          <Text bold color="cyan">
            EVIDENCE ({evidence.length})
          </Text>
        </Box>
        {recentEvidence.length === 0 ? (
          <Box paddingX={1}>
            <Text dimColor>No evidence collected yet.</Text>
          </Box>
        ) : (
          recentEvidence.map((item) => <EvidenceRow key={item.id} evidence={item} />)
        )}
      </Box>

      {/* Findings Section */}
      <Box flexDirection="column">
        <Box paddingX={1} marginBottom={0}>
          <Text bold color="cyan">
            FINDINGS ({findings.length})
          </Text>
        </Box>
        {recentFindings.length === 0 ? (
          <Box paddingX={1}>
            <Text dimColor>No findings yet.</Text>
          </Box>
        ) : (
          recentFindings.map((finding) => <FindingRow key={finding.id} finding={finding} />)
        )}
      </Box>
    </Box>
  );
}

interface EvidenceRowProps {
  evidence: Evidence;
}

function EvidenceRow({ evidence }: EvidenceRowProps): React.JSX.Element {
  const kindColor = getEvidenceKindColor(evidence.kind);

  return (
    <Box paddingX={1}>
      <Box width={14}>
        <Text color="gray">{truncate(evidence.id, 12)}</Text>
      </Box>
      <Box width={18}>
        <Text color={kindColor}>{evidence.kind}</Text>
      </Box>
      <Box width={12}>
        <Text color={getRedactionColor(evidence.redactionState)}>{evidence.redactionState}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text dimColor>{formatTimestamp(evidence.createdAt)}</Text>
      </Box>
    </Box>
  );
}

interface FindingRowProps {
  finding: Finding;
}

function FindingRow({ finding }: FindingRowProps): React.JSX.Element {
  const severityColor = getSeverityColor(finding.severity);
  const validationColor = getValidationColor(finding.validationState);

  return (
    <Box paddingX={1}>
      <Box width={14}>
        <Text color="gray">{truncate(finding.id, 12)}</Text>
      </Box>
      <Box width={12}>
        <Text color={severityColor} bold>
          {finding.severity.toUpperCase()}
        </Text>
      </Box>
      <Box width={14}>
        <Text color={validationColor}>{finding.validationState}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text>{truncate(finding.title, 50)}</Text>
      </Box>
    </Box>
  );
}

function getEvidenceKindColor(kind: Evidence['kind']): string {
  switch (kind) {
    case 'http_exchange':
      return 'blue';
    case 'screenshot':
      return 'magenta';
    case 'command_output':
      return 'cyan';
    case 'oast_callback':
      return 'yellow';
    case 'file_hash':
      return 'green';
    case 'replay_bundle':
      return 'white';
    default:
      return 'gray';
  }
}

function getRedactionColor(state: Evidence['redactionState']): string {
  switch (state) {
    case 'raw_local_only':
      return 'red';
    case 'redacted':
      return 'yellow';
    case 'safe_for_cloud':
      return 'green';
    default:
      return 'white';
  }
}

function getSeverityColor(severity: Finding['severity']): string {
  switch (severity) {
    case 'critical':
      return 'magenta';
    case 'high':
      return 'red';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'cyan';
    case 'info':
      return 'gray';
    default:
      return 'white';
  }
}

function getValidationColor(validation: Finding['validationState']): string {
  switch (validation) {
    case 'confirmed':
      return 'green';
    case 'candidate':
      return 'yellow';
    case 'rejected':
      return 'red';
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

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  return date.toLocaleDateString();
}
