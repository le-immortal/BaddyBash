# Baddy Bash Portal - Progress Tracker

This document tracks the development progress against the [Product Requirements Document (PRD)](PRD.md).

**Current Status:** 🟡 Phase 2 (Mostly Complete) — Phase 3 partially started

---

## 🚀 Phase 1: Registration Engine (Weeks 1-3)
Focus: User Authentication, Registration logic, Partner constraints.

- [x] **Project Setup**
    - [x] Initialize Next.js 16+ Project (TypeScript, Tailwind v4, Turbopack)
    - [x] Configure Linting & Formatting
    - [x] Create project structure (`/app`, `/components`, `/lib`)

- [x] **Authentication (FR-01)**
    - [x] Implement NextAuth.js v5 (Auth.js) with GitHub OAuth provider
    - [x] Protect routes (`/dashboard`, `/admin`, `/bracket`) via Middleware
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

- [x] **Bracket Generation (FR-07)**
    - [x] Algorithm: Generate Single Elimination Tree (Power of 2 logic)
    - [x] Algorithm: Handle "Byes" automatically (auto-advance)
    - [x] Algorithm: Seed-based ordering
    - [x] **Doubles fix: Dedup registrations into teams** (canonical pair key, combined "A & B" display names)
    - [x] Backend: Save generated fixture/match nodes (Cosmos DB)
    - [x] UI: Dynamic Bracket Visualization (round columns, match cards, dark theme)
    - [x] UI: Category tab switching (MS, WS, MD, WD, XD)
    - [x] Frontend wired to API (bracket page)

---

## 🎮 Phase 3: Game Day Live (Week 6)
Focus: Real-time updates, Scoring.

- [x] **Live Scoring (FR-09, FR-10) — Backend**
    - [x] Backend: `PATCH /api/matches` — update score & winner
    - [x] Backend: Auto-advance winner to next match node
    - [ ] **UI: Score Input Modal (Admin clicks match → enters score)** ⬅️ NEXT
    - [ ] UI: Score input form (Set 1, Set 2, Set 3)
    - [ ] Backend: Real-time updates (SignalR / Polling)

- [ ] **Public Views**
    - [x] Landing Page with Event Info
    - [x] Bracket View (pulls live data from API)
    - [ ] **Leaderboard / Results page**

---

## 🛠 Infrastructure & DevOps
- [ ] Set up GitHub Repository
- [ ] Configure CI/CD Pipeline (GitHub Actions)
- [ ] Provision Azure Resources (Static Web App or App Service)
- [ ] Domain & SSL Configuration
