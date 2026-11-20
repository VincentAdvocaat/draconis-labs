# Voorstel gewone mergeketen37 →43 →46

Niet uitgevoerd. Deze taak maakt geen mainmerge, retargeting, deployment, PR-sluiting of branchverwijdering.

## Exacte gecontroleerde keten

| PR | Tip | Huidige base |
| --- | --- | --- |
| [37](https://github.com/VincentAdvocaat/draconis-labs/pull/37) | `fc43090d0f90892df97d7e033bef66b772c81aa8` | main |
| [43](https://github.com/VincentAdvocaat/draconis-labs/pull/43) | `22f5c66659ab4abadb6a1f65b34b92846dce959f` | feature/local-modules-integration |
| [46](https://github.com/VincentAdvocaat/draconis-labs/pull/46) | `65a3dd3ec1f5b579f57fb526cf84b8b86fd377bb`, [review](review-pr46.md); finale docs-tip in PRbody | feature/local-modules-integration-v2 |

PR43 bevat de volledige eerdere CMS42/media41-ketens. PR46 voegt whole PR44 `b4ef056286fe8d028e418eb99eb10d9472bf0e58` en whole PR45 `29fa8357276911795e006f976be56d0dc236f4b2` toe. Vooraf37 ancestor43,43 ancestor46 en44/45 ancestors46 gecontroleerd. Alle oorspronkelijke bron-PR's blijven via gewone merges ancestors; [blobherkomst](blobherkomst.md) legt de nieuwe bestanden vast.

Uitgelezen origin/main `aed2c5369dab5243006e8f856f401b22e3113e90`; lokale main `8691861019a679173aa87b09367dce4fb920ec78`. Beide zijn door deze taak ongewijzigd. Read-only merge-tree origin/main→46 was conflictvrij. Dit is een momentopname, geen uitgevoerde merge en geen garantie bij een latere nieuwe main.

## Alleen na een expliciete mergeopdracht

1. Haal actuele remote main en PR37/43/46/44/45-tips op. Vergelijk de exacte SHAs met dit plan, de gesloten reviewrapporten en finale PRbody. Gewijzigde code/base vereist gerichte delta-inspectie, controles en passende herreview.
2. Bevestig actuele volledige poort, bronancestry, blobherkomst en gesloten noodzakelijke bevindingen. Interne Astra-review is geen formele GitHub-approval of externe CI-uitkomst.
3. Merge37 naar main met een gewone mergecommit. Geen squash/rebase.
4. Controleer ancestry. Retarget43 pas daarna naar main en controleer resterende diff; merge43 met een gewone mergecommit op de bevestigde tip.
5. Controleer opnieuw. Retarget46 pas daarna naar main en controleer resterende diff; merge46 met een gewone mergecommit op de bevestigde tip.
6. Merge de al opgenomen oudere module-/bron-PR's niet daarnaast opnieuw. Lees hun actuele GitHub-status na de merges; claim automatische sluiting niet vooraf. Handmatige sluiting en branchverwijdering vragen een toepasselijke opdracht.
7. Draai de reproduceerbare poort op een nieuwe schone checkout van de verkregen main. Gebruik uitsluitend nieuwe fictieve opslag. Dit is nacontrole, geen deployment of klantmigratie.

## Herstelgrens

Bewaar alle sourceheads en review-/acceptatierapporten. Een afzonderlijk gereviewde revert van een merge is geen database-downgrade. CMS8/catalogus5/uploadschema1 en additief herstelmanifest0/1 blijven expliciete contracten. Offline synthetische restore bewijst geen productie-SLA. Identity, hosting, signing, Outlook, klantimport en live omschakeling blijven afzonderlijke besluiten.

