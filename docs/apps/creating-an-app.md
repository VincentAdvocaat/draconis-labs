# Creating a new Draconis app

1. Copy `templates/app` to `apps/<your-app-id>/`.
2. Replace `{{appId}}` and `{{AppName}}` placeholders in `package.json`, `index.html`, and `src/App.tsx`.
3. Update `manifest.json` with your app metadata (validated by `applicationManifestSchema`).
4. Register the app in the Draconis catalog when the homescreen epic (E8) lands.
5. Add the app to the pnpm workspace (`apps/*` already covers new folders).
6. Scaffold an API module via `server/api/templates/module/` if the app needs backend routes.

The template intentionally has **no** Planner dependencies.
