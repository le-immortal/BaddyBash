import { describe, expect, it } from "vitest";

import {
  getFallbackSeasonLabel,
  getSeasonLabel,
  getSeasonLabelFromConfig,
  getSeasonPortalLabelFromConfig,
} from "@/app/lib/seasonLabels";

describe("season label smoke coverage", () => {
  it("uses the configured season label instead of hard-coded copy", () => {
    const config = {
      id: "SEASON_CONFIG" as const,
      activeSeason: "2027",
      seasons: [
        {
          id: "2026",
          label: "Baddy Bash 2026",
          registrationOpen: false,
          bracketsVisible: true,
          archived: true,
        },
        {
          id: "2027",
          label: "Monsoon Smash 2027",
          registrationOpen: true,
          bracketsVisible: false,
          archived: false,
        },
      ],
    };

    expect(getSeasonLabelFromConfig(config)).toBe("Monsoon Smash 2027");
    expect(getSeasonPortalLabelFromConfig(config)).toBe("Monsoon Smash 2027 Portal");
    expect(getSeasonLabelFromConfig(config, "2026")).toBe("Baddy Bash 2026");
  });

  it("falls back to an id-based label when config omits a custom label", () => {
    expect(getFallbackSeasonLabel("2028")).toBe("Baddy Bash 2028");
    expect(getSeasonLabel({ id: "2028", label: "   " })).toBe("Baddy Bash 2028");
    expect(
      getSeasonLabelFromConfig({
        activeSeason: "2029",
        seasons: [],
      })
    ).toBe("Baddy Bash 2029");
  });
});
