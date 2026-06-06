# Vulnerability Platform Integration

This module provides integration with external vulnerability management platforms including DefectDojo, Faraday, and Jira.

## Overview

The vulnerability platform integration allows AgentRed to automatically export confirmed findings to external vulnerability management systems. This enables seamless integration with existing security workflows and tracking systems.

## Supported Platforms

### DefectDojo
- **Authentication**: API Token
- **Required Configuration**: 
  - `baseUrl`: DefectDojo instance URL
  - `apiKey`: API authentication token
  - `engagementId`: Target engagement ID
  - `enabled`: Set to `true` to enable

### Faraday
- **Authentication**: Basic Auth (username/password)
- **Required Configuration**:
  - `baseUrl`: Faraday instance URL
  - `username`: Username for authentication
  - `password`: Password for authentication
  - `workspaceId`: Target workspace ID
  - `enabled`: Set to `true` to enable

### Jira
- **Authentication**: Basic Auth (username/API token)
- **Required Configuration**:
  - `baseUrl`: Jira instance URL
  - `username`: Email address
  - `apiKey`: Jira API token
  - `projectKey`: Target project key (e.g., "SEC")
  - `enabled`: Set to `true` to enable

## Usage

### Configuration Example

```typescript
import { VulnPlatformAdapter } from './src/integrations/vuln-platform-adapter.js';
import { DefectDojoClient } from './src/integrations/defectdojo-client.js';
import { FaradayClient } from './src/integrations/faraday-client.js';
import { JiraClient } from './src/integrations/jira-client.js';

// Initialize clients
const defectDojoClient = new DefectDojoClient();
const faradayClient = new FaradayClient();
const jiraClient = new JiraClient();

// Create adapter
const adapter = new VulnPlatformAdapter(
  store,
  eventService,
  defectDojoClient,
  faradayClient,
  jiraClient
);

// Configure platform
const config = {
  type: 'defectdojo',
  baseUrl: 'https://defectdojo.example.com',
  apiKey: process.env.DEFECTDOJO_API_KEY,
  engagementId: '123',
  enabled: true
};

// Test connection
await adapter.testConnection(config);

// Export findings
const result = await adapter.exportFindings(runId, config);
console.log(`Exported ${result.exportedFindings} findings`);
console.log(`Platform issue IDs: ${result.platformIssueIds.join(', ')}`);
```

## Security Model

### Fail-Closed Semantics

The integration follows AgentRed's fail-closed security principles:

1. **Configuration validation**: All required fields must be present
2. **Connection testing**: Platform connectivity must be verified before export
3. **Confirmed findings only**: Only findings with `validationState: 'confirmed'` are exported
4. **Error isolation**: Export failures for individual findings do not prevent other findings from being exported
5. **Audit trail**: All export operations are logged via the event service

### Credential Management

- **API tokens and passwords**: Stored in environment variables, never in code
- **Audit logging**: All API calls are logged with redacted credentials
- **Connection validation**: Credentials are validated before any export operation

## Export Behavior

### Finding Selection

Only findings that meet ALL of the following criteria are exported:

1. Belongs to the specified `runId`
2. Has `validationState: 'confirmed'`
3. References at least one evidence item

Findings in `candidate` or `rejected` state are never exported.

### Mapping

The adapter transforms AgentRed findings to platform-specific formats:

#### Severity Mapping

| AgentRed | DefectDojo | Faraday | Jira |
|----------|------------|---------|------|
| critical | Critical | critical | Highest |
| high | High | high | High |
| medium | Medium | medium | Medium |
| low | Low | low | Low |
| info | Info | informational | Lowest |

#### Field Mapping

- **Title**: Direct mapping
- **Description**: Includes severity, confidence, affected assets, and evidence references
- **Affected Assets**: Included in description
- **Reproduction Steps**: Mapped to platform-specific fields
- **Impact**: Direct mapping
- **Remediation**: Mapped to mitigation/resolution fields
- **Evidence IDs**: Included in description for traceability

### Error Handling

Partial failures are supported:

```typescript
const result = await adapter.exportFindings(runId, config);

// Check results
console.log(`Success: ${result.exportedFindings} findings`);
console.log(`Failures: ${result.errors.length} findings`);

// Process errors
result.errors.forEach(error => {
  console.error(`Export failed: ${error}`);
});
```

## API Reference

### VulnPlatformAdapter

#### `exportFindings(runId: string, config: VulnPlatformConfig): Promise<VulnPlatformExportResult>`

Exports all confirmed findings from a run to the configured platform.

**Returns**: Export result with counts, issue IDs, and errors

#### `testConnection(config: VulnPlatformConfig): Promise<boolean>`

Tests connectivity and authentication to the platform.

**Returns**: `true` if connection successful, throws error otherwise

#### `getExportStatus(runId: string, platformType: VulnPlatformType): object`

Gets export status for a run.

**Returns**: Object with `totalConfirmed`, `exported`, and `pending` counts

### Client Classes

#### DefectDojoClient

- `testConnection(config: VulnPlatformConfig): Promise<boolean>`
- `createFinding(config: VulnPlatformConfig, finding: VulnPlatformFinding, runId: string): Promise<string>`

#### FaradayClient

- `testConnection(config: VulnPlatformConfig): Promise<boolean>`
- `createVulnerability(config: VulnPlatformConfig, finding: VulnPlatformFinding, runId: string): Promise<string>`

#### JiraClient

- `testConnection(config: VulnPlatformConfig): Promise<boolean>`
- `createIssue(config: VulnPlatformConfig, finding: VulnPlatformFinding, runId: string): Promise<string>`
- `addComment(config: VulnPlatformConfig, issueKey: string, comment: string): Promise<void>`

## Testing

The integration includes comprehensive test coverage:

```bash
# Run integration tests
npm test -- tests/integrations.test.ts

# Run all tests
npm test

# Type checking
npm run typecheck
```

Test coverage includes:

- Configuration validation (fail-closed)
- Connection testing
- Finding filtering (confirmed only)
- Error handling (partial failures)
- Client initialization
- All platform-specific clients

## Environment Variables

```bash
# DefectDojo
DEFECTDOJO_BASE_URL=https://defectdojo.example.com
DEFECTDOJO_API_KEY=your-api-key
DEFECTDOJO_ENGAGEMENT_ID=123

# Faraday
FARADAY_BASE_URL=https://faraday.example.com
FARADAY_USERNAME=user
FARADAY_PASSWORD=password
FARADAY_WORKSPACE_ID=workspace-id

# Jira
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_USERNAME=user@example.com
JIRA_API_KEY=your-api-token
JIRA_PROJECT_KEY=SEC
```

## Future Enhancements

Potential improvements for future releases:

1. **Bidirectional sync**: Import findings from external platforms
2. **Status updates**: Update finding status when platform issues change
3. **Attachment support**: Upload evidence files as attachments
4. **Webhook integration**: Real-time notifications of platform changes
5. **Bulk operations**: Batch export for performance
6. **Custom field mapping**: Configurable field mappings per platform
7. **Additional platforms**: GitHub Security Advisories, Azure DevOps, etc.

## Architecture

```
┌─────────────────────────────────────┐
│     VulnPlatformAdapter             │
│  (Unified integration interface)    │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┬──────────┐
       │                │          │
┌──────▼───────┐ ┌─────▼─────┐ ┌─▼────────┐
│DefectDojo    │ │ Faraday   │ │  Jira    │
│Client        │ │ Client    │ │ Client   │
└──────┬───────┘ └─────┬─────┘ └─┬────────┘
       │                │          │
       └────────────────┴──────────┘
                    │
              External APIs
```

## Contributing

When adding new platform integrations:

1. Create a new client class in `src/integrations/`
2. Implement `testConnection()` and `create*()` methods
3. Add client to `VulnPlatformAdapter` constructor
4. Update type definitions
5. Add comprehensive tests
6. Update this documentation
7. Follow fail-closed security principles
