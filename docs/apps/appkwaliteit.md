# Kwaliteitscontroles voor de appcatalogus

Onderhouder: Draconis Labs. Laatst nagekeken op 21 november 2026.

De [lokale appcatalogus](lokale-appcatalogus.md) heeft een eigen browserproef.
Voer deze uit na wijzigingen aan kaarten, navigatie, responsiviteit of de
catalogusroute:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @draconis/home exec playwright install chromium
corepack pnpm --filter @draconis/home test:browser
```

De browserproef bouwt de app eerst. Vite Preview en twee fictieve
appdoelen starten daarna op door het OS toegewezen loopbackpoorten.

| Controle | Afspraak |
| --- | --- |
| Schermen | Chromium op 320×740, 768×1024 en 1440×900. Telefoon en tablet emuleren touch. |
| Bediening | Status verversen en een app openen met het toetsenbord. Open een app ook via touch of muis. |
| Reflow | Geen horizontale overflow en links van minstens 44×44 CSS-pixels. |
| Geautomatiseerde toegankelijkheid | Geen ernstige of kritieke axe-overtredingen voor de geteste WCAG-regels op het catalogusscherm. |
| JavaScript en CSS | Hoogstens 65 KiB gzip voor alle JS-chunks samen en 4 KiB gzip voor alle CSS-bestanden samen. De reguliere workspacebuild voert deze controle uit in CI. |
| Lokale API | Maximaal 250 ms p95 voor de complete catalogusresponse met twee bereikbare fixture-apps, na één opwarmrequest. De browserproef toont ook p50 en p99 uit 40 requests. |
| Core Web Vitals | Doel voor een toekomstige uitrol op mobiel en desktop, telkens p75. LCP maximaal 2,5 s, INP maximaal 200 ms en CLS maximaal 0,1. [Web Vitals](https://web.dev/articles/vitals) |

De browserproef draait op loopback met fictieve data. Voor bredere
acceptatie staan Firefox, Safari, fysieke apparaten, visuele baselines,
handmatige assistive-technologie en veldmetingen nog open. Loadtests,
percentieldashboards en een CI-run van de separate browserproef vragen
verdere aansluiting op de CI- en observability-werkstroom. Lokale
werkruimtetests en de bundlecontrole draaien al via de bestaande
[workspaceverificatie](../../scripts/verify-local-integration.ps1).
