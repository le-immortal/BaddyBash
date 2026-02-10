/**
 * Database initialization & seed script.
 *
 * Usage: npx tsx app/lib/seed.ts
 *
 * Requires COSMOS_ENDPOINT and COSMOS_KEY in .env.local
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient } from "@azure/cosmos";
import { UserDocument, RegistrationDocument } from "./models";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";

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
    { id: "sharmaabh", name: "Abhishek Sharma", email: "sharmaabh@microsoft.com", alias: "sharmaabh", phoneNumber: "+1-555-0001", isAdmin: true, createdAt: now, updatedAt: now },
    { id: "jdoe", name: "John Doe", email: "jdoe@microsoft.com", alias: "jdoe", phoneNumber: "+1-555-0002", createdAt: now, updatedAt: now },
    { id: "jsmith", name: "Jane Smith", email: "jsmith@microsoft.com", alias: "jsmith", phoneNumber: "+1-555-0003", createdAt: now, updatedAt: now },
    { id: "mjohnson", name: "Mike Johnson", email: "mjohnson@microsoft.com", alias: "mjohnson", phoneNumber: "+1-555-0004", createdAt: now, updatedAt: now },
    { id: "swilson", name: "Sarah Wilson", email: "swilson@microsoft.com", alias: "swilson", phoneNumber: "+1-555-0005", createdAt: now, updatedAt: now },
  ];

  console.log("👤 Seeding users...");
  for (const user of sampleUsers) {
    await usersContainer.items.upsert(user);
  }

  const sampleRegistrations: RegistrationDocument[] = [
    { id: "sharmaabh_MS", userId: "sharmaabh", userName: "Abhishek Sharma", category: "MS", status: "confirmed", createdAt: now, updatedAt: now },
    { id: "jdoe_MD", userId: "jdoe", userName: "John Doe", category: "MD", status: "confirmed", partnerId: "mjohnson", partnerName: "Mike Johnson", createdAt: now, updatedAt: now },
    { id: "jdoe_XD", userId: "jdoe", userName: "John Doe", category: "XD", status: "confirmed", partnerId: "jsmith", partnerName: "Jane Smith", createdAt: now, updatedAt: now },
    { id: "jsmith_WS", userId: "jsmith", userName: "Jane Smith", category: "WS", status: "confirmed", createdAt: now, updatedAt: now },
    { id: "mjohnson_MS", userId: "mjohnson", userName: "Mike Johnson", category: "MS", status: "confirmed", createdAt: now, updatedAt: now },
    { id: "mjohnson_MD", userId: "mjohnson", userName: "Mike Johnson", category: "MD", status: "confirmed", partnerId: "jdoe", partnerName: "John Doe", createdAt: now, updatedAt: now },
    { id: "swilson_WD", userId: "swilson", userName: "Sarah Wilson", category: "WD", status: "confirmed", partnerId: "jsmith", partnerName: "Jane Smith", createdAt: now, updatedAt: now },
  ];

  console.log("📝 Seeding registrations...");
  for (const reg of sampleRegistrations) {
    await registrationsContainer.items.upsert(reg);
  }

  console.log("🎉 Seed complete!");
}

seed().catch(console.error);
