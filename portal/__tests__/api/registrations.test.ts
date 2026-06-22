import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, POST } from "@/app/api/registrations/route";
import { auth } from "@/auth";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { getActiveSeason, getGlobalSettings, getSeasonSettings } from "@/app/lib/settings";
import { getTournamentRegistrationsContainer } from "@/app/lib/tournamentData";

import { createFetchAllResult, createMockContainer, createNextRequest, getQueryParameterValue } from "../helpers/testUtils";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/app/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/settings")>("@/app/lib/settings");
  return {
    ...actual,
    getActiveSeason: vi.fn(),
    getGlobalSettings: vi.fn(),
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
    getTournamentRegistrationsContainer: vi.fn(),
  };
});

describe("registration season guards", () => {
  const usersContainer = createMockContainer();
  const registrationsContainer = createMockContainer();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(auth).mockResolvedValue({
      user: {
        email: "alice@microsoft.com",
        isAdmin: false,
      },
    } as never);
    vi.mocked(getUsersContainer).mockReturnValue(usersContainer.container as never);
    vi.mocked(getTournamentRegistrationsContainer).mockReturnValue(registrationsContainer.container as never);
    vi.mocked(getActiveSeason).mockResolvedValue("2027");
    vi.mocked(getSeasonSettings).mockResolvedValue({
      id: "2027",
      label: "Baddy Bash 2027",
      registrationOpen: true,
      bracketsVisible: false,
      archived: false,
    });
    vi.mocked(getGlobalSettings).mockResolvedValue({
      id: "CONFIG_GLOBAL",
      registrationOpen: true,
      bracketsVisible: true,
    });
  });

  it("rejects registration writes when the active season is archived", async () => {
    vi.mocked(getActiveSeason).mockResolvedValue("2026");
    vi.mocked(getSeasonSettings).mockResolvedValue({
      id: "2026",
      label: "Baddy Bash 2026",
      registrationOpen: false,
      bracketsVisible: true,
      archived: true,
    });

    const response = await POST(
      createNextRequest("http://localhost/api/registrations", {
        userId: "alice",
        userName: "Alice",
        category: "MS",
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "This season is archived. No changes allowed.",
    });
    expect(registrationsContainer.query).not.toHaveBeenCalled();
  });

  it("rejects registration writes for non-active seasons", async () => {
    const response = await POST(
      createNextRequest("http://localhost/api/registrations", {
        userId: "alice",
        userName: "Alice",
        category: "MS",
        season: "2026",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Registrations can only be created for the active season",
    });
    expect(usersContainer.query).not.toHaveBeenCalled();
    expect(registrationsContainer.query).not.toHaveBeenCalled();
  });

  it("defaults registration reads to the active season", async () => {
    usersContainer.query.mockReturnValue(
      createFetchAllResult([
        {
          id: "alice",
        },
      ])
    );
    registrationsContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) =>
      createFetchAllResult([
        {
          id: "alice_MS_2027",
          userId: "alice",
          category: "MS",
          seasonId: getQueryParameterValue(spec.parameters, "@seasonId"),
          status: "confirmed",
        },
      ])
    );

    const response = await GET(
      createNextRequest("http://localhost/api/registrations?userId=alice")
    );

    expect(response.status).toBe(200);
    expect(getActiveSeason).toHaveBeenCalledTimes(1);
    expect(registrationsContainer.query.mock.calls[0]?.[0]?.parameters).toEqual([
      { name: "@userId", value: "alice" },
      { name: "@seasonId", value: "2027" },
    ]);
    expect(await response.json()).toEqual([
      expect.objectContaining({
        seasonId: "2027",
      }),
    ]);
  });

  it("only attempts withdrawals against the active-season registration", async () => {
    usersContainer.query.mockReturnValue(
      createFetchAllResult([
        {
          id: "alice",
          email: "alice@microsoft.com",
        },
      ])
    );
    registrationsContainer.pointRead.mockRejectedValue({ code: 404 });

    const response = await DELETE(
      createNextRequest("http://localhost/api/registrations?userId=alice&category=MS")
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Registration not found",
    });
    expect(registrationsContainer.item).toHaveBeenCalledWith("alice_MS_2027", "2027#MS");
    expect(registrationsContainer.item).not.toHaveBeenCalledWith("alice_MS_2026", "2026#MS");
    expect(registrationsContainer.pointDelete).not.toHaveBeenCalled();
  });

  it("rejects player withdrawals for non-active seasons", async () => {
    usersContainer.query.mockReturnValue(
      createFetchAllResult([
        {
          id: "alice",
          email: "alice@microsoft.com",
        },
      ])
    );

    const response = await DELETE(
      createNextRequest("http://localhost/api/registrations?userId=alice&category=MS&season=2026")
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Players can only withdraw from the active season",
    });
    expect(registrationsContainer.item).not.toHaveBeenCalled();
  });

  it("lets admins target an explicit season for withdrawals", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        email: "admin@microsoft.com",
        isAdmin: true,
      },
    } as never);
    registrationsContainer.pointRead.mockRejectedValue({ code: 404 });

    const response = await DELETE(
      createNextRequest("http://localhost/api/registrations?userId=alice&category=MS&season=2026")
    );

    expect(response.status).toBe(404);
    expect(registrationsContainer.item).toHaveBeenCalledWith("alice_MS_2026", "2026#MS");
  });
});
