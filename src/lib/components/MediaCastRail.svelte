<script lang="ts">
  import { tmdbImageUrl } from "$lib/media/images";
  import { Users } from "@lucide/svelte";

  type CastPerson = {
    provider: string;
    providerId: string;
    profilePath: string | null;
    name: string;
    character: string | null;
  };

  let { cast }: { cast: CastPerson[] } = $props();
</script>

{#if cast.length}
  <section class="cast-section" aria-labelledby="cast-heading">
    <div class="section-heading">
      <h2 id="cast-heading">Cast</h2>
      <p class="muted">Top billed people from TMDb.</p>
    </div>
    <div class="cast-rail">
      {#each cast as person}
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

<style>
  .cast-section {
    min-width: 0;
  }

  .section-heading {
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
    grid-template-columns: 1fr;
    align-content: start;
    gap: 0.35rem;
    padding: 0;
    border: 0;
    background: transparent;
    min-width: 0;
  }

  .profile {
    display: grid;
    place-items: center;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: 8px;
    background: var(--color-surface-muted);
    color: var(--color-muted);
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
    color: var(--color-muted);
    font-size: 0.84rem;
  }
</style>
