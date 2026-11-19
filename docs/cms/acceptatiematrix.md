# Gezamenlijke CMS-acceptatiematrix

Stand op 19 november 2026 na onafhankelijke sluiting van PR27 op codecommit `f95389882d7b69d246f66070dec1d37c81123c56`. Dit beschrijft lokale proeven met fictieve gegevens. Er is niets samengevoegd of uitgerold.

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
| Alle publieke tekst centraal redigeerbaar | Nog open: onder meer gedeelde navigatie/footer, bestaande templatebindings en formulier-/linklabels waar aanwezig. Geen claim van volledige dekking. |
| Minimale CMS22-tekstpagina | PR27 onafhankelijk gereviewd op `f9538988`: dezelfde pagina-/blok-ID's, handmatige EN-titel/slug/SEO/tekst, EN-route/taalnav, expliciete publicatie en structuur-CAS. Legacy `/en.html` blijft bewerkbaar. |
| Volledige CMS22 contenttalen | Nog open: andere bloktypen en home, meer talen, uitgebreidere fallbackdiagnostiek en localeconfiguratie. Eerste tekstvertical heeft expliciet geen fallback en bewaart leeg/ontbrekend. |
| CMS-bediening NL/EN | Deels typed keys voor nieuwe pagina-editor; overige huidige appteksten en localekeuze nog open. UI-taal staat los van inhoudstaal. |
| Bestaande klanten importeren | Open: reproduceerbare bron, fictieve migratievergelijking, dry-run/idempotency, herstelproef en expliciete aansluiting. |
| Productie-identiteit, back-up/restore en deployment | Open en apart te autoriseren. Lokale testtokens zijn geen productie-identiteit. |

De centrale tekstcriteria uit [centrale tekstredactie](centrale-tekstredactie.md) blijven leidend. Een taalstap is pas compleet wanneer de redacteur bestaande zichtbare tekst zonder codewijziging kan bewerken, de gekozen locale in preview en release overeenkomt en een nieuwer concept de actieve publicatie niet verandert.

De volgende acceptatiekeuze gaat over de bestaande CMS-bediening. Typed NL/EN-keys voor knoppen, formulierlabels en statusberichten staan los van de redactionele websitevelden. Ze lossen het centrale website-tekstdoel niet op. Daarvoor moet een afzonderlijke beheerde tekstcatalogus de nog vaste publieke taalkeuzelabels en templatebindings inventariseren, per locale redigeerbaar maken en via immutable shared revisies met de site publiceren. Footer- en formulierlabels worden pas opgenomen waar ze werkelijk bestaan. Image/portfolio-varianten binnen volledige EN-pagina's blijven een afzonderlijke open blokkade; de huidige tekstpagina mag ze niet laten verdwijnen.

Teststand PR27: volledige 123 API/componenttests en 15 shared-tests plus workspacechecks groen. De review vond één legacy-slugregressie. Na fix slagen de 16 relevante tests bij implementatie en gerichte herreview; de extra upgradefixture brengt het API-totaal op 124. Typecheck/lint/diffcheck zijn na de codefix opnieuw groen. Browser op 3022 bewees handmatige EN-invoer, selectie, preview, taalnav, SEO en normale herstart.

Teststand PR25: reviewer draaide de volledige 113-test-suite op de initiële integratiehead. Twee aanvullende padregressies brachten het totaal op 115; de zeven relevante integratietests slaagden bij implementatie én gerichte herreview op de definitieve head. Workspacechecks waren groen; API-typecheck/lint/diffcheck zijn na de padfix opnieuw groen. Browser op 3020 bewees selectie, preview, publicatie en normale herstart.
