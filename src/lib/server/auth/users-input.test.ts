import { describe, expect, test } from "bun:test";
import { UserManagementError, parseCreateUserInput, parseUpdateUserRoleInput } from "./users-input";

describe("users-input", () => {
  test("parses create and role input from JSON and form data", () => {
    expect(
      parseCreateUserInput({
        name: "Viewer",
        email: "new@example.com",
        password: "password123",
        role: "user",
      }),
    ).toEqual({
      name: "Viewer",
      email: "new@example.com",
      password: "password123",
      role: "user",
    });

    const form = new FormData();
    form.set("name", "Viewer");
    form.set("email", "new@example.com");
    form.set("password", "password123");
    form.set("role", "admin");
    expect(parseCreateUserInput(form)).toEqual({
      name: "Viewer",
      email: "new@example.com",
      password: "password123",
      role: "admin",
    });

    expect(parseUpdateUserRoleInput({ role: "admin" })).toEqual({ role: "admin" });

    const roleForm = new FormData();
    roleForm.set("role", "user");
    expect(parseUpdateUserRoleInput(roleForm)).toEqual({ role: "user" });

    expect(() => parseCreateUserInput({ email: "x@example.com", password: "short" })).toThrow(UserManagementError);
  });
});
