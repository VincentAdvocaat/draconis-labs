import type { ApiModule } from './module.js';

export function moduleCatalog(modules: ApiModule[]) {
  return modules.map((mod) => ({
    name: mod.name,
    prefix: `/api/v1${mod.prefix}`,
    description: mod.description ?? '',
  }));
}
