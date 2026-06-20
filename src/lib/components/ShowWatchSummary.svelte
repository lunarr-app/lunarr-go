<script lang="ts">
  let {
    watchedCount,
    totalCount,
    progressPercent,
    label = "Watched",
  }: {
    watchedCount: number;
    totalCount: number;
    progressPercent: number;
    label?: string;
  } = $props();
</script>

<div class="watch-summary" aria-label={`${watchedCount} of ${totalCount} episodes ${label.toLowerCase()}`}>
  <div>
    <strong>{watchedCount}/{totalCount}</strong>
    <span>{label}</span>
  </div>
  <div class="watch-progress" aria-hidden="true">
    <span style={`width: ${progressPercent}%`}></span>
  </div>
</div>

<style>
  .watch-summary {
    display: grid;
    grid-template-columns: auto minmax(10rem, 18rem);
    gap: 0.8rem;
    align-items: center;
  }

  .watch-summary > div:first-child {
    display: grid;
    gap: 0.05rem;
  }

  .watch-summary strong {
    font-size: 1.05rem;
  }

  .watch-summary span {
    color: var(--color-muted);
    font-size: 0.84rem;
  }

  .watch-progress {
    overflow: hidden;
    height: 0.45rem;
    border-radius: 999px;
    background: var(--color-border-strong);
  }

  .watch-progress span {
    display: block;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    background: var(--color-accent);
  }

  @media (max-width: 760px) {
    .watch-summary {
      grid-template-columns: 1fr;
    }
  }
</style>
