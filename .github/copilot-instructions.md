# GitHub Copilot instructions — CareerSprint

These instructions apply to **all code, configuration, tests, and documentation** in this repository. Read `docs/PROJECT_OVERVIEW.md`, `docs/ARCHITECTURE.md`, and the relevant topic document before making nontrivial edits. Treat **the repository source as the final authority** when documentation and implementation differ. Update the docs whenever behavior, data contracts, or deployment steps change.

## Product and users
CareerSprint is a private, mobile-friendly interview preparation tracker for an experienced Azure/.NET software engineer preparing for SDE II / Senior Engineer interviews. It tracks a 12-week study plan (2026-11-23 through 2027-02-14), DSA/C# practice, system-design drills, mock interviews, weekly reviews, confidence, time spent, and notes. Priorities: usable, reliable, simple, inexpensive to operate, privacy-conscious, accessible.

## Current repository — do not hallucinate a different stack
- Frontend: **plain HTML/CSS/vanilla JavaScript ES modules** in `web/`; no React, npm app, framework, bundler, or frontend build step yet. Do **not** describe it as React or introduce React unless explicitly requested.
- Seed plan: `web/seed.json` (96 sessions: 60 `Coding + concept`, 12 `System design`, 12 `Mock interview`, 12 `Weekly review`). 60 coding entries link to related HackerRank exercises; 12 design entries link to Microsoft Learn references. These are references/practice analogues, not necessarily exact problem matches.
- Frontend behavior: `web/app.js`, styling `web/styles.css`, layout `web/index.html`.
- Cloud API: .NET **10**, C# isolated-worker Azure Functions v4 in `api/`, `GET /api/progress`, `PUT /api/progress`.
- Persistence: Azure Cosmos DB for NoSQL, database `careersprint`, container `progress`, partition key `/id`, one document per authenticated user. Browser localStorage fallback **only** on localhost or 127.0.0.1.
- Auth: Azure Static Web Apps built-in `/.auth/login/aad`; SWA restricts app and `/api/*` to `authenticated`; API verifies `x-ms-client-principal` and derives the user document id from the trusted principal. Never rely on an arbitrary client-provided user ID.
- CI/CD: `.github/workflows/deploy-azure-static-web-app.yml`; pushes to `main` validate/build/deploy when the Azure resource and repository secret exist. PRs create preview deployments.
- Outlook: **ICS export only**; NO automatic Microsoft Graph/Outlook sync.

## Engineering rules
1. Preserve existing functionality, session IDs, calendar data, notes, progress, JSON/CSV/ICS exports, and cloud migration behavior. Treat user data as irreplaceable.
2. Make **small, reviewable changes**. State which files were changed and why; surface assumptions. Avoid unnecessary dependencies and broad rewrites.
3. **Security is mandatory:** protect API routes; enforce per-user authorization server-side; never commit connection strings, deployment tokens, `local.settings.json`, `.env` secrets, or user data; never log credentials or raw identity headers; escape untrusted text before inserting HTML; validate outbound resource links. Prefer managed identity over account keys in future backend revisions if configured correctly.
4. Keep local and deployed behavior distinct: `python -m http.server` serves the browser-only app and **does not run the API, Entra auth, or Cosmos DB**. Do not claim an E2E cloud test passed based on HTTP 200 from the frontend.
5. Maintain data compatibility. If adding fields to `web/seed.json`, `normalize`, JSON imports/exports, and persisted sessions, audit `api/ProgressFunctions.cs` models and serialization. **Known issue:** backend `Session` currently does not declare the `resourceUrl`, `resourceLabel`, `resourceNote`, `resourceKind` fields; round-trip persistence can drop them. Address with a tested, backward-compatible fix when touching the API or resource links.
6. The cloud sync uses ETag concurrency. Preserve `If-Match` / 409 handling; **do not silently overwrite conflicting edits**. Document any new conflict-resolution approach.
7. Use consistent labels: `Not started`, `In progress`, `Completed`, `Skipped`. Session IDs must stay unique. Dates use `YYYY-MM-DD`; times are strings `HH:mm`, interpreted as America/Los_Angeles by the plan/ICS export.
8. Accessibility: use semantic controls, labels, keyboard access, focus indicators, sufficient contrast, sensible responsive layouts. Avoid introducing XSS through `innerHTML`.
9. Deployment should remain inexpensive: SWA Free and Cosmos free tier when eligible. Cloud resources are **not provisioned** by checking in the workflow. Avoid unapproved recurring-cost infrastructure.
10. Add/adjust tests with logic changes. Run `node validate.mjs` and `node --check web/app.js`; when .NET SDK is available run `dotnet restore api/CareerSprint.Api.csproj` and `dotnet build api/CareerSprint.Api.csproj -c Release`. A passing syntax check alone does not prove functionality.

## File guide
- `docs/PROJECT_OVERVIEW.md`: scope, users, requirements, definitions of done
- `docs/ARCHITECTURE.md`: runtime components, data flows, auth and sync
- `docs/DATA_AND_API.md`: session schema, API, Cosmos model, migrations
- `docs/LOCAL_DEVELOPMENT.md`: local runs and debugging
- `docs/DEPLOYMENT.md`: GitHub Actions, Azure configuration and security
- `docs/TESTING.md`: commands, cases and known gaps
- `docs/ROADMAP.md`: planned work and priorities
- `docs/DECISIONS.md`: design rationale and trade-offs
- `README.md`: high-level operational entry point

## Workflow when asked to implement a feature
1. Locate the entry points, inspect existing tests, and read relevant docs.
2. Explain short plan; identify compatibility/security/cost implications.
3. Implement the smallest end-to-end change (UI + API + migration/docs/tests if needed).
4. Run applicable checks and report **exactly** what ran, passed, failed, or was not possible.
5. Give manual verification steps for browser-only and hosted/authenticated modes separately.

## Response style for Copilot
Prefer concrete patches and C# / JS examples consistent with this repo. Distinguish **implemented**, **proposed**, and **untested**. Do not invent Azure deployments, GitHub repository state, package installations, or successful integrations.
