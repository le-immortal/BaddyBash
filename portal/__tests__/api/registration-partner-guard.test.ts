import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/registrations/route";
import { auth } from "@/auth";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { getActiveSeason, getGlobalSettings, getSeasonSettings } from "@/app/lib/settings";
import { getTournamentRegistrationsContainer } from "@/app/lib/tournamentData";

import { createFetchAllResult, createMockContainer, createNextRequest } from "../helpers/testUtils";

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

describe("doubles partner-exists guard", () => {
  const usersContainer = createMockContainer();
  const registrationsContainer = createMockContainer();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { email: "alice@microsoft.com", isAdmin: false },
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

    // Ownership check: alice owns the "alice" alias
    usersContainer.query.mockReturnValue(
      createFetchAllResult([{ id: "alice", email: "alice@microsoft.com" }])
    );
    registrationsContainer.query.mockReturnValue(createFetchAllResult([]));
    registrationsContainer.create.mockResolvedValue({ resource: { id: "alice_MD_2027" } });
    registrationsContainer.pointRead.mockRejectedValue({ code: 404 });
  });

  it("returns 400 PARTNER_NOT_FOUND when a non-admin picks an unclaimed partner", async () => {
    // Partner does not exist at all
    usersContainer.pointRead.mockRejectedValue({ code: 404 });

    const response = await POST(
      createNextRequest("http://localhost/api/registrations", {
        userId: "alice",
        userName: "Alice",
        category: "MD",
        partnerId: "bob",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "PARTNER_NOT_FOUND",
      message: "Ask your partner to sign in to BaddyBash once before you can pick them.",
    });
    // No registration and no placeholder should be created
    expect(registrationsContainer.create).not.toHaveBeenCalled();
    expect(usersContainer.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 when a non-admin picks an existing-but-placeholder partner (email '')", async () => {
    usersContainer.pointRead.mockResolvedValue({
      resource: { id: "bob", alias: "bob", name: "bob", email: "", phoneNumber: "" },
    });

    const response = await POST(
      createNextRequest("http://localhost/api/registrations", {
        userId: "alice",
        userName: "Alice",
        category: "MD",
        partnerId: "bob",
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("PARTNER_NOT_FOUND");
    expect(usersContainer.upsert).not.toHaveBeenCalled();
  });

  it("lets a non-admin register against a claimed partner without creating a placeholder", async () => {
    usersContainer.pointRead.mockResolvedValue({
      resource: { id: "bob", alias: "bob", name: "Bob Smith", email: "bob@microsoft.com", phoneNumber: "123", tShirtSize: "M" },
    });

    const response = await POST(
      createNextRequest("http://localhost/api/registrations", {
        userId: "alice",
        userName: "Alice",
        category: "MD",
        partnerId: "bob",
      })
    );

    expect(response.status).toBe(201);
    // Claimed partner → no placeholder upsert
    expect(usersContainer.upsert).not.toHaveBeenCalled();
    expect(registrationsContainer.create).toHaveBeenCalled();
  });

  it("lets an admin create a placeholder for an unclaimed partner (manual override)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: "admin@microsoft.com", isAdmin: true },
    } as never);
    usersContainer.pointRead.mockRejectedValue({ code: 404 });

    const response = await POST(
      createNextRequest("http://localhost/api/registrations", {
        userId: "alice",
        userName: "Alice",
        category: "MD",
        partnerId: "bob",
      })
    );

    expect(response.status).toBe(201);
    // Admin override → placeholder user created with empty email
    expect(usersContainer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "bob", email: "" })
    );
  });
});
