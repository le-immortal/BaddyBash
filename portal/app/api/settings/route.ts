import { NextRequest, NextResponse } from "next/server";
import {
  getGlobalSettings,
  updateGlobalSettings,
  getSeasonConfig,
  updateSeasonConfig,
  createNewSeason,
} from "@/app/lib/settings";
import { requireAdmin } from "@/app/lib/authHelpers";

/**
 * GET /api/settings
 *   - No params       → returns active season's { registrationOpen, bracketsVisible } (backward-compat)
 *   - ?full=1         → returns full SeasonConfig (seasons list, activeSeason)
 */
export async function GET(request: NextRequest) {
  try {
    const full = request.nextUrl.searchParams.get("full");

    if (full) {
      const config = await getSeasonConfig();
      return NextResponse.json(config);
    }

    // Default: backward-compat shape
    const settings = await getGlobalSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

/**
 * POST /api/settings
 *   - { registrationOpen?, bracketsVisible? }  → update active season's settings (backward-compat)
 *   - { action: "createSeason", seasonId, label }  → create new season & archive previous
 *   - { action: "updateSeason", ...SeasonConfig }  → full config update
 */
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();

    // New season creation
    if (body.action === "createSeason") {
      const { seasonId, label } = body;
      if (!seasonId || !label) {
        return NextResponse.json(
          { error: "seasonId and label are required" },
          { status: 400 }
        );
      }
      try {
        const config = await createNewSeason(seasonId, label);
        return NextResponse.json(config);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 409 });
      }
    }

    // Full config update
    if (body.action === "updateSeason") {
      const config = await updateSeasonConfig(body.config);
      return NextResponse.json(config);
    }

    // Default: backward-compat (update active season's registrationOpen / bracketsVisible)
    const settings = await updateGlobalSettings(body);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
