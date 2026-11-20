# Publieke fotocredit voor een portfolio-item

Het veld **Publieke fotocredit** in het catalogusitem bevat de naam of tekst die bezoekers bij de foto mogen lezen. Vul het in bij het gewenste bestand en sla het concept op. Een nieuwe portfoliosnapshot neemt de credit op in het overzicht, het categoriefilter en de detailpagina. De naam wordt letterlijk weergegeven. Alleen het label wisselt met de gekozen NL- of EN-publicatietaal.

Bij een ander asset of een andere bestandsversie vraagt het item om een nieuwe expliciete credit. Laat het veld leeg om de credit in de volgende publicatie weg te laten. Bestaande snapshots behouden de foto en credit die bij hun publicatie waren vastgelegd.

De item-API accepteert `publicPhotoCredit` als tekst van maximaal 200 tekens. Lege tekst en `null` wissen het veld in het concept. Als een API-client het veld weglaat, blijft de eerder ingevoerde credit gekoppeld aan hetzelfde asset, dezelfde bestandsversie en hetzelfde gebruik. De bestaande rechtenbeslissing blijft vereist om te publiceren. De publieke renderer leest alleen de credit uit het gepubliceerde item.

```powershell
corepack pnpm --filter @draconis/api exec vitest run tests/catalogus.test.ts tests/catalogus-ui.test.ts
```
