# Portfolio op een EN-pagina

Gebouwd vanaf PR32-docshead `80957852af15cb6576beeaa6bdb9578896800a9d`, met gereviewde runtime `cbf5c544902bb04a42ce7a336fbffa25c95b8c98`. Uitsluitend lokale fictieve data. De scope uit [het voorstel](engels-portfolio-acceptatievoorstel.md) is uitgevoerd.

## Binding en redactie

NL bepaalt blok-ID, type en volgorde. Een EN-portfolioblok kiest expliciet een gepubliceerde EN CatalogRef, checksum en volledige localecontext. Een nieuwe EN-variant begint met selectie null; een NL-selectie wordt niet stilzwijgend EN. De consumer verifieert referentie, checksum en context tegen de exacte snapshot. DefaultLocale blijft afkomstig uit de catalogus. De bestaande heading/empty-taalmaps en gedeelde validatiehelper blijven leidend. Directe EN-kop en lege-staattekst zijn verplicht voor preview/publicatie; null en leeg zijn wel bewaarbaar als concept.

Iedere EN-revisie bewaart de volledige selectie en labelmaps immutable in de bestaande revisie-JSON. Draft-consumerpins leggen retentie vast bij save, releasepins vóór async build. Geen nieuwe tabel of migratie nodig; oude tekst-/beeldrevisies en releases blijven leesbaar. De bestaande complete finale consumerpinset, rechten/hashgate en reconcile zijn behouden. De bekende twee-database-crashgap blijft dezelfde beperking.

EN-preview materialiseert de exacte gekozen revisie. Publieke EN-beeldpaden zijn absoluut om vanaf de geneste EN-route bereikbaar te blijven; bestaande NL-paden blijven gelijk. Een expliciete veldfallback wordt met de bronlocale gemarkeerd, bijvoorbeeld lang=nl op een Nederlandse beschrijving binnen de EN-snapshot. De snapshotcontext wordt niet herlabeld.

De bestaande bronconflictherstelroute bewaart lokale EN-labels en selectie via blok-ID/type, vraagt expliciete uitlijning en voegt nieuwe bronblokken toe. Een gelijktijdige EN-revisiewijziging blijft een afzonderlijke overnamekeuze.

## Bewijs

- Volledige API/component-suite: 158 tests groen, maxWorkers 2. Shared: 15 tests groen. Workspace typecheck, lint, build en diffcheck groen.
- Zeven nieuwe API-tests bewijzen expliciete selectie, verkeerde website/checksum/context/NL-snapshot, exacte oude preview, incomplete EN met behoud vorige active, gevuld/leeg, immutable selectie bij nieuwe snapshot tijdens async build, retained/reopen, afzonderlijke NL/EN-pins en bereikbare EN-bytes met SHA256. Finale rechtenblokkering en hashcorruptie weigeren nieuwe activatie en behouden oude publieke bytes.
- Componenttest gebruikt de echte API-lijstvorm inclusief itemCount, stuurt alleen ref/checksum/context naar revisie, en bewaart lokale portfoliokop/selectie bij een bronstructuurconflict in het eerste EN-concept. Bestaande gelijktijdige EN-conflicttests blijven groen.
- Normale browser op 3026: NL-pagina met NL-portfolio opgeslagen; EN-variant met expliciete EN-snapshot, titel/slug/SEO/tekst en kop/leegstaat opgeslagen en privé bekeken. Daarna expliciete shared-pin én EN-publicatieselectie gekozen en gepubliceerd. Publieke route en catalogusbeeld werken.
- Echte serverprocesherstart behoudt publieke kop `Selected English projects`; later opgeslagen EN-concept `Unpublished English portfolio heading` blijft apart. EN-route levert 70 vaste proefbytes met SHA256 `4ff6ab670a58c14270e034e2090d9a432caa263a14e0a25785386b0c12f880b5`. De toegestane NL-descriptionfallback is als NL gemarkeerd. Screenshot alleen in genegeerde runtime.

Onafhankelijke review volgt op de PR. Home-EN, echte klanttemplates, algemene localeconfiguratie en productie blijven open. Er zijn geen footer- of formulierbindings aan deze lokale renderer toegevoegd. Geen merge of deployment uitgevoerd.
