import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as exportPlayers } from "@/app/api/admin/export/route";
import { POST as importBracket } from "@/app/api/admin/import/bracket/route";
import { GET as listPlayers, PUT as updateSeeds } from "@/app/api/admin/players/route";
import { POST as generateFixtures } from "@/app/api/matches/route";
import { requireAdmin } from "@/app/lib/authHelpers";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { updateMatchWithAdvancement } from "@/app/lib/matchService";
import { getActiveSeason, getSeasonSettings } from "@/app/lib/settings";
import {
  getTournamentMatchesContainer,
  getTournamentRegistrationsContainer,
} from "@/app/lib/tournamentData";

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

vi.mock("@/app/lib/cosmosClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/cosmosClient")>("@/app/lib/cosmosClient");
  return {
    ...actual,
    getUsersContainer: vi.fn(),
  };
});

vi.mock("@/app/lib/tournamentData", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/tournamentData")>("@/app/lib/tournamentData");
  return {
    ...actual,
    getTournamentMatchesContainer: vi.fn(),
    getTournamentRegistrationsContainer: vi.fn(),
  };
});

vi.mock("@/app/lib/matchService", () => ({
  updateMatchWithAdvancement: vi.fn(),
}));

describe("admin season-aware routes", () => {
  const matchesContainer = createMockContainer();
  const registrationsContainer = createMockContainer();
  const usersContainer = createMockContainer();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(requireAdmin).mockResolvedValue({ user: { isAdmin: true } } as never);
    vi.mocked(getActiveSeason).mockResolvedValue("2027");
    vi.mocked(getSeasonSettings).mockImplementation(async (seasonId?: string) => ({
      id: seasonId || "2027",
      label: `Baddy Bash ${seasonId || "2027"}`,
      registrationOpen: seasonId !== "2026",
      bracketsVisible: true,
      archived: seasonId === "2026",
    }));

    vi.mocked(getTournamentMatchesContainer).mockReturnValue(matchesContainer.container as never);
    vi.mocked(getTournamentRegistrationsContainer).mockReturnValue(registrationsContainer.container as never);
    vi.mocked(getUsersContainer).mockReturnValue(usersContainer.container as never);
  });

  it("rejects archived-season seed updates", async () => {
    const response = await updateSeeds(
      createNextRequest("http://localhost/api/admin/players", {
        category: "MS",
        season: "2026",
        seeds: {
          alice_MS_2026: 1,
        },
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Cannot modify archived season",
    });
    expect(registrationsContainer.query).not.toHaveBeenCalled();
  });

  it("defaults admin player reads to the active season", async () => {
    registrationsContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
      const seasonCategory = getQueryParameterValue(spec.parameters, "@seasonCategory");
      return createFetchAllResult(
        seasonCategory === "2027#MS"
          ? [
              {
                id: "alice_MS_2027",
                userId: "alice",
                userName: "Alice",
                category: "MS",
                status: "confirmed",
                seasonId: "2027",
                createdAt: "2027-06-01T00:00:00.000Z",
                updatedAt: "2027-06-01T00:00:00.000Z",
              },
            ]
          : []
      );
    });
    usersContainer.pointRead.mockResolvedValue({
      resource: {
        id: "alice",
        alias: "alice",
        name: "Alice",
        email: "alice@microsoft.com",
      },
    });

    const response = await listPlayers(
      createNextRequest("http://localhost/api/admin/players?category=MS")
    );

    expect(response.status).toBe(200);
    expect(getActiveSeason).toHaveBeenCalledTimes(1);
    expect(registrationsContainer.query.mock.calls[0]?.[0]?.parameters).toEqual([
      { name: "@seasonCategory", value: "2027#MS" },
    ]);
  });

  it("blocks fixture generation for archived seasons", async () => {
    const response = await generateFixtures(
      createNextRequest("http://localhost/api/matches", {
        category: "MS",
        season: "2026",
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Cannot generate brackets for an archived season",
    });
    expect(matchesContainer.query).not.toHaveBeenCalled();
  });

  it("rejects bracket imports whose rows do not belong to the requested season", async () => {
    matchesContainer.query.mockImplementation(() =>
      createFetchAllResult([
        {
          id: "match-1",
          category: "MS",
          seasonId: "2026",
          round: 1,
          position: 0,
          status: "scheduled",
          sets: [],
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ])
    );

    const response = await importBracket(
      createNextRequest("http://localhost/api/admin/import/bracket", {
        season: "2027",
        updates: [
          {
            id: "match-1",
            category: "MS",
            winnerId: "alice",
            winnerName: "Alice",
          },
        ],
      })
    );

    expect(response.status).toBe(400);
    expect(matchesContainer.query.mock.calls[0]?.[0]?.parameters).toEqual([
      { name: "@id", value: "match-1" },
      { name: "@category", value: "MS" },
      { name: "@seasonId", value: "2027" },
    ]);

    const body = await response.json();
    expect(body.errors).toEqual([
      { id: "match-1", error: "Imported row does not belong to the selected season" },
    ]);
    expect(updateMatchWithAdvancement).not.toHaveBeenCalled();
  });

  it("returns multi-status when only some bracket imports succeed", async () => {
    matchesContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
      const matchId = getQueryParameterValue(spec.parameters, "@id");
      return createFetchAllResult(
        matchId === "match-1"
          ? [
              {
                id: "match-1",
                category: "MS",
                seasonId: "2027",
                round: 1,
                position: 0,
                status: "scheduled",
                sets: [],
                createdAt: "2027-06-01T00:00:00.000Z",
                updatedAt: "2027-06-01T00:00:00.000Z",
              },
            ]
          : []
      );
    });

    const response = await importBracket(
      createNextRequest("http://localhost/api/admin/import/bracket", {
        season: "2027",
        updates: [
          {
            id: "match-1",
            category: "MS",
            winnerId: "alice",
            winnerName: "Alice",
          },
          {
            id: "match-2",
            category: "MS",
            winnerId: "bob",
            winnerName: "Bob",
          },
        ],
      })
    );

    expect(response.status).toBe(207);
    expect(updateMatchWithAdvancement).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({
      results: [{ id: "match-1", status: "updated" }],
      errors: [{ id: "match-2", error: "Match not found" }],
      updated: 1,
      failed: 1,
    });
  });

  it("exports only registered users scoped to the selected season", async () => {
    usersContainer.pointRead.mockImplementation((userId: string) =>
      Promise.resolve({
        resource:
          userId === "alice"
            ? {
                id: "alice",
                alias: "alice",
                name: "Alice",
                email: "alice@microsoft.com",
                phoneNumber: "12345",
                tShirtSize: "M",
              }
            : {
                id: "bob",
                alias: "bob",
                name: "Bob",
                email: "bob@microsoft.com",
                phoneNumber: "67890",
                tShirtSize: "L",
              },
      })
    );
    registrationsContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
      const seasonId = getQueryParameterValue(spec.parameters, "@seasonId");
      return createFetchAllResult(
        seasonId === "2026"
          ? [
              {
                id: "alice_MS_2026",
                userId: "alice",
                userName: "Alice",
                category: "MS",
                status: "confirmed",
                seasonId: "2026",
                createdAt: "2026-06-01T00:00:00.000Z",
                updatedAt: "2026-06-01T00:00:00.000Z",
              },
            ]
          : [
              {
                id: "alice_MD_2027",
                userId: "alice",
                userName: "Alice",
                category: "MD",
                status: "confirmed",
                seasonId: "2027",
                createdAt: "2027-06-01T00:00:00.000Z",
                updatedAt: "2027-06-01T00:00:00.000Z",
              },
            ]
      );
    });

    const response = await exportPlayers(
      createNextRequest("http://localhost/api/admin/export?season=2026")
    );

    expect(response.status).toBe(200);
    expect(registrationsContainer.query.mock.calls[0]?.[0]?.parameters).toEqual([
      { name: "@seasonId", value: "2026" },
    ]);

    const csv = await response.text();
    expect(csv).toContain("Alias,Name,Email,Phone,T-Shirt Size,Registered Events");
    expect(csv).toContain("alice,Alice,alice@microsoft.com,12345,M,MS");
    expect(csv).not.toContain("bob,Bob,bob@microsoft.com,67890,L,");
    expect(csv).not.toContain("MD");
  });
});
