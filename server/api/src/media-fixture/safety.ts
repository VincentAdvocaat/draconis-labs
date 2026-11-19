import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export function assertFixtureRoot(root: string) {
  const resolved = resolve(root);
  const temp = realpathSync(tmpdir());
  if (lstatSync(resolved).isSymbolicLink() || dirname(realpathSync(resolved)) !== temp ||
      !basename(resolved).startsWith('draconis-media-fixture-') ||
      !existsSync(join(resolved, '.media-fixture')) || lstatSync(join(resolved, '.media-fixture')).isSymbolicLink())
    throw new Error('Only an explicit temporary media fixture directory is allowed');
  const database = join(resolved, 'media.sqlite');
  if (existsSync(database) && lstatSync(database).isSymbolicLink())
    throw new Error('Fixture database cannot be a symlink');
  return realpathSync(resolved);
}
