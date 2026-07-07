<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import MediaHeroPlaybackActions from "$lib/components/MediaHeroPlaybackActions.svelte";
  import MediaHeroResumeBar from "$lib/components/MediaHeroResumeBar.svelte";
  import { Calendar, Clock3, ExternalLink, Link2, Sparkles, Star } from "@lucide/svelte";

  let {
    title,
    posterUrl,
    backdropUrl,
    overview,
    genres,
    releaseLabel,
    runtimeLabel,
    ratingLabel,
    primaryFile,
    primaryHref,
    primaryActionLabel,
    hasCompletedProgress,
    resumeLabel,
    resumePercent,
    trailerHref,
    similarHref,
    canManageShares,
    onShareOpen,
  }: {
    title: string;
    posterUrl: string | null;
    backdropUrl: string | null;
    overview: string | null;
    genres: string[];
    releaseLabel: string | null;
    runtimeLabel: string | null;
    ratingLabel: string | null;
    primaryFile: { id: string } | undefined;
    primaryHref: string;
    primaryActionLabel: string;
    hasCompletedProgress: boolean;
    resumeLabel: string | null;
    resumePercent: number;
    trailerHref: string | null;
    similarHref: string;
    canManageShares: boolean;
    onShareOpen: () => void;
  } = $props();
</script>

<MediaHero {title} {posterUrl} {backdropUrl} {overview} {genres}>
  {#snippet facts()}
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
    {#if trailerHref}
      <a class="button secondary" href={trailerHref} target="_blank" rel="noreferrer">
        <ExternalLink size={16} aria-hidden="true" />
        Trailer
      </a>
    {/if}
    <a class="button secondary" href={similarHref}>
      <Sparkles size={16} aria-hidden="true" />
      Similar
    </a>
    {#if canManageShares}
      <button class="button secondary" type="button" onclick={onShareOpen}>
        <Link2 size={16} aria-hidden="true" />
        Share
      </button>
    {/if}
  {/snippet}

  {#snippet below()}
    <MediaHeroResumeBar {resumeLabel} {resumePercent} />
  {/snippet}
</MediaHero>
