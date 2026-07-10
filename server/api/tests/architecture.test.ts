import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulesRoot = join(apiRoot, 'src', 'modules');

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(fullPath);
  }
  return files;
}

function moduleNameFromPath(filePath: string) {
  const rel = relative(modulesRoot, filePath);
  return rel.split(/[\\/]/)[0];
}

describe('module architecture', () => {
  const files = listSourceFiles(modulesRoot);

  it('modules do not import sibling modules', () => {
    const violations: string[] = [];
    for (const file of files) {
      const owner = moduleNameFromPath(file);
      const source = readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/from ['"](.+?)['"]/g)].map((match) => match[1]);
      for (const imp of imports) {
        if (imp.includes(`/modules/`) && !imp.includes(`/modules/${owner}/`)) {
          violations.push(`${relative(apiRoot, file)} imports ${imp}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('system module does not import planner code', () => {
    const systemFiles = files.filter((file) => moduleNameFromPath(file) === 'system');
    const combined = systemFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(combined).not.toMatch(/modules\/planner/);
    expect(combined).not.toMatch(/from ['"].*\/planner/);
  });
});
