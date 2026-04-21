/**
 * Export all Cosmos DB data to local JSON files.
 *
 * Usage: npx tsx cli/export-data.ts [--output ./backup]
 *
 * Requires COSMOS_ENDPOINT and COSMOS_KEY in .env.local
 *
 * Exports:
 *   <output>/users.json
 *   <output>/registrations.json
 *   <output>/matches.json
 *   <output>/metadata.json   (timestamp, counts, season config)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient } from "@azure/cosmos";
import * as fs from "fs";
import * as path from "path";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";

async function fetchAll(container: ReturnType<ReturnType<CosmosClient["database"]>["container"]>) {
  const items: unknown[] = [];
  const iterator = container.items.readAll().getAsyncIterator();
  for await (const page of iterator) {
    items.push(...page.resources);
  }
  return items;
}

async function main() {
  // Parse --output flag
  const outputIdx = process.argv.indexOf("--output");
  const outputDir = outputIdx !== -1 && process.argv[outputIdx + 1]
    ? path.resolve(process.argv[outputIdx + 1])
    : path.resolve(__dirname, "..", "backup", new Date().toISOString().slice(0, 10));

  if (!endpoint || !key) {
    console.error("❌ Missing COSMOS_ENDPOINT or COSMOS_KEY in .env.local");
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseId);

  console.log(`📦 Exporting from database "${databaseId}"...`);
  console.log(`📂 Output directory: ${outputDir}\n`);

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Export users
  console.log("  ⏳ Fetching users...");
  const users = await fetchAll(database.container("users"));
  fs.writeFileSync(
    path.join(outputDir, "users.json"),
    JSON.stringify(users, null, 2),
    "utf-8"
  );
  console.log(`  ✅ users.json — ${users.length} documents`);

  // Export registrations
  console.log("  ⏳ Fetching registrations...");
  const registrations = await fetchAll(database.container("registrations"));
  fs.writeFileSync(
    path.join(outputDir, "registrations.json"),
    JSON.stringify(registrations, null, 2),
    "utf-8"
  );
  console.log(`  ✅ registrations.json — ${registrations.length} documents`);

  // Export matches
  console.log("  ⏳ Fetching matches...");
  const matches = await fetchAll(database.container("matches"));
  fs.writeFileSync(
    path.join(outputDir, "matches.json"),
    JSON.stringify(matches, null, 2),
    "utf-8"
  );
  console.log(`  ✅ matches.json — ${matches.length} documents`);

  // Write metadata
  const metadata = {
    exportedAt: new Date().toISOString(),
    sourceEndpoint: endpoint.replace(/\/+$/, ""),
    database: databaseId,
    counts: {
      users: users.length,
      registrations: registrations.length,
      matches: matches.length,
    },
  };
  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf-8"
  );

  console.log(`\n🎉 Export complete → ${outputDir}`);
  console.log(`   ${users.length} users | ${registrations.length} registrations | ${matches.length} matches`);
}

main().catch((err) => {
  console.error("❌ Export failed:", err);
  process.exit(1);
});
