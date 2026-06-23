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
 * Response shape: { results: [{ alias, name, profileComplete }] }
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
    // Project a computed `hasPhone` boolean rather than selecting phoneNumber so
    // no contact PII ever leaves Cosmos into the response objects (defense-in-depth
    // against a future spread refactor leaking phone numbers).
    const { resources } = await container.items
      .query<{ alias?: string; name?: string; hasPhone?: boolean }>({
        query:
          "SELECT c.alias, c.name, (IS_DEFINED(c.phoneNumber) AND c.phoneNumber != '') AS hasPhone FROM c " +
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
      const hasRealName = name.length > 0 && name.toLowerCase() !== alias.toLowerCase();
      const hasPhone = u.hasPhone === true;
      return {
        alias,
        name: name || alias,
        profileComplete: hasRealName && hasPhone,
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error searching users:", error);
    return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
  }
}
