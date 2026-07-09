# Draconis Labs agent-integratie

AI-agents communiceren met Draconis Labs via gewone HTTP. Dit document is
geschikt om als projectinstructie in Cursor, Claude Code of Codex te gebruiken.

## Configuratie

- Basis-URL lokaal: `http://localhost:3001`
- Authenticatie: `Authorization: Bearer <api-key>`
- Ontwikkelsleutel: `dev-agent-key`
- Content-Type bij mutaties: `application/json`

Gebruik in productie een eigen sleutel via `DRACONIS_API_KEYS`. API-keys worden
alleen gehasht in de database opgeslagen. De naam vóór de dubbele punt wordt
als maker op de kaart getoond.

## Taak aanmaken

```powershell
$headers = @{
  Authorization = "Bearer dev-agent-key"
  "Content-Type" = "application/json"
}
$body = @{
  title = "Controleer de release notes"
  description = "Aangemaakt vanuit een AI-agent"
  plannedDate = "2026-07-10"
  priority = "high"
  labels = @("release", "agent")
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3001/api/planner/tasks" `
  -Headers $headers `
  -Body $body
```

Met curl:

```bash
curl -X POST http://localhost:3001/api/planner/tasks \
  -H "Authorization: Bearer dev-agent-key" \
  -H "Content-Type: application/json" \
  -d '{"title":"Controleer de release notes","priority":"high","labels":["agent"]}'
```

## Taken ophalen

```bash
# Alles
curl http://localhost:3001/api/planner/tasks

# Actief voor vandaag plus vandaag afgerond
curl "http://localhost:3001/api/planner/tasks?date=today"

# Eén lane
curl "http://localhost:3001/api/planner/tasks?lane=doing"

# Eén geplande datum
curl "http://localhost:3001/api/planner/tasks?date=2026-07-10"

# Geschiedenis vanaf een datum
curl "http://localhost:3001/api/planner/history?from=2026-07-01"
```

## Taak wijzigen

```bash
curl -X PATCH http://localhost:3001/api/planner/tasks/TASK_ID \
  -H "Authorization: Bearer dev-agent-key" \
  -H "Content-Type: application/json" \
  -d '{"lane":"done"}'
```

Ondersteunde velden: `title`, `description`, `lane`, `plannedDate`,
`position`, `priority` en `labels`. Lanes zijn `todo`, `doing` en `done`;
prioriteiten zijn `low`, `normal`, `high` en `urgent`.

## Taak verwijderen

```bash
curl -X DELETE http://localhost:3001/api/planner/tasks/TASK_ID \
  -H "Authorization: Bearer dev-agent-key"
```

Agents horen bestaande taken eerst op te halen om duplicaten te voorkomen.
Verwijder nooit een taak zonder expliciete opdracht van de gebruiker.
