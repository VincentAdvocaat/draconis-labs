# Voorstel voor EN-home in de lokale fixture

Dit is een acceptatievoorstel vóór implementatie. De kleinste volgende stap sluit de bestaande lokale home aan op dezelfde EN-redactie en expliciete siterelease. Er worden geen klantdata of echte websitebindings gebruikt.

De NL-home blijft de huidige gezaghebbende homeopslag en bestaande index.html-route gebruiken. EN deelt de bestaande home-identiteit via een compatibiliteitsadapter. Er mag geen tweede onafhankelijke NL-conceptopslag ontstaan. Leg stabiele blokidentiteiten vast voor de bestaande introductie en optionele afbeelding. Kies een additieve opslag-/migratieoplossing die de huidige document-FK's en UUID-blokvalidatie respecteert, met expliciet bewijs dat oude home-revisies leesbaar blijven.

EN bewerkt titel, slug, SEO en introductie rechtstreeks, plus per gebruik alt en optioneel bijschrift voor het NL-bronbeeld. Beeldidentiteit, versie en decoratief gebruik blijven NL-owned. Een gewijzigde bron vraagt bevestiging met behoud van lokale invoer. Geen portfolio of nieuwe blokken op de home in deze stap. Gebruik dezelfde localevalidatie, null/leeg-regels, immutable revisiepreview, retained media en finale publicatiecontrole als bestaande EN-pagina's.

Acceptatie: maak op de bestaande fictieve home een EN-variant, vul verplichte velden, bekijk exacte revisie en publiceer met expliciete navigatie- en EN-selectie. NL-index en EN-route blijven na echte procesherstart werken. Een nieuwer EN-concept verandert de actieve publicatie niet. Test migratie van oude home zonder/met beeld, idempotente heropeningen, bron- en EN-conflicten met dirty invoer, ontbrekende EN-tekst of alt, decoratief leeg, veilige unieke slug/route, beeldversiefreeze vóór async werk, rechten/hashwijziging tijdens build en retained oude releases.

Deze stap voltooit geen echte klanttemplate-aansluiting, import, algemene localeconfiguratie, productie-identiteit, back-up/restore of deployment. Daarvoor blijven afzonderlijke keuzes en bewijzen nodig. Implementatie volgt pas na akkoord op dit voorstel.
