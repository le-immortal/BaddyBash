import { NextRequest, NextResponse } from "next/server";
import { ensurePartnerPostsContainer, getPartnerPostsContainer } from "@/app/lib/cosmosClient";
import { getActiveSeason, getSeasonSettings } from "@/app/lib/settings";
import { makeSeasonCategory } from "@/app/lib/tournamentData";
import { getPlayerAllCategoriesTournamentHistory } from "@/app/lib/playerHistory";
import { makePartnerPostId, type PartnerPostDocument } from "@/app/lib/models";
import { auth } from "@/auth";
import {
  isPartnerPostCategory,
  isPartnerPostStatus,
  isSkillLevel,
  getSessionUserByEmail,
  toPartnerPostResponse,
} from "@/app/lib/partnerPosts";

function isCosmosNotFound(error: unknown): boolean {
  const cosmosError = error as { code?: unknown; statusCode?: unknown };
  return cosmosError.code === 404 || cosmosError.statusCode === 404;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const currentUser = await getSessionUserByEmail(session.user.email);
    if (!currentUser) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const categoryParam = request.nextUrl.searchParams.get("category");
    const statusParam = request.nextUrl.searchParams.get("status") || "open";
    const seasonId = request.nextUrl.searchParams.get("season") || await getActiveSeason();

    if (categoryParam && !isPartnerPostCategory(categoryParam)) {
      return NextResponse.json({ error: "category must be one of MD, WD, XD" }, { status: 400 });
    }

    if (!isPartnerPostStatus(statusParam)) {
      return NextResponse.json({ error: "status must be open or closed" }, { status: 400 });
    }

    const container = getPartnerPostsContainer();
    const query = categoryParam
      ? {
          query: "SELECT c.id, c.userId, c.displayName, c.avatar, c.category, c.skillLevel, c.alias, c.status, c.createdAt, c.updatedAt FROM c WHERE c.seasonCategory = @seasonCategory AND c.status = @status ORDER BY c.createdAt DESC",
          parameters: [
            { name: "@seasonCategory", value: makeSeasonCategory(seasonId, categoryParam) },
            { name: "@status", value: statusParam },
          ],
        }
      : {
          query: "SELECT c.id, c.userId, c.displayName, c.avatar, c.category, c.skillLevel, c.alias, c.status, c.createdAt, c.updatedAt FROM c WHERE c.seasonId = @seasonId AND c.status = @status ORDER BY c.createdAt DESC",
          parameters: [
            { name: "@seasonId", value: seasonId },
            { name: "@status", value: statusParam },
          ],
        };

    const resources = await container.items
      .query<PartnerPostDocument>(
        query,
        categoryParam ? { partitionKey: makeSeasonCategory(seasonId, categoryParam) } : undefined
      )
      .fetchAll()
      .then((result) => result.resources)
      .catch((error) => {
        if (isCosmosNotFound(error)) return [];
        throw error;
      });

    // Fold each poster's tournament history into the list response so the client
    // makes a SINGLE request instead of an extra per-post /history call (N+1).
    // Per-season match reads are memoized in getSeasonCategoryMatchesCached, so
    // resolving many posters here only does the shared reads once.
    const histories = await Promise.all(
      resources.map((post) =>
        getPlayerAllCategoriesTournamentHistory(post.userId).catch((historyError) => {
          console.error("Error fetching partner post history:", historyError);
          return [];
        })
      )
    );

    return NextResponse.json({
      seasonId,
      posts: resources.map((post, index) =>
        toPartnerPostResponse(post, currentUser.id, histories[index])
      ),
    });
  } catch (error) {
    console.error("Error fetching partner posts:", error);
    return NextResponse.json({ error: "Failed to fetch partner posts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const seasonId = await getActiveSeason();
    const seasonSettings = await getSeasonSettings(seasonId);
    if (seasonSettings.archived) {
      return NextResponse.json(
        { error: "This season is archived. No changes allowed." },
        { status: 403 }
      );
    }

    const currentUser = await getSessionUserByEmail(session.user.email);
    if (!currentUser) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const { category, skillLevel } = body;

    if (!isPartnerPostCategory(category)) {
      return NextResponse.json({ error: "category must be one of MD, WD, XD" }, { status: 400 });
    }

    if (!isSkillLevel(skillLevel)) {
      return NextResponse.json(
        { error: "skillLevel must be beginner, intermediate, or advanced" },
        { status: 400 }
      );
    }

    const container = getPartnerPostsContainer();
    const now = new Date().toISOString();
    const id = makePartnerPostId(currentUser.id, category, seasonId);
    const existing = await container
      .item(id, makeSeasonCategory(seasonId, category))
      .read<PartnerPostDocument>()
      .then((response) => response.resource)
      .catch((error) => {
        if (isCosmosNotFound(error)) return null;
        throw error;
      });

    if (existing?.status === "open") {
      return NextResponse.json(
        { error: "You already have an open post in this category. Close it before posting again." },
        { status: 409 }
      );
    }

    const post: PartnerPostDocument = {
      id,
      userId: currentUser.id,
      displayName: currentUser.name,
      ...(currentUser.avatar ? { avatar: currentUser.avatar } : {}),
      alias: currentUser.alias,
      category,
      skillLevel,
      status: "open",
      seasonId,
      seasonCategory: makeSeasonCategory(seasonId, category),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const { resource } = await container.items
      .upsert<PartnerPostDocument>(post)
      .catch(async (error) => {
        if (!isCosmosNotFound(error)) throw error;

        const readyContainer = await ensurePartnerPostsContainer();
        return readyContainer.items.upsert<PartnerPostDocument>(post);
      });
    const saved = resource ?? post;

    return NextResponse.json(
      {
        seasonId,
        post: toPartnerPostResponse(saved, currentUser.id),
      },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error("Error upserting partner post:", error);
    return NextResponse.json({ error: "Failed to save partner post" }, { status: 500 });
  }
}
