import { createSimilarMoviePageLoad } from "$lib/server/media/similar-page-load";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = createSimilarMoviePageLoad();
