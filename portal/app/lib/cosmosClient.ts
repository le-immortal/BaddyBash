import { CosmosClient, Database, Container } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";
export const PARTNER_POSTS_CONTAINER_ID = "partner_posts";

let client: CosmosClient;
let database: Database;
let usersContainer: Container;
let settingsContainer: Container;
let registrationsContainer: Container;
let matchesContainer: Container;
let registrationsV2Container: Container;
let matchesV2Container: Container;
let partnerPostsContainer: Container;

function getClient(): CosmosClient {
  if (!client) {
    client = new CosmosClient({ endpoint, key });
  }
  return client;
}

function getDatabase(): Database {
  if (!database) {
    database = getClient().database(databaseId);
  }
  return database;
}

export function getUsersContainer(): Container {
  if (!usersContainer) {
    usersContainer = getDatabase().container("users");
  }
  return usersContainer;
}

export function getSettingsContainer(): Container {
  if (!settingsContainer) {
    settingsContainer = getDatabase().container("settings");
  }
  return settingsContainer;
}

export function getRegistrationsContainer(): Container {
  if (!registrationsContainer) {
    registrationsContainer = getDatabase().container("registrations");
  }
  return registrationsContainer;
}

export function getMatchesContainer(): Container {
  if (!matchesContainer) {
    matchesContainer = getDatabase().container("matches");
  }
  return matchesContainer;
}

export function getRegistrationsV2Container(): Container {
  if (!registrationsV2Container) {
    registrationsV2Container = getDatabase().container("registrations_v2");
  }
  return registrationsV2Container;
}

export function getMatchesV2Container(): Container {
  if (!matchesV2Container) {
    matchesV2Container = getDatabase().container("matches_v2");
  }
  return matchesV2Container;
}

export function getPartnerPostsContainer(): Container {
  if (!partnerPostsContainer) {
    partnerPostsContainer = getDatabase().container(PARTNER_POSTS_CONTAINER_ID);
  }
  return partnerPostsContainer;
}

/**
 * Initialize the database and containers if they don't exist.
 * Call this once on first request or via a setup script.
 */
export async function initializeDatabase(): Promise<void> {
  const client = getClient();

  const { database: db } = await client.databases.createIfNotExists({
    id: databaseId,
  });

  // Users container — partitioned by id (each user is their own partition)
  await db.containers.createIfNotExists({
    id: "users",
    partitionKey: { paths: ["/id"] },
  });

  // Settings container — stores singleton config docs by ID.
  await db.containers.createIfNotExists({
    id: "settings",
    partitionKey: { paths: ["/id"] },
  });

  // Registrations container — partitioned by userId for efficient per-user queries
  await db.containers.createIfNotExists({
    id: "registrations",
    partitionKey: { paths: ["/userId"] },
  });

  // Matches container — partitioned by category for easy bracket queries
  await db.containers.createIfNotExists({
    id: "matches",
    partitionKey: { paths: ["/category"] },
  });

  // v2 tournament containers — read-aligned by season + category.
  await db.containers.createIfNotExists({
    id: "registrations_v2",
    partitionKey: { paths: ["/seasonCategory"] },
  });

  await db.containers.createIfNotExists({
    id: "matches_v2",
    partitionKey: { paths: ["/seasonCategory"] },
  });

  // Partner board posts — one post per user/category/season.
  await db.containers.createIfNotExists({
    id: PARTNER_POSTS_CONTAINER_ID,
    partitionKey: { paths: ["/seasonCategory"] },
  });
}
