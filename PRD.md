# Product Requirements Document (PRD): Baddy Bash Portal

**Project Name:** Baddy Bash Tournament Portal  
**Version:** 1.0  
**Status:** Draft  
**Target Audience:** Microsoft Employees & Organizing Committee  

---

## 1. Introduction

### 1.1 Purpose
The purpose of the **Baddy Bash Portal** is to centralize and automate the management of the internal Microsoft badminton tournament. It aims to eliminate manual spreadsheet tracking, enforce strict participation rules (maximum 2 categories), simplify partner matching for doubles, and provide a real-time platform for fixture management and live scoring during the event.

### 1.2 Scope
**In Scope:**
* User Authentication via Microsoft Entra ID (SSO).
* Registration workflow for 5 distinct categories.
* Automated enforcement of the "Max-2 Categories" participation rule.
* Partner invitation and acceptance system for doubles categories.
* Admin dashboard for player seeding and fixture generation (brackets).
* Real-time score updates and bracket progression.

**Out of Scope:**
* Payment processing (Assuming free internal event or payroll deduction externally).
* Inventory management (Shuttles/Rackets).
* Mobile Native App (Responsive Web App will be used).

## 2. User Personas

### Persona A: The Smasher (Employee/Participant)
* **Description:** A Microsoft employee looking to register quickly, find a doubles partner, view their match schedule, and check live results.
* **Goals:** Easy registration, mobile accessibility, instant notification of match timings.

### Persona B: The Tournament Director (Admin/Organizer)
* **Description:** The organizing committee member responsible for managing entries, verifying eligibility, seeding top players, generating the tournament draw, and updating scores courtside.
* **Goals:** Efficient bracket generation, easy score input, ability to manage withdrawals.

## 3. User Stories & Functional Requirements

### 3.1 User Stories
* **As a Player**, I want to login with my MSFT credentials so that I don't have to create a new account.
* **As a Player**, I want to invite a colleague as my doubles partner using their alias so that we can register as a team.
* **As a Player**, I want the system to prevent me from registering if I have already selected two categories so that I don't accidentally disqualify myself.
* **As an Admin**, I want to assign seed rankings to top players so that they don't meet in the early rounds.
* **As an Admin**, I want to click a button to "Generate Fixtures" so that the bracket is created automatically based on seeds and entries.
* **As an Admin**, I want to update scores in real-time so that participants can see the live bracket status.

### 3.2 Functional Requirements

#### Registration & Validation
1.  **FR-01 Authentication:** The system shall authenticate users via Microsoft Entra ID (SSO).
2.  **FR-02 Categories:** The system must support 5 Categories:
    * Men's Singles (MS)
    * Men's Doubles (MD)
    * Women's Singles (WS)
    * Women's Doubles (WD)
    * Mixed Doubles (XD)
3.  **FR-03 Constraint Check:** The system shall strictly enforce a **limit of 2 registrations per unique User ID** across all categories.
4.  **FR-04 Partner Logic:** For doubles, the system shall require the initiator to input a partner's alias. The registration remains "Pending" until the partner accepts via the portal or email link.
5.  **FR-05 Partner Validation:** The system must perform the "Max-2" validation check on the **partner** at the moment of acceptance.

#### Tournament Management
6.  **FR-06 Seeding:** The Admin interface shall allow manual Seeding (Rank 1-N) for confirmed players/teams.
7.  **FR-07 Bracket Generation:** The system shall generate a Single Elimination Knockout Bracket logic, placing seeds at opposite poles and automatically assigning "Byes" if the player count is not a power of 2 ($2^n$).
8.  **FR-08 Scheduling:** The system shall allow Admins to drag-and-drop matches to specific courts/time slots.
9.  **FR-09 Live Scoring:** The system shall provide a Live Score Input form for Admins to enter set scores (e.g., 21-19, 21-15).
10. **FR-10 Advancement:** Upon match completion, the system shall automatically advance the winner to the next node in the bracket.

## 4. Non-Functional Requirements

* **Performance:** The bracket view must load in under 2 seconds. Real-time score updates should reflect on the public dashboard within 5 seconds.
* **Security:** Access restricted to the Microsoft Corporate Network (Intranet) or validated via Zero Trust network access. Data encryption at rest and in transit.
* **Scalability:** The registration module must handle a high concurrency spike (e.g., 500 users hitting "Register" simultaneously) when registration opens.
* **Reliability:** The system must maintain data integrity for match results; no data loss is acceptable during bracket progression.

## 5. UI/UX Design

### Player Dashboard
* **Home:** Current Registration Status card (e.g., "Confirmed: MS, XD").
* **Action Center:** "Pending Partner Requests".
* **Live:** A mobile-responsive tree view of the tournament bracket.

### Admin Dashboard
* **Grid View:** Filterable table of all participants with "Seed" input fields.
* **Fixture View:** A writable bracket view where clicking a match opens a modal to enter scores.

## 6. Technical Architecture

* **Frontend:** React.js or Blazor (for seamless integration with the MS ecosystem).
* **Backend:** .NET Core API or Node.js.
* **Database:** Azure SQL Database or Cosmos DB.
* **Real-time:** Azure SignalR Service or WebSockets for pushing live score updates to clients.

### Database Schema (High-Level)
* `Users`: ID, Alias, Name, Gender.
* `Registrations`: ID, UserID, CategoryID, PartnerID (nullable), Status.
* `Matches`: ID, Player1, Player2, Score, WinnerID, NextMatchID.

## 7. Metrics & Analytics

* **Registration Fill Rate:** % of slots filled vs. capacity per category.
* **System Latency:** Average time to save a score.
* **Engagement:** Daily Active Users (DAU) checking the bracket during the tournament days.
* **No-Show Rate:** Number of walkovers recorded in the system.

## 8. Roadmap & Milestones

### Phase 1: Registration Engine (Weeks 1-3)
* SSO Setup.
* Database Schema implementation.
* "Max-2" Logic & Partner Invite flow.
* **Milestone:** Registration Go-Live.

### Phase 2: The Tournament Brain (Weeks 4-5)
* Admin Dashboard for Seeding.
* Algorithm for Fixture Generation (Handling Byes/Seeds).
* **Milestone:** Brackets Published.

### Phase 3: Game Day Live (Week 6)
* Live Scoring UI.
* Public Leaderboard/Bracket View.
* **Milestone:** Tournament Execution.

## 9. Open Questions

1.  **Substitution Policy:** If a player is injured before the tournament, does the system allow a partner swap, or is the team disqualified?
2.  **Gender Validation:** Do we rely on the directory data for gender (Men's vs Women's categories) or allow self-identification during registration?
3.  **Waitlist Logic:** If a category is full, do we need an automated waitlist system?