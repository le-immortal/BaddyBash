import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockContainer } from "../helpers/testUtils";

describe("getActiveSeason", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the configured non-archived season from season config", async () => {
    const settingsContainer = createMockContainer();
    settingsContainer.pointRead.mockResolvedValue({
      resource: {
        id: "SEASON_CONFIG",
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
            label: "Baddy Bash 2027",
            registrationOpen: true,
            bracketsVisible: false,
            archived: false,
          },
        ],
      },
    });

    vi.doMock("@/app/lib/cosmosClient", () => ({
      getSettingsContainer: vi.fn(() => settingsContainer.container),
      getUsersContainer: vi.fn(() => settingsContainer.container),
    }));

    const { getActiveSeason } = await import("@/app/lib/settings");

    await expect(getActiveSeason()).resolves.toBe("2027");
  });

  it("falls back to the current year when season config is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-15T00:00:00.000Z"));

    const settingsContainer = createMockContainer();
    settingsContainer.pointRead.mockRejectedValue({ code: 404 });

    vi.doMock("@/app/lib/cosmosClient", () => ({
      getSettingsContainer: vi.fn(() => settingsContainer.container),
      getUsersContainer: vi.fn(() => settingsContainer.container),
    }));

    const { getActiveSeason } = await import("@/app/lib/settings");

    await expect(getActiveSeason()).resolves.toBe("2031");

    vi.useRealTimers();
  });
});
