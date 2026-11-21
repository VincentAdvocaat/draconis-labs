import { existsSync } from 'node:fs';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createAgentCredentials, isAgentCredential } from './core/agent-credentials.js';
import { authorizeScopedAgent } from './core/local-identity.js';
import { createPlannerMcp } from './planner-mcp.js';

const databasePath = process.env.DATABASE_PATH;
const identityFile = process.env.DRACONIS_LOCAL_IDENTITY_FILE;
const token = process.env.DRACONIS_MCP_AGENT_TOKEN;
if (!databasePath || !existsSync(databasePath) || !identityFile || !existsSync(identityFile)) {
  throw new Error('Gebruik de bestaande database en configuratie van het lokale testidentiteitsprofiel.');
}
if (!token || !isAgentCredential(token)) throw new Error('DRACONIS_MCP_AGENT_TOKEN vereist een lokale agentcredential.');

const { sqlite } = await import('./core/db.js');
const { buildApp } = await import('./core/index.js');
const app = await buildApp(authorizeScopedAgent(createAgentCredentials(sqlite)), 'mcp');
process.once('beforeExit', async () => {
  await app.close();
  sqlite.close();
});
serveStdio(() => createPlannerMcp(app, token));
