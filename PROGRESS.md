# Baddy Bash Portal - Progress Tracker

This document tracks the development progress against the [Product Requirements Document (PRD)](PRD.md).

**Current Status:** 🟡 Phase 3 — Game Day Live (Score Input Modal next)

---

## 🚀 Phase 1: Registration Engine (Weeks 1-3)
Focus: User Authentication, Registration logic, Partner constraints.

- [x] **Project Setup**
    - [x] Initialize Next.js 16+ Project (TypeScript, Tailwind v4, Turbopack)
    - [x] Configure Linting & Formatting
    - [x] Create project structure (`/app`, `/components`, `/lib`)

- [x] **Authentication (FR-01)**
    - [x] Implement NextAuth.js v5 (Auth.js) with GitHub OAuth provider
    - [x] Protect routes (`/dashboard`, `/admin`, `/bracket`) via Proxy (Next.js 16)
    - [x] Sign In / Sign Out flow in Navbar (client component)
    - [x] SessionProvider integration in root layout
    - [x] Server actions for auth (signInAction, signOutAction)
    - [ ] Add @microsoft.com domain restriction (deferred — use Entra ID later)

- [x] **Database Integration**
    - [x] Design Schema (Users, Registrations, Matches) — Cosmos DB
    - [x] Set up Azure Cosmos DB client (`cosmosClient.ts`, models, seed script)
    - [x] DB init endpoint (`POST /api/setup`)
    - [x] API: Users CRUD (`GET /api/users?id=&alias=&email=`, `POST`, `PATCH`)
    - [x] API: Registrations (`GET`, `POST` with Max-2 enforcement + auto-create partner, `DELETE` soft cancel)
    - [x] API: Matches (`GET`, `POST` bracket generation, `PATCH` score/advance)
    - [x] API: Admin players (`GET /api/admin/players`, `PATCH` seed ranking)
    - [x] Env vars configured for Cosmos DB

- [x] **Player Dashboard & Registration (FR-02, FR-03)**
    - [x] Profile-first gate ("Welcome to Baddy Bash!" setup form)
    - [x] User ID = alias (not GitHub display name)
    - [x] UI: Category Selection Cards (MS, WS, MD, WD, XD)
    - [x] Logic: Enforce "Max-2 Categories" rule (Client + Server)
    - [x] UI: Display active registrations (fetched from API)
    - [x] UI: Read-only profile badges (name, alias, phone) after save
    - [x] Feature: Name, Alias, Phone Number Collection
    - [x] Logic: Gender constraints (MS disables WS, etc.)
    - [x] Frontend wired to Cosmos DB APIs

- [x] **Partner Workflow (FR-04, FR-05) — Redesigned**
    - [x] UI: Partner Name, Alias, Phone inputs for Doubles
    - [x] Backend: Auto-create partner user doc (keyed by alias) on doubles registration
    - [x] Backend: Auto-create partner's confirmed registration (reverse partner info)
    - [x] Alias-based account linking (partner logs in → enters alias → linked to pre-created user)
    - [x] Email lookup for returning users (`GET /api/users?email=`)
    - [x] Removed "pending" status — all registrations are immediately "confirmed"
    - [x] Read-only partner details shown on committed doubles cards
    - [ ] Feature: Email/Notification to partner (deferred)

---

## 🧠 Phase 2: The Tournament Brain (Weeks 4-5)
Focus: Admin capabilities, Seeding, Brackets.

- [x] **Admin Dashboard UI**
    - [x] View all participants (fetched from API)
    - [x] UI: Editable "Seed" fields per registration (onBlur save, revert on error)
    - [x] Backend: Save seeding data (`PATCH /api/admin/players`)
    - [x] Category selector & filter (table filters by selected category)
    - [x] Doubles: Distinct pair dedup — prefers partner with seed
    - [x] Badge: "X Teams" for doubles, "X Players" for singles
    - [x] Generate Fixtures button (sends JSON body `{ category }`)
    - [x] Refresh button
    - [x] Duplicate seed detection: API returns 409, UI shows red border + "Duplicate" label
    - [x] Optimized GET `/api/admin/players?category=` — single category fetch + parallel point-reads (was 13s → fast)
    - [x] Search by name (filters players/teams, matches partner names in doubles)
    - [x] Show alias instead of email for both singles and doubles

- [x] **Bracket Redesign (FR-07) — v2** ✅ COMPLETE
    - [x] **Data model cleanup**
        - [x] Deleted dead `bracketUtils.ts`, `mockData.ts`, `types.ts`
        - [x] Single source of truth: `MatchDocument` in `models.ts`
        - [x] Migrated all imports from `types.ts` → `models.ts`
        - [x] Added `tournamentId` field to `MatchDocument` and `RegistrationDocument`
    - [x] **Structured scores**
        - [x] Replaced `score?: string` with `sets: SetScore[]` (`{ set, score1, score2 }`)
        - [x] Added `formatSetScores()` helper for display
    - [x] **Match status**
        - [x] Added explicit `status: 'scheduled' | 'in_progress' | 'completed' | 'bye'`
    - [x] **Proper seeding algorithm**
        - [x] Standard bracket placement: seed 1 vs N, 2 vs N-1 (recursive `generateSeedOrder()`)
        - [x] Top seeds placed at opposite poles of the draw
    - [x] **Bye cascading — fixed**
        - [x] Round-by-round cascade via `fillNextMatchSlot()` 
        - [x] R1: straightforward byes (one player, one empty)
        - [x] R2+: only marks bye if feeder for empty slot is dead (no players)
        - [x] Eliminates false byes from matches waiting on real R1 results
    - [x] **UUID-based match IDs**
        - [x] Replaced fragile `MS-R1-M1` with `crypto.randomUUID()`
        - [x] Added `nextMatchSlot: 1 | 2` for deterministic winner advancement
    - [x] **Match numbering & seeds on cards**
        - [x] `matchNumber` field: sequential M1, M2, ... from R1 to Final
        - [x] `player1Seed`, `player2Seed` fields populated from registration data
        - [x] Bracket cards show match number (top-left) and seed badges [1], [2] etc. in amber
    - [x] **API update** (`POST /api/matches`)
        - [x] Integrated new seeding, bye logic, UUID IDs, structured scores
        - [x] Populates matchNumber, player1Seed, player2Seed
    - [x] **API update** (`PATCH /api/matches`)
        - [x] Accepts `sets: SetScore[]` instead of raw score string
        - [x] Validates set scores via `isValidSetScore()` (21 pts, deuce, 30-cap)
        - [x] Auto-transitions status: scheduled → in_progress → completed
        - [x] Rejects updates to bye matches
    - [x] **Bracket Tree Visualization** ✅ NEW
        - [x] SVG connector lines between round columns (proper bracket tree shape)
        - [x] Exponential slot spacing: match blocks double in height per round
        - [x] All matches shown including byes (needed for tree alignment)
        - [x] BYE matches: dimmed styling, "— bye —" for empty slot, BYE badge
        - [x] Sticky round headers above scrollable bracket body
        - [x] Round navigation (4 visible at a time, prev/next, "Final →")
        - [x] Stats bar: match count, bye count, round count

- [x] **Seed Data** ✅ COMPLETE
    - [x] Small seed: 10 users, 20 registrations (`seed.ts`)
    - [x] Bulk seed: 1458 users, 1588 registrations (`seed-bulk.ts`)
        - [x] MS: 443, WS: 69, MD: 280 teams, WD: 129 teams, XD: 129 teams
        - [x] 130 players shared between singles & doubles (100 MS→MD, 30 WS→WD)
        - [x] Proper seeding: MS top 16, WS top 8, MD/WD/XD top 8
        - [x] Wipes all data before reseeding (matches, registrations, users)

---

## 🎮 Phase 3: Game Day Live (Week 6)
Focus: Real-time updates, Scoring.

- [ ] **Live Scoring (FR-09, FR-10)** ⬅️ NEXT
    - [x] Backend: `PATCH /api/matches` — accepts `SetScore[]`, validates, auto-advances winner
    - [x] Backend: Status transitions (scheduled → in_progress → completed)
    - [ ] **UI: Score Input Modal** (Admin clicks match → enters set scores)
    - [ ] UI: Score input form (Set 1, Set 2, Set 3) with badminton validation
    - [ ] Backend: Real-time updates (Polling / SSE)

- [ ] **Public Views**
    - [x] Landing Page with Event Info
    - [x] Bracket View (pulls live data from API)
    - [ ] **Leaderboard / Results page**

---

## 🛠 Infrastructure & DevOps
- [x] Set up GitHub Repository (`le-immortal/BaddyBash`)
- [x] Configure CI/CD Pipeline (GitHub Actions — build + deploy on push to main)
- [x] Provision Azure Resources
    - [x] App Service: `baddybashportal` (Node 20, South India)
    - [x] Resource Group: `rg-baddybash` (VS Enterprise subscription)
    - [x] Cosmos DB: `baddybash-cosmos` (separate subscription)
    - [x] Runtime env vars configured on App Service
    - [x] GitHub repo secrets configured (7 secrets)
- [x] Dockerfile (multi-stage standalone build)
- [x] Renamed `middleware.ts` → `proxy.ts` (Next.js 16)
- [x] Fixed deployment: `startup-command` set on App Service (not in workflow)
- [x] Fixed artifact: `include-hidden-files: true` for `.next` directory
- [x] Disabled Oryx build: `SCM_DO_BUILD_DURING_DEPLOYMENT=false`
- [x] App live at `https://baddybashportal-b9b4bnd8bef5eadq.southindia-01.azurewebsites.net`
- [ ] Custom domain & SSL
- [ ] Monitoring / Application Insights

---

## 📋 Upcoming Phases (in order)

1. **Phase A: Export to Excel** ✅ COMPLETE
    - [x] Export player list to `.xlsx` from admin dashboard (current category)
    - [x] Export bracket / draw to `.xlsx` (match numbers, rounds, seeds, scores, winners)
    - [x] Dropdown menu: "Players List" or "Bracket / Draw"
    - [x] Auto-sized columns, proper naming (`BaddyBash_Players_MS_2026-02-12.xlsx`)

2. **Phase B: Admin Flow & Role-Based Display** ✅ COMPLETE
    - [x] `isAdmin` field on `UserDocument` (set via Cosmos DB)
    - [x] NextAuth JWT + session callbacks: look up `isAdmin` from Cosmos on sign-in
    - [x] Type augmentation (`types/next-auth.d.ts`) for `session.user.isAdmin`
    - [x] Server-side auth helper (`authHelpers.ts` → `requireAdmin()`)
    - [x] Admin API routes gated: `GET/PATCH /api/admin/players`, `POST/PATCH /api/matches` return 403
    - [x] Navbar: Admin link only visible to admins
    - [x] Admin page: "Access Denied" screen for non-admins with redirect to dashboard

3. **Phase C: Score Update**
    - [ ] Score Input Modal (admin clicks match → enters set scores)
    - [ ] Score input form (Set 1, Set 2, Set 3) with badminton validation
    - [ ] Real-time bracket updates (Polling / SSE)

4. **Phase D: Entra ID Login**
    - [ ] Replace GitHub OAuth with Microsoft Entra ID
    - [ ] @microsoft.com domain restriction
    - [ ] Seamless SSO for Microsoft employees

5. **Phase E: Mobile Friendly**
    - [ ] Responsive design audit & fixes across all pages
    - [ ] Touch-friendly bracket navigation
    - [ ] Mobile-optimized admin dashboard
