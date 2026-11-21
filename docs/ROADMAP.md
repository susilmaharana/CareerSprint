# Roadmap and backlog

This document separates **present source capabilities** from **proposed work**. Items below are proposals, not completed features.

## P0 — Before declaring cloud version production ready
1. ~~Fix API session serialization~~ — session resource metadata now persists and is covered by JSON round-trip tests.
2. Compile API on .NET 10 SDK and test real managed Functions runtime; address any SWA platform incompatibilities.
3. ~~Add automated backend tests~~ — xUnit covers auth isolation, input validation, mocked Cosmos partition/ETag calls, and JSON round-trip/concurrency.
4. Deploy to a test SWA + Cosmos account; test Microsoft login and cross-device persistence.
5. Strengthen seed/data migration tests, especially preservation of progress when adding/reordering study entries.
6. Audit HTML escaping, input handling, and calendar export field escaping; add accessibility/mobile smoke tests.

## P1 — Core interview-preparation value
- Dedicated **System Design Library**: prompts, requirements, sizing, architecture decisions, bottlenecks, trade-offs, review rubric and diagrams/attachments as future scope.
- **Weakness tracker** and review queue: mistakes, topic confidence over time, revisit dates.
- Full weekly planner and retrospective with metrics for accuracy, communication and consistency.
- Data export/restore and versioned migration improvements.

## Recently delivered
- Dedicated Problem Library with difficulty and algorithm-pattern filters, curated practice links, estimated time, and a confidence-based revision queue persisted with per-user progress.

## P2 — Optional integrations
- Microsoft Graph Outlook calendar **two-way sync**: separately consented scopes, event IDs, conflict/duplicate management, token security. Current product only exports `.ics`.
- Notifications and reminders; optional recurring reviews.
- C# snippets, links to repositories, mock interview feedback forms.
- Microsoft Entra account experience improvements based on actual sign-in needs.

## P3 — Scale and polish
- Responsive design, dark/light themes, keyboard accessibility refinements.
- Split Cosmos document into per-session or per-attempt records only if workloads justify complexity.
- Observability/health checks and low-cost diagnostics.
- Multiple plans (Microsoft interview, Azure architecture, .NET deep dive), custom start date, drag-and-drop rescheduling.

## How to prioritize
Favor learning value and reliability before AI features or UI redesigns. Each feature should have an explicit data model, acceptance tests, migration path and Azure cost impact.
