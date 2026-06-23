import { NextRequest, NextResponse } from "next/server";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { UserDocument } from "@/app/lib/models";
import { getGlobalSettings } from "@/app/lib/settings";
import { auth } from "@/auth";
import { requireOwnerOrAdmin } from "@/app/lib/authHelpers";

/**
 * GET /api/users?id=xxx  OR  /api/users?alias=xxx  OR  /api/users?email=xxx
 * Returns a single user by ID, alias, or email, or all users if no params.
 * Requires authentication.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = request.nextUrl.searchParams.get("id");
  const aliasParam = request.nextUrl.searchParams.get("alias");
  const emailParam = request.nextUrl.searchParams.get("email");

  try {
    const container = getUsersContainer();

    if (userId) {
      // Ownership check: users can only look up their own profile (admins can look up anyone)
      const { authorized } = await requireOwnerOrAdmin(userId);
      if (!authorized) {
        return NextResponse.json({ error: "Forbidden: you can only view your own profile" }, { status: 403 });
      }

      // Point read — O(1) since id is the partition key
      // Trim and lowercase for case-insensitive matching
      const cleanUserId = String(userId).trim().toLowerCase();
      const { resource } = await container.item(cleanUserId, cleanUserId).read<UserDocument>();
      if (!resource) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json(resource);
    }

    if (aliasParam) {
      // Query by alias - trim, lowercase, and strip @domain suffix
      const cleanAlias = String(aliasParam).trim().toLowerCase().replace(/@.*$/, '');
      const { resources } = await container.items
        .query<UserDocument>({
          query: "SELECT * FROM c WHERE c.alias = @alias",
          parameters: [{ name: "@alias", value: cleanAlias }],
        })
        .fetchAll();

      if (resources.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const found = resources[0];

      // Allow access if: (a) user has no email yet (pre-created stub waiting to be claimed),
      // or (b) the requester owns this record or is admin
      if (found.email) {
        const { authorized } = await requireOwnerOrAdmin(cleanAlias);
        if (!authorized) {
          return NextResponse.json({ error: "Forbidden: you can only view your own profile" }, { status: 403 });
        }
      }

      return NextResponse.json(found);
    }

    if (emailParam) {
      // Ownership check: users can only look up their own profile (admins can look up anyone)
      // For email lookup, check if the requested email matches the session email
      if (!session.user.isAdmin && String(session.user.email).trim().toLowerCase() !== emailParam.trim().toLowerCase()) {
        return NextResponse.json({ error: "Forbidden: you can only view your own profile" }, { status: 403 });
      }

      // Query by email - trim and lowercase for case-insensitive matching
      const cleanEmail = String(emailParam).trim().toLowerCase();
      const { resources } = await container.items
        .query<UserDocument>({
          query: "SELECT * FROM c WHERE LOWER(c.email) = @email",
          parameters: [{ name: "@email", value: cleanEmail }],
        })
        .fetchAll();

      if (resources.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json(resources[0]);
    }

    // List all users — admin only (prevents bulk data exposure)
    if (!session.user.isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: admin access required to list all users" },
        { status: 403 }
      );
    }

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
 * Requires authentication.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    // Type assertion safe because we validate above
    const cleanId = String(id).trim().toLowerCase().replace(/@.*$/, '');
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanAlias = body.alias ? String(body.alias).trim().toLowerCase().replace(/@.*$/, '') : undefined;

    // Authorization: a non-admin may only create/update their OWN record — the
    // id (alias) and email must both match the logged-in user. Admins bypass.
    // This both closes an upsert-anyone gap and lets a first-time user create
    // their own doc during onboarding (the PATCH 404 -> POST fallback path).
    if (!session.user.isAdmin) {
      const sessionEmail = String(session.user.email || '').trim().toLowerCase();
      const sessionAlias = sessionEmail.replace(/@.*$/, '');
      if (!sessionAlias || cleanId !== sessionAlias || (cleanEmail && cleanEmail !== sessionEmail)) {
        return NextResponse.json(
          { error: "Forbidden: you can only modify your own profile" },
          { status: 403 }
        );
      }
    }

    // Check if user already exists — preserve saved fields
    let existing: UserDocument | undefined;
    try {
      const { resource } = await container.item(cleanId, cleanId).read<UserDocument>();
      existing = resource;
    } catch {
      // User doesn't exist yet — that's fine
    }

    // If registration is closed and user already exists WITH an email (fully set up),
    // block profile updates. But allow linking (claiming a pre-created stub with no email).
    const settings = await getGlobalSettings();
    if (!settings.registrationOpen && existing && existing.email) {
      return NextResponse.json(
        { error: "Registration is closed. Profile updates are not allowed." },
        { status: 403 }
      );
    }
    // Allow through: new user creation, linking a stub, OR registration is open

    // Security Check: If user exists and has an email, do not allow overwriting it with a different email
    if (existing && existing.email && cleanEmail && existing.email !== cleanEmail) {
      return NextResponse.json(
        { error: "Alias is already associated with another email address." },
        { status: 409 }
      );
    }

    const user: UserDocument = {
      id: cleanId,
      name: String(name).trim() || existing?.name || '',
      email: cleanEmail || existing?.email || '',
      // In this system, id and alias are the same (id is the alias)
      alias: cleanAlias || existing?.alias || cleanId,
      // phoneNumber is required in the model, use empty string if not provided
      phoneNumber: body.phoneNumber ? String(body.phoneNumber).trim() : (existing?.phoneNumber || ''),
      tShirtSize: body.tShirtSize || existing?.tShirtSize || undefined,
      avatar: body.avatar || existing?.avatar || undefined,
      isAdmin: existing?.isAdmin ?? false,
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
 * Requires authentication.
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const container = getUsersContainer();

    // Trim and lowercase id for consistency
    const cleanId = String(id).trim().toLowerCase();

    const { authorized } = await requireOwnerOrAdmin(cleanId);
    if (!authorized) {
      return NextResponse.json({ error: "Forbidden: you can only update your own profile" }, { status: 403 });
    }

    // Read existing
    const { resource: existing } = await container.item(cleanId, cleanId).read<UserDocument>();
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Clean up email and alias in updates if present
    const cleanUpdates = { ...updates };
    if (cleanUpdates.email) {
      cleanUpdates.email = String(cleanUpdates.email).trim().toLowerCase();
    }
    if (cleanUpdates.alias) {
      cleanUpdates.alias = String(cleanUpdates.alias).trim().toLowerCase();
    }
    if (cleanUpdates.name) {
      cleanUpdates.name = String(cleanUpdates.name).trim();
    }
    if (cleanUpdates.phoneNumber) {
      cleanUpdates.phoneNumber = String(cleanUpdates.phoneNumber).trim();
    }
    if (cleanUpdates.tShirtSize) {
      cleanUpdates.tShirtSize = String(cleanUpdates.tShirtSize).trim();
    }

    // Security Check: Prevent hijacking of existing accounts
    // If the user already has an email set, do not allow changing it to a different email
    // This prevents malicious users from "claiming" an active user's account
    if (cleanUpdates.email && existing.email && existing.email !== cleanUpdates.email) {
       return NextResponse.json(
        { error: "Cannot change email of an already active account" },
        { status: 403 }
      );
    }

    // Strip isAdmin from updates — only settable via direct DB access
    delete cleanUpdates.isAdmin;

    // If registration is closed, restrict identity changes — but allow initial
    // linking and personal logistics. Phone number and t-shirt size are personal
    // logistics (not bracket-affecting), and t-shirt size is the required one-time
    // onboarding signal, so they must remain saveable regardless of the
    // registration window — otherwise a user could never complete onboarding (or
    // would be re-prompted forever) during a registration freeze.
    const settings = await getGlobalSettings();
    const isLinking = !existing.email && cleanUpdates.email; // first-time claim of a pre-created stub
    if (!settings.registrationOpen && !isLinking) {
      delete cleanUpdates.name;
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
