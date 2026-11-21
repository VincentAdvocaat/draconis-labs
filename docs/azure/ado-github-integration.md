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
- Gedeelde GitHub App-serviceverbinding `VincentAdvocaat` (vanuit RecipeLibrary)
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
3. `./scripts/new-pr.ps1` opent de PR naar `main`. Controleer de Azure-run voor de PR.
4. Merge na groene build (squash merge aanbevolen)
5. `./scripts/stop-development.ps1 -Branch feature/<topic>`

`main` is branch-protected: geen directe pushes, alleen via PR.

## CI/CD

Pipeline [#2](https://dev.azure.com/vadvocaat/Draconis-labs/_build?definitionId=2)
leest `azure-pipelines.yml` uit GitHub. De YAML configureert CI bij pushes naar
`main` en PR-validatie voor pull requests naar `main`. De pipeline installeert
Node 22, cachet de pnpm-store en draait `scripts/verify-local-integration.ps1`
voor frozen install, build, lint, typecheck, tests en startupsmokes.

### Automatische PR-validatie controleren

Open een normale pull request vanuit dezelfde repository naar `main`. Noteer de
head-SHA, de `refs/pull/<nummer>/merge`-SHA en de Azure-run. Controleer in Azure
dat de reason `pullRequest` is en de run de merge-SHA van deze PR heeft gebouwd.
Controleer in GitHub ook of de Azure Pipelines-app bij die PR een Check Run
publiceert en noteer de exacte naam en app-id voor branchbeveiliging.

[Run #156](https://dev.azure.com/vadvocaat/Draconis-labs/_build/results?buildId=156)
bouwde de merge-ref van [PR #65](https://github.com/VincentAdvocaat/draconis-labs/pull/65)
succesvol met reason `manual`. De merge-SHA had geen Check Run of commitstatus.
GitHub vereiste op `main` nog geen statuschecks bij de controle op 21 november 2026.

Bij de opening van [PR #66](https://github.com/VincentAdvocaat/draconis-labs/pull/66)
was pipeline #2 actief en stond terugmelding van buildstatus aan. De pipeline
gebruikt een installatietoken, maar Azure Pipelines ontbrak onder
[GitHub Apps voor deze repository](https://github.com/VincentAdvocaat/draconis-labs/settings/installations).
Voor head `841d9e2b26a2e4617885fc2c92fe58a48a45706f` en merge-SHA
`eb58b7fb00886d1d8b468f3ef80c1d71d1d48df5` was er geen Azure-run voor de PR of
GitHub-check. De app is op het account geïnstalleerd. De GitHub-eigenaar kan
`draconis-labs` aan de repositoryselectie van die installatie toevoegen en
daarna een nieuwe PR-event gebruiken om de koppeling te toetsen.
[Microsoft-documentatie over GitHub-triggers](https://learn.microsoft.com/en-us/azure/devops/pipelines/repos/github?view=azure-devops#failing-triggers)

Maak de check pas verplicht nadat een automatisch gestarte run de exacte naam en
afzender heeft gepubliceerd. Een verkeerd checkcontext blokkeert merges naar
`main` doordat GitHub op een check wacht die nooit verschijnt. Verifieer na een
goedgekeurde wijziging van de branchbeveiliging dat een PR met een check die nog
loopt niet kan mergen en dat dezelfde kandidaat na succes wel aan die eis voldoet.

## Handige links

- [Backlog](https://dev.azure.com/vadvocaat/Draconis-labs/_backlogs/backlog)
- [Boards](https://dev.azure.com/vadvocaat/Draconis-labs/_boards/board)
- [Pipelines](https://dev.azure.com/vadvocaat/Draconis-labs/_build)
- [GitHub repo](https://github.com/VincentAdvocaat/draconis-labs)
