import { text, sqliteTable } from 'drizzle-orm/sqlite-core';

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  keyHash: text('key_hash').notNull().unique(),
  createdAt: text('created_at').notNull(),
});
