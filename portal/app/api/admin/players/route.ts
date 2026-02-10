import { NextRequest, NextResponse } from "next/server";
import { getRegistrationsContainer } from "@/app/lib/cosmosClient";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { RegistrationDocument, UserDocument } from "@/app/lib/models";

/**
 * GET /api/admin/players
 * Returns all players with their registrations for the admin dashboard.
 */
export async function GET() {
  try {
    const usersContainer = getUsersContainer();
    const registrationsContainer = getRegistrationsContainer();

    // Fetch all users
    const { resources: users } = await usersContainer.items
      .query<UserDocument>("SELECT * FROM c ORDER BY c.name")
      .fetchAll();

    // Fetch all active registrations
    const { resources: registrations } = await registrationsContainer.items
      .query<RegistrationDocument>(
        "SELECT * FROM c WHERE c.status != 'cancelled'"
      )
      .fetchAll();

    // Build a map: userId -> registrations
    const regMap = new Map<string, RegistrationDocument[]>();
    for (const reg of registrations) {
      const list = regMap.get(reg.userId) || [];
      list.push(reg);
      regMap.set(reg.userId, list);
    }

    // Combine into response
    const players = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      registrations: regMap.get(user.id) || [],
    }));

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
