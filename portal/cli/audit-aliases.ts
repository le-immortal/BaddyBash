/**
 * Audit aliases: cross-check user aliases vs emails, and check doubles partner accounts.
 *
 * Usage: npx tsx cli/audit-aliases.ts
 *
 * Checks performed:
 *   1. Alias vs Email prefix — only prints mismatches
 *   2. Doubles partner alias — checks if partner has created an account (has email or not)
 *
 * Requires COSMOS_ENDPOINT and COSMOS_KEY in .env.local
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";

interface UserDoc {
  id: string;
  name: string;
  email: string;
  alias: string;
}

interface RegDoc {
  id: string;
  userId: string;
  userName: string;
  category: string;
  status: string;
  partnerId?: string;
  partnerName?: string;
}

const DOUBLES_CATEGORIES = ["MD", "WD", "XD"];

async function run() {
  console.log("🔍 Baddy Bash Alias Audit\n");
  console.log("Connecting to Cosmos DB...\n");

  const client = new CosmosClient({ endpoint, key });
  const db = client.database(databaseId);
  const usersContainer = db.container("users");
  const regsContainer = db.container("registrations");

  // ── Fetch all users ──────────────────────────────────────────────
  const { resources: allUsers } = await usersContainer.items
    .query<UserDoc>({
      query: "SELECT c.id, c.name, c.email, c.alias FROM c WHERE c.id != 'CONFIG_GLOBAL'",
    })
    .fetchAll();

  // Build lookup maps
  const userById = new Map<string, UserDoc>();
  for (const u of allUsers) {
    userById.set(u.id, u);
  }

  console.log(`Found ${allUsers.length} users\n`);

  // ── 1. Alias vs Email Prefix (mismatches only) ───────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  1. ALIAS vs EMAIL MISMATCHES ONLY");
  console.log("═══════════════════════════════════════════════════\n");

  let aliasEmailMismatches = 0;

  for (const user of allUsers) {
    const emailPrefix = (user.email || "").split("@")[0].toLowerCase().replace(/\./g, "");
    const alias = (user.alias || user.id || "").toLowerCase();

    const aliasNoDots = alias.replace(/\./g, "");
    const match = alias === emailPrefix || aliasNoDots === emailPrefix || emailPrefix.includes(alias) || alias.includes(emailPrefix);

    if (!match) {
      aliasEmailMismatches++;
      console.log(`  ⚠  ${pad(alias, 20)} | email: ${user.email}  (prefix: ${emailPrefix})`);
    }
  }

  if (aliasEmailMismatches === 0) {
    console.log("  ✅ No mismatches — all aliases match their email prefix.\n");
  } else {
    console.log(`\n  Found ${aliasEmailMismatches} mismatch(es) out of ${allUsers.length} users\n`);
  }

  // ── Fetch all registrations ──────────────────────────────────────
  const { resources: allRegs } = await regsContainer.items
    .query<RegDoc>({
      query: "SELECT * FROM c WHERE c.status = 'confirmed'",
    })
    .fetchAll();

  const doublesRegs = allRegs.filter((r) => DOUBLES_CATEGORIES.includes(r.category));

  // ── 2. Doubles Partner — has account with email? ─────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  2. DOUBLES PARTNER ACCOUNT CHECK");
  console.log("═══════════════════════════════════════════════════\n");

  let partnerHasAccount = 0;
  let partnerNoAccount = 0;
  let partnerEmpty = 0;

  for (const reg of doublesRegs) {
    const partnerId = reg.partnerId?.toLowerCase().trim();

    if (!partnerId) {
      partnerEmpty++;
      console.log(`  ✗  ${pad(reg.category, 4)} | ${pad(reg.userId, 20)} → partner: (EMPTY — no partner alias set)`);
      continue;
    }

    const partnerUser = userById.get(partnerId);

    if (partnerUser && partnerUser.email) {
      partnerHasAccount++;
    } else if (partnerUser) {
      partnerNoAccount++;
      console.log(`  ⚠  ${pad(reg.category, 4)} | ${pad(reg.userId, 20)} → partner: ${pad(partnerId, 20)} | account exists but NO EMAIL`);
    } else {
      partnerNoAccount++;
      console.log(`  ✗  ${pad(reg.category, 4)} | ${pad(reg.userId, 20)} → partner: ${pad(partnerId, 20)} | ❌ NO ACCOUNT — not registered yet`);
    }
  }

  console.log(`\n  Doubles registrations: ${doublesRegs.length}`);
  console.log(`  Partner has account + email: ${partnerHasAccount}`);
  console.log(`  Partner NO account/email:    ${partnerNoAccount}`);
  console.log(`  Partner alias empty:         ${partnerEmpty}\n`);

  // ── Final Summary ────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  FINAL SUMMARY");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Users total:                 ${allUsers.length}`);
  console.log(`  Alias/email mismatches:      ${aliasEmailMismatches}`);
  console.log(`  Doubles registrations:       ${doublesRegs.length}`);
  console.log(`  Partners with account+email: ${partnerHasAccount}`);
  console.log(`  Partners without account:    ${partnerNoAccount}`);
  console.log(`  Partners alias empty:        ${partnerEmpty}`);
  console.log("");

  if (aliasEmailMismatches === 0 && partnerNoAccount === 0 && partnerEmpty === 0) {
    console.log("  ✅ All clear — no issues found!\n");
  } else {
    console.log("  ⚠  Review the flagged items above.\n");
  }
}

function pad(str: string, len: number): string {
  return (str || "").padEnd(len);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
