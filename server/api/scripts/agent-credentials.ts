import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { createAgentCredentials } from '../src/core/agent-credentials.js';

function main() {
  const databasePath = process.env.DATABASE_PATH;
  if (!databasePath || !existsSync(databasePath) || !process.env.DRACONIS_LOCAL_IDENTITY_FILE) {
    throw new Error('Gebruik DATABASE_PATH en DRACONIS_LOCAL_IDENTITY_FILE van de actieve lokale test-API.');
  }
  const { positionals: [command], values } = parseArgs({
    allowPositionals: true,
    options: {
      id: { type: 'string' },
      'principal-id': { type: 'string' },
      name: { type: 'string' },
      scope: { type: 'string', multiple: true },
      expires: { type: 'string' },
      'overlap-seconds': { type: 'string' },
    },
  });
  const db = new Database(databasePath, { fileMustExist: true });
  try {
    const store = createAgentCredentials(db);
    switch (command) {
      case 'create':
        return store.create({ name: values.name, scopes: values.scope }, values.expires);
      case 'rotate':
        if (!values.id) throw new Error('Geef --id op.');
        return store.rotate(values.id, values.expires, Number(values['overlap-seconds'] ?? '0'));
      case 'revoke':
        if (!values.id) throw new Error('Geef --id op.');
        return store.revoke(values.id);
      case 'revoke-principal':
        if (!values['principal-id']) throw new Error('Geef --principal-id op.');
        return store.revokePrincipal(values['principal-id']);
      case 'list':
        return store.list();
      default:
        throw new Error('Gebruik create, rotate, revoke, revoke-principal of list.');
    }
  } finally {
    db.close();
  }
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Credentialbeheer mislukt.');
  process.exitCode = 1;
}
