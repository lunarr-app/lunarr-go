import { hasRegisteredUsers } from "./auth/users";
import { APP_VERSION } from "./version";

export async function getHealthStatus() {
  try {
    const setupComplete = await hasRegisteredUsers();
    return { ok: true, setupComplete, version: APP_VERSION };
  } catch {
    return { ok: false, setupComplete: false, version: APP_VERSION };
  }
}
