<script lang="ts">
  import type { ShowSummary } from "$lib/media/types";

  let { show }: { show: ShowSummary } = $props();
</script>

<a class="show" href={`/shows/${show.id}`} aria-label={show.title}>
  <div class="poster">
    {#if show.posterUrl}
      <img src={show.posterUrl} alt="" loading="lazy" />
    {:else}
      <span>{show.title}</span>
    {/if}
  </div>
  <div class="meta">
    <strong>{show.title}</strong>
    <div class="details">
      <span>{show.year ?? "Unknown year"}</span>
      <span>{show.seasonCount} {show.seasonCount === 1 ? "season" : "seasons"}</span>
    </div>
  </div>
</a>

<style>
  .show {
    display: grid;
    gap: 0.65rem;
    min-width: 0;
  }

  .poster {
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 8px;
    background: #111a21;
    display: grid;
    place-items: center;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
    transition:
      border-color 160ms ease,
      transform 160ms ease;
  }

  .show:hover .poster {
    transform: translateY(-2px);
    border-color: rgba(0, 204, 255, 0.45);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .poster span {
    padding: 1rem;
    color: #b7c3cc;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .meta {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .details {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    color: #95a4ae;
    font-size: 0.88rem;
  }

  .details span {
    min-width: 0;
    white-space: nowrap;
  }
</style>
