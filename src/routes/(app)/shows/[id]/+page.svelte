<script lang="ts">
  import { page } from "$app/state";
  import MediaCastRail from "$lib/components/MediaCastRail.svelte";
  import MediaDetailLayout from "$lib/components/MediaDetailLayout.svelte";
  import ShareLinkModal from "$lib/components/ShareLinkModal.svelte";
  import { playbackModalHref } from "$lib/playback/links";
  import { formatVoteAverageLabel, formatVoteCountLabel } from "$lib/media/format";
  import ShowDetailHero from "./_components/ShowDetailHero.svelte";
  import ShowMetadataSidebar from "./_components/ShowMetadataSidebar.svelte";
  import ShowSeasonsSection from "./_components/ShowSeasonsSection.svelte";

  let { data, form } = $props();
  let shareModalOpen = $state(false);

  const totalEpisodes = $derived(data.seasons.reduce((count, season) => count + season.episodeCount, 0));
  const watchedCount = $derived(data.seasons.reduce((count, season) => count + season.watchedCount, 0));
  const progressPercent = $derived(totalEpisodes > 0 ? Math.round((watchedCount / totalEpisodes) * 100) : 0);
  const nextEpisode = $derived(data.nextEpisode ?? undefined);
  const seasonCount = $derived(data.seasons.length);
  const episodeCountLabel = $derived(`${totalEpisodes} ${totalEpisodes === 1 ? "episode" : "episodes"}`);
  const seasonCountLabel = $derived(`${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}`);
  const ratingLabel = $derived(formatVoteAverageLabel(data.show.voteAverage));
  const voteCountLabel = $derived(formatVoteCountLabel(data.show.voteCount));
  const providerLabel = $derived(data.show.provider ? data.show.provider.toUpperCase() : "Local");
  const creatorLabel = $derived(data.creators.join(", "));
  const trailerHref = $derived(
    data.show.trailerSite === "YouTube" && data.show.trailerKey
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(data.show.trailerKey)}`
      : null,
  );

  function watchHref(episode: Pick<NonNullable<typeof data.nextEpisode>, "id" | "fileId">) {
    return playbackModalHref({
      currentUrl: page.url,
      mediaItemId: episode.id,
      mediaFileId: episode.fileId,
    });
  }
</script>

<svelte:head>
  <title>{data.show.title} - Lunarr</title>
  <meta name="description" content={`Browse seasons for ${data.show.title} in Lunarr.`} />
</svelte:head>

<ShowDetailHero
  title={data.show.title}
  posterUrl={data.show.posterUrl}
  backdropUrl={data.show.backdropUrl}
  overview={data.show.overview}
  genres={data.show.genres.slice(0, 4)}
  year={data.show.year}
  status={data.show.status}
  {seasonCountLabel}
  {episodeCountLabel}
  {nextEpisode}
  {watchHref}
  {watchedCount}
  {totalEpisodes}
  {progressPercent}
  {trailerHref}
  similarHref={`/shows/${data.show.id}/similar`}
  inWatchlist={data.inWatchlist}
  canManageShares={data.canManageShares}
  onShareOpen={() => (shareModalOpen = true)}
/>

<MediaDetailLayout mainGap="2rem">
  {#snippet main()}
    <ShowSeasonsSection showId={data.show.id} showPosterUrl={data.show.posterUrl} seasons={data.seasons} />
    <MediaCastRail cast={data.cast} />
  {/snippet}

  {#snippet aside()}
    <ShowMetadataSidebar
      show={data.show}
      canManageMetadata={data.canManageMetadata}
      tmdbConfigured={data.tmdbConfigured}
      {ratingLabel}
      {voteCountLabel}
      {providerLabel}
      {creatorLabel}
      {seasonCountLabel}
      {episodeCountLabel}
      productionCompanies={data.productionCompanies}
      keywords={data.keywords}
      metadataError={form?.metadataError}
    />
  {/snippet}
</MediaDetailLayout>

{#if shareModalOpen}
  <ShareLinkModal
    title={data.show.title}
    kind="show"
    mediaItemId={data.show.id}
    seasons={data.seasons.map((season) => ({
      id: season.id,
      title: season.title,
    }))}
    onClose={() => (shareModalOpen = false)}
  />
{/if}
