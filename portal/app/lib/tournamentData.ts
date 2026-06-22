import { Container } from "@azure/cosmos";
import {
  getMatchesContainer,
  getMatchesV2Container,
  getRegistrationsContainer,
  getRegistrationsV2Container,
} from "@/app/lib/cosmosClient";
import { Category, MatchDocument, RegistrationDocument } from "@/app/lib/models";

export const TOURNAMENT_CONTAINER_VERSION = process.env.COSMOS_TOURNAMENT_CONTAINER_VERSION || "v2";

export function isTournamentV2Enabled(): boolean {
  return TOURNAMENT_CONTAINER_VERSION.toLowerCase() === "v2";
}

export function makeSeasonCategory(seasonId: string, category: string): string {
  return `${seasonId}#${category}`;
}

export function withTournamentFields<T extends { seasonId: string; category: Category }>(doc: T): T & {
  seasonCategory: string;
  tournamentId: string;
  schemaVersion: number;
} {
  return {
    ...doc,
    tournamentId: doc.seasonId,
    seasonCategory: makeSeasonCategory(doc.seasonId, doc.category),
    schemaVersion: 2,
  };
}

export function getTournamentRegistrationsContainer(): Container {
  return isTournamentV2Enabled() ? getRegistrationsV2Container() : getRegistrationsContainer();
}

export function getTournamentMatchesContainer(): Container {
  return isTournamentV2Enabled() ? getMatchesV2Container() : getMatchesContainer();
}

export function registrationPartitionKey(registration: Pick<RegistrationDocument, "userId" | "seasonId" | "category">): string {
  return isTournamentV2Enabled()
    ? makeSeasonCategory(registration.seasonId, registration.category)
    : registration.userId;
}

export function matchPartitionKey(match: Pick<MatchDocument, "category" | "seasonId">): string {
  return isTournamentV2Enabled()
    ? makeSeasonCategory(match.seasonId, match.category)
    : match.category;
}

export function seasonCategoryQuery(seasonId: string, category: Category): {
  query: string;
  parameters: { name: string; value: string }[];
  options?: { partitionKey: string };
} {
  if (isTournamentV2Enabled()) {
    const seasonCategory = makeSeasonCategory(seasonId, category);
    return {
      query: "SELECT * FROM c WHERE c.seasonCategory = @seasonCategory",
      parameters: [{ name: "@seasonCategory", value: seasonCategory }],
      options: { partitionKey: seasonCategory },
    };
  }

  return {
    query: "SELECT * FROM c WHERE c.category = @category AND c.seasonId = @seasonId",
    parameters: [
      { name: "@category", value: category },
      { name: "@seasonId", value: seasonId },
    ],
  };
}