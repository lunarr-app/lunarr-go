<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import ShowCard from "$lib/components/ShowCard.svelte";
  import { Clapperboard, Film, Star, User } from "@lucide/svelte";

  let { data } = $props();

  const movieCountLabel = $derived(`${data.movies.length} ${data.movies.length === 1 ? "movie" : "movies"}`);
  const showCountLabel = $derived(`${data.shows.length} ${data.shows.length === 1 ? "show" : "shows"}`);
  const yearSpan = $derived.by(() => {
    const years = [...data.movies, ...data.shows]
      .map((title) => title.year)
      .filter((year): year is number => typeof year === "number")
      .sort((left, right) => left - right);
    if (years.length === 0) return "Unknown years";
    const first = years[0];
    const last = years[years.length - 1];
    return first === last ? String(first) : `${first}-${last}`;
  });
  const characters = $derived([...data.movies, ...data.shows].map((title) => title.character).filter(Boolean).slice(0, 6));
</script>

<svelte:head>
  <title>{data.person.name} - Lunarr</title>
  <meta name="description" content={`Movies and TV shows in your library featuring ${data.person.name}.`} />
</svelte:head>

<header class="person-hero">
  <div class="profile">
    {#if data.person.profileUrl}
      <img src={data.person.profileUrl} alt="" />
    {:else}
      <User size={34} aria-hidden="true" />
    {/if}
  </div>
  <div class="copy">
    <div class="eyebrow">
      <Clapperboard size={15} aria-hidden="true" />
      Cast
    </div>
    <h1 class="person-name">{data.person.name}</h1>
    {#if data.person.originalName && data.person.originalName !== data.person.name}
      <p class="muted original-name">{data.person.originalName}</p>
    {/if}
    <div class="facts" aria-label="Cast facts">
      <span><Film size={15} aria-hidden="true" />{movieCountLabel}</span>
      <span><Clapperboard size={15} aria-hidden="true" />{showCountLabel}</span>
      <span><Star size={15} aria-hidden="true" />{yearSpan}</span>
      <span>{data.person.provider}</span>
    </div>
    {#if characters.length}
      <div class="characters" aria-label="Characters">
        {#each characters as character}
          <span>{character}</span>
        {/each}
      </div>
    {/if}
  </div>
</header>

<section aria-labelledby="movies-heading">
  <div class="section-heading">
    <h2 id="movies-heading">Movies</h2>
  </div>
  {#if data.movies.length}
    <div class="grid">
      {#each data.movies as movie}
        <div class="credit-item">
          <MovieCard {movie} />
          {#if movie.character}
            <span>{movie.character}</span>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="muted">No movies found for this cast member.</p>
  {/if}
</section>

<section aria-labelledby="shows-heading">
  <div class="section-heading">
    <h2 id="shows-heading">TV shows</h2>
  </div>
  {#if data.shows.length}
    <div class="grid">
      {#each data.shows as show}
        <div class="credit-item">
          <ShowCard {show} />
          {#if show.character}
            <span>{show.character}</span>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="muted">No shows found for this cast member.</p>
  {/if}
</section>

<style>
  .person-hero {
    position: relative;
    display: grid;
    grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
    gap: clamp(1rem, 3vw, 1.8rem);
    align-items: center;
    margin: -0.4rem 0 1.7rem;
    max-width: 66rem;
  }

  .profile {
    display: grid;
    place-items: center;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 8px;
    background: var(--color-surface-muted);
    color: var(--color-muted);
    box-shadow: 0 1.2rem 3rem rgba(0, 0, 0, 0.28);
  }

  .profile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .copy {
    display: grid;
    gap: 0.55rem;
    min-width: 0;
  }

  .person-name,
  .original-name,
  .section-heading h2 {
    margin: 0;
  }

  .person-name {
    font-size: clamp(2.2rem, 5vw, 4.3rem);
    line-height: 1;
  }

  .eyebrow,
  .facts,
  .characters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .eyebrow,
  .facts span,
  .characters span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.7rem;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 750;
  }

  .eyebrow {
    width: fit-content;
    color: var(--color-warning);
  }

  .facts span {
    border: 1px solid var(--color-border-strong);
    background: var(--color-surface-muted);
    color: var(--color-text-soft);
    padding: 0.16rem 0.58rem;
  }

  .characters span {
    border: 1px solid var(--color-warning-border);
    color: var(--color-warning);
    padding: 0.14rem 0.55rem;
  }

  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin: 1.7rem 0 0.85rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 1.1rem;
  }

  .credit-item {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .credit-item > span {
    color: var(--color-muted);
    font-size: 0.86rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .person-hero {
      grid-template-columns: minmax(5.5rem, 7rem) minmax(0, 1fr);
      align-items: start;
    }

    .person-name {
      font-size: clamp(1.8rem, 12vw, 3rem);
    }
  }
</style>
