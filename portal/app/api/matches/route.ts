import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getMatchesContainer, getRegistrationsContainer } from "@/app/lib/cosmosClient";
import {
  MatchDocument, RegistrationDocument, Category, MatchStatus,
  SetScore, isDoubles, isValidSetScore,
} from "@/app/lib/models";

/** A bracket participant — one player (singles) or one team (doubles). */
interface BracketParticipant {
  id: string;       // userId for singles, canonical team key for doubles
  name: string;     // display name (e.g. "John Doe & Mike Johnson")
  seed?: number;
}

/** Run async operations in parallel chunks to avoid overwhelming Cosmos DB. */
async function parallelBatch<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  chunkSize = 50
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(items.slice(i, i + chunkSize).map(fn));
  }
}

/**
 * Generate standard tournament seeding order for a bracket of given size.
 * E.g., size 8 → [1,8,4,5,2,7,3,6] — top seeds maximally separated,
 * seed 1 faces seed N, seed 2 faces seed N-1, etc.
 */
function generateSeedOrder(bracketSize: number): number[] {
  if (bracketSize === 1) return [1];
  const half = generateSeedOrder(bracketSize / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed);
    result.push(bracketSize + 1 - seed);
  }
  return result;
}

/** Fill the winner's slot in the parent match of the bracket tree. */
function fillNextMatchSlot(
  match: MatchDocument,
  matchMap: Map<string, MatchDocument>
): void {
  if (!match.nextMatchId || !match.winnerId) return;
  const next = matchMap.get(match.nextMatchId);
  if (!next) return;

  if (match.nextMatchSlot === 1) {
    next.player1Id = match.winnerId;
    next.player1Name = match.winnerName;
  } else {
    next.player2Id = match.winnerId;
    next.player2Name = match.winnerName;
  }
}

/**
 * GET /api/matches?category=MS
 * Returns all matches for a category, ordered by round and position.
 */
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") as Category | null;

  if (!category) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }

  try {
    const container = getMatchesContainer();
    const { resources } = await container.items
      .query<MatchDocument>({
        query: "SELECT * FROM c WHERE c.category = @category",
        parameters: [{ name: "@category", value: category }],
      })
      .fetchAll();

    // Sort client-side (avoids needing a composite index in Cosmos DB)
    resources.sort((a, b) => a.round - b.round || a.position - b.position);

    return NextResponse.json(resources);
  } catch (error) {
    console.error("Error fetching matches:", error);
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
  }
}

/**
 * POST /api/matches
 * Generate a single-elimination bracket for a given category.
 *
 * Algorithm:
 * 1. Fetch confirmed registrations → build participant list.
 * 2. Standard seeding: seed 1 vs N, 2 vs N-1 — top seeds maximally separated.
 * 3. UUID-based match IDs; tree linked via nextMatchId + nextMatchSlot.
 * 4. Byes cascade round-by-round: lone player auto-advances to parent slot.
 *
 * Body: { category, tournamentId? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, tournamentId } = body as {
      category: Category;
      tournamentId?: string;
    };

    if (!category) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }

    const regContainer = getRegistrationsContainer();
    const matchContainer = getMatchesContainer();

    // ── 1. Fetch confirmed registrations ──────────────────────────────────
    const { resources: registrations } = await regContainer.items
      .query<RegistrationDocument>({
        query:
          "SELECT * FROM c WHERE c.category = @category AND c.status = 'confirmed'",
        parameters: [{ name: "@category", value: category }],
      })
      .fetchAll();

    if (registrations.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 confirmed registrations to generate a bracket" },
        { status: 400 }
      );
    }

    // ── 2. Build participant list ─────────────────────────────────────────
    let participants: BracketParticipant[];

    if (isDoubles(category)) {
      const seen = new Set<string>();
      const teams: BracketParticipant[] = [];

      for (const reg of registrations) {
        const pairKey = [reg.userId, reg.partnerId || ""].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        teams.push({
          id: pairKey,
          name: `${reg.userName} & ${reg.partnerName || reg.partnerId || "TBD"}`,
          seed: reg.seed,
        });
      }

      if (teams.length < 2) {
        return NextResponse.json(
          { error: "Need at least 2 teams to generate a doubles bracket" },
          { status: 400 }
        );
      }
      participants = teams;
    } else {
      participants = registrations.map((r) => ({
        id: r.userId,
        name: r.userName,
        seed: r.seed,
      }));
    }

    // ── 3. Sort by seed (seeded first, then unseeded) ─────────────────────
    participants.sort((a, b) => {
      if (a.seed && b.seed) return a.seed - b.seed;
      if (a.seed) return -1;
      if (b.seed) return 1;
      return 0;
    });

    // ── 4. Bracket geometry ───────────────────────────────────────────────
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(participants.length)));
    const totalRounds = Math.log2(bracketSize);

    // ── 5. Delete existing matches for this category ──────────────────────
    const { resources: existingMatches } = await matchContainer.items
      .query<MatchDocument>({
        query: "SELECT c.id, c.category FROM c WHERE c.category = @category",
        parameters: [{ name: "@category", value: category }],
      })
      .fetchAll();

    await parallelBatch(existingMatches, (m) =>
      matchContainer.item(m.id, category).delete()
    );

    // ── 6. Create match tree (bottom-up, UUID IDs) ────────────────────────
    const now = new Date().toISOString();
    const matchGrid: MatchDocument[][] = []; // matchGrid[roundIndex][position]

    for (let round = 1; round <= totalRounds; round++) {
      const numMatches = bracketSize / Math.pow(2, round);
      const roundMatches: MatchDocument[] = [];

      for (let pos = 0; pos < numMatches; pos++) {
        roundMatches.push({
          id: randomUUID(),
          category,
          tournamentId,
          round,
          position: pos,
          status: "scheduled",
          sets: [],
          createdAt: now,
          updatedAt: now,
        });
      }
      matchGrid.push(roundMatches);
    }

    // Link each match to its parent in the next round
    for (let ri = 0; ri < matchGrid.length - 1; ri++) {
      for (const match of matchGrid[ri]) {
        const parentPos = Math.floor(match.position / 2);
        const parentMatch = matchGrid[ri + 1][parentPos];
        match.nextMatchId = parentMatch.id;
        match.nextMatchSlot = match.position % 2 === 0 ? 1 : 2;
      }
    }

    // Flat list + lookup map for the cascade step
    const allMatches = matchGrid.flat();
    const matchMap = new Map(allMatches.map((m) => [m.id, m]));

    // ── 7. Seed participants into Round 1 (standard bracket order) ────────
    const seedOrder = generateSeedOrder(bracketSize);
    const round1 = matchGrid[0];

    for (let pos = 0; pos < round1.length; pos++) {
      const slot1Idx = seedOrder[pos * 2] - 1;
      const slot2Idx = seedOrder[pos * 2 + 1] - 1;

      const p1 = slot1Idx < participants.length ? participants[slot1Idx] : null;
      const p2 = slot2Idx < participants.length ? participants[slot2Idx] : null;

      if (p1) {
        round1[pos].player1Id = p1.id;
        round1[pos].player1Name = p1.name;
      }
      if (p2) {
        round1[pos].player2Id = p2.id;
        round1[pos].player2Name = p2.name;
      }
    }

    // ── 8. Cascade byes round-by-round ────────────────────────────────────
    for (const roundMatches of matchGrid) {
      for (const match of roundMatches) {
        const hasP1 = !!match.player1Id;
        const hasP2 = !!match.player2Id;

        if (hasP1 && !hasP2) {
          match.status = "bye";
          match.winnerId = match.player1Id;
          match.winnerName = match.player1Name;
          fillNextMatchSlot(match, matchMap);
        } else if (!hasP1 && hasP2) {
          match.status = "bye";
          match.winnerId = match.player2Id;
          match.winnerName = match.player2Name;
          fillNextMatchSlot(match, matchMap);
        }
      }
    }

    // ── 9. Write to Cosmos DB ─────────────────────────────────────────────
    await parallelBatch(allMatches, (m) => matchContainer.items.create(m));

    return NextResponse.json({
      message: `Bracket generated for ${category}`,
      totalMatches: allMatches.length,
      totalRounds,
      bracketSize,
      participants: participants.length,
    });
  } catch (error) {
    console.error("Error generating bracket:", error);
    return NextResponse.json({ error: "Failed to generate bracket" }, { status: 500 });
  }
}

/**
 * PATCH /api/matches
 * Update a match result (set scores, winner). Advances winner to the next match.
 *
 * Body: { matchId, category, sets?: SetScore[], winnerId?, winnerName? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, category, sets, winnerId, winnerName } = body as {
      matchId: string;
      category: Category;
      sets?: SetScore[];
      winnerId?: string;
      winnerName?: string;
    };

    if (!matchId || !category) {
      return NextResponse.json(
        { error: "matchId and category are required" },
        { status: 400 }
      );
    }

    const container = getMatchesContainer();

    // Read the match
    const { resource: match } = await container
      .item(matchId, category)
      .read<MatchDocument>();

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.status === "bye") {
      return NextResponse.json(
        { error: "Cannot update a bye match" },
        { status: 400 }
      );
    }

    // Validate set scores
    if (sets && sets.length > 0) {
      if (sets.length > 3) {
        return NextResponse.json(
          { error: "Maximum 3 sets allowed" },
          { status: 400 }
        );
      }
      for (const s of sets) {
        if (!isValidSetScore(s.score1, s.score2)) {
          return NextResponse.json(
            { error: `Invalid score for set ${s.set}: ${s.score1}-${s.score2}` },
            { status: 400 }
          );
        }
      }
    }

    // Determine new status
    let newStatus: MatchStatus = match.status;
    if (sets && sets.length > 0 && !winnerId) {
      newStatus = "in_progress";
    }
    if (winnerId) {
      newStatus = "completed";
    }

    // Apply updates
    const updatedMatch: MatchDocument = {
      ...match,
      sets: sets ?? match.sets,
      winnerId: winnerId ?? match.winnerId,
      winnerName: winnerName ?? match.winnerName,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    await container.item(matchId, category).replace(updatedMatch);

    // Advance winner to the next match
    if (winnerId && updatedMatch.nextMatchId) {
      const { resource: nextMatch } = await container
        .item(updatedMatch.nextMatchId, category)
        .read<MatchDocument>();

      if (nextMatch) {
        const slot =
          updatedMatch.nextMatchSlot ??
          (updatedMatch.position % 2 === 0 ? 1 : 2);

        if (slot === 1) {
          nextMatch.player1Id = winnerId;
          nextMatch.player1Name = winnerName;
        } else {
          nextMatch.player2Id = winnerId;
          nextMatch.player2Name = winnerName;
        }
        nextMatch.updatedAt = new Date().toISOString();

        await container
          .item(updatedMatch.nextMatchId, category)
          .replace(nextMatch);
      }
    }

    return NextResponse.json(updatedMatch);
  } catch (error) {
    console.error("Error updating match:", error);
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
