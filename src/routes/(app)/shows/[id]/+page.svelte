<script lang="ts">
  import { page } from "$app/state";
  import MediaHero from "$lib/components/MediaHero.svelte";
  import ShareLinkModal from "$lib/components/ShareLinkModal.svelte";
  import { formatDateTime, formatEpisodeCode } from "$lib/media/format";
  import { tmdbImageUrl } from "$lib/media/images";
  import { playbackModalHref } from "$lib/playback/links";
  import { Calendar, CirclePlay, ExternalLink, Link2, RefreshCw, Sparkles, Star, Users } from "@lucide/svelte";

  let { data, form } = $props();
  let shareModalOpen = $state(false);

  type Season = (typeof data.seasons)[number];
  type Episode = Season["episodes"][number];

  const allEpisodes = $derived(data.seasons.flatMap((season) => season.episodes));
  const watchedCount = $derived(allEpisodes.filter((episode) => episode.completed).length);
  const totalEpisodes = $derived(allEpisodes.length);
  const progressPercent = $derived(totalEpisodes > 0 ? Math.round((watchedCount / totalEpisodes) * 100) : 0);
  const inProgressEpisode = $derived(
    allEpisodes.find((episode) => !episode.completed && episode.progressSeconds > 0 && episode.fileId),
  );
  const nextEpisode = $derived(
    inProgressEpisode ??
      allEpisodes.find((episode) => !episode.completed && episode.fileId) ??
      allEpisodes.find((episode) => episode.fileId),
  );
  const seasonCount = $derived(data.seasons.length);
  const episodeCountLabel = $derived(`${totalEpisodes} ${totalEpisodes === 1 ? "episode" : "episodes"}`);
  const seasonCountLabel = $derived(`${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}`);
  const ratingLabel = $derived(
    data.show.voteAverage === null || data.show.voteAverage === undefined
      ? null
      : Number(data.show.voteAverage).toFixed(1),
  );
  const voteCountLabel = $derived(
    data.show.voteCount === null || data.show.voteCount === undefined
      ? null
      : new Intl.NumberFormat(undefined, { notation: "compact" }).format(Number(data.show.voteCount)),
  );
  const providerLabel = $derived(data.show.provider ? data.show.provider.toUpperCase() : "Local");
  const creatorLabel = $derived(data.creators.join(", "));
  const trailerHref = $derived(
    data.show.trailerSite === "YouTube" && data.show.trailerKey
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(data.show.trailerKey)}`
      : null,
  );

  function watchHref(episode: Pick<Episode, "id" | "fileId">) {
    return playbackModalHref({
      currentUrl: page.url,
      mediaItemId: episode.id,
      mediaFileId: episode.fileId,
    });
  }

  function seasonHref(season: Pick<Season, "id">) {
    return `/shows/${data.show.id}/seasons/${season.id}`;
  }

  function seasonStats(season: Season) {
    const episodes = season.episodes;
    const total = episodes.length;
    const playable = episodes.filter((episode) => episode.fileId).length;
    const watched = episodes.filter((episode) => episode.completed).length;
    const missing = total - playable;
    return {
      total,
      playable,
      watched,
      missing,
      progress: total > 0 ? Math.round((watched / total) * 100) : 0,
    };
  }

  function episodeCode(episode: Pick<Episode, "seasonNumber" | "episodeNumber"> | undefined) {
    return formatEpisodeCode(episode);
  }
</script>

<svelte:head>
  <title>{data.show.title} - Lunarr</title>
  <meta name="description" content={`Browse seasons for ${data.show.title} in Lunarr.`} />
</svelte:head>

<MediaHero
  title={data.show.title}
  posterUrl={data.show.posterUrl}
  backdropUrl={data.show.backdropUrl}
  overview={data.show.overview}
  genres={data.show.genres.slice(0, 4)}
  bottomMargin="2rem"
>
  {#snippet facts()}
    {#if data.show.year}<span><Calendar size={15} aria-hidden="true" />{data.show.year}</span>{/if}
    {#if data.show.status}<span>{data.show.status}</span>{/if}
    {#if ratingLabel}
      <span><Star size={15} aria-hidden="true" />{ratingLabel}</span>
    {/if}
    <span>{seasonCountLabel}</span>
    <span>{episodeCountLabel}</span>
  {/snippet}

  {#snippet actions()}
    {#if nextEpisode?.fileId}
      <a class="button primary-action" href={watchHref(nextEpisode)}>
        <CirclePlay size={19} aria-hidden="true" />
        {nextEpisode.progressSeconds > 0 ? "Resume" : "Play"}
      </a>
      <a class="button secondary" href={`/episodes/${nextEpisode.id}`}>{episodeCode(nextEpisode) || "Episode"}</a>
    {/if}
    {#if trailerHref}
      <a class="button secondary" href={trailerHref} target="_blank" rel="noreferrer">
        <ExternalLink size={16} aria-hidden="true" />
        Trailer
      </a>
    {/if}
    <a class="button secondary" href={`/shows/${data.show.id}/similar`}>
      <Sparkles size={16} aria-hidden="true" />
      Similar
    </a>
    {#if data.canManageShares}
      <button class="button secondary" type="button" onclick={() => (shareModalOpen = true)}>
        <Link2 size={16} aria-hidden="true" />
        Share
      </button>
    {/if}
  {/snippet}

  {#snippet below()}
    <div class="watch-summary" aria-label={`${watchedCount} of ${totalEpisodes} episodes watched`}>
      <div>
        <strong>{watchedCount}/{totalEpisodes}</strong>
        <span>Watched</span>
      </div>
      <div class="watch-progress" aria-hidden="true">
        <span style={`width: ${progressPercent}%`}></span>
      </div>
    </div>
  {/snippet}
</MediaHero>

<div class="details">
  <div class="detail-main">
    <section class="seasons" aria-labelledby="seasons-heading">
      <div class="section-heading">
        <div>
          <h2 id="seasons-heading">Seasons</h2>
          <p class="muted">Choose a season to browse episodes.</p>
        </div>
      </div>

      <div class="season-grid">
        {#each data.seasons as season}
          {@const stats = seasonStats(season)}
          <a class="season-card" href={seasonHref(season)}>
            <div class="poster">
              {#if season.posterUrl || data.show.posterUrl}
                <img src={season.posterUrl ?? data.show.posterUrl} alt="" loading="lazy" />
              {:else}
                <span>{season.title}</span>
              {/if}
            </div>
            <div class="season-copy">
              <strong>{season.title}</strong>
              <span>{stats.total} {stats.total === 1 ? "episode" : "episodes"}</span>
              {#if stats.missing > 0}
                <span>{stats.playable}/{stats.total} available</span>
              {:else}
                <span>{stats.watched}/{stats.total} watched</span>
              {/if}
              <div class="season-progress" aria-hidden="true">
                <span style={`width: ${stats.progress}%`}></span>
              </div>
            </div>
          </a>
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
            <a
              class="person"
              href={`/people/${encodeURIComponent(person.provider)}/${encodeURIComponent(person.providerId)}`}
            >
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
  </div>

  <aside class="metadata" aria-labelledby="metadata-heading">
    <div class="section-heading">
      <h2 id="metadata-heading">Metadata</h2>
      {#if data.canManageMetadata}
        <form class="metadata-refresh" method="POST" action="?/refreshMetadata">
          <button
            class="text-button"
            disabled={!data.tmdbConfigured}
            title={data.tmdbConfigured ? "Refresh metadata from TMDb" : "TMDb credentials are not configured"}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        </form>
      {/if}
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
        <strong>{data.show.certification ?? "NR"}</strong>
        <span>{data.show.status ?? "Unknown status"}</span>
      </div>
    </div>
    <div class="metadata-chips" aria-label="Show metadata facts">
      <span>{providerLabel}</span>
      {#if data.show.releaseDate}
        <span>{data.show.releaseDate}</span>
      {/if}
      {#if data.show.originalLanguage}
        <span>{data.show.originalLanguage.toUpperCase()}</span>
      {/if}
    </div>
    <div class="metadata-blocks">
      <section>
        <h3>Credits</h3>
        <dl>
          <div>
            <dt>Created by</dt>
            <dd>{creatorLabel || "Unknown"}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3>Library</h3>
        <dl>
          <div>
            <dt>Seasons</dt>
            <dd>{seasonCountLabel}</dd>
          </div>
          <div>
            <dt>Episodes</dt>
            <dd>{episodeCountLabel}</dd>
          </div>
          <div>
            <dt>Provider ID</dt>
            <dd>{data.show.providerId ?? "None"}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{formatDateTime(data.show.updatedAt)}</dd>
          </div>
        </dl>
      </section>
      {#if data.productionCompanies.length}
        <section>
          <h3>Production</h3>
          <dl>
            <div>
              <dt>Studios</dt>
              <dd>{data.productionCompanies.join(", ")}</dd>
            </div>
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
  </aside>
</div>

{#if shareModalOpen}
  <ShareLinkModal
    title={data.show.title}
    kind="show"
    mediaItemId={data.show.id}
    seasons={data.seasons.map((season) => ({
      id: season.id,
      title: season.title,
    }))}
    onClose={() => (shareModalOpen = false)}
  />
{/if}

<style>
  .primary-action {
    min-width: 8rem;
  }

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

  .watch-progress,
  .season-progress {
    overflow: hidden;
    border-radius: 999px;
    background: var(--color-border-strong);
  }

  .watch-progress {
    height: 0.45rem;
  }

  .watch-progress span,
  .season-progress span {
    display: block;
    height: 100%;
    min-width: 0;
    border-radius: inherit;
    background: var(--color-accent);
  }

  .details {
    margin-top: 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(16rem, 0.8fr);
    gap: clamp(1rem, 2vw, 1.4rem);
    align-items: start;
  }

  .detail-main {
    display: grid;
    gap: 2rem;
    min-width: 0;
  }

  .cast-section,
  .seasons {
    min-width: 0;
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

  .section-heading p {
    margin-top: 0.25rem;
  }

  .metadata .section-heading {
    align-items: center;
    margin-bottom: 0;
  }

  .metadata-refresh {
    margin: 0;
    flex-shrink: 0;
  }

  .cast-rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(8.2rem, 9.5rem);
    gap: 0.85rem;
    overflow-x: auto;
    padding-bottom: 0.4rem;
    scrollbar-width: thin;
    scrollbar-color: var(--color-scrollbar) transparent;
  }

  .person {
    display: grid;
    align-content: start;
    gap: 0.35rem;
    min-width: 0;
  }

  .profile,
  .poster {
    display: grid;
    place-items: center;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 8px;
    background: var(--color-surface-muted);
    color: var(--color-muted);
  }

  .profile img,
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .person strong,
  .person span,
  .season-copy strong,
  .season-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .person span,
  .season-copy span {
    color: var(--color-muted);
    font-size: 0.84rem;
  }

  .season-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.8rem, 1fr));
    gap: 1rem;
  }

  .season-card {
    display: grid;
    gap: 0.55rem;
    min-width: 0;
  }

  .poster {
    border: 1px solid transparent;
    background: var(--color-card);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
    transition:
      border-color 160ms ease,
      transform 160ms ease;
  }

  .season-card:hover .poster {
    transform: translateY(-2px);
    border-color: var(--color-accent-border);
  }

  .poster span {
    padding: 1rem;
    color: var(--color-subtle);
    text-align: center;
    overflow-wrap: anywhere;
  }

  .season-copy {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .season-progress {
    height: 3px;
    margin-top: 0.2rem;
    background: var(--color-border);
  }

  .metadata {
    position: sticky;
    top: 1rem;
    display: grid;
    gap: 1rem;
    border-left: 1px solid var(--color-border-strong);
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
    color: var(--color-dim);
    flex-shrink: 0;
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: right;
  }

  .text-button {
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 650;
    justify-content: flex-start;
    gap: 0.35rem;
  }

  .text-button:hover:not(:disabled) {
    color: var(--color-accent);
  }

  .text-button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .metadata-score {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .metadata-score > div {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-faint);
    padding: 0.75rem;
    display: grid;
    gap: 0.15rem;
  }

  .metadata-score strong {
    font-size: 1.6rem;
    line-height: 1;
  }

  .metadata-score span {
    color: var(--color-muted);
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
    background: var(--color-surface-muted);
    color: var(--color-text-soft);
    padding: 0.18rem 0.5rem;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .metadata-chips span {
    border: 1px solid var(--color-border);
  }

  .metadata-blocks,
  .metadata-blocks section,
  .metadata-keywords {
    display: grid;
    gap: 0.7rem;
  }

  .metadata-blocks section,
  .metadata-keywords {
    border-top: 1px solid var(--color-border);
    padding-top: 0.8rem;
  }

  .metadata-blocks h3,
  .metadata-keywords h3 {
    margin: 0;
    color: var(--color-dim);
    font-size: 0.9rem;
  }

  @media (max-width: 820px) {
    .details {
      grid-template-columns: 1fr;
    }

    .metadata {
      position: static;
      border-left: 0;
      border-top: 1px solid var(--color-border-strong);
      padding: 1rem 0 0;
    }
  }

  @media (max-width: 760px) {
    .watch-summary {
      grid-template-columns: 1fr;
    }
  }
</style>
