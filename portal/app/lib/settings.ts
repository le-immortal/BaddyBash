import { getUsersContainer } from "@/app/lib/cosmosClient";
import { SeasonConfig, SeasonEntry } from "@/app/lib/models";

// ── Legacy type kept for backward compatibility with existing API consumers ──
export interface GlobalSettings {
  id: "CONFIG_GLOBAL";
  registrationOpen: boolean;
  bracketsVisible: boolean;
  updatedAt?: string;
  _ts?: number;
}

// ── Season Config (new, replaces CONFIG_GLOBAL) ──────────────────────────────

const SEASON_CONFIG_ID = "SEASON_CONFIG";
const DEFAULT_SEASON = "2026";

const SETTINGS_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
let cachedSeasonConfig: SeasonConfig | null = null;
let cachedAt = 0;

function defaultSeasonConfig(): SeasonConfig {
  return {
    id: "SEASON_CONFIG",
    activeSeason: DEFAULT_SEASON,
    seasons: [
      {
        id: DEFAULT_SEASON,
        label: "Baddy Bash 2026",
        registrationOpen: true,
        bracketsVisible: false,
        archived: false,
      },
    ],
  };
}

/**
 * Fetch the full SeasonConfig document (cached 12 h, invalidated on write).
 */
export async function getSeasonConfig(): Promise<SeasonConfig> {
  if (cachedSeasonConfig && Date.now() - cachedAt < SETTINGS_CACHE_TTL) {
    return cachedSeasonConfig;
  }

  try {
    const container = getUsersContainer();
    const { resource } = await container
      .item(SEASON_CONFIG_ID, SEASON_CONFIG_ID)
      .read<SeasonConfig>();

    cachedSeasonConfig = resource || defaultSeasonConfig();
    cachedAt = Date.now();
    return cachedSeasonConfig;
  } catch {
    // First run or missing doc — return defaults
    return defaultSeasonConfig();
  }
}

/**
 * Return the SeasonEntry for a specific season (or active season if not specified).
 */
export async function getSeasonSettings(seasonId?: string): Promise<SeasonEntry> {
  const config = await getSeasonConfig();
  const targetId = seasonId || config.activeSeason;
  const entry = config.seasons.find((s) => s.id === targetId);
  return (
    entry || {
      id: targetId,
      label: `Baddy Bash ${targetId}`,
      registrationOpen: true,
      bracketsVisible: false,
      archived: false,
    }
  );
}

/**
 * Return the currently active season ID (e.g., "2026").
 */
export async function getActiveSeason(): Promise<string> {
  const config = await getSeasonConfig();
  return config.activeSeason;
}

// ── Backward-compat shim: getGlobalSettings / updateGlobalSettings ───────────
// These proxy to the active season entry so existing frontend code keeps working.

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const entry = await getSeasonSettings(); // active season
  return {
    id: "CONFIG_GLOBAL",
    registrationOpen: entry.registrationOpen,
    bracketsVisible: entry.bracketsVisible,
  };
}

export async function updateGlobalSettings(
  newSettings: Partial<Pick<GlobalSettings, "registrationOpen" | "bracketsVisible">>
): Promise<GlobalSettings> {
  const config = await getSeasonConfig();
  const idx = config.seasons.findIndex((s) => s.id === config.activeSeason);

  if (idx === -1) {
    throw new Error(`Active season "${config.activeSeason}" not found in SEASON_CONFIG`);
  }

  // Merge updates into the active season entry
  if (newSettings.registrationOpen !== undefined)
    config.seasons[idx].registrationOpen = newSettings.registrationOpen;
  if (newSettings.bracketsVisible !== undefined)
    config.seasons[idx].bracketsVisible = newSettings.bracketsVisible;

  config.updatedAt = new Date().toISOString();

  const container = getUsersContainer();
  const { resource } = await container.items.upsert<SeasonConfig>(config);

  if (resource) {
    cachedSeasonConfig = resource;
    cachedAt = Date.now();
  } else {
    cachedSeasonConfig = config;
    cachedAt = Date.now();
  }

  return {
    id: "CONFIG_GLOBAL",
    registrationOpen: config.seasons[idx].registrationOpen,
    bracketsVisible: config.seasons[idx].bracketsVisible,
    updatedAt: config.updatedAt,
  };
}

// ── Season management (admin) ────────────────────────────────────────────────

/**
 * Persist the full SeasonConfig document and refresh cache.
 */
export async function updateSeasonConfig(config: SeasonConfig): Promise<SeasonConfig> {
  config.updatedAt = new Date().toISOString();
  const container = getUsersContainer();
  const { resource } = await container.items.upsert<SeasonConfig>(config);

  const saved = resource || config;
  cachedSeasonConfig = saved;
  cachedAt = Date.now();
  return saved;
}

/**
 * Create a new season entry, set it as active, and optionally archive the previous one.
 */
export async function createNewSeason(
  seasonId: string,
  label: string,
  archivePrevious = true
): Promise<SeasonConfig> {
  const config = await getSeasonConfig();

  if (config.seasons.some((s) => s.id === seasonId)) {
    throw new Error(`Season "${seasonId}" already exists`);
  }

  // Archive the currently active season
  if (archivePrevious) {
    const prev = config.seasons.find((s) => s.id === config.activeSeason);
    if (prev) {
      prev.registrationOpen = false;
      prev.bracketsVisible = true; // keep brackets viewable as archive
      prev.archived = true;
    }
  }

  // Add new season
  config.seasons.push({
    id: seasonId,
    label,
    registrationOpen: true,
    bracketsVisible: false,
    archived: false,
  });

  config.activeSeason = seasonId;
  return updateSeasonConfig(config);
}
