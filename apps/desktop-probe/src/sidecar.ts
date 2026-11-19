import { createInterface } from 'node:readline';
import { openProbeStore } from './store.js';

// Node sidecar protocol rehearsal only; a Tauri bundle still needs Rust/MSVC.
const path = process.argv[2];
if (!path) throw new Error('Pass a disposable probe database path');
const store = openProbeStore(path);
const lines = createInterface({ input: process.stdin });
lines.on('line', line => {
  try {
    const command = JSON.parse(line);
    if (command.type === 'list') process.stdout.write(`${JSON.stringify({ tasks: store.list() })}\n`);
    else if (command.type === 'create') process.stdout.write(`${JSON.stringify({ task: store.create(command.input) })}\n`);
    else throw new Error('Unknown command');
  } catch { process.stdout.write(`${JSON.stringify({ error: 'INVALID_COMMAND' })}\n`); }
});
lines.on('close', () => store.close());
process.on('SIGTERM', () => { store.close(); process.exit(0); });
