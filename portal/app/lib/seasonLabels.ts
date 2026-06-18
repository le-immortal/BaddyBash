import type { SeasonConfig, SeasonEntry } from "@/app/lib/models";

type SeasonLabelLike = Pick<SeasonEntry, "id"> & Partial<Pick<SeasonEntry, "label">>;

export function getFallbackSeasonLabel(seasonId: string): string {
  return `Baddy Bash ${seasonId}`;
}

export function getSeasonLabel(season: SeasonLabelLike): string {
  const label = season.label?.trim();
  return label ? label : getFallbackSeasonLabel(season.id);
}

export function getSeasonEntryFromConfig(
  config: Pick<SeasonConfig, "activeSeason" | "seasons">,
  seasonId = config.activeSeason
): SeasonLabelLike {
  return config.seasons.find((season) => season.id === seasonId) ?? { id: seasonId };
}

export function getSeasonLabelFromConfig(
  config: Pick<SeasonConfig, "activeSeason" | "seasons">,
  seasonId = config.activeSeason
): string {
  return getSeasonLabel(getSeasonEntryFromConfig(config, seasonId));
}

export function getSeasonPortalLabelFromConfig(
  config: Pick<SeasonConfig, "activeSeason" | "seasons">,
  seasonId = config.activeSeason
): string {
  return `${getSeasonLabelFromConfig(config, seasonId)} Portal`;
}
