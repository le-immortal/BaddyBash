import { NextRequest, NextResponse } from "next/server";
import { getMatchesContainer } from "@/app/lib/cosmosClient";
import { MatchDocument, Category } from "@/app/lib/models";
import { requireAdmin } from "@/app/lib/authHelpers";
import { updateMatchWithAdvancement } from "@/app/lib/matchService";
import { getActiveSeason } from "@/app/lib/settings";

interface AdvanceEntry {
  matchId: string;
  winnerId: string;
  winnerName: string;
}

/**
 * PUT /api/matches/advance
 * Bulk-advance multiple match winners in a single request.
 * Processes in round order so cascading advancement works correctly.
 */
export async function PUT(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { category, advances } = (await request.json()) as {
      category: Category;
      advances: AdvanceEntry[];
    };

    if (!category || !advances || !Array.isArray(advances) || advances.length === 0) {
      return NextResponse.json(
        { error: "category and a non-empty advances array are required" },
        { status: 400 }
      );
    }

    const container = getMatchesContainer();

    // Resolve season
    const seasonId = await getActiveSeason();

    // 1. Fetch all matches for this category + season
    const { resources: allMatches } = await container.items
      .query<MatchDocument>({
        query: "SELECT * FROM c WHERE c.category = @category AND c.seasonId = @seasonId",
        parameters: [
          { name: "@category", value: category },
          { name: "@seasonId", value: seasonId },
        ],
      })
      .fetchAll();

    const matchMap = new Map<string, MatchDocument>();
    for (const m of allMatches) {
      matchMap.set(m.id, m);
    }

    // 2. Basic validation — check matches exist, collect entries
    const toProcess: { matchId: string; winnerId: string; winnerName: string; round: number }[] = [];

    for (const entry of advances) {
      const match = matchMap.get(entry.matchId);
      if (!match) {
        return NextResponse.json(
          { error: `Match ${entry.matchId} not found` },
          { status: 404 }
        );
      }
      if (match.status === "bye") {
        continue; // skip byes silently
      }
      toProcess.push({ matchId: entry.matchId, winnerId: entry.winnerId, winnerName: entry.winnerName, round: match.round });
    }

    // 3. Sort by round (ascending) so earlier rounds advance before later ones
    toProcess.sort((a, b) => a.round - b.round);

    // 4. Process each advancement sequentially (order matters for cascading)
    // Validation happens here against the fresh DB state (after prior advancements have cascaded)
    for (const { matchId, winnerId, winnerName } of toProcess) {
      // Re-read the match from DB to get the latest state (may have been updated by prior advancement)
      const { resource: freshMatch } = await container
        .item(matchId, category)
        .read<MatchDocument>();

      if (!freshMatch) continue;

      // Validate winner is actually a player in this match (after cascading)
      if (winnerId !== freshMatch.player1Id && winnerId !== freshMatch.player2Id) {
        return NextResponse.json(
          { error: `Winner is not a player in match M${freshMatch.matchNumber}. This may be a stale bracket — please refresh and try again.` },
          { status: 400 }
        );
      }

      await updateMatchWithAdvancement(freshMatch, {
        winnerId,
        winnerName,
        status: "completed",
      });
    }

    // 5. Return the full updated match list
    const { resources: updatedMatches } = await container.items
      .query<MatchDocument>({
        query: "SELECT * FROM c WHERE c.category = @category AND c.seasonId = @seasonId",
        parameters: [
          { name: "@category", value: category },
          { name: "@seasonId", value: seasonId },
        ],
      })
      .fetchAll();

    updatedMatches.sort((a, b) => a.round - b.round || a.position - b.position);

    return NextResponse.json({
      message: `${toProcess.length} match(es) advanced successfully`,
      matches: updatedMatches,
    });
  } catch (error) {
    console.error("Error in bulk advancement:", error);
    return NextResponse.json({ error: "Failed to process advancements" }, { status: 500 });
  }
}
