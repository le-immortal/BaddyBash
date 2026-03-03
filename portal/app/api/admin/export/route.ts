import { NextResponse } from "next/server";
import { getUsersContainer, getRegistrationsContainer } from "@/app/lib/cosmosClient";
import { requireAdmin } from "@/app/lib/authHelpers";
import { UserDocument, RegistrationDocument } from "@/app/lib/models";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const usersContainer = getUsersContainer();
    const regsContainer = getRegistrationsContainer();

    // 1. Fetch all users
    const { resources: users } = await usersContainer.items
      .query<UserDocument>("SELECT * FROM c")
      .fetchAll();

    // 2. Fetch all confirmed registrations
    const { resources: registrations } = await regsContainer.items
      .query<RegistrationDocument>("SELECT * FROM c WHERE c.status = 'confirmed'")
      .fetchAll();

    // 3. Map registrations to users
    const userRegMap = new Map<string, string[]>();
    registrations.forEach(reg => {
      // Primary player
      const events = userRegMap.get(reg.userId) || [];
      if (!events.includes(reg.category)) events.push(reg.category);
      userRegMap.set(reg.userId, events);

      // Partner (if any) - Partners might not be in the Users container if they are external
      // But in our system, partners are usually Users too? 
      // Actually, partnerId is stored. If partner exists in Users, we should see them in the users list.
      // If partner doesn't exist in Users (e.g. manually entered name), we might miss them here.
      // However, current system encourages partners to register.
      // Let's stick to users for now.
    });

    // 4. Generate CSV
    const headers = ["Alias", "Name", "Email", "Phone", "T-Shirt Size", "Registered Events"];
    const rows = users.map(user => {
      const events = userRegMap.get(user.id) || [];
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

      return [
        escape(user.alias || user.id),
        escape(user.name),
        escape(user.email),
        escape(user.phoneNumber),
        escape(user.tShirtSize),
        escape(registeredEvents)
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="baddybash_2026_players_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error("Error exporting players:", error);
    return NextResponse.json({ error: "Failed to export players" }, { status: 500 });
  }
}
