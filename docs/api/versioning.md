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
| system | `/api/v1/system` | Discovery and metadata |

New app modules register through the server composition layer without importing
Planner internals. See `server/api/src/core/` and `server/api/src/modules/`.

## Contract checks

CI diffs the committed OpenAPI snapshot (`server/api/openapi/v1.snapshot.json`)
against the generated spec from `buildApp()`. The test fails when the snapshot
is missing or out of date. Breaking changes require a major version bump.
