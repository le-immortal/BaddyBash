# Registration System Analysis: Cases & Edge Cases

## 1. Standard Constraints & Rules
These are the foundational rules the system enforces.

1.  **Max-2 Rule**: A unique player (identified by `userId`/`alias`) can only have **confirmed** registrations in a maximum of **2 categories** total.
2.  **Gender Segregation**:
    *   Players in **MS/MD** (Men's) cannot register for **WS/WD** (Women's).
    *   *Note: This is currently enforced only on the frontend. The backend implementation relies on the assumption that players self-select correctly or admins audit. Strictly speaking, the backend doesn't know a user's gender.*
3.  **Doubles Pairing**:
    *   Registering for a doubles category (MD, WD, XD) requires a valid partner ID (alias).
    *   Both the registrant and the partner consume 1 slot each for that category.

---

## 2. Test Cases & Edge Cases

### A. Single Player Flows
| Case | Scenario | Expected Outcome | status |
| :--- | :--- | :--- | :--- |
| **A1** | User registers for 1st category (e.g., MS). | **Success**. Count = 1. | ✅ Covered |
| **A2** | User registers for 2nd category (e.g., MD). | **Success**. Count = 2. | ✅ Covered |
| **A3** | User tries to register for 3rd category. | **Failure** (409 Conflict). "Maximum 2 registrations per player". | ✅ Covered |
| **A4** | User tries to register for same category twice. | **Failure** (409 Conflict). "Already registered for [Category]". | ✅ Covered |
| **A5** | User cancels a registration (if enabled). | **Success**. Count drops to 1. | *(Feature Disabled)* |

### B. Doubles / Partner Flows
| Case | Scenario | Expected Outcome | status |
| :--- | :--- | :--- | :--- |
| **B1** | User A registers for MD with Partner B (who has 0 existing regs). | **Success**. <br>- User A: Registered for MD.<br>- Partner B: Auto-registered for MD (confirmed). | ✅ Covered |
| **B2** | User A registers for MD with Partner B (who already has 2 regs). | **Failure** (409 Conflict). "Partner 'B' already has 2 registrations". | ✅ Covered |
| **B3** | User A registers for MD with Partner B. User B tries to register for MD with User A. | **Failure**. User B is already registered for MD (auto-created by A). System sees duplicate category for B. | ✅ Covered |
| **B4** | User A registers for MD with Partner B. User B tries to register for MD with **User C**. | **Failure**. User B is already in MD (with A). "Partner 'B' is already registered for MD". | ✅ Covered |
| **B5** | User tries to partner with **themselves** (PartnerID = UserID). | **Failure** (400 Bad Request). "You cannot register with yourself". | ✅ Covered |
| **B6** | User registers for MD with Partner B. User A attempts to swap partner to C for the same category. | **Failure**. A is already registered for MD. Must delete first (admin only). | ✅ Covered |

### C. Cross-User Constraints (The "Race" & "Block" Cases)
| Case | Scenario | Expected Outcome | status |
| :--- | :--- | :--- | :--- |
| **C1** | **The "Trojan Horse"**: User A registers Partner B for MD. User B didn't know yet. | **Success**. User B is now locked into MD. User B cannot register for 2 other categories. | ✅ Covered |
| **C2** | **The "Chain Reaction"**: User A registers with B (MD). User B has 1 existing reg. User C tries to register with B (XD). | **Failure** for User C. Partner B reached max (1 existing + 1 from A = 2). | ✅ Covered |
| **C3** | **Alias Case Sensitivity**: User registers with "john" and later "JOHN". | **Handled**. System normalizes all inputs to lowercase/trimmed. Treated as same user. | ✅ Covered |
| **C4** | **Whitespace**: User enters " john " as partner. | **Handled**. System trims whitespace. Matches "john". | ✅ Covered |

### D. Data Integrity & Validation
| Case | Scenario | Expected Outcome | status |
| :--- | :--- | :--- | :--- |
| **D1** | **Implicit User Creation**: User A registers Partner B who has never logged in. | **Success**. A "placeholder" user doc is created for B so their name/stats exist. | ✅ Covered |
| **D2** | **Profile Claiming**: Partner B finally logs in after A registered them. | **Success**. B enters their alias. System finds existing placeholder, links B's email/auth to it. B sees the registration A made. | ✅ Covered |
| **D3** | **Orphaned Registration**: Removing a User Document manually (DB Admin). | **Risk**. Registrations key off `userId`. If user doc deleted, registration remains valid but `userName` might be stale. | *Admin Risk Only* |
| **D4** | **Cascading Delete**: Admin cancels User A's Doubles registration. | **Success**. System *should* automatically cancel Partner B's corresponding registration to free them up. | ✅ Covered (New Logic) |

### E. Security & Abuse
| Case | Scenario | Expected Outcome | status |
| :--- | :--- | :--- | :--- |
| **E1** | **Hijacking**: User A tries to change the email of User B (who is already active) via Profile Update API. | **Failure** (403). Prevented by security check added today. | ✅ Covered |
| **E2** | **Spamming**: User A registers random people as partners to lock their slots. | **Possible**. Authenticated users can technically register anyone. Mitigation: Admin monitoring. | ⚠️ Open (Biz Logic) |

## 3. Summary of "Red Flags"
If any of these happen, it is a bug:
- [ ] A player appears in >2 rows in the Admin dashboard.
- [ ] A Doubles team appears where P1 says "With P2" but P2 says "With P3" (Desync).
- [ ] A player matches themselves in a bracket (Seed 1 vs Seed 1).
