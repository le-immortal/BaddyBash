import { NextRequest, NextResponse } from "next/server";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { UserDocument } from "@/app/lib/models";

/**
 * GET /api/users?id=xxx  OR  /api/users?alias=xxx  OR  /api/users?email=xxx
 * Returns a single user by ID, alias, or email, or all users if no params.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("id");
  const aliasParam = request.nextUrl.searchParams.get("alias");
  const emailParam = request.nextUrl.searchParams.get("email");

  try {
    const container = getUsersContainer();

    if (userId) {
      // Point read — O(1) since id is the partition key
      // Trim and lowercase for case-insensitive matching
      const cleanUserId = userId.trim().toLowerCase();
      const { resource } = await container.item(cleanUserId, cleanUserId).read<UserDocument>();
      if (!resource) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json(resource);
    }

    if (aliasParam) {
      // Query by alias - trim and lowercase for case-insensitive matching
      const cleanAlias = aliasParam.trim().toLowerCase();
      const { resources } = await container.items
        .query<UserDocument>({
          query: "SELECT * FROM c WHERE c.alias = @alias",
          parameters: [{ name: "@alias", value: cleanAlias }],
        })
        .fetchAll();

      if (resources.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json(resources[0]);
    }

    if (emailParam) {
      // Query by email - trim and lowercase for case-insensitive matching
      const cleanEmail = emailParam.trim().toLowerCase();
      const { resources } = await container.items
        .query<UserDocument>({
          query: "SELECT * FROM c WHERE c.email = @email",
          parameters: [{ name: "@email", value: cleanEmail }],
        })
        .fetchAll();

      if (resources.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json(resources[0]);
    }

    // List all users
    const { resources } = await container.items
      .query<UserDocument>("SELECT * FROM c ORDER BY c.name")
      .fetchAll();

    return NextResponse.json(resources);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

/**
 * POST /api/users
 * Create or update (upsert) a user.
 * Body: { id, name, email, alias?, phoneNumber? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, email } = body;

    if (!id || !name || !email) {
      return NextResponse.json(
        { error: "id, name, and email are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const container = getUsersContainer();

    // Trim and lowercase id (alias) and email for consistency
    const cleanId = id.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanAlias = body.alias ? body.alias.trim().toLowerCase() : undefined;

    // Check if user already exists — preserve saved fields
    let existing: UserDocument | undefined;
    try {
      const { resource } = await container.item(cleanId, cleanId).read<UserDocument>();
      existing = resource;
    } catch {
      // User doesn't exist yet — that's fine
    }

    const user: UserDocument = {
      id: cleanId,
      name: name.trim() || existing?.name || '',
      email: cleanEmail || existing?.email || '',
      alias: cleanAlias || existing?.alias || undefined,
      phoneNumber: body.phoneNumber ? body.phoneNumber.trim() : (existing?.phoneNumber || undefined),
      avatar: body.avatar || existing?.avatar || undefined,
      isAdmin: body.isAdmin ?? existing?.isAdmin ?? false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const { resource } = await container.items.upsert(user);
    return NextResponse.json(resource, { status: 200 });
  } catch (error) {
    console.error("Error upserting user:", error);
    return NextResponse.json({ error: "Failed to save user" }, { status: 500 });
  }
}

/**
 * PATCH /api/users
 * Partial update a user (e.g., update phone number).
 * Body: { id, ...fieldsToUpdate }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const container = getUsersContainer();

    // Trim and lowercase id for consistency
    const cleanId = id.trim().toLowerCase();

    // Read existing
    const { resource: existing } = await container.item(cleanId, cleanId).read<UserDocument>();
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Clean up email and alias in updates if present
    const cleanUpdates = { ...updates };
    if (cleanUpdates.email) {
      cleanUpdates.email = cleanUpdates.email.trim().toLowerCase();
    }
    if (cleanUpdates.alias) {
      cleanUpdates.alias = cleanUpdates.alias.trim().toLowerCase();
    }
    if (cleanUpdates.name) {
      cleanUpdates.name = cleanUpdates.name.trim();
    }
    if (cleanUpdates.phoneNumber) {
      cleanUpdates.phoneNumber = cleanUpdates.phoneNumber.trim();
    }

    const updated: UserDocument = {
      ...existing,
      ...cleanUpdates,
      updatedAt: new Date().toISOString(),
    };

    const { resource } = await container.item(cleanId, cleanId).replace(updated);
    return NextResponse.json(resource);
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
