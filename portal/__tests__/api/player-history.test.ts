import type { MatchDocument } from "@/app/lib/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as GETPartnerPostHistory } from "@/app/api/partner-posts/[id]/history/route";
import { GET } from "@/app/api/players/[userId]/tournament-history/route";
import { getPartnerPostsContainer } from "@/app/lib/cosmosClient";
import type { PartnerPostDocument } from "@/app/lib/models";
import { computePlayerSeasonStage, getPlayerTournamentHistory, getPlayerAllCategoriesTournamentHistory, __clearPlayerHistoryCache } from "@/app/lib/playerHistory";
import { getTournamentMatchesContainer } from "@/app/lib/tournamentData";
import { getSeasonConfig } from "@/app/lib/settings";
import { auth } from "@/auth";

import { createFetchAllResult, createMockContainer, createNextRequest, getQueryParameterValue } from "../helpers/testUtils";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/app/lib/cosmosClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/cosmosClient")>("@/app/lib/cosmosClient");
  return {
    ...actual,
    getPartnerPostsContainer: vi.fn(),
  };
});

vi.mock("@/app/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/settings")>("@/app/lib/settings");
  return {
    ...actual,
    getSeasonConfig: vi.fn(),
  };
});

vi.mock("@/app/lib/tournamentData", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/tournamentData")>("@/app/lib/tournamentData");
  return {
    ...actual,
    getTournamentMatchesContainer: vi.fn(),
    isTournamentV2Enabled: vi.fn(() => true),
  };
});

function match(overrides: Partial<MatchDocument>): MatchDocument {
  return {
    id: overrides.id || `${overrides.seasonId || "2025"}-${overrides.round}-${overrides.position}`,
    category: overrides.category || "MD",
    seasonId: overrides.seasonId || "2025",
    round: overrides.round || 1,
    position: overrides.position || 0,
    status: overrides.status || "completed",
    sets: [],
    createdAt: "2025-06-01T00:00:00.000Z",
    updatedAt: "2025-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("season#category bracket read cache", () => {
  const matchesContainer = createMockContainer();

  function seedQuery() {
    matchesContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
      const seasonCategory = getQueryParameterValue(spec.parameters, "@seasonCategory");
      if (seasonCategory === "2025#MD") {
        return createFetchAllResult([
          match({ seasonId: "2025", round: 1, position: 0 }),
          match({ seasonId: "2025", round: 2, position: 0 }),
          match({ seasonId: "2025", round: 3, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "alice" }),
        ]);
      }
      return createFetchAllResult([
        match({ seasonId: "2024", round: 1, position: 0 }),
        match({ seasonId: "2024", round: 2, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "carol" }),
      ]);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    matchesContainer.query.mockReset();
    __clearPlayerHistoryCache();

    vi.mocked(getTournamentMatchesContainer).mockReturnValue(matchesContainer.container as never);
    vi.mocked(getSeasonConfig).mockResolvedValue({
      id: "SEASON_CONFIG",
      activeSeason: "2026",
      seasons: [
        { id: "2024", label: "Baddy Bash 2024", registrationOpen: false, bracketsVisible: true, archived: true },
        { id: "2025", label: "Baddy Bash 2025", registrationOpen: false, bracketsVisible: true, archived: true },
        { id: "2026", label: "Baddy Bash 2026", registrationOpen: true, bracketsVisible: false, archived: false },
      ],
    });
  });

  it("queries each season#category only once across different users in the same category", async () => {
    seedQuery();

    await getPlayerTournamentHistory("alice", "MD");
    await getPlayerTournamentHistory("bob", "MD");

    // 2 past seasons (2024, 2025) — one query each, shared across both users.
    expect(matchesContainer.query).toHaveBeenCalledTimes(2);
  });

  it("shares a single in-flight read across concurrent callers", async () => {
    seedQuery();

    await Promise.all([
      getPlayerTournamentHistory("alice", "MD"),
      getPlayerTournamentHistory("bob", "MD"),
      getPlayerTournamentHistory("carol", "MD"),
    ]);

    expect(matchesContainer.query).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed read — the next call retries", async () => {
    matchesContainer.query
      .mockImplementationOnce(() => ({
        fetchAll: vi.fn().mockRejectedValue(new Error("transient cosmos failure")),
      }))
      .mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
        const seasonCategory = getQueryParameterValue(spec.parameters, "@seasonCategory");
        if (seasonCategory === "2025#MD") {
          return createFetchAllResult([
            match({ seasonId: "2025", round: 3, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "alice" }),
          ]);
        }
        return createFetchAllResult([]);
      });

    await expect(getPlayerTournamentHistory("alice", "MD")).rejects.toThrow("transient cosmos failure");

    // Failed read was evicted, so a fresh attempt re-queries rather than serving the rejection.
    const history = await getPlayerTournamentHistory("alice", "MD");
    expect(history).toEqual([{ seasonId: "2025", category: "MD", stage: "Champion" }]);
  });

  it("re-queries after the cache is cleared", async () => {
    seedQuery();

    await getPlayerTournamentHistory("alice", "MD");
    expect(matchesContainer.query).toHaveBeenCalledTimes(2);

    __clearPlayerHistoryCache();

    await getPlayerTournamentHistory("alice", "MD");
    expect(matchesContainer.query).toHaveBeenCalledTimes(4);
  });

  it("caches an empty (404) bracket so a missing partition isn't re-queried", async () => {
    matchesContainer.query.mockReturnValue({
      fetchAll: vi.fn().mockRejectedValue({ code: 404 }),
    });

    await getPlayerTournamentHistory("alice", "MD");
    await getPlayerTournamentHistory("bob", "MD");

    // Both seasons resolve to [] and are cached, so only one query per season.
    expect(matchesContainer.query).toHaveBeenCalledTimes(2);
  });
});

describe("getPlayerAllCategoriesTournamentHistory", () => {
  const matchesContainer = createMockContainer();

  beforeEach(() => {
    vi.clearAllMocks();
    matchesContainer.query.mockReset();
    __clearPlayerHistoryCache();

    vi.mocked(getTournamentMatchesContainer).mockReturnValue(matchesContainer.container as never);
    vi.mocked(getSeasonConfig).mockResolvedValue({
      id: "SEASON_CONFIG",
      activeSeason: "2026",
      seasons: [
        { id: "2024", label: "Baddy Bash 2024", registrationOpen: false, bracketsVisible: true, archived: true },
        { id: "2025", label: "Baddy Bash 2025", registrationOpen: false, bracketsVisible: true, archived: true },
        { id: "2026", label: "Baddy Bash 2026", registrationOpen: true, bracketsVisible: false, archived: false },
      ],
    });
  });

  function seedMultiCategoryQuery() {
    matchesContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
      const seasonCategory = getQueryParameterValue(spec.parameters, "@seasonCategory");
      // 2025: alice plays MS (Runner-up) and MD (Champion).
      if (seasonCategory === "2025#MS") {
        return createFetchAllResult([
          match({ seasonId: "2025", category: "MS", round: 1, position: 0 }),
          match({ seasonId: "2025", category: "MS", round: 2, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "carol" }),
          match({ seasonId: "2025", category: "MS", round: 3, position: 0 }),
        ]);
      }
      if (seasonCategory === "2025#MD") {
        return createFetchAllResult([
          match({ seasonId: "2025", category: "MD", round: 1, position: 0 }),
          match({ seasonId: "2025", category: "MD", round: 2, position: 0 }),
          match({ seasonId: "2025", category: "MD", round: 3, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "alice" }),
        ]);
      }
      // 2024: alice plays XD only (Runner-up).
      if (seasonCategory === "2024#XD") {
        return createFetchAllResult([
          match({ seasonId: "2024", category: "XD", round: 1, position: 0 }),
          match({ seasonId: "2024", category: "XD", round: 2, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "carol" }),
        ]);
      }
      return createFetchAllResult([]);
    });
  }

  it("returns one entry per (season, category) with a stage, ordered recent-season-first then MS/WS/MD/WD/XD", async () => {
    seedMultiCategoryQuery();

    const history = await getPlayerAllCategoriesTournamentHistory("alice");

    expect(history).toEqual([
      { seasonId: "2025", category: "MS", stage: "Semifinalist" },
      { seasonId: "2025", category: "MD", stage: "Champion" },
      { seasonId: "2024", category: "XD", stage: "Runner-up" },
    ]);
  });

  it("omits categories with no participation", async () => {
    seedMultiCategoryQuery();

    const history = await getPlayerAllCategoriesTournamentHistory("alice");

    // No WS / WD entries, and 2024 only has XD.
    expect(history.some((entry) => entry.category === "WS")).toBe(false);
    expect(history.some((entry) => entry.category === "WD")).toBe(false);
    expect(history.filter((entry) => entry.seasonId === "2024")).toEqual([
      { seasonId: "2024", category: "XD", stage: "Runner-up" },
    ]);
  });

  it("queries each season#category at most once even when multiple posters request all-categories history", async () => {
    seedMultiCategoryQuery();

    await getPlayerAllCategoriesTournamentHistory("alice");
    await getPlayerAllCategoriesTournamentHistory("bob");

    // 2 past seasons × 5 categories = 10 distinct partitions, each read once and shared.
    expect(matchesContainer.query).toHaveBeenCalledTimes(10);
  });

  it("shares a single in-flight read across concurrent all-categories callers", async () => {
    seedMultiCategoryQuery();

    await Promise.all([
      getPlayerAllCategoriesTournamentHistory("alice"),
      getPlayerAllCategoriesTournamentHistory("bob"),
      getPlayerAllCategoriesTournamentHistory("carol"),
    ]);

    expect(matchesContainer.query).toHaveBeenCalledTimes(10);
  });
});

describe("player tournament history stage computation", () => {
  it("labels a final winner as Champion", () => {
    expect(
      computePlayerSeasonStage(
        [
          match({ round: 1, position: 0 }),
          match({ round: 2, position: 0 }),
          match({ round: 3, position: 0, player1Id: "alice|bob", player2Id: "carol|dan", winnerId: "alice|bob" }),
        ],
        "alice"
      )
    ).toBe("Champion");
  });

  it("labels a final loser as Runner-up", () => {
    expect(
      computePlayerSeasonStage(
        [
          match({ round: 1, position: 0 }),
          match({ round: 2, position: 0 }),
          match({ round: 3, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "carol" }),
        ],
        "alice"
      )
    ).toBe("Runner-up");
  });

  it("labels a semifinal exit as Semifinalist", () => {
    expect(
      computePlayerSeasonStage(
        [
          match({ round: 1, position: 0 }),
          match({ round: 2, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "carol" }),
          match({ round: 3, position: 0 }),
        ],
        "alice"
      )
    ).toBe("Semifinalist");
  });

  it("labels a quarterfinal exit as Quarterfinalist", () => {
    expect(
      computePlayerSeasonStage(
        [
          match({ round: 1, position: 0 }),
          match({ round: 2, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "carol" }),
          match({ round: 3, position: 0 }),
          match({ round: 4, position: 0 }),
        ],
        "alice"
      )
    ).toBe("Quarterfinalist");
  });

  it("labels earlier exits as Round of N", () => {
    expect(
      computePlayerSeasonStage(
        [
          match({ round: 1, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "carol" }),
          match({ round: 2, position: 0 }),
          match({ round: 3, position: 0 }),
          match({ round: 4, position: 0 }),
        ],
        "alice"
      )
    ).toBe("Round of 16");
  });

  it("skips seasons with no completed player results", () => {
    expect(
      computePlayerSeasonStage(
        [
          match({ round: 1, status: "bye", player1Id: "alice", winnerId: "alice" }),
          match({ round: 2, status: "scheduled", player1Id: "alice", winnerId: undefined }),
        ],
        "alice"
      )
    ).toBeNull();
  });
});

describe("GET /api/players/[userId]/tournament-history", () => {
  const matchesContainer = createMockContainer();

  beforeEach(() => {
    vi.clearAllMocks();
    matchesContainer.query.mockReset();
    __clearPlayerHistoryCache();

    vi.mocked(auth).mockResolvedValue({ user: { email: "viewer@microsoft.com" } } as never);
    vi.mocked(getTournamentMatchesContainer).mockReturnValue(matchesContainer.container as never);
    vi.mocked(getSeasonConfig).mockResolvedValue({
      id: "SEASON_CONFIG",
      activeSeason: "2026",
      seasons: [
        { id: "2024", label: "Baddy Bash 2024", registrationOpen: false, bracketsVisible: true, archived: true },
        { id: "2025", label: "Baddy Bash 2025", registrationOpen: false, bracketsVisible: true, archived: true },
        { id: "2026", label: "Baddy Bash 2026", registrationOpen: true, bracketsVisible: false, archived: false },
      ],
    });

  });

  it("rejects invalid categories", async () => {
    const response = await GET(
      createNextRequest("http://localhost/api/players/alice/tournament-history?category=MS"),
      { params: Promise.resolve({ userId: "alice" }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "category must be one of MD, WD, XD" });
  });

  it("requires authentication", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await GET(
      createNextRequest("http://localhost/api/players/alice/tournament-history?category=MD"),
      { params: Promise.resolve({ userId: "alice" }) }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns sorted history for past seasons", async () => {
    matchesContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
      const seasonCategory = getQueryParameterValue(spec.parameters, "@seasonCategory");
      if (seasonCategory === "2025#MD") {
        return createFetchAllResult([
          match({ seasonId: "2025", round: 1, position: 0 }),
          match({ seasonId: "2025", round: 2, position: 0 }),
          match({ seasonId: "2025", round: 3, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "carol" }),
        ]);
      }
      return createFetchAllResult([
        match({ seasonId: "2024", round: 1, position: 0 }),
        match({ seasonId: "2024", round: 2, position: 0, player1Id: "alice", player2Id: "carol", winnerId: "alice" }),
      ]);
    });

    const response = await GET(
      createNextRequest("http://localhost/api/players/alice/tournament-history?category=MD"),
      { params: Promise.resolve({ userId: "alice" }) }
    );

    expect(response.status).toBe(200);
    expect(matchesContainer.query).toHaveBeenCalledTimes(2);
    expect(await response.json()).toEqual({
      userId: "alice",
      category: "MD",
      history: [
        { seasonId: "2025", category: "MD", stage: "Runner-up" },
        { seasonId: "2024", category: "MD", stage: "Champion" },
      ],
    });
  });

  describe("GET /api/partner-posts/[id]/history", () => {
    const partnerPostsContainer = createMockContainer();
    const matchesContainer = createMockContainer();
    const alicePost: PartnerPostDocument = {
      id: "alice_MD_2026",
      userId: "alice",
      displayName: "Alice Archer",
      alias: "alice",
      category: "MD",
      skillLevel: "intermediate",
      status: "open",
      seasonId: "2026",
      seasonCategory: "2026#MD",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };

    beforeEach(() => {
      vi.clearAllMocks();
      partnerPostsContainer.pointRead.mockReset();
      matchesContainer.query.mockReset();
      __clearPlayerHistoryCache();

      vi.mocked(auth).mockResolvedValue({ user: { email: "viewer@microsoft.com" } } as never);
      vi.mocked(getPartnerPostsContainer).mockReturnValue(partnerPostsContainer.container as never);
      vi.mocked(getTournamentMatchesContainer).mockReturnValue(matchesContainer.container as never);
      vi.mocked(getSeasonConfig).mockResolvedValue({
        id: "SEASON_CONFIG",
        activeSeason: "2026",
        seasons: [
          { id: "2024", label: "Baddy Bash 2024", registrationOpen: false, bracketsVisible: true, archived: true },
          { id: "2025", label: "Baddy Bash 2025", registrationOpen: false, bracketsVisible: true, archived: true },
          { id: "2026", label: "Baddy Bash 2026", registrationOpen: true, bracketsVisible: false, archived: false },
        ],
      });
      partnerPostsContainer.pointRead.mockResolvedValue({ resource: alicePost });
    });

    it("requires authentication", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const response = await GETPartnerPostHistory(
        createNextRequest("http://localhost/api/partner-posts/alice_MD_2026/history"),
        { params: Promise.resolve({ id: "alice_MD_2026" }) }
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
      expect(partnerPostsContainer.pointRead).not.toHaveBeenCalled();
    });

    it("returns 404 when the partner post is not found", async () => {
      partnerPostsContainer.pointRead.mockRejectedValue({ code: 404 });

      const response = await GETPartnerPostHistory(
        createNextRequest("http://localhost/api/partner-posts/alice_MD_2026/history"),
        { params: Promise.resolve({ id: "alice_MD_2026" }) }
      );

      expect(response.status).toBe(404);
      expect(partnerPostsContainer.item).toHaveBeenCalledWith("alice_MD_2026", "2026#MD");
      expect(await response.json()).toEqual({ error: "Partner post not found" });
    });

    it("returns the post author's all-categories history without exposing userId", async () => {
      matchesContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
        const seasonCategory = getQueryParameterValue(spec.parameters, "@seasonCategory");
        if (seasonCategory === "2025#MD") {
          return createFetchAllResult([
            match({ seasonId: "2025", category: "MD", round: 1, position: 0 }),
            match({ seasonId: "2025", category: "MD", round: 2, position: 0 }),
            match({
              seasonId: "2025",
              category: "MD",
              round: 3,
              position: 0,
              player1Id: "alice",
              player2Id: "carol",
              winnerId: "alice",
            }),
          ]);
        }
        if (seasonCategory === "2025#MS") {
          return createFetchAllResult([
            match({ seasonId: "2025", category: "MS", round: 1, position: 0 }),
            match({
              seasonId: "2025",
              category: "MS",
              round: 2,
              position: 0,
              player1Id: "alice",
              player2Id: "carol",
              winnerId: "carol",
            }),
            match({ seasonId: "2025", category: "MS", round: 3, position: 0 }),
          ]);
        }
        if (seasonCategory === "2024#XD") {
          return createFetchAllResult([
            match({ seasonId: "2024", category: "XD", round: 1, position: 0 }),
            match({
              seasonId: "2024",
              category: "XD",
              round: 2,
              position: 0,
              player1Id: "alice",
              player2Id: "carol",
              winnerId: "carol",
            }),
          ]);
        }
        return createFetchAllResult([]);
      });

      const response = await GETPartnerPostHistory(
        createNextRequest("http://localhost/api/partner-posts/alice_MD_2026/history"),
        { params: Promise.resolve({ id: "alice_MD_2026" }) }
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(partnerPostsContainer.item).toHaveBeenCalledWith("alice_MD_2026", "2026#MD");
      // 2 past seasons × 5 categories = 10 bracket reads.
      expect(matchesContainer.query).toHaveBeenCalledTimes(10);
      expect(body).toEqual({
        category: "MD",
        history: [
          { seasonId: "2025", category: "MS", stage: "Semifinalist" },
          { seasonId: "2025", category: "MD", stage: "Champion" },
          { seasonId: "2024", category: "XD", stage: "Runner-up" },
        ],
      });
      expect(JSON.stringify(body)).not.toContain("userId");
    });

    it("returns empty history without exposing userId when match data is unavailable", async () => {
      matchesContainer.query.mockReturnValue({
        fetchAll: vi.fn().mockRejectedValue({ code: 404 }),
      });

      const response = await GETPartnerPostHistory(
        createNextRequest("http://localhost/api/partner-posts/alice_MD_2026/history"),
        { params: Promise.resolve({ id: "alice_MD_2026" }) }
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ category: "MD", history: [] });
      expect(JSON.stringify(body)).not.toContain("userId");
    });
  });

  it("returns empty history when match data is unavailable", async () => {
    matchesContainer.query.mockReturnValue({
      fetchAll: vi.fn().mockRejectedValue({ code: 404 }),
    });

    const response = await GET(
      createNextRequest("http://localhost/api/players/alice/tournament-history?category=XD"),
      { params: Promise.resolve({ userId: "alice" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "alice",
      category: "XD",
      history: [],
    });
  });
});
