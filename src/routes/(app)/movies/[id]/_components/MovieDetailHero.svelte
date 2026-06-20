<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import { Calendar, Check, CirclePlay, Clock3, ExternalLink, Link2, RotateCcw, Sparkles, Star } from "@lucide/svelte";

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
    {#if primaryFile}
      <a class="button primary-action" href={primaryHref}>
        <CirclePlay size={19} aria-hidden="true" />
        {primaryActionLabel}
      </a>
      <form class="inline-action" method="POST" action="?/watched">
        <input type="hidden" name="fileId" value={primaryFile.id} />
        <button class="secondary" name="completed" value={hasCompletedProgress ? "false" : "true"}>
          {#if hasCompletedProgress}
            <RotateCcw size={16} aria-hidden="true" />
            Mark unwatched
          {:else}
            <Check size={16} aria-hidden="true" />
            Mark watched
          {/if}
        </button>
      </form>
    {/if}
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
    {#if resumeLabel}
      <div class="resume">
        <span>{resumeLabel}</span>
        <div aria-hidden="true">
          <span style={`width: ${resumePercent}%`}></span>
        </div>
      </div>
    {/if}
  {/snippet}
</MediaHero>

<style>
  .resume {
    display: grid;
    gap: 0.35rem;
    width: min(100%, 24rem);
    color: var(--color-subtle);
    font-size: 0.9rem;
    font-weight: 700;
  }

  .resume div {
    height: 0.28rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--color-border-strong);
  }

  .resume div span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--color-accent);
  }
</style>
