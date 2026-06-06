# Advanced Report Templates - CVSS 4.0 & ATT&CK Mapping

## Overview

P2-4 implementation adds advanced reporting capabilities including CVSS 4.0 scoring, MITRE ATT&CK technique mapping, and executive summary generation.

## New Features

### 1. CVSS 4.0 Scoring

Findings can now include CVSS 4.0 base scores with full vector support:

```typescript
const cvss40Score = Cvss40Calculator.calculate({
  AV: 'N',  // Attack Vector: Network
  AC: 'L',  // Attack Complexity: Low
  AT: 'N',  // Attack Requirements: None
  PR: 'N',  // Privileges Required: None
  UI: 'N',  // User Interaction: None
  VC: 'H',  // Vulnerable System Confidentiality: High
  VI: 'H',  // Vulnerable System Integrity: High
  VA: 'H',  // Vulnerable System Availability: High
  SC: 'N',  // Subsequent System Confidentiality: None
  SI: 'N',  // Subsequent System Integrity: None
  SA: 'N',  // Subsequent System Availability: None
});

// Returns: { baseScore: 9.3, baseSeverity: 'CRITICAL', vector: {...}, vectorString: 'CVSS:4.0/...' }
```

### 2. MITRE ATT&CK Mapping

Findings can be mapped to ATT&CK techniques:

```typescript
const finding = platform.findings.proposeFinding({
  // ... other fields
  attackMappings: [
    {
      techniqueId: 'T1190',
      techniqueName: 'Exploit Public-Facing Application',
      tactic: 'Initial Access',
    },
  ],
});
```

### 3. CWE Classification

Findings support CWE (Common Weakness Enumeration) classification:

```typescript
const finding = platform.findings.proposeFinding({
  // ... other fields
  cweIds: ['CWE-89', 'CWE-943'],
});
```

### 4. Executive Report Format

New `executive` report format with enhanced features:

```typescript
const report = platform.reports.generate({
  runId: run.id,
  format: 'executive',  // New format
  findingScope: 'confirmed_only',
});
```

## Executive Report Structure

The executive report includes:

1. **Executive Summary**
   - Overall risk level assessment
   - Finding distribution by severity
   - High/critical findings count
   - ATT&CK tactics coverage
   - Vulnerability classes (CWEs)

2. **Severity Distribution Chart**
   - ASCII bar chart showing finding distribution
   - Percentage breakdown

3. **Risk Summary Table**
   - Tabular view of all findings
   - CVSS scores
   - Validation status
   - Affected assets

4. **Detailed Findings**
   - Enhanced finding format with:
     - CVSS 4.0 score and vector
     - CWE mappings
     - ATT&CK technique mappings
     - Reproduction steps
     - Impact analysis
     - Remediation guidance

5. **ATT&CK Coverage Matrix**
   - Techniques organized by tactic
   - Complete coverage view

6. **Methodology Section**
   - Testing scope
   - Evidence policy
   - Authorized assets

## API Changes

### Extended Types

**Finding interface** now includes:
- `cvss40?: Cvss40Score` - Optional CVSS 4.0 scoring
- `attackMappings?: AttackMapping[]` - ATT&CK technique mappings
- `cweIds?: string[]` - CWE classification

**New types:**
- `Cvss40Vector` - CVSS 4.0 metric vector
- `Cvss40Score` - Complete score with severity rating
- `AttackMapping` - ATT&CK technique mapping

**Report formats:**
- `ReportFormat` type now includes `'executive'`

### ProposeFindingInput

```typescript
interface ProposeFindingInput {
  runId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  affectedAssets: string[];
  evidenceIds: string[];
  reproSteps: string[];
  impact: string;
  remediation: string;
  cvss40?: Cvss40Score;           // New
  attackMappings?: AttackMapping[]; // New
  cweIds?: string[];                // New
}
```

## Usage Examples

### Creating a Finding with Full Metadata

```typescript
const sqlInjectionCvss = Cvss40Calculator.calculate({
  AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N',
  VC: 'H', VI: 'H', VA: 'H',
  SC: 'N', SI: 'N', SA: 'N',
});

const finding = platform.findings.proposeFinding({
  runId: run.id,
  title: 'SQL Injection in Authentication',
  severity: 'critical',
  confidence: 'confirmed',
  affectedAssets: ['https://example.com/login'],
  evidenceIds: [evidence.id],
  reproSteps: [
    'Navigate to login page',
    "Enter: admin' OR 1=1--",
    'Observe authentication bypass',
  ],
  impact: 'Complete authentication bypass leading to unauthorized access',
  remediation: 'Use parameterized queries',
  cvss40: sqlInjectionCvss,
  attackMappings: [
    {
      techniqueId: 'T1190',
      techniqueName: 'Exploit Public-Facing Application',
      tactic: 'Initial Access',
    },
  ],
  cweIds: ['CWE-89', 'CWE-943'],
});
```

### Generating Executive Report

```typescript
// Generate executive report
const report = platform.reports.generate({
  runId: run.id,
  format: 'executive',
  findingScope: 'confirmed_only',
});

console.log(report.markdown);
// Contains: Executive Summary, Risk Profile, ATT&CK Coverage, etc.
```

### Legacy Format Compatibility

Existing report formats remain unchanged:

```typescript
// Legacy formats still work
const report = platform.reports.generate({
  runId: run.id,
  format: 'hackerone', // or 'bugcrowd', 'src', 'enterprise'
  findingScope: 'confirmed_only',
});
```

## Backward Compatibility

All new fields are **optional**. Existing code continues to work without changes:

- Findings without CVSS/ATT&CK data are still valid
- Legacy report formats work as before
- No breaking changes to existing APIs

## CVSS 4.0 Implementation Notes

The CVSS 4.0 calculator provides:
- Vector string generation and parsing
- Base score calculation (simplified implementation)
- Severity rating (NONE, LOW, MEDIUM, HIGH, CRITICAL)
- Vector validation

Note: This is a simplified implementation. For production use with official CVSS scores, consider using the official FIRST CVSS calculator or lookup tables.

## Testing

New tests cover:
- CVSS 4.0 calculation and validation
- ATT&CK matrix generation
- Executive summary formatting
- Risk assessment logic
- Severity distribution charts
- Integration with existing platform

Run tests:
```bash
npm test -- tests/advanced-report.test.ts
npm test -- tests/advanced-report-integration.test.ts
```

## Files Added

- `src/reports/cvss40-calculator.ts` - CVSS 4.0 scoring engine
- `src/reports/advanced-report-formatter.ts` - Executive report formatting
- `tests/advanced-report.test.ts` - Unit tests
- `tests/advanced-report-integration.test.ts` - Integration tests

## Files Modified

- `src/domain/types.ts` - Extended Finding interface and new types
- `src/reports/report-service.ts` - Added executive format support
- `src/findings/finding-service.ts` - Support new optional fields
