# Gezamenlijke CMS-acceptatiematrix

Stand op 19 november 2026 na onafhankelijke review van PR36 op codecommit `fbb583f09c94411b9a4dadaf977d5daec31cce55`. Dit beschrijft lokale proeven met fictieve gegevens. Er is niets samengevoegd of uitgerold.

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
| Alle publieke tekst centraal redigeerbaar | De huidige lokale navigatiebindings zijn aangesloten. Andere echte templates, footer en formulier-/linklabels waar aanwezig vragen nog inventaris/aansluiting. Geen claim van algemene template- of productievolledigheid. |
| Minimale CMS22-tekstpagina | PR27 onafhankelijk gereviewd op `f9538988`: dezelfde pagina-/blok-ID's, handmatige EN-titel/slug/SEO/tekst, EN-route/taalnav, expliciete publicatie en structuur-CAS. Legacy `/en.html` blijft bewerkbaar. |
| EN-afbeelding per gebruik | PR32 onafhankelijk gereviewd op `cbf5c544`; drie noodzakelijke editorbevindingen opgelost en herreview gesloten. NL-bronbinding, EN-alt/bijschrift, expliciete bronbevestiging en immutable revisies. Zie [proef](engelse-afbeelding-proef.md). |
| Portfolio op EN-pagina | PR34 onafhankelijk gereviewd, legacy-P2 opgelost en herreview akkoord op `7378fae1`. Zie [proef](engels-portfolio-proef.md). |
| EN-home | PR36 onafhankelijk gereviewd op `fbb583f0`, geen bevindingen. Bestaande NL-bron/index behouden, additieve home-EN/FK, exacte revisies en expliciete publicatie; [proef](home-en-proef.md). |
| Volledige CMS22 contenttalen | Nog open: meer talen, uitgebreidere fallbackdiagnostiek en localeconfiguratie. Eerste tekstvertical heeft expliciet geen fallback en bewaart leeg/ontbrekend. |
| CMS-bediening NL/EN | PR29 onafhankelijk gereviewd op `69b43c54`, geen noodzakelijke fixes. Getypeerde namespace, eigen tabbladkeuze, bestaande schermen/status/foutcodes en statebehoud. Nederlandse bevestiging verduidelijkt op `7b77a7b8`; 16 relevante tests groen. |
| Bestaande klanten importeren | Open: reproduceerbare bron, fictieve migratievergelijking, dry-run/idempotency, herstelproef en expliciete aansluiting. |
| Productie-identiteit, back-up/restore en deployment | Open en apart te autoriseren. Lokale testtokens zijn geen productie-identiteit. |

De centrale tekstcriteria uit [centrale tekstredactie](centrale-tekstredactie.md) blijven leidend. Een taalstap is pas compleet wanneer de redacteur bestaande zichtbare tekst zonder codewijziging kan bewerken, de gekozen locale in preview en release overeenkomt en een nieuwer concept de actieve publicatie niet verandert.

De lokale publieke renderer gebruikt nu beheerde paginatitels voor navigatielinks, pagina-/SEO-velden, tekstblokken, beeld-alt/bijschrift, portfolio-kop/leegstaat en gepinde catalogusitemvelden. De taalkeuzekop en endoniemen staan in de gedeelde navigatierevisie. In deze renderer zijn geen footer, formulier of extra vaste linklabels aanwezig. Daarvoor is dus geen nieuwe tekstbinding gebouwd. Aansluiting van echte klanttemplates en hun eventuele vaste teksten blijft open, Algemene taalconfiguratie en echte klanttemplate-aansluiting blijven open. Portfolio binnen een volledige EN-pagina is in PR34 lokaal gebouwd en onafhankelijk gereviewd. Een catalogusitem bewerken gebeurt in de catalogus; het CMS kiest een immutable snapshot. Dit is nog geen bewijs dat alle tekst van een echte klantwebsite centraal is aangesloten.

Teststand PR27: volledige 123 API/componenttests en 15 shared-tests plus workspacechecks groen. De review vond één legacy-slugregressie. Na fix slagen de 16 relevante tests bij implementatie en gerichte herreview; de extra upgradefixture brengt het API-totaal op 124. Typecheck/lint/diffcheck zijn na de codefix opnieuw groen. Browser op 3022 bewees handmatige EN-invoer, selectie, preview, taalnav, SEO en normale herstart.

Teststand PR25: reviewer draaide de volledige 113-test-suite op de initiële integratiehead. Twee aanvullende padregressies brachten het totaal op 115; de zeven relevante integratietests slaagden bij implementatie én gerichte herreview op de definitieve head. Workspacechecks waren groen; API-typecheck/lint/diffcheck zijn na de padfix opnieuw groen. Browser op 3020 bewees selectie, preview, publicatie en normale herstart.


## Afhankelijkheden en integratiegrens

Deze acceptatie geldt voor afzonderlijke lokale worktrees en fictieve gegevens. De CMS-PR-keten is open en niet samengevoegd: #7 → #10 → #13 → #17 → #21 → #25 → #26 → #27 → #29 → #31 → #32 → #34 → #36. PR34 heeft feature/cms-english-image als base, niet main. Iedere volgende stap bevat eerdere ongeïntegreerde code. Dit is geen volledig geïntegreerd of productiegereed CMS.

Media-, upload-, locale- en catalogusconsumercontracten zijn als eerder gereviewde subsets in deze CMS-keten opgenomen. De zelfstandige media/catalogus-PR's staan eveneens open. Gezamenlijke landing op main, eventuele overlappende wijzigingen, samengestelde integratietests, productieconfiguratie en deployment zijn nog niet uitgevoerd. Mergevolgorde en consolidatie vragen een afzonderlijke opdracht. Bestaande lokale proefbewijzen blijven geldig binnen hun opgegeven codehead; ze bewijzen geen echte klantimport of livewebsitewerking.

EN-home is inmiddels lokaal gebouwd en gereviewd in PR36. De volgende prioriteit is gezamenlijke integratie/consolidatie in één checkout. Geen nieuwe contentuitbreiding tot de integratiegaten concrete eigenaren hebben. Echte klanttemplates en alle daarin aanwezige vaste tekstbindings blijven een aparte open aansluiting. De lokale renderer heeft geen footer of formulier; die worden niet als ontbrekende gebouwde functies verzonnen.
