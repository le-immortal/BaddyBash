import { getPartnerPostsContainer, getUsersContainer } from "@/app/lib/cosmosClient";
import { makeSeasonCategory } from "@/app/lib/tournamentData";
import type {
  Category,
  PartnerPostDocument,
  PartnerPostStatus,
  SkillLevel,
  UserDocument,
} from "@/app/lib/models";

export const DOUBLES_PARTNER_POST_CATEGORIES: Category[] = ["MD", "WD", "XD"];
export const SKILL_LEVELS: SkillLevel[] = ["beginner", "intermediate", "advanced"];
export const PARTNER_POST_STATUSES: PartnerPostStatus[] = ["open", "closed"];
export interface PartnerPostResponse {
  id: string;
  displayName: string;
  avatar?: string;
  category: Category;
  skillLevel: SkillLevel;
  alias: string;
  status: PartnerPostStatus;
  createdAt: string;
  isOwner: boolean;
}

export function isPartnerPostCategory(value: unknown): value is Category {
  return typeof value === "string" && DOUBLES_PARTNER_POST_CATEGORIES.includes(value as Category);
}

export function isSkillLevel(value: unknown): value is SkillLevel {
  return typeof value === "string" && SKILL_LEVELS.includes(value as SkillLevel);
}

export function isPartnerPostStatus(value: unknown): value is PartnerPostStatus {
  return typeof value === "string" && PARTNER_POST_STATUSES.includes(value as PartnerPostStatus);
}

export function toPartnerPostResponse(
  post: PartnerPostDocument,
  requesterUserId: string
): PartnerPostResponse {
  return {
    id: post.id,
    displayName: post.displayName,
    ...(post.avatar ? { avatar: post.avatar } : {}),
    category: post.category,
    skillLevel: post.skillLevel,
    alias: post.alias,
    status: post.status,
    createdAt: post.createdAt,
    isOwner: post.userId === requesterUserId,
  };
}

export function parsePartnerPostId(id: string): {
  userId: string;
  category: Category;
  seasonId: string;
  seasonCategory: string;
} | null {
  const parts = id.split("_");
  if (parts.length < 3) return null;

  const seasonId = parts.at(-1);
  const category = parts.at(-2);
  const userId = parts.slice(0, -2).join("_");

  if (!userId || !seasonId || !isPartnerPostCategory(category)) return null;

  return {
    userId,
    category,
    seasonId,
    seasonCategory: makeSeasonCategory(seasonId, category),
  };
}

export async function getSessionUserByEmail(email: string): Promise<UserDocument | null> {
  const usersContainer = getUsersContainer();
  const { resources } = await usersContainer.items
    .query<UserDocument>({
      query: "SELECT TOP 1 * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: email.trim().toLowerCase() }],
    })
    .fetchAll();

  return resources[0] ?? null;
}

export async function readPartnerPostById(id: string): Promise<PartnerPostDocument | null> {
  const parsed = parsePartnerPostId(id);
  if (!parsed) return null;

  const container = getPartnerPostsContainer();
  try {
    const { resource } = await container
      .item(id, parsed.seasonCategory)
      .read<PartnerPostDocument>();
    return resource ?? null;
  } catch (error) {
    const cosmosError = error as { code?: number; statusCode?: number };
    if (cosmosError.code === 404 || cosmosError.statusCode === 404) return null;
    throw error;
  }
}
