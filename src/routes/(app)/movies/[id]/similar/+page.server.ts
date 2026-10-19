import { createSimilarMoviePageLoad } from "#lib/server/media/similar-page-load.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = createSimilarMoviePageLoad();
