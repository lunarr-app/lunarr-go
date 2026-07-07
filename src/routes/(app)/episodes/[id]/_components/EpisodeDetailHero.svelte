<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import MediaHeroPlaybackActions from "$lib/components/MediaHeroPlaybackActions.svelte";
  import MediaHeroResumeBar from "$lib/components/MediaHeroResumeBar.svelte";
  import { Calendar, ChevronLeft, Clock3, Star } from "@lucide/svelte";

  let {
    title,
    posterUrl,
    backdropUrl,
    overview,
    seasonHref,
    seasonLabel,
    episodeCode,
    releaseLabel,
    runtimeLabel,
    ratingLabel,
    primaryFile,
    primaryHref,
    primaryActionLabel,
    hasCompletedProgress,
    resumeLabel,
    resumePercent,
  }: {
    title: string;
    posterUrl: string | null;
    backdropUrl: string | null;
    overview: string | null;
    seasonHref: string;
    seasonLabel: string;
    episodeCode: string | null;
    releaseLabel: string | null;
    runtimeLabel: string | null;
    ratingLabel: string | null;
    primaryFile: { id: string } | undefined;
    primaryHref: string;
    primaryActionLabel: string;
    hasCompletedProgress: boolean;
    resumeLabel: string | null;
    resumePercent: number;
  } = $props();
</script>

<MediaHero {title} {posterUrl} {backdropUrl} {overview}>
  {#snippet leading()}
    <a href={seasonHref}>
      <ChevronLeft size={16} aria-hidden="true" />
      {seasonLabel}
    </a>
  {/snippet}

  {#snippet facts()}
    {#if episodeCode}
      <span>{episodeCode}</span>
    {/if}
    {#if releaseLabel}
      <span><Calendar size={15} aria-hidden="true" />{releaseLabel}</span>
    {/if}
    {#if runtimeLabel}
      <span><Clock3 size={15} aria-hidden="true" />{runtimeLabel}</span>
    {/if}
    {#if ratingLabel}
      <span><Star size={15} aria-hidden="true" />{ratingLabel}</span>
    {/if}
  {/snippet}

  {#snippet actions()}
    <MediaHeroPlaybackActions {primaryFile} {primaryHref} {primaryActionLabel} {hasCompletedProgress} />
  {/snippet}

  {#snippet below()}
    <MediaHeroResumeBar {resumeLabel} {resumePercent} />
  {/snippet}
</MediaHero>
