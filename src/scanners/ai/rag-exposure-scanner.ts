import type { RiskLevel } from '../../domain/types.js';

/**
 * RAG (Retrieval-Augmented Generation) Vector Database Exposure Scanner
 *
 * Detects publicly accessible vector databases and RAG data exposure vulnerabilities.
 * Template: ai.rag_vector_exposure
 * Risk Level: R1 (reconnaissance) to R2 (active probing)
 */

export type VectorDatabaseType =
  | 'pinecone'
  | 'weaviate'
  | 'milvus'
  | 'qdrant'
  | 'chroma'
  | 'faiss'
  | 'elasticsearch'
  | 'pgvector'
  | 'redis_vector'
  | 'unknown';

export interface RagExposureProbe {
  id: string;
  name: string;
  description: string;
  databaseType: VectorDatabaseType;
  riskLevel: RiskLevel;
  endpoints: RagEndpointProbe[];
}

export interface RagEndpointProbe {
  path: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  expectedStatus: number[];
  authBypassIndicators: string[];
}

export interface RagExposureResult {
  target: string;
  databaseType: VectorDatabaseType;
  vulnerable: boolean;
  exposureType: RagExposureType[];
  authenticationRequired: boolean;
  piiDetected: boolean;
  sensitiveDataTypes: string[];
  collectionCount?: number;
  documentCount?: number;
  evidenceSummary: Record<string, unknown>;
}

export type RagExposureType =
  | 'unauthenticated_access'
  | 'weak_authentication'
  | 'public_collections'
  | 'pii_exposure'
  | 'query_injection'
  | 'metadata_leak'
  | 'backup_exposure';

/**
 * RAG Exposure Probes
 */
export const RAG_EXPOSURE_PROBES: RagExposureProbe[] = [
  {
    id: 'pinecone-public-access',
    name: 'Pinecone Public Access Check',
    description: 'Detects publicly accessible Pinecone vector database',
    databaseType: 'pinecone',
    riskLevel: 'R1',
    endpoints: [
      {
        path: '/describe_index_stats',
        method: 'GET',
        expectedStatus: [200, 401, 403],
        authBypassIndicators: ['namespaces', 'dimension', 'index_fullness'],
      },
      {
        path: '/query',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topK: 1, includeMetadata: true }),
        expectedStatus: [200, 401, 403],
        authBypassIndicators: ['matches', 'metadata'],
      },
    ],
  },
  {
    id: 'weaviate-public-access',
    name: 'Weaviate Public Schema Access',
    description: 'Detects publicly accessible Weaviate instance',
    databaseType: 'weaviate',
    riskLevel: 'R1',
    endpoints: [
      {
        path: '/v1/schema',
        method: 'GET',
        expectedStatus: [200, 401, 403],
        authBypassIndicators: ['classes', 'properties', 'vectorizer'],
      },
      {
        path: '/v1/meta',
        method: 'GET',
        expectedStatus: [200],
        authBypassIndicators: ['hostname', 'version', 'modules'],
      },
      {
        path: '/v1/.well-known/ready',
        method: 'GET',
        expectedStatus: [200],
        authBypassIndicators: ['ready', 'true'],
      },
    ],
  },
  {
    id: 'milvus-public-access',
    name: 'Milvus Public Collections',
    description: 'Detects publicly accessible Milvus vector database',
    databaseType: 'milvus',
    riskLevel: 'R1',
    endpoints: [
      {
        path: '/v1/vector/collections',
        method: 'GET',
        expectedStatus: [200, 401],
        authBypassIndicators: ['collection_names', 'collections'],
      },
    ],
  },
  {
    id: 'qdrant-public-access',
    name: 'Qdrant Public Collections',
    description: 'Detects publicly accessible Qdrant vector search engine',
    databaseType: 'qdrant',
    riskLevel: 'R1',
    endpoints: [
      {
        path: '/collections',
        method: 'GET',
        expectedStatus: [200, 401],
        authBypassIndicators: ['collections', 'result'],
      },
      {
        path: '/cluster',
        method: 'GET',
        expectedStatus: [200, 401],
        authBypassIndicators: ['status', 'peer_id'],
      },
    ],
  },
  {
    id: 'chroma-public-access',
    name: 'ChromaDB Public Collections',
    description: 'Detects publicly accessible ChromaDB instance',
    databaseType: 'chroma',
    riskLevel: 'R1',
    endpoints: [
      {
        path: '/api/v1/collections',
        method: 'GET',
        expectedStatus: [200, 401],
        authBypassIndicators: ['collections', 'name', 'metadata'],
      },
      {
        path: '/api/v1/heartbeat',
        method: 'GET',
        expectedStatus: [200],
        authBypassIndicators: ['nanosecond'],
      },
    ],
  },
  {
    id: 'elasticsearch-vector-access',
    name: 'Elasticsearch Vector Index Access',
    description: 'Detects publicly accessible Elasticsearch with vector fields',
    databaseType: 'elasticsearch',
    riskLevel: 'R1',
    endpoints: [
      {
        path: '/_cat/indices',
        method: 'GET',
        expectedStatus: [200, 401],
        authBypassIndicators: ['index', 'docs.count'],
      },
      {
        path: '/_cluster/health',
        method: 'GET',
        expectedStatus: [200, 401],
        authBypassIndicators: ['cluster_name', 'status'],
      },
    ],
  },
  {
    id: 'pgvector-public-access',
    name: 'PostgreSQL pgvector Exposure',
    description: 'Detects PostgreSQL with pgvector extension exposed',
    databaseType: 'pgvector',
    riskLevel: 'R2',
    endpoints: [
      {
        path: '/pg/v1/tables',
        method: 'GET',
        expectedStatus: [200, 401],
        authBypassIndicators: ['tables', 'vector'],
      },
    ],
  },
];

/**
 * PII Detection Patterns
 */
export const PII_PATTERNS = [
  { type: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
  { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'phone', pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g },
  { type: 'credit_card', pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g },
  { type: 'ip_address', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { type: 'api_key', pattern: /\b[A-Za-z0-9_-]{32,}\b/g },
  { type: 'jwt', pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g },
];

/**
 * Sensitive Data Keywords
 */
export const SENSITIVE_KEYWORDS = [
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'credential',
  'auth',
  'private',
  'confidential',
  'internal',
  'ssn',
  'social_security',
  'credit_card',
  'bank_account',
  'medical',
  'health',
  'diagnosis',
];

/**
 * Analyze RAG exposure response
 */
export function analyzeRagExposureResponse(
  probe: RagExposureProbe,
  endpointIndex: number,
  response: {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  },
): Partial<RagExposureResult> {
  const endpoint = probe.endpoints[endpointIndex];
  const exposureTypes: RagExposureType[] = [];

  // Check if authentication is required
  const authenticationRequired = response.statusCode === 401 || response.statusCode === 403;

  // Check for auth bypass (200 response without proper auth)
  if (response.statusCode === 200 && !hasAuthHeader(response.headers)) {
    exposureTypes.push('unauthenticated_access');
  }

  // Check for auth bypass indicators in response
  const authBypassDetected = endpoint.authBypassIndicators.some((indicator) =>
    response.body.toLowerCase().includes(indicator.toLowerCase()),
  );

  if (authBypassDetected && response.statusCode === 200) {
    exposureTypes.push('public_collections');
  }

  // Detect PII in response
  const piiResult = detectPII(response.body);

  // Detect sensitive keywords
  const hasSensitiveData = SENSITIVE_KEYWORDS.some((keyword) =>
    response.body.toLowerCase().includes(keyword),
  );

  if (piiResult.detected) {
    exposureTypes.push('pii_exposure');
  }

  if (hasSensitiveData) {
    exposureTypes.push('metadata_leak');
  }

  // Extract metrics if available
  const metrics = extractVectorDbMetrics(probe.databaseType, response.body);

  return {
    databaseType: probe.databaseType,
    vulnerable: exposureTypes.length > 0,
    exposureType: exposureTypes,
    authenticationRequired,
    piiDetected: piiResult.detected,
    sensitiveDataTypes: piiResult.types,
    collectionCount: metrics.collectionCount,
    documentCount: metrics.documentCount,
    evidenceSummary: {
      probeId: probe.id,
      endpoint: endpoint.path,
      statusCode: response.statusCode,
      authBypassDetected,
      piiTypes: piiResult.types,
      metrics,
    },
  };
}

function hasAuthHeader(headers: Record<string, string>): boolean {
  const authHeaders = ['authorization', 'x-api-key', 'api-key', 'x-auth-token'];
  return authHeaders.some((header) => headers[header] !== undefined);
}

/**
 * Detect PII in response body
 */
export function detectPII(text: string): { detected: boolean; types: string[] } {
  const detectedTypes: string[] = [];

  for (const pattern of PII_PATTERNS) {
    // Reset lastIndex to avoid issues with global regex
    pattern.pattern.lastIndex = 0;
    if (pattern.pattern.test(text)) {
      detectedTypes.push(pattern.type);
    }
  }

  return {
    detected: detectedTypes.length > 0,
    types: detectedTypes,
  };
}

/**
 * Extract vector database metrics from response
 */
function extractVectorDbMetrics(
  dbType: VectorDatabaseType,
  body: string,
): { collectionCount?: number; documentCount?: number } {
  try {
    const data = JSON.parse(body);

    switch (dbType) {
      case 'pinecone':
        return {
          documentCount: data.totalVectorCount || data.namespaces?.['']?.vectorCount,
        };

      case 'weaviate':
        return {
          collectionCount: data.classes?.length,
        };

      case 'milvus':
        return {
          collectionCount: data.collection_names?.length || data.collections?.length,
        };

      case 'qdrant':
        return {
          collectionCount: data.result?.collections?.length,
        };

      case 'chroma':
        return {
          collectionCount: Array.isArray(data) ? data.length : undefined,
        };

      case 'elasticsearch':
        // Count indices from _cat/indices response
        if (typeof body === 'string') {
          const lines = body.split('\n').filter((line) => line.trim());
          return { collectionCount: lines.length };
        }
        break;
    }
  } catch {
    // Not JSON or parsing failed
  }

  return {};
}

/**
 * Generate RAG query injection probes
 */
export interface RagQueryInjectionProbe {
  id: string;
  name: string;
  description: string;
  payload: string;
  expectedVulnerability: string;
}

export const RAG_QUERY_INJECTION_PROBES: RagQueryInjectionProbe[] = [
  {
    id: 'vector-injection-001',
    name: 'Vector Similarity Manipulation',
    description: 'Attempts to manipulate vector similarity search',
    payload: JSON.stringify({
      query: 'test',
      filter: { $or: [{ sensitive: true }, { private: true }] },
      topK: 1000,
    }),
    expectedVulnerability: 'Filter bypass to access sensitive documents',
  },
  {
    id: 'metadata-injection-001',
    name: 'Metadata Filter Injection',
    description: 'Injects malicious metadata filters',
    payload: JSON.stringify({
      query: 'test',
      filter: { metadata: { $ne: null } },
      includeMetadata: true,
    }),
    expectedVulnerability: 'Metadata extraction of all documents',
  },
  {
    id: 'nosql-injection-001',
    name: 'NoSQL-style Filter Injection',
    description: 'Attempts NoSQL injection in vector search',
    payload: JSON.stringify({
      query: 'test',
      filter: { $where: 'this.sensitive == true' },
    }),
    expectedVulnerability: 'NoSQL injection to bypass access controls',
  },
  {
    id: 'limit-bypass-001',
    name: 'Result Limit Bypass',
    description: 'Attempts to bypass result limits',
    payload: JSON.stringify({
      query: 'test',
      topK: 999999,
      limit: 999999,
    }),
    expectedVulnerability: 'Excessive data extraction',
  },
];

/**
 * Check for common RAG misconfigurations
 */
export interface RagMisconfiguration {
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  detected: boolean;
}

export function checkRagMisconfigurations(
  response: {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  },
): RagMisconfiguration[] {
  const misconfigurations: RagMisconfiguration[] = [];

  // Check for CORS misconfiguration
  if (response.headers['access-control-allow-origin'] === '*') {
    misconfigurations.push({
      type: 'cors_wildcard',
      severity: 'high',
      description: 'CORS allows any origin to access vector database',
      detected: true,
    });
  }

  // Check for missing authentication
  if (response.statusCode === 200 && !hasAuthHeader(response.headers)) {
    misconfigurations.push({
      type: 'no_authentication',
      severity: 'high',
      description: 'No authentication required to access vector database',
      detected: true,
    });
  }

  // Check for verbose error messages
  if (response.body.includes('stack trace') || response.body.includes('traceback')) {
    misconfigurations.push({
      type: 'verbose_errors',
      severity: 'medium',
      description: 'Verbose error messages leak internal information',
      detected: true,
    });
  }

  // Check for default credentials indicators
  const defaultCredPatterns = ['admin:admin', 'root:root', 'default', 'demo'];
  if (defaultCredPatterns.some((pattern) => response.body.toLowerCase().includes(pattern))) {
    misconfigurations.push({
      type: 'default_credentials',
      severity: 'high',
      description: 'Possible default credentials in use',
      detected: true,
    });
  }

  return misconfigurations.filter((m) => m.detected);
}
