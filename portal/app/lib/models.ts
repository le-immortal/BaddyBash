/**
 * Cosmos DB data models for Baddy Bash Portal.
 *
 * Design decisions:
 * - Users partitioned by `id` (userId / alias) — high cardinality, direct point reads.
 * - Registrations partitioned by `userId` — all registrations for a user in same partition.
 * - Matches partitioned by `category` — bracket queries always scoped to a category.
 *
 * v2 changes:
 * - MatchDocument: structured SetScore[], explicit MatchStatus, tournamentId.
 * - UUID-based match IDs (round/position tracked separately).
 * - Single source of truth for all types (types.ts & bracketUtils.ts deleted).
 */

export type Category = "MS" | "WS" | "MD" | "WD" | "XD";

export type RegistrationStatus = "confirmed" | "cancelled";

export type MatchStatus = "scheduled" | "in_progress" | "completed" | "bye";

/**
 * A single set score in a badminton match.
 * Standard rules: first to 21, win by 2, cap at 30.
 */
export interface SetScore {
  set: number;            // 1, 2, or 3
  score1: number;         // player1/team1 score
  score2: number;         // player2/team2 score
}

/**
 * User document — stored in the `users` container.
 * Partition key: /id
 */
export interface UserDocument {
  id: string;             // unique userId (e.g., GitHub username or alias)
  name: string;
  email: string;
  alias: string;          // Microsoft alias (e.g., v-john)
  avatar?: string;
  phoneNumber: string;
  tShirtSize?: string;    // S, M, L, XL, XXL
  isAdmin?: boolean;
  createdAt: string;      // ISO date
  updatedAt: string;
}

/**
 * Registration document — stored in the `registrations` container.
 * Partition key: /userId
 *
 * One document per category registration.
 * For doubles: includes partnerId and partnerName.
 */
export interface RegistrationDocument {
  id: string;             // unique registration id (e.g., `${userId}_${category}`)
  userId: string;         // partition key
  userName: string;
  category: Category;
  status: RegistrationStatus;
  tournamentId?: string;  // e.g., "baddybash-2026" — future-proofs multi-event
  partnerId?: string;     // for doubles (MD, WD, XD)
  partnerName?: string;
  partnerPhone?: string;
  seed?: number;          // admin-assigned seed ranking
  createdAt: string;
  updatedAt: string;
}

/**
 * Match document — stored in the `matches` container.
 * Partition key: /category
 *
 * Each match is a node in the single-elimination bracket tree.
 * `nextMatchId` links to the parent node the winner advances into.
 * `nextMatchSlot` indicates whether the winner fills slot 1 or 2 in the parent.
 */
export interface MatchDocument {
  id: string;             // UUID — not tied to round/position
  category: Category;     // partition key
  tournamentId?: string;  // e.g., "baddybash-2026"
  round: number;          // round number (1 = first round)
  position: number;       // position in the round (0-indexed)
  status: MatchStatus;    // explicit lifecycle state

  matchNumber?: number;   // sequential match number for display (M1, M2, ...)

  // Participants
  player1Id?: string;
  player1Name?: string;
  player1Seed?: number;   // admin-assigned seed (only if seeded)
  player2Id?: string;
  player2Name?: string;
  player2Seed?: number;   // admin-assigned seed (only if seeded)

  // Result
  sets: SetScore[];       // structured set scores (empty [] until played)
  winnerId?: string;
  winnerName?: string;

  // Bracket tree links
  nextMatchId?: string;   // id of the match the winner advances to
  nextMatchSlot?: 1 | 2;  // which slot (player1 or player2) in the next match

  // Scheduling
  court?: string;         // assigned court (e.g., "Court 2")
  scheduledTime?: string; // Flexible time string (e.g., "10:30 AM" or "After M5")

  createdAt: string;
  updatedAt: string;
}

/**
 * Helper: format SetScore[] into a display string.
 * e.g., [{ set:1, score1:21, score2:19 }, { set:2, score1:21, score2:15 }] → "21-19, 21-15"
 */
export function formatSetScores(sets: SetScore[]): string {
  if (!sets || sets.length === 0) return "";
  return sets
    .sort((a, b) => a.set - b.set)
    .map((s) => `${s.score1}-${s.score2}`)
    .join(", ");
}

/**
 * Helper: validate a single set score against badminton rules.
 * - Normal win: first to 21, leading by ≥ 2.
 * - Deuce: at 20-20, play continues until 2-point lead or 30-29/30-28 cap.
 * - Max score: 30.
 */
export function isValidSetScore(score1: number, score2: number): boolean {
  const max = Math.max(score1, score2);
  const min = Math.min(score1, score2);

  if (max < 0 || min < 0) return false;
  if (max > 30 || min > 30) return false;

  // Normal win: 21+ with 2-point lead
  if (max >= 21 && max - min >= 2 && max <= 29) return true;

  // Deuce cap: 30-something (30-28, 30-29)
  if (max === 30 && min >= 28) return true;

  return false;
}

export const CATEGORIES: { id: Category; name: string; type: "singles" | "doubles" }[] = [
  { id: "MS", name: "Men's Singles", type: "singles" },
  { id: "WS", name: "Women's Singles", type: "singles" },
  { id: "MD", name: "Men's Doubles", type: "doubles" },
  { id: "WD", name: "Women's Doubles", type: "doubles" },
  { id: "XD", name: "Mixed Doubles", type: "doubles" },
];

export function isDoubles(category: Category): boolean {
  return category === "MD" || category === "WD" || category === "XD";
}
