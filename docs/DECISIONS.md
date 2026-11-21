# Architecture decision log

## ADR-001: Static frontend rather than a framework (existing)
**Decision:** Plain HTML, CSS, vanilla JS and JSON seed. **Reason:** zero frontend build dependencies, simple hosting, quick iteration. **Trade-off:** monolithic `app.js` can be difficult to maintain. **Future:** consider modules or React/TypeScript only when requirements justify migration; do not assume React is already installed.

## ADR-002: Azure Static Web Apps plus managed Functions (existing)
**Decision:** Azure SWA for HTTPS, auth and static serving, with managed .NET isolated Functions for `/api/progress`. **Reason:** alignment with Azure/.NET skills and low operational overhead. **Trade-off:** must track managed runtime support, SWA environment constraints and provider-specific auth behavior.

## ADR-003: One Cosmos item per user (existing)
**Decision:** Entire user's sessions stored together in one Cosmos document; partition key `/id`. **Reason:** simple CRUD and low-cost reads for a small 12-week plan. **Trade-off:** full-document writes, 2 MB document size cap, concurrency collisions across tabs, hard scalability ceiling; consider normalized items only when needed.

## ADR-004: ETag optimistic concurrency (existing)
**Decision:** conditional overwrite on `If-Match`; return 409 on stale edits. **Reason:** prevent silent lost updates. **Trade-off:** manual reconciliation/backup on conflict, no automatic merge. **Do not weaken** to unconditional upsert to make an error disappear.

## ADR-005: Browser-only local preview (existing)
**Decision:** localhost uses localStorage, independent of cloud. **Reason:** easy frontend development without Azure. **Trade-off:** local preview cannot validate cloud authentication, server authorization or Cosmos behavior.

## ADR-006: Curated external resources (existing)
**Decision:** HackerRank coding analogues and Microsoft Learn system-design reading links attached to sessions. **Reason:** direct practice and trusted Azure references. **Trade-off:** reference may not be the exact question and external URLs can change. Label this correctly and validate links.

## ADR-007: Outlook export instead of Graph sync (existing)
**Decision:** Generate downloadable ICS; no OAuth Graph tokens. **Reason:** minimal complexity/privacy burden. **Trade-off:** imports are manual and changes are not continuously reflected in Outlook.

## ADR-008: Cloud per-user identity derived by server (existing)
**Decision:** SWA authentication + server-derived account key from SWA principal. **Reason:** user isolation without browser-selected account IDs. **Trade-off:** identity boundary depends on SWA-managed header injection. Direct public exposure of Functions with the same trust assumption is unsafe.
