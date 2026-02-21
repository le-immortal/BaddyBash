import { NextRequest, NextResponse } from "next/server";
import { getMatchesContainer } from "@/app/lib/cosmosClient";
import { updateMatchWithAdvancement } from "@/app/lib/matchService";
import { requireAdmin } from "@/app/lib/authHelpers";
import { MatchDocument } from "@/app/lib/models";

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
    const { updates } = body as { updates: Partial<MatchDocument>[] };

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "Invalid updates format" }, { status: 400 });
    }

    const container = getMatchesContainer();
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
        const { resource: currentMatch } = await container
          .item(update.id, update.category)
          .read<MatchDocument>();

        if (!currentMatch) {
          errors.push({ id: update.id, error: "Match not found" });
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

    return NextResponse.json({ 
      message: "Bulk update processed", 
      processed: results.length,
      errors 
    });

  } catch (error) {
    console.error("Error processing bulk import:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
