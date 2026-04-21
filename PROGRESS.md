# Baddy Bash Portal — Progress Tracker

Generated from codebase analysis on 2026-04-08. Cross-referenced against [PRD.md](PRD.md).

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
- [x] Three containers: `users` (PK: `/id`), `registrations` (PK: `/userId`), `matches` (PK: `/category`)
- [x] Singleton `CosmosClient` in `app/lib/cosmosClient.ts`
- [x] Type-safe models in `app/lib/models.ts` — `UserDocument`, `RegistrationDocument`, `MatchDocument`, `SeasonConfig`
- [x] DB init endpoint: `POST /api/setup` (idempotent, admin-only)
- [x] Env vars: `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DATABASE`

### API Routes
| Endpoint | Methods | Auth | Purpose |
|----------|---------|------|---------|
| `/api/users` | GET, POST | Authenticated | Lookup by ID/alias/email, create profile |
| `/api/registrations` | GET, POST, DELETE | Authenticated | Fetch/create/withdraw registrations |
| `/api/matches` | GET, POST, PUT, PATCH | Public R / Admin W | Bracket CRUD, bulk advance |
| `/api/admin/players` | GET, PATCH | Admin | List participants (cached), update seeds |
| `/api/admin/export` | GET | Admin | CSV export of users + registrations |
| `/api/admin/import/bracket` | POST | Admin | Bulk import match results from Excel |
| `/api/settings` | GET, POST | Auth R / Admin W | Season config, toggle registration/brackets |
| `/api/setup` | POST | Admin | Initialize Cosmos DB containers |

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
- [x] `registrationOpen` toggle in global config (`CONFIG_GLOBAL`)
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

## Phase 5: Multi-Season Support ✅ Complete

- [x] `seasonId` field on `RegistrationDocument` and `MatchDocument`
- [x] Registration IDs: `${userId}_${category}_${seasonId}`
- [x] `SeasonConfig` document: active season, per-season settings (registrationOpen, bracketsVisible, archived)
- [x] Season selector in admin UI
- [x] Archived seasons blocked from writes
- [x] `settings.ts`: 12h cache for season config with invalidation
- [x] Migration script: `cli/migrate-seasons.ts` (backfills seasonId, re-IDs registrations)

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

## CLI Tooling ✅ Complete

| Script | Purpose |
|--------|---------|
| `cli/seed.ts` | Insert 9 demo users + 18 registrations |
| `cli/seed-bulk.ts` | Insert 1000+ users + 1588 registrations across all categories |
| `cli/clear-data.ts` | Wipe all data (prompts before deleting config) |
| `cli/migrate-seasons.ts` | Backfill seasonId, re-ID registrations, create `SEASON_CONFIG` |
| `cli/resolve-aliases.ts` | Resolve aliases via Microsoft Graph |
| `cli/audit-aliases.ts` | Audit alias/email consistency, verify partner accounts |
| `cli/verify-aliases-graph.ts` | Graph-based alias verification |
| `cli/export-data.ts` | Export all Cosmos DB data (users, registrations, matches) to local JSON |
| `cli/import-data.ts` | Import JSON backup into any Cosmos DB instance (upsert, dry-run, selective) |

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
| Automated tests | — | No unit or E2E tests |

| Mobile responsiveness audit | — | Desktop-first, no mobile-specific work |
| Gender validation from directory | §9 Open Questions | Relies on manual category selection |
| Substitution / partner swap | §9 Open Questions | Not supported |

---

## Change Log

### 2026-04-21 — Multi-Season APIs + Data Backup Scripts

**New: Data Export/Import CLI** (`cli/export-data.ts`, `cli/import-data.ts`)
- Full database backup to local JSON files (users, registrations, matches + metadata)
- Import into any Cosmos DB instance via upsert (supports `--dry-run`, `--skip-users`, `--skip-regs`, `--skip-matches`)
- Strips Cosmos system properties (`_rid`, `_etag`, `_ts`) before importing
- Auto-creates target database and containers on import
- First backup created at `portal/my-backup/`

**Unstaged changes (not yet committed):**

| File | Summary |
|------|---------|
| `PROGRESS.md` | This update + CLI table additions |
| `portal/app/admin/page.tsx` | Multi-season selector, import preview modal, visual bracket export |
| `portal/app/api/admin/export/route.ts` | Season-scoped CSV export |
| `portal/app/api/admin/players/route.ts` | Bulk seed save (PUT), season filtering |
| `portal/app/api/matches/advance/route.ts` | Season-aware advancement |
| `portal/app/api/matches/route.ts` | Season-scoped bracket generation & queries |
| `portal/app/api/registrations/route.ts` | Season-scoped registration CRUD |
| `portal/app/api/settings/route.ts` | Full SeasonConfig CRUD (create/archive seasons) |
| `portal/app/components/Navbar.tsx` | Dynamic season label in header |
| `portal/app/lib/models.ts` | `SeasonEntry`, `SeasonConfig` types |
| `portal/app/lib/settings.ts` | SeasonConfig read/write with 12h cache + invalidation |

**New untracked files:**
- `portal/cli/export-data.ts` — Export script
- `portal/cli/import-data.ts` — Import script
- `portal/cli/migrate-seasons.ts` — Season migration backfill
- `portal/my-backup/` — First full data backup (users, registrations, matches, metadata)
