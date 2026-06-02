import { randomBytes } from 'node:crypto';

import { startApiServer } from './api/server.js';
import { createPlatform } from './platform.js';

const databasePath = process.env.PLATFORM_DB_PATH ?? '.local/platform.db';
const port = Number(process.env.PORT ?? 4317);
const authToken = process.env.PLATFORM_API_TOKEN ?? randomBytes(24).toString('hex');

const platform = createPlatform({ databasePath });
const api = await startApiServer(platform, { port, authToken });

console.log(`AgentRed API listening on ${api.url}`);
console.log(`Local API token: ${authToken}`);
