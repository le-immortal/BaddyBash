/**
 * Replace current Cosmos data with the production 2026 backup, transformed to the
 * season-aware model.
 *
 * Dry run:
 *   npx tsx cli/restore-production-2026.ts --input ./my-backup --dry-run
 *
 * Execute:
 *   npx tsx cli/restore-production-2026.ts --input ./my-backup --execute
 *
 * Execute mode exports a safety backup of the current target DB before clearing it.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CosmosClient, Container } from "@azure/cosmos";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import type { Category, SeasonConfig } from "../app/lib/models";

type JsonDoc = Record<string, unknown>;

interface BackupData {
  users: JsonDoc[];
  registrations: JsonDoc[];
  matches: JsonDoc[];
}

interface TransformedData extends BackupData {
  seasonConfig: SeasonConfig;
}

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const dryRun = args.includes("--dry-run") || !execute;
const seasonId = readFlag("--season") || "2026";
const inputDir = path.resolve(readFlag("--input") || "./my-backup");
const safetyBackupDir = path.resolve(
  readFlag("--safety-output") ||
    path.join("backup", `pre-prod-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`)
);

function readFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function readJsonArray(fileName: string): JsonDoc[] {
  const filePath = path.join(inputDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing backup file: ${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }
  return parsed;
}

function stripSystemProps(doc: JsonDoc): JsonDoc {
  const copy = { ...doc };
  delete copy._rid;
  delete copy._self;
  delete copy._etag;
  delete copy._attachments;
  delete copy._ts;
  delete copy._partitionKey;
  return copy;
}

function asCategory(value: unknown): Category {
  if (value === "MS" || value === "WS" || value === "MD" || value === "WD" || value === "XD") {
    return value;
  }
  throw new Error(`Invalid category: ${String(value)}`);
}

function requireString(doc: JsonDoc, field: string, label: string): string {
  const value = doc[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing required string field "${field}".`);
  }
  return value;
}

function transformBackup(data: BackupData): TransformedData {
  const now = new Date().toISOString();
  const configGlobal = data.users.find((doc) => doc.id === "CONFIG_GLOBAL");
  const registrationOpen = typeof configGlobal?.registrationOpen === "boolean" ? configGlobal.registrationOpen : false;
  const bracketsVisible = typeof configGlobal?.bracketsVisible === "boolean" ? configGlobal.bracketsVisible : true;
  const configUpdatedAt = typeof configGlobal?.updatedAt === "string" ? configGlobal.updatedAt : now;

  const seasonConfig: SeasonConfig = {
    id: "SEASON_CONFIG",
    activeSeason: seasonId,
    seasons: [
      {
        id: seasonId,
        label: `Baddy Bash ${seasonId}`,
        registrationOpen,
        bracketsVisible,
        archived: true,
      },
    ],
    updatedAt: now,
  };

  const users = [
    ...data.users
      .filter((doc) => doc.id !== "CONFIG_GLOBAL" && doc.id !== "SEASON_CONFIG")
      .map(stripSystemProps),
    {
      id: "CONFIG_GLOBAL",
      registrationOpen,
      bracketsVisible,
      updatedAt: configUpdatedAt,
    },
    seasonConfig as unknown as JsonDoc,
  ];

  const registrations = data.registrations.map((raw) => {
    const reg = stripSystemProps(raw);
    const userId = requireString(reg, "userId", "Registration");
    const category = asCategory(reg.category);
    return {
      ...reg,
      id: `${userId}_${category}_${seasonId}`,
      category,
      seasonId,
      tournamentId: typeof reg.tournamentId === "string" ? reg.tournamentId : seasonId,
      seasonCategory: `${seasonId}#${category}`,
    };
  });

  const matches = data.matches.map((raw) => {
    const match = stripSystemProps(raw);
    requireString(match, "id", "Match");
    const category = asCategory(match.category);
    return {
      ...match,
      category,
      seasonId,
      tournamentId: typeof match.tournamentId === "string" ? match.tournamentId : seasonId,
      seasonCategory: `${seasonId}#${category}`,
      sets: Array.isArray(match.sets) ? match.sets : [],
    };
  });

  assertUnique(users, (doc) => requireString(doc, "id", "User"), "users.id");
  assertUnique(registrations, (doc) => requireString(doc, "id", "Registration"), "registrations.id");
  assertUnique(matches, (doc) => requireString(doc, "id", "Match"), "matches.id");

  return { users, registrations, matches, seasonConfig };
}

function assertUnique(items: JsonDoc[], getKey: (item: JsonDoc) => string, label: string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }

  if (duplicates.size > 0) {
    throw new Error(`Duplicate ${label} values after transform: ${Array.from(duplicates).slice(0, 10).join(", ")}`);
  }
}

function summarize(data: TransformedData) {
  const countBy = (items: JsonDoc[], field: string) =>
    items.reduce<Record<string, number>>((acc, item) => {
      const value = String(item[field] ?? "<missing>");
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});

  return {
    input: inputDir,
    target: endpoint?.replace(/\/+$/, ""),
    database: databaseId,
    mode: dryRun ? "dry-run" : "execute",
    seasonConfig: data.seasonConfig,
    counts: {
      users: data.users.length,
      registrations: data.registrations.length,
      matches: data.matches.length,
    },
    registrations: {
      byCategory: countBy(data.registrations, "category"),
      missingSeasonId: data.registrations.filter((doc) => !doc.seasonId).length,
      missingSeasonCategory: data.registrations.filter((doc) => !doc.seasonCategory).length,
    },
    matches: {
      byCategory: countBy(data.matches, "category"),
      missingSeasonId: data.matches.filter((doc) => !doc.seasonId).length,
      missingSeasonCategory: data.matches.filter((doc) => !doc.seasonCategory).length,
    },
  };
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function fetchAll(container: Container): Promise<JsonDoc[]> {
  const items: JsonDoc[] = [];
  const iterator = container.items.readAll<JsonDoc>().getAsyncIterator();
  for await (const page of iterator) {
    items.push(...page.resources);
  }
  return items;
}

async function exportCurrentDatabase(client: CosmosClient) {
  const database = client.database(databaseId);
  fs.mkdirSync(safetyBackupDir, { recursive: true });

  const users = await fetchAll(database.container("users"));
  const registrations = await fetchAll(database.container("registrations"));
  const matches = await fetchAll(database.container("matches"));

  fs.writeFileSync(path.join(safetyBackupDir, "users.json"), JSON.stringify(users, null, 2), "utf-8");
  fs.writeFileSync(path.join(safetyBackupDir, "registrations.json"), JSON.stringify(registrations, null, 2), "utf-8");
  fs.writeFileSync(path.join(safetyBackupDir, "matches.json"), JSON.stringify(matches, null, 2), "utf-8");
  fs.writeFileSync(
    path.join(safetyBackupDir, "metadata.json"),
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        sourceEndpoint: endpoint.replace(/\/+$/, ""),
        database: databaseId,
        reason: "Safety backup before restore-production-2026",
        counts: { users: users.length, registrations: registrations.length, matches: matches.length },
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log(`Safety backup written to ${safetyBackupDir}`);
}

async function clearContainer(container: Container, partitionKeyField: string) {
  const { resources } = await container.items
    .query<{ id: string; pk: string }>(`SELECT c.id, c["${partitionKeyField}"] AS pk FROM c`)
    .fetchAll();

  for (const item of resources) {
    await container.item(item.id, item.pk).delete();
  }

  console.log(`Cleared ${resources.length} items from ${container.id}.`);
}

async function upsertAll(container: Container, items: JsonDoc[], partitionKeyField: string) {
  let imported = 0;
  for (const item of items) {
    const pk = item[partitionKeyField];
    if (typeof pk !== "string" || pk.length === 0) {
      throw new Error(`${container.id}/${String(item.id)} missing partition key field ${partitionKeyField}.`);
    }
    await container.items.upsert(item, { partitionKey: pk } as never);
    imported++;
  }
  console.log(`Imported ${imported} items into ${container.id}.`);
}

async function main() {
  if (!endpoint || !key) {
    throw new Error("Missing COSMOS_ENDPOINT or COSMOS_KEY in .env.local.");
  }

  const backup: BackupData = {
    users: readJsonArray("users.json"),
    registrations: readJsonArray("registrations.json"),
    matches: readJsonArray("matches.json"),
  };
  const transformed = transformBackup(backup);

  console.log(JSON.stringify(summarize(transformed), null, 2));

  if (dryRun) {
    console.log("Dry run complete. No Cosmos data was changed. Pass --execute to restore.");
    return;
  }

  const expectedConfirmation = `RESTORE ${seasonId}`;
  const answer = await prompt(`This will clear and replace live Cosmos data. Type "${expectedConfirmation}" to continue: `);
  if (answer !== expectedConfirmation) {
    console.log("Restore aborted.");
    return;
  }

  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseId);
  const users = database.container("users");
  const registrations = database.container("registrations");
  const matches = database.container("matches");

  await exportCurrentDatabase(client);
  await clearContainer(users, "id");
  await clearContainer(registrations, "userId");
  await clearContainer(matches, "category");

  await upsertAll(users, transformed.users, "id");
  await upsertAll(registrations, transformed.registrations, "userId");
  await upsertAll(matches, transformed.matches, "category");

  console.log("Restore complete.");
}

main().catch((error) => {
  console.error("Restore failed:", error);
  process.exit(1);
});