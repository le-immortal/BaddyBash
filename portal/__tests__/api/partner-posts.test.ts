import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, PATCH } from "@/app/api/partner-posts/[id]/route";
import { GET, POST } from "@/app/api/partner-posts/route";
import { getPartnerPostsContainer, getUsersContainer } from "@/app/lib/cosmosClient";
import { makePartnerPostId, type PartnerPostDocument, type UserDocument } from "@/app/lib/models";
import { getActiveSeason, getSeasonSettings } from "@/app/lib/settings";
import { getPlayerAllCategoriesTournamentHistory } from "@/app/lib/playerHistory";
import { auth } from "@/auth";

import { createFetchAllResult, createMockContainer, createNextRequest, getQueryParameterValue } from "../helpers/testUtils";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
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
    getPartnerPostsContainer: vi.fn(),
    getUsersContainer: vi.fn(),
  };
});

vi.mock("@/app/lib/playerHistory", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/playerHistory")>("@/app/lib/playerHistory");
  return {
    ...actual,
    getPlayerAllCategoriesTournamentHistory: vi.fn().mockResolvedValue([]),
  };
});

describe("partner board posts", () => {
  const usersContainer = createMockContainer();
  const partnerPostsContainer = createMockContainer();
  const alice: UserDocument = {
    id: "alice",
    alias: "alice",
    name: "Alice Archer",
    email: "alice@microsoft.com",
    avatar: "https://example.com/alice.png",
    phoneNumber: "111-1111",
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
  };
  const bob: UserDocument = {
    id: "bob",
    alias: "bob",
    name: "Bob Blocker",
    email: "bob@microsoft.com",
    phoneNumber: "222-2222",
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
  };
  const alicePost: PartnerPostDocument = {
    id: "alice_MD_2027",
    userId: "alice",
    displayName: "Alice Archer",
    avatar: "https://example.com/alice.png",
    alias: "alice",
    category: "MD",
    skillLevel: "intermediate",
    status: "open",
    seasonId: "2027",
    seasonCategory: "2027#MD",
    createdAt: "2027-06-01T00:00:00.000Z",
    updatedAt: "2027-06-01T00:00:00.000Z",
  };
  const bobPost: PartnerPostDocument = {
    id: "bob_XD_2027",
    userId: "bob",
    displayName: "Bob Blocker",
    alias: "bob",
    category: "XD",
    skillLevel: "advanced",
    status: "open",
    seasonId: "2027",
    seasonCategory: "2027#XD",
    createdAt: "2027-06-02T00:00:00.000Z",
    updatedAt: "2027-06-02T00:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usersContainer.query.mockReset();
    partnerPostsContainer.query.mockReset();
    partnerPostsContainer.upsert.mockReset();
    partnerPostsContainer.pointRead.mockReset();
    partnerPostsContainer.pointDelete.mockReset();
    partnerPostsContainer.pointReplace.mockReset();

    vi.mocked(auth).mockResolvedValue({
      user: {
        email: "alice@microsoft.com",
        isAdmin: false,
      },
    } as never);
    vi.mocked(getUsersContainer).mockReturnValue(usersContainer.container as never);
    vi.mocked(getPartnerPostsContainer).mockReturnValue(partnerPostsContainer.container as never);
    vi.mocked(getActiveSeason).mockResolvedValue("2027");
    vi.mocked(getSeasonSettings).mockResolvedValue({
      id: "2027",
      label: "Baddy Bash 2027",
      registrationOpen: true,
      bracketsVisible: false,
      archived: false,
    });
    usersContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
      const email = getQueryParameterValue(spec.parameters, "@email");
      const user = email === "bob@microsoft.com" ? bob : alice;
      return createFetchAllResult([user]);
    });
    partnerPostsContainer.pointRead.mockResolvedValue({ resource: alicePost });
    partnerPostsContainer.upsert.mockImplementation((document: PartnerPostDocument) => Promise.resolve({ resource: document }));
    partnerPostsContainer.pointReplace.mockImplementation((_id: string, _partitionKey: string, document: PartnerPostDocument) =>
      Promise.resolve({ resource: document })
    );
    partnerPostsContainer.pointDelete.mockResolvedValue({});
    vi.mocked(getPlayerAllCategoriesTournamentHistory).mockResolvedValue([]);
  });

  it.each([
    ["singles category", { category: "MS", skillLevel: "beginner" }, "category must be one of MD, WD, XD"],
    ["invalid skillLevel", { category: "MD", skillLevel: "expert" }, "skillLevel must be beginner, intermediate, or advanced"],
  ])("rejects POST with %s", async (_caseName, body, error) => {
    const response = await POST(createNextRequest("http://localhost/api/partner-posts", body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(partnerPostsContainer.upsert).not.toHaveBeenCalled();
  });

  it("requires auth for POST", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await POST(
      createNextRequest("http://localhost/api/partner-posts", {
        category: "MD",
        skillLevel: "beginner",
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(partnerPostsContainer.upsert).not.toHaveBeenCalled();
  });

  it("rejects POST writes when the active season is archived", async () => {
    vi.mocked(getActiveSeason).mockResolvedValue("2026");
    vi.mocked(getSeasonSettings).mockResolvedValue({
      id: "2026",
      label: "Baddy Bash 2026",
      registrationOpen: false,
      bracketsVisible: true,
      archived: true,
    });

    const response = await POST(
      createNextRequest("http://localhost/api/partner-posts", {
        category: "MD",
        skillLevel: "beginner",
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "This season is archived. No changes allowed.",
    });
    expect(partnerPostsContainer.upsert).not.toHaveBeenCalled();
  });

  it("returns 409 when an open partner post already exists for the category and season", async () => {
    partnerPostsContainer.pointRead.mockResolvedValueOnce({ resource: alicePost });

    const response = await POST(
      createNextRequest("http://localhost/api/partner-posts", {
        category: "MD",
        skillLevel: "advanced",
      })
    );

    expect(response.status).toBe(409);
    expect(partnerPostsContainer.item).toHaveBeenCalledWith(makePartnerPostId("alice", "MD", "2027"), "2027#MD");
    expect(partnerPostsContainer.upsert).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      error: "You already have an open post in this category. Close it before posting again.",
    });
  });

  it("re-opens a closed partner post with the deterministic id", async () => {
    const closedPost: PartnerPostDocument = {
      ...alicePost,
      status: "closed",
      updatedAt: "2027-06-03T00:00:00.000Z",
    };
    partnerPostsContainer.pointRead.mockResolvedValueOnce({ resource: closedPost });

    const response = await POST(
      createNextRequest("http://localhost/api/partner-posts", {
        category: "MD",
        skillLevel: "advanced",
      })
    );

    expect(response.status).toBe(200);
    expect(partnerPostsContainer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "alice_MD_2027",
        status: "open",
        skillLevel: "advanced",
        createdAt: closedPost.createdAt,
      })
    );
    expect(await response.json()).toEqual({
      seasonId: "2027",
      post: expect.objectContaining({
        id: "alice_MD_2027",
        status: "open",
        skillLevel: "advanced",
        isOwner: true,
      }),
    });
  });

  it("sets server-controlled fields when creating with the deterministic id", async () => {
    partnerPostsContainer.pointRead.mockRejectedValueOnce({ code: 404 });

    const response = await POST(
      createNextRequest("http://localhost/api/partner-posts", {
        category: "MD",
        skillLevel: "advanced",
        alias: "mallory",
        contactPreference: "client-supplied contact must be ignored",
        userId: "mallory",
        displayName: "Mallory",
        status: "closed",
        seasonId: "2026",
        seasonCategory: "2026#MD",
      })
    );

    expect(response.status).toBe(201);
    expect(partnerPostsContainer.item).toHaveBeenCalledWith(makePartnerPostId("alice", "MD", "2027"), "2027#MD");
    expect(partnerPostsContainer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "alice_MD_2027",
        userId: "alice",
        displayName: "Alice Archer",
        avatar: "https://example.com/alice.png",
        alias: "alice",
        category: "MD",
        skillLevel: "advanced",
        status: "open",
        seasonId: "2027",
        seasonCategory: "2027#MD",
      })
    );
    const savedPost = partnerPostsContainer.upsert.mock.calls[0]?.[0] as PartnerPostDocument & Record<string, unknown>;
    expect(savedPost.alias).toBe("alice");
    expect(savedPost.contactPreference).toBeUndefined();
    expect(await response.json()).toEqual({
      seasonId: "2027",
      post: expect.objectContaining({
        id: "alice_MD_2027",
        displayName: "Alice Archer",
        alias: "alice",
        status: "open",
        isOwner: true,
      }),
    });
  });

  it("GET returns only open active-season posts by default and sanitizes the response", async () => {
    partnerPostsContainer.query.mockImplementation((spec: { parameters?: Array<{ name: string; value: unknown }> }) => {
      expect(getQueryParameterValue(spec.parameters, "@seasonId")).toBe("2027");
      expect(getQueryParameterValue(spec.parameters, "@status")).toBe("open");
      return createFetchAllResult([
        {
          ...alicePost,
          email: "alice@microsoft.com",
          phoneNumber: "111-1111",
          _rid: "cosmos-rid-1",
          _etag: "cosmos-etag-1",
        },
        {
          ...bobPost,
          email: "bob@microsoft.com",
          phoneNumber: "222-2222",
          _rid: "cosmos-rid-2",
          _etag: "cosmos-etag-2",
        },
      ]);
    });

    const response = await GET(createNextRequest("http://localhost/api/partner-posts"));

    expect(response.status).toBe(200);
    expect(getActiveSeason).toHaveBeenCalledTimes(1);
    expect(partnerPostsContainer.query.mock.calls[0]?.[0]?.query).toContain("c.status = @status");
    expect(await response.json()).toEqual({
      seasonId: "2027",
      posts: [
        {
          id: "alice_MD_2027",
          displayName: "Alice Archer",
          avatar: "https://example.com/alice.png",
          category: "MD",
          skillLevel: "intermediate",
          alias: "alice",
          status: "open",
          createdAt: "2027-06-01T00:00:00.000Z",
          isOwner: true,
          history: [],
        },
        {
          id: "bob_XD_2027",
          displayName: "Bob Blocker",
          category: "XD",
          skillLevel: "advanced",
          alias: "bob",
          status: "open",
          createdAt: "2027-06-02T00:00:00.000Z",
          isOwner: false,
          history: [],
        },
      ],
    });
  });

  it("GET returns an empty list when the partner_posts container is missing", async () => {
    partnerPostsContainer.query.mockReturnValue({
      fetchAll: vi.fn().mockRejectedValue({ code: 404, substatus: 0 }),
    });

    const response = await GET(createNextRequest("http://localhost/api/partner-posts"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      seasonId: "2027",
      posts: [],
    });
  });

  it("GET folds each poster's tournament history into the list so the client needs no extra per-post call", async () => {
    vi.mocked(getPlayerAllCategoriesTournamentHistory).mockImplementation(async (userId: string) =>
      userId === "alice"
        ? [{ seasonId: "2026", category: "MD", stage: "Champion" }]
        : []
    );

    partnerPostsContainer.query.mockReturnValue(
      createFetchAllResult([alicePost, bobPost])
    );

    const response = await GET(createNextRequest("http://localhost/api/partner-posts"));

    expect(response.status).toBe(200);
    // One history resolution per post — no N+1 fan-out from the client.
    expect(getPlayerAllCategoriesTournamentHistory).toHaveBeenCalledTimes(2);
    expect(getPlayerAllCategoriesTournamentHistory).toHaveBeenCalledWith("alice");
    expect(getPlayerAllCategoriesTournamentHistory).toHaveBeenCalledWith("bob");

    const body = await response.json();
    expect(body.posts[0]).toMatchObject({
      id: "alice_MD_2027",
      history: [{ seasonId: "2026", category: "MD", stage: "Champion" }],
    });
    expect(body.posts[1]).toMatchObject({ id: "bob_XD_2027", history: [] });
  });

  it("GET still returns the post (with empty history) when a history lookup fails", async () => {
    vi.mocked(getPlayerAllCategoriesTournamentHistory).mockRejectedValue(new Error("matches unavailable"));
    partnerPostsContainer.query.mockReturnValue(createFetchAllResult([alicePost]));

    const response = await GET(createNextRequest("http://localhost/api/partner-posts"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.posts[0]).toMatchObject({ id: "alice_MD_2027", history: [] });
  });

  it("returns 403 when a non-owner non-admin patches another user's post", async () => {
    partnerPostsContainer.pointRead.mockResolvedValue({ resource: bobPost });

    const response = await PATCH(
      createNextRequest("http://localhost/api/partner-posts/bob_XD_2027", { status: "closed" }),
      { params: Promise.resolve({ id: "bob_XD_2027" }) }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden: you can only modify your own partner posts",
    });
    expect(partnerPostsContainer.pointReplace).not.toHaveBeenCalled();
  });

  it.each([
    [
      "archived old season",
      {
        ...alicePost,
        id: "alice_MD_2026",
        seasonId: "2026",
        seasonCategory: "2026#MD",
      },
    ],
    [
      "future non-archived season",
      {
        ...alicePost,
        id: "alice_MD_2028",
        seasonId: "2028",
        seasonCategory: "2028#MD",
      },
    ],
  ])("rejects PATCH when the post belongs to a non-active season (%s)", async (_caseName, post) => {
    vi.mocked(getSeasonSettings).mockImplementation(async (seasonId = "2027") => ({
      id: seasonId,
      label: `Baddy Bash ${seasonId}`,
      registrationOpen: true,
      bracketsVisible: false,
      archived: seasonId === "2026",
    }));
    partnerPostsContainer.pointRead.mockResolvedValue({ resource: post });

    const response = await PATCH(
      createNextRequest(`http://localhost/api/partner-posts/${post.id}`, { status: "closed" }),
      { params: Promise.resolve({ id: post.id }) }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Partner posts can only be modified for the active season",
    });
    expect(getActiveSeason).toHaveBeenCalledTimes(1);
    expect(getSeasonSettings).not.toHaveBeenCalled();
    expect(partnerPostsContainer.pointReplace).not.toHaveBeenCalled();
  });

  it("lets the owner patch a post", async () => {
    const response = await PATCH(
      createNextRequest("http://localhost/api/partner-posts/alice_MD_2027", {
        status: "closed",
        skillLevel: "advanced",
        contactPreference: "ignored update",
      }),
      { params: Promise.resolve({ id: "alice_MD_2027" }) }
    );

    expect(response.status).toBe(200);
    expect(partnerPostsContainer.pointReplace).toHaveBeenCalledWith(
      "alice_MD_2027",
      "2027#MD",
      expect.objectContaining({
        userId: "alice",
        status: "closed",
        skillLevel: "advanced",
        alias: "alice",
      })
    );
    expect(await response.json()).toEqual({
      seasonId: "2027",
      post: expect.objectContaining({
        id: "alice_MD_2027",
        status: "closed",
        skillLevel: "advanced",
        alias: "alice",
        isOwner: true,
      }),
    });
  });

  it("lets an admin patch another user's active-season post", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        email: "alice@microsoft.com",
        isAdmin: true,
      },
    } as never);
    partnerPostsContainer.pointRead.mockResolvedValue({ resource: bobPost });

    const response = await PATCH(
      createNextRequest("http://localhost/api/partner-posts/bob_XD_2027", { status: "closed" }),
      { params: Promise.resolve({ id: "bob_XD_2027" }) }
    );

    expect(response.status).toBe(200);
    expect(partnerPostsContainer.pointReplace).toHaveBeenCalledWith(
      "bob_XD_2027",
      "2027#XD",
      expect.objectContaining({
        userId: "bob",
        status: "closed",
      })
    );
    expect(await response.json()).toEqual({
      seasonId: "2027",
      post: expect.objectContaining({
        id: "bob_XD_2027",
        status: "closed",
        isOwner: false,
      }),
    });
  });

  it("returns 403 when a non-owner non-admin deletes another user's post", async () => {
    partnerPostsContainer.pointRead.mockResolvedValue({ resource: bobPost });

    const response = await DELETE(createNextRequest("http://localhost/api/partner-posts/bob_XD_2027"), {
      params: Promise.resolve({ id: "bob_XD_2027" }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden: you can only modify your own partner posts",
    });
    expect(partnerPostsContainer.pointDelete).not.toHaveBeenCalled();
  });

  it.each([
    [
      "archived old season",
      {
        ...alicePost,
        id: "alice_MD_2026",
        seasonId: "2026",
        seasonCategory: "2026#MD",
      },
    ],
    [
      "future non-archived season",
      {
        ...alicePost,
        id: "alice_MD_2028",
        seasonId: "2028",
        seasonCategory: "2028#MD",
      },
    ],
  ])("rejects DELETE when the post belongs to a non-active season (%s)", async (_caseName, post) => {
    vi.mocked(getSeasonSettings).mockImplementation(async (seasonId = "2027") => ({
      id: seasonId,
      label: `Baddy Bash ${seasonId}`,
      registrationOpen: true,
      bracketsVisible: false,
      archived: seasonId === "2026",
    }));
    partnerPostsContainer.pointRead.mockResolvedValue({ resource: post });

    const response = await DELETE(createNextRequest(`http://localhost/api/partner-posts/${post.id}`), {
      params: Promise.resolve({ id: post.id }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Partner posts can only be modified for the active season",
    });
    expect(getActiveSeason).toHaveBeenCalledTimes(1);
    expect(getSeasonSettings).not.toHaveBeenCalled();
    expect(partnerPostsContainer.pointDelete).not.toHaveBeenCalled();
  });

  it("lets the owner delete an active-season post", async () => {
    const response = await DELETE(createNextRequest("http://localhost/api/partner-posts/alice_MD_2027"), {
      params: Promise.resolve({ id: "alice_MD_2027" }),
    });

    expect(response.status).toBe(200);
    expect(partnerPostsContainer.item).toHaveBeenLastCalledWith("alice_MD_2027", "2027#MD");
    expect(partnerPostsContainer.pointDelete).toHaveBeenCalledWith("alice_MD_2027", "2027#MD");
    expect(await response.json()).toEqual({ message: "Partner post deleted" });
  });

  it("lets an admin delete another user's post", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        email: "alice@microsoft.com",
        isAdmin: true,
      },
    } as never);
    partnerPostsContainer.pointRead.mockResolvedValue({ resource: bobPost });

    const response = await DELETE(createNextRequest("http://localhost/api/partner-posts/bob_XD_2027"), {
      params: Promise.resolve({ id: "bob_XD_2027" }),
    });

    expect(response.status).toBe(200);
    expect(partnerPostsContainer.item).toHaveBeenLastCalledWith("bob_XD_2027", "2027#XD");
    expect(partnerPostsContainer.pointDelete).toHaveBeenCalledWith("bob_XD_2027", "2027#XD");
    expect(await response.json()).toEqual({ message: "Partner post deleted" });
  });

  it("builds deterministic partner post ids", () => {
    expect(makePartnerPostId("alice", "XD", "2027")).toBe("alice_XD_2027");
  });
});
