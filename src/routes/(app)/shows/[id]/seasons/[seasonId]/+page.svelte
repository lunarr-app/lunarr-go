<script lang="ts">
  import { page } from "$app/state";
  import SeasonTabs, { type SeasonTab } from "$lib/components/SeasonTabs.svelte";
  import { showSeasonHref } from "$lib/media/seasons";
  import { playbackModalHref } from "$lib/playback/links";
  import SeasonDetailHero from "./_components/SeasonDetailHero.svelte";
  import SeasonEpisodeList from "./_components/SeasonEpisodeList.svelte";

  let { data, form } = $props();

  type Episode = (typeof data.season.episodes)[number];

  const watchedCount = $derived(data.season.episodes.filter((episode) => episode.completed).length);
  const episodeCount = $derived(data.season.episodes.length);
  const playableCount = $derived(data.season.episodes.filter((episode) => episode.fileId).length);
  const missingCount = $derived(episodeCount - playableCount);
  const playableWatchedCount = $derived(
    data.season.episodes.filter((episode) => episode.fileId && episode.completed).length,
  );
  const seasonComplete = $derived(playableCount > 0 && playableWatchedCount === playableCount);
  const progressPercent = $derived(episodeCount > 0 ? Math.round((watchedCount / episodeCount) * 100) : 0);
  const nextEpisode = $derived(
    data.season.episodes.find((episode) => !episode.completed && episode.progressSeconds > 0 && episode.fileId) ??
      data.season.episodes.find((episode) => !episode.completed && episode.fileId) ??
      data.season.episodes.find((episode) => episode.fileId),
  );
  const episodeLabel = $derived(`${episodeCount} ${episodeCount === 1 ? "episode" : "episodes"}`);
  const seasonProgressLabel = $derived.by(() => {
    if (episodeCount === 0) return episodeLabel;
    if (missingCount > 0) return `${episodeLabel} · ${missingCount} missing · ${watchedCount} watched`;
    if (watchedCount === episodeCount) return `${episodeLabel} · complete`;
    return `${episodeLabel} · ${watchedCount} watched`;
  });

  function watchHref(episode: Pick<Episode, "id" | "fileId">) {
    return playbackModalHref({
      currentUrl: page.url,
      mediaItemId: episode.id,
      mediaFileId: episode.fileId,
    });
  }

  const seasonTabs = $derived(
    data.seasons.map((season): SeasonTab => ({
      id: season.id,
      title: season.title,
      seasonNumber: season.seasonNumber,
      href: showSeasonHref(data.show.id, season),
    })),
  );
</script>

<svelte:head>
  <title>{data.show.title} {data.season.title} - Lunarr</title>
  <meta name="description" content={`Browse ${data.season.title} episodes for ${data.show.title} in Lunarr.`} />
</svelte:head>

<SeasonDetailHero
  showTitle={data.show.title}
  showId={data.show.id}
  showYear={data.show.year}
  showStatus={data.show.status}
  voteAverage={data.show.voteAverage}
  seasonTitle={data.season.title}
  posterUrl={data.season.posterUrl ?? data.show.posterUrl}
  backdropUrl={data.show.backdropUrl}
  overview={data.season.overview ?? data.show.overview}
  genres={data.show.genres.slice(0, 4)}
  {seasonProgressLabel}
  {nextEpisode}
  {watchHref}
  {playableCount}
  {seasonComplete}
  {watchedCount}
  {episodeCount}
  {progressPercent}
/>

{#if form?.error}
  <p class="error">{form.error}</p>
{/if}

<div class="season-tabs-block">
  <SeasonTabs seasons={seasonTabs} activeSeasonId={data.season.id} />
</div>

<SeasonEpisodeList episodes={data.season.episodes} {watchHref} />

<style>
  .season-tabs-block {
    margin: -0.25rem 0 0.75rem;
  }
</style>
