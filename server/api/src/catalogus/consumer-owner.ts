import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const owners = new Map<string, { count: number; token: string }>();

/** One owning consumer process per checked fixture root. Never searches or kills processes. */
export function ownCatalogConsumer(root: string): () => void {
  const file = join(root, '.catalog-consumer-owner.json');
  const held = owners.get(root);
  if (held) held.count++;
  else {
    // Serialize stale-owner reclamation. A crash while holding this tiny acquisition
    // directory fails closed and needs operator inspection; never steal a live lock.
    const acquiring = join(root, '.catalog-consumer-acquiring');
    mkdirSync(acquiring);
    try {
      if (existsSync(file)) {
        if (lstatSync(file).isSymbolicLink()) throw new Error('Unsafe catalog consumer owner file');
        const previous = JSON.parse(readFileSync(file, 'utf8')) as { pid: number; token: string };
        if (!Number.isSafeInteger(previous.pid) || previous.pid < 1) throw new Error('Invalid catalog consumer owner file');
        let alive = true;
        try { process.kill(previous.pid, 0); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; else throw error; }
        if (alive) throw new Error('Catalog consumer is owned by another process or runtime');
        // Only this fixed owner file under the already checked temporary fixture is removed.
        unlinkSync(file);
      }
      const token = randomUUID();
      writeFileSync(file, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', flush: true });
      owners.set(root, { count: 1, token });
    } finally { rmdirSync(acquiring); }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const owner = owners.get(root)!;
    if (--owner.count > 0) return;
    if (existsSync(file) && !lstatSync(file).isSymbolicLink()) {
      const current = JSON.parse(readFileSync(file, 'utf8')) as { pid: number; token: string };
      if (current.pid === process.pid && current.token === owner.token) unlinkSync(file);
    }
    owners.delete(root);
  };
}
