import { getUsersContainer } from "@/app/lib/cosmosClient";

export interface GlobalSettings {
  id: "CONFIG_GLOBAL";
  registrationOpen: boolean;
  bracketsVisible: boolean;
  updatedAt?: string;
  _ts?: number; // Cosmos DB timestamp
}

const CONFIG_ID = "CONFIG_GLOBAL";

// In-memory cache with 12-hour TTL — also invalidated on write via updateGlobalSettings().
// Safe for single-instance App Service; settings change at most once or twice per event.
const SETTINGS_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
let cachedSettings: GlobalSettings | null = null;
let cachedAt = 0;


/**
 * Fetch global settings with in-memory caching (12-hour TTL).
 * Also invalidated immediately on write via updateGlobalSettings().
 */
export async function getGlobalSettings(): Promise<GlobalSettings> {
  // Return cached version if available and not expired
  if (cachedSettings && Date.now() - cachedAt < SETTINGS_CACHE_TTL) {
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
    cachedAt = Date.now();

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
    cachedAt = Date.now();
    return resource;
  }

  throw new Error("Failed to update settings");
}
