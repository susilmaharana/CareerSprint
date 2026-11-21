# Architecture and data flows

## Stack as implemented

```text
Local preview:  browser -> python HTTP server -> web/*
                        -> browser localStorage

Hosted:         browser -> Azure Static Web Apps (web/*)
                    |           |-- built-in Microsoft login: /.auth/login/aad
                    |           `-- SWA route authorization
                    `-> /api/progress -> managed .NET 10 isolated Azure Functions
                                             -> Cosmos DB for NoSQL
                                                database: careersprint
                                                container: progress
                                                partition key: /id
```

No React app, node frontend build, API gateway, separate App Service, scheduled worker, or Graph backend is present today.

## Frontend modules
- `web/index.html`: dashboard, calendar, sessions, insights, modal markup.
- `web/styles.css`: themes/layout/responsive styles; `web/contrast.css` applies readable contrast overrides to secondary text and labels.
- `web/app.js`: one ES module that loads seed JSON, handles state, rendering, form events, exports, auth and persistence.
- `web/seed.json`: canonical seeded plan. IDs such as `prep-001` and `design-001` identify seeded sessions.
- `web/problem-library.json`: curated static problem catalog; review attempts and due dates are stored separately from scheduled sessions.
- `web/staticwebapp.config.json`: SWA runtime, protected routes and fallback.

### Browser startup
1. Read `localStorage` key `careersprint-sessions-v1`; otherwise load seed.
2. Normalize fields and merge missing seeded **system-design** drills.
3. Determine mode based on host: `localhost` or `127.0.0.1` -> browser-only; other host -> attempt SWA auth + API.
4. In hosted mode, call `/.auth/me`, redirect to `/.auth/login/aad` if unauthenticated, then `GET /api/progress`.
5. If cloud document exists, use cloud sessions; otherwise optionally migrate browser progress, then save.
6. Edits update local state and browser cache; in hosted mode changes are saved to the API with ETags.

**Important:** this hostname heuristic means non-Azure remote preview domains will attempt cloud/auth APIs. For remote development, make mode configurable deliberately; do not bypass auth in production.

## Auth and trust boundaries
- SWA route rules restrict `/*` and `/api/*` to `authenticated`.
- Azure injects `x-ms-client-principal` to the managed API; C# checks the `authenticated` role and extracts `userId`.
- Cosmos document ID is `user-{userId}`, and the document partition key equals its `id`.
- Do not expose the Functions service directly without a separate trusted authentication boundary. A spoofed principal header must **not** be accepted from the public internet.
- Connection strings belong only in backend environment configuration, never JavaScript or the git repository.

## Concurrency and durability
- `GET /api/progress` provides an `ETag` header for an existing item.
- `PUT /api/progress` uses `If-Match` for replacement; the API returns 409 on stale ETag or create conflict.
- On conflict, frontend stops automatic writes and asks for JSON backup/reconciliation; it does not merge changes automatically.
- API stores sessions and problem review metadata inside one per-user Cosmos document (low-complexity design for a small study plan; server currently allows up to 500 sessions/reviews and payload ~900k characters).
- Cosmos is authoritative in cloud mode. localStorage is a browser-side cache/preview store, **not** guaranteed bidirectional offline sync.

## Persistence modes matrix
| Behavior | Localhost | Deployed SWA |
|---|---|---|
| Frontend | Yes | Yes |
| Browser localStorage | Primary | Cache/fallback migration |
| Microsoft login | No | SWA built-in provider |
| `/api/progress` | Not used | Required |
| Cosmos DB | No | Required |
| Multi-device sync | No | Intended, once deployed/configured |
| ICS manual export | Yes | Yes |

## Known design risks
1. Session DTOs use Newtonsoft.Json attributes for Cosmos persistence while HTTP request/response bodies use System.Text.Json. The resource fields are now present in the DTO; keep both serializer contracts aligned and covered by `api.Tests` round-trip tests.
2. `mergeStudyPlan` deliberately only re-adds missing **System design** sessions, to avoid restoring other user-deleted seeded sessions. Confirm desired deletion semantics before changing.
3. A single large per-user document is inexpensive and simple but can hit Cosmos item-size/update contention limits at scale.
4. Auth support and .NET 10 managed API runtime availability must be checked against Azure's current service/runtime support before deployment.
