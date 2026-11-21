# Azure-sandbox in North Europe

De sandbox draait op Azure Container Apps Consumption in `northeurope`. Planner
serveert de SPA en proxyt de Planner-API onder dezelfde origin. De Planner-ingress
is bereikbaar vanuit het VNet via de interne load balancer. De API-ingress is
alleen bereikbaar vanuit de Container Apps Environment. PostgreSQL gebruikt een
eigen gedelegeerd subnet met private DNS en Entra-authenticatie. Registry Basic
gebruikt managed identities voor image pulls. [AB#517](https://dev.azure.com/vadvocaat/Draconis-labs/_workitems/edit/517) · [ACA-ingress](https://learn.microsoft.com/en-us/azure/container-apps/ingress)

## Lokaal valideren

De Bicep-compiler bouwt beide ARM-templates zonder een Azure-deployment. Gebruik
de Azure CLI met Bicep, Docker met Compose en Node 22 of hoger.

```powershell
az bicep build --file infra/bicep/foundation.bicep --stdout > $null
az bicep build --file infra/bicep/apps.bicep --stdout > $null
```

Start de smoke in PowerShell 7.3 of hoger vanaf de repositoryroot. Compose kiest een vrije loopbackpoort en gebruikt
een tijdelijke SQLite-database in de API-container. De smoke controleert de
gebouwde Planner-pagina, een JavaScript-asset, een API-aanroep via dezelfde
origin en een fictieve Planner-taak die hij aanmaakt, leest en opruimt.

```powershell
./infra/containers/verify-deployment-smoke.ps1
```

Met alleen een HTTPS-origin voert `deployment-smoke.mjs` de leescontroles uit.
Bij een Azure-proef draait de smoke vanaf een runner die het VNet en de private
DNS kan bereiken. Controleer daar ook de Planner-schrijfstroom met een
afzonderlijke fictieve werkruimte via de UI en REST na de release.

## Volgorde voor de eerste geautoriseerde uitrol

1. Controleer registratie en quota van `Microsoft.App`,
   `Microsoft.DBforPostgreSQL`, `Microsoft.ContainerRegistry`,
   `Microsoft.OperationalInsights`, `Microsoft.Insights`, `Microsoft.Network`,
   `Microsoft.KeyVault` en `Microsoft.ManagedIdentity`. Controleer in North Europe
   capaciteit voor Consumption-replica's en PostgreSQL `Standard_B1ms`, en
   VNet-adressen zonder overlap met het toegangspad voor de runner. Gebruik
   `az postgres flexible-server list-skus --location northeurope` voor SKU-aanbod
   en Azure Quotas voor de waarden van het abonnement. Bij ontoereikende quota
   stopt de uitrol. Leg provider, regio en vereiste capaciteit vast en laat de
   eigenaar een quotaverhoging of andere SKU goedkeuren.
2. Laat de eigenaar het kostenbudget en de ontvanger van budgetmeldingen
   goedkeuren. AB#518 noemt €5 per maand als signaleringsbedrag. Bereken vóór
   provisioning de verwachte maandlast voor PostgreSQL, Registry, opslag,
   private DNS en logingestie. De budgetmelding stopt resources niet. De
   Consumption-apps kunnen naar nul replica's schalen. Registry en PostgreSQL
   blijven eigen kostenposten. De workspace bewaart logs 30 dagen en heeft een
   ingestielimiet van 1 GB per dag.
3. Gebruik `foundation.bicep` in `rg-draconis-dev`. Geef de naam en het
   object-ID van een bestaande PostgreSQL-beheerdersgroep als parameters vanuit
   de geautoriseerde omgeving. Controleer eerst ARM what-if en voer daarna
   dezelfde template uit met `az deployment group create`. De ARM-uitvoerder
   heeft ook recht nodig om de twee registryrollen en de Key Vault-rol toe te
   wijzen. Gebruik gescheiden rollen voor deze infrastructuuractie en de
   dagelijkse release.
4. Geef de API-identity een PostgreSQL-principal met toegang tot de gewenste
   schema's en alleen de rechten die de adapter gebruikt. Geef een afzonderlijke
   migratie-identity de benodigde DDL-rechten. Voer migraties eerst uit op
   fictieve data en bewijs dat de vorige imageversie met het nieuwe schema kan
   werken. Het huidige API-image gebruikt SQLite. Voor `apps.bicep` is een
   adapter nodig die met `PGHOST`, `PGDATABASE`, `PGUSER`, TLS-hostvalidatie en
   de Entra-token van de managed identity start en bij misconfiguratie stopt.
5. Bouw en test per unit. Publiceer na goedkeuring de twee images in de eigen
   ACR-repositories `draconis-api` en `draconis-planner`. Registreer commit,
   build-id, image-digests, schema en vorige en nieuwe ACA-revision. Gebruik
   `apps.bicep` met de uitvoer van de foundation en de twee digestwaarden.
   Gebruik voor latere automatisering een federatieve pipeline-serviceverbinding
   met pushrecht op de registry en beperkte schrijfrechten op de Container Apps.
   Houd bestaande integratie-CI als voorwaarde voor publicatie en deployment.
6. Controleer de actieve revisions en voer vanaf het VNet de deployment-smoke
   uit. Noteer de geteste origin en digests. De probes controleren of de
   processen HTTP-verkeer aannemen. Voeg met de PostgreSQL-adapter een
   readinesscontrole op database en schema toe voordat readiness een releasegate
   wordt.

## Storing en herstel

Houd de vorige twee image-digests en het laatst bekende compatibele schema bij.
Bij een mislukte smoke of een stijging van fouten zet de operator de vorige
digests terug via `apps.bicep` en draait dezelfde smoke opnieuw. Bij een
onverenigbare schemamigratie moet de operator eerst de schrijfstroom stoppen en
het herstelplan uitvoeren. Oefen PostgreSQL point-in-time restore naar een aparte
server met fictieve gegevens, controleer databaserecords en meet gegevensverlies
en hersteltijd voordat de eigenaar RPO en RTO vastlegt.

ACA-systeem- en consolelogs komen in Log Analytics. De foundation verbindt
Application Insights met dezelfde workspace en stelt de Dapr-verbinding in.
Voor applicatieverzoeken is instrumentatie in de API nodig. Verzamel per request
een correlatie-ID, status en duur. Vermijd headers, tokens, request bodies en
klantvelden in logs en traces. Controleer in dev of de metingen aankomen voordat
alerts op AppRequests worden ingeschakeld. [ACA-observability](https://learn.microsoft.com/en-us/azure/container-apps/observability)

| Signaal | Voorstel voor de dev-proef | Actie |
| --- | --- | --- |
| Planner- en API-beschikbaarheid | HTTPS-leessmoke elke 5 minuten vanuit het VNet. Melding na drie opeenvolgende mislukkingen. | Controleer DNS, ingress, revision en de API-proxy. |
| API 5xx en responstijd | Melding bij >= 5% 5xx of p95 boven 1 s over 15 minuten, met minstens 20 requests. | Controleer revision, database en logcorrelatie. Rol een verdachte release terug als het schema compatibel is. |
| PostgreSQL-herstel | Oefen herstel en meet RPO en RTO met fictieve data. | Leg de uitkomst en vervolgactie bij het werkitem vast. |

Voor staging en productie zijn eigen omgevingen, quota, kosten, Entra-toegang,
domeinen en een bewezen herstelpad nodig. Beproef in staging een revision met
apart smoke-verkeer voordat je productieverkeer verplaatst. Breid de synthetische
controles pas uit met identiteit en MCP wanneer die routes beschikbaar zijn.
[AB#255](https://dev.azure.com/vadvocaat/Draconis-labs/_workitems/edit/255) · [AB#257](https://dev.azure.com/vadvocaat/Draconis-labs/_workitems/edit/257) · [AB#523](https://dev.azure.com/vadvocaat/Draconis-labs/_workitems/edit/523)
