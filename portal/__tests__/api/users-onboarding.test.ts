import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH, POST } from "@/app/api/users/route";
import { auth } from "@/auth";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { getGlobalSettings } from "@/app/lib/settings";
import type { UserDocument } from "@/app/lib/models";

import { createMockContainer, createNextRequest } from "../helpers/testUtils";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/app/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/settings")>("@/app/lib/settings");
  return {
    ...actual,
    getGlobalSettings: vi.fn(),
  };
});

vi.mock("@/app/lib/cosmosClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/cosmosClient")>("@/app/lib/cosmosClient");
  return {
    ...actual,
    getUsersContainer: vi.fn(),
  };
});

describe("/api/users profile (PATCH + POST)", () => {
  const usersContainer = createMockContainer();

  beforeEach(() => {
    vi.clearAllMocks();
    // Admin session bypasses requireOwnerOrAdmin's email→id resolution query
    vi.mocked(auth).mockResolvedValue({
      user: { email: "alice@microsoft.com", isAdmin: true },
    } as never);
    vi.mocked(getUsersContainer).mockReturnValue(usersContainer.container as never);
    vi.mocked(getGlobalSettings).mockResolvedValue({
      id: "CONFIG_GLOBAL",
      registrationOpen: true,
      bracketsVisible: true,
    } as never);
    // replace echoes back the document it was given
    usersContainer.pointReplace.mockImplementation((_id, _pk, doc) => ({ resource: doc }));
    usersContainer.upsert.mockImplementation((doc) => ({ resource: doc }));
  });

  it("PATCH updates phone/tShirt and preserves name/email/alias", async () => {
    const existing: UserDocument = {
      id: "alice",
      name: "Alice Example",
      email: "alice@microsoft.com",
      alias: "alice",
      phoneNumber: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    usersContainer.pointRead.mockResolvedValue({ resource: existing });

    const response = await PATCH(
      createNextRequest("http://localhost/api/users", {
        id: "alice",
        phoneNumber: "555-1234",
        tShirtSize: "L",
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as UserDocument;

    // Updated fields
    expect(body.phoneNumber).toBe("555-1234");
    expect(body.tShirtSize).toBe("L");

    // Preserved fields
    expect(body.name).toBe("Alice Example");
    expect(body.email).toBe("alice@microsoft.com");
    expect(body.alias).toBe("alice");
  });

  it("POST updates phone/tShirt and preserves the existing createdAt", async () => {
    const existing: UserDocument = {
      id: "alice",
      name: "Alice Example",
      email: "alice@microsoft.com",
      alias: "alice",
      phoneNumber: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    usersContainer.pointRead.mockResolvedValue({ resource: existing });

    const response = await POST(
      createNextRequest("http://localhost/api/users", {
        id: "alice",
        name: "Alice Example",
        email: "alice@microsoft.com",
        phoneNumber: "555-9999",
        tShirtSize: "M",
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as UserDocument;

    // createdAt from the original record must survive a POST save
    expect(body.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(body.phoneNumber).toBe("555-9999");
    expect(body.tShirtSize).toBe("M");
  });
});

describe("/api/users first-time onboarding (non-admin, not yet provisioned)", () => {
  const usersContainer = createMockContainer();

  beforeEach(() => {
    vi.clearAllMocks();
    // A regular user signing in for the first time. Note the MIXED-CASE email:
    // provisionUser stores emails lowercased, so any case-sensitive ownership
    // resolution would fail. The session may not match a Cosmos doc at all
    // (provisioning is skipped for dev/GitHub logins and is best-effort in prod).
    vi.mocked(auth).mockResolvedValue({
      user: { email: "Abhinav.Sharma@microsoft.com", isAdmin: false },
    } as never);
    vi.mocked(getUsersContainer).mockReturnValue(usersContainer.container as never);
    vi.mocked(getGlobalSettings).mockResolvedValue({
      id: "CONFIG_GLOBAL",
      registrationOpen: true,
      bracketsVisible: true,
    } as never);
    usersContainer.upsert.mockImplementation((doc) => ({ resource: doc }));
  });

  it("PATCH authorizes the user for their own alias even with no Cosmos doc (404, not 403)", async () => {
    // No document exists yet for this user.
    usersContainer.pointRead.mockResolvedValue({ resource: undefined });

    const response = await PATCH(
      createNextRequest("http://localhost/api/users", {
        id: "abhinav.sharma",
        phoneNumber: "555-0000",
        tShirtSize: "L",
      })
    );

    // Must NOT be forbidden — the user owns their own alias. The handler then
    // reports the doc is missing so the client can fall back to POST-create.
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(404);
  });

  it("POST lets a first-time user create their own record (mixed-case email)", async () => {
    usersContainer.pointRead.mockResolvedValue({ resource: undefined });

    const response = await POST(
      createNextRequest("http://localhost/api/users", {
        id: "abhinav.sharma",
        name: "Abhinav Sharma",
        email: "abhinav.sharma@microsoft.com",
        tShirtSize: "L",
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as UserDocument;
    expect(body.id).toBe("abhinav.sharma");
    expect(body.tShirtSize).toBe("L");
    expect(usersContainer.upsert).toHaveBeenCalledTimes(1);
  });

  it("POST forbids a non-admin from creating a record for someone else", async () => {
    usersContainer.pointRead.mockResolvedValue({ resource: undefined });

    const response = await POST(
      createNextRequest("http://localhost/api/users", {
        id: "someone.else",
        name: "Someone Else",
        email: "someone.else@microsoft.com",
        tShirtSize: "M",
      })
    );

    expect(response.status).toBe(403);
    expect(usersContainer.upsert).not.toHaveBeenCalled();
  });
});
