<script lang="ts">
  import SeasonTabs from "$lib/components/SeasonTabs.svelte";
  import { formatEpisodeCode, formatMediaDuration } from "$lib/media/format";
  import type { ShareEpisode, ShareSeasonStub } from "$lib/shares/types";
  import { fetchGuestShareSeason } from "$lib/shares/client";
  import { CirclePlay } from "@lucide/svelte";

  let {
    token,
    seasons,
    onPlay,
  }: {
    token: string;
    seasons: ShareSeasonStub[];
    onPlay: (episodeId: string) => void;
  } = $props();

  let selectedSeasonId = $state("");
  let loadedEpisodes = $state<Record<string, ShareEpisode[]>>({});
  let loadedSeasonIds = $state(new Set<string>());
  let loadingSeasonIds = $state(new Set<string>());
  let loadError = $state<string | null>(null);

  const activeSeason = $derived(seasons.find((season) => season.id === selectedSeasonId) ?? seasons[0] ?? null);
  const activeEpisodes = $derived(activeSeason ? (loadedEpisodes[activeSeason.id] ?? []) : []);
  const isLoading = $derived(activeSeason ? loadingSeasonIds.has(activeSeason.id) : false);

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

  async function ensureSeasonLoaded(seasonId: string) {
    if (loadedSeasonIds.has(seasonId) || loadingSeasonIds.has(seasonId)) return;

    loadingSeasonIds = new Set(loadingSeasonIds).add(seasonId);
    loadError = null;
    try {
      const season = await fetchGuestShareSeason(token, seasonId);
      if (!season) {
        throw new Error("Could not load shared season.");
      }
      loadedEpisodes[seasonId] = season.episodes;
      loadedSeasonIds = new Set(loadedSeasonIds).add(seasonId);
    } catch (error) {
      if (activeSeason?.id === seasonId) {
        loadError = error instanceof Error ? error.message : "Could not load episodes.";
      }
    } finally {
      const nextLoading = new Set(loadingSeasonIds);
      nextLoading.delete(seasonId);
      loadingSeasonIds = nextLoading;
    }
  }

  $effect(() => {
    const seasonId = activeSeason?.id;
    if (seasonId) {
      void ensureSeasonLoaded(seasonId);
    }
  });
</script>

<section class="episodes-section" aria-label="Episodes">
  <SeasonTabs
    seasons={seasonTabs}
    activeSeasonId={activeSeason?.id ?? ""}
    onSelect={(seasonId) => {
      selectedSeasonId = seasonId;
      loadError = null;
    }}
  />

  {#if activeSeason}
    <div role="tabpanel">
      {#if loadError}
        <p class="season-status error">{loadError}</p>
      {:else if isLoading}
        <p class="season-status">Loading episodes…</p>
      {:else if activeEpisodes.length === 0}
        <p class="season-status">No playable episodes in this season.</p>
      {:else}
        <div class="episodes">
          {#each activeEpisodes as episode (episode.id)}
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
      {/if}
    </div>
  {/if}
</section>

<style>
  .episodes-section {
    display: grid;
    gap: 1rem;
  }

  .season-status {
    margin: 0;
    color: var(--color-subtle);
    font-size: 0.95rem;
  }

  .season-status.error {
    color: var(--color-danger, #c0392b);
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
