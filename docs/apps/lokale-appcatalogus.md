# Lokale appcatalogus

Onderhouder: Draconis Labs. Laatst nagekeken op 21 november 2026.

Start de catalogus vanuit de repository:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @draconis/home dev
```

Open [Draconis Labs](http://127.0.0.1:5182/). Start Planner en de API zoals
beschreven in het [repositoryoverzicht](../../README.md#lokaal-starten).
Kies **Status vernieuwen** nadat je een app hebt gestart. Een app kan
onbereikbaar zijn en toch een link tonen, bijvoorbeeld als de app zelf al
draait terwijl haar API nog opstart.

## CMS en gescheiden poorten

De catalogus toont standaard alleen apps zonder vereiste rechten. Geef de
lokale catalogus in zijn eigen PowerShell-venster de rechten uit het CMS-manifest.
Start de [CMS-fixture](../../scripts/start-cms-fixture.ps1) in een ander venster
met `-Port 5316 -NoOpen` als je poort 3016 bezet is. Stel in dat geval ook
een override in:

```powershell
$env:DRACONIS_HOME_PERMISSIONS = 'cms.draft.read,cms.draft.write,cms.release.publish'
$env:DRACONIS_HOME_ORIGINS = '{"cms":{"launch":"http://127.0.0.1:5316","health":"http://127.0.0.1:5316"}}'
corepack pnpm --filter @draconis/home dev --port 5382
```

Open in dit voorbeeld poort 5382. `launch` en `health` vervangen alleen de
oorsprong van de bijbehorende URL. Het pad, de query en het fragment blijven
behouden. Geef bij een andere Planner-API-poort een afzonderlijke
`planner.health` op. Herstart Homescreen na wijzigingen aan manifesten of
omgevingsvariabelen.

## Werking

De lokale server leest en valideert de gevonden
[`apps/*/manifest.json`](creating-an-app.md)-bestanden samen. Hij neemt apps op
met een lokale loopbackregistratie, lokale doel- en status-URL's en alle
vereiste rechten in het fixtureprofiel. Met `GET /api/local/apps` ontvangt de
browser alleen de kaarten voor dat profiel. Een statuscontrole gebruikt de
geregistreerde health-URL, verwacht HTTP 2xx en wacht maximaal 750 ms. De
catalogus volgt geen doorverwijzingen.

De proef luistert op `127.0.0.1` en gebruikt één profiel per serverproces.
De appbeheerders blijven hun bestaande eigen toegang toepassen. Platformlogin,
rechten per aangemelde gebruiker, cross-origin sessies en platformbreed
uitloggen vragen nog het identiteitstraject. De statische Vite-build heeft de
catalogusroute nodig. Test hem lokaal met `corepack pnpm --filter @draconis/home
preview` na `corepack pnpm --filter @draconis/home build`.

## Controle

```powershell
corepack pnpm --filter @draconis/home test
```

De tests lezen de registraties uit de checkout, draaien geïsoleerde
loopbackservers en controleren filtering, het startadres, de status en het
normale HTTP-pad.

Stel de [gedeelde Apps-link](lokale-navigatie.md) in om vanuit Planner of CMS terug te keren.
