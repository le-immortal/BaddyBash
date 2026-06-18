import type { MatchDocument } from "@/app/lib/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/matches/route";
import { isAdmin } from "@/app/lib/authHelpers";
import { getActiveSeason, getSeasonSettings } from "@/app/lib/settings";
import { getTournamentMatchesContainer } from "@/app/lib/tournamentData";

import {
  createFetchAllResult,
  createMockContainer,
  createNextRequest,
  getQueryParameterValue,
} from "../helpers/testUtils";

vi.mock("@/app/lib/authHelpers", () => ({
  requireAdmin: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock("@/app/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/settings")>("@/app/lib/settings");
  return {
    ...actual,
    getActiveSeason: vi.fn(),
    getSeasonSettings: vi.fn(),
  };
});

vi.mock("@/app/lib/tournamentData", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/tournamentData")>("@/app/lib/tournamentData");
  return {
    ...actual,
    getTournamentMatchesContainer: vi.fn(),
  };
});

describe("GET /api/matches", () => {
  const matchesContainer = createMockContainer();

  const archivedMatches: MatchDocument[] = [
    {
      id: "archived-final",
      category: "MS",
      seasonId: "2026",
      round: 2,
      position: 0,
      status: "scheduled",
      sets: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    {
      id: "archived-semi-b",
      category: "MS",
      seasonId: "2026",
      round: 1,
      position: 1,
      status: "scheduled",
      sets: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    {
      id: "archived-semi-a",
      category: "MS",
      seasonId: "2026",
      round: 1,
      position: 0,
      status: "scheduled",
      sets: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ];

  const activeMatches: MatchDocument[] = [
    {
      id: "active-final",
      category: "MS",
      seasonId: "2027",
      round: 2,
      position: 0,
      status: "scheduled",
      sets: [],
      createdAt: "2027-06-01T00:00:00.000Z",
      updatedAt: "2027-06-01T00:00:00.000Z",
    },
    {
      id: "active-semi-a",
      category: "MS",
      seasonId: "2027",
      round: 1,
      position: 0,
      status: "scheduled",
      sets: [],
      createdAt: "2027-06-01T00:00:00.000Z",
      updatedAt: "2027-06-01T00:00:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getTournamentMatchesContainer).mockReturnValue(matchesContainer.container as never);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(getActiveSeason).mockResolvedValue("2027");
    vi.mocked(getSeasonSettings).mockImplementation(async (seasonId?: string) => ({
      id: seasonId || "2027",
      label: `Baddy Bash ${seasonId || "2027"}`,
      registrationOpen: seasonId !== "2026",
      bracketsVisible: true,
      archived: seasonId === "2026",
    }));

    matchesContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
      const seasonCategory = getQueryParameterValue(spec.parameters, "@seasonCategory");
      if (seasonCategory === "2026#MS") {
        return createFetchAllResult(archivedMatches);
      }
      return createFetchAllResult(activeMatches);
    });
  });

  it("returns matches filtered by the requested season", async () => {
    const response = await GET(createNextRequest("http://localhost/api/matches?category=MS&season=2026"));

    expect(response.status).toBe(200);
    expect(matchesContainer.query).toHaveBeenCalledTimes(1);
    expect(matchesContainer.query.mock.calls[0]?.[0]?.parameters).toEqual([
      { name: "@seasonCategory", value: "2026#MS" },
    ]);

    const body = await response.json();
    expect(body.map((match: MatchDocument) => match.id)).toEqual([
      "archived-semi-a",
      "archived-semi-b",
      "archived-final",
    ]);
    expect(body.every((match: MatchDocument) => match.seasonId === "2026")).toBe(true);
  });

  it("allows public reads for archived seasons when brackets are visible", async () => {
    vi.mocked(getSeasonSettings).mockResolvedValueOnce({
      id: "2026",
      label: "Baddy Bash 2026",
      registrationOpen: false,
      bracketsVisible: true,
      archived: true,
    });

    const response = await GET(createNextRequest("http://localhost/api/matches?category=MS&season=2026"));

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(3);
  });

  it("defaults to the active season when no season is provided", async () => {
    const response = await GET(createNextRequest("http://localhost/api/matches?category=MS"));

    expect(response.status).toBe(200);
    expect(getActiveSeason).toHaveBeenCalledTimes(1);
    expect(matchesContainer.query.mock.calls[0]?.[0]?.parameters).toEqual([
      { name: "@seasonCategory", value: "2027#MS" },
    ]);

    const body = await response.json();
    expect(body.every((match: MatchDocument) => match.seasonId === "2027")).toBe(true);
  });
});
