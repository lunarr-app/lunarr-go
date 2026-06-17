export type UserRole = "admin" | "user";

export type UserInputSource = Record<string, unknown> | FormData;

export class UserManagementError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserManagementError";
    this.status = status;
  }
}

function valueFrom(input: UserInputSource, key: string) {
  if (!(input instanceof FormData)) return input[key];
  return input.get(key);
}

function stringValue(input: UserInputSource, key: string, fallback = "") {
  return String(valueFrom(input, key) ?? fallback).trim();
}

function passwordValue(input: UserInputSource) {
  return String(valueFrom(input, "password") ?? "");
}

export function createUserDraft(input: UserInputSource) {
  return {
    name: stringValue(input, "name"),
    email: stringValue(input, "email").toLowerCase(),
    role: stringValue(input, "role", "user"),
  };
}

export function parseCreateUserInput(input: UserInputSource) {
  if (!(input instanceof FormData)) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new UserManagementError("Request body must be a JSON object.");
    }
  }

  const name = stringValue(input, "name");
  const email = stringValue(input, "email").toLowerCase();
  const password = passwordValue(input);
  const roleValue = valueFrom(input, "role");
  const role = roleValue == null || roleValue === "" ? "user" : String(roleValue).trim();

  if (!name) throw new UserManagementError("Name is required.");
  if (!email) throw new UserManagementError("Email is required.");
  if (password.length < 8) throw new UserManagementError("Password must be at least 8 characters.");
  if (role !== "admin" && role !== "user") {
    throw new UserManagementError("Role must be admin or user.");
  }

  return {
    name,
    email,
    password,
    role: role as UserRole,
  };
}

export function parseUpdateUserRoleInput(input: UserInputSource): { role: UserRole } {
  if (!(input instanceof FormData)) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new UserManagementError("Request body must be a JSON object.");
    }
  }

  const role = stringValue(input, "role");
  if (role !== "admin" && role !== "user") {
    throw new UserManagementError("Role must be admin or user.");
  }

  return { role };
}
