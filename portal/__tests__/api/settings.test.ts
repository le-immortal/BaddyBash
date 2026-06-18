import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/authHelpers", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/app/lib/settings", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/settings")>("@/app/lib/settings");
  return {
    ...actual,
    getSeasonConfig: vi.fn(),
    getGlobalSettings: vi.fn(),
    updateGlobalSettings: vi.fn(),
    updateSeasonConfig: vi.fn(),
    createNewSeason: vi.fn(),
  };
});

import { GET } from "@/app/api/settings/route";
import { getSeasonConfig } from "@/app/lib/settings";

describe("GET /api/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a public season config without Cosmos metadata fields", async () => {
    vi.mocked(getSeasonConfig).mockResolvedValue({
      id: "SEASON_CONFIG",
      activeSeason: "2027",
      seasons: [
        {
          id: "2026",
          label: "Baddy Bash 2026",
          registrationOpen: false,
          bracketsVisible: true,
          archived: true,
          _rid: "season-rid",
          _self: "season-self",
          _etag: "season-etag",
          _ts: 123,
          _attachments: "season-attachments",
        },
        {
          id: "2027",
          label: "Baddy Bash 2027",
          registrationOpen: true,
          bracketsVisible: false,
          archived: false,
        },
      ],
      updatedAt: "2026-06-18T05:00:00.000Z",
      _rid: "root-rid",
      _self: "root-self",
      _etag: "root-etag",
      _ts: 456,
      _attachments: "root-attachments",
    } as never);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/settings?full=1"),
    } as NextRequest);

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body).toEqual({
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
      updatedAt: "2026-06-18T05:00:00.000Z",
    });

    for (const field of ["_rid", "_self", "_etag", "_ts", "_attachments"]) {
      expect(body).not.toHaveProperty(field);
      for (const season of body.seasons) {
        expect(season).not.toHaveProperty(field);
      }
    }
  });
});
