import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getPlayerTournamentHistory,
  isPartnerBoardCategory,
} from "@/app/lib/playerHistory";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const category = request.nextUrl.searchParams.get("category");
  if (!isPartnerBoardCategory(category)) {
    return NextResponse.json({ error: "category must be one of MD, WD, XD" }, { status: 400 });
  }

  const { userId } = await context.params;

  try {
    const history = await getPlayerTournamentHistory(userId, category);
    return NextResponse.json({ userId, category, history });
  } catch (error) {
    console.error("Error fetching player tournament history:", error);
    return NextResponse.json({ userId, category, history: [] });
  }
}
