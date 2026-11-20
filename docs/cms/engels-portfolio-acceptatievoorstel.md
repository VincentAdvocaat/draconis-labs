# Voorstel voor portfolio op een EN-pagina

Dit is een scope- en testvoorstel, geen implementatieopdracht. De eerstvolgende stap sluit alleen het bestaande portfolioblok aan op de EN-paginavariant.

## Kleinste scope

NL blijft eigenaar van blok-ID, type en volgorde. De EN-variant gebruikt dezelfde structuur en kiest voor dat portfolioblok expliciet een gepubliceerde `CatalogRef`, checksum en volledige localecontext uit de bestaande snapshotselectie. Geen catalogusitems of mediabestanden kopiëren naar EN-paginavelden. Een bronstructuurwijziging vraagt bevestiging met behoud van bestaande EN-invoer, zoals bij beeld.

De redacteur ziet paginataal, bloktaal, snapshot-ID, checksum en eventuele expliciete fallback afzonderlijk. De EN-selectie accepteert uitsluitend een snapshot met gekozen locale `en`. De defaultLocale komt uit de snapshot en wordt niet afgeleid uit de paginataal. Een catalogus kan NL als standaard houden en een EN-snapshot aanbieden. De consumer blijft controleren dat referentie, checksum en localecontext exact overeenkomen. NL-itemdata mag niet als EN worden gelabeld; een bestaande expliciete veldfallback blijft zichtbaar via het cataloguscontract.

De bestaande NL/EN-maps voor portfolio-kop en lege-staattekst blijven het redactionele model. De gekozen bloklocale vereist een directe waarde. De EN-revisie bewaart de gekozen maps en catalogusbinding immutable. Er komt geen nieuwe tekstcatalogus of extra editorfunctie bij.

Preview gebruikt de exacte EN-revisie en diens draft-consumerpin. Publicatie bevriest de selectie vóór async werk en gebruikt de bestaande retained releasepins en complete finale consumergate. NL- en EN-gebruik van hetzelfde block-ID moeten afzonderlijke eigenaren/pins en veilige publiek bereikbare beeldpaden houden. Oude tekst- en beeldvarianten en eerdere releases blijven leesbaar.

## Acceptatiebewijs vóór afronding

- API: dezelfde blok-ID/volgorde, uitsluitend geldig expliciet gekozen EN-snapshot; verkeerde website, checksum, localecontext of NL-snapshot voor EN weigeren. DefaultLocale en fallbackcontext exact behouden.
- Redactie: eigen EN-kop en lege-staattekst, ontbrekend versus leeg, bronstructuurwijziging en behoud van dirty invoer bij conflict of vervanging.
- Immutable preview: nieuwere NL-structuur, catalogussnapshot of EN-draft veranderen de oude preview niet. Gepubliceerde EN-variant blijft bij NL-only publicatie behouden.
- Release: EN-itemtitel/beschrijving/alt en heading komen uit dezelfde gekozen context; de echte EN-route levert exact de gekopieerde bytes via veilige absolute paden. Zowel gevuld als leeg portfolio testen.
- Async: na snapshotfreeze een nieuw concept of nieuwe catalogussnapshot maken; de lopende build houdt zijn oude selectie. Rechten, intrekking of hashwijziging tijdens de build blokkeren nieuwe activatie en behouden de vorige complete release.
- Retentie en herstel: oude pin/releasebestanden blijven behouden na nieuwe selectie en echte procesherstart. Bestaande complete finale pinset en twee-database-reconcile behouden, zonder nieuwe crash-atomiciteitsclaim.
- Normale browserflow: expliciete EN-snapshot kiezen, kop/leegstaat redigeren, preview, navigatie- en taalpublicatieselectie, publicatie en herstart. Geen AI-vertaling, nieuwe cataloguseditor, home-EN of algemene localeconfiguratie.

Na akkoord op dit voorstel volgt een afzonderlijke PR met onafhankelijke Astra-review. PR32 krijgt deze uitbreiding niet.
