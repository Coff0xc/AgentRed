export interface ApiStartupConfig {
  databasePath: string;
  port: number;
  authToken: string;
  approvalTtlMs: number;
}

export function resolveApiStartupConfig(env: Record<string, string | undefined>): ApiStartupConfig {
  const authToken = env.PLATFORM_API_TOKEN?.trim();
  if (!authToken) {
    throw new Error('PLATFORM_API_TOKEN is required. Generate it outside the process and keep it out of logs.');
  }
  return {
    databasePath: env.PLATFORM_DB_PATH ?? '.local/platform.db',
    port: parsePort(env.PORT),
    authToken,
    approvalTtlMs: parseApprovalTtlMs(env.PLATFORM_APPROVAL_TTL_MINUTES),
  };
}

function parsePort(input: string | undefined): number {
  if (!input?.trim()) {
    return 4317;
  }
  const port = Number(input);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseApprovalTtlMs(input: string | undefined): number {
  if (!input?.trim()) {
    return 15 * 60 * 1000;
  }
  const minutes = Number(input);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new Error('PLATFORM_APPROVAL_TTL_MINUTES must be an integer between 1 and 1440.');
  }
  return minutes * 60 * 1000;
}
