import { NextRequest, NextResponse } from "next/server";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import { requireAdmin } from "@/app/lib/authHelpers";
import { UserDocument, RegistrationDocument } from "@/app/lib/models";
import { resolveSeasonParam } from "@/app/lib/settings";
import { getTournamentRegistrationsContainer } from "@/app/lib/tournamentData";

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const seasonParam = request.nextUrl.searchParams.get("season");
    const seasonId = await resolveSeasonParam(seasonParam, 'admin');

    const usersContainer = getUsersContainer();
    const regsContainer = getTournamentRegistrationsContainer();

    // 1. Fetch all confirmed registrations for this season
    const { resources: registrations } = await regsContainer.items
      .query<RegistrationDocument>({
        query: "SELECT * FROM c WHERE c.status = 'confirmed' AND c.seasonId = @seasonId",
        parameters: [{ name: "@seasonId", value: seasonId }],
      })
      .fetchAll();

    // 2. Fetch only users who are registered in the selected season
    const registeredUserIds = [...new Set(registrations.map((reg) => reg.userId).filter(Boolean))];
    const userMap = new Map<string, UserDocument>();
    const BATCH = 50;

    for (let i = 0; i < registeredUserIds.length; i += BATCH) {
      const chunk = registeredUserIds.slice(i, i + BATCH);
      const results = await Promise.all(
        chunk.map((userId) =>
          usersContainer
            .item(userId, userId)
            .read<UserDocument>()
            .then((result) => result.resource)
            .catch(() => null)
        )
      );

      for (const user of results) {
        if (user) {
          userMap.set(user.id, user);
        }
      }
    }

    // 3. Map registrations to users
    const userRegMap = new Map<string, string[]>();
    const firstRegistrationMap = new Map<string, RegistrationDocument>();
    registrations.forEach(reg => {
      const events = userRegMap.get(reg.userId) || [];
      if (!events.includes(reg.category)) events.push(reg.category);
      userRegMap.set(reg.userId, events);
      if (!firstRegistrationMap.has(reg.userId)) {
        firstRegistrationMap.set(reg.userId, reg);
      }
    });

    // 4. Generate CSV
    const headers = ["Alias", "Name", "Email", "Phone", "T-Shirt Size", "Registered Events"];
    const rows = registeredUserIds
      .map((userId) => {
        const user = userMap.get(userId);
        const firstRegistration = firstRegistrationMap.get(userId);
        if (!firstRegistration) {
          return null;
        }

        const events = userRegMap.get(userId) || [];
        const registeredEvents = events.join(", ");

        // Escape fields that might contain commas
        const escape = (field: string | undefined) => {
          if (!field) return "";
          const s = String(field);
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        };

        return {
          sortName: (user?.name || firstRegistration.userName || userId).toLowerCase(),
          row: [
            escape(user?.alias || userId),
            escape(user?.name || firstRegistration.userName || userId),
            escape(user?.email),
            escape(user?.phoneNumber),
            escape(user?.tShirtSize),
            escape(registeredEvents)
          ].join(","),
        };
      })
      .filter((entry): entry is { sortName: string; row: string } => !!entry)
      .sort((a, b) => a.sortName.localeCompare(b.sortName))
      .map((entry) => entry.row);

    const csvContent = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="baddybash_${seasonId}_players_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error("Error exporting players:", error);
    return NextResponse.json({ error: "Failed to export players" }, { status: 500 });
  }
}
