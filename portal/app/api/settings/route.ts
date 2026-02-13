import { NextRequest, NextResponse } from "next/server";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { requireAdmin } from "@/app/lib/authHelpers";

const CONFIG_ID = "CONFIG_GLOBAL";

export async function GET() {
  try {
    const container = getUsersContainer();
    const { resource } = await container.item(CONFIG_ID, CONFIG_ID).read();
    
    // Default to open if not set
    const settings = resource || { id: CONFIG_ID, registrationOpen: true };
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
    const container = getUsersContainer();
    
    // Upsert the settings document
    const { resource } = await container.items.upsert({
      id: CONFIG_ID,
      ...body,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json(resource);
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
