import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAgentCredentials, type AgentCredentials } from '../src/core/agent-credentials.js';
import { listPlannerActivity } from '../src/core/planner-audit.js';
import { plannerSchemaUri } from '../src/planner-mcp.js';

describe('Planner MCP stdio adapter', () => {
  let fixture: string;
  let db: Database.Database;
  let credentials: AgentCredentials;
  let databasePath: string;
  let identityPath: string;

  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), 'draconis-planner-mcp-'));
    databasePath = join(fixture, 'planner.sqlite');
    identityPath = join(fixture, 'identity.json');
    writeFileSync(identityPath, JSON.stringify({
      ownerId: 'mcp-fixture-owner', members: [],
      sessions: [{ userId: 'mcp-fixture-owner', tokenHash: 'a'.repeat(64), expiresAt: '2026-04-02T13:00:00Z' }],
    }));
    db = new Database(databasePath);
    credentials = createAgentCredentials(db);
  });

  afterAll(() => {
    db?.close();
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  });

  async function connect(name: string, scopes: string[]) {
    const { token, credential } = credentials.create(
      { name, scopes }, new Date(Date.now() + 120_000).toISOString(),
    );
    const client = new Client({ name: 'planner-mcp-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/mcp.ts'],
      cwd: process.cwd(),
      env: {
        DRACONIS_LOCAL_IDENTITY_FILE: identityPath,
        DATABASE_PATH: databasePath,
        DRACONIS_MCP_AGENT_TOKEN: token,
      },
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', chunk => { stderr += chunk; });
    try {
      await client.connect(transport);
    } catch (error) {
      await transport.close();
      throw new Error(stderr || String(error));
    }
    return { client, credential, readStderr: () => stderr, token };
  }

  it('discovers standards-based tools, reads schema and calls the REST-backed Planner operations', async () => {
    const { client, readStderr, token } = await connect('mcp-writer', ['tasks:read', 'tasks:create', 'tasks:update']);
    try {
      const listed = await client.listTools();
      expect(listed.tools.map(tool => tool.name).sort()).toEqual([
        'complete_task', 'create_task', 'list_tasks', 'schedule_task', 'update_task',
      ]);
      const createTool = listed.tools.find(tool => tool.name === 'create_task');
      expect(createTool?.inputSchema).toMatchObject({ required: ['input', 'idempotencyKey'] });
      expect((await client.listResources()).resources).toContainEqual(expect.objectContaining({ uri: plannerSchemaUri }));
      const resource = await client.readResource({ uri: plannerSchemaUri });
      expect(resource.contents[0]).toMatchObject({ mimeType: 'application/json' });
      const spec = JSON.parse((resource.contents[0] as { text: string }).text);
      expect(spec.paths['/api/v1/workspaces/{workspaceId}/tasks'].post.security).toEqual([{ bearerAuth: [] }]);
      const createArgs = { input: { title: 'MCP synthetic task' }, idempotencyKey: 'mcp-task-fixture' };
      const started = await client.callTool({ name: 'create_task', arguments: createArgs });
      expect(started.structuredContent).toMatchObject({ ok: true, value: { createdBy: 'mcp-writer', version: 1 } });
      const task = (started.structuredContent as { value: { id: string } }).value;
      const retry = await client.callTool({ name: 'create_task', arguments: createArgs });
      expect(retry.structuredContent).toEqual(started.structuredContent);
      expect(retry.content).toEqual(started.content);

      const edited = await client.callTool({ name: 'update_task', arguments: {
        id: task.id, input: { title: 'Updated MCP synthetic task', version: 1 },
      } });
      expect(edited.structuredContent).toMatchObject({ ok: true, value: { version: 2, title: 'Updated MCP synthetic task' } });
      const scheduled = await client.callTool({ name: 'schedule_task', arguments: {
        id: task.id, version: 2, plannedDate: '2026-11-24',
      } });
      expect(scheduled.structuredContent).toMatchObject({ ok: true, value: { version: 3, plannedDate: '2026-11-24' } });
      const done = await client.callTool({ name: 'complete_task', arguments: { id: task.id, version: 3 } });
      expect(done.structuredContent).toMatchObject({ ok: true, value: { version: 4, lane: 'done' } });
      const stale = await client.callTool({ name: 'complete_task', arguments: { id: task.id, version: 3 } });
      expect(stale).toMatchObject({ isError: true, structuredContent: { error: { code: 'VERSION_CONFLICT', status: 409 } } });

      const page = await client.callTool({ name: 'list_tasks', arguments: { lane: 'done', pageSize: 1 } });
      expect(page.structuredContent).toMatchObject({ ok: true, value: { page: 1, pageSize: 1, items: [{ id: task.id }] } });
      const wrongWorkspace = await client.callTool({ name: 'list_tasks', arguments: { workspaceId: 'elsewhere' } });
      expect(wrongWorkspace.isError).toBe(true);
      expect(listPlannerActivity(db, { actor: 'mcp-writer' })).toContainEqual(expect.objectContaining({
        client: 'mcp', operation: 'tasks.update', targetId: task.id, status: 200,
      }));
      expect(readStderr()).not.toContain(token);
    } finally {
      await client.close();
    }
  }, 60000);

  it('applies the agent scope and observes revocation while the same connection is open', async () => {
    const { client, credential } = await connect('mcp-reader', ['tasks:read']);
    try {
      expect((await client.callTool({ name: 'list_tasks', arguments: {} })).structuredContent).toMatchObject({ ok: true });
      const denied = await client.callTool({ name: 'create_task', arguments: {
        input: { title: 'Forbidden synthetic task' }, idempotencyKey: 'mcp-denied',
      } });
      expect(denied).toMatchObject({ isError: true, structuredContent: { error: { code: 'FORBIDDEN', status: 403 } } });
      expect(credentials.revokePrincipal(credential.principalId)).toEqual({
        principalId: credential.principalId, revokedCredentials: 1,
      });
      const revoked = await client.callTool({ name: 'list_tasks', arguments: {} });
      expect(revoked).toMatchObject({ isError: true, structuredContent: { error: { code: 'UNAUTHORIZED', status: 401 } } });
      await expect(client.readResource({ uri: plannerSchemaUri })).rejects.toThrow();
    } finally {
      await client.close();
    }
  }, 60000);
});
