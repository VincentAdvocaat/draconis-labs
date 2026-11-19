# Gedeeld redactioneel localecontract v1

Afgestemd met CMS en orchestrator op 19 november 2026. Deze aparte contractstap begint op gereviewde snapshotbeheercommit `1213dc891e9a582ad2a5a8440ab621feb719cdcf` uit PR 16. Zij implementeert uitsluitend een pure shared-helper, tests en exports. Er is geen runtimevertaalengine, opslagmigratie of taal-UI in deze PR.

## Eigenaarschap en hergebruik

`packages/shared/src/schemas/content-locale.ts` is de enige gedeelde redactionele locale-helper. De bestaande shared-conventie voorkomt extra packages, dependency- of lockmutaties. De export staat als apart blok achteraan `packages/shared/src/index.ts`, afgestemd met Planner. UI-voorkeuren en bestaande Planner-i18n veranderen niet.

CMS22 en de volgende catalogusflow hergebruiken dezelfde gereviewde commit, types en tests. Zij bouwen geen tweede fallback-helper. De eerste ondersteunde inhoudstalen zijn `nl` en `en`.

## Context en betekenis van waarden

`ContentLocaleContext` bevat expliciet `defaultLocale`, gekozen `locale` en optioneel `fallbackLocale`. Default en gekozen taal zijn verplicht. De helper raadt geen van beide en gebruikt de default niet automatisch als fallback. Een expliciet gekozen fallback moet verschillen van de gekozen taal.

`LocalizedTextValues` bewaart per locale een string, null of geen sleutel. Null, undefined in een in-memory object en een ontbrekende sleutel betekenen een ontbrekende variant. Een lege string is bewust lege inhoud. De helper overschrijft die niet met een fallback. Ook een bestaande waarde met spaties blijft ongewijzigd; verplichte velden moeten wel niet-lege inhoud na trim hebben.

`resolveContentField(values, context, {allowFallback})` geeft `value`, `sourceLocale`, `isFallback`, `missing` en `explicitEmpty`. Een directe string wint altijd. Fallback werkt alleen als de context die expliciet kiest én de veldregel het toestaat. De functie schrijft geen vertaling terug.

`validateContentField(values, context, rule)` gebruikt dezelfde resolutie en geeft `valid` plus veldissues terug. Vereiste, niet beschikbare of blanco inhoud geeft required/required_direct. De functie valideert geen slugvorm of uniciteit; die horen bij repository en databaseconstraint. Decorative-alt is een mediaregel van de aanroepende module, die expliciet lege alt bewaart.

## Eerste afgesproken publicatiekeuze

Dit is een gezamenlijke ontwerpkeuze voor CMS/catalogus v1, geen universele verplichting voor iedere tekst of toekomstige schema's. De export `CONTENT_PUBLICATION_RULES_V1` bevat:

| Veld | Direct nodig in publicatietaal | Toegestane fallback |
| --- | --- | --- |
| Titel | Ja, niet blanco | Geen |
| Slug | Ja, niet blanco, aanvullende slugregels in service | Geen |
| Betekenisvolle per-use alt | Ja, niet blanco | Geen |
| Beschrijving | Optioneel | Alleen expliciet gekozen fallback en schema-toestemming |

Een bewust lege beschrijving blijft leeg. Een ontbrekende optionele beschrijving zonder fallback wordt weggelaten. Decorative-alt blijft expliciet leeg in de gekozen taal; de media-module controleert die gebruikskeuze.

Privédiagnostiek mag een expliciet gekozen fallback tonen met bronlocale en een duidelijke markering. Zij gebruikt daarvoor de resolutiefunctie, zonder de verplichte publicatieregel te wijzigen. Een NL-titel tonen als gemarkeerd EN-privévoorbeeld maakt een ontbrekende directe EN-titel dus niet publiceerbaar. Diagnostiek materialiseert geen vertaling in een invoerveld of opslagrecord.

De generic helper kan ook andere expliciete schemaregels verwerken. Aanroepende modules gebruiken voor de afgesproken velden bovenstaande versie 1, zodat preview en publicatie niet met tegenstrijdige regels werken. Een latere policywijziging krijgt een nieuw expliciet contract; oude snapshots blijven gepind.

## Migratievoorstel voor de volgende kleine runtimeflow

1. Verklaar de bestaande bekende catalogusfixtures expliciet als defaultLocale nl. Behoud alle item-, categorie- en asset-ID's, fileVersions en defaultslugs. Echte websites blijven hun reeds vastgelegde CMS-default volgen; er wordt geen taal uit tekst of browser afgeleid.
2. Sla localevariantvelden apart op, met website/collectie/itemrevisie/locale als identiteit. Bestaande revisies en snapshot-JSON blijven immutable. Een adapter verklaart de bestaande schema-1-velden als de bekende NL-defaultvariant; hij wijzigt oude publicaties niet.
3. Bewaak sluguniciteit met een echte constraint op website/collectie/locale/slug. De helper doet geen uniqueness-check. Een EN-slug mag gelijk zijn aan de NL-slug, zolang er binnen dezelfde taal en collectie geen conflict is. Oude default-URL's blijven geldig.
4. Laat de medewerker EN-titel, EN-slug en EN-alt handmatig invullen. Toon ontbrekende variant en expliciet gekozen fallback als aparte diagnostiek, met bronlocale. Kopieer geen NL-fallback stilzwijgend naar EN-opslag.
5. Iedere nieuwe publicatie legt de gekozen taal, expliciete fallback en default vast in de immutable snapshot. De service gebruikt de gezamenlijke veldpolicy, plus bestaande rechten-, slug-, alt- en bestandscontroles. CMS-release pint CatalogRef, checksum en dezelfde taalkeuze.
6. Behoud oude NL-snapshots en ingetrokken routes. Nieuw publiceren maakt een nieuw snapshot-ID. Intrekken blijft overzicht, details en assets onder dat ID blokkeren.

Dit is een migratievoorstel, niet uitgevoerd in de contract-PR. De volgende end-to-end stap krijgt eigen runtime-tests en browserbewijs voor NL-behoud, EN-invoer, ontbrekende directe velden, bewuste lege beschrijving, gemarkeerde fallback, uniqueness, heropenen en snapshotretentie. Er wordt geen automatische of betaalde vertaling gebruikt.

## Verificatie

```powershell
corepack pnpm --filter @draconis/shared test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

De shared tests gebruiken de publieke package-export en bewijzen directe waarden, expliciete fallback, ontbrekend tegenover leeg, verplichte directvelden, private diagnostiek tegenover publicatie en pure ongewijzigde invoer. CMS en catalogus gebruiken dezelfde tests als contractbasis. Onafhankelijke review volgt vóór runtime-hergebruik.
