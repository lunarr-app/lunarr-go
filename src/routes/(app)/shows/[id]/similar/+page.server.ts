import { createSimilarShowPageLoad } from "#lib/server/media/similar-page-load.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = createSimilarShowPageLoad();
