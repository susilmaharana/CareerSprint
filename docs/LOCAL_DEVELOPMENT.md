# Local development (Windows-friendly)

## Prerequisites
For browser-only local work: Python 3 **or** a local static HTTP server; modern Chrome/Edge. For API work: .NET 10 SDK, Azure Functions Core Tools v4, Node.js 22 (for repository validation and SWA CLI), and access to a development Cosmos DB account; Azure credentials/secrets must stay outside git.

## Run frontend only (known working development mode)
```powershell
cd C:\Projects\CareerSprint-Cloud\web
python -m http.server 8080
# Browse to http://localhost:8080
```
Or use another static server. Avoid `file://` because ES module/JSON imports may not load. Localhost selects `localStorage` and **does not authenticate**, call Azure Functions, or write Cosmos DB. The command does not compile or execute C#.

## Validate source
From repository root:
```powershell
node validate.mjs
node --check web/app.js
dotnet restore api/CareerSprint.Api.csproj
dotnet build api/CareerSprint.Api.csproj -c Release
dotnet test api.Tests/CareerSprint.Api.Tests.csproj -c Release
```
If `dotnet` or dependencies aren't installed, report this as **not run**, not as passing.

## API development
Copy `api/local.settings.example.json` to `api/local.settings.json`, set a **development** Cosmos connection string, and keep the file ignored. Review the JSON example; never paste secrets into chat, a committed file, or browser code.

```powershell
cd api
func start
```

In a separate terminal at repo root, start the SWA CLI when available:
```powershell
npx @azure/static-web-apps-cli start web --api-location api
```

**Caution:** local SWA CLI authentication simulation is not a substitute for production Entra/SWA trust verification. The current frontend host check forces browser-only mode on localhost, so merely running this CLI does **not** automatically exercise `/api/progress` in the browser. To test the API, use a controlled development/test harness and a trustworthy mocked principal boundary, or a deployed staging SWA. Never weaken identity validation on publicly accessible endpoints.

## Developer workflow
1. Backup existing browser progress using Export JSON.
2. Make one focused change; retain seed IDs.
3. Run validation; test navigation, editing, exports and refresh in browser.
4. If API/schema changes, compile and run authenticated read/write/conflict tests against isolated development resources.
5. Commit only source and documentation; check for leaked secrets.

## Local debugging
- Blank page: look at devtools Console/Network; check JSON module support and served MIME type.
- Progress missing: verify origin/port and localStorage key `careersprint-sessions-v1`; browser storage is per origin.
- Resources not linked: inspect `resourceUrl` and frontend host allowlist.
- Cloud login loop: check SWA route rules and identity-provider configuration in real Azure, not just localhost.
- API 401: check SWA authenticated routing and principal injection; never send arbitrary identity headers from client JS to bypass it.
- API 409: stale ETag; export JSON, reload and reconcile.
- API 503: check app settings, Cosmos account availability/limits, function diagnostics, without logging secrets.
