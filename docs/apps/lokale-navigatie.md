# Apps openen zonder de huidige app af te sluiten

Onderhouder: Draconis Labs. Laatst nagekeken op 21 november 2026.

Zet `VITE_DRACONIS_HOME_URL` in het venster waarin je een deelnemende
webapp start of bouwt. Gebruik de werkelijke poort van je
[lokale appcatalogus](lokale-appcatalogus.md).

```powershell
$env:VITE_DRACONIS_HOME_URL = 'http://127.0.0.1:5182/'
corepack pnpm dev:planner
```

Gebruik dezelfde variabele vóór het starten van
[`start-cms-fixture.ps1`](../../scripts/start-cms-fixture.ps1). Dat script
bouwt de CMS-frontend. Herstart Vite of bouw de app opnieuw na wijziging van
het adres.

De link **Apps ↗** opent de catalogus in een nieuw tabblad. Je huidige
Planner-weergave en nog niet opgeslagen CMS-invoer blijven in het bestaande
tabblad. Vanuit de catalogus opent **Open …** de gekozen app in het
catalogustabblad. Je bepaalt het startadres van een app in haar manifest.

De React-scaffold gebruikt hiervoor
[`AppLauncherLink`](../../packages/ui/src/AppLauncherLink.tsx) uit
`@draconis/ui` en de stylesheet `@draconis/ui/app-launcher.css`.
De app geeft het catalogusadres door. Voor een standalone webbuild zonder
catalogus laat je de omgevingsvariabele leeg. De publieke boekingsapp en de
lokale Windows-client hebben hun eigen ingang.

Gedeelde accountbediening, doorsturen naar een diepe link na aanmelding en
platformbreed uitloggen wachten op de sessie- en identiteitscontracten.
