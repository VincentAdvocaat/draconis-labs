# Planner with test tokens

Use this profile to test the Planner REST authorization flow on loopback with
synthetic data. The SQLite store has one workspace, named `local`. The server
loads test sessions and workspace membership at startup.

| Workspace role | Planner permissions |
| --- | --- |
| Owner | Read and edit tasks, delete tasks, edit preferences |
| Editor | Read tasks and preferences, create and update tasks |
| Viewer | Read tasks, history and preferences |

Requests with a missing, invalid or expired session receive a
`401 UNAUTHORIZED`. An authenticated account without permission or membership
receives `403 FORBIDDEN`. Requests for any workspace other than `local` receive
the same `403` after authentication. This also applies to cursor pagination
and retries of task creation.

Start it from the repository root in PowerShell 7. Choose an unused loopback
port. The example writes a new SQLite database and a fixture file with an
expiring token hash in a temporary directory.

~~~powershell
$fixture = Join-Path ([IO.Path]::GetTempPath()) ("draconis-identity-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $fixture | Out-Null
$token = [guid]::NewGuid().ToString("N")
$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($token))).ToLowerInvariant()
$env:DRACONIS_LOCAL_IDENTITY_FILE = Join-Path $fixture "identity.json"
$env:DATABASE_PATH = Join-Path $fixture "planner.sqlite"
$env:HOST = "127.0.0.1"
$env:PORT = "31321"
@{
  ownerId = "fixture-owner"
  members = @(@{ userId = "fixture-editor"; role = "editor" })
  sessions = @(@{
    userId = "fixture-owner"
    tokenHash = $hash
    expiresAt = [DateTime]::UtcNow.AddHours(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
  })
} | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $env:DRACONIS_LOCAL_IDENTITY_FILE
$token
corepack pnpm dev:api
~~~

In another terminal, use the printed token for requests to
`GET /api/v1/workspaces/local/tasks` and `GET /api/v1/workspaces/other/tasks`.
Send it in an `Authorization: Bearer <test-token>` header. The server documents
the active profile at `/api/v1/openapi.json`.

This profile serves versioned Planner workspace and discovery routes. The
implicit-workspace Planner aliases and Bookings routes are unavailable in this
profile. Use a separate test database and a new terminal for the ordinary local
API. The fixture IDs are stable across sessions and appear in `createdBy`. Test
sessions cover authentication and workspace permissions. OIDC sign-in, Entra
registration and multi-workspace storage have separate acceptance criteria.
