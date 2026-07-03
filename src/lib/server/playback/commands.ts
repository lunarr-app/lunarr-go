import { getShowSeasonDetail } from "../media/shows";
import { markWatched } from "./index";

export async function markSeasonWatched(input: {
  userId: string;
  showId: string;
  seasonId: string;
  completed: boolean;
}) {
  const detail = await getShowSeasonDetail(input.showId, input.seasonId, input.userId);
  if (!detail) throw new Error("Show or season not found.");

  const playableEpisodes = detail.season.episodes.filter((episode) => episode.fileId);
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
