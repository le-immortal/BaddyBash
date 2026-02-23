# Database Schema Evaluation Report — BaddyBash Portal

**Prepared by:** Database Engineering Review  
**Date:** 2026-02-23  
**Database:** Azure Cosmos DB (NoSQL, document model)  
**Application:** BaddyBash — Internal Microsoft Badminton Tournament Portal

---

## 1. Executive Summary

The BaddyBash Portal uses **Azure Cosmos DB** with three document containers. Overall the partition-key choices align well with the primary read paths, and the deterministic registration ID design is sound. However, there are several correctible risks: settings data co-mingled with user data, denormalised partner fields that can drift, cross-partition fan-out queries during bracket generation, and an in-memory cache that breaks in any multi-instance deployment. This report details every finding with recommended remediation.

---

## 2. Schema Overview

### 2.1 Container Map

| Container | Partition Key | Primary Document Type | Notable Secondary Doc |
|---|---|---|---|
| `users` | `/id` | `UserDocument` | `CONFIG_GLOBAL` (settings) |
| `registrations` | `/userId` | `RegistrationDocument` | — |
| `matches` | `/category` | `MatchDocument` | — |

### 2.2 Document Shapes

#### `UserDocument` (`users`)
```
id            string   — userId == alias (e.g. "jdoe")
name          string
email         string
alias         string   — identical to id
avatar        string?
phoneNumber   string
tShirtSize    string?  — S | M | L | XL | XXL
isAdmin       boolean?
createdAt     ISO date
updatedAt     ISO date
```

#### `RegistrationDocument` (`registrations`)
```
id            string   — "${userId}_${category}"  e.g. "jdoe_MS"
userId        string   — partition key
userName      string   — denormalised display name
category      Category — MS | WS | MD | WD | XD
status        string   — "confirmed" | "cancelled"
tournamentId  string?
partnerId     string?  — doubles only
partnerName   string?  — denormalised
partnerPhone  string?  — denormalised
seed          number?
createdAt     ISO date
updatedAt     ISO date
```

#### `MatchDocument` (`matches`)
```
id            UUID     — stable, not tied to round/position
category      Category — partition key
tournamentId  string?
round         number   — 1 = first round
position      number   — 0-indexed within round
status        MatchStatus — scheduled | in_progress | completed | bye
matchNumber   number?  — display label (M1, M2 …)
player1Id     string?
player1Name   string?  — denormalised
player1Seed   number?
player2Id     string?
player2Name   string?  — denormalised
player2Seed   number?
sets          SetScore[]
winnerId      string?
winnerName    string?  — denormalised
nextMatchId   string?  — parent node UUID
nextMatchSlot 1 | 2
scheduledTime string?
createdAt     ISO date
updatedAt     ISO date
```

#### `SetScore` (embedded in `MatchDocument`)
```
set     number   — 1 | 2 | 3
score1  number   — team1 score
score2  number   — team2 score
```

---

## 3. Strengths

### 3.1 Partition Keys Match Primary Access Patterns

| Container | Key | Primary Query | Efficiency |
|---|---|---|---|
| `users` | `/id` | `GET /api/users?id=` | O(1) point read |
| `registrations` | `/userId` | `GET /api/registrations?userId=` | Single-partition scan |
| `matches` | `/category` | `GET /api/matches?category=` | Single-partition scan |

All three hot-path reads are single-partition operations — the most efficient query type in Cosmos DB.

### 3.2 Deterministic Registration IDs

Using `${userId}_${category}` as the registration `id` (e.g., `jdoe_MS`) allows:
- O(1) point reads without any query (`container.item(id, partitionKey).read()`).
- Built-in uniqueness enforcement — Cosmos DB returns HTTP 409 on duplicate `id` within the same partition, which the API already catches.

### 3.3 Structured Set Scores

`SetScore[]` is embedded as a structured array rather than a raw string (e.g., `"21-19,21-15"`). This enables:
- Server-side score validation (`isValidSetScore()`).
- Clean rendering without parsing.
- Future aggregation (e.g., average points per set).

### 3.4 Bracket Tree via `nextMatchId` / `nextMatchSlot`

Representing the bracket as a linked list of match documents is a natural fit for a NoSQL document store. Each match knows exactly which parent slot to fill upon completion, keeping the advancement logic (in `matchService.ts`) simple and self-contained.

### 3.5 `tournamentId` Future-Proofing

Both `RegistrationDocument` and `MatchDocument` include an optional `tournamentId`. This allows scoping all queries to a specific event once multi-event support is needed.

---

## 4. Risks and Trade-offs

### 4.1 ⚠️ Settings Document Co-mingled with User Data

**Finding:** `CONFIG_GLOBAL` (global tournament settings: `registrationOpen`, `bracketsVisible`) is stored in the **`users`** container using `id = "CONFIG_GLOBAL"`.

**Problem:**
- Conceptually wrong. A settings record is not a user record. It pollutes `SELECT * FROM c ORDER BY c.name` queries with a non-user document.
- It creates a hard coupling: any code that lists all users must filter out `CONFIG_GLOBAL`.
- If the partition key ever changes or the users container is migrated, settings could be silently lost.

**Recommendation:** Create a dedicated **`settings`** container (partition key `/id`) for all configuration documents. This is cheap in Cosmos DB — containers are logical namespaces with negligible overhead.

---

### 4.2 ⚠️ Denormalised Partner Data Can Drift

**Finding:** Each doubles registration stores `partnerName` and `partnerPhone` from the partner's profile at registration time.

**Problem:** If the partner later updates their name or phone number (via `PATCH /api/users`), all referencing registration documents become stale. For example:
- `jdoe_MD.partnerName = "Arjun Reddy"` and `arjun_MD.partnerName = "John Doe"`.
- If John changes his display name to "John D.", `arjun_MD.partnerName` will still read `"John Doe"`.

**Recommendation:** At read time, hydrate partner display data from the `users` container rather than trusting the cached denormalised field. Keep `partnerName`/`partnerPhone` only as a cold-path fallback when the user document doesn't exist yet (which can happen for ghost accounts created before first login).

---

### 4.3 ⚠️ Mirrored Partner Registrations Risk Divergence

**Finding:** For every doubles registration, two documents are created: one for the initiating player (`jdoe_MD`) and one for the partner (`arjun_MD`). Both reference each other via `partnerId`.

**Problem:**
- A `DELETE` call that deletes one side and then fails before deleting the other leaves the data in an inconsistent state (orphan partner registration).
- Any update to one (e.g., adding a seed) must be replicated to the other manually. Currently only the seeder document is updated.
- 2× storage per doubles team.

**Recommendation:** Adopt a **single team document** pattern for doubles: one canonical registration per team (keyed by the sorted `userId+partnerId` pair) rather than two mirrored documents. Both players query by their own `userId`, which requires a cross-partition read but eliminates the mirror synchronisation problem entirely. Alternatively, keep the mirror pattern but wrap both writes in a server-side transaction (Cosmos DB stored procedure or transactional batch within the same partition — though cross-partition transactions are not natively supported).

---

### 4.4 ⚠️ Cross-Partition Fan-out on Category Queries in `registrations`

**Finding:** Bracket generation queries registrations by `category`:
```sql
SELECT * FROM c WHERE c.category = @category AND c.status = 'confirmed'
```
The partition key is `/userId`, **not** `/category`. This forces a cross-partition fan-out query across every logical partition in the container.

**Impact:** At scale (e.g., 500 registered players), this query touches every partition, increases RU consumption significantly, and adds latency proportional to the number of partitions.

**Recommendation (choose one):**
1. **Change the partition key to `/category`** — natural for category-scoped bracket generation. Per-user queries become cross-partition but are used less frequently.
2. **Add a secondary `registrations-by-category` container** indexed by `/category` — maintained in sync via the API layer. Adds write overhead but keeps both query patterns efficient.
3. **Add a Cosmos DB composite index on `(category, status)`** — this does not eliminate the fan-out but reduces RU consumption per partition via the index.

The right choice depends on the read/write ratio. For a tournament app, cross-partition reads for bracket generation (admin, infrequent) are likely acceptable, but indexing is still recommended.

---

### 4.5 ⚠️ In-Memory Settings Cache is Not Multi-Instance Safe

**Finding:** `settings.ts` caches `GlobalSettings` in a module-level variable (`cachedSettings`) with **no TTL** and only invalidates on the instance that calls `updateGlobalSettings()`.

**Problem:** In any deployment with more than one server instance (e.g., Azure App Service with auto-scale, or multiple Next.js pods), the following race condition applies:
- Admin updates `registrationOpen = false` on Instance A → cache updated on A.
- Instance B still holds the old cached `registrationOpen = true` → new registrations continue to be accepted on Instance B.

**Recommendation:**
1. **Short-circuit with a TTL** (e.g., 30–60 seconds). Even a 1-minute staleness window is acceptable for tournament settings.
2. **Use Azure Cache for Redis** as a shared distributed cache across instances (the `cache.ts` file already acknowledges this for the admin player cache).
3. **Add a Cache-Control header** to the settings endpoint so CDN/edge layers don't serve stale values to clients.

---

### 4.6 ⚠️ Missing Custom Cosmos DB Indexes for Secondary Lookups

**Finding:** Several frequently used queries rely on fields that are not the partition key and thus depend on Cosmos DB's default "all-paths" index:

| Container | Query Field(s) | Query Location |
|---|---|---|
| `users` | `email` | Auth check in every POST/DELETE registration |
| `registrations` | `category`, `status` | Bracket generation |
| `matches` | (none — category is PK) | — |

Default indexing in Cosmos DB indexes every field, which covers these queries but at a **write-amplification cost** — every document write updates the full index tree.

**Recommendation:** Define an **explicit indexing policy** in the container creation scripts (in `cosmosClient.ts` and `seed.ts`):
- **`users`:** Composite index on `[email ASC]`.
- **`registrations`:** Composite index on `[category ASC, status ASC]`.
- Exclude large or rarely queried blob fields (e.g., `avatar`) from the index using `excludedPaths`.

---

### 4.7 ⚠️ Player Names Denormalised in Three Places

**Finding:** A player's display name appears in:
1. `UserDocument.name`
2. `RegistrationDocument.userName`
3. `MatchDocument.player1Name` / `player2Name` / `winnerName`

**Problem:** A name correction in `UserDocument` does not propagate to registrations or match history.

**Recommendation:** For registration display, read the name from `UserDocument` at query time (already done partially in bracket generation via `nameMap`). For match history, consider name-at-match-time as acceptable (sports records don't retroactively change player names); document this decision explicitly.

---

### 4.8 ℹ️ `id === alias` Design Has Immutability Implications

**Finding:** `UserDocument.id` equals `UserDocument.alias` (both are the Microsoft alias, e.g., `"jdoe"`). The alias is the partition key.

**Implication:** Cosmos DB does not support renaming the partition key field. If a user's alias changes (e.g., after an internal re-org), the user record must be deleted and re-created with a new ID, and all referencing documents (`registrations`, `matches`) must be updated to point to the new ID.

**Recommendation:** Use an **opaque UUID** as the partition key (`id`) and store the alias as a separate queryable field. This makes the key immutable while allowing alias changes. This is a larger refactor but significantly reduces operational risk for a long-lived system.

---

### 4.9 ℹ️ `RegistrationStatus` Enum Partially Used

**Finding:** `RegistrationStatus` is defined as `"confirmed" | "cancelled"`, implying soft-delete semantics. However, the `DELETE /api/registrations` endpoint performs a **hard delete** — the document is removed entirely.

**Impact:** No audit trail of who was registered and then cancelled. This matters for dispute resolution and capacity tracking.

**Recommendation:** Switch `DELETE` to a **soft delete**: set `status = "cancelled"` and retain the document. Filter `status != 'cancelled'` in all active queries (which is already the pattern in the Max-2 check). Re-enable hard delete only for admin cleanup operations.

---

### 4.10 ℹ️ Category-Partitioned Matches Don't Scale to Multi-Tournament

**Finding:** `matches` is partitioned by `/category`. With `tournamentId` added for multi-event support, all matches for `"MS"` across all tournaments share the same physical partition.

**Impact:** A Cosmos DB physical partition has a maximum capacity of 50 GB and 10,000 RU/s. For a casual internal tournament this is not a concern. For a multi-year, multi-event platform it could become a hot partition.

**Recommendation:** If multi-tournament support becomes a requirement, change the partition key to a composite `/tournamentId_category` (e.g., `"baddybash-2026_MS"`) or use a **hierarchical partition key** (supported in Cosmos DB v2+): `["/tournamentId", "/category"]`.

---

## 5. Summary Table

| # | Finding | Severity | Effort to Fix |
|---|---|---|---|
| 4.1 | Settings stored in users container | Medium | Low |
| 4.2 | Denormalised partner data can drift | Medium | Medium |
| 4.3 | Mirrored partner registrations can diverge | High | High |
| 4.4 | Cross-partition fan-out on category queries | Medium | Medium |
| 4.5 | Settings cache not multi-instance safe | High | Low |
| 4.6 | Missing custom Cosmos DB index policy | Medium | Low |
| 4.7 | Player names in three places can drift | Low | Low |
| 4.8 | `id === alias` is immutable by design | Low | High |
| 4.9 | Hard delete loses audit trail | Low | Low |
| 4.10 | Category partition doesn't scale to multi-event | Low | Medium |

---

## 6. Recommended Priority Order

1. **Fix the settings cache TTL** (Finding 4.5) — low effort, high impact, production risk today.
2. **Move `CONFIG_GLOBAL` to its own container** (Finding 4.1) — low effort, eliminates design smell.
3. **Add custom indexing policy** (Finding 4.6) — low effort, reduces RU costs immediately.
4. **Switch `DELETE` to soft delete** (Finding 4.9) — low effort, restores audit trail.
5. **Hydrate partner names at read time** (Finding 4.2) — medium effort, eliminates drift.
6. **Add cross-partition registration index on `(category, status)`** (Finding 4.4) — medium effort, reduces bracket-gen cost.
7. **Evaluate single-team-document for doubles** (Finding 4.3) — high effort, architectural change.
8. **UUID-based user IDs** (Finding 4.8) — high effort, deferred until multi-year scope confirmed.

---

## 7. Conclusion

The schema is well-suited for a single-instance, single-event internal tournament with a modest number of players. The partition key choices are correct for the dominant read paths, and the bracket tree link design is clean. The most pressing technical debt items are the multi-instance settings cache risk, the absence of a custom indexing policy, and the divergence risk in mirrored partner registrations. Addressing the priority-1 through priority-4 items requires minimal code changes and will make the schema significantly more robust before the next event cycle.
