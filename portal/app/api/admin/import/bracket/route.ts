import { NextRequest, NextResponse } from "next/server";
import { updateMatchWithAdvancement } from "@/app/lib/matchService";
import { requireAdmin } from "@/app/lib/authHelpers";
import { MatchDocument } from "@/app/lib/models";
import { getSeasonSettings } from "@/app/lib/settings";
import { getTournamentMatchesContainer, isTournamentV2Enabled } from "@/app/lib/tournamentData";

/**
 * Update multiple matches in bulk.
 * 
 * This endpoint accepts an array of match updates. It processes them sequentially
 * to ensure that winner advancement logic triggers correctly.
 * 
 * Ideally, we should sort updates by round/match number to ensure dependencies are met,
 * but currently relying on client or simple sequential processing.
 */
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { updates, season } = body as {
      updates: Partial<MatchDocument>[];
      season?: string;
    };

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "Invalid updates format" }, { status: 400 });
    }

    const container = getTournamentMatchesContainer();
    const results = [];
    const errors = [];

    // Process updates sequentially
    for (const update of updates) {
      if (!update.id || !update.category) {
        errors.push({ id: update.id, error: "Missing id or category" });
        continue;
      }

      try {
        // Fetch current match to verify existence and get full object
        const currentMatch = isTournamentV2Enabled()
          ? (await container.items
              .query<MatchDocument>({
                query: season
                  ? "SELECT TOP 1 * FROM c WHERE c.id = @id AND c.category = @category AND c.seasonId = @seasonId"
                  : "SELECT TOP 1 * FROM c WHERE c.id = @id AND c.category = @category",
                parameters: [
                  { name: "@id", value: update.id },
                  { name: "@category", value: update.category },
                  ...(season ? [{ name: "@seasonId", value: season }] : []),
                ],
              })
              .fetchAll()).resources[0]
          : (await container.item(update.id, update.category).read<MatchDocument>()).resource;

        if (!currentMatch) {
          errors.push({ id: update.id, error: "Match not found" });
          continue;
        }

        if (season && currentMatch.seasonId !== season) {
          errors.push({ id: update.id, error: "Match does not belong to the selected season" });
          continue;
        }

        const seasonSettings = await getSeasonSettings(currentMatch.seasonId);
        if (seasonSettings.archived) {
          errors.push({ id: update.id, error: "Archived seasons are read-only" });
          continue;
        }

        // Apply update with advancement
        await updateMatchWithAdvancement(currentMatch, update);
        results.push({ id: update.id, status: "updated" });

      } catch (err: unknown) {
        console.error(`Error updating match ${update.id}:`, err);
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        errors.push({ id: update.id, error: errorMessage });
      }
    }

    const status = errors.length > 0 && results.length === 0 ? 400 : 200;

    return NextResponse.json({ 
      message: "Bulk update processed", 
      processed: results.length,
      error: errors[0]?.error,
      errors 
    }, { status });

  } catch (error) {
    console.error("Error processing bulk import:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
