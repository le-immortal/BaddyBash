import { NextResponse } from "next/server";
import { initializeDatabase } from "@/app/lib/cosmosClient";
import { requireAdmin } from "@/app/lib/authHelpers";

/**
 * POST /api/setup
 * Initialize the Cosmos DB database and containers.
 * Requires admin authentication.
 */
export async function POST() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 401 });
  }

  try {
    await initializeDatabase();
    return NextResponse.json({
      message: "Database initialized successfully",
      database: process.env.COSMOS_DATABASE || "baddybash",
      containers: ["users", "registrations", "matches"],
    });
  } catch (error: unknown) {
    console.error("Error initializing database:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to initialize database", details: message },
      { status: 500 }
    );
  }
}
