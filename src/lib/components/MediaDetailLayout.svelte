<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    main,
    aside,
    mainGap = "1rem",
  }: {
    main: Snippet;
    aside: Snippet;
    mainGap?: string;
  } = $props();
</script>

<div class="details">
  <div class="detail-main" style={`--detail-main-gap: ${mainGap}`}>
    {@render main()}
  </div>
  <aside class="metadata">
    {@render aside()}
  </aside>
</div>

<style>
  .details {
    margin-top: var(--space-3);
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(16rem, 0.8fr);
    gap: clamp(1rem, 2vw, 1.4rem);
    align-items: start;
  }

  .detail-main {
    display: grid;
    gap: var(--detail-main-gap);
    min-width: 0;
  }

  .metadata {
    position: sticky;
    top: var(--space-3);
    display: grid;
    gap: var(--space-3);
    border-left: 1px solid var(--color-border-strong);
    padding-left: clamp(1rem, 2vw, 1.4rem);
  }

  @media (max-width: 820px) {
    .details {
      grid-template-columns: 1fr;
    }

    .metadata {
      position: static;
      border-left: 0;
      border-top: 1px solid var(--color-border-strong);
      padding: var(--space-3) 0 0;
    }
  }
</style>
