# Tweede gezamenlijke consolidatie

Lokale integratiebranch `feature/local-modules-integration-v2`, vanaf exact PR37 `fc43090d0f90892df97d7e033bef66b772c81aa8`. De oorspronkelijke integratietip en main zijn ongewijzigd. Geen echte klantdata, site-import, live omschakeling, deployment of extra features.

Volledige gereviewde brontips:

| Keten | Opgenomen tip | Review |
| --- | --- | --- |
| CMS PR40 → PR42 | `df6ec600aff4cdd8fff69640844cc882836bc0d0` | Contactruntime `3fe4da5`, recoveryruntime `65643c9`; volledige rapporten in docs/cms/review-pr40.md en review-pr42.md. |
| Catalogus PR38 → PR39 → PR41 | `3bc54baa1cafdb9e0a82118a4b419820af66de65` | Bibliotheek, categorieën en volgorde afzonderlijk Astra medium akkoord. |

De whole-tip merges zijn `b9296fca698f1e19d38c3887fac070896c1bf56e` en `36f3367cd9adfd317dd455b8e50acd5013a1b3b0`; de eerste SHA wordt bij herkomstcontrole ingevuld. De veranderde padsets overlappen niet. Er waren geen tekstconflicten of handmatige overnames van losse modules.

De enige bedoelde functionele integratiedelta is CMS09-ondersteuning voor feitelijke catalogusschema's 3, 4 en 5. Zie [bewijs en grenzen](bewijs.md). Library-, categorie-, order-, CMS-editor-, template- en Plannercode zijn afkomstig uit de brontips.

Alle oorspronkelijke GitHub-PR's blijven open. Reviewgesloten betekent niet gemerged. Deze integratie-PR komt bovenop de vaste PR37; een gezamenlijke mainlanding vraagt een afzonderlijke opdracht.
