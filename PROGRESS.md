# Baddy Bash Portal — Progress Tracker

Generated from codebase analysis on 2026-04-08. Updated 2026-06-23 after the Teammate Finder (partner board) feature — PR #25. Cross-referenced against [PRD.md](PRD.md).

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Tailwind v4 · Azure Cosmos DB (Serverless) · NextAuth v5 (Auth.js) · ExcelJS
**Deployed at:** `https://baddybashapp-ccckduhtephwgsbr.southindia-01.azurewebsites.net`

---

## Phase 1: Registration Engine ✅ Complete

### Authentication (FR-01)
- [x] Microsoft Entra ID via Federated Identity Credential (production)
- [x] GitHub OAuth fallback (development)
- [x] `@microsoft.com` domain restriction enforced in production sign-in callback
- [x] Protected routes via Next.js middleware (`/dashboard`, `/admin`, `/fixtures`)
- [x] Public exceptions: `GET /api/matches`, `GET /api/settings`
- [x] Server actions: `signInAction`, `signOutAction` in `app/lib/actions.ts`
- [x] `SessionProvider` wrapper in `app/components/Providers.tsx`

### Database (Cosmos DB)
- [x] Core containers: `users` (PK: `/id`), `settings` (PK: `/id`), `registrations_v2` (PK: `/seasonCategory`), `matches_v2` (PK: `/seasonCategory`)
- [x] Legacy rollback/source containers retained: `registrations` (PK: `/userId`), `matches` (PK: `/category`)
- [x] Singleton `CosmosClient` in `app/lib/cosmosClient.ts`
- [x] Type-safe models in `app/lib/models.ts` — `UserDocument`, `RegistrationDocument`, `MatchDocument`, `SeasonConfig`; v2 docs include `seasonCategory` and `schemaVersion`
- [x] Version-aware tournament container helper in `app/lib/tournamentData.ts` (`v2` default; `COSMOS_TOURNAMENT_CONTAINER_VERSION=legacy` rollback)
- [x] DB init endpoint: `POST /api/setup` (idempotent, admin-only) creates legacy + v2 containers
- [x] Env vars: `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DATABASE`, optional `COSMOS_TOURNAMENT_CONTAINER_VERSION`

### API Routes
| Endpoint | Methods | Auth | Purpose |
|----------|---------|------|---------|
| `/api/users` | GET, POST | Authenticated | Lookup by ID/alias/email, create profile |
| `/api/registrations` | GET, POST, DELETE | Authenticated | Fetch/create/withdraw registrations |
| `/api/matches` | GET, POST, PATCH | Public R / Admin W | Season/category bracket read, fixture generation, match edit/update |
| `/api/matches/advance` | PUT | Admin | Bulk winner advancement for a selected season/category |
| `/api/admin/players` | GET, PATCH, PUT | Admin | List participants (cached), update one seed, batch update seeds |
| `/api/admin/export` | GET | Admin | CSV export of users + registrations |
| `/api/admin/import/bracket` | POST | Admin | Bulk import match results from Excel |
| `/api/settings` | GET, POST | Public R / Admin W | Season config, toggle registration/brackets, create/update seasons |
| `/api/setup` | POST | Admin | Initialize Cosmos DB containers, including `settings`, `registrations_v2`, `matches_v2` |

### Player Dashboard (`app/dashboard/page.tsx`)
- [x] Profile-first gate (name, alias, phone, t-shirt size)
- [x] Alias locked after first save; name/phone/t-shirt editable
- [x] Category selection cards (MS, WS, MD, WD, XD)
- [x] Max-2 categories enforced (client + server)
- [x] Gender constraints (MS disables WS, etc.)
- [x] Active registrations displayed with status

### Partner Workflow (FR-04, FR-05)
- [x] Alias-based partner lookup
- [x] Auto-create partner user doc ("phantom") on doubles registration
- [x] Auto-create partner's confirmed registration (reverse partner info)
- [x] Partner login overwrites phantom data; existing data never overwritten
- [x] Self-partnership prevented (server-side)
- [x] Read-only partner details on committed doubles cards
- [ ] Email/notification to partner (not implemented)

### Registration Controls
- [x] `registrationOpen` toggle in active season config (`SEASON_CONFIG`; legacy `CONFIG_GLOBAL` shim retained)
- [x] Admin UI: Lock/Unlock toggle in dashboard header
- [x] User UI: "Registrations Closed" banner, disabled save button
- [x] Withdraw: hard delete + partner cleanup for doubles
- [x] Confirmation dialog on withdraw

---

## Phase 2: Tournament Brain ✅ Complete

### Admin Dashboard (`app/admin/page.tsx`)
- [x] View all participants filtered by category
- [x] Inline seed editing (onBlur save, revert on error)
- [x] Duplicate seed detection: API returns 409, UI shows red border
- [x] Search by name (matches partner names in doubles)
- [x] Show alias instead of email
- [x] Doubles: distinct pair dedup (prefers partner with seed)
- [x] Badge: "X Teams" for doubles, "X Players" for singles
- [x] Generate Fixtures button
- [x] Refresh button
- [x] In-memory cache with 30s TTL (`app/lib/cache.ts`) — prefix invalidation on writes
- [x] Optimized SQL: selective fields, parallel batch reads (50-item chunks)

### Bracket Generation (FR-07)
- [x] Canonical seeding algorithm: seed 1 vs N, 2 vs N-1 (recursive `generateSeedOrder()` in `bracketUtils.ts`)
- [x] Top seeds placed at opposite poles
- [x] Unseeded players randomized (no alphabetical bias)
- [x] Bye cascading: R1 straight byes, R2+ only if feeder is dead
- [x] UUID-based match IDs (`crypto.randomUUID()`)
- [x] `nextMatchId` + `nextMatchSlot` (1 or 2) for deterministic advancement
- [x] Sequential match numbering (M1, M2, ...)
- [x] Seed badges populated from registration data

### Bracket Visualization (`app/components/BracketVisualizer.tsx`)
- [x] Interactive tree view (rounds as columns)
- [x] SVG connector lines between rounds
- [x] Exponential slot spacing per round
- [x] BYE matches: dimmed styling, "— bye —", BYE badge
- [x] Sticky round headers
- [x] Round navigation (4 visible, prev/next, "Final →")
- [x] Stats bar: match count, bye count, round count
- [x] Player search: highlights matches, auto-navigates to round

### Seeding Visualizer (`app/components/SeedingVisualizer.tsx`)
- [x] Bracket preview with seed positions

---

## Phase 3: Game Day Live ✅ Complete

### Live Scoring (FR-09)
- [x] `EditMatchModal` — admin modal for winner selection + schedule time
- [x] Structured `SetScore[]` (set, score1, score2)
- [x] Score validation: 21 pts, deuce rules, 30-pt cap (`isValidSetScore()`)
- [x] Status transitions: scheduled → in_progress → completed
- [x] Bye matches rejected from updates

### Winner Advancement (FR-10)
- [x] `matchService.ts`: `updateMatchWithAdvancement()` + `advanceWinnerToNextMatch()`
- [x] Auto-cascading through bracket tree on completion
- [x] Seed preservation through advancement (optional)
- [x] Bulk advance via `PUT /api/matches`

### Player Match View (Dashboard)
- [x] `ScheduleMatchCard` component
- [x] "Your Matches" (upcoming/live) + "Match History" (completed) sections
- [x] Category badge, round label, opponent, score, Win/Lost status
- [x] Doubles-safe: pipe-separated IDs with `.split('|').includes(userId)`
- [x] Visible only when `bracketsVisible === true`
- [x] Manual refresh button

### Public Views
- [x] Landing page with event info (`app/page.tsx`)
- [x] Public bracket view (`app/bracket/page.tsx`)
- [x] Bracket visibility toggle (admin publishes/hides)
- [x] "Brackets Coming Soon" gatekeeper (admins bypass)

---

## Phase 4: Data Management ✅ Complete

### Export
- [x] Player list to Excel (`.xlsx`) from admin dashboard
- [x] Bracket/draw to Excel (`bracketExcelExport.ts`) — match numbers, rounds, seeds, scores, winners
- [x] CSV export via `GET /api/admin/export`
- [x] Auto-sized columns, proper naming conventions

### Import
- [x] `POST /api/admin/import/bracket` — bulk import match results from Excel
- [x] Winner selection: by slot ("1"/"2"), then ID, then name
- [x] Schedule time updates
- [x] Status transitions on import

---

## Phase 4.5: UX & Performance Hardening ✅ Complete (2026-06-22)

- [x] Naming unification: all user-facing "Bracket" text → "Fixtures" (internal code names unchanged)
- [x] Modals: replaced all 35+ `alert()`/`confirm()`/`prompt()` calls with styled modals and toast system (success auto-dismiss, error persistent)
- [x] Dashboard flash fix: tri-state user lookup (`pending | found | missing`) — form only renders on explicit `missing`
- [x] Performance: deduplicated `/api/settings?full=1` calls (4→1 in prod) via `seasonLabel` prop on Navbar
- [x] Performance: gated "Your Matches" section behind `bracketsVisible || isAdmin`
- [x] Fixtures dropdown: removed "(Archived)"/"(Current)" suffixes, added colored dot indicators (🟢 Live, ⚪ Past)
- [x] Code review fixes: useEffect dependency bug, missing seasonId in PATCH, CATEGORIES dedup, auth console.logs gated behind isDev, registrations DELETE consistency
- [x] Security: PII files purged from entire git history (employee aliases, user data backups)
- [x] Test suite: expanded from 3 → 20 tests (6 test files), all passing

---

## Phase 5: Multi-Season & Historical Seasons ✅ Complete

### Current Baseline

- [x] `seasonId` field exists on `RegistrationDocument` and `MatchDocument`
- [x] Registration IDs use `${userId}_${category}_${seasonId}` via `makeRegistrationId()`
- [x] `SeasonConfig` model supports `activeSeason`, `registrationOpen`, `bracketsVisible`, and `archived`
- [x] Admin UI has a selected-season model and can view/update selected-season players, seeds, matches, fixture generation, imports, and exports
- [x] Public fixtures page can select seasons and fetch `/api/matches?category=...&season=...`
- [x] Archived seasons are blocked from several admin mutations: seed updates, fixture generation, match edit, bulk advance, and bracket import
- [x] Duplicate seed checks are scoped by season
- [x] `settings.ts` caches season config with invalidation on write
- [x] Migration script exists: `cli/migrate-seasons.ts` backfills `seasonId`, re-IDs registrations, and creates `SEASON_CONFIG`
- [x] Migration tooling exists to restore legacy data into the season-aware model
- [x] `seasonCategory` and `schemaVersion` are written for v2 tournament documents
- [x] `SEASON_CONFIG` is stored in the dedicated `settings` container
- [x] Runtime tournament data path defaults to v2 containers; legacy containers remain available as fallback/rollback source
- [ ] End-to-end browser smoke test against active + archived seasons still needed

### Architecture Finding

The original season concept was correct, but the legacy Cosmos partitioning was only partially aligned with the app's dominant access patterns.

| Legacy container | Partition key | Works well for | Scaling concern |
|-----------|-----------------------|----------------|-----------------|
| `users` | `/id` | Point-reading a user by alias | Email lookup is cross-partition; legacy season config used to be mixed with user profile data |
| `registrations` | `/userId` | Player dashboard: "my registrations" | Admin queries by `seasonId + category` are cross-partition |
| `matches` | `/category` | Current category bracket reads | Historical season/category reads share the same category partition across all seasons |

The live runtime now defaults tournament reads/writes to v2 containers aligned to season/category access patterns:

| Runtime container | Partition key | Primary use |
|-------------------|---------------|-------------|
| `settings` | `/id` | `SEASON_CONFIG` and future singleton settings |
| `registrations_v2` | `/seasonCategory` | Admin participants, fixture generation, historical season/category registration reads |
| `matches_v2` | `/seasonCategory` | Public/admin brackets, match edits, imports, winner advancement |

Legacy tournament containers remain available as rollback/source data via `COSMOS_TOURNAMENT_CONTAINER_VERSION=legacy`.

Target tournament partition key:

```text
seasonCategory = `${seasonId}#${category}`
```

Example:

```json
{
	"id": "abhishek_MS_2026",
	"userId": "abhishek",
	"category": "MS",
	"seasonId": "2026",
	"seasonCategory": "2026#MS",
	"status": "confirmed"
}
```

### Incremental Development Plan

#### Step 1: Stabilize Current Multi-Season Behavior ✅

- [x] Code paths now read `SEASON_CONFIG` from `settings` with fallback to legacy `users/SEASON_CONFIG`
- [x] Migration tooling exists to backfill `seasonId` on legacy registrations and matches
- [x] Ensure previous seasons have `archived: true`, `registrationOpen: false`, and `bracketsVisible: true`
- [x] Automated test coverage: 20 Vitest tests including admin-season-guards (archived write blocks, active-season defaults)
- [x] Dashboard remains active-season only for registration/editing (player writes bound to getActiveSeason)
- [x] Admin selected-season views, exports, imports, and fixture generation verified working

#### Step 2: Harden API Contracts Around Season Scope ✅

- [x] Added `resolveSeasonParam()` helper with dev-mode warnings for missing season
- [x] Keep player-facing writes bound to `getActiveSeason()` only
- [x] Allow admin writes only when the target season is not archived
- [x] Removed legacy `tournamentId` alias from matches POST
- [x] Require explicit season for bracket import (returns 400 if missing)
- [x] Require explicit season for bulk advancement (returns 400 if missing)
- [x] `/api/admin/export` exports only registered users for the selected season
- [x] Server-side validation rejects imported rows with mismatching seasonId

#### Step 3: Add Read-Optimized Fields Without Repartitioning Yet

- [x] Add `seasonCategory` to `RegistrationDocument` and `MatchDocument`
- [x] Set `seasonCategory` on all new registration and match writes
- [x] Migration tooling backfills `seasonCategory` via `cli/restore-production-2026.ts` and `cli/migrate-tournament-v2.ts`
- [x] Change tournament query path to filter on `seasonCategory` when v2 containers are active
- [x] Add `schemaVersion` to tournament documents to simplify future migrations

#### Step 4: Move To Read-Aligned Cosmos Containers

- [x] Create v2 containers with partition key `/seasonCategory`:
	- `registrations_v2`
	- `matches_v2`
- [x] Keep `users` partitioned by `/id`
- [x] Move `SEASON_CONFIG` to a dedicated `settings` container partitioned by `/id`
- [x] Write a migration that copies season-scoped data from old containers to v2 containers
- [x] Add a feature flag/env switch to read from v2 containers after migration validation (`COSMOS_TOURNAMENT_CONTAINER_VERSION=legacy` opts out)
- [x] Keep old containers read-only until one full tournament cycle is validated

#### Step 5: Improve Historical UX ✅

- [x] Public fixtures: season selector dropdown with colored dot indicators (🟢 Live, ⚪ Past)
- [x] Public fixtures: default to active season, selected season preserved in URL query params
- [x] Dashboard: read-only "Past Seasons" collapsible section showing registration history per archived season
- [x] Admin: selected season context shown in all admin operations
- [x] Admin: archived-season write blocks enforced across all mutation routes (seeds, fixtures, matches, import, advance)

#### Step 6: Production Readiness

- [ ] Add Application Insights or Azure Monitor traces for Cosmos latency, 429 throttles, and failed API routes
- [ ] Add integration tests for active season, archived season, and new-season creation
- [ ] Add migration rollback instructions and JSON backup verification before live migration
- [ ] Move production Cosmos authentication toward Managed Identity; keep `COSMOS_KEY` only for local development or emergency fallback
- [x] Document Cosmos container creation, partition keys, and migration commands in `GETTING_STARTED.md`

### Multi-Season Agent Handoff Notes

- Active-season player flow should default to `getActiveSeason()` and should not let normal users mutate archived seasons.
- Historical seasons should be readable when `bracketsVisible === true`; admins may bypass fixture visibility but should still be blocked from archived writes.
- `settings` stores the singleton `SEASON_CONFIG` document with `id = "SEASON_CONFIG"` and partition key `/id`; `settings.ts` can still fall back to old `users/SEASON_CONFIG` during rollback.
- Runtime tournament data defaults to `registrations_v2` and `matches_v2`, both partitioned by `/seasonCategory`.
- Legacy `registrations` and `matches` containers are retained as source/rollback data; do not delete them until one full tournament cycle validates v2.
- Before any future production migration: export a backup, run dry-run migration, validate counts by season/category, then run the write migration once.

### Current Validation Notes

- `npm run lint --quiet` passes.
- `npm run test` passes with 20 Vitest tests across 6 test files (API routes, smoke, season guards).
- `npm run build` compiles/type-checks, but the Windows/OneDrive standalone copy step is still an environment-specific failure.
- `npx --no-install tsc --noEmit --pretty false` still fails in some files; treat that as a known pre-existing issue, not a verified green check.
- Historical migration notes recorded live Cosmos v2 counts and backfill status, but those runtime data checks were not re-verified in this doc-refresh session.
- Legacy `registrations` and `matches` containers remain available as rollback/source data; runtime can opt out with `COSMOS_TOURNAMENT_CONTAINER_VERSION=legacy`.

---

## Phase 6: Admin Role & Security ✅ Complete

- [x] `isAdmin` field on `UserDocument`
- [x] NextAuth JWT + session callbacks: lookup `isAdmin` from Cosmos on sign-in
- [x] Type augmentation (`types/next-auth.d.ts`) for `session.user.isAdmin`
- [x] `authHelpers.ts`: `requireAdmin()`, `requireOwnerOrAdmin()`, `isAdmin()` helpers
- [x] Admin API routes gated (403 for non-admins)
- [x] Navbar: Admin link visible only to admins
- [x] Admin page: "Access Denied" screen for non-admins

---

## Phase 7: Teammate Finder (Partner Board) ✅ Complete — PR #25

A season-scoped "looking for a doubles partner" board with a **Teammate Finder** navbar link. Doubles-only (MD/WD/XD).

### Data Model
- [x] `PartnerPostDocument` in `app/lib/models.ts` — deterministic id `${userId}_${category}_${seasonId}` (one open post per user/category/season), partition key `/seasonCategory` (`${seasonId}#${category}`)
- [x] Fields: `userId`, `alias`, `displayName`, `avatar?`, `category`, `skillLevel` (beginner/intermediate/advanced, self-declared), `status` (open/closed), `seasonId`, `createdAt` — **no free-text** note/message/contact fields (content-safety: minimal attack surface)
- [x] `partner_posts` container in `cosmosClient.ts` (+ `ensurePartnerPostsContainer`, `initializeDatabase`); added to `POST /api/setup`

### API Routes
| Endpoint | Methods | Auth | Purpose |
|----------|---------|------|---------|
| `/api/partner-posts` | GET, POST | Authenticated | Browse (season-scoped, graceful empty on missing container) / create (active-season guard, 409 on duplicate open post, self-heals missing container, alias from session) |
| `/api/partner-posts/[id]` | PATCH, DELETE | Owner or Admin | Update status/skill or delete; active-season guard + owner/admin IDOR guard |
| `/api/partner-posts/[id]/history` | GET | Authenticated | Poster's tournament history across **all categories** — resolves userId server-side, **never leaks userId/email/phone** |
| `/api/players/[userId]/tournament-history` | GET | Authenticated | Category-scoped furthest-stage-per-season lookup (public bracket-derived) |

### UI (`app/partner-board/page.tsx`)
- [x] Browse board with category + skill filters, "my posts" view
- [x] Create modal (category + skill dropdowns only); disables already-posted categories; surfaces 409
- [x] Post cards: avatar, `@alias`, skill/category badges, owner controls (close/delete), empty-state Post button
- [x] Per-card tournament history via `<PostHistory>` child (effect keyed on `[postId]` only — no searchParams/router loop), shows `seasonId · category · stage` across all categories (MS/WS/MD/WD/XD)
- [x] "Teammate Finder" link in `components/Navbar.tsx` (desktop + mobile)

### Performance / Privacy
- [x] In-memory TTL (5 min) cache with in-flight Promise dedup around immutable past-season bracket reads (`app/lib/playerHistory.ts`) — collapses N redundant Cosmos reads per board load to 1; failed reads evicted (no poisoning)
- [x] Reviewer-approved: **Stark APPROVED** (correctness/architecture), **Rai 🟢 GREEN** (privacy — only public alias + public bracket-derived results exposed; no PII)

### Tests
- [x] 63 Vitest unit/API tests passing (`__tests__/api/partner-posts.test.ts`, `__tests__/api/player-history.test.ts`)

### Open advisories (non-blocking)
- [ ] Document the tournament-history disclosure in board help text (Rai A1)
- [ ] `/api/players/[userId]/tournament-history` allows alias enumeration — consider rate-limiting / restricting to active posters (Stark A2 / Rai A3); remove if unused by UI
- [ ] ETag/optimistic concurrency on PATCH (Stark A1); avatar CSS URL hardening (Stark A4)

---

## CLI Tooling ✅ Complete

| Script | Purpose |
|--------|---------|
| `cli/seed.ts` | Insert 9 demo users + 18 registrations |
| `cli/seed-bulk.ts` | Insert 1000+ users + 1588 registrations across all categories |
| `cli/clear-data.ts` | Wipe data while preserving `CONFIG_GLOBAL` and `SEASON_CONFIG` |
| `cli/export-data.ts` | Export users, registrations, matches, and metadata to JSON backup |
| `cli/import-data.ts` | Import JSON backup data back into Cosmos DB |
| `cli/migrate-seasons.ts` | Backfill seasonId, re-ID registrations, create `SEASON_CONFIG` |
| `cli/restore-production-2026.ts` | Replace dummy live data with production 2026 backup transformed to the season-aware model |
| `cli/migrate-tournament-v2.ts` | Copy season-aware tournament data into `settings`, `registrations_v2`, and `matches_v2` |
| `cli/resolve-aliases.ts` | Resolve aliases via Microsoft Graph |
| `cli/audit-aliases.ts` | Audit alias/email consistency, verify partner accounts |
| `cli/verify-aliases-graph.ts` | Graph-based alias verification |

---

## Infrastructure

- [x] Azure App Service: `baddybashapp` (Node 24-lts, South India, `test-rg`)
- [x] Azure Cosmos DB: `baddybashdb` (serverless, South India, `test-rg`)
- [x] System-assigned Managed Identity
- [x] Federated Identity Credential for Entra ID auth
- [x] Dockerfile: multi-stage standalone build (Node 20 Alpine, non-root)
- [x] `startup-command`: `node server.js`
- [x] `SCM_DO_BUILD_DURING_DEPLOYMENT=false` (Oryx disabled)
- [x] CI/CD: GitHub Actions — `deploy.yml` (build + lint + deploy on push to main) and `security.yml` (npm audit, CodeQL, ESLint)
- [x] Deploy workflow: standalone artifact → Azure App Service via publish profile
- [x] Security workflow: scheduled weekly + on push/PR (dependency audit, CodeQL static analysis)
- [ ] Custom domain & SSL
- [ ] Application Insights / Azure Monitor

---

## Not Implemented

| Feature | PRD Reference | Notes |
|---------|---------------|-------|
| Real-time updates (WebSocket/SignalR) | §6 Tech Arch | Polling only — manual refresh buttons |
| Partner email/SMS notifications | FR-04 | Auto-create only, no notification sent |
| Waitlist / overflow logic | §9 Open Questions | Not built |
| Automated tests | — | 63 Vitest unit/API tests passing; no E2E browser suite |

| Mobile responsiveness audit | — | Desktop-first, no mobile-specific work |
| Gender validation from directory | §9 Open Questions | Relies on manual category selection |
| Substitution / partner swap | §9 Open Questions | Not supported |
