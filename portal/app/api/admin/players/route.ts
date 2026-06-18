import { NextRequest, NextResponse } from "next/server";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { RegistrationDocument, UserDocument, isDoubles, makeRegistrationId } from "@/app/lib/models";
import { requireAdmin } from "@/app/lib/authHelpers";
import { cacheGet, cacheSet, cacheDeleteByPrefix } from "@/app/lib/cache";
import { getActiveSeason, getSeasonSettings } from "@/app/lib/settings";
import {
  getTournamentRegistrationsContainer,
  isTournamentV2Enabled,
  registrationPartitionKey,
  seasonCategoryQuery,
} from "@/app/lib/tournamentData";

const PLAYERS_CACHE_PREFIX = "admin-players:";
const PLAYERS_CACHE_TTL = 30_000; // 30 seconds

/**
 * GET /api/admin/players?category=MS
 * Returns players registered in the given category.
 * Fetches only relevant registrations, then point-reads their user docs.
 */
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const category = request.nextUrl.searchParams.get("category");
    if (!category) {
      return NextResponse.json(
        { error: "category query parameter is required" },
        { status: 400 }
      );
    }

    // Check cache first
    const seasonParam = request.nextUrl.searchParams.get("season");
    const seasonId = seasonParam || await getActiveSeason();
    const cacheKey = `${PLAYERS_CACHE_PREFIX}${category}:${seasonId}`;
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const usersContainer = getUsersContainer();
    const registrationsContainer = getTournamentRegistrationsContainer();

    // v2 uses a single seasonCategory partition; legacy remains cross-partition by userId.
    const regQuery = seasonCategoryQuery(seasonId, category as never);
    const { resources: registrations } = await registrationsContainer.items
      .query<RegistrationDocument>(
        {
          query: isTournamentV2Enabled()
            ? "SELECT c.id, c.userId, c.userName, c.category, c.status, c.seasonId, c.seed, c.partnerId, c.partnerName, c.partnerPhone, c.createdAt, c.updatedAt FROM c WHERE c.seasonCategory = @seasonCategory AND c.status != 'cancelled'"
            : "SELECT c.id, c.userId, c.userName, c.category, c.status, c.seasonId, c.seed, c.partnerId, c.partnerName, c.partnerPhone, c.createdAt, c.updatedAt FROM c WHERE c.category = @category AND c.status != 'cancelled' AND c.seasonId = @seasonId",
          parameters: regQuery.parameters,
        },
        regQuery.options
      )
      .fetchAll();

    // Collect unique userIds and batch-read user docs
    const userIds = [...new Set(registrations.map((r) => r.userId))];

    // Parallel point-reads (partition key = id)
    const BATCH = 50;
    const userMap = new Map<string, UserDocument>();
    for (let i = 0; i < userIds.length; i += BATCH) {
      const chunk = userIds.slice(i, i + BATCH);
      const results = await Promise.all(
        chunk.map((uid) =>
          usersContainer
            .item(uid, uid)
            .read<UserDocument>()
            .then((r) => r.resource)
            .catch(() => null)
        )
      );
      for (const u of results) {
        if (u) userMap.set(u.id, u);
      }
    }

    // Build a map: userId -> registrations for this category
    const regMap = new Map<string, RegistrationDocument[]>();
    for (const reg of registrations) {
      const list = regMap.get(reg.userId) || [];
      list.push(reg);
      regMap.set(reg.userId, list);
    }

    // Combine — only users with registrations in this category
    const players = userIds
      .map((uid) => {
        const user = userMap.get(uid);
        return {
          id: uid,
          name: user?.name || uid,
          email: user?.email || "",
          alias: user?.alias || "",
          phoneNumber: user?.phoneNumber,
          registrations: regMap.get(uid) || [],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Store in cache
    cacheSet(cacheKey, players, PLAYERS_CACHE_TTL);

    return NextResponse.json(players);
  } catch (error) {
    console.error("Error fetching admin players:", error);
    return NextResponse.json(
      { error: "Failed to fetch players" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/players
 * Update seed ranking for a registration.
 * Body: { registrationId, userId, seed }
 */
export async function PATCH(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { registrationId, userId, seed, season } = body;

    // IMPORTANT: Allow seed to be null (unsetting a seed).
    if (!registrationId || !userId || seed === undefined) {
      return NextResponse.json(
        { error: "registrationId, userId, and seed are required" },
        { status: 400 }
      );
    }

    const container = getTournamentRegistrationsContainer();

    const existing = isTournamentV2Enabled()
      ? (await container.items
          .query<RegistrationDocument>({
            query: season
              ? "SELECT TOP 1 * FROM c WHERE c.id = @registrationId AND c.userId = @userId AND c.seasonId = @seasonId"
              : "SELECT TOP 1 * FROM c WHERE c.id = @registrationId AND c.userId = @userId",
            parameters: [
              { name: "@registrationId", value: registrationId },
              { name: "@userId", value: userId },
              ...(season ? [{ name: "@seasonId", value: season }] : []),
            ],
          })
          .fetchAll()).resources[0]
      : (await container.item(registrationId, userId).read<RegistrationDocument>()).resource;

    if (!existing) {
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    if (season && existing.seasonId !== season) {
      return NextResponse.json(
        { error: "Registration does not belong to the selected season" },
        { status: 409 }
      );
    }

    const seasonSettings = await getSeasonSettings(existing.seasonId);
    if (seasonSettings.archived) {
      return NextResponse.json(
        { error: "Archived seasons are read-only" },
        { status: 403 }
      );
    }

    // Duplicate seed check: no two registrations in the same category may share a seed
    if (seed) {
      const duplicateQuery = seasonCategoryQuery(existing.seasonId, existing.category);
      const { resources: sameCat } = await container.items
        .query<RegistrationDocument>(
          {
            query: isTournamentV2Enabled()
              ? "SELECT c.id, c.userId, c.seed FROM c WHERE c.seasonCategory = @seasonCategory AND c.seed = @seed AND c.status != 'cancelled'"
              : "SELECT c.id, c.userId, c.seed FROM c WHERE c.category = @category AND c.seed = @seed AND c.status != 'cancelled' AND c.seasonId = @seasonId",
            parameters: [
              ...duplicateQuery.parameters,
              { name: "@seed", value: Number(seed) },
            ],
          },
          duplicateQuery.options
        )
        .fetchAll();

      const conflict = sameCat.find((r) => r.id !== registrationId);
      if (conflict) {
        return NextResponse.json(
          { error: `Seed ${seed} is already assigned to another player in ${existing.category}` },
          { status: 409 }
        );
      }
    }

    const newSeedVal = seed ? Number(seed) : undefined;
    const now = new Date().toISOString();

    const updated: RegistrationDocument = {
      ...existing,
      seed: newSeedVal,
      updatedAt: now,
    };

    const { resource } = await container
      .item(registrationId, registrationPartitionKey(existing))
      .replace(updated);

    // For doubles, sync seed to partner's registration so both sides match
    if (isDoubles(existing.category) && existing.partnerId) {
      const partnerRegId = makeRegistrationId(existing.partnerId, existing.category, existing.seasonId);
      try {
        const { resource: partnerReg } = await container
          .item(partnerRegId, registrationPartitionKey({ userId: existing.partnerId, category: existing.category, seasonId: existing.seasonId }))
          .read<RegistrationDocument>();
        if (partnerReg && partnerReg.seed !== newSeedVal) {
          await container.item(partnerRegId, registrationPartitionKey(partnerReg)).replace({
            ...partnerReg,
            seed: newSeedVal,
            updatedAt: now,
          });
        }
      } catch {
        // Partner registration may not exist — non-critical
      }
    }

    // Bust players cache for this category
    cacheDeleteByPrefix(PLAYERS_CACHE_PREFIX);

    return NextResponse.json(resource);
  } catch (error) {
    console.error("Error updating seed:", error);
    return NextResponse.json(
      { error: "Failed to update seed" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/players
 * Batch update seeds for an entire category in one call.
 * Body: { category, seeds: Record<registrationId, number | null> }
 * 
 * Fetches all registrations for the category once, applies seed updates,
 * and writes them back in parallel batches. Much cheaper than N individual PATCHes.
 */
export async function PUT(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { category, seeds, season, seasonId: bodySeasonId } = body as {
      category: string;
      seeds: Record<string, number | null>;
      season?: string;
      seasonId?: string;
    };

    if (!category || !seeds || typeof seeds !== 'object') {
      return NextResponse.json(
        { error: "category and seeds map are required" },
        { status: 400 }
      );
    }

    const container = getTournamentRegistrationsContainer();

    // Resolve season
    const seasonId = season || bodySeasonId || await getActiveSeason();
    const seasonSettings = await getSeasonSettings(seasonId);
    if (seasonSettings.archived) {
      return NextResponse.json(
        { error: "Archived seasons are read-only" },
        { status: 403 }
      );
    }

    // 1. Fetch all registrations for this category + season in one query
    const regQuery = seasonCategoryQuery(seasonId, category as never);
    const { resources: registrations } = await container.items
      .query<RegistrationDocument>(
        {
          query: isTournamentV2Enabled()
            ? "SELECT * FROM c WHERE c.seasonCategory = @seasonCategory AND c.status != 'cancelled'"
            : "SELECT * FROM c WHERE c.category = @category AND c.status != 'cancelled' AND c.seasonId = @seasonId",
          parameters: regQuery.parameters,
        },
        regQuery.options
      )
      .fetchAll();

    // 2. Build update list — for doubles, propagate seed to BOTH partners
    const now = new Date().toISOString();
    const toUpdate: RegistrationDocument[] = [];
    const isDoublesCategory = ['MD', 'WD', 'XD'].includes(category);

    // Build a map of registrations by ID for quick partner lookup
    const regById = new Map(registrations.map(r => [r.id, r]));

    // Track which registrations we've already queued to avoid duplicates
    const queued = new Set<string>();

    for (const reg of registrations) {
      if (!(reg.id in seeds)) continue; // Not in the seed map, skip
      const newSeed = seeds[reg.id];
      const currentSeed = reg.seed || null;

      // Queue this registration if seed changed
      if (newSeed !== currentSeed && !queued.has(reg.id)) {
        toUpdate.push({
          ...reg,
          seed: newSeed ? Number(newSeed) : undefined,
          updatedAt: now,
        });
        queued.add(reg.id);
      }

      // For doubles, also sync seed to partner's registration
      if (isDoublesCategory && reg.partnerId) {
        const partnerRegId = makeRegistrationId(reg.partnerId, category, seasonId);
        const partnerReg = regById.get(partnerRegId);
        if (partnerReg && !queued.has(partnerRegId)) {
          const partnerCurrentSeed = partnerReg.seed || null;
          if (newSeed !== partnerCurrentSeed) {
            toUpdate.push({
              ...partnerReg,
              seed: newSeed ? Number(newSeed) : undefined,
              updatedAt: now,
            });
            queued.add(partnerRegId);
          }
        }
      }
    }

    // 3. Write updates in sequential batches of 20 (avoids Cosmos throttling)
    const BATCH = 20;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const chunk = toUpdate.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        chunk.map(doc =>
          container.item(doc.id, registrationPartitionKey(doc)).replace(doc)
        )
      );
      succeeded += results.filter(r => r.status === 'fulfilled').length;
      failed += results.filter(r => r.status === 'rejected').length;
    }

    // 4. Bust cache
    cacheDeleteByPrefix(PLAYERS_CACHE_PREFIX);

    return NextResponse.json({
      updated: succeeded,
      failed,
      total: toUpdate.length,
    });
  } catch (error) {
    console.error("Error batch updating seeds:", error);
    return NextResponse.json(
      { error: "Failed to batch update seeds" },
      { status: 500 }
    );
  }
}
