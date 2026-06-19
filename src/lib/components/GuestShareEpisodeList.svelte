<script lang="ts">
  import SeasonTabs from "$lib/components/SeasonTabs.svelte";
  import { formatEpisodeCode, formatMediaDuration } from "$lib/media/format";
  import type { SharePageData } from "$lib/shares/types";
  import { CirclePlay } from "@lucide/svelte";

  type ShareSeason = Extract<SharePageData, { kind: "show" }>["seasons"][number];

  let {
    seasons,
    onPlay,
  }: {
    seasons: ShareSeason[];
    onPlay: (episodeId: string) => void;
  } = $props();

  let selectedSeasonId = $state("");

  const activeSeason = $derived(seasons.find((season) => season.id === selectedSeasonId) ?? seasons[0] ?? null);

  const seasonTabs = $derived(
    seasons.map((season) => ({
      id: season.id,
      title: season.title,
      seasonNumber: season.seasonNumber,
    })),
  );

  $effect(() => {
    if (!seasons.some((season) => season.id === selectedSeasonId)) {
      selectedSeasonId = seasons[0]?.id ?? "";
    }
  });
</script>

<section class="episodes-section" aria-label="Episodes">
  <SeasonTabs
    seasons={seasonTabs}
    activeSeasonId={activeSeason?.id ?? ""}
    onSelect={(seasonId) => (selectedSeasonId = seasonId)}
  />

  {#if activeSeason}
    <div role="tabpanel">
      <div class="episodes">
        {#each activeSeason.episodes as episode (episode.id)}
          <article class="episode-row">
            <div class="still" aria-hidden="true">
              {#if episode.stillUrl}
                <img src={episode.stillUrl} alt="" loading="lazy" />
              {:else}
                <span>{formatEpisodeCode(episode, { style: "short" })}</span>
              {/if}
            </div>
            <div class="episode-main">
              <div class="episode-heading">
                <span>{formatEpisodeCode(episode, { style: "short" })}</span>
                <h3>{episode.title}</h3>
              </div>
              {#if episode.runtimeSeconds}
                <p class="episode-runtime">{formatMediaDuration(episode.runtimeSeconds)}</p>
              {/if}
              {#if episode.overview}
                <p class="episode-overview">{episode.overview}</p>
              {/if}
            </div>
            <button class="secondary compact play-button" type="button" onclick={() => onPlay(episode.id)}>
              <CirclePlay size={15} aria-hidden="true" />
              Play
            </button>
          </article>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .episodes-section {
    display: grid;
    gap: 1rem;
  }

  .episodes {
    display: grid;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-surface);
  }

  .episode-row {
    display: grid;
    grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr) auto;
    gap: 0.9rem;
    align-items: center;
    padding: 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .episode-row:last-child {
    border-bottom: 0;
  }

  .still {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 8px;
    background: var(--color-card);
    color: var(--color-subtle);
    font-weight: 800;
  }

  .still img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .episode-main {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .episode-heading {
    display: grid;
    gap: 0.1rem;
  }

  .episode-heading > span {
    color: var(--color-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }

  .episode-heading h3 {
    margin: 0;
    font-size: 1rem;
    line-height: 1.25;
  }

  .episode-runtime {
    margin: 0;
    color: var(--color-muted);
    font-size: 0.84rem;
  }

  .episode-overview {
    margin: 0;
    color: var(--color-subtle);
    font-size: 0.92rem;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .play-button {
    min-height: 2rem;
    padding: 0 0.7rem;
    white-space: nowrap;
  }

  @media (max-width: 760px) {
    .episode-row {
      grid-template-columns: minmax(8rem, 10rem) minmax(0, 1fr);
    }

    .play-button {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
</style>
