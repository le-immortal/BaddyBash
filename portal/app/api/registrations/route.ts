import { NextRequest, NextResponse } from "next/server";
import { getRegistrationsContainer } from "@/app/lib/cosmosClient";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { RegistrationDocument, UserDocument, isDoubles } from "@/app/lib/models";

const MAX_CATEGORIES = 2;

/**
 * GET /api/registrations?userId=xxx
 * Returns all registrations for a user.
 */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const container = getRegistrationsContainer();
    
    // Trim and lowercase userId for consistency
    const cleanUserId = userId.trim().toLowerCase();
    
    const { resources } = await container.items
      .query<RegistrationDocument>({
        query: "SELECT * FROM c WHERE c.userId = @userId",
        parameters: [{ name: "@userId", value: cleanUserId }],
      })
      .fetchAll();

    return NextResponse.json(resources);
  } catch (error) {
    console.error("Error fetching registrations:", error);
    return NextResponse.json({ error: "Failed to fetch registrations" }, { status: 500 });
  }
}

/**
 * POST /api/registrations
 * Create a new registration. Enforces Max-2 rule server-side.
 *
 * Body: { userId, userName, category, partnerId?, partnerName?, partnerPhone? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userName, category, partnerId, partnerName, partnerPhone } = body;

    if (!userId || !userName || !category) {
      return NextResponse.json(
        { error: "userId, userName, and category are required" },
        { status: 400 }
      );
    }

    // Trim and lowercase userId (alias) for consistency
    const cleanUserId = userId.trim().toLowerCase();
    const cleanPartnerId = partnerId ? partnerId.trim().toLowerCase() : undefined;

    // Validate doubles have a partner
    if (isDoubles(category) && !cleanPartnerId) {
      return NextResponse.json(
        { error: "Partner is required for doubles categories" },
        { status: 400 }
      );
    }

    const container = getRegistrationsContainer();

    // Server-side Max-2 check: count existing active registrations
    const { resources: existing } = await container.items
      .query<RegistrationDocument>({
        query:
          "SELECT * FROM c WHERE c.userId = @userId AND c.status != 'cancelled'",
        parameters: [{ name: "@userId", value: cleanUserId }],
      })
      .fetchAll();

    if (existing.length >= MAX_CATEGORIES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_CATEGORIES} registrations per player. You already have ${existing.length}.` },
        { status: 409 }
      );
    }

    // Check for duplicate category
    if (existing.some((r) => r.category === category)) {
      return NextResponse.json(
        { error: `Already registered for ${category}` },
        { status: 409 }
      );
    }

    // For doubles: validate partner hasn't hit max-2 BEFORE creating anything
    if (isDoubles(category) && cleanPartnerId) {
      const { resources: partnerRegs } = await container.items
        .query<RegistrationDocument>({
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.status != 'cancelled'",
          parameters: [{ name: "@userId", value: cleanPartnerId }],
        })
        .fetchAll();

      if (partnerRegs.length >= MAX_CATEGORIES) {
        return NextResponse.json(
          { error: `Partner "${partnerName || cleanPartnerId}" already has ${partnerRegs.length} registrations (max ${MAX_CATEGORIES}). They need to cancel one first.` },
          { status: 409 }
        );
      }

      if (partnerRegs.some((r) => r.category === category)) {
        return NextResponse.json(
          { error: `Partner "${partnerName || cleanPartnerId}" is already registered for ${category}.` },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();
    const registration: RegistrationDocument = {
      id: `${cleanUserId}_${category}`,
      userId: cleanUserId,
      userName: userName.trim(),
      category,
      status: "confirmed",
      partnerId: cleanPartnerId || undefined,
      partnerName: partnerName ? partnerName.trim() : undefined,
      partnerPhone: partnerPhone ? partnerPhone.trim() : undefined,
      createdAt: now,
      updatedAt: now,
    };

    const { resource } = await container.items.create(registration);

    // For doubles: auto-create user and registration for the partner
    if (isDoubles(category) && cleanPartnerId) {
      const usersContainer = getUsersContainer();

      // Create user for partner if they don't exist (keyed by alias)
      let partnerExists = false;
      try {
        const { resource: existingPartner } = await usersContainer.item(cleanPartnerId, cleanPartnerId).read<UserDocument>();
        if (existingPartner) partnerExists = true;
      } catch {
        // Partner user doesn't exist yet
      }

      if (!partnerExists) {
        const partnerUser: UserDocument = {
          id: cleanPartnerId,
          name: partnerName ? partnerName.trim() : cleanPartnerId,
          email: '',
          alias: cleanPartnerId,
          phoneNumber: partnerPhone ? partnerPhone.trim() : '',
          isAdmin: false,
          createdAt: now,
          updatedAt: now,
        };
        await usersContainer.items.upsert(partnerUser);
      }

      // Create confirmed registration for partner (already validated max-2 above)
      const partnerRegId = `${cleanPartnerId}_${category}`;
      let partnerRegExists = false;
      try {
        const { resource: existingReg } = await container.item(partnerRegId, cleanPartnerId).read<RegistrationDocument>();
        if (existingReg && existingReg.status !== 'cancelled') partnerRegExists = true;
      } catch {
        // Doesn't exist
      }

      if (!partnerRegExists) {
        const partnerRegistration: RegistrationDocument = {
          id: partnerRegId,
          userId: cleanPartnerId,
          userName: partnerName ? partnerName.trim() : cleanPartnerId,
          category,
          status: "confirmed",
          partnerId: cleanUserId,
          partnerName: userName.trim(),
          partnerPhone: body.userPhone ? body.userPhone.trim() : '',
          createdAt: now,
          updatedAt: now,
        };
        try {
          await container.items.create(partnerRegistration);
        } catch (e: unknown) {
          // 409 = already exists, that's fine
          const cosmosErr = e as { code?: number };
          if (cosmosErr.code !== 409) console.error('Failed to create partner registration:', e);
        }
      }
    }

    return NextResponse.json(resource, { status: 201 });
  } catch (error: unknown) {
    const cosmosError = error as { code?: number };
    if (cosmosError.code === 409) {
      return NextResponse.json(
        { error: "Registration already exists for this category" },
        { status: 409 }
      );
    }
    console.error("Error creating registration:", error);
    return NextResponse.json({ error: "Failed to create registration" }, { status: 500 });
  }
}

/**
 * DELETE /api/registrations?id=xxx&userId=xxx
 * Cancel a registration (soft delete — sets status to cancelled).
 */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const userId = request.nextUrl.searchParams.get("userId");

  if (!id || !userId) {
    return NextResponse.json({ error: "id and userId are required" }, { status: 400 });
  }

  try {
    const container = getRegistrationsContainer();

    // Trim and lowercase userId for consistency
    const cleanUserId = userId.trim().toLowerCase();
    const cleanId = id.trim();

    // Read existing
    const { resource: existing } = await container.item(cleanId, cleanUserId).read<RegistrationDocument>();
    if (!existing) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    // Soft delete
    const updated: RegistrationDocument = {
      ...existing,
      status: "cancelled",
      updatedAt: new Date().toISOString(),
    };

    await container.item(cleanId, cleanUserId).replace(updated);
    return NextResponse.json({ message: "Registration cancelled" });
  } catch (error) {
    console.error("Error cancelling registration:", error);
    return NextResponse.json({ error: "Failed to cancel registration" }, { status: 500 });
  }
}
