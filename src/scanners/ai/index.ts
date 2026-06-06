/**
 * AI Infrastructure Scanning Module
 *
 * Provides AI-specific security scanning capabilities including:
 * - LLM endpoint fingerprinting
 * - Prompt injection testing
 * - RAG/vector database exposure detection
 * - MCP server security auditing
 *
 * Templates:
 * - ai.llm_endpoint_fingerprint (R1)
 * - ai.prompt_injection_probe (R2)
 * - ai.rag_vector_exposure (R1-R2)
 * - ai.mcp_server_audit (R1-R2)
 */

export {
  LLM_FINGERPRINT_PROBES,
  parseLlmFingerprintResponse,
  extractModelVersion,
  type LlmFingerprintProbe,
  type LlmFingerprintResult,
  type LlmProvider,
  type LlmAuthMethod,
  type LlmProviderSignal,
  type RateLimitConfig,
} from './llm-fingerprint-scanner.js';

export {
  PROMPT_INJECTION_PROBES,
  analyzePromptInjectionResponse,
  getProbesByCategory,
  getProbesBySeverity,
  getSafeProbes,
  type PromptInjectionProbe,
  type PromptInjectionResult,
  type PromptInjectionCategory,
} from './prompt-injection-probes.js';

export {
  RAG_EXPOSURE_PROBES,
  RAG_QUERY_INJECTION_PROBES,
  analyzeRagExposureResponse,
  detectPII,
  checkRagMisconfigurations,
  type RagExposureProbe,
  type RagExposureResult,
  type RagExposureType,
  type RagQueryInjectionProbe,
  type RagMisconfiguration,
  type VectorDatabaseType,
} from './rag-exposure-scanner.js';

export {
  auditMcpServer,
  auditMcpTool,
  checkMcpAuthBypass,
  MCP_AUDIT_PROBES,
  DANGEROUS_MCP_PERMISSIONS,
  MCP_SCHEMA_VULNERABILITIES,
  TOOL_POISONING_INDICATORS,
  UNSAFE_MCP_CONFIGS,
  type McpServerAuditResult,
  type McpSecurityFinding,
  type McpVulnerabilityCategory,
  type McpAuditProbe,
} from './mcp-server-audit.js';
