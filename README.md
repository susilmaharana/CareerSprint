# CareerSprint Cloud — Azure Static Web Apps + .NET 10 + Cosmos DB

**Status: source code ready for deployment; Azure resources have NOT been provisioned.**

This upgrades the original CareerSprint dashboard to a cross-device, Microsoft-sign-in app with a per-user cloud record in Cosmos DB. It includes a 96-session interview plan (Nov 23, 2026–Feb 14, 2027), calendar, editable sessions, confidence scores, insights, a Problem Library with a revision queue, and JSON / CSV / Outlook ICS exports.

## Architecture

```text
Browser (HTML/CSS/ES modules)
  ├─ /.auth/login/aad       built-in Microsoft Entra sign-in (SWA)
  └─ /api/progress          Azure Static Web Apps managed Functions API
        └─ .NET 10 isolated Functions
             └─ Cosmos DB for NoSQL (database careersprint, container progress)
                  └─ document id = user-{authenticated SWA userId}
                     partition key /id
```

The frontend uses no npm/build dependencies. The backend uses C# and .NET 10 isolated. .NET 8 and .NET 9 managed SWA API runtimes reached their SWA support deadline in November 2026; this project intentionally targets .NET 10.

### What is implemented
- Microsoft sign-in, sign-out, route restrictions using SWA's built-in authentication
- Server-side identity validation using SWA's trusted `x-ms-client-principal` (not user-supplied account IDs)
- `GET /api/progress` and `PUT /api/progress` with authenticated user isolation
- Cosmos per-user persistence and ETag optimistic concurrency (a stale tab is prevented from overwriting newer cloud progress)
- Progress changes, deletion, editing and JSON import are written to the cloud
- Existing progress from original localStorage is offered for one-time migration when the cloud account has no record
- Calendar, exports, analytics and study plan preserved
- Dedicated Problem Library with difficulty/pattern filters and a confidence-based revision queue; review state is included in JSON backups and per-user cloud progress.
- Local development preview (without cloud): `web/` runs locally with browser storage

### What is NOT implemented
- Automatic Outlook Graph synchronization: ICS export only. Graph integration requires a separate app registration / consent.
- Scheduled notifications, payments, mobile app, multi-user collaboration
- Offline-first conflict merging: writes may be blocked after a detected concurrency conflict; export JSON, reload, then reconcile manually.

## Azure deployment — from scratch

### 1. Create Cosmos DB **for NoSQL**
In Azure Portal create a Cosmos DB for NoSQL account. **Enable the lifetime free tier** if available on your subscription (only one free-tier account per subscription). Select a region near your SWA API; for personal use, avoid optional paid features like multi-region replication, dedicated gateways, continuous backup, provisioned throughput above free-tier limits, etc.

Under **Data Explorer**, create:
- Database ID: `careersprint`
- Container ID: `progress`
- Partition key path: `/id`
- Throughput: use shared/free-tier-compatible throughput; 400 RU/s is sufficient for personal usage.

In Cosmos DB **Keys**, copy the primary connection string (keep it private). Treat this secret as highly sensitive and rotate if accidentally exposed.

### 2. Push code to GitHub
Create a new private repository, for example `CareerSprint-Cloud`, and push the **contents of this ZIP's root** (both `web/` and `api/`). Never commit `api/local.settings.json`, secrets, or an Azure deployment token. `.gitignore` excludes local.settings.json.

### 3. Create Azure Static Web App
In Azure Portal > **Create resource > Static Web App**:
- Plan: **Free**
- Source: GitHub; authorize your account and select repository/main branch
- Build preset: **Custom**
- **App location:** `/web`
- **API location:** `/api`
- **Output location:** leave **blank** (no frontend build)

**This repository already includes** `.github/workflows/deploy-azure-static-web-app.yml`. Avoid keeping an additional Azure-generated workflow that would deploy the same app twice. In GitHub repository **Settings → Secrets and variables → Actions**, create a repository secret named `AZURE_STATIC_WEB_APPS_API_TOKEN`, with the deployment token from Azure Portal → your Static Web App → **Manage deployment token**. Never commit this token.

After the Azure resource exists and the secret is set, every push to `main` runs plan/syntax checks, builds the .NET API, and deploys both the frontend and API. Pull requests targeting `main` also trigger preview deployments; closing the PR closes its preview environment. If you don't want preview deployments, remove the `pull_request` trigger and `close_pull_request` job. Check the status on the GitHub **Actions** tab and open your allocated `*.azurestaticapps.net` URL. Note: PR workflows from untrusted forks cannot access deployment secrets.

**Important:** Azure Static Web Apps is not automatically provisioned by this workflow. You must create the Azure resource and add its deployment token once. Azure environment settings for Cosmos DB are configured separately in Azure; they are not GitHub secrets and are not included in builds.

### 4. Configure API environment settings
Open your Static Web App > **Settings > Environment variables** (or Configuration > Application settings depending on portal UI). Add these backend application settings (no `VITE_` or client-side settings):

| Key | Value |
|---|---|
| `COSMOS_CONNECTION_STRING` | Cosmos DB for NoSQL connection string |
| `COSMOS_DATABASE` | `careersprint` |
| `COSMOS_CONTAINER` | `progress` |

These application settings are delivered to the managed API only, not to the HTML/JS frontend. Do NOT commit secrets to the repo.

### 5. Check Microsoft sign-in
Open the deployed URL. The Static Web Apps routing configuration redirects unauthenticated visitors to built-in `/.auth/login/aad`. Sign in with your permitted Microsoft identity. To sign out click **Sign out**.

Note: SWA's built-in `aad` provider is different from configuring a custom Microsoft identity provider. Account eligibility and organizational restrictions can vary; if you use a personal Microsoft account and sign-in does not work, review the SWA identity provider configuration for your account. A custom provider can require a paid plan.

### 6. Confirm persistence
1. Open the deployed site and sign in.
2. Change the status of a session to Completed; wait for **Saved in Azure**.
3. Open the app in another browser with the same Microsoft identity; the completed session should appear.
4. Test Export JSON and Export Outlook ICS.
5. Visit `/api/progress` only while authenticated; it should return your own sessions. Never expose this API as a standalone public Functions endpoint.

## Cost controls
Use the SWA Free plan, Cosmos DB lifetime free tier, and avoid enabling paid monitoring extras. Managed Functions are included with SWA within plan limits; Cosmos DB and optional services can incur charges if you exceed free limits. Create an Azure Cost Management budget alert (for example $5 monthly). Budget alerts **do not cap spending**.

## Local development

Frontend preview (browser-only persistence):

```sh
cd web
python -m http.server 8080
# open http://localhost:8080
```

To run the actual API locally, install .NET 10 SDK, Azure Functions Core Tools v4, Azurite and the Azure Static Web Apps CLI. Copy `api/local.settings.example.json` to `api/local.settings.json`, set your development Cosmos connection string, then:

```sh
cd api
func start
# in another terminal at repo root:
npx @azure/static-web-apps-cli start web --api-location api
```

**Important:** Local API identity requires SWA CLI auth emulation, which may not be production-equivalent. Use the deployed SWA endpoint for end-to-end authentication tests; do not bypass identity checking in the API merely to make local testing easier. A local-only preview mode is used when opened at `localhost` or `127.0.0.1`.

## Operational notes
- Each user's sessions and problem review state are stored in a single document. This is simple for the current plan; the API accepts up to 500 sessions and 500 review records. For larger workloads, refactor to one document per session, paginated queries, and partial updates.
- Sync uses ETags. If another browser changes the document, this one refuses to overwrite it; export a JSON backup before reloading.
- The browser retains a local cache, but Azure is authoritative after sign-in. Data is private to the authenticated SWA user ID at the API layer; secure app settings and avoid directly exposing Function hosts.
- The project is provided as source code. **It has not been compiled with a .NET SDK or deployed to an Azure subscription in this environment.** Perform the Azure deployment and verify the API with a real Cosmos account.

## References
- Azure Static Web Apps authentication: https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization
- Azure Static Web Apps API configuration: https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions
- Azure Static Web Apps managed runtime: https://learn.microsoft.com/en-us/azure/static-web-apps/languages-runtimes
- SWA backend application settings: https://learn.microsoft.com/en-us/azure/static-web-apps/application-settings


## Updated practice library (November 2026)

- **60 coding sessions** now link directly to a relevant HackerRank challenge. Challenge titles may differ from the planned problem: see the **resource note** for whether the linked challenge is equivalent or only practices a similar skill.
- **12 new system design sessions** (Saturday 12:15–1:00 PM Pacific, following the original mock interview) include interview prompts, key trade-offs, and Microsoft Learn architecture references. Total scheduled sessions: **96**.
- The **All sessions**, **Up next**, and calendar daily detail views contain external learning links. The edit dialog shows the original named challenge and resource notes.
- When upgrading a local installation, simply overwrite `web/` with the new `web/` folder and hard refresh the page (`Ctrl+Shift+R`). Existing locally stored status/time/notes are preserved. New design sessions are merged in automatically; existing cloud progress is migrated on sign-in.
- Export JSON first as a safety backup, especially before changing storage configuration.
- Link targets are curated practice *analogues*, not necessarily exact statements of the original coding problems.
