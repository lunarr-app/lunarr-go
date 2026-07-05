import { createContinueMoviesLoad } from "../_list-page.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = createContinueMoviesLoad();
