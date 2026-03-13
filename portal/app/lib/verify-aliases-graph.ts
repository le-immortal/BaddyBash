/**
 * Verify suspicious aliases against Microsoft Graph:
 *   1. Users with NO email — check if their alias is a real org member
 *   2. Users WITH email but where alias doesn't match email prefix — verify alias is real
 *
 * Usage:
 *   $env:GRAPH_TOKEN="eyJ0..."; npx tsx app/lib/verify-aliases-graph.ts
 *
 * Get your token from https://developer.microsoft.com/graph/graph-explorer
 *
 * Requires COSMOS_ENDPOINT and COSMOS_KEY in .env.local
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";
const graphToken = process.env.GRAPH_TOKEN;

interface UserDoc {
  id: string;
  name: string;
  email: string;
  alias: string;
}

async function checkAliasInOrg(alias: string): Promise<{ found: boolean; displayName?: string; mail?: string }> {
  const upn = `${alias}@microsoft.com`;
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}?$select=displayName,mail,mailNickname`, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });

    if (res.ok) {
      const data = await res.json();
      return { found: true, displayName: data.displayName, mail: data.mail };
    }

    if (res.status === 404) {
      return { found: false };
    }

    // Rate limited or other error
    const text = await res.text();
    console.error(`    [${res.status}] Error checking ${upn}: ${text.slice(0, 200)}`);
    return { found: false };
  } catch (err) {
    console.error(`    Network error checking ${upn}:`, err);
    return { found: false };
  }
}

async function run() {
  if (!graphToken) {
    console.error("❌ GRAPH_TOKEN env var is required.");
    console.error('   Usage: $env:GRAPH_TOKEN="eyJ0..."; npx tsx app/lib/verify-aliases-graph.ts');
    process.exit(1);
  }

  console.log("🔍 Verifying suspicious aliases against Microsoft Graph\n");
  console.log("Connecting to Cosmos DB...\n");

  const client = new CosmosClient({ endpoint, key });
  const db = client.database(databaseId);
  const usersContainer = db.container("users");

  const { resources: allUsers } = await usersContainer.items
    .query<UserDoc>({
      query: "SELECT c.id, c.name, c.email, c.alias FROM c WHERE c.id != 'CONFIG_GLOBAL'",
    })
    .fetchAll();

  console.log(`Total users: ${allUsers.length}\n`);

  // Split into two groups
  const noEmailUsers = allUsers.filter(u => !u.email || u.email.trim() === "");
  const aliasMismatchUsers = allUsers.filter(u => {
    if (!u.email || u.email.trim() === "") return false; // handled above
    const emailPrefix = u.email.split("@")[0].toLowerCase().replace(/\./g, "");
    const alias = (u.alias || u.id || "").toLowerCase().replace(/\./g, "");
    return alias !== emailPrefix && !emailPrefix.includes(alias) && !alias.includes(emailPrefix);
  });

  console.log(`Users with no email:              ${noEmailUsers.length}`);
  console.log(`Users with alias ≠ email prefix:  ${aliasMismatchUsers.length}\n`);

  const toCheck = [
    ...noEmailUsers.map(u => ({ ...u, reason: "no-email" })),
    ...aliasMismatchUsers.map(u => ({ ...u, reason: "mismatch" })),
  ];

  if (toCheck.length === 0) {
    console.log("✅ Nothing suspicious to verify.\n");
    return;
  }

  console.log(`Checking ${toCheck.length} alias(es) against Graph...\n`);

  type ResultEntry = { alias: string; name: string; email: string; reason: string; graphName: string; graphEmail: string };
  const validAliases: ResultEntry[] = [];
  const invalidAliases: ResultEntry[] = [];

  for (const user of toCheck) {
    const alias = (user.alias || user.id || "").toLowerCase();
    const result = await checkAliasInOrg(alias);

    const entry = { alias, name: user.name, email: user.email || "", reason: user.reason, graphName: result.displayName || "", graphEmail: result.mail || "" };

    if (result.found) {
      validAliases.push(entry);
      process.stdout.write(".");
    } else {
      invalidAliases.push(entry);
      process.stdout.write("✗");
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("\n");

  // ── Invalid (not in org at all) ──────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  ✗ ALIAS NOT FOUND IN ORG — likely a typo");
  console.log("═══════════════════════════════════════════════════\n");

  if (invalidAliases.length === 0) {
    console.log("  ✅ None — all checked aliases exist in the org.\n");
  } else {
    for (const u of invalidAliases) {
      const tag = u.reason === "no-email" ? "[no email]  " : "[mismatch]  ";
      console.log(`  ✗  ${tag}alias: ${pad(u.alias, 20)} | email: ${pad(u.email || "(none)", 35)} | DB name: ${u.name}`);
    }
    console.log(`\n  ${invalidAliases.length} alias(es) NOT found in org.\n`);
  }

  // ── Valid but suspicious ─────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  ✓ ALIAS VALID IN ORG (but was flagged as suspicious)");
  console.log("═══════════════════════════════════════════════════\n");

  if (validAliases.length === 0) {
    console.log("  (none)\n");
  } else {
    for (const u of validAliases) {
      const tag = u.reason === "no-email" ? "[no email]  " : "[mismatch]  ";
      console.log(`  ✓  ${tag}alias: ${pad(u.alias, 20)} | email: ${pad(u.email || "(none)", 35)} | Graph: ${u.graphName} <${u.graphEmail}>`);
    }
    console.log(`\n  ${validAliases.length} alias(es) are real org members — just entered a different alias than their email prefix.\n`);
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Total users:                      ${allUsers.length}`);
  console.log(`  Users with no email:              ${noEmailUsers.length}`);
  console.log(`  Users with alias ≠ email prefix:  ${aliasMismatchUsers.length}`);
  console.log(`  → Alias valid in org:             ${validAliases.length}`);
  console.log(`  → Alias NOT in org (typo?):       ${invalidAliases.length}`);
  console.log("");
}

function pad(str: string, len: number): string {
  return (str || "").padEnd(len);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
