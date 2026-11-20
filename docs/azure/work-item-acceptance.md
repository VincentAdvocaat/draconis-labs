# Ready en Done voor werkitems

Beheer werkitems in Azure Boards. Maak codewijzigingen in een eigen worktree en
koppel de GitHub-PR met `AB#<werkitem-id>`. [Azure DevOps-werkwijze](ado-github-integration.md)

## Wanneer een Story Ready is

- Beschrijf voor wie de wijziging bedoeld is en wat die persoon ermee kan doen.
- Formuleer acceptatiecriteria als waarneembaar gedrag of een controleerbaar
  resultaat. Benoem relevante fout- en grensgevallen.
- Leg de afhankelijkheden vast. Verwijs naar gekoppelde werkitems en benoem open
  keuzes, benodigde toegang of testomgevingen die de uitvoering kunnen blokkeren.
- Noteer hoe je ieder criterium controleert. Benoem het normale gebruikerspad,
  de benodigde testdata of omgeving en het verwachte resultaat.

## Wanneer een Story Done is

Koppel het bewijs aan het werkitem via de PR, CI-run of andere plek waar het resultaat te controleren is.

- **Functionele tests.** Doorloop het getroffen gebruikerspad via de normale
  ingang, zoals de UI, API of CLI. Leg de uitkomst en relevante
  regressiegevallen vast. Controleer bij een documentatiewijziging de instructies,
  voorbeelden en links die je hebt aangepast.
- **Review.** Leg bij codewijzigingen vast wie de onafhankelijke review uitvoerde,
  welke commit is beoordeeld en wat de uitkomst was. Verwerk noodzakelijke
  bevindingen en laat substantiële fixes gericht herbeoordelen. Vermeld bij
  andere wijzigingen wat inhoudelijk is nagekeken.
- **Build en CI.** Leg vast welke relevante controles zijn uitgevoerd en koppel
  de Azure Pipelines-run zodra die beschikbaar is. De repository bevat de
  actuele pipeline en de controleopdrachten. [Pipeline](../../azure-pipelines.yml) · [Controlescript](../../scripts/verify-local-integration.ps1)
- **Beveiliging.** Leg de resultaten vast van controles die bij de wijziging
  horen, zoals tests van autorisatie, gegevensisolatie, invoervalidatie of
  afscherming van gevoelige velden. Koppel relevante scanresultaten uit de
  bestaande workflow.
- **Documentatie.** Werk de gebruikersinstructies, API-contracten of
  beheerinstructies bij die door de wijziging geraakt worden.
- **Telemetrie.** Controleer bij gewijzigde logging, metrics of meldingen in de
  bedoelde testomgeving of het verwachte signaal verschijnt. Leg de uitkomst vast.
- **Deployment.** Leg bij een uitrol de omgeving, commit of artifactversie,
  release-uitkomst en de uitgevoerde smoke test vast.

Vermeld bij beveiliging, documentatie, telemetrie of deployment kort waarom een
onderdeel buiten de scope valt als daar geen bewijs voor nodig is. Sluit het
werkitem zodra het bewijs laat zien dat de acceptatiecriteria zijn behaald.

## Wanneer een Feature of Epic Done is

**Feature.** De Stories binnen de afgesproken scope voldoen aan Done. Controleer
de Feature als geheel. Doorloop de gebruikersstroom en koppelingen die in de
acceptatiecriteria staan. Leg het resultaat en eventuele vervolgitems vast bij
de Feature.

**Epic.** De Features binnen de afgesproken scope voldoen aan Done. Toets het
gezamenlijke resultaat aan het doel van de Epic en leg vast welke onderdelen
beschikbaar zijn en in welke omgeving. Koppel het bewijs van oplevering en de
werkitems voor resterende afhankelijkheden of vervolgwerk.
