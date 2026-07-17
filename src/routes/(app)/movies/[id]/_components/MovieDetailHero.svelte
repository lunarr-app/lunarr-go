<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import MediaHeroPlaybackActions from "$lib/components/MediaHeroPlaybackActions.svelte";
  import MediaHeroResumeBar from "$lib/components/MediaHeroResumeBar.svelte";
  import { Compass, ExternalLink, Link2 } from "@lucide/svelte";

  let {
    title,
    posterUrl,
    backdropUrl,
    overview,
    year,
    genres,
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
    year: number | null;
    genres: string[];
    primaryFile?: { id: string };
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

<MediaHero {title} {posterUrl} {backdropUrl} {overview} {year} {genres}>
  {#snippet actions()}
    <MediaHeroPlaybackActions {primaryFile} {primaryHref} {primaryActionLabel} {hasCompletedProgress} />
  {/snippet}

  {#snippet secondaryActions()}
    {#if trailerHref}
      <a class="button text" href={trailerHref} target="_blank" rel="noreferrer">
        <ExternalLink size={16} aria-hidden="true" />
        Trailer
      </a>
    {/if}
    <a class="button text" href={similarHref}>
      <Compass size={16} aria-hidden="true" />
      Similar
    </a>
    {#if canManageShares}
      <button class="button text" type="button" onclick={onShareOpen}>
        <Link2 size={16} aria-hidden="true" />
        Share
      </button>
    {/if}
  {/snippet}

  {#snippet below()}
    <MediaHeroResumeBar {resumeLabel} {resumePercent} />
  {/snippet}
</MediaHero>
