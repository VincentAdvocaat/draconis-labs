# Voorbereiding installatie en upgrade

Deze instructie bereidt een toekomstige proef voor. Er is in deze stap geen
systeeminstallatie, uninstall, signing of schone-machineacceptatie uitgevoerd.
De bestaande unsigned Squirrel-proef en Node/Electron-toolchain zijn het
uitgangspunt. De runtimekeuze blijft voorlopig volgens ADR 001.

## Benodigd bewijs

Gebruik een wegwerp-Windows-VM met standaardgebruiker, een snapshot vóór de
proef en uitsluitend fictieve gegevens. Bewaar twee versiegebonden pakketten,
hun SHA-256-hashes, runtimeversies en Authenticode-status. Een unsigned pakket
mag nooit als ondertekende release worden beschreven. Gebruik de bestaande
build-/package-instructies; een nieuw pakket is op zichzelf geen installatietest.

1. Leg gebruikersrechten, vrije schijfruimte en VM-versie vast. Kies een eigen
   profiel buiten de appmap en registreer het absolute pad.
2. Installeer versie A onder de standaardgebruiker. Registreer eventuele
   elevatievraag, bestandspaden, snelkoppeling en eerste start. Omzeil geen
   Windows-beveiligingsmelding automatisch.
3. Maak fictieve taken, een herhaaltaak, relatie, afspraak met aparte interne
   aankomsttijd, zonecapaciteit en blokkade. Sluit de app en maak met de
   ondersteunde backupfunctie een consistente volledige databasebackup.
4. Bewaar IDs, versies, vensters, gebeurtenissen en receipts als vergelijking.
   Start opnieuw en controleer dezelfde gegevens vóór upgraden.
5. Installeer versie B via het beoogde upgradepad. Controleer exacte waarden,
   migratiemarker, schrijven na upgrade en nogmaals herstart. Vervanging van
   een uitgepakte appmap telt niet als installerupgrade.
6. Test herstel uitsluitend met een kopie naar een nieuw eigen profiel.
   Downgrade niet rechtstreeks over een gemigreerde database. Leg expliciet
   vast welke versie de backup kan openen.
7. Spreek databehoud af vóór een toekomstige uninstall. Controleer daarna
   verwijderde programmabestanden en het overeengekomen profielgedrag.

Per stap zijn werkelijk resultaat, log/screenshot en afwijkingen nodig.
Afvinken op basis van alleen een gebouwd Setup.exe is onvoldoende. Signing,
automatische updates, OIDC en cloudherstel vereisen afzonderlijke proeven.
