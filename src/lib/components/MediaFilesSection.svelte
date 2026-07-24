<script lang="ts">
  import { page } from "$app/state";
  import { formatClockDuration, formatFileSize, formatMediaDuration } from "$lib/media/format";
  import { playbackModalHref } from "$lib/playback/links";
  import { Eye, EyeOff, Play } from "@lucide/svelte";

  type MediaFile = {
    id: string;
    basename: string;
    size_bytes: number | string | null;
    container: string | null;
    extension: string;
    duration_seconds: number | null;
    video_codec: string | null;
    audio_codec: string | null;
    video_frame_rate: number | null;
    audio_channels: number | null;
    audio_sample_rate: number | null;
    audio_language: string | null;
    audio_bit_rate: number | null;
  };

  type FileProgress = {
    position_seconds: number;
    duration_seconds: number | null;
    completed: boolean | number;
  };

  let {
    mediaItemId,
    files,
    progress,
    primaryFileId,
    formError,
  }: {
    mediaItemId: string;
    files: MediaFile[];
    progress: Array<FileProgress & { media_file_id: string }>;
    primaryFileId?: string;
    formError?: string;
  } = $props();

  const progressByFile = $derived.by(() => {
    const rows: Record<string, FileProgress> = {};
    for (const item of progress) {
      rows[item.media_file_id] = item;
    }
    return rows;
  });

  function fileProgress(fileId: string) {
    return progressByFile[fileId];
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

  function formatFrameRate(fps: number | null) {
    if (fps === null || fps <= 0) return null;
    const rounded = Math.abs(fps - Math.round(fps)) < 0.01 ? Math.round(fps) : fps.toFixed(2);
    return `${rounded} fps`;
  }

  function audioLabel(file: MediaFile) {
    const parts = [];
    if (file.audio_codec) parts.push(file.audio_codec);
    if (file.audio_channels === 1) parts.push("mono");
    else if (file.audio_channels === 2) parts.push("stereo");
    else if (file.audio_channels && file.audio_channels >= 6) parts.push(`${file.audio_channels}ch`);
    if (file.audio_sample_rate) parts.push(`${file.audio_sample_rate / 1000}khz`);
    if (file.audio_language && file.audio_language !== "und") parts.push(file.audio_language);
    return parts.length > 0 ? parts.join(" ") : null;
  }

  function fileDetails(file: MediaFile) {
    const parts: string[] = [];
    parts.push(file.container ?? file.extension.replace(/^\./, ""));
    if (file.duration_seconds) parts.push(formatMediaDuration(file.duration_seconds));
    if (file.video_codec) {
      const v = [file.video_codec, formatFrameRate(file.video_frame_rate)].filter(Boolean).join(" ");
      parts.push(v);
    }
    const audio = audioLabel(file);
    if (audio) parts.push(audio);
    return parts;
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
    {#each files as file (file.id)}
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
            <span>{formatFileSize(file.size_bytes)}</span>
            {#each fileDetails(file) as detail}
              <span>{detail}</span>
            {/each}
          </div>
        </div>
        <span class="status" class:watched={Boolean(fileProgressRow?.completed)}>{progressLabel(fileProgressRow)}</span>
        <div class="file-actions">
          <a
            class="button icon-only"
            aria-label="Play"
            href={playbackModalHref({
              currentUrl: page.url,
              mediaItemId,
              mediaFileId: file.id,
            })}
          >
            <Play size={20} aria-hidden="true" />
          </a>
          <form class="inline-action" method="POST" action="?/watched">
            <input type="hidden" name="fileId" value={file.id} />
            {#if Boolean(fileProgressRow?.completed)}
              <button class="secondary icon-only" aria-label="Unwatch" name="completed" value="false">
                <EyeOff size={18} aria-hidden="true" />
              </button>
            {:else}
              <button class="secondary icon-only" aria-label="Watched" name="completed" value="true">
                <Eye size={18} aria-hidden="true" />
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
    grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.38fr) minmax(6rem, max-content);
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
    grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.38fr) minmax(6rem, max-content);
    gap: 0.75rem;
    align-items: center;
    padding: 0.65rem 0;
  }

  .file-row.featured {
    color: var(--color-accent);
  }

  .file-copy {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .file-title {
    display: flex;
    gap: var(--space-2);
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

  .inline-action {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .file-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .icon-only {
    min-width: 2.5rem;
    min-height: 2.5rem;
    padding: 0;
    justify-content: center;
    background: transparent;
    border: 0;
    color: var(--color-text-soft);
  }

  .icon-only:hover {
    color: var(--color-accent);
    background: transparent;
  }

  @media (max-width: 820px) {
    .files-header {
      display: none;
    }

    .file-row {
      grid-template-columns: 1fr auto;
      gap: 0.4rem 0.75rem;
      align-items: center;
    }

    .file-copy {
      grid-column: 1 / -1;
    }

    .status {
      grid-column: 1;
    }

    .file-actions {
      grid-column: 2;
      justify-content: flex-end;
    }
  }

  @media (max-width: 560px) {
    .file-meta {
      font-size: 0.78rem;
    }
  }
</style>
