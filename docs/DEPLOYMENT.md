# Azure deployment and automatic CI/CD

## Intended production shape
`main` branch -> GitHub Actions validation + .NET build -> Azure Static Web Apps deploy (static `web/` and managed `api/`) -> Cosmos DB for NoSQL. Azure resource creation is a **manual prerequisite**, not included in current pipeline.

## Azure prerequisites
1. Create a **Cosmos DB for NoSQL** account; enable free tier if available/eligible. Do not turn on paid features accidentally. Create database `careersprint`, container `progress`, partition key `/id` (a low RU/s baseline is sufficient for one user).
2. Create **Azure Static Web Apps**, plan Free, GitHub deployment source, repository/branch `main`, build preset Custom, app location `web`, API location `api`, output blank.
3. Confirm the managed Functions runtime/version is currently supported in the target SWA plan and region (`web/staticwebapp.config.json` specifies `dotnet-isolated:10.0`). Validate before production deployment; update runtime together with the C# project if necessary.
4. In SWA **backend application settings**, add `COSMOS_CONNECTION_STRING` (secret), optionally `COSMOS_DATABASE=careersprint` and `COSMOS_CONTAINER=progress`. Do not use frontend JS environment values for secrets.
5. In GitHub Actions **repository secrets**, add `AZURE_STATIC_WEB_APPS_API_TOKEN` from the SWA deployment token. **Never** paste it into workflow YAML.
6. Avoid retaining a second Azure-generated deployment workflow alongside the repo workflow unless intentionally coordinated.

## Existing workflow
File: `.github/workflows/deploy-azure-static-web-app.yml`.
- Triggers: `push` to `main`; PR open/update/reopen/close targeting `main`; manual dispatch.
- Checks: Node 22 `node validate.mjs`, JS syntax check, .NET 10 restore, API test suite, and Release build.
- Deploy: `Azure/static-web-apps-deploy@v1`, app `web`, API `api`, no frontend build.
- Pull requests: preview environment on PR updates, closed when PR closes. Secret restrictions apply to fork PRs.
- Concurrency grouping prevents overlapping redundant runs on the same ref/PR.

## Deploy flow
```text
Make changes locally
  -> tests + review
  -> git add / git commit / git push origin main
  -> GitHub Actions job validates and builds
  -> SWA deploy action uploads web + api
  -> Inspect action log and live URL
  -> Sign in, test GET/PUT, verify persistence in new browser
```

## Acceptance checklist after first deployment
- The workflow finishes successfully; there are no duplicate deployment jobs.
- The live URL serves the frontend over HTTPS.
- Anonymous access is redirected; signed-in user can load sessions.
- `/api/progress` retrieves only the signed-in user's record; missing record initialization works.
- Complete one session, refresh and open in another browser; data persists.
- Test stale ETag behavior and backup recovery.
- Validate links, CSV, JSON, and ICS exports on hosted URL.
- Confirm billing telemetry and a small budget alert; budget alerts **do not cap charges**.

## Security and costs
- SWA auth rules protect the site/API but are not a replacement for backend authorization checks.
- Keep service credentials in Azure settings; use least privilege and rotate secrets if exposed.
- Check Cosmos free-tier eligibility/limits and SWA plan constraints; do not promise exactly $0 universally.
- A private GitHub repository does not make an externally hosted site private; SWA authentication and API authorization do.
- Production status: **not verified by these docs**. Do not claim deployed until the Azure site, auth, API and DB are observed working.

## Rollback
Revert the bad commit on `main` and push, or redeploy a known good commit through GitHub. **Application rollback does not roll back Cosmos DB user data**; make backups before schema changes.
