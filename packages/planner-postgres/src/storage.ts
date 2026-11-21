import type { AsyncPlannerStorage, AsyncPlannerTransaction, TaskCreationReceiptKey } from '@draconis/planner-core';
import { plannerDataHash } from '@draconis/planner-sqlite';
import { DEFAULT_PREFERENCES } from '@draconis/shared';
import { and, asc, count, desc, eq, max, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import { preferences, receipts, tasks, toTask } from './schema.js';
import { historyFilter, taskFilters } from './task-filters.js';
import { requireWorkspace, transaction } from './transaction.js';

function loadPreferences(client: PoolClient, workspaceId: string) {
  return drizzle(client).select({ value: preferences.preferences }).from(preferences)
    .where(and(eq(preferences.workspaceId, workspaceId), eq(preferences.id, 'default')))
    .then(([row]) => row ? { ...DEFAULT_PREFERENCES, ...row.value } : DEFAULT_PREFERENCES);
}

function taskWrites(client: PoolClient, workspaceId: string): AsyncPlannerTransaction {
  const db = drizzle(client);
  const scoped = eq(tasks.workspaceId, workspaceId);
  const identified = (id: string) => and(scoped, eq(tasks.id, id));
  function checkReceiptWorkspace(key: TaskCreationReceiptKey) {
    if (key.workspaceId !== workspaceId) throw new Error('De opdrachtsleutel hoort bij een andere werkruimte.');
  }
  return {
    async find(id) {
      const [row] = await db.select().from(tasks).where(identified(id));
      return row && toTask(row);
    },
    async lane(lane) {
      const rows = await db.select().from(tasks).where(and(scoped, eq(tasks.lane, lane)))
        .orderBy(asc(tasks.position), asc(tasks.id));
      return rows.map(toTask);
    },
    async maxTodoPosition() {
      const [{ position }] = await db.select({ position: max(tasks.position) }).from(tasks)
        .where(and(scoped, eq(tasks.lane, 'todo')));
      return position ?? 0;
    },
    async insert(task) {
      await db.insert(tasks).values({ ...task, workspaceId });
    },
    async update(id, task) {
      await db.update(tasks).set(task).where(identified(id));
    },
    async remove(id) {
      const result = await db.delete(tasks).where(identified(id));
      return Boolean(result.rowCount);
    },
    async findTaskCreation(key, input) {
      checkReceiptWorkspace(key);
      const [row] = await db.select().from(receipts).where(and(eq(receipts.workspaceId, workspaceId),
        eq(receipts.actor, key.actor), eq(receipts.key, key.key)));
      return row && { matches: row.hash === plannerDataHash(input), task: row.result };
    },
    async saveTaskCreation(key, input, task) {
      checkReceiptWorkspace(key);
      await db.insert(receipts).values({ workspaceId, actor: key.actor, key: key.key, hash: plannerDataHash(input), result: task });
    },
    loadPreferences: () => loadPreferences(client, workspaceId),
    async savePreferences(value, now) {
      await db.insert(preferences).values({ workspaceId, id: 'default', preferences: value, updatedAt: now })
        .onConflictDoUpdate({ target: [preferences.workspaceId, preferences.id], set: { preferences: value, updatedAt: now } });
      return value;
    },
  };
}

export function createPostgresPlannerStorage(pool: Pool, workspaceId: string, connection?: PoolClient): AsyncPlannerStorage {
  const scoped = eq(tasks.workspaceId, workspaceId);
  const boardOrder = [asc(tasks.lane), asc(tasks.position), asc(tasks.id)];
  const read = <T>(operation: (client: PoolClient) => Promise<T>) => {
    const run = async (client: PoolClient) => {
      await requireWorkspace(client, workspaceId);
      return operation(client);
    };
    return connection ? run(connection) : transaction(pool, run, true);
  };

  function page(filter: SQL | undefined, order: SQL[], page?: number, pageSize = 50) {
    const where = and(scoped, filter);
    return read(async client => {
      const db = drizzle(client);
      const rows = db.select().from(tasks).where(where).orderBy(...order);
      if (!page) return (await rows).map(toTask);
      const [{ total }] = await db.select({ total: count() }).from(tasks).where(where);
      const items = (await rows.limit(pageSize).offset((page - 1) * pageSize)).map(toTask);
      return { items, total, page, pageSize };
    });
  }

  return {
    transaction(operation) {
      const run = async (client: PoolClient) => {
        // Serialize every write for this workspace before the first task/receipt read.
        await requireWorkspace(client, workspaceId, true);
        return operation(taskWrites(client, workspaceId));
      };
      return connection ? run(connection) : transaction(pool, run);
    },
    list: query => page(taskFilters(query), boardOrder, query.page, query.pageSize),
    listByCursor({ filters, after, limit, now }) {
      const boundary = after && sql`(${tasks.lane}, ${tasks.position}, ${tasks.id}) > (${after.lane}, ${after.position}, ${after.id})`;
      return read(async client => {
        const rows = await drizzle(client).select().from(tasks)
          .where(and(scoped, taskFilters(filters, now), boundary)).orderBy(...boardOrder).limit(limit);
        return rows.map(toTask);
      });
    },
    history: query => page(historyFilter(query.from), [desc(tasks.completedAt), asc(tasks.id)], query.page, query.pageSize),
    loadPreferences: () => read(client => loadPreferences(client, workspaceId)),
  };
}
