import { createId } from "$lib/server/id";
import { getDb } from "$lib/server/db";
import { hashPassword } from "better-auth/crypto";

export async function sessionHeadersFor(
  user: {
    id: string;
    email: string;
  },
  password = "password123",
) {
  const db = await getDb();
  const now = Date.now();
  const accountId = createId();

  await db
    .insertInto("account")
    .values({
      id: accountId,
      account_id: user.email,
      provider_id: "credential",
      user_id: user.id,
      access_token: null,
      refresh_token: null,
      id_token: null,
      access_token_expires_at: null,
      refresh_token_expires_at: null,
      scope: null,
      password: await hashPassword(password),
      created_at: now,
      updated_at: now,
    })
    .execute();

  const { auth } = await import("../index");
  const response = await auth.api.signInEmail({
    body: {
      email: user.email,
      password,
      rememberMe: true,
    },
    asResponse: true,
  });

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Expected Better Auth sign-in to return session cookies.");
  }

  return new Headers({ cookie });
}
