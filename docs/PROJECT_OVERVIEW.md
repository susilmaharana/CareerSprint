# CareerSprint — Product requirements and project overview

## Purpose
A personal interview-preparation command center: plan study sessions, practice problem solving in C#, rehearse system design, and track habits, weaknesses and progress. It targets SDE II / Senior Software Engineer interviews, with particular emphasis on Azure/.NET, distributed systems, algorithms, and technical communication.

## Target user and constraints
- Primary user: one engineer; future multi-user expansion is optional, not currently implemented.
- Daily routine: weekday 8:30–9:45 PM Pacific; Saturday 10:00 AM–12:00 PM mock and 12:15–1:00 PM design drill; Sunday 7:00–7:30 PM review.
- Study period: Mon 2026-11-23 through Sun 2027-02-14 (12 weeks).
- Hosting goal: Azure Static Web Apps Free, managed Functions, eligible Cosmos free tier; operating costs can vary.
- The app should work as a local **browser-only preview** without Azure credentials and as a separately configured **cloud-backed authenticated** application when deployed.

## Current delivered capabilities (source code)
- Overview dashboard: completed/total sessions, accumulated hours, current week, average confidence, next sessions, weekly breakdown.
- Calendar and session views; search/filter; create/edit/delete a session; status, elapsed minutes, confidence 1–5, notes.
- Insights view and progress charts (inspect UI for actual chart types).
- Dedicated Problem Library with difficulty and algorithm-pattern filters, curated LeetCode links, estimated practice time, and a confidence-based revision queue.
- JSON backup/import; CSV export; Outlook ICS calendar export (manual import).
- Seed plan: **96** sessions total: **60 Coding + concept**, **12 System design**, **12 Mock interview**, **12 Weekly review**. The original plan had 84; 12 design drills were later added.
- 60 HackerRank links for coding sessions, 12 Microsoft Learn architectural references for design sessions. Links are practice analogues/reference material, not guarantees of exact title matching.
- Local progress using `localStorage` on localhost; Azure account progress using authenticated API and Cosmos in hosted mode (implementation provided, live service not verified here).

## Excluded from the current version
- Automatic Outlook sync or reminders via Microsoft Graph.
- Built-in code editor, test runner, or HackerRank progress ingestion.
- AI-generated coaching, solved-problem verification, role/company-specific question sets.
- Dedicated admin UI, teams, billing, mobile native application, offline conflict merge.
- Azure infrastructure provisioning / configured production deployment.

## Success criteria
1. First load shows all 96 seeded sessions; counts and dates agree with `web/seed.json`.
2. Marking/editing a session updates progress; refresh retains changes in the selected persistence mode.
3. Valid external links open securely in a new tab; users can distinguish exact from analogous practice.
4. Cloud mode only exposes a signed-in user's own record; concurrent edits do not silently overwrite each other.
5. Import and export do not lose progress; `id` is the session identity.
6. Push to `main` triggers validation/build/deploy **after** Azure SWA and its deployment secret are configured.
7. The UI remains usable on a desktop browser and a phone, with keyboard-friendly navigation.
8. Problem review state persists with the user's progress; older progress documents and backups without review data remain valid.

## Terminology
- **Session:** scheduled record with date, time, category, outcome, and notes.
- **Seed:** default plan in `web/seed.json`, not a separate database table.
- **Resource:** external HackerRank challenge or Microsoft Learn article referenced by a session.
- **Cloud document:** a single Cosmos item containing all sessions for one authenticated user.

## Source-of-truth policy
The checked-in implementation and seed data define *current behavior*. The documents define intentions and constraints. A proposed feature is not a delivered feature until code, tests and deployment validation support it.
