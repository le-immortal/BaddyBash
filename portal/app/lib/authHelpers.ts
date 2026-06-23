import { auth } from "@/auth";
import { getUsersContainer } from "@/app/lib/cosmosClient";
import type { UserDocument } from "@/app/lib/models";

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

/**
 * Resolve the logged-in user's internal ID (alias) from their session email.
 * Returns the userId string, or null if the user is not found.
 * Admins can optionally bypass ownership checks.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) return null;

  try {
    const container = getUsersContainer();
    const { resources } = await container.items
      .query<UserDocument>({
        query: "SELECT c.id FROM c WHERE LOWER(c.email) = @email",
        parameters: [{ name: "@email", value: session.user.email.trim().toLowerCase() }],
      })
      .fetchAll();
    return resources[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Verify that the logged-in user owns the given targetUserId,
 * or is an admin (who can access any user's data).
 * Returns { authorized: true, session } or { authorized: false }.
 */
export async function requireOwnerOrAdmin(targetUserId: string) {
  const session = await auth();
  if (!session?.user?.email) return { authorized: false as const, session: null };

  // Admins bypass ownership check
  if (session.user.isAdmin) return { authorized: true as const, session };

  const cleanTarget = String(targetUserId).trim().toLowerCase();

  // A user always owns the record whose id equals their own alias (the email
  // local-part). This authorizes first-time users who have NOT yet been
  // provisioned into Cosmos (provisioning is skipped for dev/GitHub logins and
  // is best-effort in prod), and it is robust to email-casing differences —
  // without it, the onboarding self-PATCH/POST would 403 before the dashboard's
  // 404->POST create fallback could ever run.
  const sessionAlias = session.user.email.trim().toLowerCase().replace(/@.*$/, '');
  if (sessionAlias && cleanTarget === sessionAlias) {
    return { authorized: true as const, session };
  }

  // Legacy fallback: users whose stored alias differs from their email local-part
  // are resolved via a case-insensitive email lookup.
  try {
    const container = getUsersContainer();
    const { resources } = await container.items
      .query<UserDocument>({
        query: "SELECT c.id FROM c WHERE LOWER(c.email) = @email",
        parameters: [{ name: "@email", value: session.user.email.trim().toLowerCase() }],
      })
      .fetchAll();

    if (resources[0]?.id === cleanTarget) {
      return { authorized: true as const, session };
    }
  } catch {
    // Fall through to unauthorized
  }

  return { authorized: false as const, session };
}
