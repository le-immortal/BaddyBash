import type { MatchDocument, Category } from "@/app/lib/models";
import { getSeasonConfig } from "@/app/lib/settings";
import {
  getTournamentMatchesContainer,
  isTournamentV2Enabled,
  makeSeasonCategory,
} from "@/app/lib/tournamentData";
import { getPlayerStageLabel } from "@/app/lib/bracketRoundNames";

export interface PlayerTournamentHistoryEntry {
  seasonId: string;
  category: Category;
  stage: string;
}

const DOUBLES_CATEGORIES: Category[] = ["MD", "WD", "XD"];

export function isPartnerBoardCategory(category: string | null): category is Category {
  return !!category && DOUBLES_CATEGORIES.includes(category as Category);
}

function participantIncludesUser(participantId: string | undefined, userId: string): boolean {
  if (!participantId) return false;
  if (participantId === userId) return true;
  return participantId.split("|").includes(userId);
}

function playerAppearsInMatch(match: MatchDocument, userId: string): boolean {
  return participantIncludesUser(match.player1Id, userId) || participantIncludesUser(match.player2Id, userId);
}

function isCompletedResult(match: MatchDocument): boolean {
  return match.status === "completed" && !!match.winnerId;
}

export function computePlayerSeasonStage(
  matches: MatchDocument[],
  userId: string
): string | null {
  const bracketMatches = matches.filter((match) => match.round > 0);
  if (bracketMatches.length === 0) return null;

  const totalRounds = Math.max(...bracketMatches.map((match) => match.round));
  const playerResultMatches = bracketMatches
    .filter((match) => playerAppearsInMatch(match, userId))
    .filter(isCompletedResult);

  if (playerResultMatches.length === 0) return null;

  const furthestRound = Math.max(...playerResultMatches.map((match) => match.round));
  const furthestMatches = playerResultMatches.filter((match) => match.round === furthestRound);
  const wonAtFurthestRound = furthestMatches.some((match) => participantIncludesUser(match.winnerId, userId));

  if (furthestRound === totalRounds) {
    return wonAtFurthestRound ? "Champion" : "Runner-up";
  }

  return getPlayerStageLabel(furthestRound, totalRounds);
}

function sortSeasonIdsDesc(a: string, b: string): number {
  const numericDifference = Number(b) - Number(a);
  if (!Number.isNaN(numericDifference) && numericDifference !== 0) return numericDifference;
  return b.localeCompare(a);
}

function isCosmosMissingDataError(error: unknown): boolean {
  const candidate = error as { code?: unknown; statusCode?: unknown };
  return candidate.code === 404 || candidate.statusCode === 404;
}

// ── In-memory TTL cache for immutable past-season bracket reads ──────────────
// Historical tournament brackets don't change, so the raw match-doc reads for a
// given `season#category` partition are safe to cache. The board renders many
// cards in the same category that each independently re-read the same brackets;
// caching collapses those N redundant Cosmos reads into 1 read + (N-1) hits.
// The cached Promise (not just the resolved value) is stored so concurrent
// callers for the same key share a single in-flight query instead of all
// missing and hitting Cosmos before the first resolves.

const SEASON_CATEGORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface SeasonCategoryCacheEntry {
  value: Promise<MatchDocument[]>;
  expiresAt: number;
}

const seasonCategoryCache = new Map<string, SeasonCategoryCacheEntry>();

/**
 * Test hook — resets the season#category bracket cache between cases.
 */
export function __clearPlayerHistoryCache(): void {
  seasonCategoryCache.clear();
}

function getSeasonCategoryMatchesCached(
  seasonId: string,
  category: Category
): Promise<MatchDocument[]> {
  const key = makeSeasonCategory(seasonId, category);
  const now = Date.now();

  const cached = seasonCategoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const readPromise = fetchSeasonCategoryMatches(seasonId, category);
  const entry: SeasonCategoryCacheEntry = {
    value: readPromise,
    expiresAt: now + SEASON_CATEGORY_CACHE_TTL,
  };
  seasonCategoryCache.set(key, entry);

  // Evict on rejection so a failed read isn't permanently cached.
  readPromise.catch(() => {
    if (seasonCategoryCache.get(key) === entry) {
      seasonCategoryCache.delete(key);
    }
  });

  return readPromise;
}

async function fetchSeasonCategoryMatches(
  seasonId: string,
  category: Category
): Promise<MatchDocument[]> {
  const container = getTournamentMatchesContainer();

  const spec = isTournamentV2Enabled()
    ? {
        query:
          "SELECT c.id, c.seasonId, c.category, c.round, c.position, c.player1Id, c.player2Id, c.winnerId, c.status FROM c WHERE c.seasonCategory = @seasonCategory",
        parameters: [{ name: "@seasonCategory", value: makeSeasonCategory(seasonId, category) }],
      }
    : {
        query:
          "SELECT c.id, c.seasonId, c.category, c.round, c.position, c.player1Id, c.player2Id, c.winnerId, c.status FROM c WHERE c.category = @category AND c.seasonId = @seasonId",
        parameters: [
          { name: "@category", value: category },
          { name: "@seasonId", value: seasonId },
        ],
      };

  const options = isTournamentV2Enabled()
    ? { partitionKey: makeSeasonCategory(seasonId, category) }
    : undefined;

  try {
    const { resources } = await container.items.query<MatchDocument>(spec, options).fetchAll();
    return resources;
  } catch (error) {
    if (isCosmosMissingDataError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getPlayerTournamentHistory(
  userId: string,
  category: Category
): Promise<PlayerTournamentHistoryEntry[]> {
  const config = await getSeasonConfig();
  const pastSeasonIds = config.seasons
    .map((season) => season.id)
    .filter((seasonId) => seasonId !== config.activeSeason)
    .sort(sortSeasonIdsDesc);

  const history: PlayerTournamentHistoryEntry[] = [];

  for (const seasonId of pastSeasonIds) {
    const matches = await getSeasonCategoryMatchesCached(seasonId, category);
    const stage = computePlayerSeasonStage(matches, userId);
    if (stage) {
      history.push({ seasonId, category, stage });
    }
  }

  return history;
}
