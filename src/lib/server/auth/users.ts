import { getDb } from "../db";
import { getBooleanSetting } from "../settings";
import { error } from "@sveltejs/kit";

export async function hasRegisteredUsers() {
  const db = await getDb();
  const row = await db
    .selectFrom("user")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .executeTakeFirst();
  return Number(row?.count ?? 0) > 0;
}

export async function signupAllowed() {
  if (!(await hasRegisteredUsers())) return true;
  return getBooleanSetting("signup_open", false);
}

export async function roleForNewUser() {
  return (await hasRegisteredUsers()) ? "user" : "admin";
}

export function isAdmin(user: { role?: string | null } | null | undefined) {
  return user?.role === "admin";
}

export function requireAdmin(user: { role?: string | null } | null | undefined) {
  if (!isAdmin(user)) {
    throw error(403, "Admin access required");
  }
}
