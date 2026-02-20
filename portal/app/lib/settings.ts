import { getUsersContainer } from "@/app/lib/cosmosClient";

export interface GlobalSettings {
  id: "CONFIG_GLOBAL";
  registrationOpen: boolean;
  bracketsVisible: boolean;
  updatedAt?: string;
  _ts?: number; // Cosmos DB timestamp
}

const CONFIG_ID = "CONFIG_GLOBAL";
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

let cachedSettings: GlobalSettings | null = null;
let lastFetchTime = 0;

/**
 * Fetch global settings with in-memory caching.
 * Cache invalidates every 30 seconds.
 */
export async function getGlobalSettings(): Promise<GlobalSettings> {
  const now = Date.now();

  // Return cached version if valid
  if (cachedSettings && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedSettings;
  }

  try {
    const container = getUsersContainer();
    const { resource } = await container.item(CONFIG_ID, CONFIG_ID).read<GlobalSettings>();
    
    // Default values if document doesn't exist
    cachedSettings = resource || {
      id: CONFIG_ID,
      registrationOpen: true, // Default open
      bracketsVisible: false, // Default hidden
    };

    lastFetchTime = now;
    return cachedSettings;
  } catch (error) {
    console.error("Failed to fetch global settings:", error);
    // Return safe defaults on error, but don't cache deeply if it's an error
    return {
      id: CONFIG_ID,
      registrationOpen: true,
      bracketsVisible: false,
    };
  }
}

/**
 * Update global settings and refresh the cache immediately.
 */
export async function updateGlobalSettings(newSettings: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const container = getUsersContainer();
  
  // 1. Get existing to merge (or just use cache if we trust it, but better to read for safety on write)
  // Actually, for write operations, we should probability read clean state or just merge with provided.
  // Let's read first to be safe and ensure we don't overwrite other fields if any.
  
  let existing: GlobalSettings | undefined;
  try {
    const { resource } = await container.item(CONFIG_ID, CONFIG_ID).read<GlobalSettings>();
    existing = resource;
  } catch {
    // ignore
  }

  const payload: GlobalSettings = {
    id: CONFIG_ID,
    registrationOpen: true,
    bracketsVisible: false,
    ...(existing || {}),
    ...newSettings,
    updatedAt: new Date().toISOString(),
  };

  const { resource } = await container.items.upsert<GlobalSettings>(payload);
  
  if (resource) {
    cachedSettings = resource;
    lastFetchTime = Date.now();
    return resource;
  }

  throw new Error("Failed to update settings");
}
