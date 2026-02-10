import { NextResponse } from "next/server";
import { initializeDatabase } from "@/app/lib/cosmosClient";

/**
 * POST /api/setup
 * Initialize the Cosmos DB database and containers.
 * Call this once when first setting up the application.
 */
export async function POST() {
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
