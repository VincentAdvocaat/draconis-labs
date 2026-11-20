# Vlakke websitecategorieën

Eerste kleine M3-stap boven gereviewde bibliotheek-PR 38, basis `c0c7c65fd080f4b9e7cd06142ab1cbb381b6c7df`. Redactionele itemvolgorde volgt afzonderlijk. Geen dependencies, shared-pakketwijziging of CMS-UI toegevoegd.

## Opslag en mutaties

Catalogusschema 4 voegt `catalog_categories(website,id,version,archived,labels)` toe. De sleutel is website/id; een nieuwe categorie krijgt een servergegenereerde UUID. `labels` bevat handmatige NL/EN-waarden. NL is verplicht voor het concept. EN kan ontbreken of bewust leeg zijn; die twee blijven verschillend. De bestaande systeem-ID `algemeen` blijft behouden. Alleen die vaste systeemcategorie krijgt de centrale systeemteksten Algemeen/General; dit vertaalt geen klantinhoud.

De migratie loopt na de bestaande locale-migratie in een eigen IMMEDIATE-transactie, initialiseert elke bestaande fixturewebsite en herschrijft geen items, revisies, snapshots of mediareferenties. Een bestaande schema-3-database kan opnieuw openen; opnieuw openen op schema 4 is idempotent. De bestaande collectie-CAS wordt verhoogd bij elke categoriewijziging, zodat een eerder voorbereide publicatie niet stilzwijgend de nieuwe namen overneemt.

Private routes onder `/catalogus/api/:site` gebruiken de bestaande token-/origin-/websitegrens:

| Route | Gedrag |
| --- | --- |
| GET `/categories` | Alle categorieën van de website, inclusief archief voor bestaande verwijzingen |
| POST `/categories` | Aanmaken met expectedVersion 0 en labels.nl/labels.en |
| PUT `/categories/:id` | Hernoemen met matching expectedVersion; ID blijft vast |
| POST `/categories/:id/archive` | Niet-systeemcategorie archiveren met CAS; geen referenties verwijderen |
| DELETE `/categories/:id` | Alleen ongebruikte niet-systeemcategorie met CAS; huidige/historische revisie of snapshot weigert met 409 |

Archief is geen verwijdering: bestaande items mogen hun oude categoriekeuze houden en bewerken/publiceren. Een nieuw item of een gewijzigde keuze mag geen gearchiveerde categorie selecteren. De UI toont een reeds geselecteerde archiefcategorie uitgeschakeld. Een inmiddels verwijderde onbevestigde keuze blijft herkenbaar als niet beschikbaar; deze wordt niet stil door Algemeen vervangen. Geen herstel- of hard-deleteactie voor gebruikte categorieën toegevoegd.

## Gepinde labels en compatibiliteit

Nieuwe snapshots hebben schemaVersion 3 en een additieve `categories`-lijst met categoryId, name, sourceLocale en isFallback. Alleen gebruikte categorieën worden opgenomen. De naam wordt gekozen via dezelfde shared-localehelper als itemvelden. Een publicatie vereist een niet-lege naam; ontbrekend EN kan alleen met een expliciet gekozen fallback naar NL publiceren. Bewust leeg EN blijft leeg en faalt de vereiste naamvalidatie. Nieuwe publieke categorietekst en editorlabels staan centraal in `category-copy.ts`, met NL/EN-keys voor latere CMS-binding.

Hernoemen, archiveren of een nieuwe publicatie verandert oude snapshot-JSON/checksum niet. De publieke renderer leest de gepinde naam, nooit de actuele tabel. Bestaande schema-1/2-snapshots blijven ondersteund met hun eerdere algemene categoriebeleid. De consumer blijft de hele payload hashen, inclusief nieuwe categorievelden; er worden geen extra velden weggefilterd.

CMS heeft vóór de contractwijziging bevestigd dat zijn portfoliorenderer alleen items/resolvedMedia leest en geen beperkende schema-1/2-parser heeft. CMS mag de additieve categorievelden voorlopig negeren. Er is geen automatische CMS-herlabeling of tweede categorie-editor gebouwd. Tests controleren echte v1 zonder localevelden, v2 en v3, heropenen en consumer prepare/materialize/finalize met de oorspronkelijke checksums.

## Editor en bewijs

De gewone `catalogus start -Port 0` opent de bestaande beheerflow. Categorieën aanmaken/hernoemen vernieuwt alleen de categoriekeuzes en categorie-editor; onopgeslagen NL/EN-itemvelden en expliciete fileVersion-selectie blijven staan. De zichtbare itemversie en collectieversie worden niet stil naar een nieuwere serverversie getild. Vóór publicatie vraagt de melding daarom om de volledige collectie opnieuw te laden. Stale categorie-CAS bewaart de ingevoerde namen en geeft een concrete fout. Navigeren, archiveren of verwijderen met een onopgeslagen categorienaam wordt geweigerd tot opslaan/expliciet annuleren. Knopacties herstellen focus en tonen hun status bij de categorie-editor.

Geautomatiseerd: website-isolatie, twee echte servicehandles/CAS, validatie, in-gebruikweigering na itemarchief, behoud van retained refs/alt/rechten, archive/heropenen, atomaire rollback via een echte SQLite-trigger, locale/fallback/lege naam en schema-3-migratie met v1/v2/v3-manifesten. Editorproeven gebruiken het echte inline script en testen dirty-formbehoud, stale categorie-CAS, navigatiewaarschuwing en behoud van de zichtbare categoriedoel-ID na een item-save. De bestaande CMS-portfoliotests draaien nu ook met nieuwe v3-bronfixtures.

Browserproef uitsluitend synthetisch: categorie Projecten/Projects aangemaakt met Enter, een expliciet vrijgegeven fixturefoto aan een item gekoppeld en gepubliceerd. Na hernoemen toont de oude snapshot Projecten en een nieuwe Projecten vernieuwd. Gebruikte categorie verwijderen wordt geweigerd; archiveren behoudt het item en maakt de keuze onselecteerbaar voor nieuwe selectie. Onopgeslagen itemtitel blijft staan tijdens categoriebeheer. Tab/Enter en herstelde knopfocus zijn gecontroleerd. Echte CLI-stop/heropen met dezelfde fixture behoudt categorie-ID, namen, archief en beide snapshots. Bewijsbeelden staan bij de chatoplevering.

Geen redactionele volgorde, metadata-schema-editor, subcategorieën, multi-image, batch, lightbox, klantmigratie, merge of deployment in deze PR.
