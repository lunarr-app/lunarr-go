<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import MediaCastRail from "$lib/components/MediaCastRail.svelte";
  import MediaDetailLayout from "$lib/components/MediaDetailLayout.svelte";
  import MediaFilesSection from "$lib/components/MediaFilesSection.svelte";
  import FixMatchModal from "$lib/components/FixMatchModal.svelte";
  import ShareLinkModal from "$lib/components/ShareLinkModal.svelte";
  import { deriveDetailPlaybackState } from "$lib/media/detail-playback";
  import { revertFixMatch } from "$lib/media/fix-match-client";
  import {
    formatFileCountLabel,
    formatMediaDuration,
    formatVoteAverageLabel,
    formatVoteCountLabel,
  } from "$lib/media/format";
  import { playbackModalHref } from "$lib/playback/links";
  import MovieDetailHero from "./_components/MovieDetailHero.svelte";
  import MovieMetadataSidebar from "./_components/MovieMetadataSidebar.svelte";

  let { data, form } = $props();
  let shareModalOpen = $state(false);
  let fixMatchOpen = $state(false);
  let revertError = $state<string | null>(null);

  async function handleRevertMatch() {
    revertError = null;
    try {
      const result = await revertFixMatch("movie", data.movie.id);
      await goto(result.mediaItemId ? `/movies/${result.mediaItemId}` : "/movies");
      await invalidateAll();
    } catch (error) {
      revertError = error instanceof Error ? error.message : "Could not revert the match.";
    }
  }

  const runtimeLabel = $derived(data.movie.runtime_seconds ? formatMediaDuration(data.movie.runtime_seconds) : null);
  const ratingLabel = $derived(formatVoteAverageLabel(data.movie.vote_average));
  const voteCountLabel = $derived(formatVoteCountLabel(data.movie.vote_count));
  const releaseLabel = $derived(data.movie.release_date ?? (data.movie.year ? String(data.movie.year) : null));
  const playback = $derived(deriveDetailPlaybackState(data.files, data.progress));
  const primaryHref = $derived(
    playback.primaryFile
      ? playbackModalHref({
          currentUrl: page.url,
          mediaItemId: data.movie.id,
          mediaFileId: playback.primaryFile.id,
        })
      : `/movies/${data.movie.id}`,
  );
  const totalSizeBytes = $derived(data.files.reduce((total, file) => total + Number(file.size_bytes ?? 0), 0));
  const fileCountLabel = $derived(formatFileCountLabel(data.files.length));
  const directorLabel = $derived(data.directors.join(", "));
  const writerLabel = $derived(data.writers.join(", "));
  const trailerHref = $derived(
    data.movie.trailer_site === "YouTube" && data.movie.trailer_key
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(data.movie.trailer_key)}`
      : null,
  );
  const providerLabel = $derived(data.movie.provider ? data.movie.provider.toUpperCase() : "Local");
</script>

<svelte:head>
  <title>{data.movie.title} - Lunarr</title>
  <meta
    name="description"
    content={data.movie.overview ?? `View files, metadata, and playback options for ${data.movie.title}.`}
  />
</svelte:head>

<MovieDetailHero
  title={data.movie.title}
  posterUrl={data.posterUrl}
  backdropUrl={data.backdropUrl}
  overview={data.movie.overview}
  year={data.movie.year}
  genres={data.genres}
  primaryFile={playback.primaryFile}
  {primaryHref}
  primaryActionLabel={playback.primaryActionLabel}
  hasCompletedProgress={playback.hasCompletedProgress}
  resumeLabel={playback.resumeLabel}
  resumePercent={playback.resumePercent}
  {trailerHref}
  similarHref={`/movies/${data.movie.id}/similar`}
  inWatchlist={data.inWatchlist}
  canManageShares={data.canManageShares}
  onShareOpen={() => (shareModalOpen = true)}
/>

<MediaDetailLayout>
  {#snippet main()}
    <MediaFilesSection
      mediaItemId={data.movie.id}
      files={data.files}
      progress={data.progress}
      primaryFileId={playback.primaryFile?.id}
      formError={form?.error}
    />
    <MediaCastRail cast={data.cast} />
  {/snippet}

  {#snippet aside()}
    <MovieMetadataSidebar
      movie={data.movie}
      onFixMatchOpen={() => (fixMatchOpen = true)}
      onRevertMatch={() => void handleRevertMatch()}
      canManageMetadata={data.canManageMetadata}
      tmdbConfigured={data.tmdbConfigured}
      manualMatch={Boolean(data.movie.manual_match)}
      {ratingLabel}
      {voteCountLabel}
      {runtimeLabel}
      {providerLabel}
      {directorLabel}
      {writerLabel}
      {fileCountLabel}
      {totalSizeBytes}
      productionCompanies={data.productionCompanies}
      keywords={data.keywords}
      metadataError={revertError ?? form?.metadataError}
    />
  {/snippet}
</MediaDetailLayout>

{#if shareModalOpen}
  <ShareLinkModal
    title={data.movie.title}
    kind="movie"
    mediaItemId={data.movie.id}
    onClose={() => (shareModalOpen = false)}
  />
{/if}

{#if fixMatchOpen}
  <FixMatchModal kind="movie" mediaItemId={data.movie.id} onClose={() => (fixMatchOpen = false)} />
{/if}
