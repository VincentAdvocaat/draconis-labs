import type { ApiModule } from './module.js';

let registeredModules: ApiModule[] = [];

export function setRegisteredModules(modules: ApiModule[]) {
  registeredModules = modules;
}

export function getRegisteredModules(): ApiModule[] {
  return registeredModules;
}

export function moduleCatalog() {
  return registeredModules.map((mod) => ({
    name: mod.name,
    prefix: `/api/v1${mod.prefix}`,
    description: mod.description ?? '',
  }));
}
