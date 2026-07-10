# Draconis Labs

Een uitbreidbaar app-platform. De eerste app is Planner: een dagelijks
kanban-board dat mensen en AI-agents via dezelfde HTTP-API kunnen gebruiken.

## Projectindeling

```text
apps/planner      React + Vite planner
server/api        Fastify API en SQLite-database
packages/shared   Gedeelde TypeScript-contracten
```

De onderdelen zijn onafhankelijk bouwbaar en deploybaar, maar delen één
workspace voor consistente contracten en eenvoudige lokale ontwikkeling.

## Lokaal starten

Vereisten: Node.js 22+ en pnpm (via Corepack of globale installatie).

```powershell
corepack pnpm install
corepack pnpm start
```

Of via je terminal-alias (zie hieronder):

```powershell
drstart
```

- Planner: http://localhost:5173
- API: http://localhost:3001
- Healthcheck: http://localhost:3001/health

### Dev CLI (terminal-commando's)

Je PowerShell-profiel laadt `C:\git\development.ps1`. Dat registreert
herbruikbare commando's uit `scripts/dev-cli/commands/`.

```powershell
drstart     # start API + Planner
sql start   # voorbeeld/template — pas sql.ps1 aan
devhelp     # toon alle commando's
```

Nieuw commando toevoegen: maak `scripts/dev-cli/commands/<naam>.ps1` en
gebruik `Register-DevCommand` of `Register-DevCommandGroup`.

De ontwikkelomgeving maakt automatisch een lokale API-key
`dev-agent-key` aan met agentnaam `local-agent`. Stel voor ander gebruik
`DRACONIS_API_KEYS` in, bijvoorbeeld:

```powershell
$env:DRACONIS_API_KEYS="cursor-agent:een-lange-willekeurige-sleutel"
corepack pnpm dev
```

SQLite-data staat standaard in `server/api/data/planner.db` en wordt niet
ingecheckt.

## Handige opdrachten

```powershell
corepack pnpm start
corepack pnpm build
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm dev:api
corepack pnpm dev:planner
```

## Planner

- Sleep kaarten tussen Te doen, Bezig en Klaar.
- Sleep kaarten naar Morgen, Volgende week of Volgende maand.
- Typ bijvoorbeeld `Rapport schrijven morgen` in Quick Add.
- Alleen vandaag afgeronde kaarten staan in Klaar; oudere kaarten blijven in
  Geschiedenis.
- Druk `N` om Quick Add te focussen.
- Gebruik `Alt` + `←`/`→` om een gefocuste kaart tussen lanes te verplaatsen.

Zie [AGENTS.md](AGENTS.md) voor de REST-API die Cursor, Claude Code, Codex en
andere clients kunnen gebruiken.

## Azure DevOps (boards & CI)

Code staat op **GitHub**; backlog en pipelines in **Azure DevOps**. Zie
`docs/azure/ado-github-integration.md` voor de workflow (`AB#` in commits, enz.).

## Worktree & pull requests

Werk nooit direct op `main`. Gebruik worktrees en PR's (ook voor agents):

```powershell
./scripts/start-development.ps1 -Branch feature/mijn-onderwerp
# ... wijzigingen ...
./scripts/new-pr.ps1 -WorkItem 120 -Message "Planner: beschrijving van de wijziging"
./scripts/stop-development.ps1 -Branch feature/mijn-onderwerp
```

Policy: `.cursor/rules/worktrees-and-branches.mdc`
