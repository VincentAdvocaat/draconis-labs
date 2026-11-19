# Gesaneerde contacttemplate

Eigen proef vanaf PR 37, basis `fc43090d0f90892df97d7e033bef66b772c81aa8`. De integratiebranch blijft vast. M2 en M3 van de mediacatalogus zijn afzonderlijke vervolgstappen en zitten niet in deze proef.

## Herkomst en inhoud

De code-owned fixture in `server/api/src/modules/cms/contact-fixture/bundle.ts` bevat 27 bindings, vaste template-id `sanitized-contact`, schemaversie 1 en hashes van de geraadpleegde contactexport, CSS en navigatiecode. Bronpad: `Demo/vincent-advocaat/10-publish/site/contact.html`. Bron-SHA256: `25f1b126fb85c4c5acabed6dc9a140db05c2675ffed36436a9f7067df98a0545`.

Alle inhoud is fictief in NL en EN. Contactdoelen zijn beperkt tot example.invalid. Geen oorspronkelijke teksten, inline klantdataset, editor, foto's, externe fonts of netwerkcode zijn overgenomen. De bestaande contactstructuur met navigatie en footer is gesaneerd. Er is geen formulier toegevoegd. De oorspronkelijke standaardtaal EN staat als provenance opgeslagen. De tenant houdt zijn bestaande standaardtaal NL.

De 16 oorspronkelijke bindings zijn aangevuld met metadata, taalkeuze, bovenkop, linklabels, footermerk/copyright en aria-labels. Paginavelden hebben eigen immutable revisies met CAS. Gedeelde velden gebruiken de bestaande gedeelde revisies. De localevalidatie gebruikt de bestaande helper en vereist directe waarden per geselecteerde taal. Null en leeg blijven onderscheidbaar in het concept; optionele lege velden krijgen geen fallback.

## Preview en publicatie

De normale lokale CMS-starter activeert de proef. Open Contacttemplate, sla pagina- en gedeelde velden afzonderlijk op en open de exacte privépreview. Publicatie vereist expliciete selectie van contactrevisie, templatehash en gedeelde revisie. De editor kiest NL en EN. De API kan een subset selecteren.

Preview en release bewaren complete pagina-, gedeelde- en templatepins. Async builds gebruiken die vastgezette waarden. De contactpagina en zes synthetische bestemmingen per taal vallen onder dezelfde bestaande release. Alle interne links komen uit een vaste routewhitelist. De overige pagina's gebruiken de bestaande renderer. Zelfstandige CSS/JS zijn immutable en lokaal. Privépreviews blijven geauthenticeerd; openbare template-assets bevatten uitsluitend gesaneerde code. CSP en de iframe-sandbox beperken uitvoering.

Een bestaand contactonderdeel kan niet stilzwijgend verdwijnen door de selectie weg te laten. Conflicten, ongeldige waarden, routebotsingen en mislukte builds houden de actieve publicatie intact. Oudere gedeelde clients behouden het nieuwe namespace bij hun updates.

## Controle op 19 november 2026

- Volledige workspace: 367 tests, waaronder 316 API-tests, geslaagd. Typecheck, lint en build geslaagd. De bestaande Planner-bundelwaarschuwing blijft aanwezig.
- Na lintopschoning opnieuw alle 7 contact-API-tests en API-lint geslaagd.
- API-tests controleren alle 27 bindings in beide talen, escaping inclusief `$&`, null/leeg, URL-afwijzing, routes en assets, CAS, scope/auth, stale pins, async freeze, templateverandering, behouden actieve release, herstart en oude fixtures.
- Editor-tests controleren conflicten met behoud van lokale invoer, expliciete pins, dezelfde retrykeuze en exacte preview.
- Browser op loopbackpoort 3052: EN-kop, merk, copyright, aria-label en taalkeuzekop gewijzigd, beide concepten opgeslagen, exacte preview geopend en menu bediend. Daarna expliciet NL en EN gepubliceerd en taalwissel gevolgd.
- Browserassetinventaris van de zelfstandige pagina bevat exact lokale contact.css en contact.js, geen fonts, afbeeldingen of externe resources. Geen contactdoel bezocht.
- Nieuw EN-concept opgeslagen, eigen server gestopt en herstart. De gepubliceerde EN-kop bleef de eerdere gepubliceerde waarde. API-tests verifiëren ook bytegelijk behoud van oude preview en CSS.

Geen oorspronkelijke Studio-bestanden, klantdatabase of live website gewijzigd. Geen dependencies, lockfile, packages/shared of catalogusbestanden gewijzigd. Geen merge of deployment.

## Onafhankelijke review

Wordt aangevuld na de review van de PR-head met GPT-6 Astra op medium.
