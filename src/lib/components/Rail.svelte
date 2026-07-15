<script lang="ts" generics="Item extends { id: string }">
  import type { Snippet } from "svelte";

  let {
    items,
    variant = "poster",
    children,
  }: {
    items: Item[];
    variant?: "poster" | "episode";
    children: Snippet<[Item]>;
  } = $props();
</script>

<div class="rail {variant}">
  {#each items as item (item.id)}
    {@render children(item)}
  {/each}
</div>

<style>
  .rail {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: auto;
    gap: 1.1rem;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    padding: 0.1rem 0 0.85rem;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0.25rem;
    scrollbar-color: var(--color-scrollbar) transparent;
    scrollbar-width: thin;
  }

  .rail.poster {
    grid-auto-columns: clamp(8.8rem, 12vw, 10.5rem);
  }

  .rail.episode {
    grid-auto-columns: clamp(15rem, 24vw, 20rem);
  }

  .rail :global(.movie),
  .rail :global(.show),
  .rail :global(.episode) {
    scroll-snap-align: start;
  }

  .rail::-webkit-scrollbar {
    height: 0.55rem;
  }

  .rail::-webkit-scrollbar-track {
    background: transparent;
  }

  .rail::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--color-scrollbar);
  }

  .rail::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-hover);
  }

  @media (max-width: 760px) {
    .rail.poster {
      grid-auto-columns: minmax(8.25rem, 38vw);
    }
  }

  @media (max-width: 640px) {
    .rail.episode {
      grid-auto-columns: minmax(15rem, 78vw);
    }
  }
</style>
