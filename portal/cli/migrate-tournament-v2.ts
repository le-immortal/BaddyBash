/**
 * Copy season-aware tournament data into v2 Cosmos containers.
 *
 * Dry run:
 *   npx tsx cli/migrate-tournament-v2.ts --dry-run
 *
 * Execute:
 *   npx tsx cli/migrate-tournament-v2.ts --execute
 *
 * This script is idempotent: it upserts into v2 containers and does not delete
 * legacy registrations/matches.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient, Container } from "@azure/cosmos";
import type { MatchDocument, RegistrationDocument, SeasonConfig } from "../app/lib/models";

type JsonDoc = Record<string, unknown>;

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";
const execute = process.argv.includes("--execute");
const dryRun = process.argv.includes("--dry-run") || !execute;

function stripSystemProps<T extends JsonDoc>(doc: T): T {
  const copy = { ...doc };
  delete copy._rid;
  delete copy._self;
  delete copy._etag;
  delete copy._attachments;
  delete copy._ts;
  return copy;
}

function seasonCategory(seasonId: string, category: string): string {
  return `${seasonId}#${category}`;
}

function normalizeRegistration(raw: RegistrationDocument): RegistrationDocument & { seasonCategory: string; schemaVersion: number } {
  if (!raw.seasonId || !raw.category) {
    throw new Error(`Registration ${raw.id} missing seasonId/category`);
  }

  return {
    ...stripSystemProps(raw as unknown as JsonDoc),
    seasonCategory: raw.seasonCategory || seasonCategory(raw.seasonId, raw.category),
    tournamentId: raw.tournamentId || raw.seasonId,
    schemaVersion: 2,
  } as RegistrationDocument & { seasonCategory: string; schemaVersion: number };
}

function normalizeMatch(raw: MatchDocument): MatchDocument & { seasonCategory: string; schemaVersion: number } {
  if (!raw.seasonId || !raw.category) {
    throw new Error(`Match ${raw.id} missing seasonId/category`);
  }

  return {
    ...stripSystemProps(raw as unknown as JsonDoc),
    seasonCategory: raw.seasonCategory || seasonCategory(raw.seasonId, raw.category),
    tournamentId: raw.tournamentId || raw.seasonId,
    schemaVersion: 2,
  } as MatchDocument & { seasonCategory: string; schemaVersion: number };
}

async function fetchAll<T>(container: Container, query = "SELECT * FROM c"): Promise<T[]> {
  const { resources } = await container.items.query<T>(query).fetchAll();
  return resources;
}

async function upsertAll<T extends { id: string; seasonCategory: string }>(container: Container, docs: T[], label: string, batchSize = 25) {
  let upserted = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    await Promise.all(
      chunk.map((doc) => container.items.upsert(doc, { partitionKey: doc.seasonCategory } as never))
    );
    upserted += chunk.length;
    console.log(`Upserted ${Math.min(upserted, docs.length)}/${docs.length} ${label} into ${container.id}.`);
  }
  return upserted;
}

async function main() {
  if (!endpoint || !key) {
    throw new Error("Missing COSMOS_ENDPOINT or COSMOS_KEY in .env.local");
  }

  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({ id: databaseId });

  const users = database.container("users");
  const registrations = database.container("registrations");
  const matches = database.container("matches");

  const { container: settings } = await database.containers.createIfNotExists({
    id: "settings",
    partitionKey: { paths: ["/id"] },
  });
  const { container: registrationsV2 } = await database.containers.createIfNotExists({
    id: "registrations_v2",
    partitionKey: { paths: ["/seasonCategory"] },
  });
  const { container: matchesV2 } = await database.containers.createIfNotExists({
    id: "matches_v2",
    partitionKey: { paths: ["/seasonCategory"] },
  });

  const legacyRegistrations = await fetchAll<RegistrationDocument>(
    registrations,
    "SELECT * FROM c WHERE IS_DEFINED(c.seasonId)"
  );
  const legacyMatches = await fetchAll<MatchDocument>(
    matches,
    "SELECT * FROM c WHERE IS_DEFINED(c.seasonId)"
  );

  const normalizedRegistrations = legacyRegistrations.map(normalizeRegistration);
  const normalizedMatches = legacyMatches.map(normalizeMatch);

  let seasonConfig: SeasonConfig | undefined;
  try {
    seasonConfig = (await settings.item("SEASON_CONFIG", "SEASON_CONFIG").read<SeasonConfig>()).resource;
  } catch {
    seasonConfig = undefined;
  }
  if (!seasonConfig) {
    try {
      seasonConfig = (await users.item("SEASON_CONFIG", "SEASON_CONFIG").read<SeasonConfig>()).resource;
    } catch {
      seasonConfig = undefined;
    }
  }

  const summary = {
    mode: dryRun ? "dry-run" : "execute",
    database: databaseId,
    source: {
      registrations: legacyRegistrations.length,
      matches: legacyMatches.length,
      seasonConfig: Boolean(seasonConfig),
    },
    target: {
      registrations_v2: normalizedRegistrations.length,
      matches_v2: normalizedMatches.length,
      missingRegistrationSeasonCategory: normalizedRegistrations.filter((doc) => !doc.seasonCategory).length,
      missingMatchSeasonCategory: normalizedMatches.filter((doc) => !doc.seasonCategory).length,
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  if (dryRun) {
    console.log("Dry run complete. No v2 data was written. Pass --execute to upsert v2 data.");
    return;
  }

  if (seasonConfig) {
    await settings.items.upsert(seasonConfig);
    console.log("Copied SEASON_CONFIG into settings.");
  }
  console.log(`Upserted ${await upsertAll(registrationsV2, normalizedRegistrations, "registration")} registrations into registrations_v2.`);
  console.log(`Upserted ${await upsertAll(matchesV2, normalizedMatches, "match")} matches into matches_v2.`);
  console.log("Tournament v2 migration complete.");
}

main().catch((error) => {
  console.error("Tournament v2 migration failed:", error);
  process.exit(1);
});