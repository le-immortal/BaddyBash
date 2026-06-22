import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPlayerTournamentHistory } from "@/app/lib/playerHistory";
import { readPartnerPostById } from "@/app/lib/partnerPosts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const post = await readPartnerPostById(id);
    if (!post) {
      return NextResponse.json({ error: "Partner post not found" }, { status: 404 });
    }

    const history = await getPlayerTournamentHistory(post.userId, post.category).catch((error) => {
      console.error("Error fetching partner post history:", error);
      return [];
    });

    return NextResponse.json({
      category: post.category,
      history,
    });
  } catch (error) {
    console.error("Error reading partner post for history:", error);
    return NextResponse.json({ error: "Failed to fetch partner post history" }, { status: 500 });
  }
}
