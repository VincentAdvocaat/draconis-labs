# Azure DevOps + GitHub integratie

Draconis Labs gebruikt **GitHub als enige bron van waarheid** voor code. Azure DevOps
wordt gebruikt voor backlog/boards en CI/CD — zonder handmatige repo-sync.

## Overzicht

| Onderdeel | Bron | URL |
|-----------|------|-----|
| Code & pull requests | GitHub | https://github.com/VincentAdvocaat/draconis-labs |
| Backlog & boards | Azure DevOps | https://dev.azure.com/vadvocaat/Draconis-labs |
| CI/CD pipeline | Azure Pipelines (bouwt vanaf GitHub) | https://dev.azure.com/vadvocaat/Draconis-labs/_build |

De Azure DevOps Git-repo onder Repos is **uitgeschakeld**. Clone en push altijd naar GitHub.

## Wat is geconfigureerd

- GitHub repo: `VincentAdvocaat/draconis-labs` (public)
- Gedeelde GitHub service connection `VincentAdvocaat` (vanuit RecipeLibrary)
- Pipeline `VincentAdvocaat.draconis-labs` gekoppeld aan GitHub `main`
- Azure DevOps Git-repo uitgeschakeld
- GitHub Boards-koppeling: eenmalig in ADO autoriseren indien nog niet gedaan
  (Project settings → GitHub connections → repo toevoegen)

## Lokaal werken

```powershell
git clone https://github.com/VincentAdvocaat/draconis-labs.git
cd draconis-labs
corepack enable
corepack pnpm install
corepack pnpm dev
```

## Work items koppelen aan commits en PR's

Gebruik `AB#<id>` in commit-berichten, PR-titels of `-WorkItem` in `new-pr.ps1`:

```text
Planner drag-and-drop fix AB#120
```

```powershell
./scripts/new-pr.ps1 -WorkItem 120 -Message "Planner: drag-and-drop feedback"
```

Azure DevOps koppelt commits en pull requests automatisch aan het work item.

## Pull-request workflow

1. `./scripts/start-development.ps1 -Branch feature/<topic>`
2. Werk in `.worktrees/feature/<topic>`
3. `./scripts/new-pr.ps1` (opent PR naar `main`; CI draait op de PR)
4. Merge na groene build (squash merge aanbevolen)
5. `./scripts/stop-development.ps1 -Branch feature/<topic>`

`main` is branch-protected: geen directe pushes, alleen via PR.

## CI/CD

De pipeline leest `azure-pipelines.yml` uit GitHub (branch `main`):

- CI bij pushes naar `main`
- PR-validatie bij pull requests naar `main`

Stappen: `pnpm install`, `typecheck`, `lint`, `build`.

## Handige links

- [Backlog](https://dev.azure.com/vadvocaat/Draconis-labs/_backlogs/backlog)
- [Boards](https://dev.azure.com/vadvocaat/Draconis-labs/_boards/board)
- [Pipelines](https://dev.azure.com/vadvocaat/Draconis-labs/_build)
- [GitHub repo](https://github.com/VincentAdvocaat/draconis-labs)
