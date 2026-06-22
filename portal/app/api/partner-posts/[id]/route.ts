import { NextRequest, NextResponse } from "next/server";
import { getPartnerPostsContainer } from "@/app/lib/cosmosClient";
import { getActiveSeason, getSeasonSettings } from "@/app/lib/settings";
import { auth } from "@/auth";
import type { PartnerPostDocument } from "@/app/lib/models";
import {
  getSessionUserByEmail,
  isPartnerPostStatus,
  isSkillLevel,
  parsePartnerPostId,
  readPartnerPostById,
  toPartnerPostResponse,
} from "@/app/lib/partnerPosts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAuthorizedPost(id: string) {
  const session = await auth();
  if (!session?.user?.email) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const currentUser = await getSessionUserByEmail(session.user.email);
  if (!currentUser) {
    return { response: NextResponse.json({ error: "User profile not found" }, { status: 404 }) };
  }

  const post = await readPartnerPostById(id);
  if (!post) {
    return { response: NextResponse.json({ error: "Partner post not found" }, { status: 404 }) };
  }

  if (!session.user.isAdmin && post.userId !== currentUser.id) {
    return {
      response: NextResponse.json(
        { error: "Forbidden: you can only modify your own partner posts" },
        { status: 403 }
      ),
    };
  }

  const activeSeasonId = await getActiveSeason();
  if (post.seasonId !== activeSeasonId) {
    return {
      response: NextResponse.json(
        { error: "Partner posts can only be modified for the active season" },
        { status: 403 }
      ),
    };
  }

  const seasonSettings = await getSeasonSettings(activeSeasonId);
  if (seasonSettings.archived) {
    return {
      response: NextResponse.json(
        { error: "This season is archived. No changes allowed." },
        { status: 403 }
      ),
    };
  }

  return { session, currentUser, post };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const parsed = parsePartnerPostId(id);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid partner post id" }, { status: 400 });
    }

    const authorized = await getAuthorizedPost(id);
    if (authorized.response) return authorized.response;

    const body = await request.json();
    const updates: Partial<Pick<PartnerPostDocument, "status" | "skillLevel">> = {};

    if ("status" in body) {
      if (!isPartnerPostStatus(body.status)) {
        return NextResponse.json({ error: "status must be open or closed" }, { status: 400 });
      }
      updates.status = body.status;
    }

    if ("skillLevel" in body) {
      if (!isSkillLevel(body.skillLevel)) {
        return NextResponse.json(
          { error: "skillLevel must be beginner, intermediate, or advanced" },
          { status: 400 }
        );
      }
      updates.skillLevel = body.skillLevel;
    }


    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "At least one of status or skillLevel is required" },
        { status: 400 }
      );
    }

    const updated: PartnerPostDocument = {
      ...authorized.post,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const container = getPartnerPostsContainer();
    const { resource } = await container
      .item(id, parsed.seasonCategory)
      .replace<PartnerPostDocument>(updated);
    const saved = resource ?? updated;

    return NextResponse.json({
      seasonId: saved.seasonId,
      post: toPartnerPostResponse(saved, authorized.currentUser.id),
    });
  } catch (error) {
    console.error("Error updating partner post:", error);
    return NextResponse.json({ error: "Failed to update partner post" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const parsed = parsePartnerPostId(id);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid partner post id" }, { status: 400 });
    }

    const authorized = await getAuthorizedPost(id);
    if (authorized.response) return authorized.response;

    const container = getPartnerPostsContainer();
    await container.item(id, parsed.seasonCategory).delete();

    return NextResponse.json({ message: "Partner post deleted" }, { status: 200 });
  } catch (error) {
    console.error("Error deleting partner post:", error);
    return NextResponse.json({ error: "Failed to delete partner post" }, { status: 500 });
  }
}
