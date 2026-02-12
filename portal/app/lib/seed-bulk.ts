/**
 * Bulk seed script — generates ~1000 registration entries for scale testing.
 *
 * Usage: npx tsx app/lib/seed-bulk.ts
 *
 * Strategy (max 2 categories per player, doubles need both-side registrations):
 *   MS: 200 players → 200 entries
 *   WS: 150 players → 150 entries
 *   MD: 130 teams  → 260 entries (260 male players, some overlap with MS)
 *   WD: 100 teams  → 200 entries (200 female players, some overlap with WS)
 *   XD: 100 teams  → 200 entries (100 male + 100 female, no overlap since they'd hit max-2)
 *   ─────────────────────────────
 *   Total:          ~1010 entries
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient } from "@azure/cosmos";
import type { UserDocument, RegistrationDocument, Category } from "./models";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";

/* ── Name generators ────────────────────────────────────────────────── */
const maleFirst = [
  "Aarav", "Vihaan", "Aditya", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna",
  "Ishaan", "Shaurya", "Atharv", "Vivaan", "Ansh", "Dhruv", "Kabir", "Ritvik",
  "Arnav", "Rudra", "Kian", "Darsh", "Rohan", "Yash", "Dev", "Harsh", "Nikhil",
  "Pranav", "Rahul", "Sahil", "Tanay", "Varun", "Akash", "Kunal", "Mohit",
  "Ravi", "Suresh", "Vikram", "Ajay", "Deepak", "Gaurav", "Hemant", "Jay",
  "Karthik", "Lakshman", "Manish", "Naveen", "Om", "Pavan", "Rajesh", "Sachin",
  "Tushar", "Uday", "Vishal", "Yogesh", "Abhishek", "Bharat", "Chirag", "Deven",
  "Eshan", "Farhan", "Girish",
];
const femaleFirst = [
  "Aanya", "Diya", "Saanvi", "Ananya", "Pari", "Aadhya", "Myra", "Sara",
  "Ira", "Anika", "Ahana", "Kiara", "Riya", "Prisha", "Navya", "Avni",
  "Kavya", "Meera", "Nisha", "Pooja", "Sneha", "Tanvi", "Anjali", "Deepika",
  "Fatima", "Gauri", "Hina", "Ishita", "Jaya", "Kriti", "Lakshmi", "Mala",
  "Neha", "Padma", "Radhika", "Shalini", "Tara", "Uma", "Vandana", "Yamini",
  "Bhavna", "Chitra", "Divya", "Ekta", "Geeta", "Harini", "Indu", "Juhi",
  "Kamala", "Lata",
];
const lastNames = [
  "Sharma", "Verma", "Patel", "Gupta", "Singh", "Kumar", "Reddy", "Nair",
  "Menon", "Iyer", "Joshi", "Desai", "Mehta", "Chopra", "Bhat", "Rao",
  "Das", "Sen", "Roy", "Pillai", "Sinha", "Malhotra", "Saxena", "Agarwal",
  "Chauhan", "Yadav", "Mishra", "Tiwari", "Pandey", "Dubey", "Banerjee",
  "Mukherjee", "Chatterjee", "Bose", "Ghosh", "Dutta", "Kapoor", "Khanna",
  "Bhatt", "Shah", "Modi", "Trivedi", "Kulkarni", "Patil", "Naik", "More",
  "Jadhav", "Pawar", "Shinde", "Gaikwad",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUsers(prefix: string, count: number, firstNames: string[]): UserDocument[] {
  const now = new Date().toISOString();
  const users: UserDocument[] = [];
  for (let i = 1; i <= count; i++) {
    const first = pick(firstNames);
    const last = pick(lastNames);
    const id = `${prefix}${i}`;
    users.push({
      id,
      name: `${first} ${last}`,
      email: `${id}@contoso.com`,
      alias: id,
      phoneNumber: `+91-${String(90000 + i).padStart(5, "0")}-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`,
      createdAt: now,
      updatedAt: now,
    });
  }
  return users;
}

/* ── Main ───────────────────────────────────────────────────────────── */
async function bulkSeed() {
  if (!endpoint || !key) {
    console.error("❌ Missing COSMOS_ENDPOINT or COSMOS_KEY in .env.local");
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({ id: databaseId });

  // Ensure containers exist
  for (const c of ["users", "registrations", "matches"]) {
    const pk = c === "users" ? "/id" : c === "registrations" ? "/userId" : "/category";
    await database.containers.createIfNotExists({ id: c, partitionKey: { paths: [pk] } });
  }

  const usersContainer = database.container("users");
  const regsContainer = database.container("registrations");
  const now = new Date().toISOString();

  /* ── Generate user pools ─────────────────────────────────────────── */
  // Male pools (non-overlapping ID ranges):
  //   m1–m200   → MS only
  //   m201–m330 → MD only (130 players for 65 extra MD teams; 65 overlap teams come from MS pool)
  //   m331-m430 → XD only
  // Female pools:
  //   f1–f150   → WS only
  //   f151–f350 → WD only (100 teams = 200 players; some overlap with WS)
  //   f351–f450 → XD only

  // But to keep it clean with max-2:
  //   MS players (m1-m200): 70 of them ALSO play MD (so they hit 2 categories)
  //   The other 130 MS players only play MS (1 category)
  //   MD needs 130 teams = 260 players. 70 come from MS pool, 190 are MD-only (m201-m390)
  //   XD needs 100 teams. 100 new males (m391-m490), 100 new females (f251-f350)
  //   WS players (f1-f150): 50 of them ALSO play WD
  //   WD needs 100 teams = 200 players. 50 from WS pool, 150 are WD-only (f151-f300)... wait that's 200 total for WD side, let me recalc.

  // Simpler plan:
  //   MS: 200 solo-MS males (m1-m200)
  //   WS: 150 solo-WS females (f1-f150)
  //   MD: 130 teams from 260 unique males (m201-m460) — only play MD
  //   WD: 100 teams from 200 unique females (f151-f350) — only play WD
  //   XD: 100 teams from 100 new males (m461-m560) + 100 new females (f351-f450)
  //   Total users: 560 males + 450 females = 1010 users
  //   Total regs:  200 + 150 + 260 + 200 + 200 = 1010 registrations ✓
  //   Max categories per user: exactly 1

  const maleMS = generateUsers("m", 200, maleFirst);        // m1–m200 → MS
  const maleMD = generateUsers("md", 260, maleFirst);       // md1–md260 → MD (130 teams)
  const maleXD = generateUsers("mx", 100, maleFirst);       // mx1–mx100 → XD
  const femaleWS = generateUsers("f", 150, femaleFirst);    // f1–f150 → WS
  const femaleWD = generateUsers("fd", 200, femaleFirst);   // fd1–fd200 → WD (100 teams)
  const femaleXD = generateUsers("fx", 100, femaleFirst);   // fx1–fx100 → XD

  const allUsers = [...maleMS, ...maleMD, ...maleXD, ...femaleWS, ...femaleWD, ...femaleXD];
  console.log(`👤 Upserting ${allUsers.length} users...`);

  // Batch upsert in parallel (chunks of 50)
  const BATCH = 50;
  for (let i = 0; i < allUsers.length; i += BATCH) {
    const chunk = allUsers.slice(i, i + BATCH);
    await Promise.all(chunk.map((u) => usersContainer.items.upsert(u)));
    if ((i / BATCH) % 4 === 0) process.stdout.write(`  ${i + chunk.length}/${allUsers.length}\r`);
  }
  console.log(`  ✅ ${allUsers.length} users upserted.`);

  /* ── Build registrations ─────────────────────────────────────────── */
  const regs: RegistrationDocument[] = [];

  // MS — 200 singles
  for (let i = 0; i < maleMS.length; i++) {
    const u = maleMS[i];
    regs.push({
      id: `${u.id}_MS`, userId: u.id, userName: u.name, category: "MS",
      status: "confirmed", seed: i < 8 ? i + 1 : undefined,
      createdAt: now, updatedAt: now,
    });
  }

  // WS — 150 singles
  for (let i = 0; i < femaleWS.length; i++) {
    const u = femaleWS[i];
    regs.push({
      id: `${u.id}_WS`, userId: u.id, userName: u.name, category: "WS",
      status: "confirmed", seed: i < 8 ? i + 1 : undefined,
      createdAt: now, updatedAt: now,
    });
  }

  // MD — 130 teams (260 players, paired sequentially)
  for (let i = 0; i < maleMD.length; i += 2) {
    const a = maleMD[i];
    const b = maleMD[i + 1];
    const teamSeed = i < 8 ? (i / 2) + 1 : undefined;
    regs.push({
      id: `${a.id}_MD`, userId: a.id, userName: a.name, category: "MD",
      status: "confirmed", seed: teamSeed,
      partnerId: b.id, partnerName: b.name, partnerPhone: b.phoneNumber,
      createdAt: now, updatedAt: now,
    });
    regs.push({
      id: `${b.id}_MD`, userId: b.id, userName: b.name, category: "MD",
      status: "confirmed",
      partnerId: a.id, partnerName: a.name, partnerPhone: a.phoneNumber,
      createdAt: now, updatedAt: now,
    });
  }

  // WD — 100 teams (200 players, paired sequentially)
  for (let i = 0; i < femaleWD.length; i += 2) {
    const a = femaleWD[i];
    const b = femaleWD[i + 1];
    const teamSeed = i < 8 ? (i / 2) + 1 : undefined;
    regs.push({
      id: `${a.id}_WD`, userId: a.id, userName: a.name, category: "WD",
      status: "confirmed", seed: teamSeed,
      partnerId: b.id, partnerName: b.name, partnerPhone: b.phoneNumber,
      createdAt: now, updatedAt: now,
    });
    regs.push({
      id: `${b.id}_WD`, userId: b.id, userName: b.name, category: "WD",
      status: "confirmed",
      partnerId: a.id, partnerName: a.name, partnerPhone: a.phoneNumber,
      createdAt: now, updatedAt: now,
    });
  }

  // XD — 100 teams (100 males + 100 females)
  for (let i = 0; i < maleXD.length; i++) {
    const m = maleXD[i];
    const f = femaleXD[i];
    const teamSeed = i < 4 ? i + 1 : undefined;
    regs.push({
      id: `${m.id}_XD`, userId: m.id, userName: m.name, category: "XD",
      status: "confirmed", seed: teamSeed,
      partnerId: f.id, partnerName: f.name, partnerPhone: f.phoneNumber,
      createdAt: now, updatedAt: now,
    });
    regs.push({
      id: `${f.id}_XD`, userId: f.id, userName: f.name, category: "XD",
      status: "confirmed",
      partnerId: m.id, partnerName: m.name, partnerPhone: m.phoneNumber,
      createdAt: now, updatedAt: now,
    });
  }

  console.log(`📝 Upserting ${regs.length} registrations...`);
  for (let i = 0; i < regs.length; i += BATCH) {
    const chunk = regs.slice(i, i + BATCH);
    await Promise.all(chunk.map((r) => regsContainer.items.upsert(r)));
    if ((i / BATCH) % 4 === 0) process.stdout.write(`  ${i + chunk.length}/${regs.length}\r`);
  }
  console.log(`  ✅ ${regs.length} registrations upserted.`);

  // Print summary
  const summary: Record<string, number> = {};
  for (const r of regs) summary[r.category] = (summary[r.category] || 0) + 1;
  console.log("\n📊 Registration breakdown:");
  for (const [cat, count] of Object.entries(summary).sort()) {
    console.log(`  ${cat}: ${count} entries`);
  }
  console.log(`  TOTAL: ${regs.length}`);
  console.log(`  Users: ${allUsers.length}`);
  console.log("\n🎉 Bulk seed complete!");
}

bulkSeed().catch(console.error);
