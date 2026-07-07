<script lang="ts">
  import MediaHero from "$lib/components/MediaHero.svelte";
  import { Calendar, Check, ChevronLeft, CirclePlay, Clock3, RotateCcw, Star } from "@lucide/svelte";

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
