import { getDb } from "../db";

export async function countOtherAdmins(excludingUserId: string): Promise<number> {
  const db = await getDb();
  const row = await db
    .selectFrom("user")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("role", "=", "admin")
    .where("id", "!=", excludingUserId)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

function userIdFromHookContext(ctx: unknown): string | null {
  if (!ctx || typeof ctx !== "object" || !("body" in ctx)) return null;
  const body = (ctx as { body?: unknown }).body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const userId = (body as { userId?: unknown }).userId;
  if (userId == null || userId === "") return null;
  return String(userId);
}

function primaryRole(role: unknown) {
  return String(role ?? "")
    .split(",")[0]
    ?.trim();
}

function isDemotingFromAdmin(currentRole: string, nextRole: unknown) {
  if (currentRole !== "admin") return false;
  const role = primaryRole(nextRole);
  return role !== "" && role !== "admin";
}

export async function guardLastAdminOnUserRoleUpdate(data: Record<string, unknown>, ctx: unknown) {
  if (!("role" in data)) return { data };

  const userId = userIdFromHookContext(ctx);
  if (!userId) return { data };

  const db = await getDb();
  const existing = await db.selectFrom("user").select(["role"]).where("id", "=", userId).executeTakeFirst();
  if (!existing || !isDemotingFromAdmin(existing.role, data.role)) {
    return { data };
  }

  if ((await countOtherAdmins(userId)) < 1) {
    return false;
  }

  return { data };
}
