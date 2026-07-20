<script lang="ts">
  import { page } from "$app/state";
  import MediaDetailLayout from "$lib/components/MediaDetailLayout.svelte";
  import MediaFilesSection from "$lib/components/MediaFilesSection.svelte";
  import { deriveDetailPlaybackState } from "$lib/media/detail-playback";
  import {
    formatEpisodeCode,
    formatFileCountLabel,
    formatMediaDuration,
    formatReleaseDate,
    formatVoteAverageLabel,
    formatVoteCountLabel,
  } from "$lib/media/format";
  import { showSeasonHref } from "$lib/media/seasons";
  import { playbackModalHref } from "$lib/playback/links";
  import EpisodeDetailHero from "./_components/EpisodeDetailHero.svelte";
  import EpisodeMetadataSidebar from "./_components/EpisodeMetadataSidebar.svelte";

  let { data, form } = $props();

  const episodeCode = $derived(formatEpisodeCode(data.episode));
  const seasonHref = $derived(showSeasonHref(data.show.id, data.season));
  const seasonLabel = $derived(data.season.title);
  const showHref = $derived(`/shows/${data.show.id}`);
  const runtimeLabel = $derived(data.episode.runtimeSeconds ? formatMediaDuration(data.episode.runtimeSeconds) : null);
  const ratingLabel = $derived(formatVoteAverageLabel(data.episode.voteAverage));
  const voteCountLabel = $derived(formatVoteCountLabel(data.episode.voteCount));
  const releaseLabel = $derived(formatReleaseDate(data.episode.releaseDate));
  const playback = $derived(deriveDetailPlaybackState(data.files, data.progress));
  const primaryHref = $derived(
    playback.primaryFile
      ? playbackModalHref({
          currentUrl: page.url,
          mediaItemId: data.episode.id,
          mediaFileId: playback.primaryFile.id,
        })
      : `/episodes/${data.episode.id}`,
  );
  const totalSizeBytes = $derived(data.files.reduce((total, file) => total + Number(file.size_bytes ?? 0), 0));
  const fileCountLabel = $derived(formatFileCountLabel(data.files.length));
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
  showTitle={data.show.title}
  {showHref}
  {seasonHref}
  {seasonLabel}
  {episodeCode}
  {releaseLabel}
  {runtimeLabel}
  primaryFile={playback.primaryFile}
  {primaryHref}
  primaryActionLabel={playback.primaryActionLabel}
  hasCompletedProgress={playback.hasCompletedProgress}
  resumeLabel={playback.resumeLabel}
  resumePercent={playback.resumePercent}
/>

<MediaDetailLayout>
  {#snippet main()}
    <MediaFilesSection
      mediaItemId={data.episode.id}
      files={data.files}
      progress={data.progress}
      primaryFileId={playback.primaryFile?.id}
      formError={form?.error}
    />
  {/snippet}

  {#snippet aside()}
    <EpisodeMetadataSidebar
      {episodeCode}
      releaseLabel={data.episode.releaseDate}
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
