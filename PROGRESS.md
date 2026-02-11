# Baddy Bash Portal - Progress Tracker

This document tracks the development progress against the [Product Requirements Document (PRD)](PRD.md).

**Current Status:** 🟡 Phase 2.5 — Bracket Redesign in progress, Phase 3 next

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
    - [x] UI: Editable "Seed" fields per registration
    - [x] Backend: Save seeding data (`PATCH /api/admin/players`)
    - [x] Category selector & filter (table filters by selected category)
    - [x] Doubles: Distinct pair dedup (canonical pair keys, team view with overlapping avatars)
    - [x] Badge: "X Teams" for doubles, "X Players" for singles
    - [x] Generate Fixtures button (sends JSON body `{ category }`)
    - [x] Refresh button

- [ ] **Bracket Redesign (FR-07) — v2** ⬅️ IN PROGRESS
    - [ ] **Data model cleanup**
        - [ ] Delete dead `bracketUtils.ts` (unused client-side code)
        - [ ] Remove duplicate `Match` type from `types.ts`
        - [ ] Single source of truth: `MatchDocument` in `models.ts`
        - [ ] Add `tournamentId` field to `MatchDocument` and `RegistrationDocument`
    - [ ] **Structured scores**
        - [ ] Replace `score?: string` with `sets: SetScore[]` (`{ set, score1, score2 }`)
    - [ ] **Match status**
        - [ ] Add explicit `status: 'scheduled' | 'in_progress' | 'completed' | 'bye'`
    - [ ] **Proper seeding algorithm**
        - [ ] Standard bracket placement: seed 1 vs N, 2 vs N-1, etc.
        - [ ] Top seeds placed at opposite poles of the draw
    - [ ] **Bye cascading**
        - [ ] Recursive auto-advance (not just Round 1)
        - [ ] Handle double-bye matches (both slots empty → cascade to R2+)
    - [ ] **UUID-based match IDs**
        - [ ] Replace fragile `MS-R1-M1` with crypto UUIDs
        - [ ] Round/position tracked as separate fields (already exists)
    - [ ] **API update** (`POST /api/matches`)
        - [ ] Integrate new seeding, bye logic, structured scores
    - [ ] **API update** (`PATCH /api/matches`)
        - [ ] Accept `sets[]` instead of raw score string
        - [ ] Validate set scores (badminton rules: 21 pts, deuce at 20-20, max 30)
    - [ ] **Frontend update** (`bracket/page.tsx`)
        - [ ] Use shared `MatchDocument` type (no inline `MatchData`)
        - [ ] Display set scores properly
        - [ ] Show match status badges (scheduled, live, completed)

---

## 🎮 Phase 3: Game Day Live (Week 6)
Focus: Real-time updates, Scoring.

- [ ] **Live Scoring (FR-09, FR-10)**
    - [x] Backend: `PATCH /api/matches` — update score & winner
    - [x] Backend: Auto-advance winner to next match node
    - [ ] **UI: Score Input Modal** (Admin clicks match → enters set scores)
    - [ ] UI: Score input form (Set 1, Set 2, Set 3) with validation
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
- [ ] Custom domain & SSL
- [ ] Monitoring / Application Insights
