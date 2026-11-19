# Toetsenbord en gezamenlijke lokale demo

19 november 2026. Deze vervolgstap staat bovenop de nog ongemergde PR #33.

De gedeelde dialoog begrenst Tab/Shift+Tab, behoudt focus bij callbackwijziging
en herstelt de opener na Escape of sluiten. Medewerkers krijgen focus terug
na een afgeronde opdracht; fouten krijgen focus op de melding. De publieke
pagina focust het aangeboden tijdvak, de foutmelding of de bevestigingskop.
Onzekere retries behouden dezelfde aanvraag en sleutel.

De Chrome-proef gebruikte alleen fictieve gegevens. Via Tab/Enter is een
relatie aangemaakt. Na opslag kon Shift+Tab terug naar Telefoon en Tab terug
naar Opslaan. In Voorkeuren ging Shift+Tab vanaf het paneel naar Opslaan,
Tab terug naar Sluiten en Escape terug naar de opener. Publiek is een onbekende
postcode met Enter geweigerd; de melding kreeg focus, Tab bracht de bezoeker
naar postcode. Een geldige zoekopdracht focuste de eerste radio. Spatie,
Tab, invullen en Enter bevestigden één afspraak met focus op de bevestigingskop.
Een eerdere reeks tijdens live codewijzigingen is afgebroken en niet als
geslaagde boeking geteld. Bewijs: `evidence/keyboard-public.png` en
`evidence/keyboard-staff.png`. Native screenshots kunnen één paint achterlopen;
de expliciete AX-focuscontrole bepaalt hier de geregistreerde focusuitkomst.

Betekenisvolle ReactDOM-regressies falen op de oude implementatie en slagen
na de fix. Ze dekken ook onzekere retry met gelijke payload/sleutel en zonder
extra mutatie. Dit foutscenario is met gecontroleerde clients getest; er is
geen claim dat in Chrome een werkelijke verloren commitresponse is opgewekt.
De volledige suite heeft 155 tests: 117 API, 20 UI, 7 core, 5 shared en 6 desktop.
Typecheck en lint slagen. De build behoudt de bestaande bundelgroottewaarschuwing.

`demo:local` start twee API's en twee ontwikkelservers met één commando,
controleert eerst de vier poorten en maakt een eigen tempdatabase plus kanaal.
Twee echte starts en Ctrl+C zijn uitgevoerd; na afsluiten waren de vier
listeners weg. Bij een nieuwe start ontstaat een nieuwe demo. Bewaarde gegevens
kunnen met de losse terminalinstructies worden heropend. Er worden geen
gebruikersprofielen geopend of verwijderd. Zie [demo](demo-lokaal.md) en het
[voorbereidende installatiedraaiboek](installatie-upgradeproef.md).

Deze controle is geen volledige toegankelijkheidsaudit. PostgreSQL, OIDC,
Outlook, cloudhosting, echte installatie/upgrade op schone machine, signing
en updatevertrouwen blijven open. De PR-keten #9, #12, #15, #20, #23, #28,
#30 en #33 is nog ongemergd; de nieuwe PR bouwt daarop voort.
