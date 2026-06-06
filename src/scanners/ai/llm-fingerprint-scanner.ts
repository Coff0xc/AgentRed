import type { RiskLevel } from '../../domain/types.js';

/**
 * LLM Endpoint Fingerprint Scanner
 *
 * Detects and identifies LLM API endpoints, model versions, and security configurations.
 * Template: ai.llm_endpoint_fingerprint
 * Risk Level: R1 (passive reconnaissance)
 */

export interface LlmFingerprintProbe {
  id: string;
  name: string;
  description: string;
  riskLevel: RiskLevel;
  method: 'GET' | 'POST' | 'OPTIONS';
  path: string;
  headers?: Record<string, string>;
  body?: string;
  expectedSignals: LlmProviderSignal[];
}

export interface LlmProviderSignal {
  provider: LlmProvider;
  indicators: {
    headerPattern?: string;
    bodyPattern?: string;
    statusCode?: number;
    errorMessagePattern?: string;
  };
  confidence: 'high' | 'medium' | 'low';
}

export type LlmProvider =
  | 'openai'
  | 'anthropic'
  | 'azure_openai'
  | 'google_vertex'
  | 'aws_bedrock'
  | 'cohere'
  | 'huggingface'
  | 'ollama'
  | 'vllm'
  | 'tgi'
  | 'unknown';

export interface LlmFingerprintResult {
  target: string;
  provider: LlmProvider;
  confidence: 'high' | 'medium' | 'low';
  modelVersion?: string;
  authMethod?: LlmAuthMethod;
  rateLimitConfig?: RateLimitConfig;
  contentPolicyEnabled?: boolean;
  capabilities?: string[];
  tlsVersion?: string;
  serverHeaders?: Record<string, string>;
  evidenceSummary: Record<string, unknown>;
}

export type LlmAuthMethod =
  | 'bearer_token'
  | 'api_key_header'
  | 'api_key_query'
  | 'oauth2'
  | 'mtls'
  | 'none'
  | 'unknown';

export interface RateLimitConfig {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  headersDetected: string[];
}

/**
 * LLM Fingerprint Probes
 *
 * These probes are R1 (safe HTTP requests) designed to identify LLM endpoints
 * without triggering security alerts or consuming significant resources.
 */
export const LLM_FINGERPRINT_PROBES: LlmFingerprintProbe[] = [
  {
    id: 'openai-chat-completions',
    name: 'OpenAI Chat Completions Endpoint',
    description: 'Detects OpenAI-compatible /v1/chat/completions endpoint',
    riskLevel: 'R1',
    method: 'POST',
    path: '/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1,
    }),
    expectedSignals: [
      {
        provider: 'openai',
        indicators: {
          headerPattern: 'openai-',
          statusCode: 401,
          errorMessagePattern: 'invalid_api_key|authentication',
        },
        confidence: 'high',
      },
      {
        provider: 'azure_openai',
        indicators: {
          headerPattern: 'x-ms-',
          statusCode: 401,
          errorMessagePattern: 'azure|subscription',
        },
        confidence: 'high',
      },
    ],
  },
  {
    id: 'anthropic-messages',
    name: 'Anthropic Messages Endpoint',
    description: 'Detects Anthropic Claude API /v1/messages endpoint',
    riskLevel: 'R1',
    method: 'POST',
    path: '/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1,
    }),
    expectedSignals: [
      {
        provider: 'anthropic',
        indicators: {
          headerPattern: 'anthropic-',
          statusCode: 401,
          errorMessagePattern: 'authentication_error|invalid_api_key',
        },
        confidence: 'high',
      },
    ],
  },
  {
    id: 'ollama-api',
    name: 'Ollama Local LLM API',
    description: 'Detects Ollama self-hosted LLM endpoint',
    riskLevel: 'R1',
    method: 'GET',
    path: '/api/tags',
    expectedSignals: [
      {
        provider: 'ollama',
        indicators: {
          statusCode: 200,
          bodyPattern: '"models":\\s*\\[',
        },
        confidence: 'high',
      },
    ],
  },
  {
    id: 'vllm-openai-compat',
    name: 'vLLM OpenAI-Compatible Endpoint',
    description: 'Detects vLLM self-hosted inference server',
    riskLevel: 'R1',
    method: 'GET',
    path: '/v1/models',
    expectedSignals: [
      {
        provider: 'vllm',
        indicators: {
          statusCode: 200,
          bodyPattern: '"object":\\s*"list"',
          headerPattern: 'vllm',
        },
        confidence: 'high',
      },
    ],
  },
  {
    id: 'huggingface-inference',
    name: 'HuggingFace Inference API',
    description: 'Detects HuggingFace hosted inference endpoint',
    riskLevel: 'R1',
    method: 'OPTIONS',
    path: '/models',
    expectedSignals: [
      {
        provider: 'huggingface',
        indicators: {
          headerPattern: 'huggingface|hf-',
          statusCode: 200,
        },
        confidence: 'medium',
      },
    ],
  },
  {
    id: 'aws-bedrock',
    name: 'AWS Bedrock Runtime',
    description: 'Detects AWS Bedrock LLM endpoint',
    riskLevel: 'R1',
    method: 'POST',
    path: '/model/anthropic.claude-v2/invoke',
    headers: {
      'Content-Type': 'application/json',
    },
    expectedSignals: [
      {
        provider: 'aws_bedrock',
        indicators: {
          headerPattern: 'x-amzn-|x-amz-',
          statusCode: 403,
          errorMessagePattern: 'AccessDeniedException|UnrecognizedClientException',
        },
        confidence: 'high',
      },
    ],
  },
  {
    id: 'tgi-health',
    name: 'Text Generation Inference Health Check',
    description: 'Detects HuggingFace TGI (Text Generation Inference) server',
    riskLevel: 'R1',
    method: 'GET',
    path: '/health',
    expectedSignals: [
      {
        provider: 'tgi',
        indicators: {
          statusCode: 200,
          bodyPattern: '"model_id"|"version"',
        },
        confidence: 'high',
      },
    ],
  },
];

/**
 * Parse LLM fingerprint results from HTTP response
 */
export function parseLlmFingerprintResponse(
  probe: LlmFingerprintProbe,
  response: {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  },
): LlmFingerprintResult | null {
  for (const signal of probe.expectedSignals) {
    let matches = 0;
    let total = 0;

    // Check status code
    if (signal.indicators.statusCode !== undefined) {
      total++;
      if (response.statusCode === signal.indicators.statusCode) {
        matches++;
      }
    }

    // Check header patterns
    if (signal.indicators.headerPattern) {
      total++;
      const headerPattern = new RegExp(signal.indicators.headerPattern, 'i');
      const matchingHeaders = Object.keys(response.headers).filter((key) =>
        headerPattern.test(key),
      );
      if (matchingHeaders.length > 0) {
        matches++;
      }
    }

    // Check body patterns
    if (signal.indicators.bodyPattern) {
      total++;
      const bodyPattern = new RegExp(signal.indicators.bodyPattern, 'i');
      if (bodyPattern.test(response.body)) {
        matches++;
      }
    }

    // Check error message patterns
    if (signal.indicators.errorMessagePattern) {
      total++;
      const errorPattern = new RegExp(signal.indicators.errorMessagePattern, 'i');
      if (errorPattern.test(response.body)) {
        matches++;
      }
    }

    // If enough indicators match, return result
    if (total > 0 && matches >= Math.ceil(total * 0.7)) {
      return {
        target: '',
        provider: signal.provider,
        confidence: signal.confidence,
        authMethod: detectAuthMethod(response),
        rateLimitConfig: detectRateLimitConfig(response.headers),
        contentPolicyEnabled: detectContentPolicy(response),
        serverHeaders: response.headers,
        evidenceSummary: {
          probeId: probe.id,
          statusCode: response.statusCode,
          matchedSignals: matches,
          totalSignals: total,
        },
      };
    }
  }

  return null;
}

function detectAuthMethod(response: {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}): LlmAuthMethod {
  const authHeader = response.headers['www-authenticate'] || response.headers['authorization'];

  if (authHeader?.toLowerCase().includes('bearer')) {
    return 'bearer_token';
  }

  if (response.body.includes('api_key') || response.body.includes('apikey')) {
    return 'api_key_header';
  }

  if (response.body.includes('oauth') || authHeader?.toLowerCase().includes('oauth')) {
    return 'oauth2';
  }

  if (response.statusCode === 401 || response.statusCode === 403) {
    return 'unknown';
  }

  return 'none';
}

function detectRateLimitConfig(headers: Record<string, string>): RateLimitConfig | undefined {
  const rateLimitHeaders = Object.keys(headers).filter((key) =>
    /rate-?limit|x-ratelimit/i.test(key),
  );

  if (rateLimitHeaders.length === 0) {
    return undefined;
  }

  const config: RateLimitConfig = {
    headersDetected: rateLimitHeaders,
  };

  // Parse common rate limit headers
  const requestsHeader = headers['x-ratelimit-limit-requests'] || headers['x-rate-limit-limit'];
  const tokensHeader = headers['x-ratelimit-limit-tokens'];

  if (requestsHeader) {
    const requests = parseInt(requestsHeader, 10);
    if (!isNaN(requests)) {
      config.requestsPerMinute = requests;
    }
  }

  if (tokensHeader) {
    const tokens = parseInt(tokensHeader, 10);
    if (!isNaN(tokens)) {
      config.tokensPerMinute = tokens;
    }
  }

  return config;
}

function detectContentPolicy(response: { statusCode: number; body: string }): boolean {
  // Content policy is typically indicated by specific error codes or messages
  const policyPatterns = [
    'content_policy',
    'safety_filter',
    'content_filter',
    'moderation',
    'inappropriate_content',
  ];

  return policyPatterns.some((pattern) => response.body.toLowerCase().includes(pattern));
}

/**
 * Extract model version from response
 */
export function extractModelVersion(response: { headers: Record<string, string>; body: string }): string | undefined {
  // Check headers first
  const modelHeader = response.headers['openai-model'] || response.headers['x-model-id'];
  if (modelHeader) {
    return modelHeader;
  }

  // Try to parse from body
  try {
    const bodyObj = JSON.parse(response.body);
    return bodyObj.model || bodyObj.model_id || bodyObj.model_version;
  } catch {
    // Not JSON or no model field
  }

  // Try regex patterns for common model naming
  const modelPatterns = [
    /gpt-[34]\.?5?-?\w+/i,
    /claude-[123]-\w+/i,
    /gemini-\w+/i,
    /llama-?[23]-\w+/i,
  ];

  for (const pattern of modelPatterns) {
    const match = pattern.exec(response.body);
    if (match) {
      return match[0];
    }
  }

  return undefined;
}
