# Creating a new Draconis app

Owner: Draconis Labs. Last reviewed on 21 November 2026.

1. Copy `templates/app` to `apps/<your-app-id>/`.
2. Replace `{{appId}}` and `{{AppName}}` placeholders in `package.json`, `index.html`, and `src/App.tsx`.
3. Update `manifest.json` with the app ID, owner, launch and health URLs, environment URLs, permissions and custom icon URL when available. Use absolute HTTP or HTTPS URLs without credentials. A local app can use its root URL for a reachability check.
4. Set the development port in `vite.config.ts` to the port in the local launch URL.
5. Run `corepack pnpm install`, then `corepack pnpm --filter @draconis/shared test`. The shared tests validate the template and all `apps/*/manifest.json` files and reject duplicate app IDs and environment names. The repository test command runs the same checks.
6. Run `corepack pnpm --filter @draconis/<your-app-id> build` to typecheck and build the copied app. Start it with `corepack pnpm --filter @draconis/<your-app-id> dev` and open its launch URL.
7. Request review from the owner named in the manifest when opening a pull request for a registration change.
8. Scaffold an API module via `server/api/templates/module/` if the app needs backend routes. The pnpm workspace includes `apps/*`.

The [local app catalog](lokale-appcatalogus.md) reads these registrations on startup.

Set the launcher origin as described in [local navigation](lokale-navigatie.md) if the app participates in the local launcher.

The template intentionally has **no** Planner dependencies.
