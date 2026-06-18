/**
 * Database initialization & seed script.
 *
 * Usage: npx tsx cli/seed.ts
 *
 * Requires COSMOS_ENDPOINT and COSMOS_KEY in .env.local
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient } from "@azure/cosmos";
import { UserDocument, RegistrationDocument } from "../app/lib/models";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";
const SEASON_ID = "2026";
type SeedRegistration = Omit<RegistrationDocument, "seasonId"> & Partial<Pick<RegistrationDocument, "seasonId" | "tournamentId">>;

async function seed() {
  if (!endpoint || !key) {
    console.error("❌ Missing COSMOS_ENDPOINT or COSMOS_KEY in .env.local");
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });

  console.log("📦 Creating database and containers...");
  const { database } = await client.databases.createIfNotExists({ id: databaseId });

  await database.containers.createIfNotExists({
    id: "users",
    partitionKey: { paths: ["/id"] },
  });
  await database.containers.createIfNotExists({
    id: "registrations",
    partitionKey: { paths: ["/userId"] },
  });
  await database.containers.createIfNotExists({
    id: "matches",
    partitionKey: { paths: ["/category"] },
  });

  console.log("✅ Containers created.");

  // Seed sample users
  const usersContainer = database.container("users");
  const registrationsContainer = database.container("registrations");

  const now = new Date().toISOString();

  const sampleUsers: UserDocument[] = [
    { id: "jdoe", name: "John Doe", email: "jdoe@microsoft.com", alias: "jdoe", phoneNumber: "+91-98765-00002", createdAt: now, updatedAt: now },
    { id: "jsmith", name: "Jane Smith", email: "jsmith@microsoft.com", alias: "jsmith", phoneNumber: "+91-98765-00003", createdAt: now, updatedAt: now },
    { id: "mjohnson", name: "Mike Johnson", email: "mjohnson@microsoft.com", alias: "mjohnson", phoneNumber: "+91-98765-00004", createdAt: now, updatedAt: now },
    { id: "swilson", name: "Sarah Wilson", email: "swilson@microsoft.com", alias: "swilson", phoneNumber: "+91-98765-00005", createdAt: now, updatedAt: now },
    { id: "ravi", name: "Ravi Kumar", email: "ravi@microsoft.com", alias: "ravi", phoneNumber: "+91-98765-00006", createdAt: now, updatedAt: now },
    { id: "priyam", name: "Priya Menon", email: "priyam@microsoft.com", alias: "priyam", phoneNumber: "+91-98765-00007", createdAt: now, updatedAt: now },
    { id: "akash", name: "Akash Patel", email: "akash@microsoft.com", alias: "akash", phoneNumber: "+91-98765-00008", createdAt: now, updatedAt: now },
    { id: "neha", name: "Neha Gupta", email: "neha@microsoft.com", alias: "neha", phoneNumber: "+91-98765-00009", createdAt: now, updatedAt: now },
    { id: "arjun", name: "Arjun Reddy", email: "arjun@microsoft.com", alias: "arjun", phoneNumber: "+91-98765-00010", createdAt: now, updatedAt: now },
  ];

  console.log("👤 Seeding users...");
  for (const user of sampleUsers) {
    await usersContainer.items.upsert(user);
  }

  // ── Registrations ──────────────────────────────────────────────────────
  // Max 2 categories per player. Each doubles pair has both-side registrations.
  //
  // Per-player breakdown (verified ≤ 2 each):
  //   jdoe      : MS, MD        jsmith  : WS, XD
  //   mjohnson  : MS, XD        swilson : WS
  //   ravi      : MS, XD        priyam  : WS, XD
  //   arjun     : MS, MD        neha    : WS, XD
  //   akash     : MD, XD
  //
  // Category rosters:
  //   MS (4): jdoe[1], mjohnson[2], ravi[3], arjun
  //   WS (4): jsmith[1], swilson[2], priyam, neha
  //   MD (2 teams): jdoe+arjun[1], akash+ravi
  //   XD (3 teams): mjohnson+jsmith[1], ravi+priyam, akash+neha

  const sampleRegistrations: SeedRegistration[] = [
    // ── Men's Singles (4 players → clean 4-draw) ──
    { id: "jdoe_MS", userId: "jdoe", userName: "John Doe", category: "MS", status: "confirmed", seed: 1, createdAt: now, updatedAt: now },
    { id: "mjohnson_MS", userId: "mjohnson", userName: "Mike Johnson", category: "MS", status: "confirmed", seed: 2, createdAt: now, updatedAt: now },
    { id: "ravi_MS", userId: "ravi", userName: "Ravi Kumar", category: "MS", status: "confirmed", seed: 3, createdAt: now, updatedAt: now },
    { id: "arjun_MS", userId: "arjun", userName: "Arjun Reddy", category: "MS", status: "confirmed", createdAt: now, updatedAt: now },

    // ── Women's Singles (4 players → clean 4-draw) ──
    { id: "jsmith_WS", userId: "jsmith", userName: "Jane Smith", category: "WS", status: "confirmed", seed: 1, createdAt: now, updatedAt: now },
    { id: "swilson_WS", userId: "swilson", userName: "Sarah Wilson", category: "WS", status: "confirmed", seed: 2, createdAt: now, updatedAt: now },
    { id: "priyam_WS", userId: "priyam", userName: "Priya Menon", category: "WS", status: "confirmed", createdAt: now, updatedAt: now },
    { id: "neha_WS", userId: "neha", userName: "Neha Gupta", category: "WS", status: "confirmed", createdAt: now, updatedAt: now },

    // ── Men's Doubles (2 teams → final) ──
    { id: "jdoe_MD", userId: "jdoe", userName: "John Doe", category: "MD", status: "confirmed", seed: 1, partnerId: "arjun", partnerName: "Arjun Reddy", partnerPhone: "+91-98765-00010", createdAt: now, updatedAt: now },
    { id: "arjun_MD", userId: "arjun", userName: "Arjun Reddy", category: "MD", status: "confirmed", partnerId: "jdoe", partnerName: "John Doe", partnerPhone: "+91-98765-00002", createdAt: now, updatedAt: now },
    { id: "akash_MD", userId: "akash", userName: "Akash Patel", category: "MD", status: "confirmed", partnerId: "ravi", partnerName: "Ravi Kumar", partnerPhone: "+91-98765-00006", createdAt: now, updatedAt: now },
    { id: "ravi_MD", userId: "ravi", userName: "Ravi Kumar", category: "MD", status: "confirmed", partnerId: "akash", partnerName: "Akash Patel", partnerPhone: "+91-98765-00008", createdAt: now, updatedAt: now },

    // ── Mixed Doubles (3 teams → 4-draw, 1 bye) ──
    { id: "mjohnson_XD", userId: "mjohnson", userName: "Mike Johnson", category: "XD", status: "confirmed", seed: 1, partnerId: "jsmith", partnerName: "Jane Smith", partnerPhone: "+91-98765-00003", createdAt: now, updatedAt: now },
    { id: "jsmith_XD", userId: "jsmith", userName: "Jane Smith", category: "XD", status: "confirmed", partnerId: "mjohnson", partnerName: "Mike Johnson", partnerPhone: "+91-98765-00004", createdAt: now, updatedAt: now },
    { id: "ravi_XD", userId: "ravi", userName: "Ravi Kumar", category: "XD", status: "confirmed", partnerId: "priyam", partnerName: "Priya Menon", partnerPhone: "+91-98765-00007", createdAt: now, updatedAt: now },
    { id: "priyam_XD", userId: "priyam", userName: "Priya Menon", category: "XD", status: "confirmed", partnerId: "ravi", partnerName: "Ravi Kumar", partnerPhone: "+91-98765-00006", createdAt: now, updatedAt: now },
    { id: "akash_XD", userId: "akash", userName: "Akash Patel", category: "XD", status: "confirmed", partnerId: "neha", partnerName: "Neha Gupta", partnerPhone: "+91-98765-00009", createdAt: now, updatedAt: now },
    { id: "neha_XD", userId: "neha", userName: "Neha Gupta", category: "XD", status: "confirmed", partnerId: "akash", partnerName: "Akash Patel", partnerPhone: "+91-98765-00008", createdAt: now, updatedAt: now },
  ];

  console.log("📝 Seeding registrations...");
  for (const reg of sampleRegistrations) {
    await registrationsContainer.items.upsert({
      ...reg,
      id: `${reg.userId}_${reg.category}_${SEASON_ID}`,
      seasonId: SEASON_ID,
      tournamentId: SEASON_ID,
    } satisfies RegistrationDocument);
  }

  console.log("🎉 Seed complete!");
}

seed().catch(console.error);
