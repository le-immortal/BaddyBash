import { NextRequest, NextResponse } from "next/server";
import { getRegistrationsContainer } from "@/app/lib/cosmosClient";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { RegistrationDocument, UserDocument, isDoubles } from "@/app/lib/models";
import { requireAdmin } from "@/app/lib/authHelpers";
import { cacheGet, cacheSet, cacheDeleteByPrefix } from "@/app/lib/cache";

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
    const cacheKey = `${PLAYERS_CACHE_PREFIX}${category}`;
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const usersContainer = getUsersContainer();
    const registrationsContainer = getRegistrationsContainer();

    // Cross-partition query (registrations partitioned by userId, not category).
    // Select only the fields we need to reduce RU cost and transfer size.
    const { resources: registrations } = await registrationsContainer.items
      .query<RegistrationDocument>({
        query:
          "SELECT c.id, c.userId, c.userName, c.category, c.status, c.seed, c.partnerId, c.partnerName, c.partnerPhone, c.createdAt, c.updatedAt FROM c WHERE c.category = @cat AND c.status != 'cancelled'",
        parameters: [{ name: "@cat", value: category }],
      })
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
    const { registrationId, userId, seed } = body;

    // IMPORTANT: Allow seed to be null (unsetting a seed).
    if (!registrationId || !userId || seed === undefined) {
      return NextResponse.json(
        { error: "registrationId, userId, and seed are required" },
        { status: 400 }
      );
    }

    const container = getRegistrationsContainer();

    const { resource: existing } = await container
      .item(registrationId, userId)
      .read<RegistrationDocument>();

    if (!existing) {
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    // Duplicate seed check: no two registrations in the same category may share a seed
    if (seed) {
      const { resources: sameCat } = await container.items
        .query<RegistrationDocument>({
          query:
            "SELECT c.id, c.userId, c.seed FROM c WHERE c.category = @cat AND c.seed = @seed AND c.status != 'cancelled'",
          parameters: [
            { name: "@cat", value: existing.category },
            { name: "@seed", value: Number(seed) },
          ],
        })
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
      .item(registrationId, userId)
      .replace(updated);

    // For doubles, sync seed to partner's registration so both sides match
    if (isDoubles(existing.category) && existing.partnerId) {
      const partnerRegId = `${existing.partnerId}_${existing.category}`;
      try {
        const { resource: partnerReg } = await container
          .item(partnerRegId, existing.partnerId)
          .read<RegistrationDocument>();
        if (partnerReg && partnerReg.seed !== newSeedVal) {
          await container.item(partnerRegId, existing.partnerId).replace({
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
    const { category, seeds } = body as {
      category: string;
      seeds: Record<string, number | null>;
    };

    if (!category || !seeds || typeof seeds !== 'object') {
      return NextResponse.json(
        { error: "category and seeds map are required" },
        { status: 400 }
      );
    }

    const container = getRegistrationsContainer();

    // 1. Fetch all registrations for this category in one query
    const { resources: registrations } = await container.items
      .query<RegistrationDocument>({
        query: "SELECT * FROM c WHERE c.category = @cat AND c.status != 'cancelled'",
        parameters: [{ name: "@cat", value: category }],
      })
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
        const partnerRegId = `${reg.partnerId}_${category}`;
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
          container.item(doc.id, doc.userId).replace(doc)
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
