import { NextRequest, NextResponse } from "next/server";
import { getGlobalSettings, updateGlobalSettings } from "@/app/lib/settings";
import { requireAdmin } from "@/app/lib/authHelpers";
import { auth } from "@/auth";

export async function GET() {
  // Auth gate — reject unauthenticated requests
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
