<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    copy,
    actions,
  }: {
    copy: Snippet;
    actions: Snippet;
  } = $props();
</script>

<div class="action-row">
  <div class="action-copy">
    {@render copy()}
  </div>
  {@render actions()}
</div>

<style>
  .action-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.65rem;
  }

  .action-copy {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .action-row :global(form),
  .action-row :global(.button-group) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: flex-end;
    margin: 0;
  }

  .action-row :global(.compact-action) {
    min-height: 2rem;
    padding: 0 0.65rem;
    font-size: 0.86rem;
  }

  @media (max-width: 920px) {
    .action-row {
      grid-template-columns: 1fr;
    }

    .action-row :global(form),
    .action-row :global(.button-group) {
      justify-self: start;
      justify-content: flex-start;
    }
  }
</style>
