<script lang="ts">
  import { page } from "$app/state";
  import MediaDetailLayout from "$lib/components/MediaDetailLayout.svelte";
  import MediaFilesSection from "$lib/components/MediaFilesSection.svelte";
  import { formatEpisodeCode, formatMediaDuration } from "$lib/media/format";
  import { showSeasonHref } from "$lib/media/seasons";
  import { playbackModalHref } from "$lib/playback/links";
  import EpisodeDetailHero from "./_components/EpisodeDetailHero.svelte";
  import EpisodeMetadataSidebar from "./_components/EpisodeMetadataSidebar.svelte";

  let { data, form } = $props();

  const episodeCode = $derived(formatEpisodeCode(data.episode));
  const seasonHref = $derived(showSeasonHref(data.show.id, data.season));
  const seasonLabel = $derived(`${data.show.title} · ${data.season.title}`);
  const firstFile = $derived(data.files[0]);
  const runtimeLabel = $derived(data.episode.runtimeSeconds ? formatMediaDuration(data.episode.runtimeSeconds) : null);
  const ratingLabel = $derived(
    data.episode.voteAverage === null || data.episode.voteAverage === undefined
      ? null
      : Number(data.episode.voteAverage).toFixed(1),
  );
  const voteCountLabel = $derived(
    data.episode.voteCount === null || data.episode.voteCount === undefined
      ? null
      : new Intl.NumberFormat(undefined, { notation: "compact" }).format(Number(data.episode.voteCount)),
  );
  const releaseLabel = $derived(data.episode.releaseDate);
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
          mediaItemId: data.episode.id,
          mediaFileId: primaryFile.id,
        })
      : `/episodes/${data.episode.id}`,
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
</script>

<svelte:head>
  <title>{data.show.title} - {episodeCode} - {data.episode.title} - Lunarr</title>
  <meta name="description" content={`Watch ${episodeCode} ${data.episode.title} from ${data.show.title} in Lunarr.`} />
</svelte:head>

<EpisodeDetailHero
  title={data.episode.title}
  posterUrl={data.episode.stillUrl ?? data.show.posterUrl}
  backdropUrl={data.show.backdropUrl}
  overview={data.episode.overview}
  {seasonHref}
  {seasonLabel}
  {episodeCode}
  {releaseLabel}
  {runtimeLabel}
  {ratingLabel}
  {primaryFile}
  {primaryHref}
  {primaryActionLabel}
  {hasCompletedProgress}
  {resumeLabel}
  {resumePercent}
/>

<MediaDetailLayout>
  {#snippet main()}
    <MediaFilesSection
      mediaItemId={data.episode.id}
      files={data.files}
      progress={data.progress}
      primaryFileId={primaryFile?.id}
      formError={form?.error}
    />
  {/snippet}

  {#snippet aside()}
    <EpisodeMetadataSidebar
      {episodeCode}
      {releaseLabel}
      {runtimeLabel}
      {ratingLabel}
      {voteCountLabel}
      showTitle={data.show.title}
      showHref={`/shows/${data.show.id}`}
      seasonTitle={data.season.title}
      {seasonHref}
      {fileCountLabel}
      {totalSizeBytes}
    />
  {/snippet}
</MediaDetailLayout>
