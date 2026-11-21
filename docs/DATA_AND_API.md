# Data model, persistence and API contract

## Session record (browser / seed)
The `web/seed.json` schema is the most complete example of a session:

```json
{
  "id": "prep-001",
  "date": "2026-11-23",
  "week": 1,
  "type": "Coding + concept",
  "title": "W01 — Two Sum",
  "description": "Study instructions",
  "start": "20:30",
  "end": "21:45",
  "status": "Not started",
  "minutes": "",
  "confidence": "",
  "notes": "",
  "resourceUrl": "https://www.hackerrank.com/challenges/icecream-parlor/problem",
  "resourceLabel": "Practice on HackerRank: Ice Cream Parlor",
  "resourceNote": "Equivalent pair-sum / hash-map pattern",
  "resourceKind": "hackerrank"
}
```

`minutes` and `confidence` may be blank strings in browser/seed; the frontend sends JSON `null` for blanks when saving to the API. Status allowed values: `Not started`, `In progress`, `Completed`, `Skipped`. Confidence range 1–5; minutes >= 0. Current session types: `Coding + concept`, `System design`, `Mock interview`, `Weekly review` (user-added types may also be present).

**Session resource link whitelist (frontend):** HTTPS only and host `www.hackerrank.com`, `learn.microsoft.com`, or `leetcode.com`. Update validator/tests when intentionally adding trusted sources.

## Problem library and revision state
The static catalog in `web/problem-library.json` contains curated problem IDs, titles, difficulty (`Easy`, `Medium`, `Hard`), algorithm pattern, estimated minutes, LeetCode URL, and a short practice cue. Catalog definitions are shipped with the frontend; only user review state is persisted. Each `problemReviews` entry has `problemId`, `attempts`, `lastReviewed`, `nextReview`, and nullable confidence (1–5). Marking a review schedules the next revisit in 1, 3, 7, 14, or 30 days for confidence 1–5 respectively. Review records are keyed by catalog problem ID and do not alter scheduled session IDs or contents.

LeetCode links are HTTPS and restricted by the frontend to the exact `leetcode.com` hostname. `validate.mjs` checks the catalog metadata and link host.

## Cosmos DB item
- Account type: Cosmos DB for NoSQL.
- Database: `careersprint` (can be overridden by `COSMOS_DATABASE`).
- Container: `progress` (can be overridden by `COSMOS_CONTAINER`).
- Partition key path: `/id`.
- One item per user: `id = "user-" + <SWA principal userId>`; properties include `sessions`, `problemReviews`, and `updatedAt`.
- Never allow browser-provided IDs to select another user's document.

## API operations (managed Functions through SWA)

### `GET /api/progress`
Authenticated only.

Existing document -> HTTP 200, `ETag` response header and body:
```json
{"sessions": [{"id": "prep-001", "date": "2026-11-23"}], "problemReviews": [{"problemId": "two-sum", "attempts": 1, "lastReviewed": "2026-11-23", "nextReview": "2026-11-30", "confidence": 3}], "updatedAt": "2026-11-23T04:00:00Z"}
```
The example session is intentionally shortened; full records contain all fields.

No document -> HTTP 200, `{"sessions": null}`. Authentication failure -> 401. Storage failure -> 503.

### `PUT /api/progress`
Authenticated only. `Content-Type: application/json`, optional `If-Match` with previously received `ETag`:

```json
{"sessions": [{"id": "prep-001", "date": "2026-11-23", "week": 1, "type": "Coding + concept", "title": "W01 — Two Sum", "description": "...", "start": "20:30", "end": "21:45", "status": "Completed", "minutes": 35, "confidence": 4, "notes": "Used dictionary"}], "problemReviews": [{"problemId": "two-sum", "attempts": 1, "lastReviewed": "2026-11-23", "nextReview": "2026-11-30", "confidence": 3}]}
```

Success -> HTTP 200, body `{"updatedAt": "..."}`, new `ETag`. Missing ETag is interpreted as create (and conflicts if document already exists). Stale ETag or conflicting create -> HTTP 409. Bad data -> 400; too large (detectable seekable body) -> 413; auth failure -> 401; data failure -> 503.

Current backend constraints: up to 500 sessions and 500 problem reviews; title <= 160 chars; IDs <= 120; notes <= 8,000; description <= 10,000; week 1–52; minutes 0–1440; confidence 1–5; dates match `YYYY-MM-DD`; unique session and problem IDs; limited body length (900,000 chars). Some constraints are enforced only on API, not consistently in the UI; reconcile if modifying validation.

Older API documents and JSON backups may omit `problemReviews`; the API defaults this to an empty list and the frontend accepts older backups.

## Serialization contract and tests
`Session` includes all browser resource fields (`resourceUrl`, `resourceLabel`, `resourceNote`, `resourceKind`) so Cosmos persistence does not drop the metadata. Newtonsoft.Json attributes define the Cosmos document names. The API request and response use System.Text.Json; request binding is case-insensitive for DTO properties and response serialization applies camel case. These are separate contracts and must remain covered by `api.Tests` round-trip tests.

The API tests simulate Cosmos JSON persistence with Newtonsoft.Json and mock the Cosmos Container calls to verify per-user partition keys and `If-Match` options. They do not replace a live Cosmos emulator or Azure integration test.

## Backward compatibility
- Keep session IDs stable across seed edits.
- Normalize optional fields and recognize older localStorage/JSON backups.
- Preserve user notes, status, minutes, confidence on seed changes.
- New fields should have sensible defaults and be accepted by both UI and API.
- No deployed migrations exist yet; changing document structure warrants explicit upgrade/migration tests.
