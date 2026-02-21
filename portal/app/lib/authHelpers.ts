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

/**
 * Returns true if the current user is an admin, false otherwise.
 * Unlike requireAdmin(), this never throws and always returns a boolean.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.isAdmin;
}
