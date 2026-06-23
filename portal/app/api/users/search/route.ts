import { NextRequest, NextResponse } from "next/server";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { auth } from "@/auth";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 10;
const MIN_QUERY_LENGTH = 2;

/**
 * GET /api/users/search?q=...&limit=8
 *
 * Partner picker search. Available to ANY signed-in user (not admin-only).
 * Returns privacy-minimal results for CLAIMED users (those who have signed in
 * at least once — `email` is a non-empty `@microsoft.com` address).
 *
 * Response shape: { results: [{ alias, name }] }
 * Never exposes email or phoneNumber.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate & normalize the query term
  const rawQuery = request.nextUrl.searchParams.get("q") ?? "";
  const q = rawQuery.trim();
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] });
  }
  const qLower = q.toLowerCase();

  // Validate & cap the limit
  const rawLimit = Number(request.nextUrl.searchParams.get("limit"));
  let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  // Exclude the requester themselves
  const selfId = String(session.user.email).trim().toLowerCase().replace(/@.*$/, "");

  try {
    const container = getUsersContainer();

    // CLAIMED users only, matching alias-startsWith OR name-contains (case-insensitive).
    // All user input is parameterized — never interpolated into the query string.
    const { resources } = await container.items
      .query<{ alias?: string; name?: string }>({
        query:
          "SELECT c.alias, c.name FROM c " +
          "WHERE c.email != '' AND ENDSWITH(c.email, '@microsoft.com') " +
          "AND c.id != @self " +
          "AND (STARTSWITH(c.alias, @qLower) OR CONTAINS(c.name, @q, true)) " +
          "OFFSET 0 LIMIT @limit",
        parameters: [
          { name: "@self", value: selfId },
          { name: "@qLower", value: qLower },
          { name: "@q", value: q },
          { name: "@limit", value: limit },
        ],
      })
      .fetchAll();

    const results = resources.map((u) => {
      const alias = u.alias ?? "";
      const name = (u.name ?? "").trim();
      return {
        alias,
        name: name || alias,
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error searching users:", error);
    return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
  }
}
