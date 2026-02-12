import { NextRequest, NextResponse } from "next/server";
import { getRegistrationsContainer } from "@/app/lib/cosmosClient";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { RegistrationDocument, UserDocument } from "@/app/lib/models";

/**
 * GET /api/admin/players?category=MS
 * Returns players registered in the given category.
 * Fetches only relevant registrations, then point-reads their user docs.
 */
export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category");
    if (!category) {
      return NextResponse.json(
        { error: "category query parameter is required" },
        { status: 400 }
      );
    }

    const usersContainer = getUsersContainer();
    const registrationsContainer = getRegistrationsContainer();

    // Single-partition query — category IS the partition key for registrations? No, userId is.
    // But this still only scans rows matching the category, much smaller result set.
    const { resources: registrations } = await registrationsContainer.items
      .query<RegistrationDocument>({
        query:
          "SELECT * FROM c WHERE c.category = @cat AND c.status != 'cancelled'",
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
  try {
    const body = await request.json();
    const { registrationId, userId, seed } = body;

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

    const updated: RegistrationDocument = {
      ...existing,
      seed: seed ? Number(seed) : undefined,
      updatedAt: new Date().toISOString(),
    };

    const { resource } = await container
      .item(registrationId, userId)
      .replace(updated);

    return NextResponse.json(resource);
  } catch (error) {
    console.error("Error updating seed:", error);
    return NextResponse.json(
      { error: "Failed to update seed" },
      { status: 500 }
    );
  }
}
