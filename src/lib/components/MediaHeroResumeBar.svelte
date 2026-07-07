<script lang="ts">
  let {
    resumeLabel,
    resumePercent,
  }: {
    resumeLabel: string | null;
    resumePercent: number;
  } = $props();
</script>

{#if resumeLabel}
  <div class="resume">
    <span>{resumeLabel}</span>
    <div aria-hidden="true">
      <span style={`width: ${resumePercent}%`}></span>
    </div>
  </div>
{/if}

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
