/**
 * Bulk seed script — wipes ALL data, then reseeds with exact counts.
 * Some players are shared between singles and doubles (max 2 categories).
 *
 * Usage: npx tsx cli/seed-bulk.ts
 *
 * Target counts:
 *   MS:  443 players  → 443 registrations
 *   WS:   69 players  →  69 registrations
 *   MD:  280 teams    → 560 registrations
 *   WD:  129 teams    → 258 registrations
 *   XD:  129 teams    → 258 registrations
 *   ─────────────────────────────
 *   Total:            1588 registrations
 *
 * Overlap:
 *   - First 100 MS players also play MD (50 MD teams from MS pool)
 *   - First 30 WS players also play WD (15 WD teams from WS pool)
 *   - Top seeds appear in both their singles and doubles categories
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient } from "@azure/cosmos";
import type { UserDocument, RegistrationDocument } from "../app/lib/models";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";
const SEASON_ID = "2026";
type SeedRegistration = Omit<RegistrationDocument, "seasonId"> & Partial<Pick<RegistrationDocument, "seasonId" | "tournamentId">>;

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

/* ── Wipe helper ────────────────────────────────────────────────────── */
async function wipeContainer(
  container: ReturnType<ReturnType<CosmosClient["database"]>["container"]>,
  partitionKeyPath: string,
  label: string,
) {
  console.log(`🗑️  Wiping ${label}...`);
  const { resources } = await container.items
    .query({ query: `SELECT c.id, c${partitionKeyPath} AS pk FROM c` })
    .fetchAll();
  const BATCH = 50;
  let deleted = 0;
  for (let i = 0; i < resources.length; i += BATCH) {
    const chunk = resources.slice(i, i + BATCH);
    await Promise.all(
      chunk.map((doc: { id: string; pk: string }) =>
        container.item(doc.id, doc.pk).delete().catch(() => {})
      )
    );
    deleted += chunk.length;
    process.stdout.write(`  ${deleted}/${resources.length}\r`);
  }
  console.log(`  ✅ Deleted ${resources.length} ${label}.`);
}

/* ── Main ───────────────────────────────────────────────────────────── */
async function bulkSeed() {
  if (!endpoint || !key) {
    console.error("❌ Missing COSMOS_ENDPOINT or COSMOS_KEY in .env.local");
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({ id: databaseId });

  for (const c of ["users", "registrations", "matches"]) {
    const pk = c === "users" ? "/id" : c === "registrations" ? "/userId" : "/category";
    await database.containers.createIfNotExists({ id: c, partitionKey: { paths: [pk] } });
  }

  const usersContainer = database.container("users");
  const regsContainer = database.container("registrations");
  const matchesContainer = database.container("matches");

  // ── Step 1: Wipe all data ───────────────────────────────────────────
  console.log("\n═══ WIPING ALL DATA ═══");
  await wipeContainer(matchesContainer, ".category", "matches");
  await wipeContainer(regsContainer, ".userId", "registrations");
  await wipeContainer(usersContainer, ".id", "users");
  console.log("═══ WIPE COMPLETE ═══\n");

  const now = new Date().toISOString();
  const BATCH = 50;

  /* ── Step 2: Generate user pools ─────────────────────────────────── */
  // Overlap plan (max 2 categories per user):
  //   MS: 443 males (m1–m443). First 100 (m1–m100) ALSO play MD.
  //   MD: 280 teams = 560 players.
  //       50 teams from MS overlap: m1+m2, m3+m4, …, m99+m100
  //       230 teams from MD-only: md1–md460
  //   WS: 69 females (f1–f69). First 30 (f1–f30) ALSO play WD.
  //   WD: 129 teams = 258 players.
  //       15 teams from WS overlap: f1+f2, f3+f4, …, f29+f30
  //       114 teams from WD-only: fd1–fd228
  //   XD: 129 teams. mx1–mx129 (males) + fx1–fx129 (females). All XD-only.
  //
  // Unique users: 443 + 460 + 69 + 228 + 129 + 129 = 1458
  // Registrations: 443 + 560 + 69 + 258 + 258 = 1588

  const maleMS    = generateUsers("m",  443, maleFirst);      // m1–m443 → MS (first 100 also MD)
  const maleMDonly = generateUsers("md", 460, maleFirst);     // md1–md460 → MD only (230 teams)
  const femaleWS  = generateUsers("f",   69, femaleFirst);    // f1–f69 → WS (first 30 also WD)
  const femaleWDonly = generateUsers("fd", 228, femaleFirst); // fd1–fd228 → WD only (114 teams)
  const maleXD    = generateUsers("mx", 129, maleFirst);      // mx1–mx129 → XD
  const femaleXD  = generateUsers("fx", 129, femaleFirst);    // fx1–fx129 → XD

  const allUsers = [...maleMS, ...maleMDonly, ...femaleWS, ...femaleWDonly, ...maleXD, ...femaleXD];
  console.log(`👤 Upserting ${allUsers.length} users...`);

  for (let i = 0; i < allUsers.length; i += BATCH) {
    const chunk = allUsers.slice(i, i + BATCH);
    await Promise.all(chunk.map((u) => usersContainer.items.upsert(u)));
    if ((i / BATCH) % 4 === 0) process.stdout.write(`  ${i + chunk.length}/${allUsers.length}\r`);
  }
  console.log(`  ✅ ${allUsers.length} users upserted.`);

  /* ── Step 3: Build registrations ─────────────────────────────────── */
  const regs: SeedRegistration[] = [];

  // ── MS — 443 singles, top 16 seeded ─────────────────────────────────
  for (let i = 0; i < maleMS.length; i++) {
    const u = maleMS[i];
    regs.push({
      id: `${u.id}_MS`, userId: u.id, userName: u.name, category: "MS",
      status: "confirmed", seed: i < 16 ? i + 1 : undefined,
      createdAt: now, updatedAt: now,
    });
  }

  // ── MD — 280 teams total ────────────────────────────────────────────
  // First 50 teams from MS overlap (m1+m2, m3+m4, …, m99+m100)
  const msOverlap = maleMS.slice(0, 100); // first 100 MS players
  for (let i = 0; i < msOverlap.length; i += 2) {
    const a = msOverlap[i];
    const b = msOverlap[i + 1];
    const teamIdx = i / 2; // 0–49
    // Top 4 MS-overlap teams are seeded 1–4 in MD
    const teamSeed = teamIdx < 4 ? teamIdx + 1 : undefined;
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
  // Remaining 230 teams from MD-only pool (md1+md2, md3+md4, …)
  for (let i = 0; i < maleMDonly.length; i += 2) {
    const a = maleMDonly[i];
    const b = maleMDonly[i + 1];
    const teamIdx = i / 2; // 0–229
    // Seeds 5–8 come from MD-only pool (teamIdx 0–3)
    const teamSeed = teamIdx < 4 ? teamIdx + 5 : undefined;
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

  // ── WS — 69 singles, top 8 seeded ──────────────────────────────────
  for (let i = 0; i < femaleWS.length; i++) {
    const u = femaleWS[i];
    regs.push({
      id: `${u.id}_WS`, userId: u.id, userName: u.name, category: "WS",
      status: "confirmed", seed: i < 8 ? i + 1 : undefined,
      createdAt: now, updatedAt: now,
    });
  }

  // ── WD — 129 teams total ───────────────────────────────────────────
  // First 15 teams from WS overlap (f1+f2, f3+f4, …, f29+f30)
  const wsOverlap = femaleWS.slice(0, 30); // first 30 WS players
  for (let i = 0; i < wsOverlap.length; i += 2) {
    const a = wsOverlap[i];
    const b = wsOverlap[i + 1];
    const teamIdx = i / 2; // 0–14
    const teamSeed = teamIdx < 4 ? teamIdx + 1 : undefined;
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
  // Remaining 114 teams from WD-only pool
  for (let i = 0; i < femaleWDonly.length; i += 2) {
    const a = femaleWDonly[i];
    const b = femaleWDonly[i + 1];
    const teamIdx = i / 2; // 0–113
    const teamSeed = teamIdx < 4 ? teamIdx + 5 : undefined;
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

  // ── XD — 129 teams (129 males + 129 females), top 8 seeded ─────────
  for (let i = 0; i < maleXD.length; i++) {
    const m = maleXD[i];
    const f = femaleXD[i];
    const teamSeed = i < 8 ? i + 1 : undefined;
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
    await Promise.all(chunk.map((r) => regsContainer.items.upsert({
      ...r,
      id: `${r.userId}_${r.category}_${SEASON_ID}`,
      seasonId: SEASON_ID,
      tournamentId: SEASON_ID,
    } satisfies RegistrationDocument)));
    if ((i / BATCH) % 4 === 0) process.stdout.write(`  ${i + chunk.length}/${regs.length}\r`);
  }
  console.log(`  ✅ ${regs.length} registrations upserted.`);

  // Print summary
  const summary: Record<string, number> = {};
  for (const r of regs) summary[r.category] = (summary[r.category] || 0) + 1;

  // Count shared users
  const userCatCount = new Map<string, Set<string>>();
  for (const r of regs) {
    if (!userCatCount.has(r.userId)) userCatCount.set(r.userId, new Set());
    userCatCount.get(r.userId)!.add(r.category);
  }
  const sharedUsers = [...userCatCount.values()].filter(s => s.size > 1).length;

  console.log("\n📊 Registration breakdown:");
  console.log(`  MS: ${summary["MS"]} regs (443 players)`);
  console.log(`  WS: ${summary["WS"]} regs (69 players)`);
  console.log(`  MD: ${summary["MD"]} regs (280 teams)`);
  console.log(`  WD: ${summary["WD"]} regs (129 teams)`);
  console.log(`  XD: ${summary["XD"]} regs (129 teams)`);
  console.log(`  TOTAL: ${regs.length} registrations, ${allUsers.length} unique users`);
  console.log(`  🔗 ${sharedUsers} players appear in 2 categories (singles + doubles)`);
  console.log("\n🎉 Bulk seed complete!");
}

bulkSeed().catch(console.error);
