import { resolveApiStartupConfig } from './api/startup-config.js';
import { startApiServer } from './api/server.js';
import { createPlatform } from './platform.js';

const config = resolveApiStartupConfig(process.env);

const platform = createPlatform({ databasePath: config.databasePath });
const api = await startApiServer(platform, {
  port: config.port,
  authToken: config.authToken,
  enableWebSocket: true,
});

// Connect WebSocket server to RunEventService for real-time broadcasting
if (api.wsServer) {
  (platform.events as any).wsServer = api.wsServer;
}

console.log(`AgentRed API listening on ${api.url}`);
console.log('Local API token loaded from PLATFORM_API_TOKEN (value hidden).');
if (api.wsServer) {
  console.log('WebSocket real-time push enabled at /ws/progress');
}
