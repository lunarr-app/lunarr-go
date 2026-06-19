<script lang="ts">
  let { posters }: { posters: string[] } = $props();
</script>

<div class="collage" aria-hidden="true">
  <div class="grid">
    {#each posters as poster, index (poster + index)}
      <div class="cell">
        <img
          src={poster}
          alt=""
          decoding="async"
          loading={index < 12 ? "eager" : "lazy"}
          fetchpriority={index < 6 ? "high" : "low"}
        />
      </div>
    {/each}
  </div>
  <div class="shade"></div>
</div>

<style>
  .collage {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    grid-auto-rows: 1fr;
    gap: 0.45rem;
    width: 108%;
    height: 108%;
    margin: -4%;
    transform: rotate(-7deg) scale(1.04);
    filter: saturate(0.92) brightness(0.72);
  }

  .cell {
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 0.35rem;
    background: var(--color-card);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  }

  .cell img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .shade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(rgba(2, 8, 12, 0.58), rgba(2, 8, 12, 0.82)),
      radial-gradient(circle at 50% 18%, rgba(8, 24, 32, 0.2), transparent 42%);
  }

  @media (max-width: 760px) {
    .grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 0.35rem;
    }
  }
</style>
