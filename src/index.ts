import { resolveApiStartupConfig } from './api/startup-config.js';
import { startApiServer } from './api/server.js';
import { createPlatform } from './platform.js';

const config = resolveApiStartupConfig(process.env);

const platform = createPlatform({ databasePath: config.databasePath });
const api = await startApiServer(platform, { port: config.port, authToken: config.authToken });

console.log(`AgentRed API listening on ${api.url}`);
console.log('Local API token loaded from PLATFORM_API_TOKEN (value hidden).');
