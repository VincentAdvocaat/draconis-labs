# Voorgesteld mainmergeplan

Nog niet uitgevoerd. Mainmerge, branchverwijdering, het handmatig sluiten van oorspronkelijke PRs en deployment vragen een afzonderlijke toepasselijke opdracht. Dit plan maakt die keuze reviewbaar.

## Vastgezet resultaat

Draft-PR37 bevat de volledige CMS-, Planner- en catalogus/docs-tips uit [het plan](plan.md). [opgenomen-prs.json](opgenomen-prs.json) bewijst dat alle toen open oorspronkelijke PR-heads inclusief PR36 ancestors van de tijdelijke integratie zijn. Het gaat om één samengevoegd eindresultaat, niet om opnieuw losse foundations of consumercommits toepassen.

De uitleescontrole vóór afronding zag main aed2c5369dab5243006e8f856f401b22e3113e90, draftstatus true, mergeable MERGEABLE en mergeStateStatus CLEAN. GitHub gaf geen statuschecks en geen formele reviewDecision terug. De lokale testpoort en interne Astra-review worden daarom expliciet met SHA en rapport vastgelegd; ze worden niet als GitHub-CI of formele externe PR-approval voorgesteld.

## Uitvoeringsvoorstel na afzonderlijke opdracht

1. Haal main en alle oorspronkelijke PR-heads opnieuw op. Vergelijk met de vastgezette heads. Bij nieuwe code of gewijzigde base: stop de mergehandeling, maak de integratieverschillen concreet en draai de toepasselijke poort/review opnieuw.
2. Controleer dat de finale PR37-head exact overeenkomt met de gesloten interne review, behoudens expliciet alleen documentatie. Verifieer de volledige reproduceerbare poort en het bewijs dat de zes eigen proeflisteners zijn gestopt. Laat productiecriteria open.
3. Maak de draft pas daarna gereed en merge uitsluitend PR37 met een gewone mergecommit die de opgenomen geschiedenis bewaart. Geen squash/rebase die de ancestryrelatie met alle oorspronkelijke PRs wegneemt. Pas dit toe op de gereviewde head; geen losse oude PRs daarnaast nogmaals mergen.
4. Lees na de merge de GitHub-status van alle oorspronkelijke PRs opnieuw. Sommige kunnen door ancestry automatisch afgehandeld worden; claim dit niet vooraf. Rapporteer de werkelijk resterende open PRs. Sluit die pas bij toepasselijke opdracht met verwijzing naar de integratiecommit en het overgenomen eindresultaat. Verwijder geen branches of worktrees automatisch.
5. Voer de lokale poort uit op een nieuwe schone checkout van de nieuwe main. Gebruik nieuwe synthetische opslag en gescheiden loopbackpoorten. Dit is nacontrole van main, geen deployment of klantimport.

## Herstelgrens

Bewaar de integratiebranch, vastgezette tips en reviewrapporten. Bij een codeprobleem na de voorgestelde merge kan een afzonderlijk gereviewde revert van die mergecommit het code-eindresultaat terugdraaien. Dit is geen databaseherstelplan. Echte gegevensmigratie, back-up/restore en productieactivatie blijven afzonderlijk te beslissen; de huidige proeven hebben alleen eigen synthetische gegevens gebruikt.

## Eigenaren

CMS-chat beheert de integratiebranch en conflictoplossingen. Planner-eigenaar levert de gereviewde Planner-tip en ondersteunt gerichte Planner-vragen. Media/catalogus-eigenaar levert de gereviewde contract- en compositietips en ondersteunt gerichte catalogusvragen. De onafhankelijke Astra-reviewer controleert de integratiedelta; de gebruiker beslist over mainmerge en eventuele externe opvolging.
