<script lang="ts">
  import { page } from "$app/state";
  import { playbackModalHref } from "$lib/playback/links";
  import { Check, Play, RotateCcw } from "@lucide/svelte";

  let { data, form } = $props();

  const primaryFile = $derived(data.files[0] ?? null);
  const completed = $derived(data.progress.some((progress) => Number(progress.completed ?? 0) > 0));
  const episodeCode = $derived(
    `S${String(data.episode.seasonNumber ?? "?").padStart(2, "0")}E${String(data.episode.episodeNumber ?? "?").padStart(2, "0")}`
  );

  function playHref(fileId: string) {
    return playbackModalHref({
      currentUrl: page.url,
      mediaItemId: data.episode.id,
      mediaFileId: fileId
    });
  }

  function formatDuration(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
    return `${seconds}s`;
  }

  function formatFileSize(bytes: number | string | null | undefined) {
    const value = Number(bytes ?? 0);
    if (!Number.isFinite(value) || value <= 0) return "Unknown size";
    const gib = value / 1024 / 1024 / 1024;
    if (gib >= 1) return `${gib.toFixed(2)} GB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function fileDetails(file: (typeof data.files)[number]) {
    return [
      file.container?.toUpperCase() ?? file.extension.replace(/^\./, "").toUpperCase(),
      file.duration_seconds ? formatDuration(file.duration_seconds) : null,
      file.video_codec?.toUpperCase() ?? null,
      file.audio_codec?.toUpperCase() ?? null,
      formatFileSize(file.size_bytes)
    ]
      .filter(Boolean)
      .join(" · ");
  }
</script>

<svelte:head>
  <title>{data.show.title} - {episodeCode} - {data.episode.title} - Lunarr</title>
  <meta name="description" content={`Watch ${episodeCode} ${data.episode.title} from ${data.show.title} in Lunarr.`} />
</svelte:head>

<section class="episode-hero" style={data.show.backdropUrl ? `--backdrop: url(${data.show.backdropUrl})` : ""}>
  <div class="still">
    {#if data.episode.stillUrl}
      <img src={data.episode.stillUrl} alt="" />
    {:else}
      <span>{episodeCode}</span>
    {/if}
  </div>
  <div class="summary">
    <a class="show-link" href={`/shows/${data.show.id}`}>{data.show.title}</a>
    <h1>{data.episode.title}</h1>
    <div class="facts">
      <span>{episodeCode}</span>
      {#if data.episode.releaseDate}<span>{data.episode.releaseDate}</span>{/if}
      {#if data.episode.runtimeSeconds}<span>{Math.round(data.episode.runtimeSeconds / 60)} min</span>{/if}
      {#if data.episode.voteAverage}<span>{data.episode.voteAverage.toFixed(1)}</span>{/if}
    </div>
    {#if data.episode.overview}
      <p>{data.episode.overview}</p>
    {/if}
    {#if primaryFile}
      <div class="actions">
        <a class="button" href={playHref(primaryFile.id)}>
          <Play size={16} aria-hidden="true" />
          Play
        </a>
        <form class="inline-action" method="POST" action="?/watched">
          <input type="hidden" name="fileId" value={primaryFile.id} />
          <input type="hidden" name="completed" value={completed ? "false" : "true"} />
          <button class="secondary">
            {#if completed}
              <RotateCcw size={16} aria-hidden="true" />
              Unwatch
            {:else}
              <Check size={16} aria-hidden="true" />
              Watched
            {/if}
          </button>
        </form>
      </div>
    {/if}
  </div>
</section>

{#if form?.error}
  <p class="error">{form.error}</p>
{/if}

<section class="files" aria-labelledby="files-heading">
  <h2 id="files-heading">Files</h2>
  <div class="file-list">
    {#each data.files as file}
      <a class="file-row" href={playHref(file.id)}>
        <span>{file.basename}</span>
        <small>{fileDetails(file)}</small>
      </a>
    {/each}
  </div>
</section>

<style>
  .episode-hero {
    --episode-hero-text: #f8fafc;
    --episode-hero-text-soft: rgba(248, 250, 252, 0.82);
    --episode-hero-subtle: rgba(248, 250, 252, 0.72);
    --episode-hero-accent: #9be8ff;
    position: relative;
    display: grid;
    grid-template-columns: minmax(14rem, 26rem) minmax(0, 44rem);
    gap: 1.4rem;
    align-items: end;
    isolation: isolate;
    min-height: 20rem;
    margin: -1.4rem calc(clamp(1rem, 3vw, 2.4rem) * -1) 1.5rem;
    padding: 6rem clamp(1rem, 3vw, 2.4rem) 1.5rem;
    overflow: hidden;
    color: var(--episode-hero-text);
  }

  .episode-hero::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -2;
    background:
      linear-gradient(90deg, rgba(7, 11, 15, 0.98), rgba(7, 11, 15, 0.72), rgba(7, 11, 15, 0.96)),
      var(--backdrop, var(--color-card));
    background-size: cover;
    background-position: center;
  }

  .episode-hero::after {
    content: "";
    position: absolute;
    inset: auto 0 0;
    z-index: -1;
    height: 45%;
    background: linear-gradient(180deg, rgba(7, 11, 15, 0), #070b0f);
  }

  .still {
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 8px;
    background: var(--color-card);
    display: grid;
    place-items: center;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
  }

  .still img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .still span {
    color: var(--color-subtle);
    font-weight: 800;
  }

  .summary {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .show-link {
    color: var(--episode-hero-accent);
    font-weight: 800;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 4.5vw, 4.2rem);
    line-height: 0.98;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    color: var(--episode-hero-subtle);
    font-size: 0.92rem;
  }

  .summary p {
    max-width: 42rem;
    margin: 0;
    color: var(--episode-hero-text-soft);
    line-height: 1.6;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .inline-action {
    margin: 0;
  }

  .files {
    display: grid;
    gap: 0.45rem;
    max-width: 52rem;
  }

  .files h2 {
    margin: 0;
    font-size: 1rem;
  }

  .file-list {
    display: grid;
  }

  .file-row {
    display: grid;
    gap: 0.18rem;
    border-bottom: 1px solid var(--color-border);
    padding: 0.65rem 0;
  }

  .file-row span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .file-row small {
    color: var(--color-muted);
    font-size: 0.84rem;
  }

  @media (max-width: 760px) {
    .episode-hero {
      grid-template-columns: 1fr;
      min-height: 18rem;
      padding-top: 4rem;
    }
  }
</style>
