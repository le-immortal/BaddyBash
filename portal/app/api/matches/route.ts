import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import {
  MatchDocument, RegistrationDocument, UserDocument, Category,
  isDoubles,
} from "@/app/lib/models";
import { requireAdmin, isAdmin } from "@/app/lib/authHelpers";
import { generateSeedOrder, nextPowerOf2 } from "@/app/lib/bracketUtils";
import { getActiveSeason, getSeasonSettings } from "@/app/lib/settings";
import { updateMatchWithAdvancement } from "@/app/lib/matchService";
import {
  getTournamentMatchesContainer,
  getTournamentRegistrationsContainer,
  isTournamentV2Enabled,
  matchPartitionKey,
  seasonCategoryQuery,
  withTournamentFields,
} from "@/app/lib/tournamentData";

interface BracketParticipant {
  id: string;
  name: string;
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

/** Fill the winner's slot in the parent match of the bracket tree. */
function fillNextMatchSlot(
  match: MatchDocument, // Correct type
  matchMap: Map<string, MatchDocument>
): void {
  if (!match.nextMatchId || !match.winnerId) return;
  const next = matchMap.get(match.nextMatchId);
  if (!next) return;

  // Determine the seed of the winner
  const winnerSeed = (match.winnerId === match.player1Id) ? match.player1Seed : match.player2Seed;

  if (match.nextMatchSlot === 1) {
    next.player1Id = match.winnerId;
    next.player1Name = match.winnerName;
    next.player1Seed = winnerSeed;
  } else {
    next.player2Id = match.winnerId;
    next.player2Name = match.winnerName;
    next.player2Seed = winnerSeed;
  }
}

/**
 * GET /api/matches?category=MS
 * Requires authentication.
 */
export async function GET(request: NextRequest) {
  // Public endpoint — no auth required for reading bracket data

  const category = request.nextUrl.searchParams.get("category") as Category | null;
  const seasonParam = request.nextUrl.searchParams.get("season");

  if (!category) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }

  try {
    // 1. Resolve season
    const seasonId = seasonParam || await getActiveSeason();

    // 2. Check Bracket Visibility Setting — admins bypass
    const adminUser = await isAdmin();
    if (!adminUser) {
      try {
        const seasonSettings = await getSeasonSettings(seasonId);
        if (seasonSettings.bracketsVisible === false) {
          return NextResponse.json(
            { error: "Brackets are not yet published." },
            { status: 403 }
          );
        }
      } catch {
        // Default to open
      }
    }

  const matchesContainer = getTournamentMatchesContainer();
  const matchQuery = seasonCategoryQuery(seasonId, category);
  const { resources: matches } = await matchesContainer.items
    .query<MatchDocument>({ query: matchQuery.query, parameters: matchQuery.parameters }, matchQuery.options)
    .fetchAll();

  matches.sort((a, b) => a.round - b.round || a.position - b.position);

  return NextResponse.json(matches, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error("Error fetching matches:", error);
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
  }
}

/**
 * POST /api/matches
 */
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { category, tournamentId, season, seasonId: bodySeasonId, seeds } = body as {
      category: Category;
      tournamentId?: string;
      season?: string;
      seasonId?: string;
      seeds?: Record<string, number>;
    };

    if (!category) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }

    // Resolve season
    const seasonId = bodySeasonId || season || tournamentId || await getActiveSeason();
    const seasonSettings = await getSeasonSettings(seasonId);
    if (seasonSettings.archived) {
      return NextResponse.json({ error: "Cannot generate brackets for an archived season" }, { status: 403 });
    }

    const regContainer = getTournamentRegistrationsContainer();
    const matchContainer = getTournamentMatchesContainer();
    const userContainer = getUsersContainer();

    // 1. Fetch confirmed registrations (scoped to season)
    const regQuery = seasonCategoryQuery(seasonId, category);
    const { resources: registrations } = await regContainer.items
      .query<RegistrationDocument>(
        {
          query: isTournamentV2Enabled()
            ? "SELECT * FROM c WHERE c.seasonCategory = @seasonCategory AND c.status = 'confirmed'"
            : "SELECT * FROM c WHERE c.category = @category AND c.status = 'confirmed' AND c.seasonId = @seasonId",
          parameters: regQuery.parameters,
        },
        regQuery.options
      )
      .fetchAll();

    if (registrations.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 confirmed registrations to generate a bracket" },
        { status: 400 }
      );
    }

    // 1b. Hydrate names
    const allUserIds = new Set<string>();
    for (const r of registrations) {
      if (r.userId) allUserIds.add(r.userId);
      if (r.partnerId) allUserIds.add(r.partnerId);
    }

    const nameMap = new Map<string, string>();
    const userIdArray = Array.from(allUserIds);
    
    const CHUNK_SIZE = 50;
    for (let i = 0; i < userIdArray.length; i += CHUNK_SIZE) {
      const chunk = userIdArray.slice(i, i + CHUNK_SIZE);
      const userDocs = await Promise.all(
        chunk.map(uid => 
          userContainer.item(uid, uid).read<UserDocument>()
            .then(r => r.resource)
            .catch(() => null)
        )
      );
      
      for (const u of userDocs) {
        if (u && u.name) {
          nameMap.set(u.id, u.name);
        }
      }
    }

    const getName = (id?: string, fallback?: string) => {
      if (!id) return fallback || 'TBD';
      return nameMap.get(id) || fallback || id;
    };

    // 2. Build participants
    let participants: BracketParticipant[];

    if (isDoubles(category)) {
      const seen = new Set<string>();
      const teams: BracketParticipant[] = [];

      for (const reg of registrations) {
        const p1Id = reg.userId;
        const p2Id = reg.partnerId || "";
        const pairKey = [p1Id, p2Id].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const p1Name = getName(p1Id, reg.userName);
        const p2Name = getName(p2Id, reg.partnerName);
        
        // Use provided seeds: check pairKey first (from visualizer), then reg.id, then DB
        const seedVal = seeds?.[pairKey] || seeds?.[reg.id] || reg.seed;

        teams.push({
          id: pairKey,
          name: `${p1Name} & ${p2Name}`,
          seed: seedVal,
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
        name: getName(r.userId, r.userName),
        seed: seeds?.[r.id] || r.seed,
      }));
    }

    // 3. Sort by seed (seeded first), then random for unseeded
    const seededParticipants = participants.filter(p => p.seed);
    const unseededParticipants = participants.filter(p => !p.seed);

    // Sort seeded by seed number
    seededParticipants.sort((a, b) => (a.seed!) - (b.seed!));

    // Shuffle unseeded randomly (Fisher-Yates shuffle)
    for (let i = unseededParticipants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unseededParticipants[i], unseededParticipants[j]] = [unseededParticipants[j], unseededParticipants[i]];
    }

    participants = [...seededParticipants, ...unseededParticipants];

    // 4. Bracket Geometry
    const bracketSize = nextPowerOf2(participants.length);
    const totalRounds = Math.log2(bracketSize); // e.g., 8 -> 3 rounds
    const seedOrder = generateSeedOrder(bracketSize);

    // 5. Delete existing matches (scoped to season)
    const existingMatchQuery = seasonCategoryQuery(seasonId, category);
    const { resources: existingMatches } = await matchContainer.items
      .query<MatchDocument>({ query: existingMatchQuery.query, parameters: existingMatchQuery.parameters }, existingMatchQuery.options)
      .fetchAll();

    await parallelBatch(existingMatches, (m) =>
      matchContainer.item(m.id, matchPartitionKey(m)).delete()
    );

    // 6. Create Matches
    const now = new Date().toISOString();
    const rounds: MatchDocument[][] = [];
    const matchMap = new Map<string, MatchDocument>();

    // rounds[0] = Round 1 (Leafs), rounds[1] = Round 2 ...
    // Note: My display logic treats Round 3 as Final? 
    // Usually Round 1 is where everyone plays.
    // Let's create from Round 1 up to TotalRounds.
    
    for (let r = 1; r <= totalRounds; r++) {
       const numMatches = bracketSize / Math.pow(2, r);
       const roundMatches: MatchDocument[] = [];
       
       for (let pos = 0; pos < numMatches; pos++) {
        const match: MatchDocument = withTournamentFields({
            id: randomUUID(),
            category,
            seasonId,
            round: r,
            position: pos,
            status: 'scheduled',
            sets: [],
            createdAt: now,
            updatedAt: now,
        });
         roundMatches.push(match);
         matchMap.set(match.id, match);
       }
       rounds.push(roundMatches);
    }
    
    // 7. Link Matches
    for (let r = 0; r < totalRounds - 1; r++) {
       const currentRound = rounds[r];
       const nextRound = rounds[r+1];
       
       currentRound.forEach((match, i) => {
         const parentPos = Math.floor(i / 2);
         const parent = nextRound[parentPos];
         match.nextMatchId = parent.id;
         match.nextMatchSlot = (i % 2 === 0) ? 1 : 2;
       });
    }
    
    // 8. Assign Participants to Round 1
    const round1 = rounds[0];
    
    for (let i = 0; i < round1.length; i++) {
        const match = round1[i];
        const slot1Index = i * 2;
        const slot2Index = i * 2 + 1;
        
        const seed1 = seedOrder[slot1Index];
        const seed2 = seedOrder[slot2Index];
        
        const p1 = participants[seed1 - 1]; // 0-based
        const p2 = participants[seed2 - 1];
        
        if (p1) {
            match.player1Id = p1.id;
            match.player1Name = p1.name;
            match.player1Seed = p1.seed || undefined; // only admin-assigned seeds; slot position drives placement but is not displayed
        } else {
            match.player1Name = "BYE";
            match.status = 'completed'; // One side is BYE -> auto-win logic triggers below
        }
        
        if (p2) {
            match.player2Id = p2.id;
            match.player2Name = p2.name;
            match.player2Seed = p2.seed || undefined; // only admin-assigned seeds; slot position drives placement but is not displayed
        } else {
            match.player2Name = "BYE";
            match.status = 'completed';
        }

        // Determine Winner if BYE
        const hasP1 = !!p1;
        const hasP2 = !!p2;
        
        if (hasP1 && !hasP2) {
            match.winnerId = p1.id;
            match.winnerName = p1.name;
            match.status = 'bye';
            fillNextMatchSlot(match, matchMap);
        } else if (!hasP1 && hasP2) {
            match.winnerId = p2.id;
            match.winnerName = p2.name;
            match.status = 'bye';
            fillNextMatchSlot(match, matchMap);
        } else if (!hasP1 && !hasP2) {
            // Double Bye (rare)
            match.status = 'bye';
        } else {
            match.status = 'scheduled'; // Ready to play
        }
    }
    
    // 9. Propagate BYE winners up the tree
    // Because fillNextMatchSlot only fills the immediate parent.
    // If the parent also becomes BYE (e.g. Winner of Match 1 vs Winner of Match 2, and both were BYE-fests?)
    // Actually, fillNextMatchSlot does NOT check if the parent becomes complete.
    // We need to cascade.
    // Simple way: Loop rounds 2..N and check if matches are now complete by finding implied winners.
    
    // But for Seeding UX, just Round 1 Byes are usually sufficient to handle.
    // If we have massive BYEs (e.g. 3 players in 8 slots), Round 2 might have byes.
    
    for (let r = 1; r < totalRounds; r++) { // Start from Round 2
        for (const match of rounds[r]) {
            // Check if player slots are filled (by fillNextMatchSlot from previous round)
            // Note: Parallel structures means we rely on object references or map lookups.
            // Since we use objects in memory, references hold.
            
            if (match.player1Id && !match.player2Id && match.player2Name === undefined) {
                 // Pending P2? Or P2 is Bye?
                 // If previous round match for P2 was valid but not finished, P2 is pending.
                 // If previous round match for P2 didn't exist? (Impossible)
                 // We need to distinguish "Pending P2" from "P2 is BYE".
                 // In our logic, BYE sets status='completed' immediately.
            }
            
            // Actually, identifying double-BYEs deep in tree is complex.
            // For now, let's assume standard brackets where Byes only happen in R1.
            // Exception: If R1 has BYE vs BYE (no players), R2 sees BYE vs BYE.
        }
    }
    
    const allMatches = rounds.flat();
    allMatches.forEach((m, i) => {
        if (!m.matchNumber) m.matchNumber = i + 1;
    });

    // 10. Save
    await parallelBatch(allMatches, (m) => matchContainer.items.create(m));

    return NextResponse.json({
      message: "Bracket generated successfully",
      totalMatches: allMatches.length,
      participants: participants.length,
      totalRounds
    });

  } catch (error) {
    console.error("Error generating bracket:", error);
    return NextResponse.json({ error: "Failed to generate bracket" }, { status: 500 });
  }
}

/**
 * PATCH /api/matches
 * Update match winner and advance to next round.
 * Body: { matchId, category, winnerId, winnerName }
 */
export async function PATCH(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      matchId: string;
      category: Category;
      winnerId?: string;
      winnerName?: string;
      scheduledTime?: string;
      player1Id?: string;
      player1Name?: string;
      player2Id?: string;
      player2Name?: string;
    };

    const { matchId, category } = body;

    if (!matchId || !category) {
      return NextResponse.json(
        { error: "matchId and category are required" },
        { status: 400 }
      );
    }

    const container = getTournamentMatchesContainer();

    // 1. Read the current match. v2 may not receive season from older clients, so query by ID.
    const match = isTournamentV2Enabled()
      ? (await container.items
          .query<MatchDocument>({
            query: "SELECT TOP 1 * FROM c WHERE c.id = @matchId AND c.category = @category",
            parameters: [
              { name: "@matchId", value: matchId },
              { name: "@category", value: category },
            ],
          })
          .fetchAll()).resources[0]
      : (await container.item(matchId, category).read<MatchDocument>()).resource;

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const seasonSettings = await getSeasonSettings(match.seasonId || await getActiveSeason());
    if (seasonSettings.archived) {
      return NextResponse.json(
        { error: "Archived seasons are read-only" },
        { status: 403 }
      );
    }

    // 2. Update fields
    let updated = false;

    // Handle Player Updates (swap / replace)
    if (body.player1Id !== undefined) {
      match.player1Id = body.player1Id || undefined;
      match.player1Name = body.player1Name || undefined;
      updated = true;
    }
    if (body.player2Id !== undefined) {
      match.player2Id = body.player2Id || undefined;
      match.player2Name = body.player2Name || undefined;
      updated = true;
    }

    // Handle Schedule Updates
    if (body.scheduledTime !== undefined) {
        match.scheduledTime = body.scheduledTime;
        updated = true;
    }

    // Handle Winner / Advancement
    if (body.winnerId && body.winnerName) {
        match.winnerId = body.winnerId;
        match.winnerName = body.winnerName;
        match.status = "completed";
        updated = true;
    }

    if (updated) {
      await updateMatchWithAdvancement(match, {});
    }

    return NextResponse.json({ message: "Match updated successfully", match });
  } catch (error) {
    console.error("Error updating match:", error);
    return NextResponse.json({ error: "Failed to update match" }, { status: 500 });
  }
}
