<script lang="ts">
  import { seasonTabLabel } from "$lib/media/format";

  export type SeasonTab = {
    id: string;
    title: string;
    seasonNumber?: number | null;
    href?: string;
  };

  let {
    seasons,
    activeSeasonId,
    onSelect,
    ariaLabel = "Seasons",
  }: {
    seasons: SeasonTab[];
    activeSeasonId: string;
    onSelect?: (seasonId: string) => void;
    ariaLabel?: string;
  } = $props();

  let tablistEl = $state<HTMLElement | null>(null);

  $effect(() => {
    activeSeasonId;
    if (!tablistEl) return;
    tablistEl.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  });
</script>

<div bind:this={tablistEl} class="season-tabs" role="tablist" aria-label={ariaLabel}>
  {#each seasons as season (season.id)}
    {@const isActive = season.id === activeSeasonId}
    {@const label = seasonTabLabel(season)}
    {#if season.href}
      <a
        class="season-tab"
        class:active={isActive}
        href={season.href}
        role="tab"
        aria-selected={isActive}
        title={season.title}
      >
        {label}
      </a>
    {:else}
      <button
        class="season-tab"
        class:active={isActive}
        type="button"
        role="tab"
        aria-selected={isActive}
        title={season.title}
        onclick={() => onSelect?.(season.id)}
      >
        {label}
      </button>
    {/if}
  {/each}
</div>

<style>
  .season-tabs {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .season-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    min-height: 2rem;
    padding: 0.2rem 0.85rem 0.35rem;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--color-subtle);
    font-size: 0.92rem;
    font-weight: 650;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
  }

  .season-tab:hover,
  .season-tab.active {
    color: var(--color-text);
  }

  .season-tab.active {
    border-bottom-color: var(--color-accent);
  }
</style>
