import { Container } from "@azure/cosmos";
import { MatchDocument } from "@/app/lib/models";
import { getSeasonSettings } from "@/app/lib/settings";
import { getTournamentMatchesContainer, matchPartitionKey } from "@/app/lib/tournamentData";

/**
 * Updates a match document with new data and handles advancing the winner to the next match.
 * 
 * @param match The current match document.
 * @param updates Partial match data to update.
 * @returns The updated match document (persisted).
 */
export async function updateMatchWithAdvancement(
  match: MatchDocument,
  updates: Partial<MatchDocument>
): Promise<MatchDocument> {
  const seasonSettings = await getSeasonSettings(match.seasonId);
  if (seasonSettings.archived) {
    throw new Error("Archived seasons are read-only");
  }

  const container = getTournamentMatchesContainer();
  const partitionKey = matchPartitionKey(match);
  
  // 2. Apply updates locally
  const updatedMatch: MatchDocument = {
    ...match,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // 3. Save the match
  await container.item(match.id, partitionKey).replace(updatedMatch);

  // 4. Handle Advancement logic if match is completed
  if (
    updatedMatch.status === "completed" &&
    updatedMatch.winnerId &&
    updatedMatch.nextMatchId
  ) {
    await advanceWinnerToNextMatch(container, updatedMatch);
  }

  return updatedMatch;
}

/**
 * Advances the winner of a completed match to the next match in the bracket.
 */
export async function advanceWinnerToNextMatch(
  container: Container,
  match: MatchDocument
): Promise<void> { // Rename argument to 'match' for consistency
    if (!match.nextMatchId || !match.winnerId) return;

    // Fetch the next match
    const { resource: nextMatch } = await container
      .item(match.nextMatchId, matchPartitionKey(match))
      .read<MatchDocument>();

    if (!nextMatch) {
      console.warn(`Next match ${match.nextMatchId} not found for advancement.`);
      return;
    }

    const winnerId = match.winnerId;
    const winnerName = match.winnerName || "Unknown";
    
    // Determine seed to carry forward
    // If winner matches P1 ID, take P1 seed.
    // If mismatch (maybe name change?), try logical inference or fallback.
    let winnerSeed: number | undefined;

    if (winnerId === match.player1Id) {
      winnerSeed = match.player1Seed;
    } else if (winnerId === match.player2Id) {
      winnerSeed = match.player2Seed;
    }

    let nextMatchUpdated = false;

    if (match.nextMatchSlot === 1) {
      // Slot 1
      if (nextMatch.player1Id !== winnerId) {
        nextMatch.player1Id = winnerId;
        nextMatch.player1Name = winnerName;
        nextMatch.player1Seed = winnerSeed;
        nextMatchUpdated = true;
      }
    } else {
      // Slot 2
      if (nextMatch.player2Id !== winnerId) {
        nextMatch.player2Id = winnerId;
        nextMatch.player2Name = winnerName;
        nextMatch.player2Seed = winnerSeed;
        nextMatchUpdated = true;
      }
    }

    if (nextMatchUpdated) {
      nextMatch.updatedAt = new Date().toISOString();
      await container.item(nextMatch.id, matchPartitionKey(nextMatch)).replace(nextMatch);
    }
}
