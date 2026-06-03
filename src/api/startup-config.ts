export interface ApiStartupConfig {
  databasePath: string;
  port: number;
  authToken: string;
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
