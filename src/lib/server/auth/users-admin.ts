import { getDb } from "../db";
import { auth } from "./index";
import { countOtherAdmins } from "./admin-safeguards";
import { UserManagementError, type UserRole } from "./users-input";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  banned: boolean;
  createdAt: string;
  updatedAt: string;
};

type BetterAuthUserRecord = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
};

function isoDate(value: Date | string | number | null | undefined) {
  if (value == null) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : new Date(0).toISOString();
}

function toManagedUser(user: BetterAuthUserRecord): ManagedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === "admin" ? "admin" : "user",
    banned: Boolean(user.banned),
    createdAt: isoDate(user.createdAt),
    updatedAt: isoDate(user.updatedAt),
  };
}

function isForbiddenError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("status" in error && (error.status === 403 || error.status === "FORBIDDEN")) return true;
  if ("message" in error) {
    const message = String(error.message).toLowerCase();
    return message.includes("forbidden") || message.includes("not allowed");
  }
  return false;
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("status" in error && (error.status === 404 || error.status === "NOT_FOUND")) return true;
  if ("message" in error) {
    const message = String(error.message).toLowerCase();
    return message.includes("not found");
  }
  return false;
}

function mapAuthError(error: unknown, fallback: string) {
  if (error instanceof UserManagementError) return error;
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
  if (isNotFoundError(error)) return new UserManagementError(message, 404);
  if (isForbiddenError(error)) return new UserManagementError(message, 403);
  return new UserManagementError(message, 400);
}

async function getManagedUserById(userId: string): Promise<ManagedUser | null> {
  const db = await getDb();
  const row = await db
    .selectFrom("user")
    .select(["id", "name", "email", "role", "banned", "created_at", "updated_at"])
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!row) return null;
  return toManagedUser({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    banned: Boolean(row.banned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listManagedUsers(headers: Headers): Promise<ManagedUser[]> {
  try {
    const result = await auth.api.listUsers({
      query: {
        limit: 500,
        sortBy: "name",
        sortDirection: "asc",
      },
      headers,
    });
    return result.users.map((user) => toManagedUser(user));
  } catch (error) {
    throw mapAuthError(error, "Could not list users.");
  }
}

export async function createManagedUser(input: {
  headers: Headers;
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}): Promise<ManagedUser> {
  try {
    const created = await auth.api.createUser({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
        role: input.role ?? "user",
      },
      headers: input.headers,
    });
    return toManagedUser(created.user);
  } catch (error) {
    throw mapAuthError(error, "Could not create user.");
  }
}

export async function updateManagedUserRole(input: {
  headers: Headers;
  userId: string;
  role: UserRole;
}): Promise<ManagedUser> {
  const existing = await getManagedUserById(input.userId);
  if (!existing) throw new UserManagementError("User not found.", 404);
  if (existing.role === input.role) return existing;

  if (existing.role === "admin" && input.role === "user") {
    const otherAdmins = await countOtherAdmins(input.userId);
    if (otherAdmins < 1) {
      throw new UserManagementError("At least one admin must remain.");
    }
  }

  try {
    const updated = await auth.api.setRole({
      body: {
        userId: input.userId,
        role: input.role,
      },
      headers: input.headers,
    });
    return toManagedUser(updated.user);
  } catch (error) {
    throw mapAuthError(error, "Could not update user.");
  }
}

export async function deleteManagedUser(input: { headers: Headers; userId: string }): Promise<void> {
  const existing = await getManagedUserById(input.userId);
  if (!existing) throw new UserManagementError("User not found.", 404);

  try {
    await auth.api.removeUser({
      body: {
        userId: input.userId,
      },
      headers: input.headers,
    });
  } catch (error) {
    throw mapAuthError(error, "Could not delete user.");
  }
}

export function userManagementHttpStatus(error: unknown) {
  if (error instanceof UserManagementError) return error.status;
  if (isNotFoundError(error)) return 404;
  if (isForbiddenError(error)) return 403;
  return 400;
}
