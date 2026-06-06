# Browser Runner Enhancements

## Overview

This document describes the enhanced Playwright browser runner capabilities added in P2-5, including HAR capture, Playwright trace recording, video recording, and DOM redaction.

## Features

### 1. HAR (HTTP Archive) Capture

HAR capture records all HTTP traffic during browser navigation in a standardized format, suitable for replay and analysis.

**Key Features:**
- Captures all HTTP requests and responses
- Automatic redaction of sensitive headers (Authorization, Cookie, Set-Cookie, etc.)
- Redaction of cookie values and query string parameters
- Response content truncation (10,000 characters max)
- Stored as `replay_bundle` evidence with `redacted` state

**Usage:**

```typescript
const result = await platform.browserSessions.navigate({
  runId: run.id,
  target: 'https://app.example.com/dashboard',
  captureHar: true,
});

// Access HAR evidence
const harEvidenceId = result.snapshot?.harEvidenceId;
```

**Redaction Rules:**
- `Authorization` headers → `[REDACTED]`
- `Cookie` headers → `[REDACTED]`
- `Set-Cookie` headers → `[REDACTED]`
- `X-API-Key` headers → `[REDACTED]`
- `X-Auth-Token` headers → `[REDACTED]`
- All cookie values → `[REDACTED]`
- Query string parameters → redacted via `redactText()`
- Request/response body → redacted and truncated

**Fallback Behavior:**
If HAR parsing fails, a minimal valid HAR structure is created with a comment indicating the parsing failure.

### 2. Playwright Trace Recording

Playwright traces capture detailed execution information including screenshots, DOM snapshots, network activity, and console logs.

**Key Features:**
- Comprehensive execution trace with screenshots and DOM snapshots
- Stored as `replay_bundle` evidence with `raw_local_only` state
- Can be viewed using Playwright Trace Viewer (`playwright show-trace <file>`)
- Automatically cleaned up after evidence capture

**Usage:**

```typescript
const result = await platform.browserSessions.navigate({
  runId: run.id,
  target: 'https://app.example.com/dashboard',
  captureTrace: true,
});

// Access trace evidence
const traceEvidenceId = result.snapshot?.traceEvidenceId;
```

**Security Note:**
Traces are marked `raw_local_only` because they contain unredacted DOM content, screenshots, and network data. They are excluded from cloud exports and reports.

### 3. Video Recording

Video recording captures the entire browser session as a video file.

**Key Features:**
- Records full browser navigation as video
- Stored as `replay_bundle` evidence with `raw_local_only` state
- Useful for visual debugging and proof-of-concept demonstrations
- Automatically cleaned up after evidence capture

**Usage:**

```typescript
const result = await platform.browserSessions.navigate({
  runId: run.id,
  target: 'https://app.example.com/dashboard',
  captureVideo: true,
});

// Access video evidence
const videoEvidenceId = result.snapshot?.videoEvidenceId;
```

**Security Note:**
Videos are marked `raw_local_only` because they contain unredacted visual content. They are excluded from cloud exports and reports.

### 4. Combined Capture

All capture options can be used together:

```typescript
const result = await platform.browserSessions.navigate({
  runId: run.id,
  target: 'https://app.example.com/dashboard',
  captureHar: true,
  captureTrace: true,
  captureVideo: true,
});

// All evidence types are captured and linked in the snapshot
console.log(result.snapshot?.evidenceIds);
// Includes: screenshot, HAR, trace, video, text preview
```

## Evidence Storage and Redaction

| Capture Type | Evidence Kind | Redaction State | Export Safe | Notes |
|--------------|---------------|-----------------|-------------|-------|
| Screenshot | `screenshot` | `raw_local_only` | No | May contain sensitive visual data |
| HAR Archive | `replay_bundle` | `redacted` | Yes | Sensitive headers/cookies redacted |
| Trace | `replay_bundle` | `raw_local_only` | No | Contains unredacted DOM/network |
| Video | `replay_bundle` | `raw_local_only` | No | Contains unredacted visual content |
| Text Preview | `command_output` | `redacted` | Yes | DOM text with redaction applied |

## API Integration

### REST API

Navigate with capture options:

```bash
POST /runs/{runId}/browser/navigate
Content-Type: application/json

{
  "target": "https://app.example.com/dashboard",
  "captureHar": true,
  "captureTrace": true,
  "captureVideo": true
}
```

Response includes snapshot with evidence IDs:

```json
{
  "session": { "id": "browsersession_...", ... },
  "snapshot": {
    "id": "browser_snapshot_...",
    "screenshotEvidenceId": "evidence_...",
    "harEvidenceId": "evidence_...",
    "traceEvidenceId": "evidence_...",
    "videoEvidenceId": "evidence_...",
    "textEvidenceId": "evidence_...",
    "evidenceIds": ["evidence_1", "evidence_2", ...]
  },
  "evidenceIds": ["evidence_1", "evidence_2", ...]
}
```

### Accessing Evidence Content

```bash
GET /evidence/{evidenceId}/content
Authorization: Bearer <token>
```

**Note:** `raw_local_only` evidence content is blocked from remote access for security.

## Environment Configuration

Enable Playwright runner:

```bash
export PLATFORM_ENABLE_PLAYWRIGHT_RUNNER=1
export PLATFORM_PLAYWRIGHT_HEADLESS=1  # Optional, defaults to true
```

## Implementation Details

### Temporary File Management

- HAR, trace, and video files are written to temporary directories during capture
- Files are read and stored as evidence immediately after navigation
- Temporary files are automatically cleaned up 5 seconds after session close
- Cleanup handles failures gracefully (no errors thrown)

### Scope Enforcement

All captures respect `ScopePolicy`:
- Only in-scope navigation targets are allowed
- Out-of-scope renderer requests are blocked before capture
- Final navigation URL must be in-scope or navigation fails
- Network events are marked with `blockedByScope` flag

### Performance Considerations

- HAR capture adds ~10-50ms overhead
- Trace capture adds ~50-200ms overhead
- Video recording adds ~100-500ms overhead depending on duration
- All captures run in parallel where possible
- Temporary file I/O is asynchronous

## Testing

Comprehensive integration tests cover:
- HAR capture with redaction verification
- Trace capture with `raw_local_only` state
- Video capture with `raw_local_only` state
- Combined multi-artifact capture
- Basic navigation without optional captures
- Malformed HAR graceful fallback

Run tests:

```bash
npm run test:integration
```

## Security Model

### Redaction

HAR archives undergo aggressive redaction:
1. Sensitive header values replaced with `[REDACTED]`
2. All cookie values replaced with `[REDACTED]`
3. Query parameters redacted via `redactText()`
4. Request/response bodies redacted via `redactText()`
5. Response content truncated to 10KB

### Raw Local Only

Trace and video artifacts are marked `raw_local_only` to ensure:
- Not included in cloud exports
- Not included in report bundles
- Content reads blocked for remote clients
- Only accessible on local platform instance

### Evidence Chain

All captures generate auditable evidence records:
- Linked to run via `runId`
- Linked to browser snapshot
- SHA-256 content hash computed
- Creation timestamp recorded
- Run events generated for each capture type

## Roadmap Integration

This implementation satisfies **MATURITY_ROADMAP.md Section 1: Browser And Proxy Runner**:

✅ Harden Playwright-backed browser controller behind browser session API  
✅ Persist browser contexts as run-local session metadata  
✅ Add trace/video evidence with `raw_local_only` defaults  
✅ Keep navigation, capture, and replay behind `ScopePolicy`  
✅ Tests cover scope blocking, redaction, raw-local-only handling  

**Future Work:**
- TLS MITM as separate approval-gated desktop capability
- Local CA lifecycle controls
- HAR import and replay functionality
- Browser session persistence across dispatcher rounds

## References

- Playwright Trace Viewer: https://playwright.dev/docs/trace-viewer
- HAR 1.2 Spec: http://www.softwareishard.com/blog/har-12-spec/
- `src/captures/browser-session-service.ts` - Implementation
- `tests/browser-enhanced.integration.ts` - Integration tests
- `docs/MATURITY_ROADMAP.md` - Roadmap context
