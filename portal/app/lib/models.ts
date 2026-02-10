/**
 * Cosmos DB data models for Baddy Bash Portal.
 *
 * Design decisions:
 * - Users partitioned by `id` (userId / alias) — high cardinality, direct point reads.
 * - Registrations partitioned by `userId` — all registrations for a user in same partition.
 * - Matches partitioned by `category` — bracket queries always scoped to a category.
 */

export type Category = "MS" | "WS" | "MD" | "WD" | "XD";

export type RegistrationStatus = "confirmed" | "cancelled";

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
 */
export interface MatchDocument {
  id: string;             // unique match id
  category: Category;     // partition key
  round: number;          // round number (1 = first round)
  position: number;       // position in the round (0-indexed)
  player1Id?: string;
  player1Name?: string;
  player2Id?: string;
  player2Name?: string;
  score?: string;         // e.g., "21-19, 21-15"
  winnerId?: string;
  winnerName?: string;
  nextMatchId?: string;   // id of the match the winner advances to
  court?: string;         // assigned court
  scheduledTime?: string; // ISO date
  createdAt: string;
  updatedAt: string;
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
