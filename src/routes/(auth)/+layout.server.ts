import { listAuthBackgroundPosters } from "$lib/server/media/auth-background";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  return {
    authBackgroundPosters: await listAuthBackgroundPosters(),
  };
};
