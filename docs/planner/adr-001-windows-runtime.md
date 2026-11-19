# ADR 001 · Windows-runtime voor de lokale Planner

19 november 2026. Status **voorlopig**. PL-02 is gedeeltelijk uitgevoerd;
de volledige keuzeproef uit de backlog is nog niet geaccepteerd.

## Besluit voor de volgende lokale bouwstap

Gebruik Electron 45.4.1 voor de volgende lokale PL-11-proef. Behoud TypeScript
als gedeelde kern. De bestaande API en de desktopproef gebruiken dezelfde
taakaanmaakregel. Een tweede implementatie van taakregels in Rust is niet nodig.
Tauri blijft een kandidaat totdat dezelfde proef op een schone Windows x64-VM
uitgevoerd kan worden. Er is geen gemeten Tauri-pakket waarmee we de grootte
of opstarttijd eerlijk kunnen vergelijken.

De proef gebruikt Packager 20.3.0 en electron-winstaller 5.4.4 rechtstreeks.
Forge/Squirrel blijft het beoogde releasepad, maar de Forge-configuratie is nog
niet gebouwd. Deze proef is geen productinstaller of pilotrelease.

## Meetopstelling en resultaten

Windows 10.0.26200 x64, Intel i7-13700H, bestaande ontwikkelwerkplek.
Host Node 24.3.0, ABI 137, pnpm 11.10.0. Electron bevat Node 24.22.3, ABI 150.
SQLite 13.2.0 gebruikt een meegeleverde Node-API-binary. De bestaande API houdt
better-sqlite3 12.11.1. Geen C++- of Rust-toolchain geïnstalleerd voor deze proef.

| Proef | Gemeten uitkomst | Betekenis |
| --- | --- | --- |
| Zelfstandig Electron x64-pakket 0.1 | 403.124.629 bytes ongecomprimeerd | React, runtime, SQLite en assets zijn lokaal gebundeld. |
| Start 0.1 tot renderer/preload gereed | 2.177, 295, 256, 260, 248 ms | Vijf nieuwe processen. OS-cache niet geleegd; geen schone-VM-koudestart. |
| Start 0.2 tot renderer/preload gereed | 1.846, 240, 243, 243, 236 ms | Zelfde machine en profiel, OS-cache warm. |
| Zelfstandig pakket 0.2 | 403.124.629 bytes | Gemeten na vervangen van de appmap. |
| Duurzame write en read | 0 naar 5 records in 0.1; 5 naar 10 in 0.2 | Elke start verifieert alle vorige records vóór de volgende write. |
| Appmap 0.1 naar 0.2 | Alle vijf volledige records exact gelijk | IDs, velden, labels en versies behouden. Dit is geen installerupgrade. |
| Typeveilige grens | Ongeldige lege titel in alle 10 starts geweigerd | Werkelijke renderer → preload → main → SQLite. |
| Windows-tokenbescherming | Fictief token versleuteld en terug ontsleuteld | Alleen safeStorage-roundtrip in geheugen. Geen login of duurzame tokenopslag bewezen. |
| Node-sidecarrepetitie | Write, invalid-command, read, EOF-exit en herstart geslaagd | Zelfde store en taakregel. Geen Tauri-shell, geen kill/orphan-herstelbewijs. |
| Unsigned Squirrel 0.1 Setup.exe | 166.315.008 bytes; Authenticode `NotSigned` | Gebouwd, niet geïnstalleerd op een schone VM. |

De renderer weigert externe verzoeken met CSP en een session-filter. Eerste
start en writes werken daarmee zonder webserver/account. De netwerkadapter
van Windows is niet uitgezet. De proef bevat geen login, updater of externe
API-aanroepen. Tijdmetingen hebben geen algemene performancegarantie.

De ruwe samenvattingen staan in [0.1](evidence/windows-v0.1.json) en
[0.2](evidence/windows-v0.2.json). [De recordvergelijking](evidence/upgrade-records.json)
bevat de volledige fictieve records voor en na vervanging. De runs staan lokaal
onder `apps/desktop-probe/dist/final-v1` en `final-v2`, inclusief schermafbeeldingen.
Gedownloade runtimes, databases en installers horen niet in Git.

## Onderzochte blokkades

De eerste Electron-rebuild van SQLite 12.11.1 kon geen bruikbare Visual Studio
C++-toolset vinden. Visual Studio zelf is aanwezig; `node-gyp` meldt dat de
VC++-toolset ontbreekt. Een geforceerde rebuild van 13.2 faalde om dezelfde reden.
13.2 levert echter officiële Node-API-prebuilds mee. Die laden en schrijven in
de verpakte app op ABI 150 en in de host-sidecar op ABI 137. De versiegebonden
pnpm-instelling weigert daarom de onnodige automatische build voor uitsluitend
13.2.0. De toelating voor de bestaande API-dependency blijft staan.

`rustc` en `cargo` ontbreken. Een Tauri-shell, target-triple-sidecarbundel,
WebView2-offlinetest en echte Tauri-procesbewaking zijn daarom niet uitgevoerd.
De Node-sidecar draait nu met de reeds aanwezige host-Node. Dat bewijst nog geen
zelfstandig Tauri-pakket op een machine zonder Node.

## Nog vereist voor definitieve runtimeacceptatie

| Open punt | Volgende concrete controle |
| --- | --- |
| Eerlijke runtimevergelijking | Beide pakketten op dezelfde schone Windows x64-VM; grootte, OS-koude start, offline eerste start. |
| Per-user installatie | Installer onder standaardgebruiker zonder elevatie, database buiten de appmap, verwijderen met afgesproken databehoud. |
| Echte upgrade | 0.1 installeren, fictieve taak maken, 0.2 installeren, exacte velden teruglezen. |
| Browserlogin | PL-03-providerkeuze, PKCE in systeembrowser, accountkoppeling, verlopen token, afmelden en loopbackafsluiting. Geen provider of account is ingericht. |
| Veilige tokenopslag | Versleuteld bestand opnieuw lezen na procesherstart; fouten en ingetrokken toegang testen. |
| Signing en updates | Vertrouwensketen, sleutelbeheer, ondertekend volledig pakket, HTTPS-feed en onbereikbare-feedtest. Geen betaalde signing gestart, geen publicatie of automatische updater aangezet. |
| Tauri-lifecycle | Commando-correlatie, maximale invoer, child-crash, abrupt sluiten, geen orphan; daarna dezelfde React/SQLite-proef in de shell. |

## PL-11 vervolgstap

De eerste opslagstap is inmiddels [uitgevoerd en afzonderlijk verantwoord](pl11-core-en-opslag.md).
Onderstaande beschrijving legt het uitgangspunt van PL-02 vast.

De taakregels hebben een begin in `packages/planner-core`. `newTask` ontvangt
ID, klok, actor en huidige positie. De desktopstore is nog een geïsoleerde
JSON-recordproef en geen gedeelde productadapter. Verplaats in de volgende
kleine stap de bestaande Planner-service achter geïnjecteerde opslagpoorten,
met behoud van list/history/preferences en de v1/legacy-responsevorm. Deel daarna
diezelfde use-cases en SQLite-adapter met de desktopbridge. Voeg geen tweede
taakkern toe. Houd Planner-compositie gescheiden van CMS-registratie.

De fixtures en regressies maken dit onafhankelijk van Rust, signing, identity
of cloudhosting uitvoerbaar. Werkruimteautorisatie en atomaire recurrence blijven
expliciete opvolging, geen bewezen eigenschap van de huidige proef.

## Bronnen

- [Electron-beveiliging](https://www.electronjs.org/docs/latest/tutorial/security): gebundelde assets, sandbox, context isolation en afzendercontrole.
- [better-sqlite3-bron en releases](https://github.com/WiseLibs/better-sqlite3): de gepinde 13.2.0 bevat `prebuilds/win32-x64.node`; de daadwerkelijke load is hierboven gemeten.
- [Tauri-sidecars](https://v2.tauri.app/develop/sidecar/): een meegeleverd executable vereist expliciete bundeling en target-triple-bestandsnamen.
- [Squirrel via Forge](https://www.electronforge.io/config/makers/squirrel.windows): Setup.exe, full.nupkg en RELEASES vormen het beoogde distributiepad.
