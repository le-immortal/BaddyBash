import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/users/search/route";
import { auth } from "@/auth";
import { getUsersContainer } from "@/app/lib/cosmosClient";

import { createFetchAllResult, createMockContainer, createNextRequest, getQueryParameterValue } from "../helpers/testUtils";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/app/lib/cosmosClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/cosmosClient")>("@/app/lib/cosmosClient");
  return {
    ...actual,
    getUsersContainer: vi.fn(),
  };
});

describe("GET /api/users/search", () => {
  const usersContainer = createMockContainer();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { email: "alice@microsoft.com", isAdmin: false },
    } as never);
    vi.mocked(getUsersContainer).mockReturnValue(usersContainer.container as never);
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const response = await GET(createNextRequest("http://localhost/api/users/search?q=bob"));
    expect(response.status).toBe(401);
    expect(usersContainer.query).not.toHaveBeenCalled();
  });

  it("returns empty results without querying when q is shorter than 2 chars", async () => {
    const response = await GET(createNextRequest("http://localhost/api/users/search?q=b"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [] });
    expect(usersContainer.query).not.toHaveBeenCalled();
  });

  it("returns privacy-minimal results and never exposes email or phoneNumber", async () => {
    usersContainer.query.mockReturnValue(
      createFetchAllResult([
        { alias: "bob", name: "Bob Smith", email: "bob@microsoft.com" },
        { alias: "bobby", name: "bobby", email: "bobby@microsoft.com" },
      ])
    );

    const response = await GET(createNextRequest("http://localhost/api/users/search?q=bob"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      results: [
        { alias: "bob", name: "Bob Smith" },
        { alias: "bobby", name: "bobby" },
      ],
    });
    // Ensure no leaked fields
    for (const r of body.results) {
      expect(r).not.toHaveProperty("email");
      expect(r).not.toHaveProperty("phoneNumber");
    }
  });

  it("parameterizes user input, excludes self, and caps the limit at 10", async () => {
    usersContainer.query.mockReturnValue(createFetchAllResult([]));

    await GET(createNextRequest("http://localhost/api/users/search?q=Bob&limit=50"));

    const spec = usersContainer.query.mock.calls[0]?.[0];
    expect(spec.query).not.toContain("Bob");
    expect(getQueryParameterValue(spec.parameters, "@self")).toBe("alice");
    expect(getQueryParameterValue(spec.parameters, "@qLower")).toBe("bob");
    expect(getQueryParameterValue(spec.parameters, "@q")).toBe("Bob");
    expect(getQueryParameterValue(spec.parameters, "@limit")).toBe(10);
  });

  it("defaults the limit to 8 when not provided", async () => {
    usersContainer.query.mockReturnValue(createFetchAllResult([]));
    await GET(createNextRequest("http://localhost/api/users/search?q=bob"));
    const spec = usersContainer.query.mock.calls[0]?.[0];
    expect(getQueryParameterValue(spec.parameters, "@limit")).toBe(8);
  });
});
