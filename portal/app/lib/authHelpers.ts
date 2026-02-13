import { auth } from "@/auth";

/**
 * Check if the current user is an admin.
 * Returns the session if admin, null otherwise.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.isAdmin) return null;
  return session;
}
