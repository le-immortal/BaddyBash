import { NextRequest, NextResponse } from "next/server";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { RegistrationDocument, UserDocument, isDoubles, Category, makeRegistrationId } from "@/app/lib/models";
import { getGlobalSettings, getActiveSeason, getSeasonSettings } from "@/app/lib/settings";
import { auth } from "@/auth";
import { requireOwnerOrAdmin } from "@/app/lib/authHelpers";
import { cacheDeleteByPrefix } from "@/app/lib/cache";
import {
  getTournamentRegistrationsContainer,
  registrationPartitionKey,
  withTournamentFields,
} from "@/app/lib/tournamentData";

const MAX_CATEGORIES = 2;

/**
 * GET /api/registrations?userId=xxx
 * Returns all registrations for a user.
 * Requires authentication.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Ownership check: users can only view their own registrations (admins can view anyone's)
  const { authorized } = await requireOwnerOrAdmin(userId);
  if (!authorized) {
    return NextResponse.json(
      { error: "Forbidden: you can only view your own registrations" },
      { status: 403 }
    );
  }

  try {
    const container = getTournamentRegistrationsContainer();

    // Trim and lowercase userId for consistency
    const cleanUserId = String(userId).trim().toLowerCase().replace(/@.*$/, '');

    // Season scoping: use query param or active season
    const seasonParam = request.nextUrl.searchParams.get("season");
    const seasonId = seasonParam || await getActiveSeason();

    const { resources } = await container.items
      .query<RegistrationDocument>({
        query: "SELECT * FROM c WHERE c.userId = @userId AND c.seasonId = @seasonId",
        parameters: [
          { name: "@userId", value: cleanUserId },
          { name: "@seasonId", value: seasonId },
        ],
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
 * Also enforces the Global Registration Open/Close setting.
 *
 * Body: { userId, userName, category, partnerId?, partnerName?, partnerPhone? }
 */
export async function POST(request: NextRequest) {
  // Auth gate — reject unauthenticated requests first
  const session = await auth();
  if (!session || !session.user || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 0. Resolve active season and check settings
    const seasonId = await getActiveSeason();
    const seasonSettings = await getSeasonSettings(seasonId);

    if (seasonSettings.archived) {
      return NextResponse.json(
        { error: "This season is archived. No changes allowed." },
        { status: 403 }
      );
    }
    if (!seasonSettings.registrationOpen) {
      return NextResponse.json(
        { error: "Registrations are currently closed." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, userName, category, partnerId, partnerName, partnerPhone, partnerTShirtSize } = body;

    const { email } = session.user;
    const cleanUserId = String(userId).trim().toLowerCase().replace(/@.*$/, '');
    
    // Admins can register on behalf of anyone (if needed for support)
    if (!session.user.isAdmin) { 
        const usersContainer = getUsersContainer();
        const { resources: [userDoc] } = await usersContainer.items
          .query<UserDocument>({
            query: "SELECT * FROM c WHERE c.email = @email",
            parameters: [{ name: "@email", value: email }]
          })
          .fetchAll();

        // If the logged-in user's ID (alias) doesn't match the requested userId, block it.
        if (!userDoc || userDoc.id !== cleanUserId) {
            return NextResponse.json(
              { error: "Unauthorized: You can only register for yourself." },
              { status: 403 }
            );
        }
    }

    if (!userId || !userName || !category) {
      return NextResponse.json(
        { error: "userId, userName, and category are required" },
        { status: 400 }
      );
    }

    // Trim and lowercase userId (alias) for consistency
    // Type assertion safe because we validate above
    
    // cleanUserId is already defined above in step 0.5
    const cleanPartnerId = partnerId ? String(partnerId).trim().toLowerCase().replace(/@.*$/, '') : undefined;

    // Validate doubles have a partner
    if (isDoubles(category) && !cleanPartnerId) {
      return NextResponse.json(
        { error: "Partner is required for doubles categories" },
        { status: 400 }
      );
    }

    // Validate user is not trying to partner with themselves
    if (isDoubles(category) && cleanPartnerId === cleanUserId) {
      return NextResponse.json(
        { error: "You cannot register with yourself as a partner" },
        { status: 400 }
      );
    }

    const container = getTournamentRegistrationsContainer();

    // Server-side Max-2 check: count existing active registrations (scoped to season)
    const { resources: existing } = await container.items
      .query<RegistrationDocument>({
        query:
          "SELECT * FROM c WHERE c.userId = @userId AND c.status != 'cancelled' AND c.seasonId = @seasonId",
        parameters: [
          { name: "@userId", value: cleanUserId },
          { name: "@seasonId", value: seasonId },
        ],
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
          query: "SELECT * FROM c WHERE c.userId = @userId AND c.status != 'cancelled' AND c.seasonId = @seasonId",
          parameters: [
            { name: "@userId", value: cleanPartnerId },
            { name: "@seasonId", value: seasonId },
          ],
        })
        .fetchAll();

      if (partnerRegs.length >= MAX_CATEGORIES) {
        return NextResponse.json(
          { error: `Partner "${partnerName || cleanPartnerId}" already has ${partnerRegs.length} registrations (max ${MAX_CATEGORIES}). They need to cancel one first.` },
          { status: 409 }
        );
      }

      // Check if partner is already registered for this category
      const existingCategoryReg = partnerRegs.find((r) => r.category === category);
      if (existingCategoryReg) {
        // Check if partner is already paired with someone else
        if (existingCategoryReg.partnerId && existingCategoryReg.partnerId !== cleanUserId) {
          return NextResponse.json(
            { error: `Partner "${partnerName || cleanPartnerId}" is already registered for ${category} with another player. A player can only be paired with one person per category.` },
            { status: 409 }
          );
        }
        // Partner is already registered for this category (with current user, alone, or other edge case)
        // Note: This case should be rare since the check at line 97 would catch if current user already has this category
        return NextResponse.json(
          { error: `Partner "${partnerName || cleanPartnerId}" is already registered for ${category}.` },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();

    // 1. Resolve Partner Details Logic
    let finalPartnerName = partnerName ? partnerName.trim() : undefined;
    let finalPartnerPhone = partnerPhone ? partnerPhone.trim() : undefined;
    let existingPartner: UserDocument | undefined;

    if (isDoubles(category) && cleanPartnerId) {
      const usersContainer = getUsersContainer();
      try {
        const { resource } = await usersContainer.item(cleanPartnerId, cleanPartnerId).read<UserDocument>();
        existingPartner = resource;
        if (existingPartner) {
           // B's existing details take precedence over A's input
           finalPartnerName = existingPartner.name;
           finalPartnerPhone = existingPartner.phoneNumber;
        }
      } catch {
        // Partner user doesn't exist yet - we'll create them below
      }
    }

    // 2. Create MAIN Registration
    const registration: RegistrationDocument = withTournamentFields({
      id: makeRegistrationId(cleanUserId, category, seasonId),
      userId: cleanUserId,
      userName: userName.trim(),
      category,
      status: "confirmed",
      seasonId,
      partnerId: cleanPartnerId || undefined,
      partnerName: finalPartnerName,
      partnerPhone: finalPartnerPhone,
      createdAt: now,
      updatedAt: now,
    });

    const { resource } = await container.items.create(registration);

    // 3. Handle Partner Side (User + Registration)
    if (isDoubles(category) && cleanPartnerId) {
      const usersContainer = getUsersContainer();

      // Create user for partner if they don't exist (using A's input as fallback)
      if (!existingPartner) {
        const partnerUser: UserDocument = {
          id: cleanPartnerId,
          name: finalPartnerName || cleanPartnerId,
          email: '', // Placeholder, will be filled when B logs in
          alias: cleanPartnerId,
          phoneNumber: finalPartnerPhone || '',
          tShirtSize: partnerTShirtSize || undefined,
          isAdmin: false,
          createdAt: now,
          updatedAt: now,
        };
        // Use upsert just in case of race condition
        await usersContainer.items.upsert(partnerUser);
      } else {
        // Partner exists. If they don't have a T-Shirt size yet, use the one provided by A.
        if (!existingPartner.tShirtSize && partnerTShirtSize) {
           existingPartner.tShirtSize = partnerTShirtSize;
           existingPartner.updatedAt = new Date().toISOString();
           await usersContainer.item(existingPartner.id, existingPartner.id).replace(existingPartner);
        }
      }

      // Create confirmed registration for partner
      const partnerRegId = makeRegistrationId(cleanPartnerId, category, seasonId);
      let partnerRegExists = false;
      try {
        const partnerRegPartitionKey = registrationPartitionKey({ userId: cleanPartnerId, category, seasonId });
        const { resource: existingReg } = await container.item(partnerRegId, partnerRegPartitionKey).read<RegistrationDocument>();
        if (existingReg && existingReg.status !== 'cancelled') partnerRegExists = true;
      } catch {
        // Doesn't exist
      }

      if (!partnerRegExists) {
        const partnerRegistration: RegistrationDocument = withTournamentFields({
          id: partnerRegId,
          userId: cleanPartnerId,
          userName: finalPartnerName || cleanPartnerId,
          category,
          status: "confirmed",
          seasonId,
          partnerId: cleanUserId,
          partnerName: userName.trim(),
          partnerPhone: body.userPhone ? body.userPhone.trim() : '',
          createdAt: now,
          updatedAt: now,
        });
        try {
          await container.items.create(partnerRegistration);
        } catch (e: unknown) {
          // 409 = already exists, that's fine
          const cosmosErr = e as { code?: number };
          if (cosmosErr.code !== 409) console.error('Failed to create partner registration:', e);
        }
      }
    }

    // Bust admin players cache (registrations changed)
    cacheDeleteByPrefix("admin-players:");

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
 * DELETE /api/registrations?userId=xxx&category=xxx
 * Delete a registration (hard delete).
 * Also deletes partner's registration if doubles.
 */
export async function DELETE(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const category = request.nextUrl.searchParams.get("category");

  if (!userId || !category) {
    return NextResponse.json({ error: "userId and category are required" }, { status: 400 });
  }

  const cleanUserId = String(userId).trim().toLowerCase().replace(/@.*$/, '');

  try {
     // 0.5. Verify User Identity (Anti-Spoofing)
    const session = await auth();
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email } = session.user;
    
    // Admins can delete on behalf of anyone
    if (!session.user.isAdmin) {
      const usersContainer = getUsersContainer();
      try {
        const { resources: [userDoc] } = await usersContainer.items
          .query<UserDocument>({
            query: "SELECT * FROM c WHERE c.email = @email",
            parameters: [{ name: "@email", value: email }]
          })
          .fetchAll();

        // If the logged-in user's ID (alias) doesn't match the target userId, block it.
        if (!userDoc || userDoc.id !== cleanUserId) {
            return NextResponse.json(
              { error: "Unauthorized: You can only cancel your own registrations." },
              { status: 403 }
            );
        }
      } catch (e) {
         console.error("Auth check failed", e);
         return NextResponse.json({ error: "Authorization failed" }, { status: 403 });
      }
    }

    // 1. Check Global Settings
    try {
      const settings = await getGlobalSettings();
      if (settings.registrationOpen === false) {
          // Allow admins to delete even if closed? Maybe. But for now consistency.
          // Actually, withdrawal after close might be allowed or disallowed policy wise.
          // Usually strict: no changes after lock.
          if (!session.user.isAdmin) {
            return NextResponse.json(
              { error: "Registrations are closed. You cannot withdraw at this time." },
              { status: 403 }
            );
          }
      }
    } catch {
       // Ignore
    }

    const container = getTournamentRegistrationsContainer();
    const seasonId = await getActiveSeason();
    const regId = makeRegistrationId(cleanUserId, category, seasonId);
    const regPartitionKey = registrationPartitionKey({ userId: cleanUserId, category: category as Category, seasonId });

    // 2. Fetch the registration to check for partner
    try {
      const { resource: reg } = await container.item(regId, regPartitionKey).read<RegistrationDocument>();

      if (!reg) {
        return NextResponse.json({ error: "Registration not found" }, { status: 404 });
      }

      // 3. If doubles, delete partner's registration too
      if (isDoubles(category as Category)) {
        // Also check if partnerId actually exists on the registration
        if (reg.partnerId) {
          const cleanPartnerId = reg.partnerId;
          const partnerRegId = makeRegistrationId(cleanPartnerId, category, reg.seasonId || seasonId);
          const partnerRegPartitionKey = registrationPartitionKey({ userId: cleanPartnerId, category: category as Category, seasonId: reg.seasonId || seasonId });
          try {
            await container.item(partnerRegId, partnerRegPartitionKey).delete();
          } catch (e: unknown) {
              const cosmosErr = e as { code?: number };
              // If 404, partner might have already cancelled or not existed
              if (cosmosErr?.code !== 404) {
                console.error("Failed to delete partner registration:", e);
              }
          }
        }
      }

      // 4. Delete user's registration
      await container.item(regId, regPartitionKey).delete();

      // Bust admin players cache (registrations changed)
      cacheDeleteByPrefix("admin-players:");

      return NextResponse.json({ message: "Registration cancelled" }, { status: 200 });

    } catch (e: unknown) {
      const cosmosErr = e as { code?: number };
      if (cosmosErr?.code === 404) {
         return NextResponse.json({ error: "Registration not found" }, { status: 404 });
      }
      throw e;
    }
  } catch (error) {
    console.error("Error cancelling registration:", error);
    return NextResponse.json({ error: "Failed to cancel registration" }, { status: 500 });
  }
}
