import { NextRequest, NextResponse } from "next/server";
import { getMatchesContainer, getRegistrationsContainer } from "@/app/lib/cosmosClient";
import { MatchDocument, RegistrationDocument, Category, isDoubles } from "@/app/lib/models";

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
 * Pulls confirmed registrations, seeds them, and creates match documents.
 *
 * Body: { category }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category } = body as { category: Category };

    if (!category) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }

    const regContainer = getRegistrationsContainer();
    const matchContainer = getMatchesContainer();

    // 1. Fetch confirmed registrations for this category
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

    // 2. Build participant list — for doubles, dedup into teams
    let participants: BracketParticipant[];

    if (isDoubles(category)) {
      // Each doubles pair has two registrations (one per partner).
      // Dedup by canonical pair key: sorted [userId, partnerId].
      const seen = new Set<string>();
      const teams: BracketParticipant[] = [];

      for (const reg of registrations) {
        const pairKey = [reg.userId, reg.partnerId || ''].sort().join('|');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        teams.push({
          id: pairKey,
          name: `${reg.userName} & ${reg.partnerName || reg.partnerId || 'TBD'}`,
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
      // Singles — each registration is one participant
      participants = registrations.map(r => ({
        id: r.userId,
        name: r.userName,
        seed: r.seed,
      }));
    }

    // 3. Sort by seed (seeded first, then unseeded)
    participants.sort((a, b) => {
      if (a.seed && b.seed) return a.seed - b.seed;
      if (a.seed) return -1;
      if (b.seed) return 1;
      return 0;
    });

    // 4. Calculate bracket size (next power of 2)
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(participants.length)));
    const totalRounds = Math.log2(bracketSize);

    // 4. Delete existing matches for this category
    const { resources: existingMatches } = await matchContainer.items
      .query<MatchDocument>({
        query: "SELECT c.id, c.category FROM c WHERE c.category = @category",
        parameters: [{ name: "@category", value: category }],
      })
      .fetchAll();

    await parallelBatch(existingMatches, (m) =>
      matchContainer.item(m.id, category).delete()
    );

    // 5. Build match tree
    const now = new Date().toISOString();
    const matches: MatchDocument[] = [];

    // Create all match slots
    const matchIds: string[][] = []; // matchIds[round][position]

    for (let round = 1; round <= totalRounds; round++) {
      const roundSize = bracketSize / Math.pow(2, round);
      const roundIds: string[] = [];
      for (let pos = 0; pos < roundSize; pos++) {
        const id = `${category}-R${round}-M${pos + 1}`;
        roundIds.push(id);
      }
      matchIds.push(roundIds);
    }

    // Create match documents with links to next match
    for (let round = 1; round <= totalRounds; round++) {
      const roundIndex = round - 1;
      const roundSize = matchIds[roundIndex].length;

      for (let pos = 0; pos < roundSize; pos++) {
        const nextMatchId =
          round < totalRounds
            ? matchIds[roundIndex + 1][Math.floor(pos / 2)]
            : undefined;

        const match: MatchDocument = {
          id: matchIds[roundIndex][pos],
          category,
          round,
          position: pos,
          nextMatchId,
          createdAt: now,
          updatedAt: now,
        };

        matches.push(match);
      }
    }

    // 7. Fill Round 1 with participants
    const round1 = matches.filter((m) => m.round === 1);
    const slots: (BracketParticipant | null)[] = new Array(bracketSize).fill(null);

    // Place participants into slots
    for (let i = 0; i < participants.length; i++) {
      slots[i] = participants[i];
    }

    // Fill round 1 matches
    for (let i = 0; i < round1.length; i++) {
      const p1 = slots[i * 2];
      const p2 = slots[i * 2 + 1];

      if (p1) {
        round1[i].player1Id = p1.id;
        round1[i].player1Name = p1.name;
      }
      if (p2) {
        round1[i].player2Id = p2.id;
        round1[i].player2Name = p2.name;
      }

      // Handle byes: if only one participant, auto-advance
      if (p1 && !p2) {
        round1[i].winnerId = p1.id;
        round1[i].winnerName = p1.name;
        round1[i].score = "BYE";

        // Advance winner to next round
        if (round1[i].nextMatchId) {
          const nextMatch = matches.find(
            (m) => m.id === round1[i].nextMatchId
          );
          if (nextMatch) {
            if (i % 2 === 0) {
              nextMatch.player1Id = p1.id;
              nextMatch.player1Name = p1.name;
            } else {
              nextMatch.player2Id = p1.id;
              nextMatch.player2Name = p1.name;
            }
          }
        }
      }
    }

    // 8. Write all matches to Cosmos DB (parallel batches)
    await parallelBatch(matches, (m) => matchContainer.items.create(m));

    return NextResponse.json({
      message: `Bracket generated for ${category}`,
      totalMatches: matches.length,
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
 * Update a match result (score, winner). Advances winner to next match.
 *
 * Body: { matchId, category, score, winnerId, winnerName }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, category, score, winnerId, winnerName } = body;

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

    // Update score and winner
    const updatedMatch: MatchDocument = {
      ...match,
      score: score || match.score,
      winnerId: winnerId || match.winnerId,
      winnerName: winnerName || match.winnerName,
      updatedAt: new Date().toISOString(),
    };

    await container.item(matchId, category).replace(updatedMatch);

    // Advance winner to next match
    if (winnerId && updatedMatch.nextMatchId) {
      const { resource: nextMatch } = await container
        .item(updatedMatch.nextMatchId, category)
        .read<MatchDocument>();

      if (nextMatch) {
        // Determine if winner goes to player1 or player2 slot
        // Even position → player1 of next, odd position → player2 of next
        if (updatedMatch.position % 2 === 0) {
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
    return NextResponse.json({ error: "Failed to update match" }, { status: 500 });
  }
}
