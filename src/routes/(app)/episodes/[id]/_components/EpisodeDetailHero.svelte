<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import MediaHeroPlaybackActions from "$lib/components/MediaHeroPlaybackActions.svelte";
  import MediaHeroResumeBar from "$lib/components/MediaHeroResumeBar.svelte";
  import { Calendar, Clock3, Star } from "@lucide/svelte";

  let {
    title,
    posterUrl,
    backdropUrl,
    overview,
    showTitle,
    showHref,
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
    showTitle: string;
    showHref: string;
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
  {#snippet subtitle()}
    <div class="hero-subtitle">
      <a href={showHref}>{showTitle}</a>
      <span aria-hidden="true">·</span>
      <a href={seasonHref}>{seasonLabel}</a>
    </div>
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

<style>
  .hero-subtitle {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    color: var(--hero-text-soft);
  }

  .hero-subtitle a {
    color: var(--hero-text-soft);
    text-decoration: none;
  }

  .hero-subtitle a:hover {
    color: var(--hero-text);
    text-decoration: underline;
  }
</style>
