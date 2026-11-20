# Gezamenlijke CMS-acceptatiematrix

Stand op 20 november 2026 na de gezamenlijke PR43-review op runtimehead `ea12b79ce8095878edc4d10ce3f260e3b35b9bf2`. Dit beschrijft lokale proeven met fictieve gegevens op eigen integratiebranches. Er is niet naar main gemerged of uitgerold.

| Criterium | Bewijs en status |
| --- | --- |
| Bestaande home behouden | CMS21, PR21 `0a9a9b76`: additieve migratie, oude revisies en releases behouden; API- en herstartproef groen. |
| Nieuwe pagina, slug, SEO en typed tekst/beeld | CMS21 gebouwd en gereviewd. Slug uniek en vast tijdens/na publicatie; redirect en verwijderflow open. |
| Volledige expliciete siterelease | Gebouwd: alle gekozen paginarevisies gepind vóór async build, CAS/idempotency, nieuwere concepten apart. |
| Foto uploaden en rechten vrijgeven | PR17 gereviewd; schone derivatives, expliciete rechtenaudit, finale hercontrole, retained versies. |
| Portfolio kiezen en publiceren | PR25 gereviewd: snapshot/checksum/locale, preview, eigen immutable beeldkopieën, alle pins in één gate. |
| Intrekking en rechten tijdens build | Integratietests voorkomen nieuwe activatie en behouden vorige complete release. Geen automatische intrekking van al gekopieerde sites. |
| Twee databases en crashgap | Consumer test echte child-exit; CMS test echte CMS-commit met rollback mediatransactie en reconcile bij heropenen. Geen crash-atomiciteitsclaim. |
| NL-pagina met NL/EN-portfolio | Gebouwd. Snapshot bepaalt bloklocale en expliciete fallback. Pagina blijft NL. |
| Portfolio-kop en lege-staattekst redigeren | PR26 onafhankelijk gereviewd op `2fea3e3d`: CMS-owned localevelden, immutable paginarevisie/release en gedeeld localecontract. |
| Eerste vaste publieke navigatiebindings | PR31 onafhankelijk gereviewd en P2-herreview gesloten op `71833ec4`: bestaande taalkeuze-aria-label en endoniemen via CMS-velden, migratie 5, revisie/CAS, exacte preview en expliciete shared releasepin. |
| Alle publieke tekst centraal redigeerbaar | De huidige lokale navigatiebindings zijn aangesloten. De 27 bindings van één gesaneerde contactfixture, inclusief footer en linklabels, zijn in PR40 aangesloten. Andere echte templates vragen nog inventaris/aansluiting. Geen claim van algemene template- of productievolledigheid. |
| Minimale CMS22-tekstpagina | PR27 onafhankelijk gereviewd op `f9538988`: dezelfde pagina-/blok-ID's, handmatige EN-titel/slug/SEO/tekst, EN-route/taalnav, expliciete publicatie en structuur-CAS. Legacy `/en.html` blijft bewerkbaar. |
| EN-afbeelding per gebruik | PR32 onafhankelijk gereviewd op `cbf5c544`; drie noodzakelijke editorbevindingen opgelost en herreview gesloten. NL-bronbinding, EN-alt/bijschrift, expliciete bronbevestiging en immutable revisies. Zie [proef](engelse-afbeelding-proef.md). |
| Portfolio op EN-pagina | PR34 onafhankelijk gereviewd, legacy-P2 opgelost en herreview akkoord op `7378fae1`. Zie [proef](engels-portfolio-proef.md). |
| EN-home | PR36 onafhankelijk gereviewd op `fbb583f0`, geen bevindingen. Bestaande NL-bron/index behouden, additieve home-EN/FK, exacte revisies en expliciete publicatie; [proef](home-en-proef.md). |
| Volledige CMS22 contenttalen | Nog open: meer talen, uitgebreidere fallbackdiagnostiek en localeconfiguratie. Eerste tekstvertical heeft expliciet geen fallback en bewaart leeg/ontbrekend. |
| CMS-bediening NL/EN | PR29 onafhankelijk gereviewd op `69b43c54`, geen noodzakelijke fixes. Getypeerde namespace, eigen tabbladkeuze, bestaande schermen/status/foutcodes en statebehoud. Nederlandse bevestiging verduidelijkt op `7b77a7b8`; 16 relevante tests groen. |
| Bestaande klanten importeren | Open: reproduceerbare bron, fictieve migratievergelijking, dry-run/idempotency, herstelproef en expliciete aansluiting. |
| Productie-identiteit, back-up/restore en deployment | Offline synthetische back-up/restore is lokaal bewezen in PR42/43. Productie-identiteit, productieherstelbeleid en deployment blijven open; lokale tokens zijn geen productie-identiteit. |

De centrale tekstcriteria uit [centrale tekstredactie](centrale-tekstredactie.md) blijven leidend. Een taalstap is pas compleet wanneer de redacteur bestaande zichtbare tekst zonder codewijziging kan bewerken, de gekozen locale in preview en release overeenkomt en een nieuwer concept de actieve publicatie niet verandert.

De lokale publieke renderer gebruikt nu beheerde paginatitels voor navigatielinks, pagina-/SEO-velden, tekstblokken, beeld-alt/bijschrift, portfolio-kop/leegstaat en gepinde catalogusitemvelden. De taalkeuzekop en endoniemen staan in de gedeelde navigatierevisie. In deze renderer zijn geen footer, formulier of extra vaste linklabels aanwezig. Daarvoor is dus geen nieuwe tekstbinding gebouwd. Aansluiting van echte klanttemplates en hun eventuele vaste teksten blijft open, Algemene taalconfiguratie en echte klanttemplate-aansluiting blijven open. Portfolio binnen een volledige EN-pagina is in PR34 lokaal gebouwd en onafhankelijk gereviewd. Een catalogusitem bewerken gebeurt in de catalogus; het CMS kiest een immutable snapshot. Dit is nog geen bewijs dat alle tekst van een echte klantwebsite centraal is aangesloten.

Teststand PR27: volledige 123 API/componenttests en 15 shared-tests plus workspacechecks groen. De review vond één legacy-slugregressie. Na fix slagen de 16 relevante tests bij implementatie en gerichte herreview; de extra upgradefixture brengt het API-totaal op 124. Typecheck/lint/diffcheck zijn na de codefix opnieuw groen. Browser op 3022 bewees handmatige EN-invoer, selectie, preview, taalnav, SEO en normale herstart.

Teststand PR25: reviewer draaide de volledige 113-test-suite op de initiële integratiehead. Twee aanvullende padregressies brachten het totaal op 115; de zeven relevante integratietests slaagden bij implementatie én gerichte herreview op de definitieve head. Workspacechecks waren groen; API-typecheck/lint/diffcheck zijn na de padfix opnieuw groen. Browser op 3020 bewees selectie, preview, publicatie en normale herstart.


## Afhankelijkheden en integratiegrens

Deze acceptatie geldt voor afzonderlijke lokale worktrees en fictieve gegevens. De CMS-PR-keten is open en niet samengevoegd: #7 → #10 → #13 → #17 → #21 → #25 → #26 → #27 → #29 → #31 → #32 → #34 → #36. PR34 heeft feature/cms-english-image als base, niet main. Iedere volgende stap bevat eerdere ongeïntegreerde code. Dit is geen volledig geïntegreerd of productiegereed CMS.

Media-, upload-, locale- en catalogusconsumercontracten zijn als eerder gereviewde subsets in deze CMS-keten opgenomen. De zelfstandige media/catalogus-PR's staan eveneens open. Tijdelijke integratie in PR37 heeft de overlap verenigd en de volledige gezamenlijke lokale poort en browser/herstartproef doorlopen; onafhankelijke review akkoord op fb9c22d. Gezamenlijke landing op main, productieconfiguratie en deployment zijn nog niet uitgevoerd. Zie [integratiebewijs](../integratie/README.md). Mergevolgorde en consolidatie vragen een afzonderlijke opdracht. Bestaande lokale proefbewijzen blijven geldig binnen hun opgegeven codehead; ze bewijzen geen echte klantimport of livewebsitewerking.

EN-home is inmiddels lokaal gebouwd en gereviewd in PR36. De volgende prioriteit is gezamenlijke integratie/consolidatie in één checkout. Geen nieuwe contentuitbreiding tot de integratiegaten concrete eigenaren hebben. Echte klanttemplates en alle daarin aanwezige vaste tekstbindings blijven een aparte open aansluiting. De lokale renderer heeft geen footer of formulier; die worden niet als ontbrekende gebouwde functies verzonnen.


## Gesaneerde contacttemplate

De afzonderlijke proef en controles staan in [contact-template-proef.md](contact-template-proef.md). Alle 27 bindings zijn afgedekt met fictieve NL/EN-inhoud, vaste templatehash en expliciete pagina/shared/templatepins. PR 37 blijft de vaste basis; mediacatalogus M2/M3 zijn nog niet geconsolideerd. PR40 is onafhankelijk akkoord op `3fe4da5a4ad4228e8ded4aa4e8b8718aefd7eb5d` door `/root/review_pr40`, GPT-6 Astra medium, na een geverifieerde en herbeoordeelde Viteproxyfix. Volledig rapport: [review-pr40.md](review-pr40.md). Dit bewijst één gesaneerde fixture, geen echte site-import of algemene templateaansluiting. Extra templates zijn niet automatisch onderdeel van de scope. Volgende oorspronkelijke CMS-prioriteit is CMS-09, uitsluitend fictieve back-up en offline restore op nieuwe opslag.


## Fictieve back-up en restore

CMS-09 heeft een afzonderlijke lokale CLI-proef voor twee databases en bestanden op nieuwe synthetische opslag. Zie [protocol en bewijs](backup-restore-proef.md). Productie-identiteit, echte klantimport, opslagbeleid en live omschakeling blijven open. PR42 akkoord op runtimehead `65643c9b448cd139a2f51c4d61ca6fd1fa76fbf4`, Astra medium, P2 stale-recoverylock opgelost en herbeoordeeld. Volledige herreview en coördinatie staan in [review-pr42.md](review-pr42.md). Ondersteuning blijft bewust CMS-schema8/catalogusschema3; schema4/5 vereist de afzonderlijke gezamenlijke consolidatie.


## Tweede consolidatie

De nieuwe branch verenigt de volledige gereviewde CMS42- en catalogus41-keten vanaf de vaste PR37. Alleen de expliciete CMS09-compatibiliteit voor media3/4/5 is functioneel aangepast. Alle416 tests en de gezamenlijke browser/offline-restore/herstartproef slagen. Zie [integratie-v2](../integratie-v2/README.md). Onafhankelijke Astra-medium integratiereview akkoord op `ea12b79ce8095878edc4d10ce3f260e3b35b9bf2`, inclusief gesloten systeemcategorie-P2. Zie [rapport](../integratie-v2/review-pr43.md). Geen mainmerge, klantimport of deployment.


De volledige modulecriteria zijn vergeleken in [open-criteria](../integratie-v2/open-criteria.md). Lokale demo en gewoon mainmergeplan staan in dezelfde overdracht. Een werkende fixture sluit de oorspronkelijke identity/import/adapter/operationele criteria niet automatisch.


## Zelfstandige M5-export

Een apart release-only CLI-commando en statische proef staan in [statische-export-proef.md](statische-export-proef.md). De bestaande gepubliceerde bytes worden op hun gedocumenteerde /sites/<website>/-basis zonder CMS/API geladen. Geen file://-rewrite of nieuwe renderer. PR44 heeft gesloten Astra-medium herreview op `349db0b3bfc2e2c85bfe852a7788ea3a9b571c69`; de finale volledige API-suite op die runtimehead is groen met387/43, één worker en oorspronkelijke timeouts. Zie [rapport](review-pr44.md).
