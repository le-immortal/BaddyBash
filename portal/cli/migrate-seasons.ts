/**
 * Migration script: Backfill seasonId on all existing documents.
 *
 * This script:
 * 1. Adds `seasonId: "2026"` to all registrations and matches that don't have one.
 * 2. Updates registration IDs from `${userId}_${category}` to `${userId}_${category}_2026`.
 *    (Cosmos DB doesn't allow ID changes, so we delete + recreate.)
 * 3. Creates the SEASON_CONFIG document in the users container.
 *
 * Safe to run multiple times — skips documents that already have seasonId.
 *
 * Usage: npx tsx cli/migrate-seasons.ts [--dry-run]
 *
 * Requires COSMOS_ENDPOINT and COSMOS_KEY in .env.local
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient, Container } from "@azure/cosmos";
import type { RegistrationDocument, MatchDocument, SeasonConfig } from "../app/lib/models";

interface LegacyGlobalSettings {
  id: "CONFIG_GLOBAL";
  registrationOpen?: boolean;
  bracketsVisible?: boolean;
}

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";

const SEASON_ID = "2026";
const DRY_RUN = process.argv.includes("--dry-run");

async function parallelBatch<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  batchSize = 25
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(chunk.map(fn));
    succeeded += results.filter((r) => r.status === "fulfilled").length;
    failed += results.filter((r) => r.status === "rejected").length;
  }
  return { succeeded, failed };
}

async function migrateRegistrations(container: Container) {
  console.log("\n📋 Migrating registrations...");

  const { resources: allRegs } = await container.items
    .query<RegistrationDocument & { _partitionKey?: string }>(
      "SELECT * FROM c WHERE NOT IS_DEFINED(c.seasonId) OR c.seasonId = null"
    )
    .fetchAll();

  console.log(`   Found ${allRegs.length} registrations without seasonId.`);

  if (allRegs.length === 0) {
    console.log("   ✅ Nothing to migrate.");
    return;
  }

  // For each registration:
  // 1. Check if ID needs updating (old format: userId_category → new: userId_category_2026)
  // 2. Set seasonId
  let reIdCount = 0;
  let updateOnly = 0;

  for (const reg of allRegs) {
    const expectedNewId = `${reg.userId}_${reg.category}_${SEASON_ID}`;
    const needsReId = reg.id !== expectedNewId;

    if (DRY_RUN) {
      if (needsReId) {
        console.log(`   [DRY] Would re-ID: ${reg.id} → ${expectedNewId}`);
        reIdCount++;
      } else {
        console.log(`   [DRY] Would set seasonId on: ${reg.id}`);
        updateOnly++;
      }
      continue;
    }

    if (needsReId) {
      // Delete old, create new with updated ID
      const newReg: RegistrationDocument = {
        ...reg,
        id: expectedNewId,
        seasonId: SEASON_ID,
      };
      // Remove Cosmos system properties
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawReg = newReg as any;
      delete rawReg._rid;
      delete rawReg._self;
      delete rawReg._etag;
      delete rawReg._attachments;
      delete rawReg._ts;

      try {
        await container.items.create(newReg);
        await container.item(reg.id, reg.userId).delete();
        reIdCount++;
      } catch (e: unknown) {
        const err = e as { code?: number };
        if (err.code === 409) {
          // New ID already exists — just delete the old one
          console.log(`   ⚠️  ${expectedNewId} already exists, deleting old ${reg.id}`);
          try {
            await container.item(reg.id, reg.userId).delete();
          } catch {
            // ignore
          }
          reIdCount++;
        } else {
          console.error(`   ❌ Failed to migrate ${reg.id}:`, e);
        }
      }
    } else {
      // Just add seasonId in place
      try {
        await container.item(reg.id, reg.userId).replace({
          ...reg,
          seasonId: SEASON_ID,
        });
        updateOnly++;
      } catch (e) {
        console.error(`   ❌ Failed to update ${reg.id}:`, e);
      }
    }
  }

  console.log(`   ✅ Re-IDed: ${reIdCount}, Updated in-place: ${updateOnly}`);
}

async function migrateMatches(container: Container) {
  console.log("\n🏸 Migrating matches...");

  const { resources: allMatches } = await container.items
    .query<MatchDocument>(
      "SELECT * FROM c WHERE NOT IS_DEFINED(c.seasonId) OR c.seasonId = null"
    )
    .fetchAll();

  console.log(`   Found ${allMatches.length} matches without seasonId.`);

  if (allMatches.length === 0) {
    console.log("   ✅ Nothing to migrate.");
    return;
  }

  if (DRY_RUN) {
    console.log(`   [DRY] Would update ${allMatches.length} matches with seasonId="${SEASON_ID}".`);
    return;
  }

  const { succeeded, failed } = await parallelBatch(allMatches, async (match) => {
    const updated = { ...match, seasonId: SEASON_ID };
    // Remove Cosmos system properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawMatch = updated as any;
    delete rawMatch._rid;
    delete rawMatch._self;
    delete rawMatch._etag;
    delete rawMatch._attachments;
    delete rawMatch._ts;

    await container.item(match.id, match.category).replace(updated);
  });

  console.log(`   ✅ Updated: ${succeeded}, Failed: ${failed}`);
}

async function createSeasonConfig(container: Container) {
  console.log("\n⚙️  Creating SEASON_CONFIG...");

  const configId = "SEASON_CONFIG";

  // Check if it already exists
  try {
    const { resource } = await container.item(configId, configId).read();
    if (resource) {
      console.log("   ✅ SEASON_CONFIG already exists. Skipping.");
      return;
    }
  } catch {
    // Doesn't exist — create it
  }

  if (DRY_RUN) {
    console.log(`   [DRY] Would create SEASON_CONFIG with activeSeason="${SEASON_ID}".`);
    return;
  }

  let legacySettings: LegacyGlobalSettings | undefined;
  try {
    const { resource } = await container
      .item("CONFIG_GLOBAL", "CONFIG_GLOBAL")
      .read<LegacyGlobalSettings>();
    legacySettings = resource;
  } catch {
    // CONFIG_GLOBAL may not exist in fresh environments.
  }

  const seasonConfig: SeasonConfig = {
    id: "SEASON_CONFIG",
    activeSeason: SEASON_ID,
    seasons: [
      {
        id: SEASON_ID,
        label: "Baddy Bash 2026",
        registrationOpen: legacySettings?.registrationOpen ?? true,
        bracketsVisible: legacySettings?.bracketsVisible ?? false,
        archived: false,
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  await container.items.create(seasonConfig);
  console.log("   ✅ SEASON_CONFIG created.");
}

async function main() {
  if (!endpoint || !key) {
    console.error("❌ Missing COSMOS_ENDPOINT or COSMOS_KEY in .env.local");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("🔍 DRY RUN MODE — no changes will be made.\n");
  }

  console.log(`🚀 Migrating database "${databaseId}" to multi-season format (seasonId="${SEASON_ID}")...`);

  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseId);

  const usersContainer = database.container("users");
  const registrationsContainer = database.container("registrations");
  const matchesContainer = database.container("matches");

  await migrateRegistrations(registrationsContainer);
  await migrateMatches(matchesContainer);
  await createSeasonConfig(usersContainer);

  console.log("\n🎉 Migration complete!");
}

main().catch((err) => {
  console.error("💥 Migration failed:", err);
  process.exit(1);
});
