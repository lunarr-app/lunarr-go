<script lang="ts">
  import { page } from "$app/state";
  import MediaCastRail from "$lib/components/MediaCastRail.svelte";
  import MediaDetailLayout from "$lib/components/MediaDetailLayout.svelte";
  import ShareLinkModal from "$lib/components/ShareLinkModal.svelte";
  import { formatMediaDuration } from "$lib/media/format";
  import { playbackModalHref } from "$lib/playback/links";
  import MovieDetailHero from "./_components/MovieDetailHero.svelte";
  import MovieFilesSection from "./_components/MovieFilesSection.svelte";
  import MovieMetadataSidebar from "./_components/MovieMetadataSidebar.svelte";

  let { data, form } = $props();
  let shareModalOpen = $state(false);

  const firstFile = $derived(data.files[0]);
  const runtimeLabel = $derived(data.movie.runtime_seconds ? formatMediaDuration(data.movie.runtime_seconds) : null);
  const ratingLabel = $derived(
    data.movie.vote_average === null || data.movie.vote_average === undefined
      ? null
      : Number(data.movie.vote_average).toFixed(1),
  );
  const voteCountLabel = $derived(
    data.movie.vote_count === null || data.movie.vote_count === undefined
      ? null
      : new Intl.NumberFormat(undefined, { notation: "compact" }).format(Number(data.movie.vote_count)),
  );
  const releaseLabel = $derived(data.movie.release_date ?? (data.movie.year ? String(data.movie.year) : null));
  const completedProgress = $derived.by(() => {
    return [...data.progress]
      .filter((item) => Boolean(item.completed))
      .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];
  });
  const hasCompletedProgress = $derived(Boolean(completedProgress));
  const resumeProgress = $derived.by(() => {
    if (hasCompletedProgress) return undefined;
    return [...data.progress]
      .filter((item) => !Boolean(item.completed) && Number(item.position_seconds ?? 0) > 0)
      .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];
  });
  const primaryFile = $derived(
    data.files.find((file) => file.id === (resumeProgress ?? completedProgress)?.media_file_id) ?? firstFile,
  );
  const primaryHref = $derived(
    primaryFile
      ? playbackModalHref({
          currentUrl: page.url,
          mediaItemId: data.movie.id,
          mediaFileId: primaryFile.id,
        })
      : `/movies/${data.movie.id}`,
  );
  const primaryActionLabel = $derived(resumeProgress ? "Resume" : hasCompletedProgress ? "Play again" : "Play");
  const resumeLabel = $derived.by(() => {
    if (!resumeProgress) return null;
    const position = Math.max(0, Math.floor(Number(resumeProgress.position_seconds ?? 0)));
    const duration =
      resumeProgress.duration_seconds === null
        ? null
        : Math.max(0, Math.floor(Number(resumeProgress.duration_seconds)));
    if (!duration) return `Resume at ${formatMediaDuration(position)}`;
    return `Resume at ${formatMediaDuration(position)} of ${formatMediaDuration(duration)}`;
  });
  const resumePercent = $derived.by(() => {
    if (!resumeProgress?.duration_seconds) return 0;
    return Math.min(
      99,
      Math.max(
        0,
        Math.round((Number(resumeProgress.position_seconds ?? 0) / Number(resumeProgress.duration_seconds)) * 100),
      ),
    );
  });
  const totalSizeBytes = $derived(data.files.reduce((total, file) => total + Number(file.size_bytes ?? 0), 0));
  const fileCountLabel = $derived(`${data.files.length} ${data.files.length === 1 ? "file" : "files"}`);
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
  genres={data.genres}
  {releaseLabel}
  {runtimeLabel}
  {ratingLabel}
  {primaryFile}
  {primaryHref}
  {primaryActionLabel}
  {hasCompletedProgress}
  {resumeLabel}
  {resumePercent}
  {trailerHref}
  similarHref={`/movies/${data.movie.id}/similar`}
  canManageShares={data.canManageShares}
  onShareOpen={() => (shareModalOpen = true)}
/>

<MediaDetailLayout>
  {#snippet main()}
    <MovieFilesSection
      movieId={data.movie.id}
      files={data.files}
      progress={data.progress}
      primaryFileId={primaryFile?.id}
      formError={form?.error}
    />
    <MediaCastRail cast={data.cast} />
  {/snippet}

  {#snippet aside()}
    <MovieMetadataSidebar
      movie={data.movie}
      canManageMetadata={data.canManageMetadata}
      tmdbConfigured={data.tmdbConfigured}
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
      metadataError={form?.metadataError}
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
