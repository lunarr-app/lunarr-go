<script lang="ts">
  import { page } from "$app/state";
  import { formatClockDuration, formatFileSize, formatMediaDuration } from "$lib/media/format";
  import { playbackModalHref } from "$lib/playback/links";
  import { Check, CirclePlay, HardDrive, RotateCcw, Tags } from "@lucide/svelte";

  type MediaFile = {
    id: string;
    basename: string;
    size_bytes: number | string | null;
    container: string | null;
    extension: string;
    duration_seconds: number | null;
    video_codec: string | null;
    audio_codec: string | null;
  };

  type FileProgress = {
    position_seconds: number;
    duration_seconds: number | null;
    completed: boolean | number;
  };

  let {
    movieId,
    files,
    progress,
    primaryFileId,
    formError,
  }: {
    movieId: string;
    files: MediaFile[];
    progress: Array<FileProgress & { media_file_id: string }>;
    primaryFileId: string | undefined;
    formError?: string;
  } = $props();

  const progressByFile = $derived.by(() => {
    const rows = new Map<string, FileProgress>();
    for (const item of progress) {
      rows.set(item.media_file_id, item);
    }
    return rows;
  });

  function fileProgress(fileId: string) {
    return progressByFile.get(fileId);
  }

  function progressLabel(progressRow: FileProgress | undefined) {
    if (!progressRow) return "Unwatched";
    if (Boolean(progressRow.completed)) return "Watched";

    const position = Math.max(0, Math.floor(Number(progressRow.position_seconds ?? 0)));
    const duration =
      progressRow.duration_seconds === null ? null : Math.max(0, Math.floor(Number(progressRow.duration_seconds)));
    if (position <= 0) return "Unwatched";
    if (!duration) return formatClockDuration(position);
    return `${formatClockDuration(position)} / ${formatClockDuration(duration)} · ${progressPercent(position, duration)}%`;
  }

  function progressPercent(position: number, duration: number) {
    return Math.min(99, Math.max(1, Math.round((position / duration) * 100)));
  }

  function fileDetails(file: MediaFile) {
    const parts = [
      file.container?.toUpperCase() ?? file.extension.replace(/^\./, "").toUpperCase(),
      file.duration_seconds ? formatMediaDuration(file.duration_seconds) : null,
      file.video_codec ? `Video ${file.video_codec}` : null,
      file.audio_codec ? `Audio ${file.audio_codec}` : null,
    ].filter(Boolean);

    return parts.join(" - ");
  }
</script>

<section class="files-section" aria-label="Files">
  {#if formError}
    <p class="error">{formError}</p>
  {/if}
  <div class="files">
    <div class="files-header" aria-hidden="true">
      <span>File</span>
      <span>Status</span>
      <span>Actions</span>
    </div>
    {#each files as file}
      {@const fileProgressRow = fileProgress(file.id)}
      <article class="file-row" class:featured={primaryFileId === file.id}>
        <div class="file-copy">
          <div class="file-title">
            <strong>{file.basename}</strong>
            {#if files.length > 1 && primaryFileId === file.id}
              <span>Primary</span>
            {/if}
          </div>
          <div class="file-meta">
            <span><HardDrive size={14} aria-hidden="true" />{formatFileSize(file.size_bytes)}</span>
            {#if fileDetails(file)}
              <span><Tags size={14} aria-hidden="true" />{fileDetails(file)}</span>
            {/if}
          </div>
        </div>
        <span class="status" class:watched={Boolean(fileProgressRow?.completed)}>{progressLabel(fileProgressRow)}</span>
        <div class="file-actions">
          <a
            class="button secondary"
            href={playbackModalHref({
              currentUrl: page.url,
              mediaItemId: movieId,
              mediaFileId: file.id,
            })}
          >
            <CirclePlay size={16} aria-hidden="true" />
            Play
          </a>
          <form class="inline-action" method="POST" action="?/watched">
            <input type="hidden" name="fileId" value={file.id} />
            {#if Boolean(fileProgressRow?.completed)}
              <button class="secondary compact" name="completed" value="false">
                <RotateCcw size={14} aria-hidden="true" />
                Unwatch
              </button>
            {:else}
              <button class="secondary compact" name="completed" value="true">
                <Check size={14} aria-hidden="true" />
                Watched
              </button>
            {/if}
          </form>
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .files-section {
    min-width: 0;
  }

  .files {
    display: grid;
    gap: 0;
  }

  .files-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.38fr) minmax(12rem, max-content);
    gap: 0.75rem;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-dim);
    padding: 0.35rem 0 0.45rem;
    font-size: 0.74rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .file-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.38fr) minmax(12rem, max-content);
    gap: 0.75rem;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    padding: 0.65rem 0;
  }

  .file-row.featured {
    border-color: var(--color-accent-border);
  }

  .file-copy {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .file-title {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  .file-title strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-title span {
    flex-shrink: 0;
    color: var(--color-accent);
    font-size: 0.76rem;
    font-weight: 800;
  }

  .file-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.7rem;
    color: var(--color-muted);
    font-size: 0.84rem;
  }

  .file-meta span {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    min-width: 0;
  }

  .status {
    color: var(--color-accent);
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.3;
    white-space: nowrap;
  }

  .status.watched {
    color: var(--color-success);
  }

  .file-actions,
  .inline-action {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .file-actions {
    justify-content: flex-end;
  }

  .file-actions .compact {
    min-height: 2rem;
    padding: 0 0.65rem;
    font-size: 0.86rem;
  }

  @media (max-width: 820px) {
    .file-row {
      grid-template-columns: 1fr;
    }

    .files-header {
      display: none;
    }

    .status {
      grid-column: 1 / -1;
    }

    .file-actions {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
  }

  @media (max-width: 560px) {
    .file-actions,
    .file-actions form {
      width: 100%;
    }

    .file-actions a,
    .file-actions button {
      flex: 1 1 10rem;
    }
  }
</style>
