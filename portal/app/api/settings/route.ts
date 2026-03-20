import { NextRequest, NextResponse } from "next/server";
import { getGlobalSettings, updateGlobalSettings } from "@/app/lib/settings";
import { requireAdmin } from "@/app/lib/authHelpers";

export async function GET() {
  // Public endpoint — settings like bracketsVisible are needed by unauthenticated bracket viewers
  try {
    const settings = await getGlobalSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const settings = await updateGlobalSettings(body);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
