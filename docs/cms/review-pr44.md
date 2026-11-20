# Onafhankelijke review PR44

PR https://github.com/VincentAdvocaat/draconis-labs/pull/44. Bronchat `01a1f49b-5ee0-7010-83f3-b62b8b94b041`.

Subagent `/root/review_pr44`, GPT-6 Astra medium, leverde geen beginstand of concrete controle-uitvoer na begrensde statusvragen en is definitief onderbroken. De geautoriseerde aparte chat `01a1f895-9093-7713-a9dd-e3c1e39391d1` gebruikt hetzelfde model en reasoning medium. Geen dubbele actieve review of modelsubstitutie.

## Eerste volledige review

Reviewerchat `01a1f895-9093-7713-a9dd-e3c1e39391d1`. Lokale HEAD, remote branch en refs/pull/44/head exact `1e88334f40081a93a84000605d3bd4ac2d438960`, base `22f5c66659ab4abadb6a1f65b34b92846dce959f`. Werkboom voor/na schoon. Alleen zes deltafiles beoordeeld en contact-template.ts gelezen voor de bestaande renderergrens. Geen subagents, edits, externe comments, merge of deployment.

Status wijzigingen nodig, twee noodzakelijke P2-contractfixes.

### P2: weiger niet-gecontroleerde resourcevormen

static-export.ts regels61-66, vooral63. De HTML-tak scant alleen geciteerde href/src. Inline script/style, style-attributen, srcset en ongeciteerde src passeren. Een bronartifact met overeenkomstige manifesthash kan daardoor als complete export worden geaccepteerd met externe resources. De gedocumenteerde gewone Python-host voegt geen CSP toe; de strikte acceptatie-CSP is geen eigenschap van het artifact. Huidige renderers produceren deze vormen niet, dus geen aangetoonde regressie in de huidige tien routes; wel een gat in de expliciete closureweigering, vergelijkbaar met bad-link-tests.

Eigen read-only bewijs: exacte closurefunctie uit bron gelezen, alleen TS-types in geheugen verwijderd met transpileModule, functie met Map(index.html→bytes) aangeroepen. Geaccepteerd: inline script fetch naar example.invalid, inline style met externe url, img srcset met externe afbeelding en ongeciteerde img src met externe URL. Geciteerde externe img src werd terecht geweigerd.

Kleine voorgestelde fix: fail-closed voor inline actieve inhoud en niet-ondersteunde resourceattributen/syntax vóór kopiëren. Bekende lokale externe contact.js/contact.css behouden. Geen JS-interpreter/parserframework of rendererwijziging. Algemene JS-resourceanalyse buiten scope documenteren. Hash-consistente negatieve tests met geen doel na afwijzing.

### P2: controleer bytebudget vóór readFileSync

static-export.ts regels97-99. Een heel bestand wordt ingelezen en gehasht voordat size>256MiB wordt gecontroleerd. Een1GiB-bestand reserveert dus eerst1GiB, eventueel naast eerder gebufferde bestanden. De beloofde grens voorkomt zo geen OOM/native leesfout. Bewijs is de callvolgorde; geen groot bestand aangemaakt om hostbelasting te vermijden.

Kleine voorgestelde fix: gebruik de reeds beschikbare lstat-grootte van het reguliere bestand om resterend budget vóór de read te controleren. Behoud controle op werkelijk gelezen bytes achteraf. Onafhankelijke filesystemwriters blijven buiten scope. Begrensde test die afwijzing vóór de grote read aantoont. Apart manifestbudget is optionele hardening, geen derde noodzakelijke bevinding.

### Eigen controles en grenzen

Eigen8/8 exporttests met maxWorkers2 groen,11,50s. Geen volledige suite opnieuw gestart. Selectie/identity/hashes/sanitized manifest/canonical paden/staging/targetweigering passen bij single-owner-fixturescope. Targetcheck/rename is geen garantie tegen onafhankelijke filesystemwriters, expliciet buiten scope, dus geen bevinding. Geen overige noodzakelijke bevindingen. Browseracceptatie is parentbewijs.

Parentbewijs: eerste workspacepoort groen. Laatste default4-worker API op dezelfde SHA had twee oude hersteltimeouts: roundtrip5886ms>5s en catalog-beforeAll12849ms>10s;366passed/1timeout/10skipped. Volledige2-workerherhaling had376passed/1timeout/0skipped; alleen oude roundtrip8052ms>5s. Nul diff voor oude hersteltests/modules tegen base bevestigd. De reviewer claimt deze suite niet als groen. Geïsoleerde1-worker oude roundtrip is daarna bij parent groen, maar de concrete prestatieoorzaak is daarmee nog niet vastgesteld. Geen timeout-/configwijzigingen.

## Fix en herreview

Fix door `/root/fix_pr44_export`, GPT-6.1 Sol, reasoning low, gepusht als `349db0b3bfc2e2c85bfe852a7788ea3a9b571c69`. Alleen static-export.ts en eigen exporttests gewijzigd. Beperkte huidige producentensyntax wordt fail-closed gecontroleerd; bestandsgrootte en resterend budget vóór de read, werkelijke bytes achteraf. Eigen18/18 exporttests, API-typecheck/lint/build/diffcheck groen. Finale CLI-herexport van alle27 outputfiles bytegelijk aan het browserartifact.

Dezelfde Astra-medium reviewchat `01a1f895-9093-7713-a9dd-e3c1e39391d1` bevestigde lokale HEAD en remote refs/pull/44/head op `349db0b3bfc2e2c85bfe852a7788ea3a9b571c69`. Alleen fixdelta tegenover1e88334 beoordeeld,85 toevoegingen/6 verwijderingen in de twee genoemde bestanden. Status: beide noodzakelijke P2's GESLOTEN, geen resterende noodzakelijke bevindingen binnen de gerichte scope. Geen merge/deploymentautorisatie.

P2-1: regels40-71 controleren expliciete syntax/element/attribuutvormen; closure94-100 gebruikt gevalideerde attributen. Inline scriptbody wordt geweigerd, script vereist src. Style-element/style-attribuut/on*/srcset/http-equiv en onbekende resourcevormen vallen buiten de allowlist; ongeciteerde waarden falen syntaxcontrole. Lokale externe contact.js/css houden dezelfde closure. Negen hash-consistente HTML-regressies bewijzen afwijzing vóór doelcreatie; rijke fixture en CLI slagen. Algemene analyse van externe JS-inhoud blijft expliciet buiten scope, geen algemeen parserframework toegevoegd.

P2-2: regels132-138 controleren pad/regulier bestand en stat.size tegen het resterende256MiB-budget vóór readFileSync, plus cumulatieve werkelijke bytes achteraf. De test kiest het tweede bestand en trekt bytes van het eerste af. De read-spy bewijst dat het overbudgetbestand niet wordt gelezen, zonder grote allocatie en zonder doelmap. Single-owner-grens blijft behouden.

Eigen herreviewcheck:18/18 exporttests met maxWorkers2,11,40s, standaardtimeouts; diffcheck1e88334→349db0b groen. Geen bestanden gewijzigd, geen nieuwe reviewers, externe comments, merge of deployment. Geen volledige API-run door de reviewer. Typecheck/lint/build en bytegelijke herexport zijn parentbewijs.

Bewijsgrens: volledige seriële377/43 groen hoort bij vorigehead1e88334, niet bij de fixhead. Oude parallelle4/2-worker-timeouts blijven vermeld. De volledige fixheadrun wordt afzonderlijk gerapporteerd na de afgestemde hosttestplek. De reviewer is klaar en mag na vastlegging worden gearchiveerd.

Optioneel apart manifestbudget is niet ingevoerd binnen deze kleine publieke-copybudgetfix. Het formaat blijft beperkt tot eigen geproduceerde fixtures;256MiB is geen algemeen procesgeheugenbudget. Er is geen andere optionele scope-uitbreiding overgenomen.


## Afzonderlijke diagnose van de bestaande hersteltest

Op exact1e88334, zonder bron-/configwijziging, slaagde de geïsoleerde oude roundtrip met1 worker en standaardtimeout. De reeds gestarte seriële volledige API-run sloot daarna groen:377 tests in43 bestanden,320,38s, `--maxWorkers=1 --no-file-parallelism`, ongewijzigde timeouts. Dit maakt de eerdere default4-/2-worker-timeouts niet achteraf groen.

Om de fasen te onderscheiden is op de ongewijzigde base22f5c666 één tijdelijke plain-scriptprofielkopie van exact dezelfde eerste case uitgevoerd. Dezelfde API-volgorde en native assertions, geen Vitesttimeout gewijzigd en geen tracked bron aangepast. Assertions en cleanup slagen. Fasen: fixture-opbouw1,282s; bronapp openen0,085s; home/publicatievoorbereiding0,528s; bron sluiten0,041s; backup inclusief validatie/FS1,013s; restore0,696s; twee heropeningen/controles0,194s; assertions totaal3,840s en cleanup0,066s.

SQLitebackupAPI zelf was23,995+18,174ms. JavaScriptmetingen:658 reads780,9ms,163 writes694,4ms,2041 lstat220,8ms en170 mkdir149,8ms. Hash update/digest samen10,45ms. Geen process-spawn gemeten in deze case. Veel bestandswerk/fixture-opbouw verklaart dus het grootste gemeten JS-aandeel; de native backup en hashing waren in dit profiel klein. Native SQLite-interne I/O is niet volledig onderdeel van de JS-filesystemtellers. HostCPUsteekproeven varieerden97% vóór tot28% na de profielrun; een latere steekproef70%, disk4% en queue0. Dit is één profiel met instrumentatie, geen exclusief causaal bewijs voor iedere volledige-suitetimeout en geen aparte Vitestpass op base.

Er is geen herstelcode, oude test of timeout aangepast binnen PR44. Splitsing of andere stabilisatie van die brede case hoort alleen afzonderlijk en afgestemd met de media/recovery-eigenaar. Het profielscript staat uitsluitend genegeerd in de baseworktree; er zijn alleen counts/tijden gerapporteerd, geen tokens of databaserijen.

## Finale parentcontrole op de gereviewde runtimehead

Op exact `349db0b3bfc2e2c85bfe852a7788ea3a9b571c69` slaagt `corepack pnpm --filter @draconis/api exec vitest run --maxWorkers=1 --no-file-parallelism`: 43/43 bestanden en 387/387 tests, 232,32s. Oorspronkelijke timeouts, geen bronwijziging tijdens de run. De testplek was afgestemd met de mediachat en is na afloop vrijgegeven. De eerdere parallelle timeouts blijven hierboven vermeld. Dit is de volledige finale API-controle; de overige 51 tests en compiled Planner-/CLI-smokes behoren tot de eerdere workspacepoort.

Alle eigen statische listeners op3058/3060/3061 en CMS/API op3055/3056 zijn na de proef gesloten. Na de gereviewde runtimehead volgen uitsluitend documentatiewijzigingen. Reviewstatus gesloten; reviewerchat wordt na duurzame vastlegging gearchiveerd en blijft via het genoemde id herbruikbaar.
