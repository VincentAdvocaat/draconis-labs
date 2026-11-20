# Voorstel gewone merge van PR37 en PR43

Niet uitgevoerd. De gebruiker beslist afzonderlijk over retargeting, mainmerge, PR-sluiting, branchverwijdering en deployment. Deze taak heeft main niet gewijzigd.

## Vastgezette basis en controle

- PR37: `feature/local-modules-integration`, exact `fc43090d0f90892df97d7e033bef66b772c81aa8`. Bevat de eerdere volledige CMS/Planner/catalogusfoundationketen en reviewrapporten.
- PR43: `feature/local-modules-integration-v2`, review- en runtimehead `ea12b79ce8095878edc4d10ce3f260e3b35b9bf2`, inclusief gesloten P2-herreview. De eerste runtime was91493ac. De laatste documentatiehead staat bij de definitieve PR-opvolging.
- Nieuwe whole tips: CMS42 `df6ec600aff4cdd8fff69640844cc882836bc0d0` en catalogus41 `3bc54baa1cafdb9e0a82118a4b419820af66de65`. PR40 is ancestor van42; PR38/39 van41. Beide chains en PR37 zijn ancestors van43.
- Uitgelezen remote main: `aed2c5369dab5243006e8f856f401b22e3113e90`. De lokale mainref `8691861019a679173aa87b09367dce4fb920ec78` is in deze taak niet bijgewerkt of gemuteerd. Base het toekomstige besluit op opnieuw opgehaalde remote main.
- Read-only merge-treecontrole van remote main met37 en43 slaagde zonder conflicten. Remote main is ancestor van37, en37 van43. Dit heeft geen ref of checkout veranderd en voert geen echte merge uit.

## Na een afzonderlijke mergeopdracht

1. Haal actuele main en alle relevante PR-heads op. Vergelijk met bovenstaande vaste runtime-/reviewheads en de definitieve documentatiehead uit PR43. Nieuwe code of gewijzigde base vraagt deltaonderzoek en toepasselijke checks/review, geen blind doorgaan.
2. Bevestig gesloten interne reviews, volledige416-testpoort of actuele opvolger, bronblobherkomst en gestopte eigen listeners. Interne Astra-review is niet hetzelfde als een formele GitHub-approval of externe CI-check. Houd productiecriteria open.
3. Maak PR37 pas na die opdracht gereed en merge37 naar main met een gewone mergecommit. Geen squash of rebase: ancestry van alle opgenomen oorspronkelijke PRs moet blijven bestaan.
4. Controleer dat main nu PR37 bevat. PR43 heeft momenteel de featurebranch van37 als base. Retarget43 pas dan naar main en controleer opnieuw dat de resterende diff uitsluitend de tweede consolidatie is. Merge43 vervolgens met een gewone mergecommit op zijn gereviewde head.
5. Merge de reeds opgenomen oude foundation-, CMS-, Planner-, media-, categorie- of order-PRs niet daarnaast opnieuw. Lees hun GitHub-status na beide merges opnieuw; claim automatische sluiting niet vooraf. Handmatige sluiting alleen na toepasselijke opdracht met verwijzing naar de overnemende integratiecommit. Geen automatische branch/worktreeverwijdering.
6. Draai de reproduceerbare poort op een nieuwe schone checkout van de nieuwe main en start uitsluitend nieuwe eigen fictieve opslag. Dit is nacontrole, geen deployment of echte gegevensmigratie.

## Herstelgrens

Bewaar de integratietips, sourceheads, rapporten en synthetische bewijsartefacten. Een afzonderlijk gereviewde revert van de gewone merge kan code terugdraaien, maar is geen database-downgrade. CMS09 bewijst alleen eigen offline synthetische hersteldoelen, niet een productieherstelprocedure. Klantimport, productie-identiteit, kosten/hosting, signing, echte omschakeling en deployment blijven afzonderlijke besluiten.
