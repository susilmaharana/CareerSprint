# Test strategy, commands and quality gates

## Existing automated checks
```sh
node validate.mjs
node --check web/app.js
dotnet restore api/CareerSprint.Api.csproj
dotnet build api/CareerSprint.Api.csproj -c Release
dotnet test api.Tests/CareerSprint.Api.Tests.csproj -c Release
```
`validate.mjs` checks 96 unique plan entries, 12 system-design entries, 60 HackerRank links, the Problem Library metadata and practice-link hosts, SWA auth route settings, and runtime string. **These are smoke checks**, not comprehensive frontend, integration, security, accessibility or live cloud tests.

## Manual browser-only test checklist
- [ ] Start static server from `web/` and load `http://localhost:8080`.
- [ ] Dashboard renders; total sessions = 96; dates begin 2026-11-23 and end 2027-02-14.
- [ ] Navigate overview / calendar / all sessions / insights.
- [ ] Search, week/status filters and selected-day list operate correctly.
- [ ] Edit status, notes, minutes and confidence, refresh; values persist.
- [ ] Add/edit/delete a custom session; confirm intended behavior on refresh.
- [ ] `Solve on HackerRank` opens HTTPS in new tab; Microsoft Learn design resources open.
- [ ] Export JSON, CSV, ICS; inspect sample records; import JSON backup and verify progress.
- [ ] Check responsive layout at desktop and phone widths, keyboard navigation and modals.
- [ ] Problem Library filters by title, difficulty, and pattern; review queue add/remove actions persist after refresh.
- [ ] Mark a problem reviewed at each confidence level and verify the corresponding next-review interval (1, 3, 7, 14, or 30 days); verify JSON backup/import preserves the queue.
- [ ] Check console errors and broken links.

## Automated API test coverage
`api.Tests` contains 13 xUnit tests. They cover authenticated-principal parsing and rejection, per-user document isolation, validation, legacy payload compatibility, resource/review JSON round-trips, Cosmos Container partition-key and conditional-write options, missing-record behavior, and create/update/stale-ETag conflict behavior using mocked persistence.

## Hosted integration checks still needed
- [ ] Verify SWA routing redirects anonymous users and the hosted Functions API returns 401 without a trusted principal.
- [ ] Verify API read/write and ETag conflict behavior against a disposable Cosmos DB account or emulator.
- [ ] Confirm data migration from an old 84-session backup adds 12 design drills and preserves original progress.
- [ ] Confirm no accidental client secrets or identity header exposure in hosted responses/logs.
- [ ] Verify the managed .NET 10 API starts and authenticates in an actual Azure environment.

These unit tests do not connect to Cosmos DB or prove hosted SWA identity-header trust. Frontend browser tests for exports and event handlers also remain future work. CI runs the API test project before `Azure/static-web-apps-deploy@v1`.

## Release definition of done
Code reviewed, compatible data contract, documented changes, automated checks green, browser smoke test green, authenticated Azure API smoke test green for cloud-related changes, no secrets committed, and rollback path understood.
