/**
 * Wipe all dummy/seed data from Cosmos DB while preserving global settings.
 *
 * Usage: npx tsx cli/clear-data.ts
 *
 * What it does:
 *   - users       →  deletes all items EXCEPT CONFIG_GLOBAL
 *   - registrations → deletes ALL items
 *   - matches      → deletes ALL items
 *
 * Requires COSMOS_ENDPOINT and COSMOS_KEY in .env.local
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient } from "@azure/cosmos";
import * as readline from "readline";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";

const PRESERVED_IDS = ["CONFIG_GLOBAL"]; // IDs to keep in the users container

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function clearContainer(
  client: CosmosClient,
  containerId: string,
  partitionKeyPath: string,
  skipIds: string[] = []
) {
  const container = client.database(databaseId).container(containerId);

  // Read all items
  const { resources: items } = await container.items
    .query("SELECT c.id, c[\"" + partitionKeyPath.replace("/", "") + "\"] AS pk FROM c")
    .fetchAll();

  const toDelete = items.filter((item) => !skipIds.includes(item.id));
  const skipped = items.length - toDelete.length;

  if (toDelete.length === 0) {
    console.log(`  ${containerId}: nothing to delete (${skipped} preserved)`);
    return;
  }

  console.log(`  ${containerId}: deleting ${toDelete.length} items (preserving ${skipped})...`);

  let deleted = 0;
  for (const item of toDelete) {
    try {
      await container.item(item.id, item.pk).delete();
      deleted++;
      if (deleted % 50 === 0) process.stdout.write(`    ${deleted}/${toDelete.length}\r`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`    ⚠ Failed to delete ${item.id}: ${msg}`);
    }
  }
  console.log(`  ${containerId}: ✅ deleted ${deleted} items`);
}

async function main() {
  if (!endpoint || !key) {
    console.error("❌ Missing COSMOS_ENDPOINT or COSMOS_KEY in .env.local");
    process.exit(1);
  }

  console.log(`\n🗄  Database: ${databaseId}`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`\n⚠  This will DELETE all data from users (except CONFIG_GLOBAL), registrations, and matches.\n`);

  const answer = await prompt("Type YES to confirm: ");
  if (answer !== "yes") {
    console.log("Aborted.");
    process.exit(0);
  }

  const client = new CosmosClient({ endpoint, key });

  console.log("\n🧹 Clearing data...\n");

  await clearContainer(client, "users", "/id", PRESERVED_IDS);
  await clearContainer(client, "registrations", "/userId");
  await clearContainer(client, "matches", "/category");

  console.log("\n✅ Done! All dummy data cleared. CONFIG_GLOBAL preserved.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
