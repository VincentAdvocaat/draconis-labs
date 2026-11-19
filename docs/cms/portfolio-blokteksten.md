# Redactionele portfolio-blokteksten

De kop boven het portfolio en de tekst bij een lege snapshot zijn CMS-velden. Een redacteur kan beide in NL en EN invullen zonder codewijziging. De waarden staan in het portfolio-blok van de onveranderlijke paginarevisie en worden met de volledige siterelease gepind. Catalogusinhoud en bronchecksum veranderen hierdoor niet.

De editor toont paginataal en bloktaal afzonderlijk. Deze stap blijft een Nederlandse pagina met een gekozen NL- of EN-portfolio; volledige pagina-, SEO- en navigatietalen zijn nog open. De CMS-bediening is evenmin volledig vertaald.

Het bestaande gedeelde localecontract valideert de kaarten. Voor kop en lege-staattekst is in de gekozen bloktaal een rechtstreekse niet-lege waarde vereist. Deze velden vallen niet terug op een andere taal. Een ontbrekende waarde wordt als null bewaard; bewust leeg als lege string. Beide mogen in een concept staan, maar blokkeren preview/publicatie voor de gekozen bloktaal. De vorige actieve release blijft behouden. De lege-staattekst is ook vereist als de gekozen snapshot items bevat, zodat een wissel naar een lege snapshot geen impliciete tekst introduceert.

Eerdere immutable portfolio-revisies bevatten deze velden nog niet. Hun renderer behoudt de expliciete bestaande NL/EN-compatibiliteitsteksten. Nieuwe saves krijgen deze kaarten als opgeslagen startwaarden. De server schrijft eerdere revisies of releases niet om. Een latere tekstwijziging blijft een nieuw concept tot expliciete publicatie.

Verificatie: alle 117 API/componenttests slagen; workspace-typecheck en lint zijn groen. De workspacebuild slaagde, waarna alleen de labelstructuur in de editor is verduidelijkt; de normale CMS-start heeft ook die actuele frontend succesvol gebouwd. De nieuwe tests dekken escaping, NL-pagina/EN-blok, nieuwe concepttekst naast actieve release, heropenen, lege catalogussnapshot, gekozen lege-staattekst en afwijzing van null/leeg zonder fallback. De browser op 3021 heeft beide Engelse velden bewerkt, de eigen kop privé bekeken en gepubliceerd, en de publicatie na normale procesherstart behouden.

Zie de [acceptatiematrix](acceptatiematrix.md) voor de overige centrale tekstcriteria. Alleen fictieve lokale gegevens; geen merge of deployment.
