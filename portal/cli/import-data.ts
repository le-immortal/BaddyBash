/**
 * Import locally exported JSON data into a Cosmos DB instance.
 *
 * Usage: npx tsx cli/import-data.ts --input ./backup/2026-04-20
 *
 * Target DB is controlled by COSMOS_ENDPOINT, COSMOS_KEY, and COSMOS_DATABASE
 * in .env.local (point these at your new/target DB before running).
 *
 * Options:
 *   --input <dir>    Path to the export folder containing users.json etc.
 *   --dry-run        Print what would be imported without writing anything.
 *   --skip-users     Skip importing users.
 *   --skip-regs      Skip importing registrations.
 *   --skip-matches   Skip importing matches.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient, Container } from "@azure/cosmos";
import * as fs from "fs";
import * as path from "path";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";

/** Strip Cosmos system properties before upserting into a new DB */
function stripSystemProps(doc: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...doc };
  delete copy._rid;
  delete copy._self;
  delete copy._etag;
  delete copy._attachments;
  delete copy._ts;
  return copy;
}

/** Upsert items in batches to stay under RU limits */
async function upsertBatch(
  container: Container,
  items: Record<string, unknown>[],
  partitionKeyPath: string,
  label: string,
  dryRun: boolean,
) {
  let success = 0;
  let failed = 0;

  for (const raw of items) {
    const item = stripSystemProps(raw);
    if (dryRun) {
      success++;
      continue;
    }

    try {
      // Resolve partition key value from the item
      const pkField = partitionKeyPath.replace(/^\//, "");
      const pkValue = item[pkField] as string;
      await container.items.upsert(item, { partitionKey: pkValue } as never);
      success++;
    } catch (err: unknown) {
      failed++;
      const id = item.id ?? "unknown";
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    ⚠️  Failed to upsert ${label} id=${id}: ${msg}`);
    }
  }

  return { success, failed };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipUsers = args.includes("--skip-users");
  const skipRegs = args.includes("--skip-regs");
  const skipMatches = args.includes("--skip-matches");

  const inputIdx = args.indexOf("--input");
  if (inputIdx === -1 || !args[inputIdx + 1]) {
    console.error("❌ Usage: npx tsx cli/import-data.ts --input <backup-dir>");
    process.exit(1);
  }
  const inputDir = path.resolve(args[inputIdx + 1]);

  if (!fs.existsSync(inputDir)) {
    console.error(`❌ Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  if (!endpoint || !key) {
    console.error("❌ Missing COSMOS_ENDPOINT or COSMOS_KEY in .env.local");
    process.exit(1);
  }

  // Read metadata if available
  const metaPath = path.join(inputDir, "metadata.json");
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    console.log(`📋 Backup from ${meta.exportedAt}`);
    console.log(`   Source: ${meta.sourceEndpoint} / ${meta.database}`);
    console.log(`   Counts: ${meta.counts.users} users, ${meta.counts.registrations} regs, ${meta.counts.matches} matches\n`);
  }

  if (dryRun) console.log("🔍 DRY RUN — no data will be written.\n");

  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseId);

  // Ensure containers exist
  if (!dryRun) {
    console.log(`📦 Ensuring database "${databaseId}" and containers exist...`);
    const { database: db } = await client.databases.createIfNotExists({ id: databaseId });
    await db.containers.createIfNotExists({ id: "users", partitionKey: { paths: ["/id"] } });
    await db.containers.createIfNotExists({ id: "registrations", partitionKey: { paths: ["/userId"] } });
    await db.containers.createIfNotExists({ id: "matches", partitionKey: { paths: ["/category"] } });
    console.log("  ✅ Containers ready.\n");
  }

  const target = endpoint.replace(/\/+$/, "");
  console.log(`🎯 Target: ${target} / ${databaseId}\n`);

  // Import users
  if (!skipUsers) {
    const filePath = path.join(inputDir, "users.json");
    if (fs.existsSync(filePath)) {
      const items = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      console.log(`  ⏳ Importing ${items.length} users...`);
      const result = await upsertBatch(database.container("users"), items, "/id", "user", dryRun);
      console.log(`  ✅ Users: ${result.success} imported, ${result.failed} failed`);
    } else {
      console.log("  ⚠️  users.json not found, skipping.");
    }
  }

  // Import registrations
  if (!skipRegs) {
    const filePath = path.join(inputDir, "registrations.json");
    if (fs.existsSync(filePath)) {
      const items = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      console.log(`  ⏳ Importing ${items.length} registrations...`);
      const result = await upsertBatch(database.container("registrations"), items, "/userId", "registration", dryRun);
      console.log(`  ✅ Registrations: ${result.success} imported, ${result.failed} failed`);
    } else {
      console.log("  ⚠️  registrations.json not found, skipping.");
    }
  }

  // Import matches
  if (!skipMatches) {
    const filePath = path.join(inputDir, "matches.json");
    if (fs.existsSync(filePath)) {
      const items = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      console.log(`  ⏳ Importing ${items.length} matches...`);
      const result = await upsertBatch(database.container("matches"), items, "/category", "match", dryRun);
      console.log(`  ✅ Matches: ${result.success} imported, ${result.failed} failed`);
    } else {
      console.log("  ⚠️  matches.json not found, skipping.");
    }
  }

  console.log(dryRun ? "\n🔍 Dry run complete. No data was written." : "\n🎉 Import complete!");
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});
