# Feature: Excel Import for Bracket Data (Phase D - Subtask 3)

This document outlines the detailed design and implementation plan for the **Bulk Bracket Import** feature. This functionality allows administrators to:
1.  Export current match data to Excel (Subtask 2 - Completed).
2.  Modify schedules, statuses, and assign winners offline.
3.  Re-import the Excel file to update the live tournament bracket.

---

## 📅 Architecture Overview

The import process is designed to be **safe** and **transactional**. The system will not blindly overwrite database records. Instead, it parses the Excel file client-side, presents a `Preview & Confirmation` UI, and then sends validated updates to the backend.

### **Workflow**
1.  **Start:** Admin clicks "Import Match Data" button.
2.  **Upload:** Selects the `.xlsx` file generated earlier.
3.  **Parse (Client-Side):** The browser uses `exceljs` to read the file.
4.  **Validate:**
    *   Find each match by `Match ID` (Column A).
    *   Compare Excel values vs. current DB state.
    *   Identify changes to `Scheduled Time`, `Status`, and `Winner`.
    *   Ignore structural changes (Round, Players).
5.  **Preview:** Show a table of pending changes (e.g., "M1: Update Time 10:00 -> 10:30").
6.  **Confirm:** Admin clicks "Commit Changes".
7.  **Process (Server-Side):**
    *   Backend validates admin permissions.
    *   Applies updates one by one.
    *   Advanced logic: If a winner is set, trigger **Match Advancement** (auto-scheduling next round).
8.  **Result:** Success/Error report shown to Admin.

---

## 🛠 Implementation Stages

We will break this feature down into 3 implementation stages.

### **Stage 1: UI & Client-Side Logic (Preview)**
**Goal:** build the "safe" part first — file parsing and change detection.

*   [x] **1.1 Import Button UI**: Add button to `AdminDashboard`.
*   [x] **1.2 Excel Parser**: Use `exceljs` to read the uploaded file.
*   [x] **1.3 Diff Engine**: Compare file content with current `matches` state (already loaded in dashboard).
    *   Detect Time changes.
    *   Detect Winner assignment (String normalization: "John Doe" vs "john doe").
*   [x] **1.4 Preview Modal**: Display pending changes in a table.
    *   Columns: Match #, Type (Time/Winner/Status), Old Value → New Value.

### **Stage 2: Backend API & Core Update Logic**
**Goal:** Handle the data updates securely.

*   [x] **2.1 API Endpoint**: Create `POST /api/admin/import/bracket`.
    *   Accepts JSON array of `{ updates: [...] }`.
*   [x] **2.2 Authorization**: Ensure only Admins can call this.
*   [x] **2.3 Update Logic**:
    *   Fetch match by ID.
    *   Update `scheduledTime` (if changed).
    *   Update `status` (if allowed).
    *   **Crucial:** If `winnerName` is provided, find the corresponding `playerId` (P1/P2) and prepare for advancement.

### **Stage 3: Winner Advancement Integration**
**Goal:** Replicate the "End Match" logic from the UI in the bulk import process.

*   [x] **3.1 Refactor Advancement Logic**:
    *   Extract the "Set Winner & Advance" logic from `PATCH /api/matches` into a shared helper function (`matchService.ts`).
    *   Ensure both the single-match API and bulk-import API use this same function.
*   [ ] **3.2 Rollback Protection**:
    *   Prevent updates if the match is already completed and next round started (unless forced?).
*   [ ] **3.3 Final Polish**: Success notifications, error handling for individual rows.

---

## 🔍 Detailed Import Rules

### **Field Handling**

| Field | Source | Action | Validation |
| :--- | :--- | :--- | :--- |
| **Match ID** | Excel (Hidden Col 1) | **Lookup Key** | Must exist in DB. |
| **Category** | Excel (Hidden Col 2) | **Verify** | Must match DB record. |
| **Player 1 ID** | Excel (Hidden Col 7) | **Resolve Winner** | Key for unambiguous winner resolution. |
| **Player 2 ID** | Excel (Hidden Col 10) | **Resolve Winner** | Key for unambiguous winner resolution. |
| **Match #** | Excel (Col 3) | **Verify** | Cosmetic check. |
| **Scheduled Time** | Excel (Col 14) | **Update** | Use text value directly. |
| **Status** | Excel (Col 12) | **Update** | Strict map: `scheduled`, `in_progress`, `completed`. |
| **Winner** | Excel (Col 13) | **Advance** | Checks: 1. "1"/"2" Slot, 2. Name Match. |

### **Winner Matching Logic (Prioritized)**
The admin can enter different values in the "Winner" column. The system resolves them in this order:

1.  **Direct ID Match:** (Highest Priority)
    *   Compare value against `Player 1 ID` and `Player 2 ID`.
    *   Useful if admin knows the ID or pastes it.
2.  **Slot Reference:** (Backup for ambiguous names)
    *   Input: `1` or `Team 1` -> Select `Player 1`.
    *   Input: `2` or `Team 2` -> Select `Player 2`.
3.  **Name / Team Name Match:** (User Friendly)
    *   Normalize string (trim, lowercase).
    *   Compare against `Player 1 Name` and `Player 2 Name`.
    *   **Singles:** Exact name match.
    *   **Doubles:** Full team name match (e.g. "Alice & Bob").
    *   **Ambiguity Check:** Only strictly needed if two players share the exact same name. If so, throw error: "Ambiguous name. Please use '1' or '2'."

---

## 📝 Next Steps
1.  Approve this design document.
2.  Begin **Stage 1: UI & Client-Side Logic**.
