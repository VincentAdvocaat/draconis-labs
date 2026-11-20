# Onafhankelijke integratiereview PR43

PR https://github.com/VincentAdvocaat/draconis-labs/pull/43. Bronchat `01a1f49b-5ee0-7010-83f3-b62b8b94b041`.

De oorspronkelijke `/root/review_pr43` subagent, GPT-6 Astra medium, bevestigde lokale/remote head maar leverde daarna geen controle-uitvoer of concrete status ondanks een begrensde voortgangsvraag. Er liep geen testproces meer. De uitvoering is definitief onderbroken. De geautoriseerde aparte reviewchat `01a1f871-2224-7cd0-8ef9-7f9380635e68` gebruikt hetzelfde GPT-6 Astra model met reasoning medium. Dit is vervangende reviewcoördinatie, geen dubbele actieve review of modelsubstitutie.

## Eerste volledige review

Reviewchat `01a1f871-2224-7cd0-8ef9-7f9380635e68`. Lokale HEAD en remote refs/pull/43/head bij begin en einde bevestigd op `60ac7f87054688c2e2741d1904defbbf1760efea`. Scope recovery-catalog.ts, delta recovery.ts, gerichte tests en consolidatieherkomst. Geen brede herreview van oude ketens, geen extra reviewers, tracked edits, externe comments, merge of deployment.

Status wijzigingen nodig, één noodzakelijke P2. Geen overige noodzakelijke bevindingen of optionele scope-uitbreidingen.

P2 in recovery-catalog.ts regels42-49. Verifieer de verplichte systeemcategorie ook voor websites zonder retained revisies. De validator controleert aanwezige categorierijen en categorieën waarnaar revisies/snapshots verwijzen. Iedere catalog_collections-website moet bij schema4/5 echter een actieve categorie algemeen hebben. CatalogService.list gebruikt die altijd, terwijl CatalogCategories schema4/5 niet opnieuw migreert. Een geaccepteerde restore kan daardoor een lege website opleveren die direct faalt.

Eigen end-to-end reproductie: createRecoveryFixture; vaststellen dat fixture-beta geen catalog_revisions heeft; catalog_categories algemeen voor fixture-beta verwijderen; SQLite sluiten; backup en restore worden geaccepteerd; CatalogService(restored.mediaRoot).list(fixture-beta) faalt Category not found for website. Alle eigen tijdelijke roots gecontroleerd opgeruimd. Backup zelf maakt een geldig gemanifesteerd pakket, zonder buitenste hashmanipulatie.

Voorgestelde oplossing: schema>=4 controleert voor iedere catalog_collections.website algemeen aanwezig en archived=0. Geen reparatie/migratie tijdens validatie. Negatieve test voor de lege website en liefst aangepast restorepakket met herberekende buitenste DB-hash. Schema3 behoudt de bewuste migratieroute. Gerichte herreview door dezelfde chat.

Zelf uitgevoerd: beide recoverytestbestanden,15/15 groen; aanvullende reproductie hierboven; ancestorcheck voor basefc43090, CMSdf6ec60 en catalogus3bc54baa; alle55 entries van blobherkomst.json exact tegen git ls-tree HEAD zonder afwijking. Runtime91493ac naar huidige head verandert alleen blobherkomst.json. Geen verschillen in apps/planner, packages/shared, packages/planner-core of packages/planner-sqlite tegen de vaste base. Breder build/browser/CLI-bewijs gelezen en niet als eigen uitvoering geclaimd. Ongetrackte parentdocumenten ongemoeid gelaten.

## Fix en herreview

Fix door `/root/fix_pr43_category`, GPT-6.1 Sol, reasoning low, commit `ea12b79ce8095878edc4d10ce3f260e3b35b9bf2`. Vier negatieve gevallen faalden vóór de fix. De validator eist nu per cataloguswebsite een actieve systeemcategorie algemeen bij schema4/5. Schema3 blijft uitgezonderd en validatie schrijft niets. Alle32 gerichte recovery/category/order-tests, API-typecheck, lint en diffcheck groen. Alleen validator en regressietests gewijzigd.

Dezelfde reviewchat `01a1f871-2224-7cd0-8ef9-7f9380635e68`, GPT-6 Astra medium, bevestigde lokale HEAD en remote refs/pull/43/head vóór en na tests op `ea12b79ce8095878edc4d10ce3f260e3b35b9bf2`. Alleen delta vanaf60ac7f8 beoordeeld: drie validatorregels en24 testregels. Status AKKOORD binnen afgesproken integratiescope, P2 GESLOTEN, geen open noodzakelijke of optionele bevindingen.

De NOT EXISTS SELECT eist bij schema4/5 voor iedere catalog_collections.website een eigen algemeen met archived=0, ook zonder revisie/snapshotrefs. Dit sluit de eigen oorspronkelijke reproductie. Er is geen reparatie of migratie tijdens validatie; schema3 behoudt de expliciete startupmigratie.

De vier regressiegevallen controleren missing/archived voor schema4/5 op lege fixture-beta. Iedere test maakt eerst een geldig pakket, beschadigt bron en backup, herberekent de buitenste DB-hash en eist de specifieke semantische fout bij backup én restore. Afwijzing is dus niet toevallig een hash- of schemafout.

Eigen herreviewchecks: beide recoverytestbestanden met maxWorkers2,19/19 groen bij standaardtimeouts. Daarin volledige roundtrip en schema3/4-restore vóór startupupgrade. Diffcheck60ac7f8→ea12b79 groen. Volledige API-suite van parent niet als eigen check geclaimd. Geen bestanden gewijzigd, nieuwe reviewers, externe comments, merge of deployment. Parent-README en ongetrackte overdrachtsdocumenten ongemoeid gelaten. Reviewchat na verwerking archiveren en bij dezelfde PR hergebruiken.
