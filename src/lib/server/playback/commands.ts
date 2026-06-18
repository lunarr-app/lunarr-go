import { getShowDetail } from "../media/shows";
import { markWatched } from "./index";

export async function markSeasonWatched(input: {
  userId: string;
  showId: string;
  seasonId: string;
  completed: boolean;
}) {
  const detail = await getShowDetail(input.showId, input.userId);
  if (!detail) throw new Error("Show not found.");

  const season = detail.seasons.find((season) => season.id === input.seasonId);
  if (!season) throw new Error("Season not found.");

  const playableEpisodes = season.episodes.filter((episode) => episode.fileId);
  if (playableEpisodes.length === 0) throw new Error("Season has no playable episodes.");

  for (const episode of playableEpisodes) {
    await markWatched({
      userId: input.userId,
      mediaItemId: episode.id,
      mediaFileId: episode.fileId!,
      completed: input.completed,
    });
  }
}
