import { CosmosClient, Database, Container } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "baddybash";

let client: CosmosClient;
let database: Database;
let usersContainer: Container;
let registrationsContainer: Container;
let matchesContainer: Container;

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
}
