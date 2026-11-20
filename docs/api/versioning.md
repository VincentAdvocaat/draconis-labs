# API versioning

Draconis Labs exposes a **versioned** REST API. Integrators should use `/api/v1`
paths; older unversioned paths remain available during a deprecation window.

## Current version

| Item | Value |
|------|-------|
| Stable prefix | `/api/v1` |
| OpenAPI spec | `GET /api/v1/openapi.json` |
| Interactive docs | `GET /api/v1/docs` (local dev) |
| Module catalog | `GET /api/v1/system/info` |

## Deprecation policy

1. **Breaking changes** require a new major version (`/api/v2`, etc.).
2. **Non-breaking additions** (new optional fields, new endpoints) ship in the
   current version.
3. **Deprecated paths** respond with:
   - `Deprecation: true`
   - `Sunset: <RFC 7231 date>`
   - `Link: </api/v1>; rel="successor-version"`
4. Unversioned `/api/*` aliases mirror `/api/v1/*` until sunset **2026-12-31**.

## Modules (v1)

| Module | Prefix | Description |
|--------|--------|-------------|
| planner | `/api/v1/planner` | Tasks, history, preferences |
| planner-workspaces | `/api/v1/workspaces/{workspaceId}` | Workspace tasks, history, preferences with shared response envelopes |
| system | `/api/v1/system` | Discovery and metadata |

New app modules register through the server composition layer without importing
Planner internals. See `server/api/src/core/` and `server/api/src/modules/`.

## Local Planner agent integration

Read `/api/v1/system/info` to discover the available modules and
`/api/v1/openapi.json` for the operation and schema definitions. Use `local`
as the workspace ID, so task operations start at `/api/v1/workspaces/local/tasks`.
Send `Authorization: Bearer <api-key>` to identify the agent. A created task
records the key's configured name as `createdBy`. The local UI can call these
routes without a key. Planner keys have no per-operation scopes.

Workspace responses wrap results as `{ "ok": true, "value": ... }` and errors
as `{ "ok": false, "error": { "code": ..., "status": ..., "message": ... } }`.
An invalid Bearer key returns `401 UNAUTHORIZED`. Task updates require the
task's current `version`. On `409 VERSION_CONFLICT`, `error.task` contains the
current task.

Use `page=1` to get the first page of a task or history list. `pageSize` defaults
to 50 and accepts values between 1 and 200. A paginated response places
`items`, `total`, `page` and `pageSize` inside `value`. Keep the same filters
when requesting the next page. The response `value` is an array when no
pagination mode is selected.

For cursor pagination on the workspace task list, start with
`GET /api/v1/workspaces/local/tasks?pagination=cursor&pageSize=50`. The response
`value` contains `items`, `pageSize` and `nextCursor`. Pass `nextCursor` unchanged
as `cursor` on the next request and repeat the same filters. `null` marks the end
of the list. The API returns `400 INVALID_INPUT` for a malformed cursor, a
cursor used with different filters or a request that combines a cursor and
`page`. Relative date filters such as `date=today` need a new cursor after
local midnight. Tasks are ordered by lane, position and ID. Pages read current
data, so moves and edits between requests can change which tasks appear.

Task creation has no idempotency key. If the response is lost, check the task
list for an existing result before repeating the create request.

## Contract checks

CI diffs the committed OpenAPI snapshot (`server/api/openapi/v1.snapshot.json`)
against the generated spec from `buildApp()`. The test fails when the snapshot
is missing or out of date. Breaking changes require a major version bump.

The compiled API smoke (`corepack pnpm --filter @draconis/api smoke:start`)
uses its own loopback process and synthetic storage to check discovery,
Bearer identity, task creation, pagination and version conflicts over HTTP.
