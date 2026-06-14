<script lang="ts">
  import { page } from "$app/state";
  import MediaHero from "$lib/components/MediaHero.svelte";
  import { tmdbImageUrl } from "$lib/media/images";
  import { playbackModalHref } from "$lib/playback/links";
  import { Calendar, CirclePlay, Star, Users } from "@lucide/svelte";

  let { data } = $props();

  type Season = (typeof data.seasons)[number];
  type Episode = Season["episodes"][number];

  const allEpisodes = $derived(
    data.seasons.flatMap((season) => season.episodes),
  );
  const watchedCount = $derived(
    allEpisodes.filter((episode) => episode.completed).length,
  );
  const totalEpisodes = $derived(allEpisodes.length);
  const progressPercent = $derived(
    totalEpisodes > 0 ? Math.round((watchedCount / totalEpisodes) * 100) : 0,
  );
  const inProgressEpisode = $derived(
    allEpisodes.find(
      (episode) =>
        !episode.completed && episode.progressSeconds > 0 && episode.fileId,
    ),
  );
  const nextEpisode = $derived(
    inProgressEpisode ??
      allEpisodes.find((episode) => !episode.completed && episode.fileId) ??
      allEpisodes.find((episode) => episode.fileId),
  );
  const seasonCount = $derived(data.seasons.length);
  const episodeCountLabel = $derived(
    `${totalEpisodes} ${totalEpisodes === 1 ? "episode" : "episodes"}`,
  );
  const seasonCountLabel = $derived(
    `${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}`,
  );

  function watchHref(episode: Pick<Episode, "id" | "fileId">) {
    return playbackModalHref({
      currentUrl: page.url,
      mediaItemId: episode.id,
      mediaFileId: episode.fileId
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

  function episodeCode(
    episode: Pick<Episode, "seasonNumber" | "episodeNumber"> | undefined,
  ) {
    if (
      !episode ||
      episode.seasonNumber === null ||
      episode.episodeNumber === null
    )
      return "";
    return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
  }
</script>

<svelte:head>
  <title>{data.show.title} - Lunarr</title>
  <meta
    name="description"
    content={`Browse seasons for ${data.show.title} in Lunarr.`}
  />
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
    {#if data.show.year}<span
        ><Calendar size={15} aria-hidden="true" />{data.show.year}</span
      >{/if}
    {#if data.show.status}<span>{data.show.status}</span>{/if}
    {#if data.show.voteAverage}
      <span
        ><Star size={15} aria-hidden="true" />{data.show.voteAverage.toFixed(
          1,
        )}</span
      >
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
      <a class="button secondary" href={`/episodes/${nextEpisode.id}`}
        >{episodeCode(nextEpisode) || "Episode"}</a
      >
    {/if}
  {/snippet}

  {#snippet below()}
    <div
      class="watch-summary"
      aria-label={`${watchedCount} of ${totalEpisodes} episodes watched`}
    >
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
            <img
              src={season.posterUrl ?? data.show.posterUrl}
              alt=""
              loading="lazy"
            />
          {:else}
            <span>{season.title}</span>
          {/if}
        </div>
        <div class="season-copy">
          <strong>{season.title}</strong>
          <span>{stats.total} {stats.total === 1 ? "episode" : "episodes"}</span
          >
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
              <img
                src={tmdbImageUrl(person.profilePath, "w185")}
                alt=""
                loading="lazy"
              />
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

  .cast-section {
    min-width: 0;
    margin-top: 2rem;
  }

  .section-heading {
    display: flex;
    gap: 0.75rem;
    align-items: end;
    margin-bottom: 0.85rem;
  }

  .section-heading h2,
  .section-heading p {
    margin: 0;
  }

  .section-heading p {
    margin-top: 0.25rem;
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

  .seasons {
    min-width: 0;
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

  @media (max-width: 760px) {
    .watch-summary {
      grid-template-columns: 1fr;
    }
  }
</style>
