# Onafhankelijke review PR 42

PR https://github.com/VincentAdvocaat/draconis-labs/pull/42. Reviewer `/root/review_pr42`, GPT-6 Astra, reasoning medium. Bronchat `01a1f49b-5ee0-7010-83f3-b62b8b94b041`. Alleen-lezen, geen externe comments, merge of deployment.

## Eerste review

Lokale en remote head `f5b086e32b04bbe0a65e6d267ce0d573f256e332`, base `d3b881b63b29350b4ed575544f5441fd6b9cb92e`. Status changes requested, één noodzakelijke P2.

P2 in recovery.ts regels 86-87 en 173-174. Backup en quiesce maken `.recovery.lock` met hun PID en verwijderen die alleen in finally. Bij een procescrash blijft de lock staan. Serve weigert te starten, quiesce strandt op EEXIST en backup naar een nieuw doel ook. De intacte bronfixture is zonder handmatige bestandsingreep onbruikbaar.

Zelfstandig gereproduceerd met een nieuwe eigen fixture en niet-bestaand PID 2147483647. Serve: Offline recovery owns this fixture. Quiesce en backup-new-target: EEXIST .recovery.lock. Oplossing: expliciet offline herstel van stale recoverylock, geldig PID, uitsluitend na ESRCH, ongewijzigde inhoud, weigering levende/ongeldige eigenaar. Gelijktijdige acquisitie mag geen nieuwe eigenaar verwijderen. Tests voor stale/live en herstart plus backup na herstel.

Geen andere noodzakelijke bevindingen of optionele uitbreidingen. Zelfstandig alle 6 hersteltests groen. Afzonderlijke reproductie uitgevoerd en eigen tijdelijke fixture opgeruimd. Beide SQLite-writerreserveringen/backup-API, startuphandshake, manifest/hashes, paden/junctions, nieuwe secrets, no-overwrite, gedeeltelijke-foutcleanup en retry beoordeeld. Bestaande tests ondersteunen die paden; crashlock ontbrak. Gerichte herreview volstaat.

## Fix en herreview

Fix door `/root/fix_pr42_lock`, GPT-6.1 Sol, reasoning low, commit `65643c9b448cd139a2f51c4d61ca6fd1fa76fbf4`. SQLite BEGIN IMMEDIATE serialiseert recoveryacquisitie, reclaim en vrijgave. Alleen expliciete quiesce verwijdert een geldige stale PID-marker na ESRCH en ongewijzigde bytes. Levende, ongeldige, gewijzigde of niet aantoonbaar dode eigenaren blijven behouden; vrijgave verwijdert geen vervangende marker. Backup hergebruikt de CMS-reservering en behoudt de mediareservering.

Typecheck, lint en diffcheck groen. Gerichte suite 9/9 groen met standaardtimeout en maxWorkers 2. Eén eerdere run raakte bij de bestaande uitgebreide restoretest 5097ms tegenover 5s; diagnostische en definitieve standaardherhaling groen. Geen timeoutwijzigingen opgenomen.

De oorspronkelijke reviewer `/root/review_pr42` leverde na fix geen herreviewresultaat of concrete status, ook na gecontroleerd hervatten en een laatste begrensde statusbeurt zonder tools. De uitvoering is definitief onderbroken. Op expliciete opdracht is `/root/review_pr42_recovery` met een eigen context, hetzelfde GPT-6 Astra model en reasoning medium gestart als vervanging. Alleen de P2-fixdelta is overgedragen, inclusief het originele rapport en testbewijs. Dit is geen dubbele brede review. Er is nog geen herreviewgoedkeuring geclaimd.


## Vervangende herreview via geautoriseerde chatfallback

Ook vervangende subagent `/root/review_pr42_recovery` leverde geen begincheck, toolresultaat of status na een begrensde statusvraag en is definitief onderbroken. Beide subagentuitvoeringen liepen technisch vast zonder herreviewuitvoer. De geautoriseerde aparte chat `01a1f85b-6a3d-76f2-a7c5-cfc9e7e7cfca` gebruikte hetzelfde GPT-6 Astra model, reasoning medium, en leverde onmiddellijk daadwerkelijke controle-uitvoer. Geen modelsubstitutie of dubbele actieve reviewer.

Gerichte herreview APPROVED, P2 GESLOTEN op `65643c9b448cd139a2f51c4d61ca6fd1fa76fbf4`. Lokale HEAD, remote branch en remote refs/pull/42/head bevestigd. Delta uitsluitend `f5b086e32b04bbe0a65e6d267ce0d573f256e332` naar deze fixhead. Protocol en runtime-lockcontext gelezen. Geen nieuwe noodzakelijke bevindingen of optionele scope-uitbreidingen.

Bewijs van de reviewer:

1. recovery.ts regels 89-112 reserveert cms.db met BEGIN IMMEDIATE vóór controle, acquisitie of overname van de marker. Reservering blijft vast tot na vrijgave. Concurrerende recoverycommando's kunnen de stale-controle en verwijdering niet doorkruisen. Een procescrash laat de SQLite-reservering los.
2. Regels 82-87 en 98-104 laten uitsluitend expliciete quiesce een bestaande marker overnemen na geldige positieve PID, ESRCH en hervergelijking van markerbytes. Live/hergebruikte PID, ongeldige inhoud, EPERM en gewijzigde bytes worden geweigerd. Backup gebruikt recoveryLease zonder reclaim op regel 201.
3. Regels 109-112 verwijderen bij vrijgave alleen eigen ongewijzigde markerbytes en sluiten de transactie in finally. Vervangende marker blijft behouden. Het offline-single-owner-contract blijft bepalend; externe bestandswriters vallen daarbuiten.
4. Regels 201-210 en 242-244 behouden CMS-reservering gedurende de volledige backup plus media-writerreservering. Beide databases blijven via afzonderlijke read-only verbindingen en de SQLite backup-API gekopieerd. Geen live-atomiciteitsclaim of overwrite toegevoegd.
5. Tests regels 100-143 dekken oorspronkelijke blokkade, herstel, beide bron-DB-hashes, restart en volgende backup; ook live/invalid/EPERM/changed-markerweigering, concurrerende acquisitie en behoud vervangende marker.

Zelfstandig uitgevoerd door de reviewchat: 9/9 hersteltests met maxWorkers 2, 13,20 seconden totaal zonder timeoutaanpassing of retry; API-typecheck, API-lint en diffcheck van de exacte delta groen. Gitstatus vóór/na alleen dit reeds bestaande ongetrackte rapport, geen tracked wijzigingen.

Validatiegrens: de test simuleert de marker met een niet-bestaande PID; geen extra echte proceskillproef of volledige workspace-suite uitgevoerd door de reviewer. Code-inspectie en negen gerichte tests onderbouwen sluiting binnen CLI-owned synthetische tempfixtures. Geen echte klantfolders, edits, externe comments, merge, deployment of extra reviewers. Reviewerchat kan na vastlegging worden gearchiveerd en voor dezelfde PR worden hergebruikt.
