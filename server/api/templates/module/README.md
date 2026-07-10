# API module template

Copy this folder to `server/api/src/modules/<name>/` when adding a new Draconis app module.

## Checklist

1. Implement `routes.ts` with paths relative to your module prefix (no `/api/v1`).
2. Keep persistence in `repository.ts` and business rules in `service.ts`.
3. Export an `ApiModule` from `index.ts`.
4. Register the module in `server/api/src/core/index.ts` (`apiModules` array).
5. Do **not** import other modules — only `core/*` and `@draconis/shared`.

## Example

```ts
import type { ApiModule } from '../../core/module.js';
import type { FastifyInstance } from 'fastify';

async function registerExampleRoutes(app: FastifyInstance) {
  app.get('/hello', async () => ({ message: 'hello' }));
}

export const exampleModule: ApiModule = {
  name: 'example',
  prefix: '/example',
  description: 'Example module',
  register: registerExampleRoutes,
};
```
