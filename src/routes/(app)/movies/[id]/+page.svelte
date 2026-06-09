<script lang="ts">
  import { page } from "$app/state";
  import MediaHero from "$lib/components/MediaHero.svelte";
  import { tmdbImageUrl } from "$lib/media/images";
  import { playbackModalHref } from "$lib/playback/links";
  import {
    Calendar,
    Check,
    CirclePlay,
    Clock3,
    Database,
    ExternalLink,
    HardDrive,
    RefreshCw,
    RotateCcw,
    Star,
    Tags,
    Users
  } from "@lucide/svelte";

  let { data, form } = $props();

  const firstFile = $derived(data.files[0]);
  const runtimeLabel = $derived(data.movie.runtime_seconds ? formatDuration(data.movie.runtime_seconds) : null);
  const ratingLabel = $derived(
    data.movie.vote_average === null || data.movie.vote_average === undefined
      ? null
      : Number(data.movie.vote_average).toFixed(1)
  );
  const voteCountLabel = $derived(
    data.movie.vote_count === null || data.movie.vote_count === undefined
      ? null
      : new Intl.NumberFormat(undefined, { notation: "compact" }).format(Number(data.movie.vote_count))
  );
  const releaseLabel = $derived(data.movie.release_date ?? (data.movie.year ? String(data.movie.year) : null));
  const completedProgress = $derived.by(() => {
    return [...data.progress]
      .filter((item) => Boolean(item.completed))
      .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];
  });
  const hasCompletedProgress = $derived(Boolean(completedProgress));
  const resumeProgress = $derived.by(() => {
    if (hasCompletedProgress) return undefined;
    return [...data.progress]
      .filter((item) => !Boolean(item.completed) && Number(item.position_seconds ?? 0) > 0)
      .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];
  });
  const primaryFile = $derived(data.files.find((file) => file.id === (resumeProgress ?? completedProgress)?.media_file_id) ?? firstFile);
  const primaryHref = $derived(
    primaryFile
      ? playbackModalHref({
          currentUrl: page.url,
          mediaItemId: data.movie.id,
          mediaFileId: primaryFile.id
        })
      : `/movies/${data.movie.id}`
  );
  const primaryActionLabel = $derived(resumeProgress ? "Resume" : hasCompletedProgress ? "Play again" : "Play");
  const resumeLabel = $derived.by(() => {
    if (!resumeProgress) return null;
    const position = Math.max(0, Math.floor(Number(resumeProgress.position_seconds ?? 0)));
    const duration =
      resumeProgress.duration_seconds === null ? null : Math.max(0, Math.floor(Number(resumeProgress.duration_seconds)));
    if (!duration) return `Resume at ${formatDuration(position)}`;
    return `Resume at ${formatDuration(position)} of ${formatDuration(duration)}`;
  });
  const resumePercent = $derived.by(() => {
    if (!resumeProgress?.duration_seconds) return 0;
    return Math.min(
      99,
      Math.max(0, Math.round((Number(resumeProgress.position_seconds ?? 0) / Number(resumeProgress.duration_seconds)) * 100))
    );
  });
  const totalSizeBytes = $derived(data.files.reduce((total, file) => total + Number(file.size_bytes ?? 0), 0));
  const fileCountLabel = $derived(`${data.files.length} ${data.files.length === 1 ? "file" : "files"}`);
  const directorLabel = $derived(data.directors.join(", "));
  const writerLabel = $derived(data.writers.join(", "));
  const trailerHref = $derived(
    data.movie.trailer_site === "YouTube" && data.movie.trailer_key
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(data.movie.trailer_key)}`
      : null
  );
  const providerLabel = $derived(data.movie.provider ? data.movie.provider.toUpperCase() : "Local");
  const progressByFile = $derived.by(() => {
    const rows = new Map<string, { position_seconds: number; duration_seconds: number | null; completed: boolean | number }>();
    for (const item of data.progress) {
      rows.set(item.media_file_id, item);
    }
    return rows;
  });

  function fileProgress(fileId: string) {
    return progressByFile.get(fileId);
  }

  function progressLabel(fileId: string) {
    const progress = fileProgress(fileId);
    if (!progress) return "Unwatched";
    if (Boolean(progress.completed)) return "Watched";

    const position = Math.max(0, Math.floor(Number(progress.position_seconds ?? 0)));
    const duration = progress.duration_seconds === null ? null : Math.max(0, Math.floor(Number(progress.duration_seconds)));
    if (position <= 0) return "Unwatched";
    if (!duration) return `Resume at ${formatDuration(position)}`;
    return `Resume at ${formatDuration(position)} of ${formatDuration(duration)}`;
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
    const parts = [
      file.container?.toUpperCase() ?? file.extension.replace(/^\./, "").toUpperCase(),
      file.duration_seconds ? formatDuration(file.duration_seconds) : null,
      file.video_codec ? `Video ${file.video_codec}` : null,
      file.audio_codec ? `Audio ${file.audio_codec}` : null
    ].filter(Boolean);

    return parts.join(" - ");
  }
</script>

<svelte:head>
  <title>{data.movie.title} - Lunarr</title>
  <meta
    name="description"
    content={data.movie.overview ?? `View files, metadata, and playback options for ${data.movie.title}.`}
  />
</svelte:head>

<MediaHero title={data.movie.title} posterUrl={data.posterUrl} backdropUrl={data.backdropUrl} overview={data.movie.overview} genres={data.genres}>
  {#snippet facts()}
    {#if releaseLabel}
      <span><Calendar size={15} aria-hidden="true" />{releaseLabel}</span>
    {/if}
    {#if runtimeLabel}
      <span><Clock3 size={15} aria-hidden="true" />{runtimeLabel}</span>
    {/if}
    {#if ratingLabel}
      <span><Star size={15} aria-hidden="true" />{ratingLabel}</span>
    {/if}
  {/snippet}

  {#snippet actions()}
    {#if primaryFile}
      <a class="button primary-action" href={primaryHref}>
        <CirclePlay size={19} aria-hidden="true" />
        {primaryActionLabel}
      </a>
      <form method="POST" action="?/watched">
        <input type="hidden" name="fileId" value={primaryFile.id} />
        <button class="secondary" name="completed" value={hasCompletedProgress ? "false" : "true"}>
          {#if hasCompletedProgress}
            <RotateCcw size={16} aria-hidden="true" />
            Mark unwatched
          {:else}
            <Check size={16} aria-hidden="true" />
            Mark watched
          {/if}
        </button>
      </form>
    {/if}
    {#if trailerHref}
      <a class="button secondary" href={trailerHref} target="_blank" rel="noreferrer">
        <ExternalLink size={16} aria-hidden="true" />
        Trailer
      </a>
    {/if}
  {/snippet}

  {#snippet below()}
    {#if resumeLabel}
      <div class="resume">
        <span>{resumeLabel}</span>
        <div aria-hidden="true"><span style={`width: ${resumePercent}%`}></span></div>
      </div>
    {/if}
  {/snippet}
</MediaHero>

<div class="details">
  <section class="files-section" aria-labelledby="files-heading">
    <div class="section-heading">
      <div>
        <h2 id="files-heading">Files</h2>
        <p class="muted">{fileCountLabel} available for playback.</p>
      </div>
    </div>
    {#if form?.error}
      <p class="error">{form.error}</p>
    {/if}
    <div class="files">
      {#each data.files as file}
        <article class:featured={primaryFile?.id === file.id}>
          <div class="file-copy">
            <div class="file-title">
              <strong>{file.basename}</strong>
              {#if primaryFile?.id === file.id}
                <span>Selected</span>
              {/if}
            </div>
            <div class="file-meta">
              <span><HardDrive size={14} aria-hidden="true" />{formatFileSize(file.size_bytes)}</span>
              {#if fileDetails(file)}
                <span><Tags size={14} aria-hidden="true" />{fileDetails(file)}</span>
              {/if}
            </div>
            <span class:watched={Boolean(fileProgress(file.id)?.completed)} class="status">{progressLabel(file.id)}</span>
          </div>
          <div class="file-actions">
            <a
              class="button secondary"
              href={playbackModalHref({
                currentUrl: page.url,
                mediaItemId: data.movie.id,
                mediaFileId: file.id
              })}
            >
              <CirclePlay size={16} aria-hidden="true" />
              Play
            </a>
            <form method="POST" action="?/watched">
              <input type="hidden" name="fileId" value={file.id} />
              {#if Boolean(fileProgress(file.id)?.completed)}
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

  {#if data.cast.length}
    <section class="cast-section" aria-labelledby="cast-heading">
      <div class="section-heading">
        <div>
          <h2 id="cast-heading">Cast</h2>
          <p class="muted">Top billed people from TMDb.</p>
        </div>
      </div>
      <div class="cast-rail">
        {#each data.cast as person}
          <a class="person" href={`/people/${encodeURIComponent(person.provider)}/${encodeURIComponent(person.providerId)}`}>
            <div class="profile">
              {#if person.profilePath}
                <img src={tmdbImageUrl(person.profilePath, "w185")} alt="" loading="lazy" />
              {:else}
                <Users size={22} aria-hidden="true" />
              {/if}
            </div>
            <strong>{person.name}</strong>
            {#if person.character}
              <span>{person.character}</span>
            {/if}
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <aside class="metadata" aria-labelledby="metadata-heading">
    <div class="section-heading">
      <h2 id="metadata-heading">Metadata</h2>
    </div>
    {#if form?.metadataError}
      <p class="error">{form.metadataError}</p>
    {/if}
    <div class="metadata-score">
      <div>
        <strong>{ratingLabel ?? "-"}</strong>
        <span>{voteCountLabel ? `${voteCountLabel} votes` : "Unrated"}</span>
      </div>
      <div>
        <strong>{data.movie.certification ?? "NR"}</strong>
        <span>{data.movie.status ?? "Unknown status"}</span>
      </div>
    </div>
    <div class="metadata-chips" aria-label="Movie metadata facts">
      <span>{providerLabel}</span>
      {#if data.movie.release_date}
        <span>{data.movie.release_date}</span>
      {/if}
      {#if runtimeLabel}
        <span>{runtimeLabel}</span>
      {/if}
      {#if data.movie.original_language}
        <span>{data.movie.original_language.toUpperCase()}</span>
      {/if}
    </div>
    <div class="metadata-blocks">
      <section>
        <h3>Credits</h3>
        <dl>
          <div><dt>Director</dt><dd>{directorLabel || "Unknown"}</dd></div>
          <div><dt>Writers</dt><dd>{writerLabel || "Unknown"}</dd></div>
        </dl>
      </section>
      <section>
        <h3>Library</h3>
        <dl>
          <div><dt>Files</dt><dd>{fileCountLabel}</dd></div>
          <div><dt>Total size</dt><dd>{formatFileSize(totalSizeBytes)}</dd></div>
          <div><dt>Provider ID</dt><dd>{data.movie.provider_id ?? "None"}</dd></div>
        </dl>
      </section>
      {#if data.movie.collection_name || data.productionCompanies.length}
        <section>
          <h3>Production</h3>
          <dl>
            <div><dt>Collection</dt><dd>{data.movie.collection_name ?? "None"}</dd></div>
            {#if data.productionCompanies.length}
              <div><dt>Studios</dt><dd>{data.productionCompanies.join(", ")}</dd></div>
            {/if}
          </dl>
        </section>
      {/if}
    </div>
    {#if data.keywords.length}
      <section class="metadata-keywords">
        <h3>Keywords</h3>
        <div class="keyword-list">
          {#each data.keywords as keyword}
            <span>{keyword}</span>
          {/each}
        </div>
      </section>
    {/if}
    {#if data.canManageMetadata}
      <form method="POST" action="?/refreshMetadata">
        <button class="secondary" disabled={!data.tmdbConfigured}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh metadata
        </button>
      </form>
    {/if}
    <div class="source-note">
      <Database size={16} aria-hidden="true" />
      <span>{data.movie.provider ? "Matched metadata is stored locally after scan." : "This title is using local filename metadata."}</span>
    </div>
  </aside>
</div>

<style>
  .primary-action {
    min-width: 8rem;
  }

  .resume {
    display: grid;
    gap: 0.35rem;
    width: min(100%, 24rem);
    color: #b7c3cc;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .resume div {
    height: 0.28rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
  }

  .resume div span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #00ccff;
  }

  .details {
    margin-top: 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(16rem, 0.8fr);
    gap: clamp(1rem, 2vw, 1.4rem);
    align-items: start;
  }

  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.85rem;
  }

  .section-heading h2,
  .section-heading p {
    margin: 0;
  }

  .files {
    display: grid;
    gap: 0.75rem;
  }

  .files-section,
  .cast-section {
    min-width: 0;
  }

  article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0.75rem 0;
  }

  article.featured {
    border-color: rgba(0, 204, 255, 0.28);
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
    color: #9be8ff;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .file-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.7rem;
    color: #95a4ae;
    font-size: 0.84rem;
  }

  .file-meta span {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    min-width: 0;
  }

  .status {
    color: #9be8ff;
    font-size: 0.86rem;
    font-weight: 700;
  }

  .status.watched {
    color: #8fd7a6;
  }

  .file-actions,
  form {
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

  .cast-section {
    grid-column: 1 / 2;
  }

  .cast-rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(8.2rem, 9.5rem);
    gap: 0.85rem;
    overflow-x: auto;
    padding-bottom: 0.4rem;
    scrollbar-width: thin;
    scrollbar-color: rgba(149, 164, 174, 0.45) transparent;
  }

  .person {
    display: grid;
    grid-template-columns: 1fr;
    align-content: start;
    gap: 0.35rem;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .profile {
    display: grid;
    place-items: center;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.07);
    color: #95a4ae;
  }

  .profile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .person strong,
  .person span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .person span {
    color: #95a4ae;
    font-size: 0.84rem;
  }

  .metadata {
    position: sticky;
    top: 1rem;
    display: grid;
    gap: 1rem;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    padding-left: clamp(1rem, 2vw, 1.4rem);
  }

  dl {
    display: grid;
    gap: 0.5rem;
    margin: 0;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
  }

  dt {
    color: #a8a195;
    flex-shrink: 0;
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: right;
  }

  .source-note {
    display: flex;
    gap: 0.55rem;
    color: #95a4ae;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .metadata-score {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .metadata-score > div {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    padding: 0.75rem;
    display: grid;
    gap: 0.15rem;
  }

  .metadata-score strong {
    font-size: 1.6rem;
    line-height: 1;
  }

  .metadata-score span {
    color: #95a4ae;
    font-size: 0.82rem;
  }

  .metadata-chips,
  .keyword-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .metadata-chips span,
  .keyword-list span {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    color: #dce4e8;
    padding: 0.18rem 0.5rem;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .metadata-chips span {
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .metadata-blocks,
  .metadata-blocks section,
  .metadata-keywords {
    display: grid;
    gap: 0.7rem;
  }

  .metadata-blocks section,
  .metadata-keywords {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 0.8rem;
  }

  .metadata-blocks h3,
  .metadata-keywords h3 {
    margin: 0;
    color: #a8a195;
    font-size: 0.9rem;
  }

  @media (max-width: 820px) {
    .details {
      grid-template-columns: 1fr;
    }

    article {
      grid-template-columns: 1fr;
    }

    .file-actions {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }

    .metadata {
      position: static;
      border-left: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding: 1rem 0 0;
    }

    .cast-section {
      grid-column: auto;
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
