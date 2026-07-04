import { createApiKeyForUserId } from "../api-keys";

/** Creates an API key for a specific user without a session. Test-only helper. */
export async function createApiKeyForUser(input: { userId: string; name?: string; expiresIn?: number }) {
  return createApiKeyForUserId(input);
}
