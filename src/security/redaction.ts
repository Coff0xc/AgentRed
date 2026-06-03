const SENSITIVE_NAME_PATTERN = /authorization|cookie|token|secret|key|password|passwd|session|jwt/i;
const SENSITIVE_VALUE_PATTERN = /access[_-]?token|api[_-]?key|authorization|password|passwd|secret|session|jwt|token/i;

export function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  return redactObject(args);
}

export function redactObject(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = redactValue(key, value);
  }
  return result;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = isSensitiveName(key) ? '[redacted]' : redactText(value);
  }
  return redacted;
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (isSensitiveName(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    return redactText(value);
  }
}

export function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(
      /(["']?(?:access[_-]?token|api[_-]?key|authorization|password|passwd|secret|session|jwt|token)["']?\s*:\s*)(["'])([^"']+)\2/gi,
      '$1$2[redacted]$2',
    )
    .replace(
      /((?:access[_-]?token|api[_-]?key|authorization|password|passwd|secret|session|jwt|token)\s*[:=]\s*)(["']?)[^"',\s&}]+/gi,
      '$1$2[redacted]',
    );
}

export function isSensitiveName(name: string): boolean {
  return SENSITIVE_NAME_PATTERN.test(name);
}

export function redactScopePolicy<T extends { r4AuthorizationToken?: string }>(policy: T): T {
  if (!policy.r4AuthorizationToken) {
    return { ...policy };
  }
  return { ...policy, r4AuthorizationToken: '[redacted]' };
}

export function redactRun<T extends { scopePolicy: { r4AuthorizationToken?: string } }>(run: T): T {
  return { ...run, scopePolicy: redactScopePolicy(run.scopePolicy) };
}

function redactValue(key: string, value: unknown): unknown {
  if (isSensitiveName(key)) {
    return '[redacted]';
  }
  if (typeof value === 'string') {
    return SENSITIVE_VALUE_PATTERN.test(key) ? '[redacted]' : redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(key, item));
  }
  if (value && typeof value === 'object') {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}
